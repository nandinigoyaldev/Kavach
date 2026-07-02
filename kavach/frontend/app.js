// app.js – Main application orchestrator for KAVACH PWA
import KavachBluetooth from './bluetooth.js';
import VoiceStressDetector from './voice.js';

// Global state object
const state = {
  gsr_level: 0,
  mot_level: 0,
  voice_level: 0,
  posture_level: 0,
  layers_active: 0,
  auto_trigger: false,
  immediate_trigger: false,
  sos_active: false,
  countdown: 10,
  countdown_interval: null,
  location: { lat: 0.0, lng: 0.0 },
  arduino_connected: false,
  camera_active: false,
  last_ai_description: "Camera inactive",
  last_scan_time: null,
  sensors: {
    gsr: 0,
    gsr_base: 100,
    gait_var: 0.0,
    voice_pitch: 0
  }
};

// Initialise Subsystems
const bluetooth = new KavachBluetooth();
const voice = new VoiceStressDetector();

// DOM elements
const elStatusBadge = document.getElementById('status-badge');
const elBtStatus = document.getElementById('bt-status');
const elMicStatus = document.getElementById('mic-status');
const elGpsStatus = document.getElementById('gps-status');
const elClock = document.getElementById('clock');
const elCameraCanvas = document.getElementById('camera-canvas');
const elAiDescription = document.getElementById('ai-description');
const elPostureLevel = document.getElementById('posture-level');
const elShieldToggle = document.getElementById('shield-toggle');
const elLayerCounter = document.getElementById('layer-counter');
const elLiveData = document.getElementById('live-data');
const elStatusBox = document.getElementById('status-box');
const elStatusTitle = document.getElementById('status-title');
const elStatusMessage = document.getElementById('status-message');
const elManualSos = document.getElementById('manual-sos');
const elFakeCall = document.getElementById('fake-call');
const elReset = document.getElementById('reset');
const elContactList = document.getElementById('contact-list');
const elAddContactForm = document.getElementById('add-contact-form');
const elContactName = document.getElementById('contact-name');
const elContactPhone = document.getElementById('contact-phone');

// Overlays
const elSosCountdown = document.getElementById('sos-countdown');
const elCountdownNumber = document.getElementById('countdown-number');
const elCountdownReason = document.getElementById('countdown-reason');
const elCancelCountdown = document.getElementById('cancel-countdown');
const elSosSuccess = document.getElementById('sos-success');
const elSuccessMsg = document.getElementById('success-msg');
const elFakeCallOverlay = document.getElementById('fake-call-overlay');
const elAcceptCall = document.getElementById('accept-call');
const elDeclineCall = document.getElementById('decline-call');

// SVG circles for progress rings
const circles = {
  gsr: document.querySelector('#gsr-meter .progress'),
  motion: document.querySelector('#motion-meter .progress'),
  voice: document.querySelector('#voice-meter .progress')
};

// SVG stroke‑dasharray of circles is 251.2 (2 * PI * 40)
const maxDashOffset = 251.2;

