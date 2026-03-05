import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Edit3, Zap, Sparkles, Lock,
    XCircle, CheckCircle2, FileText, AlertTriangle,
    Circle, Loader2, RotateCcw, ArrowRight, UploadCloud,
    Settings2, Globe, PenTool, Terminal, ChevronRight, Music, VolumeX, Lightbulb,
    FolderOpen, Trash2, Play, Clock, Plus, ChevronDown
} from 'lucide-react';
import SubtiToolLogo from '../components/SubtiToolLogo';

const API = 'http://localhost:8000';

const RELEASE_TAGS = /[._-](1080p|720p|480p|2160p|4K|AMZN|WEB[_.-]?DL|WEBDL|WEBRip|BluRay|BDRip|DVDRip|DDP?[\d.]*|Atmos|H[._]?264|H[._]?265|HEVC|HDR10?[+]?|SDR|DTS[-.]?HD|DTS|AAC[\d.]*|x264|x265|NF|HULU|DSNP|ATVP|MAX|PCOK|REPACK|PROPER|IMAX|REMUX)(?=[._-]|$)/gi;

function parseTitle(filename) {
    let name = filename.replace(/\.(srt|txt)$/i, '');
    let prev = '';
    while (prev !== name) {
        prev = name;
        name = name.replace(RELEASE_TAGS, '');
    }
    return name
        .replace(/[._-]+/g, ' ')
        .replace(/\s\d+\s*$/, '')
        .replace(/\s[A-Z]\s/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

const ENGINES = [
    { value: 'manual', icon: <PenTool size={16} />, label: 'Manual' },
    { value: 'google_free', icon: <Globe size={16} />, label: 'Google' },
    { value: 'gemini', icon: <Sparkles size={16} />, label: 'Gemini AI' },
    { value: 'libretranslate', icon: <Terminal size={16} />, label: 'Libre' },
];

const LANG_FROM_OPTIONS = [
    { value: 'en', label: 'English' }, { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' }, { value: 'zh', label: 'Chinese' },
    { value: 'es', label: 'Spanish' }, { value: 'fr', label: 'French' },
];
const LANG_TO_OPTIONS = [
    { value: 'id', label: 'Indonesia' }, { value: 'en', label: 'English' },
    { value: 'ms', label: 'Melayu' }, { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
];

const EN_TIPS = [
    "Use J/K for fast navigation in the editor.",
    "Press S to skip lyrics automatically (in editor).",
    "Use Ctrl+H for global Find & Replace.",
    "A comfortable reading speed is max 17 CPS (Characters Per Second).",
    "Shortcut Shift+S can replace all lyrics/SFX candidates at once."
];

const ID_TIPS = [
    "Gunakan J/K untuk navigasi cepat di editor.",
    "Tekan S untuk skip baris lirik otomatis (di editor).",
    "Gunakan Ctrl+H untuk Find & Replace global.",
    "Batas nyaman membaca adalah maksimal 17 CPS (Characters Per Second).",
    "Pintasan Shift+S bisa mereplace semua kandidat lirik/SFX serentak."
];

const DICT = {
    en: {
        subtitleProcess: "AI Subtitle Workflow",
        noProjects: "No saved projects",
        savedProjects: "SAVED PROJECTS",
        timeAgo: "ago",
        tipsPrefix: "Tip",
        fileLabel: "SRT FILE",
        dragDrop1: "Drag & Drop .srt file here",
        dragDrop2: "or click to select file",
        onlySrt: "Only .srt files are accepted.",
        selectedFile: "Selected file:",
        contextLabel: "MOVIE CONTEXT",
        titleLabel: "Movie / Series Title",
        titlePlaceholder: "e.g. Breaking Bad",
        genreLabel: "Genre",
        genrePlaceholder: "Crime, Drama",
        charLabel: "Main Characters",
        charPlaceholder: "Walter, Jesse",
        translationLabel: "TRANSLATION",
        engineLabel: "Translation Engine",
        engineGeminiReq: "API key is required for Gemini engine.",
        autoSkipLabel: "AUTO-SKIP (SAVE API/TIME)",
        skipLyricsOpt: "Skip song lyrics (♪)",
        skipSfxOpt: "Skip Sound Effects ([Music])",
        btnTranslating: "Deploying & Starting...",
        btnStartManual: "Start Workflow",
        btnStartEngine: "Start Translation",
        errNoFile: "Please select an SRT file first.",
        confirmDelete: "Delete this project? All translation data will be permanently lost.",
        untitled: "Untitled",
        lines: "lines"
    },
    id: {
        subtitleProcess: "Alur Kerja Subtitle AI",
        noProjects: "Belum ada proyek tersimpan",
        savedProjects: "PROYEK TERSIMPAN",
        timeAgo: "yang lalu",
        tipsPrefix: "Tips",
        fileLabel: "FILE SRT",
        dragDrop1: "Drag & Drop file .srt ke sini",
        dragDrop2: "atau klik untuk pilih file",
        onlySrt: "Hanya file .srt yang diterima.",
        selectedFile: "File terpilih:",
        contextLabel: "KONTEKS FILM",
        titleLabel: "Judul Film / Series",
        titlePlaceholder: "Mis. Breaking Bad",
        genreLabel: "Genre",
        genrePlaceholder: "Crime, Drama",
        charLabel: "Karakter Utama",
        charPlaceholder: "Walter, Jesse",
        translationLabel: "TERJEMAHAN",
        engineLabel: "Engine Terjemahan",
        engineGeminiReq: "API key wajib diisi untuk engine Gemini.",
        autoSkipLabel: "AUTO-SKIP (HEMAT API/WAKTU)",
        skipLyricsOpt: "Skip baris nyanyian (♪)",
        skipSfxOpt: "Skip Sound Effects ([Music])",
        btnTranslating: "Otentikasi & Memulai...",
        btnStartManual: "Mulai Workflow",
        btnStartEngine: "Mulai Translate",
        errNoFile: "Pilih file SRT terlebih dahulu.",
        confirmDelete: "Hapus project ini? Semua data terjemahan akan hilang permanen.",
        untitled: "Tanpa Judul",
        lines: "baris"
    }
};

export default function UploadPage() {
    const navigate = useNavigate();
    const fileRef = useRef(null);
    const [uiLang, setUiLang] = useState(localStorage.getItem('ui_lang') || 'en');
    const t = DICT[uiLang];
    const tipsList = uiLang === 'en' ? EN_TIPS : ID_TIPS;

    const [file, setFile] = useState(null);
    const [lineCount, setLineCount] = useState(0);
    const [dragOver, setDragOver] = useState(false);
    const [fileError, setFileError] = useState('');

    const [form, setForm] = useState({
        title: '', genre: '', char_context: '',
        lang_from: 'en', lang_to: 'id',
    });

    const [engine, setEngine] = useState('google_free');
    const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_key') || '');
    const [libreUrl, setLibreUrl] = useState(localStorage.getItem('libre_url') || 'http://localhost:5000');
    const [libreStatus, setLibreStatus] = useState('idle');

    const [skipLyrics, setSkipLyrics] = useState(true);
    const [skipSfx, setSkipSfx] = useState(true);

    const [phase, setPhase] = useState('idle'); // idle | translating | error
    const [progress, setProgress] = useState({ processed: 0, total: 0, logs: [] });
    const [submitError, setSubmitError] = useState('');
    const [projectId, setProjectId] = useState(null);

    const [tipIdx, setTipIdx] = useState(0);
    const [projects, setProjects] = useState([]);
    const [showNewProject, setShowNewProject] = useState(false);

    const fetchProjects = async () => {
        try {
            const res = await fetch(`${API}/api/projects`);
            if (res.ok) setProjects(await res.json());
        } catch { }
    };

    const handleDeleteProject = async (e, pid) => {
        e.stopPropagation();
        if (!confirm(t.confirmDelete)) return;
        await fetch(`${API}/api/projects/${pid}`, { method: 'DELETE' });
        setProjects(prev => prev.filter(p => p.id !== pid));
    };

    useEffect(() => {
        const interval = setInterval(() => setTipIdx(i => (i + 1) % tipsList.length), 4000);
        fetchProjects();
        return () => clearInterval(interval);
    }, [uiLang, tipsList.length]);

    const handleFile = useCallback((f) => {
        setFileError('');
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.srt')) {
            setFileError(t.onlySrt);
            setFile(null);
            setLineCount(0);
            return;
        }
        setFile(f);
        setProjectId(null);
        setForm(prev => ({ ...prev, title: prev.title || parseTitle(f.name) }));

        // Count lines roughly
        const reader = new FileReader();
        reader.onload = (e) => {
            const blocks = e.target.result.trim().split(/\r?\n\r?\n/);
            setLineCount(blocks.length);
        };
        reader.readAsText(f);
    }, []);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    const testLibre = async () => {
        setLibreStatus('testing');
        try {
            const res = await fetch(`${libreUrl}/languages`, { signal: AbortSignal.timeout(4000) });
            setLibreStatus(res.ok ? 'ok' : 'fail');
        } catch {
            setLibreStatus('fail');
        }
    };

    const isSubmitDisabled =
        !file ||
        phase === 'translating' ||
        (engine === 'gemini' && !geminiKey.trim()) ||
        (engine === 'libretranslate' && !libreUrl.trim());

    const isManual = engine === 'manual';

    const listenProgress = (jobId, projectId) => {
        const es = new EventSource(`${API}/api/translate/${jobId}/progress`);
        es.addEventListener('progress', (e) => {
            const p = new URLSearchParams(e.data);
            setProgress(prev => ({
                ...prev,
                processed: parseInt(p.get('processed') || '0'),
                total: parseInt(p.get('total') || '0'),
            }));
        });
        es.addEventListener('done', (e) => {
            const p = new URLSearchParams(e.data);
            es.close();
            if (p.get('status') === 'error') {
                setPhase('error');
                setSubmitError(p.get('error') || 'Terjemahan gagal di sisi server.');
            } else {
                navigate(`/editor/${projectId}`);
            }
        });
        es.onmessage = (e) => {
            if (e.data) setProgress(prev => ({ ...prev, logs: [...prev.logs, e.data] }));
        };
        es.onerror = () => {
            es.close();
            setPhase('error');
            setSubmitError('Koneksi ke server terputus saat translating.');
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Guard: jangan izinkan submit ganda
        if (phase === 'translating') return;
        if (!file) { setSubmitError(t.errNoFile); return; }

        setSubmitError('');
        setProgress({ processed: 0, total: 0, logs: [] });
        setProjectId(null);

        if (engine === 'gemini') localStorage.setItem('gemini_key', geminiKey);
        if (engine === 'libretranslate') localStorage.setItem('libre_url', libreUrl);

        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', form.title || parseTitle(file.name));
        fd.append('genre', form.genre);
        fd.append('char_context', form.char_context);
        fd.append('lang_from', form.lang_from);
        fd.append('lang_to', form.lang_to);
        fd.append('engine', engine);
        fd.append('gemini_api_key', engine === 'gemini' ? geminiKey : '');
        fd.append('skip_lyrics', skipLyrics);
        fd.append('skip_sfx', skipSfx);

        setPhase('translating');

        try {
            const res = await fetch(`${API}/api/translate`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                setPhase('error');
                setSubmitError(data.detail || `Error ${res.status}`);
                return;
            }
            if (!data.job_id) {
                navigate(`/editor/${data.project_id}`);
                return;
            }
            setProjectId(data.project_id);
            setProgress(prev => ({ ...prev, total: data.total }));
            listenProgress(data.job_id, data.project_id);
        } catch (err) {
            setPhase('error');
            setSubmitError(`Tidak bisa terhubung ke server: ${err.message}`);
        }
    };

    const handleResume = async () => {
        if (!projectId) return;
        setSubmitError('');
        setPhase('translating');
        try {
            const fd = new FormData();
            fd.append('gemini_api_key', engine === 'gemini' ? geminiKey : '');

            const res = await fetch(`${API}/api/translate/${projectId}/resume`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                setPhase('error');
                setSubmitError(data.detail || `Error ${res.status}`);
                return;
            }
            if (!data.job_id) {
                navigate(`/editor/${data.project_id}`);
                return;
            }
            listenProgress(data.job_id, data.project_id);
        } catch (err) {
            setPhase('error');
            setSubmitError(`Koneksi terputus: ${err.message}`);
        }
    };

    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    const [showAllProjects, setShowAllProjects] = useState(false);
    const visibleProjects = showAllProjects ? projects : projects.slice(0, 5);

    return (
        <div className="upload-container">
            {/* Context Actions / Top Utilities */}
            <div style={{ position: 'absolute', top: 24, right: 36, display: 'flex', gap: 6, background: 'rgba(12,12,14,0.8)', padding: 6, borderRadius: 10, border: '1px solid #27272a', zIndex: 10 }}>
                <button
                    type="button"
                    onClick={() => { setUiLang('en'); localStorage.setItem('ui_lang', 'en'); }}
                    style={{ background: uiLang === 'en' ? '#f59e0b' : 'transparent', color: uiLang === 'en' ? '#09090b' : '#71717a', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer', transition: 'all 0.2s' }}
                >EN</button>
                <button
                    type="button"
                    onClick={() => { setUiLang('id'); localStorage.setItem('ui_lang', 'id'); }}
                    style={{ background: uiLang === 'id' ? '#f59e0b' : 'transparent', color: uiLang === 'id' ? '#09090b' : '#71717a', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 700, padding: '4px 8px', cursor: 'pointer', transition: 'all 0.2s' }}
                >ID</button>
            </div>

            <style>{`
                .upload-container {
                    display: flex; height: 100vh; overflow: hidden;
                    background: #09090b; color: #d4d4d8; font-family: var(--mono);
                }
                .upload-left {
                    flex: 0 0 34%; max-width: 34%; height: 100vh;
                    display: flex; flex-direction: column;
                    box-sizing: border-box; border-right: 1px solid #18181b;
                    position: sticky; top: 0; overflow: hidden;
                }
                .upload-left-header {
                    padding: 28px 24px 20px; flex-shrink: 0;
                    border-bottom: 1px solid #111113;
                }
                .upload-left-scroll {
                    flex: 1; overflow-y: auto; padding: 16px 16px 0;
                }
                .upload-left-footer {
                    padding: 14px 20px; flex-shrink: 0;
                    border-top: 1px solid #111113;
                }
                .upload-right {
                    flex: 1; height: 100vh; overflow-y: auto;
                    padding: 32px 36px;
                    box-sizing: border-box;
                }
                .upload-form {
                    display: flex; flex-direction: column; gap: 20px; width: 100%; max-width: 640px; margin: 0 auto;
                }
                .upload-card {
                    background: rgba(24, 24, 27, 0.8); border: 1px solid #27272a; border-radius: 12px;
                    padding: 20px; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
                }
                .upload-label {
                    font-size: 11px; font-weight: 600; color: #52525b; margin-left: 2px; margin-bottom: 5px; display: block;
                    text-transform: uppercase; letter-spacing: 0.5px;
                }
                .upload-input {
                    width: 100%; padding: 10px 14px; background: #0c0c0e;
                    border: 1px solid #27272a; color: #fff; border-radius: 8px;
                    font-size: 14px; box-sizing: border-box; outline: none; transition: all 0.2s;
                }
                .upload-input:focus { border-color: rgba(245, 158, 11, 0.5); box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.1); }
                .upload-input::placeholder { color: #3f3f46; }
                
                .upload-grid3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
                @media (min-width: 768px) {
                    .upload-grid3 { grid-template-columns: 1fr 1fr; }
                    .title-span { grid-column: span 2; }
                }

                .engine-tabs {
                    display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; background: #0c0c0e; padding: 4px;
                    border-radius: 8px; border: 1px solid #27272a;
                }
                .engine-tab {
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    padding: 8px 10px; font-size: 13px; font-weight: 500; cursor: pointer;
                    border-radius: 6px; transition: all 0.15s; border: none;
                }
                .engine-tab.active { background: #f59e0b; color: #09090b; }
                .engine-tab.inactive { background: transparent; color: #71717a; }
                .engine-tab.inactive:hover { background: #18181b; color: #e4e4e7; }
                
                @media (max-width: 900px) {
                    .upload-container { flex-direction: column; height: auto; overflow: visible; }
                    .upload-left { flex: none; width: 100%; max-width: 100%; height: auto; padding: 28px 24px; position: relative; border-right: none; border-bottom: 1px solid #18181b; }
                    .upload-right { flex: none; width: 100%; height: auto; overflow-y: visible; padding: 24px; }
                    .engine-tabs { grid-template-columns: 1fr 1fr; }
                }

                .drop-zone {
                    width: 100%; min-height: 220px; flex-shrink: 0; position: relative;
                    border: 1.5px dashed #27272a; border-radius: 14px; background: rgba(18,18,20,0.6);
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.25s; padding: 28px;
                }
                .drop-zone:hover { border-color: rgba(245, 158, 11, 0.4); background: rgba(24,24,27,0.9); }
                .drop-zone.active { border-color: #f59e0b; background: rgba(245, 158, 11, 0.06); }
                .drop-zone.error { border-color: #ef4444; background: rgba(239, 68, 68, 0.04); }

                .proj-card {
                    display: flex; align-items: center; gap: 12px;
                    background: #111113; border: 1px solid #1e1e22;
                    border-radius: 10px; padding: 11px 14px; cursor: pointer;
                    transition: border-color 0.15s, background 0.15s;
                }
                .proj-card:hover { border-color: rgba(245,158,11,0.35); background: #161618; }

                .btn-submit {
                    width: 100%; border: none; border-radius: 12px; padding: 16px;
                    font-size: 16px; font-weight: 700; background: #f59e0b; color: #09090b;
                    cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
                    position: relative; overflow: hidden; box-shadow: 0 8px 20px rgba(245, 158, 11, 0.2);
                }
                .btn-submit:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 24px rgba(245, 158, 11, 0.3); background: #fbbf24; }
                .btn-submit:disabled { opacity: 0.4; cursor: not-allowed; }
                
                .checkbox-box {
                    width: 18px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: center;
                    border: 1px solid #3f3f46; background: #09090b; transition: all 0.15s; flex-shrink: 0;
                }
                .checkbox-box.checked { background: #f59e0b; border-color: #f59e0b; color: #09090b; }
                .section-divider {
                    display: flex; align-items: center; gap: 12px; margin: 24px 0 20px;
                    max-width: 640px; margin-left: auto; margin-right: auto;
                }
                .section-divider::before, .section-divider::after {
                    content: ''; flex: 1; height: 1px; background: #1e1e22;
                }
            `}</style>

            {/* ── LEFT PANEL ── */}
            <div className="upload-left">
                {/* Header: brand */}
                <div className="upload-left-header">
                    <div style={{ fontSize: 22, color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <SubtiToolLogo size={24} /> SubtiTool
                    </div>
                    <p style={{ color: '#3f3f46', margin: '3px 0 0', fontSize: 11 }}>{t.subtitleProcess}</p>
                </div>

                {/* Scrollable project list */}
                <div className="upload-left-scroll">
                    {projects.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.35 }}>
                            <FolderOpen size={28} color="#52525b" />
                            <p style={{ margin: 0, fontSize: 12, color: '#52525b', textAlign: 'center' }}>{t.noProjects}</p>
                        </div>
                    ) : (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: '#3f3f46', textTransform: 'uppercase', letterSpacing: 1 }}>{t.savedProjects}</span>
                                <span style={{ fontSize: 10, background: 'rgba(245,158,11,0.1)', color: '#78716c', padding: '1px 6px', borderRadius: 20 }}>{projects.length}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {projects.map(p => {
                                    const total = p.stats?.total || 1;
                                    const approved = p.stats?.approved || 0;
                                    const skipped = p.stats?.skipped || 0;
                                    const pct = Math.round(((approved + skipped) / total) * 100);
                                    const timeAgo = p.created_at ? getTimeAgo(new Date(p.created_at)) : '';
                                    return (
                                        <div
                                            key={p.id}
                                            onClick={() => navigate(`/editor/${p.id}`)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 10,
                                                padding: '9px 10px', borderRadius: 8, cursor: 'pointer',
                                                border: '1px solid transparent', transition: 'all 0.12s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = '#111113'; e.currentTarget.style.borderColor = '#1e1e22'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                                        >
                                            {/* Mini progress ring */}
                                            <div style={{ position: 'relative', flexShrink: 0, width: 30, height: 30 }}>
                                                <svg width="30" height="30" viewBox="0 0 30 30" style={{ transform: 'rotate(-90deg)' }}>
                                                    <circle cx="15" cy="15" r="11" fill="none" stroke="#27272a" strokeWidth="2" />
                                                    <circle cx="15" cy="15" r="11" fill="none"
                                                        stroke={pct >= 100 ? '#10b981' : '#f59e0b'}
                                                        strokeWidth="2"
                                                        strokeDasharray={`${2 * Math.PI * 11}`}
                                                        strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: pct >= 100 ? '#10b981' : '#71717a' }}>
                                                    {pct}%
                                                </span>
                                            </div>
                                            {/* Info */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 13, fontWeight: 600, color: '#d4d4d8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>
                                                    {p.title || t.untitled}
                                                </div>
                                                <div style={{ fontSize: 11, color: '#3f3f46', display: 'flex', gap: 5, alignItems: 'center' }}>
                                                    <span style={{ color: '#52525b' }}>{p.lang_from?.toUpperCase()} → {p.lang_to?.toUpperCase()}</span>
                                                    <span>·</span>
                                                    <span>{timeAgo} {t.timeAgo}</span>
                                                </div>
                                            </div>
                                            {/* Delete */}
                                            <button
                                                onClick={e => handleDeleteProject(e, p.id)}
                                                style={{ display: 'none', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, background: 'transparent', border: 'none', color: '#3f3f46', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                                                className="proj-del-btn"
                                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = '#3f3f46'; }}
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer: tip */}
                <div className="upload-left-footer">
                    <p style={{ margin: 0, fontSize: 10, color: '#3f3f46', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 5, lineHeight: 1.5 }}>
                        <Lightbulb size={11} color="#52525b" style={{ flexShrink: 0, marginTop: 1 }} />
                        {tipsList[tipIdx]}
                    </p>
                </div>
            </div>

            {/* ── RIGHT PANEL: always shows form ── */}
            <div className="upload-right">
                <form className="upload-form" onSubmit={handleSubmit}>

                    {/* File Drop Zone */}
                    <div>
                        <label className="upload-label">{t.fileLabel}</label>
                        {!file ? (
                            <div
                                className={`drop-zone ${dragOver ? 'active' : ''} ${fileError ? 'error' : ''}`}
                                style={{ minHeight: 120, padding: '20px 24px', flexDirection: 'row', gap: 16 }}
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={handleDrop}
                                onClick={() => fileRef.current?.click()}
                            >
                                <input ref={fileRef} type="file" accept=".srt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                                <UploadCloud size={24} color={fileError ? '#ef4444' : '#52525b'} style={{ flexShrink: 0 }} />
                                <div>
                                    <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600, color: '#d4d4d8' }}>{t.dragDrop1}</p>
                                    <p style={{ margin: 0, fontSize: 11, color: '#52525b' }}>{t.dragDrop2.replace('klik', '')} <span style={{ color: '#f59e0b', cursor: 'pointer' }}>{t.dragDrop2.includes('klik') ? 'klik ' + t.dragDrop2.split('klik ')[1] : t.dragDrop2}</span></p>
                                    {fileError && <p style={{ color: '#ef4444', fontSize: 11, margin: '6px 0 0' }}>{fileError}</p>}
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: '#0c0c0e', border: '1px solid #27272a', borderRadius: 8, display: 'flex', alignItems: 'center', padding: '10px 14px', gap: 10 }}>
                                <FileText size={16} color="#10b981" style={{ flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 13, color: '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</p>
                                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#52525b' }}>{(file.size / 1024).toFixed(1)} KB &middot; ~{lineCount} {t.lines}</p>
                                </div>
                                <button type="button" onClick={() => { setFile(null); setFileError(''); }} style={{ background: 'transparent', border: '1px solid #27272a', padding: '4px', borderRadius: 4, color: '#52525b', cursor: 'pointer', display: 'flex' }}>
                                    <XCircle size={14} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Context Grid */}
                    <div className="upload-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <Settings2 size={20} color="#f59e0b" />
                            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>{t.contextLabel}</h2>
                        </div>
                        <div className="upload-grid3">
                            <div className="title-span pl-1">
                                <label className="upload-label">{t.titleLabel}</label>
                                <input className="upload-input" placeholder={t.titlePlaceholder} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                            </div>
                            <div>
                                <label className="upload-label">{t.genreLabel}</label>
                                <input className="upload-input" placeholder={t.genrePlaceholder} value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} />
                            </div>
                            <div>
                                <label className="upload-label">{t.charLabel}</label>
                                <input className="upload-input" placeholder={t.charPlaceholder} value={form.char_context} onChange={e => setForm(f => ({ ...f, char_context: e.target.value }))} />
                            </div>
                        </div>
                    </div>

                    {/* Language Selector */}
                    <div className="upload-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                            <Globe size={20} color="#f59e0b" />
                            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: 1 }}>{t.translationLabel}</h2>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <select className="upload-input" style={{ appearance: 'none', cursor: 'pointer' }} value={form.lang_from} onChange={e => setForm(f => ({ ...f, lang_from: e.target.value }))}>
                                    {LANG_FROM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                    <ChevronRight size={16} color="#71717a" style={{ transform: 'rotate(90deg)' }} />
                                </div>
                            </div>

                            <div style={{ background: '#09090b', padding: 8, borderRadius: 8, border: '1px solid #27272a', color: '#52525b' }}>
                                <ChevronRight size={16} />
                            </div>

                            <div style={{ flex: 1, position: 'relative' }}>
                                <select className="upload-input" style={{ appearance: 'none', cursor: 'pointer' }} value={form.lang_to} onChange={e => setForm(f => ({ ...f, lang_to: e.target.value }))}>
                                    {LANG_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                                    <ChevronRight size={16} color="#71717a" style={{ transform: 'rotate(90deg)' }} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Engine Selector */}
                    <div className="upload-card">
                        <label className="upload-label" style={{ marginBottom: 8, fontSize: 13, textTransform: 'none', color: '#71717a' }}>{t.engineLabel}</label>
                        <div className="engine-tabs">
                            {ENGINES.map(eng => (
                                <button
                                    key={eng.value} type="button"
                                    className={`engine-tab ${engine === eng.value ? 'active' : 'inactive'}`}
                                    onClick={() => setEngine(eng.value)}
                                >
                                    {eng.icon} <span>{eng.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Sub-options for Gemini */}
                        {engine === 'gemini' && (
                            <div style={{ marginTop: 12, background: 'rgba(245,158,11,0.05)', padding: '16px', borderLeft: '2px solid #f59e0b', borderRadius: '0 12px 12px 0' }}>
                                <input
                                    className="upload-input" type="password" placeholder="Gemini API Key (AIza...)"
                                    value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                                    style={{ borderColor: !geminiKey.trim() ? '#ef4444' : '#27272a' }}
                                />
                                {!geminiKey.trim() && <p style={{ fontSize: 11, color: '#ef4444', margin: '8px 0 0', fontWeight: 500 }}>{t.engineGeminiReq}</p>}
                            </div>
                        )}

                        {/* Sub-options for LibreTranslate */}
                        {engine === 'libretranslate' && (
                            <div style={{ marginTop: 12, background: 'rgba(139,92,246,0.05)', padding: '16px', borderLeft: '2px solid #8b5cf6', borderRadius: '0 12px 12px 0', display: 'flex', gap: 12, alignItems: 'center' }}>
                                <input
                                    className="upload-input" placeholder="URL (http://localhost:5000)"
                                    value={libreUrl} onChange={e => { setLibreUrl(e.target.value); setLibreStatus('idle'); }}
                                />
                                <button type="button" onClick={testLibre} style={{ background: '#27272a', border: '1px solid #3f3f46', color: '#e4e4e7', padding: '0 16px', borderRadius: '8px', height: 44, fontSize: 13, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }}>
                                    {libreStatus === 'testing' ? '...' : 'Test URL'}
                                </button>
                                {libreStatus === 'ok' && <CheckCircle2 size={16} color="#10b981" style={{ flexShrink: 0 }} />}
                                {libreStatus === 'fail' && <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />}
                            </div>
                        )}
                    </div>

                    {/* Section 3: Auto-Skip & Submit Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(250px, 1fr) 1fr', gap: 16 }}>

                        {/* Auto-Skip Preferences */}
                        <div className="upload-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245, 158, 11, 0.8)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, display: 'block' }}>
                                {t.autoSkipLabel}
                            </label>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', group: 'true' }}>
                                    <div className={`checkbox-box ${skipLyrics ? 'checked' : ''}`}>
                                        <svg style={{ width: 14, height: 14, opacity: skipLyrics ? 1 : 0, transition: 'opacity 0.2s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <input type="checkbox" style={{ display: 'none' }} checked={skipLyrics} onChange={e => setSkipLyrics(e.target.checked)} />
                                    <span style={{ fontSize: 14, color: skipLyrics ? '#fff' : '#d4d4d8', display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s' }}>
                                        <Music size={16} color="#71717a" />
                                        {t.skipLyricsOpt}
                                    </span>
                                </label>

                                <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', group: 'true' }}>
                                    <div className={`checkbox-box ${skipSfx ? 'checked' : ''}`}>
                                        <svg style={{ width: 14, height: 14, opacity: skipSfx ? 1 : 0, transition: 'opacity 0.2s' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <input type="checkbox" style={{ display: 'none' }} checked={skipSfx} onChange={e => setSkipSfx(e.target.checked)} />
                                    <span style={{ fontSize: 14, color: skipSfx ? '#fff' : '#d4d4d8', display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s' }}>
                                        <VolumeX size={16} color="#71717a" />
                                        {t.skipSfxOpt}
                                    </span>
                                </label>
                            </div>
                        </div>

                        {/* Error Box */}
                        {phase === 'error' && (
                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', padding: '10px 14px', borderRadius: 6, color: 'var(--red)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: 'span 2' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <AlertTriangle size={14} /> {submitError}
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => { setPhase('idle'); setSubmitError(''); }} style={{ background: 'transparent', color: '#fca5a5', border: '1px solid currentColor', padding: '4px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
                                        {uiLang === 'en' ? 'Cancel/Change' : 'Batal/Ubah'}
                                    </button>
                                    <button type="button" onClick={projectId ? handleResume : () => { setPhase('idle'); setSubmitError(''); }} style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
                                        {projectId ? 'Resume' : (uiLang === 'en' ? 'Close' : 'Tutup')}
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Submit Button Area */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            <button
                                type={phase === 'idle' ? 'submit' : 'button'}
                                disabled={isSubmitDisabled}
                                className="btn-submit"
                                style={{
                                    height: '100%',
                                    background: phase === 'translating' ? '#27272a' : (isManual ? '#3f3f46' : '#f59e0b'),
                                    color: phase === 'translating' ? '#f59e0b' : (isManual ? '#fff' : '#09090b'),
                                    opacity: isSubmitDisabled ? 0.5 : 1,
                                    cursor: isSubmitDisabled ? 'not-allowed' : phase === 'translating' ? 'wait' : 'pointer',
                                    padding: '24px 32px'
                                }}
                            >
                                {phase === 'translating' && (
                                    <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: 'rgba(245, 158, 11, 0.15)', transition: 'width 0.4s ease' }} />
                                )}

                                {phase === 'translating' ? (
                                    <>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, zIndex: 1 }}>
                                            <Loader2 size={24} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> {uiLang === 'en' ? 'Translating...' : 'Mentranslate...'}
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: 500, color: 'rgba(245, 158, 11, 0.6)', zIndex: 1 }}>{progress.processed} / {progress.total} {t.lines} ({pct}%)</span>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 }}>
                                            {isManual ? (uiLang === 'en' ? 'Open Editor' : 'Buka Editor') : t.btnStartEngine}
                                            <ChevronRight size={20} />
                                        </span>
                                        <span style={{ fontSize: 12, fontWeight: 500, color: isManual ? 'rgba(255,255,255,0.4)' : 'rgba(120, 53, 15, 0.6)', zIndex: 1 }}>
                                            {isManual ? (uiLang === 'en' ? 'Manual Mode' : 'Mode Manual') : t.btnStartManual}
                                        </span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div> {/* End of Auto-Skip & Submit Grid */}

                    {phase === 'translating' && progress.logs.length > 0 && (
                        <div style={{ textAlign: 'center', fontSize: 10, color: '#a1a1aa', marginTop: -6 }}>
                            {progress.logs[progress.logs.length - 1]}
                        </div>
                    )}

                </form>
            </div>

        </div>
    );
}

function getTimeAgo(date) {
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    const lang = localStorage.getItem('ui_lang') || 'en';

    if (diff < 60) return lang === 'en' ? 'just now' : 'baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} ${lang === 'en' ? 'm' : 'mnt'}`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ${lang === 'en' ? 'h' : 'jam'}`;
    return `${Math.floor(diff / 86400)} ${lang === 'en' ? 'd' : 'hari'}`;
}
