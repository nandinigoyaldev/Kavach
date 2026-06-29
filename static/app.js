// app.js
// Frontend logic for RakshAI – vanilla JS
// Handles camera, MediaPipe Hands, voice, UI updates, SOS flow, contacts, etc.

// ------------ Configuration ------------
const API_BASE = ""; // same origin
const ANALYZE_INTERVAL_MS = 5000; // 5 seconds regular scan
const GESTURE_CHECK_INTERVAL_MS = 500; // send frame for gesture detection
const FRAME_CAPTURE_QUALITY = 0.6; // JPEG quality
const SOS_COUNTDOWN = 5; // seconds

// ------------ State ------------
let videoEl = document.getElementById("video");
let canvasEl = document.getElementById("captureCanvas");
let threatCircle = document.getElementById("threatCircle");
let threatBadge = document.getElementById("threatBadge");
let observationsList = document.getElementById("observationsList");
let recommendationText = document.getElementById("recommendationText");
let lastScanEl = document.getElementById("lastScan");
let voiceTranscriptEl = document.getElementById("voiceTranscript");
let sosBtn = document.getElementById("sosBtn");
let fakeCallBtn = document.getElementById("fakeCallBtn");
let scanNowBtn = document.getElementById("scanNowBtn");
let sosModal = document.getElementById("sosModal");
let countdownSpan = document.getElementById("countdown");
let cancelSosBtn = document.getElementById("cancelSosBtn");
let fakeCallOverlay = document.getElementById("fakeCallOverlay");
let acceptCallBtn = document.getElementById("acceptCallBtn");
let declineCallBtn = document.getElementById("declineCallBtn");
let contactListEl = document.getElementById("contactList");
let addContactForm = document.getElementById("addContactForm");
let contactNameInput = document.getElementById("contactName");
let contactPhoneInput = document.getElementById("contactPhone");

let latestLocation = null; // {lat, lng}
let lastThreatTimestamp = null;
let gestureTimer = null; // counts consecutive frames with 5 fingers
let sosCountdownId = null;

// ------------ Helper UI Functions ------------
function showToast(message, duration = 3000) {
  const toast = document.createElement("div");
  toast.className = "toast show";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function flashScreen() {
  const flash = document.createElement("div");
  flash.style.position = "fixed";
  flash.style.top = 0;
  flash.style.left = 0;
  flash.style.width = "100%";
  flash.style.height = "100%";
  flash.style.background = "rgba(255,45,85,0.4)";
  flash.style.zIndex = 2000;
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 150);
}

function vibratePattern() {
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
}

function updateThreatUI(data) {
  // data: {threat_level, score, observations, recommendation, detected_objects}
  const level = data.threat_level || "LOW";
  const score = data.score || 0;
  threatCircle.textContent = score;
  // color based on score (1-10) – simple gradient from green to red
  const green = Math.max(0, 255 - score * 25);
  const red = Math.min(255, score * 25);
  threatCircle.style.background = `rgb(${red},${green},0)`;
  // badge and glow
  threatBadge.querySelector('.level-text').textContent = level;
  threatBadge.classList.remove('low-glow','medium-glow','high-glow');
  if (level === "LOW") {
    threatBadge.classList.add('low-glow');
  } else if (level === "MEDIUM") {
    threatBadge.classList.add('medium-glow');
  } else if (level === "HIGH") {
    threatBadge.classList.add('high-glow');
  }
  // observations list
  observationsList.innerHTML = "";
  (data.observations || []).forEach(obs => {
    const li = document.createElement("li");
    li.textContent = obs;
    observationsList.appendChild(li);
  });
  recommendationText.textContent = data.recommendation || "";
  lastThreatTimestamp = Date.now();
  updateLastScanTimer();
}

function updateLastScanTimer() {
  if (!lastThreatTimestamp) return;
  const seconds = Math.floor((Date.now() - lastThreatTimestamp) / 1000);
  lastScanEl.textContent = `Last scanned: ${seconds} seconds ago`;
}

