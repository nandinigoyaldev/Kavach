# autobotx

Welcome to **autobotx**, a futuristic AI assistant integrating powerful hand gesture control, voice recognition, and an interactive web interface. Built for performance and seamless multimodal interaction, autobotx allows you to control your computer without touching the keyboard.

## Features

- **Advanced Hand Gesture Recognition:** Utilizes MediaPipe for high-performance, real-time hand tracking. Control the system using intuitive gestures like pinches, finger counting, and open palms.
- **Voice Commands:** Integrated local and cloud-based speech recognition allows you to speak naturally to autobotx.
- **Web Interface:** Includes a fully functional web dashboard with sign language recognition and a beautiful holographic UI.
- **Cross-Platform:** Designed to run seamlessly on Linux, macOS, and Windows.

## Installation

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd Auto_bot_x
```

### 2. Set up the virtual environment
```bash
python3 -m venv .venv
source .venv/bin/activate
```

*(For Windows, use `.venv\Scripts\activate`)*

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

*Note: Depending on your OS, you may need additional system libraries for audio (e.g., `portaudio19-dev` on Linux or `portaudio` via Homebrew on macOS).*

## Running the Application

To start the main desktop assistant:

```bash
python -m autobotx.main
```

### Controls

- **Gestures:** Use standard gestures (e.g., raising 5 fingers) to interact.
- **V:** Toggle voice recognition on or off from the camera window.
- **ESC:** Quit the application.

## Web Application

The project includes a serverless-ready web dashboard with built-in sign language recognition.

To run the web app locally:

```bash
cd web_app
pip install -r requirements.txt
uvicorn api.index:app --reload
```
Open `http://localhost:8000` to view the interface.

## Configuration

You can customize gestures and configurations by editing `profiles.json` in the project root. Advanced environment variables (like API keys) can be managed via a `.env` file.

---
*Built with ❤️ using Python, OpenCV, and MediaPipe.*
