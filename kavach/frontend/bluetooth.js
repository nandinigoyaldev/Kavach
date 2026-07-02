// bluetooth.js – Handles Web Bluetooth communication with the Arduino wristband
// If Web Bluetooth is unavailable or the device cannot be found, the code falls back to a demo mode
// that simulates realistic sensor readings so the UI remains functional.

class KavachBluetooth {
  constructor() {
    this.device = null;
    this.server = null;
    this.characteristic = null;
    this.isConnected = false;
    this.onData = null; // (dataObj) => {}
    this.onConnect = null; // () => {}
    this.onDisconnect = null; // () => {}
    this.demoMode = false;
    this.demoInterval = null;
  }

  async connect() {
    if (!navigator.bluetooth) {
      console.warn('Web Bluetooth API not supported – entering demo mode');
      this._enterDemoMode();
      return;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'HC-05' }, { namePrefix: 'KAVACH' }],
        optionalServices: ['generic_access']
      });
      this.device = device;
      this.device.addEventListener('gattserverdisconnected', this._handleDisconnect.bind(this));
      const server = await device.gatt.connect();
      this.server = server;
      const service = await server.getPrimaryService('generic_access');
      // Many Arduino Bluetooth modules expose a custom service; we fallback to the first characteristic
      const chars = await service.getCharacteristics();
      this.characteristic = chars[0];
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', this._handleNotification.bind(this));
      this.isConnected = true;
      if (this.onConnect) this.onConnect();
    } catch (err) {
      console.error('Bluetooth connection failed:', err);
      this._enterDemoMode();
    }
  }

  disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this._cleanup();
    if (this.onDisconnect) this.onDisconnect();
  }

  _handleDisconnect() {
    console.warn('Bluetooth device disconnected');
    this.isConnected = false;
    if (this.onDisconnect) this.onDisconnect();
    // attempt reconnection after a short delay
    setTimeout(() => this.connect(), 3000);
  }

  _handleNotification(event) {
    const value = event.target.value;
    // Convert DataView to string (Arduino sends ASCII)
    const decoder = new TextDecoder('utf-8');
    const raw = decoder.decode(value);
    const data = this._parseData(raw.trim());
    if (data && this.onData) this.onData(data);
  }

  _parseData(raw) {
    // Expected format:
    // GSR:123,GSR_BASE:100,GSR_LEVEL:1,MOTION:0.98,GAIT_VAR:0.02,MOT_LEVEL:0,DISTRESS:0,CALIBRATED:1
    const parts = raw.split(',');
    const obj = {};
    for (const part of parts) {
      const [key, val] = part.split(':');
      if (key && val !== undefined) {
        // Convert numeric values where appropriate
        if (['GSR', 'GSR_BASE', 'GSR_LEVEL', 'MOTION', 'GAIT_VAR', 'MOT_LEVEL', 'DISTRESS', 'CALIBRATED'].includes(key)) {
          obj[key] = parseFloat(val);
        } else {
          obj[key] = val;
        }
      }
    }
    return obj;
  }

  _enterDemoMode() {
    this.demoMode = true;
    console.info('Entering Bluetooth demo mode – simulating sensor data');
    let gsr = 0, motion = 0, distress = 0;
    this.demoInterval = setInterval(() => {
      // simple random walk around normal values
      gsr = Math.max(0, gsr + (Math.random() - 0.5) * 5);
      motion = Math.max(0, motion + (Math.random() - 0.5) * 0.1);
      const gsrLevel = gsr > 120 ? 2 : gsr > 110 ? 1 : 0;
      const motionLevel = motion > 1.2 ? 2 : motion > 0.9 ? 1 : 0;
      const data = {
        GSR: gsr,
        GSR_BASE: 100,
        GSR_LEVEL: gsrLevel,
        MOTION: motion,
        GAIT_VAR: Math.random() * 0.03,
        MOT_LEVEL: motionLevel,
        DISTRESS: gsrLevel + motionLevel >= 2 ? 2 : gsrLevel + motionLevel,
        CALIBRATED: 1
      };
      if (this.onData) this.onData(data);
    }, 500);
    if (this.onConnect) this.onConnect();
  }

  _cleanup() {
    if (this.demoInterval) clearInterval(this.demoInterval);
    this.demoMode = false;
    this.isConnected = false;
    this.device = null;
    this.server = null;
    this.characteristic = null;
  }
}

// Export for use in app.js
export default KavachBluetooth;
