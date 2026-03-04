import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const API = 'http://localhost:8000';

// Strip release tags — jalankan SEBELUM replace titik agar H.264, WEB.DL match benar
const RELEASE_TAGS = /[._-](1080p|720p|480p|2160p|4K|AMZN|WEB[_.-]?DL|WEBDL|WEBRip|BluRay|BDRip|DVDRip|DDP?[\d.]*|Atmos|H[._]?264|H[._]?265|HEVC|HDR10?[+]?|SDR|DTS[-.]?HD|DTS|AAC[\d.]*|x264|x265|NF|HULU|DSNP|ATVP|MAX|PCOK|REPACK|PROPER|IMAX|REMUX)(?=[._-]|$)/gi;

function parseTitle(filename) {
    let name = filename.replace(/\.(srt|txt)$/i, '');

    // Loop sampai tidak ada tag tersisa (beberapa tag bisa bersambung)
    let prev = '';
    while (prev !== name) {
        prev = name;
        name = name.replace(RELEASE_TAGS, '');
    }

    return name
        .replace(/[._-]+/g, ' ')       // sisa titik/underscore/dash jadi spasi
        .replace(/\s\d+\s*$/, '')      // hapus angka tunggal di akhir (sisa DDP5.1)
        .replace(/\s[A-Z]\s/g, ' ')    // hapus huruf kapital tunggal di tengah
        .replace(/\s{2,}/g, ' ')
        .trim();
}

const ENGINES = [
    { value: 'manual', label: '✏ Manual', desc: 'Upload SRT, terjemahkan sendiri di editor' },
    { value: 'google_free', label: '⚡ Google Free', desc: 'Tanpa API key, cepat, gratis' },
    { value: 'gemini', label: '✦ Gemini AI', desc: 'Kontekstual, kualitas terbaik' },
    { value: 'libretranslate', label: '🔒 LibreTranslate', desc: 'Self-hosted, offline / private' },
];

const LANG_FROM_OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
    { value: 'zh', label: 'Chinese' },
    { value: 'es', label: 'Spanish' },
    { value: 'fr', label: 'French' },
];
const LANG_TO_OPTIONS = [
    { value: 'id', label: 'Indonesia' },
    { value: 'en', label: 'English' },
    { value: 'ms', label: 'Melayu' },
    { value: 'ja', label: 'Japanese' },
    { value: 'ko', label: 'Korean' },
];

