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


