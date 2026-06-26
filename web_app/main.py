from fastapi import FastAPI, Request
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import json
import os
import time
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

# Configure Gemini
genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
model = genai.GenerativeModel('gemini-1.5-flash')
chat_session = model.start_chat(history=[])

app = FastAPI(title="Autobot Web")

class VoicePrompt(BaseModel):
    prompt: str

# Ensure static directory exists
os.makedirs("static", exist_ok=True)

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/", response_class=HTMLResponse)
async def read_index():
    with open("public/index.html", "r") as f:
        return f.read()

@app.post("/api/voice")
async def process_voice(data: VoicePrompt):
    prompt = data.prompt
    print(f"Received voice prompt: {prompt}")
    
    if not os.environ.get("GEMINI_API_KEY"):
        return {"response": "Gemini API Key is missing. Please add it to your Vercel Environment Variables."}
    
    try:
        # Generate response from Gemini
        llm_response = chat_session.send_message(prompt)
        reply_text = llm_response.text
        return {"response": reply_text}
    except Exception as llm_err:
        print(f"LLM Error: {llm_err}")
        return {"response": "I'm sorry, I encountered an error processing your request."}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
