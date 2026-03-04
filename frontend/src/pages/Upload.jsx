import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useSubtiStore from '../store/useSubtiStore';
import TranslateProgress from '../components/TranslateProgress';

const ENGINES = [
    { value: 'google_free', label: '⚡ Google Free', desc: 'Tanpa API key, cepat, gratis' },
    { value: 'gemini', label: '✦ Gemini AI', desc: 'Kontekstual, kualitas terbaik' },
    { value: 'libretranslate', label: '🔒 LibreTranslate', desc: 'Self-hosted, offline/private' },
];

export default function UploadPage() {
    const navigate = useNavigate();
    const { isTranslating, startTranslateJob, listenProgress } = useSubtiStore();
    const fileRef = useRef(null);
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [engine, setEngine] = useState('google_free');
    const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_key') || '');
    const [form, setForm] = useState({ title: '', genre: '', char_context: '', lang_from: 'en', lang_to: 'id' });
    const [error, setError] = useState('');

    const handleFile = (f) => {
        if (!f?.name.endsWith('.srt')) { setError('Hanya file .srt yang didukung.'); return; }
        setError('');
        setFile(f);
        if (!form.title) setForm(prev => ({ ...prev, title: f.name.replace('.srt', '').replace(/[_.-]/g, ' ') }));
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        handleFile(e.dataTransfer.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!file) { setError('Pilih file SRT terlebih dahulu.'); return; }
        if (engine === 'gemini' && !geminiKey) { setError('Masukkan Gemini API key.'); return; }

        if (engine === 'gemini') localStorage.setItem('gemini_key', geminiKey);

        const fd = new FormData();
        fd.append('file', file);
        Object.entries(form).forEach(([k, v]) => fd.append(k, v));
        fd.append('engine', engine);
        fd.append('gemini_api_key', engine === 'gemini' ? geminiKey : '');

        const job = await startTranslateJob(fd);
        if (!job) return;

        listenProgress(job.job_id, () => {
            setTimeout(() => navigate(`/editor/${job.project_id}`), 600);
        });
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--bg)' }}>
            {/* Logo */}
            <div style={{ marginBottom: 32, textAlign: 'center' }}>
                <div style={{ fontSize: 32, color: 'var(--amber)', fontFamily: 'var(--display)', fontWeight: 800, letterSpacing: -1 }}>
                    ⬡ SubtiTool
                </div>
                <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>AI Subtitle Translator &amp; Editor</p>
            </div>

            <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Drop zone */}
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current.click()}
                    style={{
                        border: `2px dashed ${dragOver ? 'var(--amber)' : file ? 'var(--green)' : 'var(--border)'}`,
                        borderRadius: 8, padding: '32px 24px', textAlign: 'center',
                        cursor: 'pointer', transition: 'all 0.2s',
                        background: dragOver ? 'var(--amber-dim)' : 'var(--bg-1)',
                    }}
                >
                    <input ref={fileRef} type="file" accept=".srt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{file ? '✅' : '📄'}</div>
                    <p style={{ color: file ? 'var(--green)' : 'var(--text-dim)', fontWeight: file ? 700 : 400 }}>
                        {file ? file.name : 'Drop file .srt di sini atau klik untuk browse'}
                    </p>
                    {file && <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>
                        {(file.size / 1024).toFixed(1)} KB
                    </p>}
                </div>

                {/* Form context */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--bg-1)', padding: 16, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 10, color: 'var(--amber)', letterSpacing: 1, marginBottom: 4 }}>KONTEKS FILM (meningkatkan kualitas terjemahan)</p>
                    <Row label="Judul">
                        <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Breaking Bad S02E06" style={{ width: '100%' }} />
                    </Row>
                    <Row label="Genre">
                        <input value={form.genre} onChange={e => setForm(f => ({ ...f, genre: e.target.value }))} placeholder="Crime Drama" style={{ width: '100%' }} />
                    </Row>
                    <Row label="Karakter">
                        <input value={form.char_context} onChange={e => setForm(f => ({ ...f, char_context: e.target.value }))} placeholder="Walter (tegang), Jesse (kasual)" style={{ width: '100%' }} />
                    </Row>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <Row label="Dari">
                            <select value={form.lang_from} onChange={e => setForm(f => ({ ...f, lang_from: e.target.value }))} style={{ width: '100%' }}>
                                <option value="en">English</option>
                                <option value="ja">Japanese</option>
                                <option value="ko">Korean</option>
                                <option value="zh">Chinese</option>
                            </select>
                        </Row>
                        <Row label="Ke">
                            <select value={form.lang_to} onChange={e => setForm(f => ({ ...f, lang_to: e.target.value }))} style={{ width: '100%' }}>
                                <option value="id">Indonesia</option>
                                <option value="en">English</option>
                                <option value="ms">Melayu</option>
                            </select>
                        </Row>
                    </div>
                </div>

                {/* Engine selector */}
                <div style={{ background: 'var(--bg-1)', padding: 16, borderRadius: 6, border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 10, color: 'var(--amber)', letterSpacing: 1, marginBottom: 10 }}>ENGINE TRANSLATE</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {ENGINES.map(eng => (
                            <label key={eng.value} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                                borderRadius: 4, border: `1px solid ${engine === eng.value ? 'var(--amber)' : 'var(--border)'}`,
                                background: engine === eng.value ? 'var(--amber-dim)' : 'transparent',
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}>
                                <input type="radio" name="engine" value={eng.value} checked={engine === eng.value} onChange={() => setEngine(eng.value)} style={{ accentColor: 'var(--amber)' }} />
                                <div>
                                    <div style={{ color: 'var(--text)', fontWeight: engine === eng.value ? 700 : 400 }}>{eng.label}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{eng.desc}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                    {engine === 'gemini' && (
                        <input
                            value={geminiKey}
                            onChange={e => setGeminiKey(e.target.value)}
                            placeholder="AIza..."
                            type="password"
                            style={{ width: '100%', marginTop: 10, boxSizing: 'border-box' }}
                        />
                    )}
                </div>

                {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>⚠ {error}</p>}

                {isTranslating && <TranslateProgress />}

                {!isTranslating && (
                    <button
                        type="submit"
                        style={{
                            background: 'var(--amber)', color: '#000', border: 'none',
                            padding: '12px', borderRadius: 6, fontWeight: 800, fontSize: 14,
                            fontFamily: 'var(--display)', letterSpacing: 0.5,
                            transition: 'opacity 0.15s',
                        }}
                    >
                        ✦ Mulai Translate
                    </button>
                )}
            </form>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</label>
            {children}
        </div>
    );
}
