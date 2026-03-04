import { memo } from 'react';
import { Flag, Check, Edit2, Eye } from 'lucide-react';
import useSubtiStore from '../store/useSubtiStore';
import FlagModal from './FlagModal';

const STATUS_CFG = {
    pending: { label: 'Pending', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
    ai_done: { label: 'AI Done', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    flagged: { label: 'Flagged', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    in_review: { label: 'In Review', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
    approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

function highlightGlossary(text, glossary) {
    if (!text || !glossary || glossary.length === 0) return text;
    // Sort terms by length desc to avoid partial matches
    const sorted = [...glossary].sort((a, b) => b.source_term.length - a.source_term.length);
    const validTerms = sorted.filter(g => g.source_term && g.source_term.trim() !== '');
    if (validTerms.length === 0) return text;

    const termsEscaped = validTerms.map(g => g.source_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${termsEscaped.join('|')})\\b`, 'gi');

    return text.replace(regex, (match) => {
        const entry = validTerms.find(g => g.source_term.toLowerCase() === match.toLowerCase());
        if (!entry) return match;
        return `<mark title="Glossary: ${entry.target_term}" style="background: rgba(245, 158, 11, 0.2); border-bottom: 1px dotted var(--amber); color: var(--text); border-radius: 2px; padding: 0 2px; cursor: help;">${match}</mark>`;
    });
}

export default memo(function SubtitleRow({ seg }) {
    const isActive = useSubtiStore(state => state.activeSegId === seg.id);
    const isEditing = useSubtiStore(state => state.editingId === seg.id);
    const editValue = useSubtiStore(state => state.editingId === seg.id ? state.editValue : '');
    const isSelected = useSubtiStore(state => state.selectedSegIds.has(seg.id));
    const showFlag = useSubtiStore(state => state.flaggingId === seg.id);
    const glossary = useSubtiStore(state => state.glossary);

    const setActiveSegId = useSubtiStore(state => state.setActiveSegId);
    const startEdit = useSubtiStore(state => state.startEdit);
    const cancelEdit = useSubtiStore(state => state.cancelEdit);
    const saveEdit = useSubtiStore(state => state.saveEdit);
    const approve = useSubtiStore(state => state.approve);
    const setInReview = useSubtiStore(state => state.setInReview);
    const setFlaggingId = useSubtiStore(state => state.setFlaggingId);

    const cfg = STATUS_CFG[seg.status] || STATUS_CFG.pending;
    const isSkipped = seg.status === 'skipped';

    return (
        <>
            <div
                id={`seg-${seg.id}`}
                onClick={() => setActiveSegId(seg.id)}
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 16px', borderBottom: '1px solid #141416',
                    cursor: 'pointer', transition: 'background 0.1s',
                    background: isSelected ? 'var(--blue-dim)' : isActive ? 'rgba(245,158,11,0.05)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--amber)' : isSelected ? '2px solid var(--blue)' : '2px solid transparent',
                    opacity: isSkipped ? 0.45 : 1,
                }}
            >
                {/* Index */}
                <span style={{ width: 36, color: 'var(--text-muted)', paddingTop: 2, flexShrink: 0 }}>{seg.index}</span>

                {/* Timecode */}
                <span style={{ width: 160, color: '#555', fontSize: 11, paddingTop: 2, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {seg.timecode_start}<br />{seg.timecode_end}
                </span>

                {/* Original */}
                <div style={{ flex: 1 }}>
                    <p
                        style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5 }}
                        dangerouslySetInnerHTML={{ __html: highlightGlossary(seg.original, glossary).replace(/\n/g, '<br/>') }}
                    />
                </div>

                {/* Translation — double-click to edit */}
                <div style={{ flex: 1 }} onDoubleClick={() => startEdit(seg)}>
                    {isEditing ? (
                        <textarea
                            autoFocus
                            value={editValue}
                            onChange={e => useSubtiStore.setState({ editValue: e.target.value })}
                            onBlur={() => saveEdit(seg.id)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    saveEdit(seg.id);
                                    const all = useSubtiStore.getState().segments;
                                    let nextIdx = all.findIndex(s => s.id === seg.id) + 1;
                                    let next = null;
                                    while (nextIdx < all.length) {
                                        if (all[nextIdx].status !== 'skipped') { next = all[nextIdx]; break; }
                                        nextIdx++;
                                    }
                                    if (next) useSubtiStore.getState().setActiveSegId(next.id);
                                } else if (e.key === 'Enter' && e.shiftKey) {
                                    e.preventDefault();
                                    saveEdit(seg.id);
                                } else if (e.key === 'Tab') {
                                    e.preventDefault();
                                    saveEdit(seg.id);
                                    const all = useSubtiStore.getState().segments;
                                    let nextIdx = all.findIndex(s => s.id === seg.id) + 1;
                                    let next = null;
                                    while (nextIdx < all.length) {
                                        if (all[nextIdx].status !== 'skipped') { next = all[nextIdx]; break; }
                                        nextIdx++;
                                    }
                                    if (next) {
                                        useSubtiStore.getState().setActiveSegId(next.id);
                                        useSubtiStore.getState().startEdit(next);
                                    }
                                } else if (e.key === 'Escape') {
                                    cancelEdit();
                                }
                            }}
                            style={{
                                width: '100%', background: 'var(--bg)', border: '1px solid var(--amber)',
                                color: '#fff', padding: '4px 6px', borderRadius: 3, resize: 'none',
                                fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.5, outline: 'none',
                                boxSizing: 'border-box', minHeight: 52,
                            }}
                        />
                    ) : (
                        <>
                            {seg.translation ? (
                                <p
                                    style={{ margin: 0, color: 'var(--text)', lineHeight: 1.5 }}
                                    dangerouslySetInnerHTML={{ __html: highlightGlossary(seg.translation, glossary).replace(/\n/g, '<br/>') }}
                                />
                            ) : (
                                <p style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.5, fontStyle: 'italic' }}>
                                    — belum ditranslate —
                                </p>
                            )}
                            {seg.flag_note && (
                                <p style={{ margin: '4px 0 0', color: 'var(--red)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Flag size={12} fill="currentColor" /> {seg.flag_note}
                                </p>
                            )}
                        </>
                    )}
                </div>

                {/* Status badge */}
                <div style={{ width: 100, paddingTop: 2, flexShrink: 0 }}>
                    {isSkipped ? (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 11,
                            background: 'rgba(156,163,175,0.12)', color: '#9ca3af',
                            fontWeight: 600
                        }}>
                            ♪ Skipped
                        </span>
                    ) : (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 11,
                            background: cfg.bg, color: cfg.color,
                        }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                            {cfg.label}
                        </span>
                    )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, paddingTop: 1, flexShrink: 0, width: 116 }} onClick={e => e.stopPropagation()}>
                    {seg.status !== 'approved' && seg.status !== 'skipped' ? (
                        <ActionBtn title="Approve" onClick={() => approve(seg.id)}><Check size={14} /></ActionBtn>
                    ) : <div style={{ width: 26, height: 26 }} />}

                    <ActionBtn title="Edit" onClick={() => startEdit(seg)}><Edit2 size={14} /></ActionBtn>

                    {seg.status !== 'in_review' && seg.status !== 'skipped' ? (
                        <ActionBtn title="Tandai In Review" onClick={() => setInReview(seg.id)} color="#8b5cf6"><Eye size={14} /></ActionBtn>
                    ) : <div style={{ width: 26, height: 26 }} />}

                    <ActionBtn title="Flag" onClick={() => setFlaggingId(seg.id)} color="var(--red)"><Flag size={14} fill="currentColor" /></ActionBtn>
                </div>
            </div>

            {showFlag && (
                <FlagModal segId={seg.id} initialNote={seg.flag_note} onClose={() => setFlaggingId(null)} />
            )}
        </>
    );
});

function ActionBtn({ children, onClick, title, color }) {
    return (
        <button
            title={title}
            onClick={onClick}
            style={{
                background: 'none', border: '1px solid var(--border)',
                color: color || 'var(--text-muted)', width: 26, height: 26,
                borderRadius: 3, fontSize: 13, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.1s',
            }}
        >
            {children}
        </button>
    );
}