export default function UploadPage() {
    const navigate = useNavigate();
    const fileRef = useRef(null);

    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [fileError, setFileError] = useState('');

    const [form, setForm] = useState({
        title: '', genre: '', char_context: '',
        lang_from: 'en', lang_to: 'id',
    });

    const [engine, setEngine] = useState('google_free');
    const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_key') || '');
    const [libreUrl, setLibreUrl] = useState(localStorage.getItem('libre_url') || 'http://localhost:5000');
    const [libreStatus, setLibreStatus] = useState('idle'); // idle | testing | ok | fail

    const [phase, setPhase] = useState('idle'); // idle | translating | error
    const [progress, setProgress] = useState({ processed: 0, total: 0, logs: [] });
    const [submitError, setSubmitError] = useState('');

    // ── File handling ──────────────────────────────────────────────
    const handleFile = useCallback((f) => {
        setFileError('');
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.srt')) {
            setFileError('Hanya file .srt yang diterima.');
            setFile(null);
            return;
        }
        setFile(f);
        const autoTitle = parseTitle(f.name);
        setForm(prev => ({ ...prev, title: prev.title || autoTitle }));
    }, []);

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    // ── LibreTranslate connection test ────────────────────────────
    const testLibre = async () => {
        setLibreStatus('testing');
        try {
            const res = await fetch(`${libreUrl}/languages`, { signal: AbortSignal.timeout(4000) });
            setLibreStatus(res.ok ? 'ok' : 'fail');
        } catch {
            setLibreStatus('fail');
        }
    };

    // ── Submit validation ──────────────────────────────────────────
    const isSubmitDisabled =
        !file ||
        phase === 'translating' ||
        (engine === 'gemini' && !geminiKey.trim()) ||
        (engine === 'libretranslate' && !libreUrl.trim());

    const isManual = engine === 'manual';

    // ── SSE progress listener ──────────────────────────────────────
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
            if (e.data) {
                setProgress(prev => ({ ...prev, logs: [...prev.logs, e.data] }));
            }
        };

        es.onerror = () => {
            es.close();
            setPhase('error');
            setSubmitError('Koneksi ke server terputus saat translating.');
        };
    };

    // ── Submit ─────────────────────────────────────────────────────
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

        setPhase('translating');

        try {
            const res = await fetch(`${API}/api/translate`, { method: 'POST', body: fd });
            const data = await res.json();
            if (!res.ok) {
                setPhase('error');
                setSubmitError(data.detail || `Error ${res.status}`);
                return;
            }
            // Manual mode: job_id null → langsung ke editor
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

    const handleRetry = () => {
        setPhase('idle');
        setSubmitError('');
        setProgress({ processed: 0, total: 0, logs: [] });
    };

    // ── Derived ────────────────────────────────────────────────────
    const pct = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

    return (
        <div style={s.root}>
            {/* Logo */}
            <div style={s.logoWrap}>
                <div style={s.logo}>⬡ SubtiTool</div>
                <p style={s.logoSub}>AI Subtitle Translator &amp; Editor</p>
            </div>

            <form onSubmit={handleSubmit} style={s.form}>

                {/* ── Drop Zone ── */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current.click()}
                    style={{
                        ...s.dropzone,
                        border: `2px dashed ${fileError ? 'var(--red)' : dragOver ? 'var(--amber)' : file ? 'var(--green)' : 'var(--border)'}`,
                        background: dragOver ? 'var(--amber-dim)' : file ? 'rgba(16,185,129,0.05)' : 'var(--bg-1)',
                    }}
                >
                    <input
                        ref={fileRef} type="file" accept=".srt"
                        style={{ display: 'none' }}
                        onChange={e => handleFile(e.target.files[0])}
                    />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>
                        {fileError ? '❌' : file ? '✅' : '📄'}
                    </div>
                    {file ? (
                        <>
                            <p style={{ color: 'var(--green)', fontWeight: 700, margin: 0 }}>{file.name}</p>
                            <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                                {(file.size / 1024).toFixed(1)} KB · klik untuk ganti file
                            </p>
                        </>
                    ) : (
                        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                            Drop file <strong style={{ color: 'var(--amber)' }}>.srt</strong> di sini atau klik untuk browse
                        </p>
                    )}
                </div>
                {fileError && <p style={s.inlineError}>⚠ {fileError}</p>}

                {/* ── Konteks Film ── */}
                <div style={s.card}>
                    <p style={s.cardLabel}>KONTEKS FILM</p>
                    <Field label="Judul">
                        <input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="Breaking Bad S02E06"
                            style={s.input}
                        />
                    </Field>
                    <Field label="Genre">
                        <input
                            value={form.genre}
                            onChange={e => setForm(f => ({ ...f, genre: e.target.value }))}
                            placeholder="Crime Drama"
                            style={s.input}
                        />
                    </Field>
                    <Field label="Karakter Utama">
                        <input
                            value={form.char_context}
                            onChange={e => setForm(f => ({ ...f, char_context: e.target.value }))}
                            placeholder="Walter (tegang), Jesse (kasual)"
                            style={s.input}
                        />
                    </Field>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <Field label="Dari">
                            <select value={form.lang_from} onChange={e => setForm(f => ({ ...f, lang_from: e.target.value }))} style={s.input}>
                                {LANG_FROM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>
                        <Field label="Ke">
                            <select value={form.lang_to} onChange={e => setForm(f => ({ ...f, lang_to: e.target.value }))} style={s.input}>
                                {LANG_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </Field>
                    </div>
                </div>

                {/* ── Engine Selector ── */}
                <div style={s.card}>
                    <p style={s.cardLabel}>ENGINE TRANSLATE</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {ENGINES.map(eng => (
                            <label key={eng.value} style={{
                                ...s.engineOption,
                                border: `1px solid ${engine === eng.value ? 'var(--amber)' : 'var(--border)'}`,
                                background: engine === eng.value ? 'var(--amber-dim)' : 'transparent',
                            }}>
                                <input
                                    type="radio" name="engine" value={eng.value}
                                    checked={engine === eng.value}
                                    onChange={() => setEngine(eng.value)}
                                    style={{ accentColor: 'var(--amber)', marginTop: 2 }}
                                />
                                <div>
                                    <div style={{ color: 'var(--text)', fontWeight: engine === eng.value ? 700 : 400 }}>{eng.label}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{eng.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>

                    {/* Gemini key input */}
                    {engine === 'gemini' && (
                        <div style={{ marginTop: 10 }}>
                            <label style={s.subLabel}>Gemini API Key</label>
                            <input
                                value={geminiKey}
                                onChange={e => setGeminiKey(e.target.value)}
                                placeholder="AIza..."
                                type="password"
                                style={{ ...s.input, borderColor: !geminiKey.trim() ? 'var(--red)' : 'var(--border)' }}
                            />
                            {!geminiKey.trim() && (
                                <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>
                                    API key wajib diisi untuk engine Gemini.
                                </p>
                            )}
                        </div>
                    )}

                    {/* LibreTranslate URL + test */}
                    {engine === 'libretranslate' && (
                        <div style={{ marginTop: 10 }}>
                            <label style={s.subLabel}>LibreTranslate URL</label>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <input
                                    value={libreUrl}
                                    onChange={e => { setLibreUrl(e.target.value); setLibreStatus('idle'); }}
                                    placeholder="http://localhost:5000"
                                    style={{ ...s.input, flex: 1 }}
                                />
                                <button type="button" onClick={testLibre} style={s.btnSecondary}>
                                    {libreStatus === 'testing' ? '...' : 'Test'}
                                </button>
                                {libreStatus === 'ok' && <span style={{ color: 'var(--green)', fontSize: 18 }}>●</span>}
                                {libreStatus === 'fail' && <span style={{ color: 'var(--red)', fontSize: 18 }}>●</span>}
                            </div>
                            {libreStatus === 'fail' && (
                                <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>
                                    Tidak bisa terhubung ke LibreTranslate. Pastikan server berjalan.
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Progress (saat translating) ── */}
                {phase === 'translating' && (
                    <div style={s.progBox}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 700 }}>
                                ⟳ Translating...
                            </span>
                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                                {progress.processed} / {progress.total} baris ({pct}%)
                            </span>
                        </div>
                        <div style={s.progTrack}>
                            <div style={{ ...s.progFill, width: `${pct}%` }} />
                        </div>
                        {progress.logs.length > 0 && (
                            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 11 }}>
                                {progress.logs[progress.logs.length - 1]}
                            </p>
                        )}
                    </div>
                )}

                {/* ── Error state ── */}
                {phase === 'error' && (
                    <div style={s.errorBox}>
                        <p style={{ margin: '0 0 10px', color: 'var(--red)', fontWeight: 700 }}>⚠ Terjemahan Gagal</p>
                        <p style={{ margin: '0 0 14px', color: 'var(--text-dim)', fontSize: 12 }}>{submitError}</p>
                        <button type="button" onClick={handleRetry} style={s.btnRetry}>
                            ↺ Coba Lagi
                        </button>
                    </div>
                )}

                {/* ── Submit button ── */}
                {phase === 'idle' && (
                    <button
                        type="submit"
                        disabled={isSubmitDisabled}
                        style={{
                            ...s.btnSubmit,
                            opacity: isSubmitDisabled ? 0.45 : 1,
                            cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
                            background: isManual ? '#374151' : 'var(--amber)',
                            color: isManual ? '#e5e7eb' : '#000',
                        }}
                    >
                        {isManual ? '✏ Upload & Edit Manual' : '✦ Mulai Translate'}
                    </button>
                )}
            </form>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</label>
            {children}
        </div>
    );
}

const s = {
    root: {
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 16px', background: 'var(--bg)',
    },
    logoWrap: { marginBottom: 28, textAlign: 'center' },
    logo: {
        fontSize: 32, color: 'var(--amber)',
        fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: -1,
    },
    logoSub: { color: 'var(--text-muted)', marginTop: 6, fontSize: 13 },
    form: { width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 },
    dropzone: {
        borderRadius: 8, padding: '28px 24px', textAlign: 'center',
        cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none',
    },
    inlineError: { color: 'var(--red)', fontSize: 12, margin: '-6px 0 0' },
    card: {
        background: 'var(--bg-1)', padding: 16, borderRadius: 6,
        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10,
    },
    cardLabel: { fontSize: 10, color: 'var(--amber)', letterSpacing: 1, margin: '0 0 2px' },
    input: { width: '100%', boxSizing: 'border-box' },
    subLabel: { fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 },
    engineOption: {
        display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px',
        borderRadius: 4, cursor: 'pointer', transition: 'all 0.15s',
    },
    progBox: {
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '14px 16px',
    },
    progTrack: { height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden' },
    progFill: {
        height: '100%', borderRadius: 3, background: 'var(--amber)',
        transition: 'width 0.5s ease',
    },
    errorBox: {
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: 6, padding: '14px 16px',
    },
    btnSubmit: {
        background: 'var(--amber)', color: '#000', border: 'none',
        padding: 13, borderRadius: 6, fontWeight: 800, fontSize: 14,
        fontFamily: 'var(--display)', letterSpacing: 0.5, transition: 'opacity 0.15s',
    },
    btnSecondary: {
        background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
        padding: '6px 12px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap',
    },
    btnRetry: {
        background: 'none', border: '1px solid var(--red)', color: 'var(--red)',
        padding: '7px 18px', borderRadius: 4, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    },
};