// Page initialization
window.addEventListener('DOMContentLoaded', async () => {
  // 1. Clock updates
  setInterval(() => {
    const now = new Date();
    elClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, 1000);

  // 2. Bluetooth setup
  bluetooth.onConnect = () => {
    state.arduino_connected = true;
    elBtStatus.className = 'dot green';
    elBtStatus.title = 'Wristband Connected';
    // Add Connect button status update
    const btnConnect = document.getElementById('btn-connect-wristband');
    if (btnConnect) {
      btnConnect.textContent = 'Wristband Connected ✓';
      btnConnect.classList.remove('primary');
      btnConnect.classList.add('dark');
    }
  };

  bluetooth.onDisconnect = () => {
    state.arduino_connected = false;
    elBtStatus.className = 'dot red';
    elBtStatus.title = 'Wristband Offline';
    const btnConnect = document.getElementById('btn-connect-wristband');
    if (btnConnect) {
      btnConnect.textContent = 'Connect Wristband';
      btnConnect.classList.add('primary');
      btnConnect.classList.remove('dark');
    }
  };

  bluetooth.onData = (data) => {
    state.gsr_level = data.GSR_LEVEL || 0;
    state.mot_level = data.MOT_LEVEL || 0;
    state.sensors.gsr = data.GSR || 0;
    state.sensors.gsr_base = data.GSR_BASE || 100;
    state.sensors.gait_var = data.GAIT_VAR || 0;
  };

  // Connect wristband button listener (we will add this button in index.html top bar or panel)
  const btnConnect = document.getElementById('btn-connect-wristband');
  if (btnConnect) {
    btnConnect.addEventListener('click', () => bluetooth.connect());
  }

  // 3. Voice stress detection setup
  voice.onStressLevel = (level, details) => {
    state.voice_level = level;
    state.sensors.voice_pitch = details.pitch ? Math.round(details.pitch) : 0;
    elMicStatus.className = 'dot green';
    elMicStatus.title = 'Voice Monitor Active';
  };
  // Start Voice Stress Detector immediately
  voice.start().catch(err => {
    console.warn("Failed to auto-start voice stress detector:", err);
    elMicStatus.className = 'dot red';
  });

  // 4. Request GPS location
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (pos) => {
        state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        elGpsStatus.className = 'dot green';
        elGpsStatus.title = `Location: ${state.location.lat.toFixed(4)}, ${state.location.lng.toFixed(4)}`;
      },
      (err) => {
        console.warn("GPS tracking error:", err);
        elGpsStatus.className = 'dot red';
      },
      { enableHighAccuracy: true }
    );
  } else {
    elGpsStatus.className = 'dot red';
  }

  // 5. Camera Setup & Drawing Loop
  let videoElement = null;
  elShieldToggle.addEventListener('click', async () => {
    if (state.camera_active) {
      // Disable Shield Mode
      state.camera_active = false;
      state.posture_level = 0;
      elShieldToggle.textContent = 'Enable Shield Mode';
      elShieldToggle.className = 'btn primary';
      elAiDescription.textContent = 'Camera scanning disabled';
      elPostureLevel.textContent = 'Posture: —';
      if (videoElement && videoElement.srcObject) {
        videoElement.srcObject.getTracks().forEach(track => track.stop());
      }
    } else {
      // Enable Shield Mode
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 }, audio: false });
        videoElement = document.createElement('video');
        videoElement.srcObject = stream;
        videoElement.play();
        state.camera_active = true;
        elShieldToggle.textContent = 'Disable Shield Mode';
        elShieldToggle.className = 'btn dark';
        elAiDescription.textContent = 'Shield active – Scanning body language...';
      } catch (err) {
        console.error("Camera access failed:", err);
        elAiDescription.textContent = 'Camera access denied';
      }
    }
  });

  // Draw camera frame to Canvas every 100ms
  const ctx = elCameraCanvas.getContext('2d');
  setInterval(() => {
    if (state.camera_active && videoElement && videoElement.readyState === videoElement.HAVE_CURRENT_DATA) {
      ctx.drawImage(videoElement, 0, 0, elCameraCanvas.width, elCameraCanvas.height);
    } else {
      // Draw background graphic or dark screen when offline
      ctx.fillStyle = '#0a0a14';
      ctx.fillRect(0, 0, elCameraCanvas.width, elCameraCanvas.height);
      ctx.fillStyle = '#ff004c';
      ctx.font = '12px Space Grotesk';
      ctx.fillText("SHIELD CAM OFFLINE", 20, 30);
    }
  }, 100);

  // 6. Trusted Contacts logic
  fetchContacts();
  elAddContactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = elContactName.value.trim();
    const phone = elContactPhone.value.trim();
    if (!phone.startsWith('+')) {
      alert("Phone number must start with '+' and country code (e.g. +91...)");
      return;
    }
    try {
      const resp = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone })
      });
      if (resp.ok) {
        elContactName.value = '';
        elContactPhone.value = '';
        fetchContacts();
      } else {
        const err = await resp.json();
        alert(err.detail || "Failed to add contact");
      }
    } catch (err) {
      console.error(err);
    }
  });

  // 7. Manual Action Handlers
  elManualSos.addEventListener('click', () => triggerSOS("MANUAL"));
  elReset.addEventListener('click', resetSystem);

  // 8. Fake Call Overlay Handlers
  let fakeCallTimeout = null;
  elFakeCall.addEventListener('click', () => {
    elFakeCallOverlay.classList.remove('hidden');
    // auto dismiss after 30 seconds
    fakeCallTimeout = setTimeout(() => {
      elFakeCallOverlay.classList.add('hidden');
    }, 30000);
  });
  elAcceptCall.addEventListener('click', () => {
    clearTimeout(fakeCallTimeout);
    elFakeCallOverlay.classList.add('hidden');
  });
  elDeclineCall.addEventListener('click', () => {
    clearTimeout(fakeCallTimeout);
    elFakeCallOverlay.classList.add('hidden');
  });

  // Cancel Countdown handler
  elCancelCountdown.addEventListener('click', () => {
    if (state.countdown_interval) {
      clearInterval(state.countdown_interval);
    }
    state.sos_active = false;
    elSosCountdown.classList.add('hidden');
    resetSystem();
  });

  // 9. Start loops
  setInterval(mainAnalysisLoop, 3000);
  setInterval(uiUpdateLoop, 200);
});

