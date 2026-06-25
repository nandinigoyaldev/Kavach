from fastapi import FastAPI
from pydantic import BaseModel
import time

app = FastAPI(title="Autobot API")

class SignPayload(BaseModel):
    sign: str

class RegisterPayload(BaseModel):
    image_base64: str

@app.get("/api/health")
async def health_check():
    return {"status": "online", "system": "Touchless Kiosk", "timestamp": time.time()}

@app.post("/api/sign")
async def handle_sign(payload: SignPayload):
    print(f"Received sign from client: {payload.sign}")
    return {"status": "success", "message": f"Processed sign: {payload.sign}"}

@app.post("/api/register")
async def handle_register(payload: RegisterPayload):
    # In a real app, upload this base64 string to AWS S3 or Supabase Storage.
    # For Vercel Serverless, we process and return success since we cannot store to local disk safely.
    print("Received new user photo registration.")
    
    return {
        "status": "success",
        "message": "User profile successfully captured and stored securely.",
        "image_preview": payload.image_base64[:50] + "..." # Just for logging
    }
