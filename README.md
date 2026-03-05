# SubtiTool

> **⚠️ WARNING: WORK IN PROGRESS**  
> SubtiTool is currently in active early-stage development. It is **not fully functional yet** and you may encounter bugs, incomplete features, or breaking changes. Use at your own risk!



<div align="center">
  <img width="1423" height="799" alt="image" src="https://github.com/user-attachments/assets/b4eb51df-3fff-48c7-a8a4-8038af5e35c3" />
</div>



An AI-powered subtitle translator and keyboard-centric editor designed to streamline localization workflows. Built for professional subtitlers who need speed, context-awareness, and reliability.

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)

## Features

**Translation**
- Multiple translation engines: Gemini AI (semantic), Google Translate (free), LibreTranslate (self-hosted), and full Manual mode
- Batch processing with overlap context to maintain narrative coherence across segments
- Per-line retry with exponential backoff and automatic fallback on engine failure
- Resume interrupted translation jobs without losing progress
- Inline retranslation of individual segments with optional hint context

**Editor**
- Virtual scrolling architecture for infinite large subtitle project support without RAM bottleneck
- Refined typography and readable UI tailored for desktop monitor viewing sizes
- Keyboard-centric workflow with Vim-like navigation for zero-mouse operation
- Status-based visual hierarchy: color-coded left borders indicate segment states
- Context menu with right-click access to translate selection, retranslate, flag, skip, and copy actions
- Inline text translation: select any text fragment and translate it directly in the editor
- Undo history per segment

**Project Management**
- Persistent project storage with SQLite, survives server restarts
- Dashboard showing saved projects with progress rings, completion percentages, and time-since-last-edit
- Project glossary enforcement with real-time term highlighting
- Auto-save indicator with timestamp feedback

**Data Integrity**
- Idempotent segment updates via PATCH with server-side validation of status transitions
- Exponential backoff retry (3 attempts, 500ms/1s/2s) on all frontend write operations
- Double-submit guard on project creation
- Batch-isolated error handling: a failing translation batch does not abort the rest of the job

**Other**
- SubSource overlay for looking up contextual information directly in the editor
- Real-time SSE progress stream during background translation jobs
- SRT export with original/translation comparison layout option
- Skip detection for lyrics, sound effects, and non-translatable segments

## Tech Stack

- **Frontend**: React 19, Vite, Zustand (selective state management), Vanilla CSS
- **Backend**: Python 3.9+, FastAPI, SQLAlchemy (SQLite), BackgroundTasks
- **AI Integration**: Google Generative AI (Gemini), `deep-translator` (Google Free)
- **Streaming**: Server-Sent Events (SSE) for live progress updates

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or higher
- [Python](https://www.python.org) 3.9 or higher
- A Gemini API Key (optional, only needed for the Gemini AI engine)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/awpetrik/SubtiTool.git
   cd SubtiTool
   ```

2. **Set up the backend**
   ```bash
   cd backend
   python -m venv .venv

   # Activate virtual environment
   source .venv/bin/activate   # On Windows: .venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt

   # Start the FastAPI server (runs on port 8000)
   uvicorn main:app --reload
   ```

3. **Set up the frontend**
   ```bash
   # Open a new terminal, from the repository root
   cd frontend

   # Install dependencies
   npm install

   # Start the Vite development server (runs on port 5173)
   npm run dev
   ```

4. Open your browser at `http://localhost:5173`

## Editor Shortcuts

Press `?` inside the editor to show the full shortcut reference panel.

### Navigation

| Key | Action |
|-----|--------|
| `J` / `K` or `Arrow Down` / `Arrow Up` | Move active row |
| `Page Down` / `Page Up` | Jump 10 rows |
| `G G` / `Shift + G` | Jump to first / last row |

### Editing

| Key | Action |
|-----|--------|
| `Enter` / `F2` | Edit active row |
| `Tab` (while editing) | Save and move to next row |
| `Shift + Enter` | Save and stay on row |
| `Esc` | Discard current edit |

### Actions

| Key | Action |
|-----|--------|
| `A` | Approve row |
| `S` | Skip row (marks as non-translatable) |
| `F` | Flag row for review |
| `R` | Retranslate row via selected engine |
| `U` | Undo last action on active segment |
| `Ctrl + Z` | Global undo |
| `Ctrl + Enter` | Bulk approve selected rows |

### Context Menu

Right-click any segment to access: translate selection, retranslate row, copy original, flag, skip, and approve options.

## Project Structure

```
SubtiTool/
  backend/
    main.py                  FastAPI entry point
    models/                  SQLAlchemy ORM models (Project, Segment, Glossary)
    routers/
      projects.py            CRUD for projects and segments
      translate.py           Translation job management and SSE progress
      export.py              SRT export endpoint
      glossary.py            Glossary management
    services/
      engines/               Translation engine adapters (Gemini, Google, Libre)
      srt_parser.py          SRT file parser
  frontend/
    src/
      pages/
        Upload.jsx           Project dashboard and creation form
        Editor.jsx           Main editor view
      components/
        SubtitleRow.jsx      Individual segment row with editing and actions
        SubtitleList.jsx     Virtualized segment list
      store/
        useSubtiStore.js     Zustand store with all editor state and actions
```

## Segment Status Flow

```
pending -> ai_done -> in_review -> approved
                   -> flagged   -> in_review -> approved
pending -> skipped
```

- `pending`: not yet translated
- `ai_done`: translated by engine, awaiting human review
- `in_review`: marked for closer attention
- `flagged`: has a note attached, needs resolution
- `approved`: confirmed correct by the subtitler
- `skipped`: intentionally left as-is (lyrics, SFX, non-dialogue)

## Contributing

Contributions, issues, and feature requests are welcome. Since the project is in active development, please open an issue first to discuss what you would like to change or implement.

## License

This project is licensed under the GNU AFFERO GENERAL PUBLIC LICENSE.
