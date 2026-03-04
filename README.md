# SubtiTool

> **⚠️ WARNING: WORK IN PROGRESS**  
> SubtiTool is currently in active early-stage development. It is **not fully functional yet** and you may encounter bugs, incomplete features, or breaking changes. Use at your own risk!

An AI-powered, blazing-fast subtitle translator and keyboard-centric editor designed to streamline your localization and translation workflow.

![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)
![Python](https://img.shields.io/badge/python-3670A0?style=for-the-badge&logo=python&logoColor=ffdd54)
![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)

## Features

- **Keyboard-Centric Editor**: Navigate, edit, approve, flag, and undo completely without a mouse for maximum productivity using Vim-like / intuitive keybinds.
- **Multiple Translation Engines**: Support for Gemini AI (Semantic translation), Google Free, and LibreTranslate (Self-hosted), as well as a full Manual Translation mode.
- **Project Glossary Enforcement**: Real-time glossary term highlighting and management to maintain translation consistency across large files or episodes.
- **Lightning Fast Performance**: Heavily optimized UI using React selective rendering & memoization preventing frame drops even on `.srt` files with thousands of segments. 
- **SubSource Overlay**: Quickly lookup contextual information or original character names right from the editor window.
- **Real-time Progress Tracker**: SSE-powered progress indicators let you know exactly what the background AI workers are processing.

## Tech Stack

- **Frontend**: React 19, Vite, Zustand (selective state management), Vanilla CSS
- **Backend**: Python 3, FastAPI, SQLAlchemy (SQLite), BackgroundTasks
- **AI Integration**: Google Generative AI Engine, `deep-translator`

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18+)
- [Python](https://www.python.org) (3.9+)
- A Gemini API Key (if you intend to use the Gemini AI engine)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/awpetrik/SubtiTool.git
   cd SubtiTool
   ```

2. **Setup Backend**
   ```bash
   cd backend
   python -m venv .venv
   
   # Activate virtual environment
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Configure environment variables
   cp .env.example .env
   # Open .env and add your GEMINI_API_KEY
   
   # Start the FastAPI server (Runs on port 8000)
   uvicorn main:app --reload
   ```

3. **Setup Frontend**
   ```bash
   # Open a new terminal window
   cd frontend
   
   # Install dependencies
   npm install
   
   # Start the Vite development server (Runs on port 5000)
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5000`

## Editor Shortcuts

The editor is built for speed. Press `?` while in the editor to see the full list of keyboard shortcuts.

### Navigation
- `↑` / `↓` or `K` / `J` - Move active row
- `PageUp` / `PageDown` - Jump 10 rows
- `G` `G` / `Shift + G` - Jump to exact top / bottom

### Editing
- `Enter` / `F2` - Edit current active row
- `Tab` (while editing) - Save and edit next row automatically
- `Shift + Enter` - Save and stay on row
- `Esc` - Discard current edit

### Actions
- `A` - Approve row
- `F` - Flag row for review
- `R` - Retranslate row via API
- `U` - Undo last action on segment
- `Ctrl + Z` - Global app Undo
- `Ctrl + Enter` - Bulk approve text selection

## Contributing

Contributions, issues, and feature requests are welcome! Since the project is still in volatile development, please open an issue first to discuss what you would like to implement or fix.

## License

This project is licensed under the MIT License.
