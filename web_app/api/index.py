from fastapi import FastAPI, File, UploadFile
from pydantic import BaseModel
import time
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Try to load .env from root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))

system_prompt = (
    "You are J.A.R.V.I.S., a highly advanced AI assistant created by Tony Stark. "
    "You are extremely helpful, highly intelligent, slightly sarcastic, and very formal. "
    "Keep your answers concise and conversational, as they will be spoken out loud via text-to-speech. "
    "Refer to the user as 'Sir' or 'Madam' occasionally."
)

model = genai.GenerativeModel('gemini-2.5-flash', system_instruction=system_prompt)
chat_session = model.start_chat(history=[])

app = FastAPI(title="Autobot API")

from typing import Optional

class VoicePrompt(BaseModel):
    prompt: str
    context: list[str] = []
    image: Optional[str] = None
    emotion: Optional[str] = "NEUTRAL"
    activeUser: Optional[str] = None

import json
import re

def load_profiles():
    p_path = os.path.join(os.path.dirname(__file__), "profiles.json")
    if os.path.exists(p_path):
        with open(p_path, "r") as f:
            return json.load(f)
    return {}

def save_profiles(profiles):
    p_path = os.path.join(os.path.dirname(__file__), "profiles.json")
    with open(p_path, "w") as f:
        json.dump(profiles, f, indent=4)

@app.post("/api/voice")
async def process_voice(data: VoicePrompt):
    prompt = data.prompt
    context = data.context
    
    if not os.environ.get("GEMINI_API_KEY"):
        return {"response": "Gemini API Key is missing."}
        
    profiles = load_profiles()
    
    # Inject Active User Profile Context
    if data.activeUser and data.activeUser in profiles:
        conds = ", ".join(profiles[data.activeUser].get("conditions", []))
        prompt = f"[SYSTEM: The active user is {data.activeUser}. Their known conditions are: {conds}. Adapt your reasoning to these conditions (e.g., if they have a food allergy, warn them based on visual input).]\n{prompt}"
    
    # Inject visual context if available
    if context and len(context) > 0:
        objects = ", ".join(context)
        prompt = f"[SYSTEM: The user's camera currently sees these objects in the room: {objects}]\n{prompt}"
        
    # Inject emotion context
    if data.emotion and data.emotion != "NEUTRAL":
        prompt = f"[SYSTEM: The user's facial expression currently shows they are: {data.emotion}. Adapt your tone accordingly.]\n{prompt}"
        
    prompt = f"{prompt}\n[SYSTEM DIRECTIVE: 1. You are receiving a live snapshot of the user's environment. Summarize in 1-2 sentences. 2. If the user asks for a reminder, append ||REMINDER:[seconds]:[message]||. 3. If the user introduces themselves (e.g. 'I am Bob' or 'My name is Bob'), you MUST append ||LOGIN:Bob||. 4. If the user states they have a disability or condition, append ||CONDITION:Condition Name|| (e.g., ||CONDITION:Peanut Allergy|| or ||CONDITION:Deaf||).]"
    
    try:
        content = [prompt]
        if data.image:
            import base64
            image_bytes = base64.b64decode(data.image)
            content.append({"mime_type": "image/jpeg", "data": image_bytes})
            
        llm_response = chat_session.send_message(content)
        resp_text = llm_response.text
        
        new_active_user = data.activeUser
        
        # Intercept LOGIN protocol
        login_match = re.search(r"\|\|LOGIN:(.*?)\|\|", resp_text)
        if login_match:
            new_active_user = login_match.group(1).strip()
            if new_active_user not in profiles:
                profiles[new_active_user] = {"name": new_active_user, "conditions": []}
            resp_text = resp_text.replace(login_match.group(0), "")
            
        # Intercept CONDITION protocol
        cond_match = re.search(r"\|\|CONDITION:(.*?)\|\|", resp_text)
        if cond_match and new_active_user:
            cond = cond_match.group(1).strip()
            if cond.lower() != "none" and new_active_user in profiles:
                if cond not in profiles[new_active_user]["conditions"]:
                    profiles[new_active_user]["conditions"].append(cond)
            resp_text = resp_text.replace(cond_match.group(0), "")
            
        save_profiles(profiles)
        
        active_prof_data = profiles.get(new_active_user) if new_active_user else None
        
        return {
            "response": resp_text.strip(),
            "active_profile": active_prof_data
        }
    except Exception as llm_err:
        print(f"LLM Error: {llm_err}")
        return {"response": "I'm sorry, I encountered an error processing your request."}

@app.post("/api/voice-audio")
async def process_voice_audio(audio: UploadFile = File(...)):
    if not os.environ.get("GEMINI_API_KEY"):
        return {"response": "Gemini API Key is missing."}
    
    try:
        audio_bytes = await audio.read()
        mime = audio.content_type if audio.content_type else "audio/webm"
        
        # Send audio directly to Gemini
        llm_response = chat_session.send_message([
            {"mime_type": mime, "data": audio_bytes},
            "Listen to this spoken command and respond to it."
        ])
        return {"response": llm_response.text}
    except Exception as llm_err:
        print(f"Audio LLM Error: {llm_err}")
        return {"response": "I'm sorry, I encountered an error processing your audio."}

class SignPayload(BaseModel):
    sign: str

class RegisterPayload(BaseModel):
    image_base64: str

@app.get("/api/health")
async def health_check():
    return {"status": "online", "system": "Touchless Kiosk", "timestamp": time.time()}

@app.get("/api/config")
async def get_config():
    return {"picovoiceKey": os.environ.get("PICOVOICE_ACCESS_KEY", "")}

from fastapi.staticfiles import StaticFiles
import os

# Get the directory of the current file to find the public folder
current_dir = os.path.dirname(os.path.abspath(__file__))
public_dir = os.path.join(current_dir, "..", "public")

# We mount it at the end to avoid overriding API routes
app.mount("/public", StaticFiles(directory=public_dir), name="public")

@app.get("/")
async def serve_index():
    from fastapi.responses import FileResponse
    return FileResponse(os.path.join(public_dir, "index.html"))

@app.get("/{filename:path}")
async def serve_static(filename: str):
    from fastapi.responses import FileResponse
    file_path = os.path.join(public_dir, filename)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(public_dir, "index.html"))


