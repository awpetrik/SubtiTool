import { useState } from 'react';

const API = 'http://localhost:8000';

export default function SubSourceModal({ projectId, projectTitle, projectLangTo = 'id', onClose }) {
    const [apiKey, setApiKey] = useState(localStorage.getItem('subsource_key') || '');
    const [query, setQuery] = useState(projectTitle || '');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const saveKey = () => {
        localStorage.setItem('subsource_key', apiKey);
    };

    const search = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({ q: query });
            if (apiKey) params.set('api_key', apiKey);
            const res = await fetch(`${API}/api/subsource/search?${params}`);
            const data = await res.json();
            setResults(data.results || data.data || []);
            if (data.error) setError(data.error);
        } catch (e) {
            setError('Gagal menghubungi SubSource API');
        } finally {
            setLoading(false);
        }
    };

    const downloadSrt = async () => {
        const res = await fetch(`${API}/api/projects/${projectId}/export`);
        const blob = await res.blob();
        const safeTitle = (projectTitle || 'subtitle').replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
        const filename = `${safeTitle}_${projectLangTo}.srt`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={modal} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <h3 style={{ fontFamily: 'var(--display)', color: 'var(--amber)', fontSize: 18, marginBottom: 4 }}>
                            Upload ke SubSource
                        </h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                            API upload tidak tersedia — ikuti langkah di bawah
                        </p>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 18 }}>✕</button>
                </div>

                {/* Step 1: API Key */}
                <div style={section}>
                    <p style={stepLabel}>1. SubSource API Key (opsional, untuk search)</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="ss_xxxxx..."
                            style={{ flex: 1 }}
                        />
                        <button onClick={saveKey} style={btnSecondary}>Simpan</button>
                    </div>
                </div>

                {/* Step 2: Search */}
                <div style={section}>
                    <p style={stepLabel}>2. Cari film / serial</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && search()}
                            placeholder="Breaking Bad, One Piece..."
                            style={{ flex: 1 }}
                        />
                        <button onClick={search} disabled={loading} style={btnAmber}>
                            {loading ? '...' : 'Cari'}
                        </button>
                    </div>
                    {error && <p style={{ color: 'var(--red)', fontSize: 11, marginTop: 6 }}>{error}</p>}
                    {results.length > 0 && (
                        <div style={{ marginTop: 10, maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {results.map((r, i) => (
                                <div key={i} style={resultRow}>
                                    <span style={{ color: 'var(--text)' }}>{r.title || r.name}</span>
                                    {r.year && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.year}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Step 3: Download SRT */}
                <div style={section}>
                    <p style={stepLabel}>3. Download file SRT hasil terjemahan</p>
                    <button onClick={downloadSrt} style={{ ...btnAmber, width: '100%' }}>
                        Download SRT
                    </button>
                </div>

                {/* Step 4: Upload ke SubSource */}
                <div style={section}>
                    <p style={stepLabel}>4. Upload ke SubSource.net</p>
                    <button
                        onClick={() => window.open('https://subsource.net/upload', '_blank')}
                        style={{ ...btnSecondary, width: '100%' }}
                    >
                        Buka SubSource Upload ↗
                    </button>
                    <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                        Isi form di SubSource: pilih film, episode, bahasa, lalu upload file SRT yang sudah di-download.
                    </p>
                </div>
            </div>
        </div>
    );
}

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};
const modal = {
    background: 'var(--bg-1)', border: '1px solid var(--border)',
    borderRadius: 8, padding: 24, width: 440, boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
    maxHeight: '90vh', overflowY: 'auto',
};
const section = { marginBottom: 18 };
const stepLabel = { fontSize: 11, color: 'var(--amber)', letterSpacing: 0.5, marginBottom: 6 };
const resultRow = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '5px 10px', borderRadius: 3, background: 'var(--bg-2)',
    border: '1px solid var(--border)',
};
const btnAmber = {
    background: 'var(--amber)', color: '#000', border: 'none',
    padding: '7px 16px', borderRadius: 4, fontWeight: 700, fontSize: 12,
};
const btnSecondary = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
    padding: '7px 16px', borderRadius: 4, fontSize: 12,
};
