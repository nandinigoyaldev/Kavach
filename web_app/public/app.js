import { HandLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const video = document.getElementById("webcam");
const canvasElement = document.getElementById("output_canvas");
const canvasCtx = canvasElement.getContext("2d");
const enableWebcamButton = document.getElementById("enableWebcamButton");
const apiStatus = document.getElementById("api-status");
const camStatus = document.getElementById("camera-status");

const gestureOutput = document.getElementById("gesture-output");
const trackingStatus = document.getElementById("tracking-status");
const handednessOut = document.getElementById("handedness-out");
const notificationsBox = document.getElementById("notifications-box");

let handLandmarker = undefined;
let runningMode = "VIDEO";
let webcamRunning = false;
let lastVideoTime = -1;
let lastSignSentTime = 0;
let lastCaptureTime = 0;

// API connection check
async function checkBackendAPI() {
    try {
        const response = await fetch('/api/health');
        if (response.ok) {
            apiStatus.textContent = "SYS: ONLINE";
            apiStatus.className = "badge active";
        } else {
            throw new Error("API not ok");
        }
    } catch (error) {
        apiStatus.textContent = "SYS: OFFLINE";
        apiStatus.className = "badge error";
    }
}

checkBackendAPI();
setInterval(checkBackendAPI, 10000);

function addNotification(text) {
    const p = document.createElement("p");
    p.className = "sys-msg";
    p.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    notificationsBox.prepend(p);
}

// Initialize MediaPipe
async function createHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
    );
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
        },
        runningMode: runningMode,
        numHands: 1,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    enableWebcamButton.classList.remove("disabled");
    addNotification("Vision System Initialized.");
}

createHandLandmarker();

if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    enableWebcamButton.addEventListener("click", enableCam);
}

function enableCam(event) {
    if (!handLandmarker) return;

    if (webcamRunning === true) {
        webcamRunning = false;
        enableWebcamButton.innerHTML = "Enable Camera";
        camStatus.textContent = "CAM: OFFLINE";
        camStatus.className = "badge";
        video.srcObject.getTracks().forEach(track => track.stop());
    } else {
        webcamRunning = true;
        enableWebcamButton.innerHTML = "Disable Camera";
        camStatus.textContent = "CAM: ONLINE";
        camStatus.className = "badge active";

        const constraints = { video: { facingMode: "user" } };
        navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        });
    }
}

async function predictWebcam() {
    canvasElement.style.width = video.videoWidth;
    canvasElement.style.height = video.videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;
    
    if (runningMode === "IMAGE") {
        runningMode = "VIDEO";
        await handLandmarker.setOptions({ runningMode: "VIDEO" });
    }

    let startTimeMs = performance.now();
    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarker.detectForVideo(video, startTimeMs);
        
        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        
        if (results.landmarks && results.landmarks.length > 0) {
            trackingStatus.textContent = "ACTIVE";
            trackingStatus.style.color = "var(--success)";
            handednessOut.textContent = results.handednesses[0][0].displayName;

            for (const landmarks of results.landmarks) {
                drawConnectors(canvasCtx, landmarks, { color: "rgba(59, 130, 246, 0.4)", lineWidth: 2 });
                drawLandmarks(canvasCtx, landmarks, { color: "#3b82f6", lineWidth: 1, radius: 2 });
            }
            
            // Finger counting heuristics
            const fingerCount = detectFingerCount(results.landmarks[0]);
            let gestureLabel = "";
            
            switch(fingerCount) {
                case 1: gestureLabel = "1 Finger (Next)"; break;
                case 2: gestureLabel = "2 Fingers (Back)"; break;
                case 3: gestureLabel = "3 Fingers (Scroll)"; break;
                case 4: gestureLabel = "4 Fingers (Help)"; break;
                case 5: gestureLabel = "5 Fingers (Capture Profile)"; break;
                default: gestureLabel = "Resting"; break;
            }

            if (gestureOutput.innerHTML !== gestureLabel) {
                gestureOutput.innerHTML = gestureLabel;
                
                // Throttle API requests
                if (Date.now() - lastSignSentTime > 1500) {
                    lastSignSentTime = Date.now();
                    sendSignToAPI(gestureLabel);
                    
                    if (fingerCount === 5 && (Date.now() - lastCaptureTime > 5000)) {
                        lastCaptureTime = Date.now();
                        captureAndRegisterUser();
                    }
                }
            }
            
        } else {
            trackingStatus.textContent = "INACTIVE";
            trackingStatus.style.color = "var(--text-secondary)";
            handednessOut.textContent = "-";
            gestureOutput.innerHTML = `<span class="placeholder">Waiting for hand...</span>`;
        }
        canvasCtx.restore();
    }

    if (webcamRunning === true) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// Very basic finger counting heuristic
function detectFingerCount(landmarks) {
    const isFingerUp = (tip, mcp) => landmarks[tip].y < landmarks[mcp].y;
    
    // Note: Thumb heuristic is simplified for a front-facing palm
    const thumbUp = landmarks[4].x < landmarks[3].x; // This depends on handedness, simplified here.
    const indexUp = isFingerUp(8, 5);
    const middleUp = isFingerUp(12, 9);
    const ringUp = isFingerUp(16, 13);
    const pinkyUp = isFingerUp(20, 17);
    
    let count = 0;
    if (indexUp) count++;
    if (middleUp) count++;
    if (ringUp) count++;
    if (pinkyUp) count++;
    
    // Crude thumb check
    if (Math.abs(landmarks[4].x - landmarks[5].x) > 0.05) {
        count++;
    }

    // Clamp count
    return Math.min(5, Math.max(0, count));
}

async function sendSignToAPI(sign) {
    try {
        const response = await fetch('/api/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sign: sign })
        });
        const data = await response.json();
        console.log("Telemetry:", data.message);
    } catch (err) {
        console.error(err);
    }
}

async function captureAndRegisterUser() {
    addNotification("Capturing Photo...");
    
    // Flash effect
    document.body.classList.add("flash-effect");
    setTimeout(() => document.body.classList.remove("flash-effect"), 200);

    // Create temporary canvas to grab the frame
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    tempCanvas.getContext("2d").drawImage(video, 0, 0);
    const base64Image = tempCanvas.toDataURL("image/jpeg", 0.8);

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image_base64: base64Image })
        });
        const data = await response.json();
        
        if (data.status === "success") {
            addNotification("Success: Profile Registered!");
            showProfilePopup(base64Image);
        }
    } catch (err) {
        addNotification("Error: Failed to register profile.");
        console.error(err);
    }
}

function showProfilePopup(imgSrc) {
    const existing = document.getElementById("profile-popup");
    if(existing) existing.remove();

    const popup = document.createElement("div");
    popup.id = "profile-popup";
    popup.className = "profile-popup";
    popup.innerHTML = `
        <div class="popup-content">
            <h3>Registration Complete</h3>
            <img src="${imgSrc}" alt="User Profile" />
            <p>Welcome to the Touchless Kiosk!</p>
            <button onclick="document.getElementById('profile-popup').remove()">Close</button>
        </div>
    `;
    document.body.appendChild(popup);
}

function drawConnectors(ctx, landmarks, options) {
    ctx.strokeStyle = options.color;
    ctx.lineWidth = options.lineWidth;
}

function drawLandmarks(ctx, landmarks, options) {
    ctx.fillStyle = options.color;
    for(const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * canvasElement.width, lm.y * canvasElement.height, options.radius, 0, 2 * Math.PI);
        ctx.fill();
    }
}
