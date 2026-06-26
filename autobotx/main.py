"""
autobotx Gesture + Voice Controller

Teaching path (small, focused scripts):
- Camera Feed: `src/camera_feed.py`
- Gesture Tracker: `src/gesture_tracker.py`
"""

import glob
import ast
import json
import math
import random
import os
import re
import shutil
import subprocess
import sys
import time
import warnings
from pathlib import Path
from datetime import datetime

import cv2
import mediapipe as mp
import numpy as np
import pygame
import requests

try:
    import sounddevice as sd
except Exception:
    sd = None

# Add root directory to path for imports
_ROOT = Path(__file__).resolve().parents[0]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from .voice import VoiceCommandListener


ROOT_DIR = Path(__file__).resolve().parents[0]
AUDIO_DIR = ROOT_DIR / "audios"
PROFILE_CONFIG_PATH = ROOT_DIR / "profiles.json"

DEFAULT_PROFILE_CONFIG = {
    "active_profile": "default",
    "profiles": {
        "default": {
            "display_name": "Default",
            "gesture_mode_gestures": {
                "pinch": {"label": "PINCH/SPARKLE"},
                "5": {"label": "autobotx", "autobotx": True},
            },
            "volume": {
                "up_start": 60,
                "down_start": 40,
                "step": 10,
            },
        }
    },
}


warnings.filterwarnings(
    "ignore",
    message=r"SymbolDatabase.GetPrototype\(\) is deprecated",
    category=UserWarning,
)


def load_sound(filename):
    path = AUDIO_DIR / filename
    if not path.exists():
        print(f"Audio file not found: {path}")
        return None
    try:
        return pygame.mixer.Sound(str(path))
    except Exception as e:
        print(f"Failed to load {path}: {e}")
        return None


def main():
    playerctl_available = shutil.which("playerctl") is not None
    pactl_available = shutil.which("pactl") is not None
    last_player_scan_time = 0.0
    PLAYER_SCAN_INTERVAL = 1.0

    if not sp:
        if playerctl_available:
            print("Spotify Web API unavailable. Using local Spotify controls via playerctl.")
        else:
            print("Spotify controls are unavailable. Install playerctl or configure Spotify API credentials.")

    audio_available = True
    try:
        pygame.mixer.pre_init(44100, -16, 2, 512)
        pygame.mixer.init()
    except Exception as exc:
        audio_available = False
        try:
            pygame.mixer.quit()
        except Exception:
            pass
        print(f"Audio disabled: {exc}")

if __name__ == "__main__":
    main()
