import os
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv(os.path.join(os.getcwd(), ".env"))
api_key = os.environ.get("GEMINI_API_KEY", "")
print("Key length:", len(api_key))

genai.configure(api_key=api_key)
model = genai.GenerativeModel('gemini-1.5-flash')
try:
    response = model.generate_content("hello")
    print("Success:", response.text)
except Exception as e:
    print("Error:", str(e))