setInterval(updateLastScanTimer, 1000);

// ------------ Camera Handling ------------
async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    videoEl.srcObject = stream;
    videoEl.play();
  } catch (err) {
    console.error("Camera error:", err);
    showToast("Camera access denied or unavailable.");
  }
}

function captureFrame() {
  const ctx = canvasEl.getContext("2d");
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  return canvasEl.toDataURL("image/jpeg", FRAME_CAPTURE_QUALITY).split(",")[1]; // base64 string
}

// ------------ Location ------------
function startLocationWatch() {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported.");
    return;
  }
  navigator.geolocation.watchPosition(
    pos => {
      latestLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      // update UI indicator if needed (not implemented in HTML now)
    },
    err => {
      console.warn("Geolocation error:", err.message);
      // could set a red indicator later
    },
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }
  );
}

// ------------ API Calls ------------
async function postJSON(url, payload) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${err}`);
  }
  return await resp.json();
}

async function analyzeCurrentFrame() {
  if (!latestLocation) {
    console.warn("Location not ready – skipping analyze.");
    return;
  }
  const imageB64 = captureFrame();
  const payload = { image: imageB64, location: latestLocation };
  try {
    const result = await postJSON(`${API_BASE}/api/analyze`, payload);
    if (result.error) {
      console.error("Analyze error:", result.error);
    } else {
      updateThreatUI(result);
    }
  } catch (e) {
    console.error("Analyze request failed:", e);
  }
}

async function sendSOS(assessment) {
  const timestamp = new Date().toISOString();
  const payload = {
    location: latestLocation,
    ai_assessment: assessment,
    timestamp,
  };
  try {
    const resp = await postJSON(`${API_BASE}/api/sos`, payload);
    if (resp.success) {
      showToast(`${resp.contacts_alerted} contacts alerted with your location`);
    } else {
      showToast("SOS failed to send alerts.");
    }
  } catch (e) {
    console.error("SOS error:", e);
    showToast("SOS request failed.");
  }
}

async function loadContacts() {
  try {
    const resp = await fetch(`${API_BASE}/api/contacts`);
    const contacts = await resp.json();
    renderContactList(contacts);
  } catch (e) {
    console.error("Failed to load contacts", e);
  }
}

async function addContact(name, phone) {
  try {
    const resp = await postJSON(`${API_BASE}/api/contacts`, { name, phone });
    renderContactList(resp);
  } catch (e) {
    console.error("Add contact error", e);
    showToast(e.message);
  }
}

async function deleteContact(phone) {
  try {
    await fetch(`${API_BASE}/api/contacts/${encodeURIComponent(phone)}`, { method: "DELETE" });
    loadContacts();
  } catch (e) {
    console.error("Delete contact error", e);
  }
}

function renderContactList(contacts) {
  contactListEl.innerHTML = "";
  contacts.forEach(c => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = `${c.name} (${c.phone})`;
    const delBtn = document.createElement("button");
    delBtn.textContent = "Delete";
    delBtn.className = "btn btn-decline";
    delBtn.onclick = () => deleteContact(c.phone);
    li.appendChild(span);
    li.appendChild(delBtn);
    contactListEl.appendChild(li);
  });
}

// ------------ Voice Recognition ------------
let recognition = null;
function startVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Web Speech API not supported.");
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = "en-US";
  recognition.onresult = async e => {
    const transcript = e.results[e.results.length - 1][0].transcript.trim();
    voiceTranscriptEl.textContent = transcript;
    try {
      const resp = await postJSON(`${API_BASE}/api/voice`, { transcript });
      handleVoiceAction(resp);
    } catch (err) {
      console.error("Voice API error", err);
    }
  };
  recognition.onerror = e => console.warn("Voice error", e);
  recognition.start();
}

function handleVoiceAction(resp) {
  const action = resp.action;
  if (action === "SOS") triggerSOSFlow();
  else if (action === "FAKE_CALL") showFakeCall();
  else if (action === "CANCEL") {
    if (sosModal.classList.contains("hidden")) return;
    cancelSos();
  } else if (action === "SCAN") {
    analyzeCurrentFrame();
  } else if (action === "RESPOND") {
    showToast(resp.message);
  }
}

// ------------ SOS Flow ------------
function triggerSOSFlow() {
  vibratePattern();
  flashScreen();
  sosModal.classList.remove("hidden");
  let counter = SOS_COUNTDOWN;
  countdownSpan.textContent = counter;
  sosCountdownId = setInterval(() => {
    counter -= 1;
    if (counter <= 0) {
      clearInterval(sosCountdownId);
      sosModal.classList.add("hidden");
      // Use latest threat assessment if available, else generic
      const assessment = threatBadge.querySelector('.level-text').textContent || "UNKNOWN";
      sendSOS(assessment);
    } else {
      countdownSpan.textContent = counter;
    }
  }, 1000);
}

function cancelSos() {
  clearInterval(sosCountdownId);
  sosModal.classList.add("hidden");
  showToast("SOS cancelled");
}

cancelSosBtn.addEventListener("click", cancelSos);

// ------------ Fake Call ------------
function showFakeCall() {
  fakeCallOverlay.classList.remove("hidden");
}
function hideFakeCall() {
  fakeCallOverlay.classList.add("hidden");
}
acceptCallBtn.addEventListener("click", hideFakeCall);
declineCallBtn.addEventListener("click", hideFakeCall);

// ------------ Gesture Detection (MediaPipe Hands) ------------
let hands = null;
let lastFiveFingersTime = null;
async function loadMediaPipe() {
  const mp = await import("https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/hands.js");
  const drawingUtils = await import("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.4/drawing_utils.js");
  hands = new mp.Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
  hands.onResults(onResults);
}

function onResults(results) {
  // Detect 5 fingers open using landmarks
  if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) return;
  const landmarks = results.multiHandLandmarks[0];
  const fingerTips = [4, 8, 12, 16, 20];
  const fingerMCPs = [2, 5, 9, 13, 17];
  const allOpen = fingerTips.every((tipIdx, i) => {
    const mcpIdx = fingerMCPs[i];
    // In image coordinates, y increases downwards; open finger tip y < mcp y
    return landmarks[tipIdx].y < landmarks[mcpIdx].y;
  });
  if (allOpen) {
    const now = Date.now();
    if (!lastFiveFingersTime) {
      lastFiveFingersTime = now;
    } else if (now - lastFiveFingersTime >= 2000) {
      // 2 seconds of open hand
      triggerSOSFlow();
      lastFiveFingersTime = null; // reset
    }
  } else {
    lastFiveFingersTime = null;
  }
}

function processGestureFrame() {
  if (!hands) return;
  const ctx = canvasEl.getContext("2d");
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
  const image = new ImageData(new Uint8ClampedArray(ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data), canvasEl.width, canvasEl.height);
  hands.send({ image });
}

// ------------ Main Execution ------------
window.addEventListener("load", async () => {
  await startCamera();
  startLocationWatch();
  loadContacts();
  startVoiceRecognition();
  await loadMediaPipe();

  // Regular scanning every 5 seconds
  setInterval(analyzeCurrentFrame, ANALYZE_INTERVAL_MS);

  // Gesture scanning every 500ms
  setInterval(processGestureFrame, GESTURE_CHECK_INTERVAL_MS);
});

// Button handlers
sosBtn.addEventListener("click", triggerSOSFlow);
fakeCallBtn.addEventListener("click", showFakeCall);
scanNowBtn.addEventListener("click", analyzeCurrentFrame);

addContactForm.addEventListener("submit", e => {
  e.preventDefault();
  const name = contactNameInput.value.trim();
  const phone = contactPhoneInput.value.trim();
  if (name && phone) {
    addContact(name, phone);
    contactNameInput.value = "";
    contactPhoneInput.value = "";
  }
});
