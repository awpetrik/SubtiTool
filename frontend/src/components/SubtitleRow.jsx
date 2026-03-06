import { memo, useRef, useState, useEffect } from 'react';
import { Flag, Check, Edit2, Eye, Wand2, Trash2, Scissors, Sparkles } from 'lucide-react';
import useSubtiStore, { timecodeToSeconds } from '../store/useSubtiStore';

const STATUS_CFG = {
    pending: { label: 'Pending', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' },
    ai_done: { label: 'AI Done', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    flagged: { label: 'Flagged', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
    in_review: { label: 'In Review', color: '#c084fc', bg: 'rgba(192,132,252,0.12)' },
    approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

// 5 palet warna yang kontras, elegan, namun lembut untuk mata di atas background dark
const GLOSSARY_COLORS = [
    { text: '#fcd34d', border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.2)' }, // Amber
    { text: '#93c5fd', border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.2)' }, // Blue
    { text: '#f9a8d4', border: '#ec4899', bg: 'rgba(236, 72, 153, 0.2)' }, // Pink
    { text: '#a7f3d0', border: '#10b981', bg: 'rgba(16, 185, 129, 0.2)' }, // Emerald
    { text: '#c4b5fd', border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.2)' }  // Violet
];

function highlightGlossary(text, glossary) {
    if (!text || !glossary || glossary.length === 0) return text;
    // Sort terms by length desc to avoid partial matches
    const sorted = [...glossary].sort((a, b) => b.source_term.length - a.source_term.length);
    const validTerms = sorted.filter(g => g.source_term && g.source_term.trim() !== '');
    if (validTerms.length === 0) return text;

    // Generate color mapping based on index of unique target terms, so same terminology = same color
    const uniqueTargets = [...new Set(validTerms.map(g => g.target_term.toLowerCase()))];
    const colorMap = {};
    validTerms.forEach(g => {
        const idx = uniqueTargets.indexOf(g.target_term.toLowerCase());
        colorMap[g.target_term.toLowerCase()] = GLOSSARY_COLORS[idx % GLOSSARY_COLORS.length];
    });

    const termsEscaped = validTerms.map(g => g.source_term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`\\b(${termsEscaped.join('|')})\\b`, 'gi');

    return text.replace(regex, (match) => {
        const entry = validTerms.find(g => g.source_term.toLowerCase() === match.toLowerCase());
        if (!entry) return match;

        const c = colorMap[entry.target_term.toLowerCase()];
        return `<mark title="Glossary: ${entry.target_term}" style="background: ${c.bg}; border-bottom: 1px dotted ${c.border}; color: ${c.text}; border-radius: 2px; padding: 0 2px; cursor: help; font-weight: 600;">${match}</mark>`;
    });
}

export default memo(function SubtitleRow({ seg }) {
    const isActive = useSubtiStore(state => state.activeSegId === seg.id);
    const isEditing = useSubtiStore(state => state.editingId === seg.id);
    const editValue = useSubtiStore(state => state.editingId === seg.id ? state.editValue : '');
    const isSelected = useSubtiStore(state => state.selectedSegIds.has(seg.id));
    const glossary = useSubtiStore(state => state.glossary);

    const setActiveSegId = useSubtiStore(state => state.setActiveSegId);
    const startEdit = useSubtiStore(state => state.startEdit);
    const cancelEdit = useSubtiStore(state => state.cancelEdit);
    const saveEdit = useSubtiStore(state => state.saveEdit);
    const approve = useSubtiStore(state => state.approve);
    const setInReview = useSubtiStore(state => state.setInReview);
    const setFlaggingId = useSubtiStore(state => state.setFlaggingId);
    const unflag = useSubtiStore(state => state.unflag);
    const autoSaveEdit = useSubtiStore(state => state.autoSaveEdit);

    // Background Autosave (Debounced) - saves every 2s of typing idle
    useEffect(() => {
        if (!isEditing || !editValue) return;
        const timeout = setTimeout(() => {
            autoSaveEdit(seg.id, editValue);
        }, 2000);
        return () => clearTimeout(timeout);
    }, [editValue, isEditing, seg.id, autoSaveEdit]);

    const cfg = STATUS_CFG[seg.status] || STATUS_CFG.pending;
    const isSkipped = seg.status === 'skipped';
    const [translatingLine, setTranslatingLine] = useState(false);
    const hasAIKey = !!localStorage.getItem('gemini_key');

    const handleQuickTranslate = async (e) => {
        e.stopPropagation();
        if (translatingLine) return;
        setTranslatingLine(true);
        try {
            const res = await useSubtiStore.getState().retranslate(seg.id);
            if (res.success) {
                const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
                if (isEditing && updatedSeg) {
                    useSubtiStore.getState().startEdit({ ...updatedSeg, translation: updatedSeg.translation });
                }
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

    const [popover, setPopover] = useState(null);
    const [translatingSelection, setTranslatingSelection] = useState(false);
    const textareaRef = useRef(null);
    const caretRef = useRef({ start: null, end: null });

    const updateCaret = (ta) => {
        if (!ta) return;
        caretRef.current = {
            start: ta.selectionStart,
            end: ta.selectionEnd,
        };
    };

    const captureSelection = (ta) => {
        if (!ta) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;

        // Always keep latest caret position (even when tidak ada highlight)
        updateCaret(ta);

        if (start !== end) {
            setPopover({
                text: ta.value.substring(start, end),
                start,
                end,
            });
        } else {
            setPopover(null);
        }
    };

    const handleRefine = async (e, action) => {
        e.preventDefault();
        e.stopPropagation();
        if (!popover || translatingSelection) return;
        setTranslatingSelection(true);
        try {
            const res = await useSubtiStore.getState().refineSnippet(popover.text, seg.original, action);
            if (res.success && res.translation) {
                const editValueSnapshot = useSubtiStore.getState().editValue;
                const newText =
                    editValueSnapshot.substring(0, popover.start) +
                    res.translation +
                    editValueSnapshot.substring(popover.end);

                await useSubtiStore.getState().saveEditWithValue(seg.id, newText);

                const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
                if (updatedSeg) {
                    useSubtiStore.getState().startEdit({ ...updatedSeg, translation: newText });
                }
                setPopover(null);
            } else {
                alert('Gagal: ' + (res.error || 'Terjadi kesalahan tidak dikenal.'));
            }
        } finally {
            setTranslatingSelection(false);
        }
    };

    // Fix: Force cursor to the end when editing starts
    useEffect(() => {
        if (isEditing && textareaRef.current) {
            const ta = textareaRef.current;
            // Native autoFocus sometimes puts cursor at start, we force it to end
            const len = ta.value.length;
            ta.setSelectionRange(len, len);
            ta.focus();
        }
    }, [isEditing]);

    // Debug caret position vs text changes (tanpa memaksa posisi, supaya tidak mengganggu browser)
    useEffect(() => {
        if (!isEditing || !textareaRef.current) return;
        const ta = textareaRef.current;

        // #region agent log
        fetch('http://127.0.0.1:7691/ingest/32176010-f2ed-4b55-ad65-6f9ad75740a8', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Debug-Session-Id': '175f2f',
            },
            body: JSON.stringify({
                sessionId: '175f2f',
                runId: 'initial',
                hypothesisId: 'H5',
                location: 'frontend/src/components/SubtitleRow.jsx:caretEffect',
                message: 'Textarea rendered with caret position',
                data: {
                    segId: seg.id,
                    valueLength: (editValue || '').length,
                    selectionStart: ta.selectionStart,
                    selectionEnd: ta.selectionEnd,
                    storedStart: caretRef.current.start,
                    storedEnd: caretRef.current.end,
                    isFocused: document.activeElement === ta,
                },
                timestamp: Date.now(),
            }),
        }).catch(() => { });
        // #endregion agent log
    }, [editValue, isEditing, seg.id]);

    return (
        <>
            <div
                id={`seg-${seg.id}`}
                onClick={() => setActiveSegId(seg.id)}
                style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '10px 16px', borderBottom: '1px solid #141416',
                    cursor: 'pointer', transition: 'background 0.15s, opacity 0.15s',
                    background: isSelected
                        ? 'var(--blue-dim)'
                        : isActive
                            ? 'rgba(245,158,11,0.12)'
                            : isWarning
                                ? 'rgba(239,68,68,0.02)'
                                : 'transparent',
                    borderLeft: isActive
                        ? '4px solid var(--amber)'
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
                    boxShadow: isActive ? 'inset 10px 0 20px -10px rgba(245,158,11,0.1)' : 'none',
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
                    <span style={{ color: 'var(--text-dim)', fontSize: 11, whiteSpace: 'nowrap' }}>
                        {seg.timecode_start}<br />{seg.timecode_end}
                    </span>
                    {textLen > 0 && !isSkipped && (
                        <span title={`Kecepatan baca: ${cps.toFixed(1)} karakter per detik. (Maksimal ideal: 17)`} style={{
                            fontSize: 10, fontWeight: 700,
                            color: isCpsDanger ? 'var(--red)' : 'var(--text-muted)',
                            background: isCpsDanger ? 'rgba(239,68,68,0.1)' : 'transparent',
                            padding: isCpsDanger ? '2px 6px' : '0',
                            borderRadius: 3, width: 'fit-content'
                        }}>
                            {cps.toFixed(1)} CPS
                        </span>
                    )}
                </div>

                {/* Original */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                        style={{
                            margin: 0, color: 'var(--text-muted)', lineHeight: 1.5,
                            whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word'
                        }}
                        dangerouslySetInnerHTML={{ __html: highlightGlossary(seg.original, glossary).replace(/\n/g, '<br/>') }}
                    />
                </div>

                {/* Translation — double-click to edit */}
                <div style={{ flex: 1, minWidth: 0, position: 'relative' }} onDoubleClick={() => startEdit(seg)}>
                    {isEditing && popover ? (
                        <div style={{
                            position: 'absolute',
                            top: -42,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: '#1a1a1c',
                            border: '1px solid #3f3f46',
                            borderRadius: '6px',
                            padding: '4px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)',
                            display: 'flex',
                            gap: 4,
                            zIndex: 50,
                            whiteSpace: 'nowrap',
                            animation: 'slideUp 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
                        }}>
                            <style>{`
                                @keyframes slideUp {
                                    from { opacity: 0; transform: translate(-50%, 4px) scale(0.96); }
                                    to { opacity: 1; transform: translate(-50%, 0) scale(1); }
                                }
                                .popover-btn {
                                    background: transparent;
                                    border: none;
                                    color: #a1a1aa;
                                    font-size: 13px;
                                    display: flex;
                                    align-items: center;
                                    gap: 6px;
                                    padding: 6px 10px;
                                    border-radius: 4px;
                                    font-family: var(--sans);
                                    font-weight: 500;
                                    cursor: pointer;
                                    transition: all 0.15s ease;
                                }
                                .popover-btn:hover:not(:disabled) {
                                    background: #27272a;
                                    color: #fff;
                                }
                                .popover-btn.ai-btn:hover:not(:disabled) {
                                    background: rgba(245, 158, 11, 0.15);
                                    color: var(--amber);
                                }
                                .popover-btn:disabled {
                                    opacity: 0.5;
                                    cursor: wait;
                                }
                            `}</style>
                            <button
                                onMouseDown={(e) => handleRefine(e, 'shorten')}
                                disabled={translatingSelection}
                                className="popover-btn ai-btn"
                                title="Perpendek durasi teks berdasarkan CPS Netflix"
                            >
                                {translatingSelection ? (
                                    <span style={{
                                        display: 'inline-block', width: 12, height: 12,
                                        border: '2px solid currentColor', borderTopColor: 'transparent',
                                        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                    }} />
                                ) : (
                                    <Scissors size={14} />
                                )}
                                Shorten
                            </button>
                            <div style={{ width: 1, background: '#3f3f46', margin: '4px 2px' }} />
                            <button
                                onMouseDown={(e) => handleRefine(e, 'rephrase')}
                                disabled={translatingSelection}
                                className="popover-btn ai-btn"
                                title="Rephrase bahasa agar lebih natural (genre matched)"
                            >
                                {translatingSelection ? (
                                    <span style={{
                                        display: 'inline-block', width: 12, height: 12,
                                        border: '2px solid currentColor', borderTopColor: 'transparent',
                                        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                    }} />
                                ) : (
                                    <Sparkles size={14} />
                                )}
                                Rephrase
                            </button>
                            <div style={{ width: 1, background: '#3f3f46', margin: '4px 2px' }} />
                            <button
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const editValueSnapshot = useSubtiStore.getState().editValue;
                                    const newText =
                                        editValueSnapshot.substring(0, popover.start) +
                                        editValueSnapshot.substring(popover.end);
                                    useSubtiStore.getState().saveEditWithValue(seg.id, newText);
                                    const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
                                    if (updatedSeg) {
                                        useSubtiStore.getState().startEdit({ ...updatedSeg, translation: newText });
                                    }
                                    setPopover(null);
                                }}
                                className="popover-btn"
                                title="Delete Selection"
                            >
                                <Trash2 size={13} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : null}
                    {isEditing ? (
                        <textarea
                            ref={textareaRef}
                            defaultValue={editValue}
                            onChange={e => {
                                updateCaret(e.target);
                                useSubtiStore.setState({ editValue: e.target.value });
                            }}
                            onMouseUp={e => captureSelection(e.target)}
                            onSelect={e => captureSelection(e.target)}
                            onBlur={() => {
                                setPopover(null);
                                saveEdit(seg.id);
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
                                fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.5, outline: 'none',
                                boxSizing: 'border-box', minHeight: 60,
                                overflowWrap: 'break-word', wordBreak: 'break-word'
                            }}
                        />
                    ) : (
                        <div style={{ minWidth: 0, width: '100%' }}>
                            {seg.translation ? (
                                <p
                                    style={{
                                        margin: 0, color: 'var(--text)', lineHeight: 1.5,
                                        whiteSpace: 'pre-wrap', overflowWrap: 'break-word', wordBreak: 'break-word',
                                        fontSize: 14
                                    }}
                                    dangerouslySetInnerHTML={{ __html: highlightGlossary(seg.translation, glossary).replace(/\n/g, '<br/>') }}
                                />
                            ) : (
                                <p style={{
                                    margin: 0,
                                    color: translatingLine ? 'var(--amber)' : 'rgba(245,158,11,0.45)',
                                    lineHeight: 1.5,
                                    fontStyle: 'italic',
                                    fontSize: 14, // Matches actual text size
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    animation: translatingLine ? 'shimmer 1.5s infinite' : 'none',
                                    minHeight: 21
                                }}>
                                    {translatingLine ? (
                                        <>
                                            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>✦</span>
                                            AI sedang merangkai kalimat...
                                        </>
                                    ) : (
                                        <>✦ belum ditranslate</>
                                    )}
                                </p>
                            )}
                            {seg.flag_note && (
                                <p style={{ margin: '4px 0 0', color: 'var(--red)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <Flag size={12} fill="currentColor" /> {seg.flag_note}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Status badge */}
                <div style={{ width: 100, paddingTop: 2, flexShrink: 0 }}>
                    {isSkipped ? (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 12,
                            background: 'rgba(209,213,219,0.12)', color: '#d1d5db',
                            fontWeight: 600
                        }}>
                            ♪ Skipped
                        </span>
                    ) : translatingLine ? (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 12,
                            background: 'rgba(245, 158, 11, 0.15)', color: 'var(--amber)',
                            fontWeight: 600, animation: 'shimmer 1.5s infinite',
                            border: '1px solid var(--amber-border)',
                            height: 22, boxSizing: 'border-box',
                            textTransform: 'uppercase', letterSpacing: '0.5px'
                        }}>
                            <span style={{ display: 'inline-block', animation: 'spin 1.5s linear infinite' }}>✦</span>
                            Thinking
                        </span>
                    ) : (
                        <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '3px 8px', borderRadius: 3, fontSize: 12,
                            background: cfg.bg, color: cfg.color,
                            height: 22, boxSizing: 'border-box'
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
                            title={translatingLine ? 'Sedang menerjemahkan...' : `Menerjemahkan baris ini (${hasAIKey ? 'AI Gemini' : 'Google Translate'})`}
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

                    <ActionBtn
                        title={seg.status === 'flagged' ? "Unflag" : "Flag"}
                        onClick={() => seg.status === 'flagged' ? unflag(seg.id) : setFlaggingId(seg.id)}
                        color={seg.status === 'flagged' ? 'var(--text)' : 'var(--red)'}
                        active={seg.status === 'flagged'}
                    >
                        <Flag size={14} fill={seg.status === 'flagged' ? "currentColor" : "none"} />
                    </ActionBtn>
                </div>
            </div>

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
