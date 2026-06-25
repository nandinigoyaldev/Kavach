"""
JARVIS Main Launcher

Standalone version: See src/main.py
"""

import os
import sys
from pathlib import Path

# Force xcb platform to fix blank/invisible OpenCV windows on Wayland
if os.environ.get("XDG_SESSION_TYPE") == "wayland":
    os.environ["QT_QPA_PLATFORM"] = "xcb"

# Add current directory to path
ROOT = Path(__file__).resolve().parents[0]
sys.path.insert(0, str(ROOT))

# Import and run the full JARVIS system
try:
    from src.main import main
except ImportError:
    print("Error: Could not import main application module.")


if __name__ == "__main__":
    main()
