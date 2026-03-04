import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useSubtiStore from '../store/useSubtiStore';
import SubtitleRow from '../components/SubtitleRow';
import GlossaryPanel from '../components/GlossaryPanel';
import SubSourceModal from '../components/SubSourceModal';

const API = 'http://localhost:8000';

const STATUS_CFG = {
    pending: { label: 'Pending', color: '#64748b', bg: 'rgba(100,116,139,0.12)', dot: '#64748b' },
    ai_done: { label: 'AI Done', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
    flagged: { label: 'Flagged', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', dot: '#ef4444' },
    in_review: { label: 'In Review', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', dot: '#8b5cf6' },
    approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
};

const FILTERS = ['all', 'ai_done', 'flagged', 'in_review', 'approved', 'pending'];

export default function EditorPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const {
        currentProject, segments, glossary,
        filterStatus, setFilter,
        activeSegId, setActiveSegId,
        sidePanel, setSidePanel,
        loadProject, getStats,
    } = useSubtiStore();

    const [showSubSource, setShowSubSource] = useState(false);
    const [videoTime, setVideoTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => { if (id) loadProject(parseInt(id)); }, [id]);

    useEffect(() => {
        if (isPlaying) {
            timerRef.current = setInterval(() => setVideoTime(t => (t + 0.1) % 600), 100);
        } else {
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [isPlaying]);

    const stats = getStats();
    const filtered = filterStatus === 'all' ? segments : segments.filter(s => s.status === filterStatus);
    const pctApproved = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const activeSegment = activeSegId ? segments.find(s => s.id === activeSegId) : null;

    const fmtTime = t => {
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = (t % 60).toFixed(1).padStart(4, '0');
        return `00:${m}:${s}`;
    };

    if (!currentProject) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
            Loading project...
        </div>
    );

    return (
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            {/* ── HEADER ── */}
            <header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px', height: 52, borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16 }}>←</button>
                    <span style={{ fontSize: 16, color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--display)', letterSpacing: -0.5 }}>⬡ SubtiTool</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{currentProject.title}</span>
                    <span style={{ fontSize: 11, background: 'var(--amber-dim)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 3, border: '1px solid var(--amber-border)' }}>
                        {currentProject.lang_from?.toUpperCase()} → {currentProject.lang_to?.toUpperCase()}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{pctApproved}% approved</span>
                        <div style={{ width: 120, height: 4, background: 'var(--bg-2)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'var(--green)', borderRadius: 2, width: `${(stats.approved / stats.total) * 100}%`, transition: 'width 0.5s' }} />
                            <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', background: 'var(--amber)', borderRadius: 2, width: `${((stats.approved + stats.ai_done) / stats.total) * 100}%`, opacity: 0.3 }} />
                        </div>
                    </div>
                    <button
                        onClick={() => window.open(`${API}/api/projects/${id}/export`, '_blank')}
                        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '5px 14px', borderRadius: 4, fontSize: 12 }}
                    >
                        ↓ Export SRT
                    </button>
                    <button
                        onClick={() => setShowSubSource(true)}
                        style={{ background: 'var(--amber)', color: '#000', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 800 }}
                    >
                        ↑ SubSource
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 52px)' }}>
                {/* ── LEFT PANEL ── */}
                <aside style={{ width: 250, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0 }}>
                    {/* Video mockup */}
                    <div style={{ borderBottom: '1px solid var(--border)' }}>
                        <div style={{ height: 140, background: '#050505', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                            {/* Grain texture */}
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")", opacity: 0.5 }} />
                            <div style={{ position: 'absolute', top: 8, left: 10, fontSize: 10, color: '#333' }}>{currentProject.title}</div>
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.8))' }} />
                            {activeSegment?.translation && (
                                <div style={{ position: 'relative', zIndex: 2, color: '#fff', fontSize: 12, textAlign: 'center', padding: '4px 10px 10px', textShadow: '0 1px 4px #000', fontFamily: 'sans-serif' }}
                                    dangerouslySetInnerHTML={{ __html: activeSegment.translation }}
                                />
                            )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-1)' }}>
                            <button onClick={() => setIsPlaying(p => !p)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--amber)', width: 26, height: 26, borderRadius: '50%', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isPlaying ? '⏸' : '▶'}
                            </button>
                            <div style={{ flex: 1, height: 3, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--amber)', width: `${(videoTime / 600) * 100}%` }} />
                            </div>
                            <span style={{ fontSize: 10, color: '#555' }}>{fmtTime(videoTime)}</span>
                        </div>
                    </div>

                    {/* Filter pills */}
                    <div style={{ padding: '12px 10px 8px' }}>
                        <p style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 8 }}>FILTER</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {FILTERS.map(f => {
                                const cfg = STATUS_CFG[f];
                                const count = f === 'all' ? stats.total : stats[f];
                                const active = filterStatus === f;
                                return (
                                    <button key={f} onClick={() => setFilter(f)} style={{
                                        textAlign: 'left', padding: '5px 10px', borderRadius: 3, fontSize: 11,
                                        border: `1px solid ${active ? (cfg?.color || 'var(--amber)') : 'var(--border)'}`,
                                        background: active ? (cfg?.bg || 'rgba(255,255,255,0.08)') : 'transparent',
                                        color: active ? (cfg?.color || 'var(--text)') : 'var(--text-muted)',
                                        transition: 'all 0.15s',
                                    }}>
                                        {f === 'all' ? `All (${count})` : `${cfg.label} (${count})`}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Glossary / Stats tabs */}
                    <div style={{ display: 'flex', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginTop: 4 }}>
                        {['glossary', 'stats'].map(p => (
                            <button key={p} onClick={() => setSidePanel(p)} style={{
                                flex: 1, background: 'none', border: 'none', padding: '7px 0',
                                fontSize: 11, color: sidePanel === p ? 'var(--amber)' : 'var(--text-muted)',
                                borderBottom: sidePanel === p ? '2px solid var(--amber)' : '2px solid transparent',
                                transition: 'all 0.15s',
                            }}>
                                {p === 'glossary' ? '📖 Glossary' : '📊 Stats'}
                            </button>
                        ))}
                    </div>

                    {sidePanel === 'glossary' ? (
                        <GlossaryPanel />
                    ) : (
                        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {Object.entries(stats).filter(([k]) => k !== 'total').map(([k, v]) => {
                                const cfg = STATUS_CFG[k];
                                return (
                                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: cfg?.dot, flexShrink: 0 }} />
                                        <span style={{ color: 'var(--text-muted)', fontSize: 12, flex: 1 }}>{cfg?.label || k}</span>
                                        <div style={{ width: 60, height: 3, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', borderRadius: 2, background: cfg?.dot, width: `${stats.total > 0 ? (v / stats.total) * 100 : 0}%`, transition: 'width 0.5s' }} />
                                        </div>
                                        <span style={{ color: 'var(--text)', fontSize: 12, minWidth: 20, textAlign: 'right' }}>{v}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </aside>

                {/* ── MAIN EDITOR ── */}
                <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                    {/* Table header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px',
                        borderBottom: '1px solid var(--border)', fontSize: 10, letterSpacing: 1,
                        color: 'var(--text-muted)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10,
                    }}>
                        <span style={{ width: 36 }}>#</span>
                        <span style={{ width: 160 }}>TIMECODE</span>
                        <span style={{ flex: 1 }}>ORIGINAL</span>
                        <span style={{ flex: 1 }}>TERJEMAHAN</span>
                        <span style={{ width: 100 }}>STATUS</span>
                        <span style={{ width: 116 }}>AKSI</span>
                    </div>

                    {filtered.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                            Tidak ada segment dengan filter ini.
                        </div>
                    ) : (
                        filtered.map(seg => <SubtitleRow key={seg.id} seg={seg} />)
                    )}
                </main>
            </div>

            {showSubSource && (
                <SubSourceModal
                    projectId={id}
                    projectTitle={currentProject.title}
                    onClose={() => setShowSubSource(false)}
                />
            )}
        </div>
    );
}
