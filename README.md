# RakshAI – Your Silent Guardian

## Overview
RakshAI is a **real‑time AI‑powered women’s safety companion** built with a lightweight Python FastAPI backend and a plain HTML/CSS/JS frontend (no React or heavy frameworks). The app continuously analyses camera frames, detects threatening situations, and can instantly alert trusted contacts via WhatsApp. It also supports voice commands, gesture‑based silent SOS, and a fake‑call distraction feature.

---

## Features
- **Live camera feed** with MediaPipe Hand‑gesture detection (5‑finger SOS).
- **AI threat analysis** using Google Gemini 2.5 Flash (vision model).
- **Voice command** handling via the Web Speech API (SOS, fake call, cancel, scan, chat).
- **Instant SOS alerts** sent through Twilio WhatsApp to a configurable contacts list.
- **Fake call overlay** to create a believable incoming call distraction.
- **Trusted contacts management** (add / delete) persisted in a local JSON file.
- **Responsive three‑column dashboard** with premium dark‑mode styling, glow effects, and smooth micro‑animations.
- **Graceful error handling** – UI remains responsive even if the backend is slow or unavailable.

---

## Tech Stack
| Layer | Technology |
|------|------------|
| **Backend** | Python 3.11, FastAPI, Uvicorn, `google‑generativeai`, Twilio, `python‑dotenv`, `Pillow` |
| **Frontend** | Vanilla HTML, CSS (custom design system), JavaScript (ES6) |
| **AI** | Google Gemini 2.5 Flash (vision) |
| **Gesture** | MediaPipe Hands (loaded from CDN) |
| **Voice** | Web Speech API (native) |
| **Messaging** | Twilio WhatsApp API |
| **Storage** | Local JSON files (`contacts.json`, `sos_log.json`) |

---

## Project Structure
```
raksh-ai/
├─ main.py                     # FastAPI server, API endpoints
├─ .env.example                # Example environment variables
├─ contacts.json               # Trusted contacts (auto‑created)
├─ sos_log.json                # Log of SOS events (auto‑created)
├─ requirements.txt            # Python dependencies
├─ static/                     # Frontend assets
│   ├─ index.html
│   ├─ style.css
│   └─ app.js
└─ README.md                   # **You are reading it!**
```
All static files are served at the root (`/`).

---

## Setup & Installation
1. **Clone the repository** (or copy the files into a directory).
2. **Create a virtual environment** (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate   # macOS / Linux
   # .\venv\Scripts\activate   # Windows
   ```
3. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
4. **Configure environment variables**:
   - Copy `.env.example` to `.env`.
   - Fill in your `GEMINI_API_KEY`.
   - Provide Twilio credentials (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`).
5. **Run the server**:
   ```bash
   uvicorn main:app --reload
   ```
   The app will be available at `http://127.0.0.1:8000/`.

---

## Usage
- Open the URL in a modern browser (Chrome/Edge recommended).
- **Allow camera and location** permissions when prompted.
- The live feed starts automatically.
- **SOS triggers**:
  1. Press the red **SOS** button.
  2. Say “SOS”, “help”, “emergency”, or “bachao”.
  3. Show **five fingers** for ~2 seconds.
- **Fake Call** – click the *Fake Call* button or say “call”.
- **Scan Now** – manually request an immediate AI analysis.
- Manage contacts via the right‑hand panel.

---

## API Reference
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/analyze` | Accepts a base64 JPEG and location, returns threat JSON from Gemini.
| `POST` | `/api/sos` | Sends WhatsApp alerts to all contacts and logs the event.
| `GET`  | `/api/contacts` | Returns the contacts array.
| `POST` | `/api/contacts` | Adds a new contact (name & phone).
| `DELETE`| `/api/contacts/{phone}` | Removes a contact.
| `POST` | `/api/voice` | Handles voice transcript, returns an action (SOS, FAKE_CALL, etc.).
| `GET`  | `/api/health` | Health check (returns `{ "status": "online" }`).

All endpoints return JSON and include proper error handling.

---

## Environment Variables
```
GEMINI_API_KEY=your_gemini_api_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # Twilio sandbox number
```
These values are loaded via `python‑dotenv`.

---

## License
This project is provided **as‑is** for demonstration and educational purposes. Feel free to modify, extend, or commercialise it, but be aware of the licensing terms of the third‑party services used (Google Gemini, Twilio, MediaPipe).

---

## Acknowledgements
- **Google Generative AI** – for the Gemini vision model.
- **Twilio** – for the WhatsApp messaging service.
- **MediaPipe** – for real‑time hand‑gesture detection.
- **Inter font** – from Google Fonts for the modern typography.

---

*Happy building, and stay safe!*
