# main.py
"""RakshAI FastAPI backend
Provides static file serving and safety APIs.
"""

import os
import json
import base64
import datetime
from typing import List, Dict, Any

from fastapi import FastAPI, HTTPException, Request, Body, Depends
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
load_dotenv()

# Gemini and Twilio imports (lazy to avoid import errors if keys missing)
try:
    import google.generativeai as genai
    from google.generativeai.types import GenerationConfig, SafetySetting, Part
except ImportError:
    genai = None
    Part = None

try:
    from twilio.rest import Client as TwilioClient
except ImportError:
    TwilioClient = None

# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------
DATA_DIR = Path(__file__).parent
CONTACTS_PATH = DATA_DIR / "contacts.json"
SOS_LOG_PATH = DATA_DIR / "sos_log.json"

def ensure_json_file(path: Path, default: Any = []):
    """Create the JSON file with a default value if it does not exist."""
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w", encoding="utf-8") as f:
            json.dump(default, f, ensure_ascii=False, indent=2)

def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)

def write_json(path: Path, data: Any):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# Initialise storage files
ensure_json_file(CONTACTS_PATH, [])
ensure_json_file(SOS_LOG_PATH, [])

# ---------------------------------------------------------------------------
# FastAPI app configuration
# ---------------------------------------------------------------------------
app = FastAPI(title="RakshAI Backend", docs_url="/docs")

# Allow CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static frontend
static_dir = DATA_DIR / "static"
# Serve static files under /static to avoid route conflicts
app.mount("/static", StaticFiles(directory=static_dir, html=True), name="static")

# ---------------------------------------------------------------------------
# Pydantic models for request bodies
# ---------------------------------------------------------------------------
class LocationModel(BaseModel):
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")

class AnalyzeRequest(BaseModel):
    image: str = Field(..., description="Base64‑encoded JPEG image")
    location: LocationModel

class SOSRequest(BaseModel):
    location: LocationModel
    ai_assessment: str
    timestamp: str

class ContactCreate(BaseModel):
    name: str
    phone: str

class VoiceRequest(BaseModel):
    transcript: str

# ---------------------------------------------------------------------------
# Gemini helper (vision)
# ---------------------------------------------------------------------------
def gemini_vision_analyze(image_b64: str, location: Dict[str, float]) -> Dict[str, Any]:
    if genai is None:
        raise RuntimeError("google‑generativeai package not installed")
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in environment")
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=(
            "You are RakshAI, a women's safety AI. Analyze this camera frame and return ONLY valid JSON, "
            "no markdown, no explanation: { threat_level: LOW or MEDIUM or HIGH, score: integer 1 to 10, "
            "observations: [array of 3 short strings describing what you see], recommendation: one short sentence of advice, "
            "detected_objects: [array of objects visible] }."
        ),
    )
    # Decode base64 image safely – handle possible errors
    try:
        img_bytes = base64.b64decode(image_b64)
    except Exception as e:
        raise RuntimeError(f"Failed to decode base64 image: {e}")
    img_part = Part.from_data(data=img_bytes, mime_type="image/jpeg")
    location_part = Part.from_text(f"Location: lat={location.get('lat')}, lng={location.get('lng')}")
    response = model.generate_content([img_part, location_part])
    try:
        result_text = response.text.strip()
        return json.loads(result_text)
    except Exception as e:
        raise RuntimeError(f"Failed to parse Gemini response: {e}")

# ---------------------------------------------------------------------------
# Twilio helper for WhatsApp messages
# ---------------------------------------------------------------------------
def send_whatsapp_alert(to_number: str, message: str):
    if TwilioClient is None:
        raise RuntimeError("twilio package not installed")
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_whatsapp = os.getenv("TWILIO_WHATSAPP_FROM")
    if not all([account_sid, auth_token, from_whatsapp]):
        raise RuntimeError("Twilio credentials not fully set in environment")
    client = TwilioClient(account_sid, auth_token)
    client.messages.create(body=message, from_=from_whatsapp, to=to_number)

# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------
@app.post("/api/analyze")
async def analyze(request: AnalyzeRequest):
    try:
        result = gemini_vision_analyze(request.image, request.location.dict())
        return JSONResponse(content=result)
    except Exception as exc:
        return JSONResponse(content={"error": str(exc)}, status_code=500)

@app.post("/api/sos")
async def sos(request: SOSRequest):
    contacts = load_json(CONTACTS_PATH)
    if not isinstance(contacts, list):
        contacts = []
    lat = request.location.lat
    lng = request.location.lng
    timestamp = request.timestamp
    assessment = request.ai_assessment
    msg = (
        "🚨 RakshAI EMERGENCY ALERT 🚨\n\n"
        "Someone you care about needs help RIGHT NOW.\n\n"
        f"📍 Location: https://maps.google.com/?q={lat},{lng}\n"
        f"🕐 Time: {timestamp}\n"
        f"🤖 AI says: {assessment}\n\n"
        "This alert was sent automatically by RakshAI Safety App."
    )
    alerted = 0
    for contact in contacts:
        try:
            send_whatsapp_alert(contact["phone"], msg)
            alerted += 1
        except Exception:
            continue
    # Log the SOS event
    log_entry = {
        "timestamp": timestamp,
        "location": request.location.dict(),
        "assessment": assessment,
        "contacts_alerted": alerted,
    }
    logs = load_json(SOS_LOG_PATH)
    logs.append(log_entry)
    write_json(SOS_LOG_PATH, logs)
    return {"success": True, "contacts_alerted": alerted}

@app.get("/api/contacts")
async def get_contacts():
    return load_json(CONTACTS_PATH)

@app.post("/api/contacts")
async def add_contact(contact: ContactCreate):
    contacts = load_json(CONTACTS_PATH)
    for c in contacts:
        if c["phone"] == contact.phone:
            raise HTTPException(status_code=400, detail="Contact with this phone already exists")
    contacts.append({"name": contact.name, "phone": contact.phone})
    write_json(CONTACTS_PATH, contacts)
    return contacts

@app.delete("/api/contacts/{phone}")
async def delete_contact(phone: str):
    contacts = load_json(CONTACTS_PATH)
    new_contacts = [c for c in contacts if c["phone"] != phone]
    if len(new_contacts) == len(contacts):
        raise HTTPException(status_code=404, detail="Contact not found")
    write_json(CONTACTS_PATH, new_contacts)
    return {"deleted": phone}

@app.post("/api/voice")
async def voice(request: VoiceRequest):
    txt = request.transcript.lower()
    if any(word in txt for word in ["sos", "help", "emergency", "bachao"]):
        return {"action": "SOS"}
    if any(word in txt for word in ["call", "fake call"]):
        return {"action": "FAKE_CALL"}
    if any(word in txt for word in ["safe", "cancel", "okay"]):
        return {"action": "CANCEL"}
    if any(word in txt for word in ["scan", "check", "surroundings"]):
        return {"action": "SCAN"}
    # Fallback to Gemini text response
    if genai is None:
        return {"action": "RESPOND", "message": "Gemini not available"}
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return {"action": "RESPOND", "message": "Gemini API key missing"}
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=(
            "You are RakshAI, a calm and helpful women's safety assistant. Keep responses under 2 sentences. "
            "Be direct and reassuring."
        ),
    )
    try:
        resp = model.generate_content(request.transcript)
        return {"action": "RESPOND", "message": resp.text.strip()}
    except Exception as e:
        return {"action": "RESPOND", "message": f"Error: {e}"}

@app.get("/api/health")
async def health():
    return {"status": "online"}

# Fallback root (served by StaticFiles)
@app.get("/")
async def root():
    index_path = static_dir / "index.html"
    return FileResponse(str(index_path))
