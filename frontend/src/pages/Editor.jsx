import { useEffect, useState, useRef, useCallback, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useSubtiStore from '../store/useSubtiStore';
import SubtitleRow from '../components/SubtitleRow';
import GlossaryPanel from '../components/GlossaryPanel';
import { HelpCircle, X, BookOpen, BarChart2, Filter, ArrowUp, Trash2, CheckSquare, XSquare, Wand2 } from 'lucide-react';
import SubtiToolLogo from '../components/SubtiToolLogo';
import SubSourceModal from '../components/SubSourceModal';
import FlagModal from '../components/FlagModal';
import FindReplaceModal from '../components/FindReplaceModal';
import { ProjectToolbar } from '../components/ProjectToolbar';
import WaveSurfer from 'wavesurfer.js';
import { Menu, Item, Separator } from 'react-contexify';
import 'react-contexify/dist/ReactContexify.css';
import { VariableSizeList } from 'react-window';

const API = 'http://localhost:8000';

const STATUS_CFG = {
    pending: { label: 'Pending', color: '#64748b', bg: 'rgba(100,116,139,0.12)', dot: '#64748b' },
    ai_done: { label: 'AI Done', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
    flagged: { label: 'Flagged', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', dot: '#ef4444' },
    in_review: { label: 'In Review', color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', dot: '#8b5cf6' },
    approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
    skipped: { label: 'Skipped', color: '#9ca3af', bg: 'rgba(156,163,175,0.12)', dot: '#9ca3af' },
};

const FILTERS = ['all', 'ai_done', 'flagged', 'in_review', 'approved', 'skipped', 'pending'];

const ROW_HEIGHT_NORMAL = 76;
const ROW_HEIGHT_EDITING = 148;

const SubtitleList = memo(function SubtitleList({ segments, filterStatus, listRef, onScroll }) {
    const filtered = filterStatus === 'all' ? segments : segments.filter(s => s.status === filterStatus);
    const editingId = useSubtiStore(state => state.editingId);
    const sizeMap = useRef({});

    const getSize = useCallback((index) => {
        const seg = filtered[index];
        if (!seg) return 76;

        if (editingId === seg.id) return 160;

        const originalText = seg.original || "";
        const translationText = seg.translation || "";
        const longestText = originalText.length > translationText.length ? originalText : translationText;

        // Est. lines from actual breaks
        const linesBreak = longestText.split('\n').length;
        // Est. wraps (narrow columns ~50-60 char/line)
        const estWraps = Math.ceil(longestText.length / 55);
        const lineCount = Math.max(linesBreak, estWraps);

        // Base (padding/meta) + (lines * line-height)
        return Math.max(76, 38 + (lineCount * 22) + 12);
    }, [filtered, editingId]);

    // Reset cache on edit or filter change
    useEffect(() => {
        if (listRef?.current) {
            listRef.current.resetAfterIndex(0, true);
        }
    }, [editingId, filtered]);

    if (filtered.length === 0) {
        return (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', padding: 40 }}>
                Tidak ada segment dengan filter ini.
            </div>
        );
    }

    return (
        <VariableSizeList
            ref={listRef}
            height={window.innerHeight - 52 - 41} // viewport - header - table-header
            itemCount={filtered.length}
            itemSize={getSize}
            width="100%"
            overscanCount={8}
            onScroll={onScroll}
            style={{ outline: 'none' }}
        >
            {({ index, style }) => (
                <div style={style}>
                    <SubtitleRow seg={filtered[index]} />
                </div>
            )}
        </VariableSizeList>
    );
});

export default function EditorPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const {
        currentProject, segments, glossary,
        filterStatus, setFilter,
        activeSegId, setActiveSegId,
        sidePanel, setSidePanel,
        loadProject, getStats,
        selectedSegIds, approveSelected, clearSelectedTranslation, skipSelected, clearSelection,
        isSaving, lastSaved,
        flaggingId, setFlaggingId,
    } = useSubtiStore(useShallow(state => ({
        currentProject: state.currentProject,
        segments: state.segments,
        glossary: state.glossary,
        filterStatus: state.filterStatus,
        setFilter: state.setFilter,
        activeSegId: state.activeSegId,
        setActiveSegId: state.setActiveSegId,
        sidePanel: state.sidePanel,
        setSidePanel: state.setSidePanel,
        loadProject: state.loadProject,
        getStats: state.getStats,
        selectedSegIds: state.selectedSegIds,
        approveSelected: state.approveSelected,
        clearSelectedTranslation: state.clearSelectedTranslation,
        skipSelected: state.skipSelected,
        clearSelection: state.clearSelection,
        isSaving: state.isSaving,
        lastSaved: state.lastSaved,
        flaggingId: state.flaggingId,
        setFlaggingId: state.setFlaggingId,
    })));

    const [showSubSource, setShowSubSource] = useState(false);
    const [videoTime, setVideoTime] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);

    // Viewfinder Native Playback
    const [videoSrc, setVideoSrc] = useState(null);
    const videoRef = useRef(null);
    const waveformRef = useRef(null);
    const wavesurferRef = useRef(null);

    useEffect(() => {
        if (videoSrc && waveformRef.current) {
            wavesurferRef.current = WaveSurfer.create({
                container: waveformRef.current,
                waveColor: 'rgba(245,158,11,0.3)',
                progressColor: 'var(--amber)',
                height: 40,
                barWidth: 2,
                normalize: true,
                media: videoRef.current
            });
            return () => wavesurferRef.current.destroy();
        }
    }, [videoSrc]);

    const [showBackToTop, setShowBackToTop] = useState(false);
    const mainRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => { if (id) loadProject(parseInt(id)); }, [id]);

    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);

    const lastKeyRef = useRef('');

    const stats = getStats();
    // filtered is still calculated here for navigation math, but UI list generation is skipped
    const filtered = filterStatus === 'all' ? segments : segments.filter(s => s.status === filterStatus);
    const pctApproved = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const activeSegment = activeSegId ? segments.find(s => s.id === activeSegId) : null;
    const activeIndex = filtered.findIndex(s => s.id === activeSegId);
    const flaggingSeg = flaggingId ? segments.find(s => s.id === flaggingId) : null;

    // Auto-scroll active row into view via virtual list
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            listRef.current.scrollToItem(activeIndex, 'smart');
        }
    }, [activeSegId]);

    // Handle global keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'h' || e.key === 'H')) {
                e.preventDefault();
                setShowFindReplace(true);
                return;
            }

            const {
                editingId, startEdit, toggleSelection, selectAllVisible,
                clearSelection, undoAction, approveSelected, approve,
                retranslate, setFlaggingId, skipRow, bulkSkipCandidates,
                updateTimecode,
            } = useSubtiStore.getState();

            // If we are editing or inside any input, let local events handle it
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || editingId) return;
            if (!filtered || !filtered.length) return;

            const currIdx = activeIndex === -1 ? 0 : activeIndex;
            const setAndScroll = (idx) => {
                const bounded = Math.max(0, Math.min(filtered.length - 1, idx));
                setActiveSegId(filtered[bounded].id);
            };

            let handled = true;

            if (e.key === '?') {
                setShowShortcuts(s => !s);
            } else if (e.ctrlKey || e.metaKey) {
                if (e.key === 'a' || e.key === 'A') {
                    selectAllVisible(filtered.map(s => s.id));
                } else if (e.key === 'Enter') {
                    approveSelected();
                } else if (e.key === 'z' || e.key === 'Z') {
                    undoAction();
                } else {
                    handled = false;
                }
            } else {
                switch (e.key) {
                    case 'ArrowDown':
                    case 'j':
                        if (e.shiftKey) toggleSelection(filtered[currIdx].id);
                        setAndScroll(currIdx + 1);
                        if (e.shiftKey) toggleSelection(filtered[Math.min(filtered.length - 1, currIdx + 1)].id);
                        break;
                    case 'ArrowUp':
                    case 'k':
                        if (e.shiftKey) toggleSelection(filtered[currIdx].id);
                        setAndScroll(currIdx - 1);
                        if (e.shiftKey) toggleSelection(filtered[Math.max(0, currIdx - 1)].id);
                        break;
                    case 'PageDown':
                        setAndScroll(currIdx + 10);
                        break;
                    case 'PageUp':
                        setAndScroll(currIdx - 10);
                        break;
                    case 'g':
                        if (lastKeyRef.current === 'g') {
                            setAndScroll(0);
                            lastKeyRef.current = '';
                        } else {
                            lastKeyRef.current = 'g';
                            setTimeout(() => { lastKeyRef.current = ''; }, 500);
                            handled = false;
                        }
                        break;
                    case 'G':
                        setAndScroll(filtered.length - 1);
                        break;
                    case 'Enter':
                    case 'F2':
                        if (activeSegment) startEdit(activeSegment);
                        break;
                    case '[':
                        if (videoRef.current && activeSegId) {
                            updateTimecode(activeSegId, 'start', videoRef.current.currentTime);
                        }
                        break;
                    case ']':
                        if (videoRef.current && activeSegId) {
                            updateTimecode(activeSegId, 'end', videoRef.current.currentTime);
                        }
                        break;
                    case 'a':
                    case 'A':
                        if (activeSegId) approve(activeSegId);
                        break;
                    case 'r':
                    case 'R':
                        if (activeSegId) retranslate(activeSegId);
                        break;
                    case 'u':
                    case 'U':
                        if (activeSegId) undoAction(activeSegId);
                        break;
                    case 'f':
                    case 'F':
                        if (activeSegId) setFlaggingId(activeSegId);
                        break;
                    case 'n':
                    case 'N': {
                        let i = currIdx + 1;
                        let found = false;
                        while (i < filtered.length) {
                            if (filtered[i].status === 'pending' || filtered[i].status === 'ai_done') {
                                setAndScroll(i);
                                found = true;
                                break;
                            }
                            i++;
                        }
                        if (!found && currIdx !== filtered.length - 1) setAndScroll(filtered.length - 1);
                        break;
                    }
                    case 's':
                        if (activeSegId) skipRow(activeSegId);
                        setAndScroll(currIdx + 1);
                        break;
                    case 'S':
                        if (e.shiftKey) {
                            if (window.confirm("Auto-skip semua baris lirik & sound effects sekaligus?")) {
                                bulkSkipCandidates();
                            }
                        } else {
                            if (activeSegId) skipRow(activeSegId);
                            setAndScroll(currIdx + 1);
                        }
                        break;
                    case ' ':
                        if (activeSegId) toggleSelection(activeSegId);
                        break;
                    case 'Escape':
                        clearSelection();
                        break;
                    default:
                        handled = false;
                }
            }
            if (handled) e.preventDefault();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeSegId, filtered, activeIndex]);

    const handleContextItemClick = async ({ id: actionId, props }) => {
        const { textSelection, range, seg, editValueSnapshot } = props;
        if (!textSelection || !range || editValueSnapshot === null) {
            // If no selection or not in editing mode at time of right-click
            alert('Pilih teks dulu di dalam kolom terjemahan saat sedang dalam mode edit (double-click baris terlebih dahulu).');
            return;
        }

        if (actionId === 'translate') {
            const res = await useSubtiStore.getState().translateSnippet(textSelection);
            if (res.success && res.translation) {
                // Use the snapshot taken at right-click time, not stale editValue
                const newText =
                    editValueSnapshot.substring(0, range.start) +
                    res.translation +
                    editValueSnapshot.substring(range.end);
                // Patch directly to API and re-open editing with new text
                await useSubtiStore.getState().saveEditWithValue(seg.id, newText);
                // Re-open editing so user can continue
                const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
                if (updatedSeg) {
                    useSubtiStore.getState().startEdit({ ...updatedSeg, translation: newText });
                }
            } else {
                alert('Gagal: ' + (res.error || 'Terjadi kesalahan tidak dikenal.'));
            }
        } else if (actionId === 'clear') {
            const newText =
                editValueSnapshot.substring(0, range.start) +
                editValueSnapshot.substring(range.end);
            await useSubtiStore.getState().saveEditWithValue(seg.id, newText);
            const updatedSeg = useSubtiStore.getState().segments.find(s => s.id === seg.id);
            if (updatedSeg) {
                useSubtiStore.getState().startEdit({ ...updatedSeg, translation: newText });
            }
        }
    };

    const timecodeToSeconds = (tc) => {
        if (!tc) return 0;
        const [hms, ms] = tc.replace(',', '.').split(/[.,]/);
        if (!hms) return 0;
        const parts = hms.split(':').map(Number);
        const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
        return h * 3600 + m * 60 + s + (ms ? Number(ms) / 1000 : 0);
    };

    // Keep refs of current state for the setInterval
    const activeSegRef = useRef(null);
    const filteredRef = useRef([]);

    useEffect(() => {
        activeSegRef.current = activeSegment;
        filteredRef.current = filtered;
    }, [activeSegment, filtered]);

    // Jump video to start of segment when active segment changes
    useEffect(() => {
        if (activeSegment && !isPlaying) {
            setVideoTime(timecodeToSeconds(activeSegment.timecode_start));
        }
    }, [activeSegId, activeSegment]);

    const handleVideoTimeUpdate = () => {
        if (!videoRef.current) return;
        const curTime = videoRef.current.currentTime;
        setVideoTime(curTime);

        if (isPlaying) {
            const list = filteredRef.current;
            const currentSeg = list.find(s => {
                const start = timecodeToSeconds(s.timecode_start);
                const end = timecodeToSeconds(s.timecode_end);
                return curTime >= start && curTime <= end; // active strictly inside its time bounds
            });

            // If we're playing and entering a new segment, auto-advance Editor focus
            // BUT do not hijack if the user is typing (editingId is not null)
            const isEditing = useSubtiStore.getState().editingId !== null;
            if (currentSeg && currentSeg.id !== activeSegRef.current?.id && !isEditing) {
                useSubtiStore.getState().setActiveSegId(currentSeg.id);
            }
        }
    };

    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
        } else {
            videoRef.current.play();
        }
        setIsPlaying(!isPlaying);
    };

    const handleVideoFile = (e) => {
        const file = e.target.files[0];
        if (file) {
            setVideoSrc(URL.createObjectURL(file));
        }
    };

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
        <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            {/* ── HEADER ── */}
            <header style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0 20px', height: 52, borderBottom: '1px solid var(--border)',
                position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 100,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 16 }}>←</button>
                    <span style={{ fontSize: 16, color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--display)', letterSpacing: -0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SubtiToolLogo size={18} /> SubtiTool
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{currentProject.title}</span>
                    <span style={{ fontSize: 11, background: 'var(--amber-dim)', color: 'var(--amber)', padding: '2px 8px', borderRadius: 3, border: '1px solid var(--amber-border)' }}>
                        {currentProject.lang_from?.toUpperCase()} → {currentProject.lang_to?.toUpperCase()}
                    </span>
                    {/* Auto-save indicator */}
                    <span style={{
                        fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
                        color: isSaving ? 'var(--amber)' : lastSaved ? '#10b981' : 'transparent',
                        transition: 'color 0.4s',
                    }}>
                        {isSaving ? (
                            <>
                                <span style={{
                                    display: 'inline-block', width: 8, height: 8,
                                    border: '1.5px solid var(--amber)', borderTopColor: 'transparent',
                                    borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                                }} />
                                Menyimpan...
                            </>
                        ) : lastSaved ? (
                            <>
                                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                                    <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                Tersimpan
                            </>
                        ) : null}
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {activeSegId && (
                            <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 700, background: 'var(--amber-dim)', padding: '2px 8px', borderRadius: 4 }}>
                                Row {Math.max(0, activeIndex) + 1} of {filtered.length}
                            </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{stats.total > 0 ? Math.round((stats.approved / (stats.total - Math.max(0, stats.skipped || 0))) * 100) : 0}% approved</span>
                        <div
                            title={`Approved: ${stats.approved}\nAI Done: ${stats.ai_done}\nSkipped: ${stats.skipped}\nFlagged: ${stats.flagged}\nIn Review: ${stats.in_review}\nPending: ${stats.pending}`}
                            style={{ display: 'flex', width: 140, height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', cursor: 'help' }}>
                            <div style={{ width: `${(stats.approved / stats.total) * 100}%`, background: '#10b981', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.ai_done / stats.total) * 100}%`, background: '#f59e0b', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.skipped / stats.total) * 100}%`, background: '#9ca3af', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.in_review / stats.total) * 100}%`, background: '#8b5cf6', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.flagged / stats.total) * 100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
                        </div>
                    </div>

                    <ProjectToolbar />

                    <button
                        onClick={async () => {
                            const res = await fetch(`${API}/api/projects/${id}/export`);
                            const blob = await res.blob();
                            const safeTitle = (currentProject?.title || 'subtitle').replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
                            const filename = `${safeTitle}_${currentProject?.lang_to || 'id'}.srt`;
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = filename;
                            document.body.appendChild(a); a.click();
                            document.body.removeChild(a); URL.revokeObjectURL(url);
                        }}
                        style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', padding: '5px 14px', borderRadius: 4, fontSize: 12 }}
                    >
                        Export SRT
                    </button>
                    <button
                        onClick={() => setShowSubSource(true)}
                        style={{ background: 'var(--amber)', color: '#000', border: 'none', padding: '5px 14px', borderRadius: 4, fontSize: 12, fontWeight: 800 }}
                    >
                        ↑ SubSource
                    </button>
                    <button onClick={() => setShowShortcuts(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }} title="Keyboard Shortcuts (?)">
                        <HelpCircle size={16} />
                    </button>
                </div>
            </header>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 52px)' }}>
                {/* ── LEFT PANEL ── */}
                <aside style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0, background: 'var(--bg-1)' }}>
                    {/* Viewfinder */}
                    <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {videoSrc ? (
                            <div style={{ height: 140, background: '#000', borderRadius: 6, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <video
                                    ref={videoRef}
                                    src={videoSrc}
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    onTimeUpdate={handleVideoTimeUpdate}
                                    onEnded={() => setIsPlaying(false)}
                                    autoPlay={false}
                                    controls={false}
                                />
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 12px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', pointerEvents: 'none' }}>
                                    {activeSegment?.translation && (
                                        <p style={{ margin: 0, color: '#fff', fontSize: 13, textAlign: 'center', textShadow: '0 1px 4px #000', fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}
                                            dangerouslySetInnerHTML={{ __html: activeSegment.translation }}
                                        />
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ height: 140, background: 'var(--bg-2)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', padding: 16, textAlign: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Load a video/audio file to preview sync</span>
                                <label style={{ display: 'inline-block', background: 'var(--amber)', color: '#000', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                    Load Media
                                    <input type="file" accept="video/*,audio/*" onChange={handleVideoFile} style={{ display: 'none' }} />
                                </label>
                            </div>
                        )}

                        {videoSrc && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <button onClick={togglePlay} style={{ background: 'var(--amber-dim)', border: '1px solid var(--amber-border)', color: 'var(--amber)', width: 28, height: 28, borderRadius: '50%', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', paddingLeft: isPlaying ? 0 : 2 }}>
                                        {isPlaying ? '⏸' : '▶'}
                                    </button>
                                    <div title="Seek Video" onClick={e => {
                                        if (!videoRef.current) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const pct = (e.clientX - rect.left) / rect.width;
                                        videoRef.current.currentTime = pct * videoRef.current.duration;
                                    }} style={{ flex: 1, height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
                                        <div style={{ height: '100%', background: 'var(--amber)', width: `${videoRef.current?.duration ? (videoTime / videoRef.current.duration) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--amber)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmtTime(videoTime)}</span>
                                </div>
                                {/* Waveform Container */}
                                <div ref={waveformRef} style={{ width: '100%', overflow: 'hidden', borderRadius: 4, background: '#111' }} />
                            </div>
                        )}
                    </div>

                    {/* Filter pills */}
                    <div style={{ padding: '16px 16px 12px' }}>
                        <p style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12, fontWeight: 700 }}><Filter size={12} /> FILTER</p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {FILTERS.map(f => {
                                const cfg = STATUS_CFG[f];
                                const count = f === 'all' ? stats.total : stats[f];
                                const active = filterStatus === f;
                                return (
                                    <button key={f} onClick={() => setFilter(f)} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '7px 12px', borderRadius: 4, fontSize: 12,
                                        border: `1px solid ${active ? (cfg?.color || 'var(--amber)') : 'transparent'}`,
                                        background: active ? (cfg?.bg || 'rgba(255,255,255,0.08)') : 'transparent',
                                        color: active ? (cfg?.color || 'var(--text)') : 'var(--text-muted)',
                                        transition: 'all 0.15s',
                                    }}>
                                        <span>{f === 'all' ? 'All' : cfg.label}</span>
                                        <span style={{ fontSize: 10, background: active ? 'transparent' : 'var(--bg-2)', padding: '2px 6px', borderRadius: 10, color: active ? 'currentColor' : '#555' }}>{count}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Glossary / Stats tabs */}
                    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', background: 'var(--bg-2)', borderRadius: 6, padding: 3, marginTop: 16, marginBottom: 16 }}>
                            {[
                                { id: 'glossary', label: 'Glossary', icon: <BookOpen size={12} /> },
                                { id: 'stats', label: 'Stats', icon: <BarChart2 size={12} /> }
                            ].map(p => (
                                <button key={p.id} onClick={() => setSidePanel(p.id)} style={{
                                    flex: 1, background: sidePanel === p.id ? 'var(--bg-1)' : 'transparent', border: 'none', padding: '6px 0',
                                    fontSize: 11, color: sidePanel === p.id ? 'var(--amber)' : 'var(--text-muted)',
                                    borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    boxShadow: sidePanel === p.id ? '0 1px 3px rgba(0,0,0,0.4)' : 'none',
                                    transition: 'all 0.15s',
                                }}>
                                    {p.icon} {p.label}
                                </button>
                            ))}
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: 4 }}>
                            {sidePanel === 'glossary' ? (
                                <GlossaryPanel />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {Object.entries(stats).filter(([k]) => k !== 'total').map(([k, v]) => {
                                        const cfg = STATUS_CFG[k];
                                        return (
                                            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <div style={{ width: 6, height: 6, borderRadius: '50%', background: cfg?.dot, flexShrink: 0 }} />
                                                <span style={{ color: 'var(--text-muted)', fontSize: 12, flex: 1 }}>{cfg?.label || k}</span>
                                                <div style={{ width: 60, height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', borderRadius: 2, background: cfg?.dot, width: `${stats.total > 0 ? (v / stats.total) * 100 : 0}%`, transition: 'width 0.5s' }} />
                                                </div>
                                                <span style={{ color: 'var(--text)', fontSize: 11, minWidth: 20, textAlign: 'right' }}>{v}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* ── MAIN EDITOR ── */}
                <main
                    ref={mainRef}
                    style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                >
                    {/* Table header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px',
                        borderBottom: '1px solid var(--border)', fontSize: 10, letterSpacing: 1,
                        color: 'var(--text-muted)', background: 'var(--bg)', zIndex: 10, flexShrink: 0,
                    }}>
                        <span style={{ width: 36, flexShrink: 0 }}>#</span>
                        <span style={{ width: 160, flexShrink: 0 }}>TIMECODE</span>
                        <span style={{ flex: 1, minWidth: 0 }}>ORIGINAL</span>
                        <span style={{ flex: 1, minWidth: 0 }}>TERJEMAHAN</span>
                        <span style={{ width: 100, flexShrink: 0 }}>STATUS</span>
                        <span style={{ width: 116, flexShrink: 0 }}>AKSI</span>
                    </div>

                    <SubtitleList
                        segments={segments}
                        filterStatus={filterStatus}
                        listRef={listRef}
                        onScroll={({ scrollOffset }) => setShowBackToTop(scrollOffset > 400)}
                    />
                </main>
            </div>

            {showSubSource && (
                <SubSourceModal
                    projectId={id}
                    projectTitle={currentProject.title}
                    projectLangTo={currentProject.lang_to}
                    onClose={() => setShowSubSource(false)}
                />
            )}

            {showShortcuts && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowShortcuts(false)}>
                    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8, padding: 24, width: 600, color: 'var(--text)', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)' }}><HelpCircle size={20} /> Keyboard Shortcuts</h3>
                            <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)' }}><X size={20} /></button>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
                            <div>
                                <h4 style={{ margin: '0 0 10px', color: '#fff', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>Navigation</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                    <li><kbd style={kbd}>↑/↓</kbd> or <kbd style={kbd}>J/K</kbd>  <span style={{ float: 'right' }}>Move row</span></li>
                                    <li><kbd style={kbd}>PgUp/Dn</kbd> <span style={{ float: 'right' }}>Jump 10 rows</span></li>
                                    <li><kbd style={kbd}>gg</kbd> / <kbd style={kbd}>Shift+G</kbd> <span style={{ float: 'right' }}>First / Last row</span></li>
                                </ul>
                                <h4 style={{ margin: '20px 0 10px', color: '#fff', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>Bulk Actions</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                    <li><kbd style={kbd}>Space</kbd> <span style={{ float: 'right' }}>Toggle select</span></li>
                                    <li><kbd style={kbd}>Shift+↑/↓</kbd> <span style={{ float: 'right' }}>Extend select</span></li>
                                    <li><kbd style={kbd}>Ctrl+A</kbd> <span style={{ float: 'right' }}>Select all visible</span></li>
                                    <li><kbd style={kbd}>Ctrl+Enter</kbd> <span style={{ float: 'right' }}>Approve selected</span></li>
                                </ul>
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 10px', color: '#fff', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>Editing (in Row)</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                    <li><kbd style={kbd}>Enter</kbd> / <kbd style={kbd}>F2</kbd> <span style={{ float: 'right' }}>Edit active row</span></li>
                                    <li><kbd style={kbd}>Enter</kbd> <span style={{ float: 'right' }}>Save & Next</span></li>
                                    <li><kbd style={kbd}>Shift+Enter</kbd> <span style={{ float: 'right' }}>Save & Stay</span></li>
                                    <li><kbd style={kbd}>Tab</kbd> <span style={{ float: 'right' }}>Save & Edit Next</span></li>
                                    <li><kbd style={kbd}>Esc</kbd> <span style={{ float: 'right' }}>Cancel edit</span></li>
                                </ul>
                                <h4 style={{ margin: '20px 0 10px', color: '#fff', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>Actions</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                    <li><kbd style={kbd}>A</kbd> <span style={{ float: 'right' }}>Approve row</span></li>
                                    <li><kbd style={kbd}>F</kbd> <span style={{ float: 'right' }}>Flag for review</span></li>
                                    <li><kbd style={kbd}>R</kbd> <span style={{ float: 'right' }}>Re-translate</span></li>
                                    <li><kbd style={kbd}>Ctrl+H</kbd> <span style={{ float: 'right' }}>Global Find/Replace</span></li>
                                    <li><kbd style={kbd}>U</kbd> <span style={{ float: 'right' }}>Undo current row</span></li>
                                    <li><kbd style={kbd}>Ctrl+Z</kbd> <span style={{ float: 'right' }}>Global Undo</span></li>
                                </ul>
                                <h4 style={{ margin: '20px 0 10px', color: '#fff', fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>Sync Media</h4>
                                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 8, color: 'var(--text-muted)' }}>
                                    <li style={{ opacity: videoSrc ? 1 : 0.5 }}>
                                        <kbd style={kbd}>[</kbd> <span style={{ float: 'right' }}>Set Time Start {!videoSrc && '(Media required)'}</span>
                                    </li>
                                    <li style={{ opacity: videoSrc ? 1 : 0.5 }}>
                                        <kbd style={kbd}>]</kbd> <span style={{ float: 'right' }}>Set Time End {!videoSrc && '(Media required)'}</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showBackToTop && (
                <button
                    onClick={() => listRef.current?.scrollTo(0)}
                    style={{
                        position: 'fixed', bottom: 30, right: 30, zIndex: 900,
                        background: 'var(--amber)', color: '#000', border: 'none',
                        width: 44, height: 44, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.4)', transition: 'all 0.2s',
                        cursor: 'pointer'
                    }}
                    title="Kembali ke atas"
                    onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                    onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <ArrowUp size={22} />
                </button>
            )}

            {/* FLOATING BULK ACTIONS TOOLBAR */}
            {selectedSegIds.size > 0 && (
                <div style={{
                    position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                    background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.8)', padding: '12px 24px',
                    display: 'flex', alignItems: 'center', gap: 24, zIndex: 1000,
                    color: '#fff'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, background: 'var(--blue-dim)', color: 'var(--blue)', padding: '2px 8px', borderRadius: 4 }}>
                            {selectedSegIds.size} Baris Terpilih
                        </span>
                        <button onClick={clearSelection} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}>
                            Batal
                        </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={approveSelected} style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid currentColor', padding: '6px 12px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            <CheckSquare size={14} /> Approve Semua
                        </button>
                        <button onClick={skipSelected} style={{ background: 'var(--bg-2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            <XSquare size={14} /> Skip Semua
                        </button>
                        <button onClick={clearSelectedTranslation} style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid currentColor', padding: '6px 12px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            <Trash2 size={14} /> Kosongkan Teks
                        </button>
                    </div>
                </div>
            )}

            {showFindReplace && <FindReplaceModal onClose={() => setShowFindReplace(false)} />}
            {flaggingId && flaggingSeg && (
                <FlagModal segId={flaggingId} initialNote={flaggingSeg.flag_note} onClose={() => setFlaggingId(null)} />
            )}

            {/* CONTEXT MENU */}
            <Menu id="seg-menu" theme="dark" style={{
                fontSize: 13,
                '--contexify-menu-bgColor': '#1a1a1c',
                '--contexify-separator-color': '#2a2a2e',
                '--contexify-item-color': '#c0c0cc',
                '--contexify-activeItem-bgColor': '#28282c',
                '--contexify-activeItem-color': '#fff',
                border: '1px solid #2a2a2e',
                borderRadius: 8,
                boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
            }}>
                <Item id="translate" onClick={handleContextItemClick}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--amber)', fontWeight: 600 }}>
                        <Wand2 size={14} />
                        Translate Teks Ini
                    </div>
                </Item>
                <Separator />
                <Item id="clear" onClick={handleContextItemClick}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--red)' }}>
                        <Trash2 size={14} />
                        Hapus Teks
                    </div>
                </Item>
            </Menu>
        </div>
    );
}

const kbd = {
    background: '#222', border: '1px solid #333', borderRadius: 4, padding: '2px 6px',
    fontFamily: 'var(--mono)', fontSize: 10, color: '#e5e7eb', boxShadow: '0 2px 0 #111'
};
