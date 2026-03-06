# SubtiTool

<div align="center">
  <img width="1080" height="250" alt="SubtiTool Banner" src="https://github.com/user-attachments/assets/b51bf567-3b00-44b6-865e-dba3f5f27b0f" />
  <br>
  <img width="1423" height="799" alt="SubtiTool Screenshot" src="https://github.com/user-attachments/assets/b4eb51df-3fff-48c7-a8a4-8038af5e35c3" />
</div>

<br>

An AI-powered subtitle translation and localization platform designed for professional workflows. SubtiTool prioritizes precision, speed, and contextual awareness through a keyboard-centric interface and advanced engine integration.

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)

---

## Table of Contents

- [Introduction](#introduction)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Technical Stack](#technical-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage Guide](#usage-guide)
  - [Project Creation](#project-creation)
  - [Translation Workflow](#translation-workflow)
  - [Editor Controls](#editor-controls)
  - [AI-Assisted Refinement](#ai-assisted-refinement)
- [Project Portability (.stproj)](#project-portability-stproj)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Media Handling](#media-handling)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

---

## Introduction

SubtiTool is a specialized environment for subtitle translation that bridges the gap between raw machine translation and professional human refinement. It utilizes Large Language Models (LLMs) like Gemini Pro to maintain narrative flow across segments while providing a high-performance virtualized editor for massive subtitle files.

## Key Features

### Advanced Translation
- **Semantic Context Awareness**: Batch processing with overlapping segments ensures consistent terminology and tone throughout the project.
- **Multi-Engine Support**: Integration with Gemini Pro, Google Translate, and LibreTranslate.
- **Resilient Pipeline**: Per-line retries with exponential backoff and automatic failover mechanisms.
- **Smart Retranslation**: Individual segment re-processing with custom hints or glossary enforcement.

### Precision Editor
- **Virtualized Rendering**: Support for thousands of subtitle rows without performance degradation using a virtual scrolling architecture.
- **Smart Timing Hub**: Floating action bar for real-time playhead "punch-in" to set start and end timecodes with frame accuracy.
- **Auto-Scroll Synchronization**: Intelligent editor positioning that follows video playback to keep the active row centered.
- **AI Snippet Refinement**: Direct integration to shorten or rephrase specific text selections via AI prompts tailored for Netflix-style CPS (Characters Per Second) standards.

### Data Integrity
- **ACID Compliant Storage**: Persistent project management using SQLite.
- **Idempotent Operations**: Guarded state transitions to prevent duplicate actions or data race conditions.
- **Offline Resilience**: Foreground auto-save with background sync status indicators.

---

## Technical Stack

- **Frontend**: React 19, Zustand (State Management), Wavesurfer.js (Waveform Visualization), Vanilla CSS (Custom Design System).
- **Backend**: Python 3.9+, FastAPI, SQLAlchemy, BackgroundTasks for asynchronous processing.
- **Media**: FFmpeg integration for high-performance 480p video proxy generation.
- **Database**: SQLite for lightweight, zero-configuration persistence.

---

## Getting Started

### Prerequisites

- Node.js version 18 or higher.
- Python version 3.9 or higher.
- FFmpeg installed on the system path (required for video proxy features).
- Gemini API Key (recommended for advanced AI features).

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/awpetrik/SubtiTool.git
   cd SubtiTool
   ```

2. Configure the Backend:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

3. Configure the Frontend:
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```

---

## Usage Guide

### Project Creation
1. Navigate to the Dashboard.
2. Upload a `.srt` file.
3. Select the source and target languages.
4. Input a project description to provide context for the AI engine (e.g., "Genre: Horror, Tone: Informal").
5. Click "Create Project" to initiate the background translation process.

### Translation Workflow
- Monitor live progress via the completion bar.
- Segments will transition from `pending` to `ai_done` as they are processed.
- Use the Filter sidebar to focus on specific states like `flagged` or `in_review`.

### Editor Controls
- **Double-click** any translation cell to enter Edit Mode.
- **Right-click** a segment to access the Context Menu for quick actions.
- Use the **Smart Timing Hub** (appears at the bottom when a video is loaded) to sync timecodes with the video playhead.

### AI-Assisted Refinement
- Highlight a specific word or phrase in the translation cell.
- A floating AI menu will appear.
- Select **Shorten** to reduce text length while maintaining meaning.
- Select **Rephrase** to improve natural flow based on the project context.

---

## Project Portability (.stproj)

SubtiTool uses a custom `.stproj` format (JSON-based) to ensure your internal project state—including translation status, flags, and glossary entries—is fully portable across different installations or backups.

### The .stproj Schema
Unlike standard `.srt` files which only contain timecodes and text, an `.stproj` file encapsulates:

- **Project Metadata**: Title, source/target languages, and creation timestamps.
- **Glossary**: All project-specific terminology and translation notes.
- **Extended Row Data**: Current translation status (`ai_done`, `flagged`, etc.), CPA/CPS calculations, and review flags.
- **Session State**: Your last active row, currently applied filters, and bookmarked segments.

### Why use .stproj?
While `.srt` is the final export format for players, `.stproj` should be used for **saving work-in-progress**. It allows you to move your project to another computer or restore it after a database reset without losing your organizational progress.

---

## Keyboard Shortcuts

Press `?` inside the editor for the full interactive shortcut reference.

| Category | Key | Action |
| --- | --- | --- |
| Navigation | `J` / `K` | Move Active Row |
| Navigation | `G G` / `G` | Jump to Start / End |
| Playback | `Space` | Play / Pause Video |
| Playback | `[` / `]` | Set Start / End Timecode (Active Row) |
| Editing | `Enter` | Save and Move to Next |
| Editing | `Tab` | Save and Edit Next |
| Actions | `A` | Approve Segment |
| Actions | `X` | Toggle Selection Mode |

---

## Media Handling

SubtiTool generates specialized 480p H.264 video proxies for smooth playback during editing. 
- Large video files will prompt a conversion request.
- Proxy files are stored in `backend/temp_proxies` and served as static assets.
- Cleaning the cache can be done manually or will occur according to server-side retention policies.

---

## API Reference

SubtiTool provides a RESTful API for project management and background translation coordination.

### Projects
- **GET** `/api/projects`: List all saved projects with completion statistics.
- **POST** `/api/projects`: Create a manual project entry (non-translation).
- **GET** `/api/projects/{id}`: Retrieve full project details, including all segments and glossary.
- **PATCH** `/api/projects/{id}/segments/{seg_id}`: Update a specific segment's translation, status, or flag notes.
- **DELETE** `/api/projects/{id}`: Permanently remove a project and all associated data.

### Translation & Jobs
- **POST** `/api/translate`: Initiate a background translation job. Requires `multipart/form-data` including the `.srt` file and project metadata.
- **GET** `/api/translate/{project_id}/progress`: A Server-Sent Events (SSE) endpoint to stream real-time progress updates for ongoing jobs.
- **POST** `/api/translate/{project_id}/refine`: AI-powered snippet refinement for selected text (Shorten/Rephrase).
- **POST** `/api/translate/{project_id}/retranslate/{seg_id}`: Trigger an engine retranslation for a single segment.

### Export
- **POST** `/api/export/{project_id}`: Generate and download the finished subtitle file. Supports SRT format with optional original/translation layout.

---

## Project Structure

```text
SubtiTool/
├── backend/
│   ├── main.py              # Application Entry Point
│   ├── routers/             # API Endpoints (Project, Translate, Proxy)
│   ├── services/            # Business Logic (Engines, Parsers, FFmpeg)
│   └── database.db          # Persistence Layer
├── frontend/
│   ├── src/
│   │   ├── pages/           # View Logic (Upload, Editor)
│   │   ├── components/      # Reusable UI Elements
│   │   └── store/           # Zustand Global State
│   └── package.json         # Frontend Dependencies
└── README.md                # Documentation
```

---

## Contributing

Please review the issue tracker before submitting pull requests. Ensure all code adheres to the existing SOLID and DRY principles established in the codebase.

## License

This project is licensed under the GNU Affero General Public License.