// Fetch contacts and render in list
async function fetchContacts() {
  try {
    const resp = await fetch('/api/contacts');
    const contacts = await resp.json();
    elContactList.innerHTML = '';
    contacts.forEach(c => {
      const li = document.createElement('li');
      li.className = 'contact-item';
      li.innerHTML = `
        <div class="contact-info">
          <div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div>
          <div class="contact-details">
            <span class="contact-name">${c.name}</span>
            <span class="contact-phone">${c.phone}</span>
          </div>
        </div>
        <button class="btn-delete" data-phone="${c.phone}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;
      // Delete event listener
      li.querySelector('.btn-delete').addEventListener('click', async () => {
        if (confirm(`Remove ${c.name} from emergency contacts?`)) {
          await fetch(`/api/contacts/${encodeURIComponent(c.phone)}`, { method: 'DELETE' });
          fetchContacts();
        }
      });
      elContactList.appendChild(li);
    });
  } catch (err) {
    console.error("Error loading contacts:", err);
  }
}

// Main Analysis Loop (Runs every 3 seconds)
async function mainAnalysisLoop() {
  if (state.sos_active) return;

  let base64Image = null;
  if (state.camera_active) {
    // Capture canvas frame as base64 JPEG
    try {
      base64Image = elCameraCanvas.toDataURL('image/jpeg', 0.5).split(',')[1];
    } catch (e) {
      console.warn("Failed to capture image for analysis:", e);
    }
  }

  const payload = {
    image: base64Image,
    location: state.location,
    gsr_level: state.gsr_level,
    mot_level: state.mot_level,
    voice_level: state.voice_level
  };

  try {
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) return;

    const result = await resp.json();
    
    // Update state based on API response
    if (result.posture_level !== null) {
      state.posture_level = result.posture_level;
    }
    if (result.description) {
      state.last_ai_description = result.description;
      elAiDescription.textContent = result.description;
    }
    state.layers_active = result.layers_active;
    state.auto_trigger = result.auto_trigger;
    state.immediate_trigger = result.immediate_trigger;

    // Handle SOS triggers
    if (state.immediate_trigger) {
      triggerSOS("IMMEDIATE");
    } else if (state.auto_trigger) {
      startSOSCountdown();
    }
  } catch (err) {
    console.error("Analysis loop error:", err);
  }
}

// SOS Countdown overlay handling
function startSOSCountdown() {
  state.sos_active = true;
  state.countdown = 10;
  elCountdownNumber.textContent = state.countdown;
  
  // Explain why it triggered
  const activeList = [];
  if (state.gsr_level >= 2) activeList.push("Skin Response (GSR)");
  if (state.mot_level >= 2) activeList.push("Gait anomaly (Struggle)");
  if (state.voice_level >= 2) activeList.push("Voice stress detected");
  if (state.posture_level >= 2) activeList.push("Distressed Body Posture");
  elCountdownReason.textContent = `Triggered by: ${activeList.join(' + ')}`;
  
  elSosCountdown.classList.remove('hidden');

  state.countdown_interval = setInterval(() => {
    state.countdown--;
    elCountdownNumber.textContent = state.countdown;
    if (state.countdown <= 0) {
      clearInterval(state.countdown_interval);
      elSosCountdown.classList.add('hidden');
      triggerSOS("AUTO");
    }
  }, 1000);
}

// Perform Twilio WhatsApp SOS trigger
async function triggerSOS(triggerType) {
  state.sos_active = true;
  if (state.countdown_interval) clearInterval(state.countdown_interval);

  // Vibrate mobile device if supported
  if (navigator.vibrate) {
    navigator.vibrate([500, 200, 500, 200, 500]);
  }

  const layers = [];
  if (state.gsr_level >= 2) layers.push("GSR");
  if (state.mot_level >= 2) layers.push("MOTION");
  if (state.voice_level >= 2) layers.push("VOICE");
  if (state.posture_level >= 2) layers.push("POSTURE");

  const payload = {
    location: state.location,
    layers_triggered: layers.length > 0 ? layers : ["MANUAL_BUTTON"],
    ai_description: state.last_ai_description || "Manual override activation",
    timestamp: new Date().toISOString(),
    trigger_type: triggerType
  };

  try {
    const resp = await fetch('/api/sos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await resp.json();
    if (resp.ok) {
      // Display success overlay
      elSuccessMsg.textContent = `${result.alerted} trusted contacts alerted via WhatsApp. Share link: maps.google.com/?q=${state.location.lat},${state.location.lng}`;
      elSosSuccess.classList.remove('hidden');
      setTimeout(() => {
        elSosSuccess.classList.add('hidden');
        resetSystem();
      }, 5000);
    } else {
      alert(result.detail || "Error triggering emergency alerts. Please add contacts.");
      resetSystem();
    }
  } catch (err) {
    console.error("SOS call error:", err);
    alert("Emergency alert failed. Check connection.");
    resetSystem();
  }
}

// Reset System state
function resetSystem() {
  state.sos_active = false;
  state.gsr_level = 0;
  state.mot_level = 0;
  state.voice_level = 0;
  state.posture_level = 0;
  state.layers_active = 0;
  state.auto_trigger = false;
  state.immediate_trigger = false;
  
  if (state.countdown_interval) clearInterval(state.countdown_interval);
}

// UI Update Loop (Runs every 200ms)
function uiUpdateLoop() {
  // Determine dominant threat state color
  let threatColor = 'green';
  let badgeText = 'KAVACH ACTIVE — All Clear';
  let statusBoxClass = 'status-box safe';
  let cardClass = 'card state-safe';
  let titleText = 'ALL CLEAR';
  let msgText = 'Monitoring active. Stay safe.';

  if (state.sos_active) {
    threatColor = 'red';
    badgeText = '🚨 SOS TRIGGERED';
    statusBoxClass = 'status-box immediate';
    cardClass = 'card state-distress';
    titleText = '⚠ IMMEDIATE SOS';
    msgText = 'Contacting emergency contacts NOW.';
  } else if (state.immediate_trigger) {
    threatColor = 'red';
    badgeText = '⚠ DISTRESS DETECTED';
    statusBoxClass = 'status-box immediate';
    cardClass = 'card state-distress';
    titleText = '⚠ SOS IMMINENT';
    msgText = '3 distress signatures triggered. Preparing emergency sequence.';
  } else if (state.auto_trigger) {
    threatColor = 'red';
    badgeText = '⚠ DISTRESS DETECTED';
    statusBoxClass = 'status-box auto';
    cardClass = 'card state-distress';
    titleText = 'AUTO-TRIGGER IMMINENT';
    msgText = '2 active distress layers detected. Triggering in 10s...';
  } else if (state.layers_active === 1 || state.gsr_level === 1 || state.mot_level === 1 || state.voice_level === 1) {
    threatColor = 'amber';
    badgeText = 'ELEVATED — Monitoring';
    statusBoxClass = 'status-box elevated';
    cardClass = 'card state-elevated';
    titleText = 'STAY ALERT';
    msgText = '1 distress signal detected. Keep monitoring.';
  }

  // Update top bar status badge
  elStatusBadge.innerHTML = `<span class="status-badge-dot ${threatColor}"></span>${badgeText}`;

  // Update card threat outline styles
  document.querySelectorAll('.grid-container .card').forEach(card => {
    card.className = cardClass;
  });

  // Update status box text
  elStatusBox.className = statusBoxClass;
  elStatusTitle.textContent = titleText;
  elStatusMessage.textContent = msgText;

  // Update Circular Progress Rings
  updateProgressCircle(circles.gsr, state.gsr_level);
  updateProgressCircle(circles.motion, state.mot_level);
  updateProgressCircle(circles.voice, state.voice_level);

  // Update text label values under progress rings
  document.getElementById('gsr-val-text').textContent = state.gsr_level;
  document.getElementById('motion-val-text').textContent = state.mot_level;
  document.getElementById('voice-val-text').textContent = state.voice_level;

  const levelStrings = ["NORMAL", "ELEVATED", "DISTRESS"];
  
  const elGsrText = document.getElementById('gsr-level-text');
  elGsrText.textContent = levelStrings[state.gsr_level];
  elGsrText.className = `level-text ${levelStrings[state.gsr_level].toLowerCase()}`;

  const elMotText = document.getElementById('motion-level-text');
  elMotText.textContent = levelStrings[state.mot_level];
  elMotText.className = `level-text ${levelStrings[state.mot_level].toLowerCase()}`;

  const elVoiceText = document.getElementById('voice-level-text');
  elVoiceText.textContent = levelStrings[state.voice_level];
  elVoiceText.className = `level-text ${levelStrings[state.voice_level].toLowerCase()}`;

  // Update Posture level display text
  const postureLabels = ["NORMAL", "ELEVATED", "DISTRESS"];
  elPostureLevel.innerHTML = `Posture Analysis: <strong>${postureLabels[state.posture_level]}</strong>`;

  // Update layer counter
  elLayerCounter.textContent = `${state.layers_active} / 3 LAYERS ACTIVE`;
  if (state.layers_active === 0) {
    elLayerCounter.className = 'layer-counter safe';
  } else if (state.layers_active === 1) {
    elLayerCounter.className = 'layer-counter elevated';
  } else {
    elLayerCounter.className = 'layer-counter distress';
  }

  // Live readout update
  elLiveData.innerHTML = `
    GSR: ${state.sensors.gsr.toFixed(1)} (base: ${state.sensors.gsr_base.toFixed(1)})<br>
    Gait variance: ${state.sensors.gait_var.toFixed(4)} | Voice: ${state.sensors.voice_pitch} Hz
  `;
}

// Animate progress circle stroke‑dashoffset based on levels (0, 1, 2)
function updateProgressCircle(circleElement, level) {
  if (!circleElement) return;
  let offset = maxDashOffset;
  let color = 'var(--green)';

  if (level === 0) {
    offset = maxDashOffset * 0.9; // 10% filled
    color = 'var(--green)';
  } else if (level === 1) {
    offset = maxDashOffset * 0.45; // 55% filled
    color = 'var(--amber)';
  } else if (level === 2) {
    offset = 0; // 100% filled
    color = 'var(--red)';
  }

  circleElement.style.strokeDashoffset = offset;
  circleElement.style.stroke = color;
}

// Service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}
