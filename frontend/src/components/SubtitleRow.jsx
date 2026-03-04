import { useState } from 'react';
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

export default function SubtitleRow({ seg }) {
    const {
        activeSegId, editingId, editValue, selectedSegIds, flaggingId,
        setActiveSegId, startEdit, cancelEdit, saveEdit, approve, setInReview, setFlaggingId
    } = useSubtiStore();

    const isActive = activeSegId === seg.id;
    const isEditing = editingId === seg.id;
    const isSelected = selectedSegIds.has(seg.id);
    const showFlag = flaggingId === seg.id;
    const cfg = STATUS_CFG[seg.status] || STATUS_CFG.pending;

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
                        dangerouslySetInnerHTML={{ __html: seg.original }}
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
                                    const next = all[all.findIndex(s => s.id === seg.id) + 1];
                                    if (next) useSubtiStore.getState().setActiveSegId(next.id);
                                } else if (e.key === 'Enter' && e.shiftKey) {
                                    e.preventDefault();
                                    saveEdit(seg.id);
                                } else if (e.key === 'Tab') {
                                    e.preventDefault();
                                    saveEdit(seg.id);
                                    const all = useSubtiStore.getState().segments;
                                    const next = all[all.findIndex(s => s.id === seg.id) + 1];
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
                                    dangerouslySetInnerHTML={{ __html: seg.translation }}
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
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 8px', borderRadius: 3, fontSize: 11,
                        background: cfg.bg, color: cfg.color,
                    }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
                        {cfg.label}
                    </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 4, paddingTop: 1, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {seg.status !== 'approved' && (
                        <ActionBtn title="Approve" onClick={() => approve(seg.id)}><Check size={14} /></ActionBtn>
                    )}
                    <ActionBtn title="Edit" onClick={() => startEdit(seg)}><Edit2 size={14} /></ActionBtn>
                    {seg.status !== 'in_review' && (
                        <ActionBtn title="Tandai In Review" onClick={() => setInReview(seg.id)} color="#8b5cf6"><Eye size={14} /></ActionBtn>
                    )}
                    <ActionBtn title="Flag" onClick={() => setFlaggingId(seg.id)} color="var(--red)"><Flag size={14} fill="currentColor" /></ActionBtn>
                </div>
            </div>

            {showFlag && (
                <FlagModal segId={seg.id} initialNote={seg.flag_note} onClose={() => setFlaggingId(null)} />
            )}
        </>
    );
}

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
