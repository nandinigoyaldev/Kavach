// voice.js – Handles voice stress detection via Web Audio API
// If microphone access is denied or unavailable, a demo mode produces
// low‑level stress values so the UI remains functional.

class VoiceStressDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.isActive = false;
    this.stressLevel = 0; // 0 = normal, 1 = elevated, 2 = distress
    this.pitchHistory = [];
    this.amplitudeHistory = [];
    this.baselinePitch = 0;
    this.baselineAmplitude = 0;
    this.calibrated = false;
    this.calibrationSamples = 30; // ~3 seconds at 100 ms interval
    this.onStressLevel = null; // (level, details) => {}
    this.demoInterval = null;
    this.demoMode = false;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('Web Audio API not supported – entering demo mode');
      this._enterDemoMode();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.microphone.connect(this.analyser);
      this.isActive = true;
      this._analysisLoop();
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      this._enterDemoMode();
    }
  }

  stop() {
    if (this.demoInterval) clearInterval(this.demoInterval);
    if (this.audioContext) this.audioContext.close();
    this.isActive = false;
    this.calibrated = false;
    this.demoMode = false;
  }

  _analysisLoop() {
    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    const timeData = new Uint8Array(this.analyser.frequencyBinCount);
    const step = () => {
      if (!this.isActive) return;
      this.analyser.getByteFrequencyData(freqData);
      this.analyser.getByteTimeDomainData(timeData);

      const pitch = this._analyzePitch(freqData);
      const amplitude = this._analyzeAmplitude(timeData);

      // Store histories (max 30 samples)
      this.pitchHistory.push(pitch);
      this.amplitudeHistory.push(amplitude);
      if (this.pitchHistory.length > 30) this.pitchHistory.shift();
      if (this.amplitudeHistory.length > 30) this.amplitudeHistory.shift();

      if (!this.calibrated) {
        if (this.pitchHistory.length >= this.calibrationSamples) {
          // compute baseline as average of collected samples
          this.baselinePitch = this.pitchHistory.reduce((a, b) => a + b, 0) / this.pitchHistory.length;
          this.baselineAmplitude = this.amplitudeHistory.reduce((a, b) => a + b, 0) / this.amplitudeHistory.length;
          this.calibrated = true;
          console.info('VoiceStressDetector calibrated');
        }
      } else {
        const pitchDeviation = Math.abs(pitch - this.baselinePitch);
        const amplitudeDeviation = Math.abs(amplitude - this.baselineAmplitude);
        let indicators = 0;
        // Pitch raised >20% above baseline
        if (pitch > this.baselinePitch * 1.2) indicators++;
        // Pitch variance high – we approximate with recent std dev
        const recentPitches = this.pitchHistory.slice(-10);
        const meanRecent = recentPitches.reduce((a, b) => a + b, 0) / recentPitches.length;
        const stdDev = Math.sqrt(recentPitches.reduce((s, v) => s + Math.pow(v - meanRecent, 2), 0) / recentPitches.length);
        if (stdDev > this.baselinePitch * 0.05) indicators++;
        // Amplitude spike >30% above baseline
        if (amplitude > this.baselineAmplitude * 1.3) indicators++;
        // Silence then sudden sound (amplitude low then high)
        if (this.amplitudeHistory.length >= 3) {
          const prev = this.amplitudeHistory[this.amplitudeHistory.length - 2];
          const prevPrev = this.amplitudeHistory[this.amplitudeHistory.length - 3];
          if (prevPrev < 0.02 && prev < 0.02 && amplitude > 0.1) indicators++;
        }
        let level = 0;
        if (indicators >= 3) level = 2;
        else if (indicators >= 1) level = 1;
        this.stressLevel = level;
        if (this.onStressLevel) this.onStressLevel(level, { pitch, amplitude, pitchDeviation, amplitudeDeviation, indicators });
      }
      setTimeout(step, 100);
    };
    step();
  }

  _analyzePitch(freqData) {
    // Find the bin with the highest magnitude
    let maxVal = -1;
    let maxIdx = -1;
    for (let i = 0; i < freqData.length; i++) {
      if (freqData[i] > maxVal) {
        maxVal = freqData[i];
        maxIdx = i;
      }
    }
    const nyquist = this.audioContext.sampleRate / 2;
    const frequency = (maxIdx * nyquist) / freqData.length;
    return frequency; // Hz
  }

  _analyzeAmplitude(timeData) {
    // RMS amplitude calculation
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const val = (timeData[i] - 128) / 128; // normalize to [-1,1]
      sum += val * val;
    }
    const rms = Math.sqrt(sum / timeData.length);
    return rms; // 0..1
  }

  _enterDemoMode() {
    this.demoMode = true;
    console.info('VoiceStressDetector demo mode – simulating low stress');
    let level = 0;
    this.demoInterval = setInterval(() => {
      // Random walk within 0‑2 range, favouring 0
      level = Math.max(0, Math.min(2, level + (Math.random() - 0.5)));
      this.stressLevel = Math.round(level);
      if (this.onStressLevel) this.onStressLevel(this.stressLevel, { demo: true });
    }, 500);
  }
}

export default VoiceStressDetector;
