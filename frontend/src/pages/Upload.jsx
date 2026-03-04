import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Hexagon, Edit3, Zap, Sparkles, Lock,
    XCircle, CheckCircle2, FileText, AlertTriangle,
    Circle, Loader2, RotateCcw, ArrowRight, UploadCloud
} from 'lucide-react';

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
    { value: 'manual', icon: <Edit3 size={12} />, label: 'Manual' },
    { value: 'google_free', icon: <Zap size={12} />, label: 'Google Free' },
    { value: 'gemini', icon: <Sparkles size={12} />, label: 'Gemini AI' },
    { value: 'libretranslate', icon: <Lock size={12} />, label: 'LibreTranslate' },
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

const TIPS = [
    "Gunakan J/K untuk navigasi cepat di editor.",
    "Tekan S untuk skip baris lirik otomatis (di editor).",
    "Gunakan Ctrl+H untuk Find & Replace global.",
    "Batas nyaman membaca adalah maksimal 17 CPS (Characters Per Second).",
    "Pintasan Shift+S bisa mereplace semua kandidat lirik/SFX serentak."
];

export default function UploadPage() {
    const navigate = useNavigate();
    const fileRef = useRef(null);

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

    const [tipIdx, setTipIdx] = useState(0);

    useEffect(() => {
        const t = setInterval(() => setTipIdx(i => (i + 1) % TIPS.length), 4000);
        return () => clearInterval(t);
    }, []);

    const handleFile = useCallback((f) => {
        setFileError('');
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.srt')) {
            setFileError('Hanya file .srt yang diterima.');
            setFile(null);
            setLineCount(0);
            return;
        }
        setFile(f);
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
        setSubmitError('');
        setProgress({ processed: 0, total: 0, logs: [] });

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
            setProgress(prev => ({ ...prev, total: data.total }));
            listenProgress(data.job_id, data.project_id);
        } catch (err) {
            setPhase('error');
            setSubmitError(`Tidak bisa terhubung ke server: ${err.message}`);
        }
    };

    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    return (
        <div className="upload-container">
            <style>{`
                .upload-container {
                    display: flex; height: 100vh; overflow: hidden;
                    background: var(--bg); color: var(--text);
                }
                .upload-left {
                    width: 40%; background: #0c0c0e; border-right: 1px solid var(--border);
                    display: flex; flexDirection: column; padding: 32px;
                    justify-content: space-between;
                }
                .upload-right {
                    width: 60%; display: flex; flexDirection: column; padding: 32px;
                    overflow-y: auto; background: var(--bg);
                }
                .upload-form {
                    display: flex; flexDirection: column; gap: 16px; height: 100%; maxWidth: 640px; margin: 0 auto; width: 100%;
                }
                .upload-label {
                    font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
                    color: var(--amber); margin-bottom: 4px; display: block; font-weight: 700;
                }
                .upload-input {
                    width: 100%; height: 36px; padding: 0 12px; background: var(--bg-1);
                    border: 1px solid var(--border); color: #fff; border-radius: 4px;
                    font-size: 13px; box-sizing: border-box; outline: none; transition: border 0.2s;
                }
                .upload-input:focus { border-color: var(--amber); }
                .upload-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
                .engine-tabs {
                    display: flex; gap: 4px; background: var(--bg-1); padding: 4px;
                    border-radius: 6px; border: 1px solid var(--border);
                }
                .engine-tab {
                    flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
                    height: 32px; font-size: 11px; font-weight: 600; cursor: pointer;
                    border-radius: 4px; transition: all 0.2s; border: none;
                }
                .engine-tab.active { background: var(--amber); color: #000; }
                .engine-tab.inactive { background: transparent; color: var(--text-muted); }
                .engine-tab.inactive:hover { background: var(--bg-2); color: var(--text); }
                
                @media (max-width: 768px) {
                    .upload-container { flex-direction: column; height: auto; overflow: visible; }
                    .upload-left, .upload-right { width: 100%; padding: 20px; }
                    .upload-left { min-height: 50vh; border-right: none; border-bottom: 1px solid var(--border); }
                    .upload-grid3 { grid-template-columns: 1fr; }
                    .engine-tabs { flex-wrap: wrap; }
                }

                .drop-zone {
                    flex: 1; border: 2px dashed var(--border); border-radius: 8px;
                    display: flex; flex-direction: column; align-items: center; justify-content: center;
                    cursor: pointer; transition: all 0.2s; text-align: center;
                }
                .drop-zone:hover { border-color: var(--amber); background: rgba(245,158,11,0.03); }
                .drop-zone.active { border-color: var(--amber); background: rgba(245,158,11,0.08); }
                .drop-zone.error { border-color: var(--red); background: rgba(239,68,68,0.05); }

                .btn-submit {
                    height: 44px; width: 100%; border: none; border-radius: 6px;
                    font-size: 14px; font-weight: 800; font-family: var(--display);
                    cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
                    position: relative; overflow: hidden;
                }
            `}</style>

            {/* ── LEFT PANEL ── */}
            <div className="upload-left">
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{ fontSize: 28, color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: -1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Hexagon size={24} fill="currentColor" /> SubtiTool
                    </div>
                    <p style={{ color: 'var(--text-muted)', margin: '4px 0 0', fontSize: 12 }}>Next-Gen AI Subtitle Workflow</p>
                </div>

                {!file ? (
                    <div
                        className={`drop-zone ${dragOver ? 'active' : ''} ${fileError ? 'error' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                    >
                        <input ref={fileRef} type="file" accept=".srt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                        <UploadCloud size={40} color={fileError ? 'var(--red)' : 'var(--amber)'} style={{ marginBottom: 16, opacity: 0.8 }} />
                        <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--text)' }}>
                            Drag & Drop file SRT ke area ini
                        </p>
                        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-dim)' }}>Atau klik untuk browse file dari komputer</p>
                        {fileError && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 12, fontWeight: 600 }}>{fileError}</p>}
                    </div>
                ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: 20, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <CheckCircle2 size={36} color="var(--green)" style={{ marginBottom: 12 }} />
                            <h3 style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--green)', textAlign: 'center', wordBreak: 'break-all' }}>{file.name}</h3>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 20 }}>
                                <span>{(file.size / 1024).toFixed(1)} KB</span>
                                <span>&bull;</span>
                                <span>~{lineCount} baris</span>
                            </div>
                            <button onClick={() => { setFile(null); setFileError(''); }} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 4, color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s' }}>
                                Ganti File SRT
                            </button>
                        </div>
                    </div>
                )}

                <div style={{ marginTop: 20, textAlign: 'center', height: 20 }}>
                    <p style={{ margin: 0, fontSize: 11, color: '#555', fontStyle: 'italic', transition: 'opacity 0.3s' }}>
                        💡 Tip: {TIPS[tipIdx]}
                    </p>
                </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="upload-right">
                <form className="upload-form" onSubmit={handleSubmit}>

                    {/* Context Grid */}
                    <div>
                        <label className="upload-label">Konteks Film</label>
                        <div className="upload-grid3">
                            <input className="upload-input" placeholder="Judul (Mis. Breaking Bad S2E1)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
                            <input className="upload-input" placeholder="Genre (Crime, Drama)" value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} />
                            <input className="upload-input" placeholder="Karakter Utama (Walter, Jesse)" value={form.char_context} onChange={e => setForm(f => ({ ...f, char_context: e.target.value }))} />
                        </div>
                    </div>

                    {/* Language Selector */}
                    <div>
                        <label className="upload-label">Bahasa Asal & Tujuan</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-1)', padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
                            <select className="upload-input" style={{ border: 'none', background: 'var(--bg-2)' }} value={form.lang_from} onChange={e => setForm(f => ({ ...f, lang_from: e.target.value }))}>
                                {LANG_FROM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                            <ArrowRight size={14} color="var(--text-muted)" />
                            <select className="upload-input" style={{ border: 'none', background: 'var(--bg-2)' }} value={form.lang_to} onChange={e => setForm(f => ({ ...f, lang_to: e.target.value }))}>
                                {LANG_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Engine Selector */}
                    <div>
                        <label className="upload-label">Engine Terjemahan</label>
                        <div className="engine-tabs">
                            {ENGINES.map(eng => (
                                <button
                                    key={eng.value} type="button"
                                    className={`engine-tab ${engine === eng.value ? 'active' : 'inactive'}`}
                                    onClick={() => setEngine(eng.value)}
                                >
                                    {eng.icon} {eng.label}
                                </button>
                            ))}
                        </div>

                        {/* Sub-options for Gemini */}
                        {engine === 'gemini' && (
                            <div style={{ marginTop: 8, background: 'rgba(245,158,11,0.05)', padding: '10px 12px', borderLeft: '2px solid var(--amber)', borderRadius: '0 4px 4px 0' }}>
                                <input
                                    className="upload-input" type="password" placeholder="Gemini API Key (AIza...)"
                                    value={geminiKey} onChange={e => setGeminiKey(e.target.value)}
                                    style={{ height: 32, borderColor: !geminiKey.trim() ? 'var(--red)' : 'var(--border)' }}
                                />
                                {!geminiKey.trim() && <p style={{ fontSize: 10, color: 'var(--red)', margin: '4px 0 0' }}>API key wajib diisi untuk engine Gemini.</p>}
                            </div>
                        )}

                        {/* Sub-options for LibreTranslate */}
                        {engine === 'libretranslate' && (
                            <div style={{ marginTop: 8, background: 'rgba(139,92,246,0.05)', padding: '10px 12px', borderLeft: '2px solid #8b5cf6', borderRadius: '0 4px 4px 0', display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    className="upload-input" placeholder="URL (http://localhost:5000)"
                                    value={libreUrl} onChange={e => { setLibreUrl(e.target.value); setLibreStatus('idle'); }}
                                    style={{ height: 32, flex: 1 }}
                                />
                                <button type="button" onClick={testLibre} style={{ background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '0 12px', borderRadius: 4, height: 32, fontSize: 11, cursor: 'pointer' }}>
                                    {libreStatus === 'testing' ? '...' : 'Test'}
                                </button>
                                {libreStatus === 'ok' && <Circle size={10} fill="var(--green)" color="var(--green)" />}
                                {libreStatus === 'fail' && <Circle size={10} fill="var(--red)" color="var(--red)" />}
                            </div>
                        )}
                    </div>

                    {/* Auto-Skip Configuration */}
                    <div>
                        <label className="upload-label">Auto-Skip (Hemat API / Waktu)</label>
                        <div style={{ display: 'flex', gap: 20, background: 'var(--bg-1)', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={skipLyrics} onChange={e => setSkipLyrics(e.target.checked)} style={{ accentColor: 'var(--amber)', width: 14, height: 14 }} />
                                Skip baris nyanyian (♪)
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text)', cursor: 'pointer' }}>
                                <input type="checkbox" checked={skipSfx} onChange={e => setSkipSfx(e.target.checked)} style={{ accentColor: 'var(--amber)', width: 14, height: 14 }} />
                                Skip Sound Effects ([Music])
                            </label>
                        </div>
                    </div>

                    {/* Spacer to push submit button down */}
                    <div style={{ flex: 1 }} />

                    {/* Error Box */}
                    {phase === 'error' && (
                        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', padding: '10px 14px', borderRadius: 6, color: 'var(--red)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <AlertTriangle size={14} /> {submitError}
                            </div>
                            <button type="button" onClick={() => { setPhase('idle'); setSubmitError(''); }} style={{ background: 'var(--red)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer' }}>
                                Retry
                            </button>
                        </div>
                    )}

                    {/* Submit Button Area */}
                    <button
                        type={phase === 'idle' ? 'submit' : 'button'}
                        disabled={isSubmitDisabled}
                        className="btn-submit"
                        style={{
                            background: phase === 'translating' ? 'var(--bg-2)' : (isManual ? '#4b5563' : 'var(--amber)'),
                            color: phase === 'translating' ? 'var(--amber)' : (isManual ? '#fff' : '#000'),
                            opacity: isSubmitDisabled ? 0.5 : 1,
                            cursor: isSubmitDisabled ? 'not-allowed' : phase === 'translating' ? 'wait' : 'pointer'
                        }}
                    >
                        {phase === 'translating' && (
                            <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${pct}%`, background: 'rgba(245, 158, 11, 0.15)', transition: 'width 0.4s ease' }} />
                        )}

                        {phase === 'translating' ? (
                            <><Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Mentranslate... {progress.processed} / {progress.total} baris ({pct}%)</>
                        ) : isManual ? (
                            <><Edit3 size={16} /> Buka Editor →</>
                        ) : (
                            <><Sparkles size={16} /> Mulai Translate →</>
                        )}
                    </button>
                    {phase === 'translating' && progress.logs.length > 0 && (
                        <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', marginTop: -6 }}>
                            {progress.logs[progress.logs.length - 1]}
                        </div>
                    )}
                </form>
            </div>
            {/* Inline CSS Keyframes */}
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
