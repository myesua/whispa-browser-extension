# Whispa Browser Extension

> A privacy-first application that turns screen captures and voice input into structured notes—everything processed in-memory, nothing ever stored.

---

## Overview

Whispa AI Notes App is a lightweight, open-source tool that lets you create organized notes from what you see and say. Snap a screenshot or speak, and Whispa instantly extracts text with OCR, interprets images with an in-memory AI model, and transcribes voice using Gemini. All processing happens **only in RAM**; the moment you close the app, every pixel and syllable vanishes.

---

## Features

| Feature                 | Description                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| 🔒 **Zero Persistence** | No disk writes, no cloud sync—everything stays in memory and disappears on exit.           |
| 📸 **Screen Capture**   | Grab any region; OCR + optional AI model turn visuals into editable text.                  |
| 🎙️ **Voice to Notes**   | Speak naturally; Faster Whisper transcribes in real time with speaker-diarization support. |
| ⚡ **Instant Access**   | Launch via toolbar icon or customizable shortcut (`Ctrl+Shift+W` / `Cmd+Shift+W`).         |
| 🎨 **Minimal UI**       | Clean, distraction-free interface that matches your OS theme (light/dark/auto).            |
| 📋 **One-Click Copy**   | Copy the generated note to clipboard; clipboard auto-clears after 30 s.                    |
| 🧹 **Auto-Cleanup**     | Memory wiped after 5 min of inactivity or when the window loses focus.                     |

---

## Installation

### Desktop (Windows / macOS / Linux)

1. Download the latest `Whispa-AI-Setup.exe` / `.dmg` / `.AppImage` from [Releases](https://github.com/your-org/whispa-ai/releases).
2. Run the installer; no admin rights required.
3. Grant screen-recording and microphone permissions when prompted—permissions are used solely in-memory and never logged.

### Browser Extension (Chrome / Edge / Brave / Firefox)

1. Download `whispa-ai-extension.zip` from [Releases](https://github.com/your-org/whispa-ai/releases).
2. Unpack and load as an unpacked extension (Chrome/Edge) or install the `.xpi` (Firefox).
3. Note: OCR & AI run locally via WebAssembly; voice requires the desktop helper (bundled).

---

## Development

### Prerequisites

- Node.js ≥ 18
- pnpm (recommended) or npm
- Python 3.10 (for Gemini)
- CUDA (optional, for GPU acceleration)

### Clone & Install
