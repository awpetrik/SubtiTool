import { memo, useRef, useState } from 'react';
import { Flag, Check, Edit2, Eye, Wand2, Trash2 } from 'lucide-react';
import useSubtiStore, { timecodeToSeconds } from '../store/useSubtiStore';
import FlagModal from './FlagModal';
import { useContextMenu } from 'react-contexify';

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
    const [translatingLine, setTranslatingLine] = useState(false);

    const handleQuickTranslate = async (e) => {
        e.stopPropagation();
        if (translatingLine) return;
        setTranslatingLine(true);
        try {
            const res = await useSubtiStore.getState().translateSnippet(seg.original);
            if (res.success && res.translation) {
                await useSubtiStore.getState().saveEditWithValue(seg.id, res.translation);
                // Re-open for review
                const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
                if (updatedSeg) useSubtiStore.getState().startEdit({ ...updatedSeg, translation: res.translation });
            } else {
                alert('Gagal translate baris: ' + (res.error || 'Unknown error'));
            }
        } finally {
            setTranslatingLine(false);
        }
    };

    // QC Metrics
    const duration = timecodeToSeconds(seg.timecode_end) - timecodeToSeconds(seg.timecode_start);
    const activeText = isEditing ? editValue : seg.translation || '';
    const textLen = activeText.replace(/<[^>]*>/gi, '').length;
    const origLen = (seg.original || '').replace(/<[^>]*>/gi, '').length;

    const cps = duration > 0 ? (textLen / duration) : 0;
    const isCpsDanger = cps > 17;
    const isLenDanger = origLen > 0 && (textLen / origLen) > 1.5;
    const isWarning = (isCpsDanger || isLenDanger) && !isSkipped;

    const { show } = useContextMenu({ id: 'seg-menu' });

    // Store selection here so right-click doesn't lose it
    const selectionRef = useRef({ text: '', range: null });

    const captureSelection = (ta) => {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        if (start !== end) {
            selectionRef.current = {
                text: ta.value.substring(start, end),
                range: { start, end },
            };
        } else {
            selectionRef.current = { text: '', range: null };
        }
    };

    const handleContextMenu = (e) => {
        e.preventDefault();
        // Re-read selection from textarea directly if still available
        if (isEditing && e.target.tagName === 'TEXTAREA') {
            captureSelection(e.target);
        }
        // Snapshot editValue NOW before blur/saveEdit can clear it
        const editValueSnapshot = isEditing ? useSubtiStore.getState().editValue : null;
        show({
            event: e,
            props: {
                seg,
                textSelection: selectionRef.current.text,
                range: selectionRef.current.range,
                editValueSnapshot,
            }
        });
    };

    return (
        <>
            <div
                id={`seg-${seg.id}`}
                onClick={() => setActiveSegId(seg.id)}
                onContextMenu={handleContextMenu}
                onMouseDown={(e) => {
                    // Prevent blur on right-click so selection stays in textarea
                    if (e.button === 2) e.preventDefault();
                }}
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 16px', borderBottom: '1px solid #141416',
                    cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s',
                    background: isSelected
                        ? 'var(--blue-dim)'
                        : isActive
                            ? 'rgba(245,158,11,0.05)'
                            : isWarning
                                ? 'rgba(239,68,68,0.02)'
                                : 'transparent',
                    borderLeft: isActive
                        ? '2px solid var(--amber)'
                        : isSelected
                            ? '2px solid var(--blue)'
                            : isWarning
                                ? '2px solid rgba(239,68,68,0.5)'
                                : seg.status === 'approved'
                                    ? '2px solid rgba(16,185,129,0.5)'
                                    : seg.status === 'flagged'
                                        ? '2px solid rgba(239,68,68,0.4)'
                                        : seg.status === 'in_review'
                                            ? '2px solid rgba(139,92,246,0.4)'
                                            : seg.status === 'ai_done'
                                                ? '2px solid rgba(245,158,11,0.3)'
                                                : '2px solid transparent',
                    opacity: isSkipped ? 0.4 : seg.status === 'approved' ? 0.65 : 1,
                }}
            >
                {/* Index & Multi-Select Checkbox */}
                <span style={{ width: 50, color: 'var(--text-muted)', paddingTop: 2, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); useSubtiStore.getState().toggleSelection(seg.id); }}
                        style={{ accentColor: 'var(--blue)', width: 14, height: 14, cursor: 'pointer', appearance: 'auto' }}
                    />
                    {seg.index}
                </span>

                {/* Timecode & QC Metric */}
                <div style={{ width: 160, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2, flexShrink: 0 }}>
                    <span style={{ color: '#555', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {seg.timecode_start}<br />{seg.timecode_end}
                    </span>
                    {textLen > 0 && !isSkipped && (
                        <span title={`Kecepatan baca: ${cps.toFixed(1)} karakter per detik. (Maksimal ideal: 17)`} style={{
                            fontSize: 10, fontWeight: 700,
                            color: isCpsDanger ? 'var(--red)' : '#555',
                            background: isCpsDanger ? 'rgba(239,68,68,0.1)' : 'transparent',
                            padding: isCpsDanger ? '2px 6px' : '0',
                            borderRadius: 3, width: 'fit-content'
                        }}>
                            {cps.toFixed(1)} CPS
                        </span>
                    )}
                </div>

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
                            onMouseUp={e => captureSelection(e.target)}
                            onSelect={e => captureSelection(e.target)}
                            onBlur={() => saveEdit(seg.id)}
                            onContextMenu={e => {
                                // Capture selection specifically on the textarea before the menu shows
                                captureSelection(e.target);
                            }}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                    // Smart Auto-Break (Piramida terbalik)
                                    e.preventDefault();
                                    const text = useSubtiStore.getState().editValue;
                                    if (!text) return;
                                    const center = Math.floor(text.length / 2);
                                    const before = text.lastIndexOf(' ', center);
                                    const after = text.indexOf(' ', center + 1);

                                    let splitIndex = center;
                                    if (before === -1 && after === -1) splitIndex = center;
                                    else if (before === -1) splitIndex = after;
                                    else if (after === -1) splitIndex = before;
                                    else splitIndex = (center - before) < (after - center) ? before : after;

                                    const newText = text.substring(0, splitIndex).trim() + '\n' + text.substring(splitIndex).trim();
                                    useSubtiStore.setState({ editValue: newText });
                                } else if (e.key === 'Enter' && !e.shiftKey) {
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
                                fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1.5, outline: 'none',
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
                                <p style={{ margin: 0, color: 'rgba(245,158,11,0.45)', lineHeight: 1.5, fontStyle: 'italic', fontSize: 13 }}>
                                    ✦ belum ditranslate
                                </p>
                            )}
                            {seg.flag_note && (
                                <p style={{ margin: '4px 0 0', color: 'var(--red)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
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
                            padding: '3px 8px', borderRadius: 3, fontSize: 12,
                            background: 'rgba(156,163,175,0.12)', color: '#9ca3af',
                            fontWeight: 600
                        }}>
                            ♪ Skipped
                        </span>
                    ) : (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 12,
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

                    {/* Quick Translate: hanya tampil jika belum approved/skipped */}
                    {seg.status !== 'skipped' && (
                        <ActionBtn
                            title={translatingLine ? 'Menerjemahkan...' : 'Terjemahkan baris ini (Google)'}
                            onClick={handleQuickTranslate}
                            color="var(--amber)"
                            disabled={translatingLine}
                        >
                            {translatingLine ? (
                                <span style={{
                                    display: 'inline-block', width: 12, height: 12,
                                    border: '2px solid var(--amber)', borderTopColor: 'transparent',
                                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                }} />
                            ) : (
                                <Wand2 size={14} />
                            )}
                        </ActionBtn>
                    )}

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

function ActionBtn({ children, onClick, title, color, disabled }) {
    return (
        <button
            title={title}
            onClick={onClick}
            disabled={disabled}
            style={{
                background: 'none', border: '1px solid var(--border)',
                color: color || 'var(--text-muted)', width: 26, height: 26,
                borderRadius: 3, fontSize: 13, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
            }}
        >
            {children}
        </button>
    );
}
