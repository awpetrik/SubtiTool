import { useEffect, useState, useRef, useCallback, useMemo, memo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import useSubtiStore from '../store/useSubtiStore';
import SubtitleRow from '../components/SubtitleRow';
import GlossaryPanel from '../components/GlossaryPanel';
import { HelpCircle, X, BookOpen, BarChart2, Filter, ArrowUp, Trash2, CheckSquare, XSquare, Wand2, Target, ArrowLeftToLine, ArrowRightToLine, Activity, SkipBack, SkipForward } from 'lucide-react';
import SubtiToolLogo from '../components/SubtiToolLogo';
import SubSourceModal from '../components/SubSourceModal';
import FlagModal from '../components/FlagModal';
import FindReplaceModal from '../components/FindReplaceModal';
import { ProjectToolbar } from '../components/ProjectToolbar';
import WaveSurfer from 'wavesurfer.js';
import { VariableSizeList } from 'react-window';

const API = 'http://localhost:8001';

const timecodeToSeconds = (tc) => {
    if (!tc) return 0;
    const [hms, ms] = tc.replace(',', '.').split(/[.,]/);
    if (!hms) return 0;
    const parts = hms.split(':').map(Number);
    const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
    return h * 3600 + m * 60 + s + (ms ? Number(ms) / 1000 : 0);
};

const STATUS_CFG = {
    pending: { label: 'Pending', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', dot: '#94a3b8' },
    ai_done: { label: 'AI Done', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', dot: '#f59e0b' },
    flagged: { label: 'Flagged', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', dot: '#ef4444' },
    in_review: { label: 'In Review', color: '#c084fc', bg: 'rgba(192,132,252,0.12)', dot: '#c084fc' },
    approved: { label: 'Approved', color: '#10b981', bg: 'rgba(16,185,129,0.12)', dot: '#10b981' },
    skipped: { label: 'Skipped', color: '#d1d5db', bg: 'rgba(209,213,219,0.12)', dot: '#d1d5db' },
};

const FILTERS = ['all', 'ai_done', 'flagged', 'in_review', 'approved', 'skipped', 'pending'];

const ROW_HEIGHT_NORMAL = 76;
const ROW_HEIGHT_EDITING = 148;

const SubtitleRowRenderer = memo(({ index, style, data }) => {
    const seg = data[index];
    if (!seg) return null;
    return (
        <div style={style}>
            <SubtitleRow seg={seg} />
        </div>
    );
});

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
        const baseHeight = Math.max(76, 38 + (lineCount * 22) + 12);

        // Add breathing room at the very end
        if (index === filtered.length - 1) return baseHeight + 200;

        return baseHeight;
    }, [filtered, editingId]);

    // Reset cache on edit or filter change
    useEffect(() => {
        if (listRef?.current) {
            listRef.current.resetAfterIndex(0, true);
        }
    }, [editingId, filtered]);

    const [listHeight, setListHeight] = useState(window.innerHeight - 52 - 41);
    useEffect(() => {
        const handleResize = () => setListHeight(window.innerHeight - 52 - 41);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

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
            height={listHeight}
            itemCount={filtered.length}
            itemSize={getSize}
            itemData={filtered}
            itemKey={(index, data) => data[index]?.id || index}
            width="100%"
            overscanCount={8}
            onScroll={onScroll}
            style={{ outline: 'none' }}
        >
            {SubtitleRowRenderer}
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
        tokenUsage: state.tokenUsage || 0,
    })));

    const [showSubSource, setShowSubSource] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    // Viewfinder Native Playback
    const [videoSrc, setVideoSrc] = useState(null);
    const videoRef = useRef(null);
    const waveformRef = useRef(null);
    const wavesurferRef = useRef(null);

    useEffect(() => {
        if (videoSrc && waveformRef.current) {
            const isProxy = videoSrc.includes('_proxy.mp4');

            const wsOptions = {
                container: waveformRef.current,
                waveColor: 'rgba(245,158,11,0.3)',
                progressColor: 'var(--amber)',
                height: 40,
                barWidth: 2,
                normalize: true,
                media: videoRef.current
            };

            // Jika sedang memakai video proxy, WebAudio decoding API bakal crash di browser ('Error code: 5') 
            // karena video 480p proxy masih terlalu berat bagi RAM untuk diekstrak jadi Float32Array
            // Solusi: Kita minta WaveSurfer memuat MP3 16kbps 8kHz super ringan spesifik OOM bypass dari backend
            if (isProxy) {
                wsOptions.url = videoSrc.replace('_proxy.mp4', '_proxy_audio.mp3');
            }

            wavesurferRef.current = WaveSurfer.create(wsOptions);
            return () => wavesurferRef.current.destroy();
        }
    }, [videoSrc]);

    const [showBackToTop, setShowBackToTop] = useState(false);
    const [followPlayback, setFollowPlayback] = useState(true);
    const mainRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => { if (id) loadProject(parseInt(id)); }, [id]);

    useEffect(() => {
        if (id) {
            const savedProxyUrl = localStorage.getItem(`project_proxy_${id}`);
            if (savedProxyUrl) {
                // Optimistic load: set the source immediately so it appears on refresh
                setVideoSrc(savedProxyUrl);

                // Background check: silently verify if it's still on the server
                fetch(savedProxyUrl, { method: 'HEAD' })
                    .then(res => {
                        if (res.status === 404) {
                            // Only if we're sure it's gone, clear it
                            localStorage.removeItem(`project_proxy_${id}`);
                            // If it matches what we just loaded, unset it
                            setVideoSrc(prev => prev === savedProxyUrl ? null : prev);
                        }
                    })
                    .catch(() => {
                        // Network error? Don't unset, the server might just be starting up
                    });
            }
        }
    }, [id]);

    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showFindReplace, setShowFindReplace] = useState(false);

    const lastKeyRef = useRef('');

    const stats = getStats();
    // Memoize filtered segments to avoid O(N) filter on EVERY playback frame
    const filtered = useMemo(() => {
        return filterStatus === 'all' ? segments : segments.filter(s => s.status === filterStatus);
    }, [segments, filterStatus]);

    const pctApproved = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
    const activeSegment = activeSegId ? segments.find(s => s.id === activeSegId) : null;
    const activeIndex = filtered.findIndex(s => s.id === activeSegId);

    // Pre-calculate numerical seconds for all segments to avoid parsing during high-frequency playback events
    const timeCache = useMemo(() => {
        return filtered.map(s => ({
            id: s.id,
            start: timecodeToSeconds(s.timecode_start),
            end: timecodeToSeconds(s.timecode_end)
        }));
    }, [filtered]);

    const timeCacheRef = useRef([]);
    useEffect(() => { timeCacheRef.current = timeCache; }, [timeCache]);

    const flaggingSeg = flaggingId ? segments.find(s => s.id === flaggingId) : null;

    const initialScrollRef = useRef(false);

    // Auto-scroll active row into view via virtual list
    useEffect(() => {
        if (activeIndex >= 0 && listRef.current) {
            // Force scroll on initial mount once data is ready
            if (!initialScrollRef.current) {
                listRef.current.scrollToItem(activeIndex, 'center');
                initialScrollRef.current = true;
                return;
            }

            // Regular follow playback scroll
            if (followPlayback) {
                listRef.current.scrollToItem(activeIndex, 'center');
            }
        }
    }, [activeSegId, activeIndex, followPlayback]);

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
                    case 'x':
                    case 'X':
                        if (activeSegId) toggleSelection(activeSegId);
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
                        togglePlay();
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

    // Keep refs of current state for the setInterval
    const activeSegRef = useRef(null);
    const filteredRef = useRef([]);

    useEffect(() => {
        activeSegRef.current = activeSegment;
        filteredRef.current = filtered;
    }, [activeSegment, filtered]);

    // Jump video to start of segment when active segment changes
    useEffect(() => {
        if (activeSegment && !isPlaying && videoRef.current) {
            videoRef.current.currentTime = timecodeToSeconds(activeSegment.timecode_start);
        }
    }, [activeSegId, activeSegment]);

    const handleVideoTimeUpdate = (curTime) => {
        if (isPlaying) {
            const cache = timeCacheRef.current;
            const currentSeg = cache.find(s => curTime >= s.start && curTime <= s.end);

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

    const [isConvertingProxy, setIsConvertingProxy] = useState(false);
    const [convertStatus, setConvertStatus] = useState(null);

    const handleVideoFile = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Auto-detect Heavy file/MKV (Limit over 300MB)
        if (file.size > 300 * 1024 * 1024 || file.name.endsWith('.mkv') || file.name.endsWith('.avi')) {
            // Cek apakah file ini sebelumnya sudah punya proxy yang masih hidup di server
            const fileCacheKey = `proxy_url_${file.name}_${file.size}`;
            const cachedUrl = localStorage.getItem(fileCacheKey);

            if (cachedUrl) {
                try {
                    const checkRes = await fetch(cachedUrl, { method: 'HEAD' });
                    if (checkRes.ok) {
                        setVideoSrc(cachedUrl);
                        if (id) localStorage.setItem(`project_proxy_${id}`, cachedUrl);
                        return; // Proxy langsung ter-load tanpa harus nge-convert/upload ulang!
                    } else {
                        localStorage.removeItem(fileCacheKey);
                    }
                } catch (e) { }
            }

            const wantsProxy = window.confirm(
                "Video ini berukuran besar/formatnya berat.\nIni bisa bikin browser nge-lag atau crash (patah-patah).\n\nMau saya kecilkan otomatis fiturnya jadi resolusi 480p di background? (Bisa ditinggal kerja/nge-sub dulu)"
            );

            if (wantsProxy) {
                setIsConvertingProxy(true);
                setConvertStatus({ status: "uploading", progress: 0 });
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const taskId = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();
                        xhr.open('POST', `${API}/api/proxy/convert`);
                        xhr.upload.onprogress = (event) => {
                            if (event.lengthComputable) {
                                const percentComplete = Math.round((event.loaded / event.total) * 100);
                                setConvertStatus({ status: "uploading", progress: percentComplete });
                            }
                        };
                        xhr.onload = () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                const res = JSON.parse(xhr.responseText);
                                resolve(res.task_id);
                            } else {
                                reject(new Error("Gagal upload video"));
                            }
                        };
                        xhr.onerror = () => reject(new Error("Network Error saat upload"));
                        xhr.send(formData);
                    });

                    // Polling status konversi
                    setConvertStatus({ status: "converting", progress: 0 });

                    const checkStatus = async () => {
                        try {
                            const res = await fetch(`${API}/api/proxy/status/${taskId}`);
                            const data = await res.json();

                            if (data.status === 'converting') {
                                setConvertStatus({ status: "converting", progress: data.progress });
                                setTimeout(checkStatus, 1500); // poll delay
                            } else if (data.status === 'done') {
                                setConvertStatus(null);
                                setIsConvertingProxy(false);
                                const proxyUrl = `${API}/temp_proxies/${taskId}_proxy.mp4`;
                                setVideoSrc(proxyUrl);

                                // Simpan riwayat proxy ke localStorage
                                localStorage.setItem(`proxy_url_${file.name}_${file.size}`, proxyUrl);
                                if (id) localStorage.setItem(`project_proxy_${id}`, proxyUrl);

                            } else if (data.status === 'error') {
                                throw new Error(data.error || "Gagal convert di server");
                            }
                        } catch (err) {
                            console.error(err);
                            alert("Aduh, backend gagal konversi otomatis: " + err.message);
                            setConvertStatus(null);
                            setIsConvertingProxy(false);
                            setVideoSrc(URL.createObjectURL(file));
                        }
                    };

                    checkStatus();

                } catch (err) {
                    console.error(err);
                    alert("Aduh, gagal convert proxy otomatis. Kita coba load aslinya aja ya...");
                    setConvertStatus(null);
                    setIsConvertingProxy(false);
                    setVideoSrc(URL.createObjectURL(file));
                }
                return;
            } else {
                // User cancelled. Check if we have a stale-but-usable proxy URL for this ID anyway
                const staleProxy = localStorage.getItem(`project_proxy_${id}`);
                if (staleProxy) {
                    setVideoSrc(staleProxy);
                } else {
                    setVideoSrc(URL.createObjectURL(file));
                }
            }
            return;
        }

        // Default (Tolak konversi / file ringan)
        setVideoSrc(URL.createObjectURL(file));
    };

    const fmtTime = t => {
        const m = Math.floor(t / 60).toString().padStart(2, '0');
        const s = (t % 60).toFixed(1).padStart(4, '0');
        return `00:${m}:${s}`;
    };

    const handleScroll = useCallback(({ scrollOffset, scrollDirection, scrollUpdateWasRequested }) => {
        setShowBackToTop(scrollOffset > 400);

        // Jika user scroll manual saat video sedang jalan, hormati kontrol user:
        // auto-follow dimatikan sementara, bisa diaktifkan lagi via toggle.
        if (!scrollUpdateWasRequested && isPlaying && followPlayback) {


            setFollowPlayback(false);
        }
    }, [isPlaying, followPlayback]);

    if (!currentProject) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
            Loading project...
        </div>
    );

    return (
        <div style={{ height: '100vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
            {/* ── HEADER ── */}
            <header style={{
                height: 44, borderBottom: '1px solid var(--border)', background: 'var(--bg-1)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0,
                zIndex: 10
            }}>
                {/* Left: Project Identity & Breadcrumb path */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                        onClick={() => navigate('/')}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'transform 0.2s' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <SubtiToolLogo size={20} color="var(--amber)" />
                        <span style={{ fontSize: 16, color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--display)', letterSpacing: -0.5 }}>SubtiTool</span>
                    </div>

                    <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>{currentProject.title}</span>
                        <span style={{ fontSize: 10, background: 'var(--bg-2)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 3, border: '1px solid var(--border)', fontWeight: 600 }}>
                            {currentProject.lang_from?.toUpperCase()} → {currentProject.lang_to?.toUpperCase()}
                        </span>
                    </div>

                    {/* Auto-save Status tucked next to metadata */}
                    <div style={{
                        marginLeft: 8, paddingLeft: 12, borderLeft: '1px solid var(--border)',
                        height: 14, display: 'flex', alignItems: 'center'
                    }}>
                        <span style={{
                            fontSize: 10, display: 'flex', alignItems: 'center', gap: 5,
                            color: isSaving ? 'var(--amber)' : lastSaved ? '#10b981' : 'transparent',
                            transition: 'color 0.4s', fontWeight: 600
                        }}>
                            {isSaving ? (
                                <span style={{ display: 'inline-block', width: 6, height: 6, border: '1.2px solid var(--amber)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                            ) : (
                                <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#10b981' }} />
                            )}
                            {isSaving ? 'SYNCING...' : 'SAVED'}
                        </span>
                    </div>
                </div>

                <div style={{ flex: 1 }} />

                {/* Right: Global Utilities */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button onClick={() => setShowShortcuts(true)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }} title="Shortcuts">
                        <HelpCircle size={16} />
                    </button>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(45deg, var(--bg-3), var(--bg-1))', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: 'var(--amber)' }}>
                        R
                    </div>
                </div>
            </header>

            {/* Sub-header / Toolbar - Focus on Actions & Health */}
            <div style={{
                height: 42, borderBottom: '1px solid var(--border)', background: 'rgba(9, 9, 11, 0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', flexShrink: 0,
                backdropFilter: 'blur(8px)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <ProjectToolbar />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                    {/* Position Counter */}
                    {activeSegId && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1 }}>INDEX</span>
                            <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--mono)' }}>
                                {Math.max(0, activeIndex) + 1} <span style={{ color: 'rgba(255,255,255,0.1)', fontWeight: 400 }}>/</span> {filtered.length}
                            </span>
                        </div>
                    )}

                    {/* Progress Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 1 }}>COMPLETION</span>
                        <div
                            title={`Approved: ${stats.approved}\nAI Done: ${stats.ai_done}\nSkipped: ${stats.skipped}\nFlagged: ${stats.flagged}\nIn Review: ${stats.in_review}\nPending: ${stats.pending}`}
                            style={{ display: 'flex', width: 140, height: 4, background: 'var(--bg-2)', borderRadius: 2, overflow: 'hidden', cursor: 'help' }}>
                            <div style={{ width: `${(stats.approved / stats.total) * 100}%`, background: '#10b981', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.ai_done / stats.total) * 100}%`, background: '#f59e0b', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.skipped / stats.total) * 100}%`, background: '#9ca3af', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.in_review / stats.total) * 100}%`, background: '#8b5cf6', transition: 'width 0.3s' }} />
                            <div style={{ width: `${(stats.flagged / stats.total) * 100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 800 }}>
                            {stats.total > 0 ? Math.round((stats.approved / (stats.total - Math.max(0, stats.skipped || 0))) * 100) : 0}%
                        </span>
                    </div>

                    <div style={{ width: 1, height: 16, background: 'var(--border)' }} />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                            style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-2)'; e.currentTarget.style.borderColor = 'var(--text-muted)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                            EXPORT
                        </button>
                        <button
                            onClick={() => setShowSubSource(true)}
                            style={{ background: 'var(--amber)', color: '#000', border: '1px solid var(--amber)', padding: '5px 12px', borderRadius: 4, fontSize: 11, fontWeight: 900, cursor: 'pointer', boxShadow: '0 0 15px rgba(245, 158, 11, 0.2)' }}
                        >
                            SUBSOURCE
                        </button>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', flex: 1, overflow: 'hidden', height: 'calc(100vh - 86px)' }}>
                {/* ── LEFT PANEL ── */}
                <aside style={{ width: 260, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0, background: 'var(--bg-1)' }}>
                    {/* Isolated Viewfinder Component to prevent full-page re-renders on timeUpdate */}
                    <div style={{ padding: '12px 14px 10px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <Viewfinder
                            videoSrc={videoSrc}
                            videoRef={videoRef}
                            waveformRef={waveformRef}
                            isPlaying={isPlaying}
                            setIsPlaying={setIsPlaying}
                            onTimeUpdate={handleVideoTimeUpdate}
                            handleVideoFile={handleVideoFile}
                            isConvertingProxy={isConvertingProxy}
                            convertStatus={convertStatus}
                            togglePlay={togglePlay}
                            activeTranslation={activeSegment?.translation}
                        />
                        {/* Playback-follow toggle: default ON, akan otomatis OFF jika user scroll manual saat video jalan */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 11, color: '#fff', fontWeight: 700, letterSpacing: -0.2 }}>Auto-Scroll</span>
                                <span style={{ fontSize: 9, color: 'var(--text-dim)', marginTop: 1 }}>Fokus ke baris aktif</span>
                            </div>
                            <button
                                onClick={() => setFollowPlayback(v => !v)}
                                style={{
                                    borderRadius: 30, border: '1px solid',
                                    borderColor: followPlayback ? 'rgba(245, 158, 11, 0.3)' : 'var(--border)',
                                    padding: '4px 10px', fontSize: 9, fontWeight: 800,
                                    display: 'flex', alignItems: 'center', gap: 6,
                                    background: followPlayback ? 'rgba(245, 158, 11, 0.08)' : 'var(--bg-2)',
                                    color: followPlayback ? 'var(--amber)' : 'var(--text-muted)',
                                    cursor: 'pointer', transition: 'all 0.2s',
                                    textTransform: 'uppercase', letterSpacing: 0.5
                                }}
                            >
                                <div style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: followPlayback ? 'var(--amber)' : '#52525b',
                                    boxShadow: followPlayback ? '0 0 8px var(--amber)' : 'none'
                                }} />
                                {followPlayback ? 'Aktif' : 'Manual'}
                            </button>
                        </div>
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

                                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: 1, fontWeight: 700 }}>🤖 AI USAGE</span>
                                            <span style={{ fontSize: 11, color: 'var(--amber)', fontWeight: 800, fontFamily: 'var(--mono)' }}>{tokenUsage.toLocaleString()} tokens</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 10, color: '#555', lineHeight: 1.4 }}>
                                            Estimasi pemakaian token Gemini Pro untuk sesi ini. (Sangat murah, ~Rp0.05/klik)
                                        </p>
                                    </div>
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
                        onScroll={handleScroll}
                    />
                </main>
            </div>

            {
                showSubSource && (
                    <SubSourceModal
                        projectId={id}
                        projectTitle={currentProject.title}
                        projectLangTo={currentProject.lang_to}
                        onClose={() => setShowSubSource(false)}
                    />
                )
            }

            {
                showShortcuts && (
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
                                        <li><kbd style={kbd}>X</kbd> <span style={{ float: 'right' }}>Toggle select</span></li>
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
                                        <li><kbd style={kbd}>Space</kbd> <span style={{ float: 'right' }}>Play / Pause</span></li>
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
                )
            }

            {
                showBackToTop && (
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
                )
            }

            {/* FLOATING BULK ACTIONS TOOLBAR */}
            {
                selectedSegIds.size > 0 && (
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
                )
            }

            {
                videoSrc && activeSegId && (
                    <div className="floating-timing-hub">
                        <style>{`
                            @keyframes slideUp {
                                from { transform: translate(-50%, 40px); opacity: 0; }
                                to { transform: translate(-50%, 0); opacity: 1; }
                            }
                            .floating-timing-hub {
                                position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
                                background: rgba(12, 12, 14, 0.85); backdrop-filter: blur(14px);
                                border: 1px solid rgba(245, 158, 11, 0.25); padding: 8px 8px 8px 16px;
                                border-radius: 100px; display: flex; align-items: center; gap: 12px;
                                box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 20px rgba(245, 158, 11, 0.05);
                                z-index: 900; animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                                user-select: none;
                            }
                            .hub-btn {
                                display: flex; align-items: center; gap: 8px;
                                padding: 8px 16px; border-radius: 100px; background: #1e1e22;
                                border: 1px solid #27272a; color: #a1a1aa; cursor: pointer;
                                transition: all 0.2s; font-size: 11px; font-weight: 700;
                            }
                            .hub-btn:hover { background: #27272a; color: #fff; border-color: #3f3f46; transform: translateY(-1px); }
                            .hub-btn.active { color: var(--amber); border-color: rgba(245, 158, 11, 0.4); background: rgba(245, 158, 11, 0.08); }
                            .hub-btn.active:hover { background: rgba(245, 158, 11, 0.12); }
                            .hub-pulse {
                                width: 8px; height: 8px; border-radius: 50%;
                                background: var(--amber); box-shadow: 0 0 10px var(--amber);
                                animation: hub-pulse 1.5s infinite;
                            }
                            @keyframes hub-pulse {
                                0% { transform: scale(1); opacity: 0.8; }
                                50% { transform: scale(1.3); opacity: 1; }
                                100% { transform: scale(1); opacity: 0.8; }
                            }
                        `}</style>

                        {/* Playhead Info */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 12, borderRight: '1px solid #27272a' }}>
                            <div className={isPlaying ? 'hub-pulse' : ''} style={{ width: 8, height: 8, borderRadius: '50%', background: isPlaying ? 'var(--amber)' : '#3f3f46' }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: 13, fontWeight: 900, color: '#fff', fontFamily: 'var(--mono)', lineHeight: 1 }}>
                                    {videoRef.current ? fmtTime(videoRef.current.currentTime) : '00:00:00'}
                                </span>
                                <span style={{ fontSize: 8, fontWeight: 700, color: '#52525b', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>PLAYHEAD</span>
                            </div>
                        </div>

                        {/* Punch Actions */}
                        <button className="hub-btn active" onClick={() => useSubtiStore.getState().updateTimecode(activeSegId, 'start', videoRef.current.currentTime)}>
                            <ArrowLeftToLine size={15} /> SET START [
                        </button>
                        <button className="hub-btn active" onClick={() => useSubtiStore.getState().updateTimecode(activeSegId, 'end', videoRef.current.currentTime)}>
                            <ArrowRightToLine size={15} /> SET END ]
                        </button>

                        <div style={{ width: 1, height: 24, background: '#27272a', margin: '0 4px' }} />

                        {/* Jump Action */}
                        <button className="hub-btn" onClick={() => { if (activeSegment) videoRef.current.currentTime = timecodeToSeconds(activeSegment.timecode_start); }}>
                            <Target size={15} /> JUMP TO SEGMENT
                        </button>
                    </div>
                )
            }
            {showFindReplace && <FindReplaceModal onClose={() => setShowFindReplace(false)} />}
            {
                flaggingId && flaggingSeg && (
                    <FlagModal segId={flaggingId} initialNote={flaggingSeg.flag_note} onClose={() => setFlaggingId(null)} />
                )
            }
        </div>
    );
}

const kbd = {
    background: '#222', border: '1px solid #333', borderRadius: 4, padding: '2px 6px',
    fontFamily: 'var(--mono)', fontSize: 10, color: '#e5e7eb', boxShadow: '0 2px 0 #111'
};

const fmtTime = t => {
    const m = Math.floor(t / 60).toString().padStart(2, '0');
    const s = (t % 60).toFixed(1).padStart(4, '0');
    return `00:${m}:${s}`;
};

const Viewfinder = memo(({
    videoSrc, videoRef, waveformRef, isPlaying, setIsPlaying,
    onTimeUpdate, handleVideoFile, isConvertingProxy, convertStatus,
    togglePlay, activeTranslation
}) => {
    const [videoTime, setVideoTime] = useState(0);

    const internalTimeUpdate = () => {
        if (!videoRef.current) return;
        const curTime = videoRef.current.currentTime;
        setVideoTime(curTime);

        onTimeUpdate(curTime);
    };
    return (
        <>
            {videoSrc ? (
                <div style={{ height: 140, background: '#000', borderRadius: 6, position: 'relative', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <video
                        ref={videoRef}
                        src={videoSrc}
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onTimeUpdate={internalTimeUpdate}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                        autoPlay={false}
                        controls={false}
                        playsInline
                        disablePictureInPicture
                        disableRemotePlayback
                        preload="auto"
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '4px 12px 10px', background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', pointerEvents: 'none' }}>
                        {activeTranslation && (
                            <p style={{ margin: 0, color: '#fff', fontSize: 13, textAlign: 'center', textShadow: '0 1px 4px #000', fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', lineHeight: 1.3 }}
                                dangerouslySetInnerHTML={{ __html: activeTranslation }}
                            />
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ height: 140, background: 'var(--bg-2)', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border)', padding: 16, textAlign: 'center', gap: 10 }}>
                    {isConvertingProxy ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', padding: '0 16px' }}>
                            <div style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, textAlign: 'center', lineHeight: 1.4, letterSpacing: 0.5 }}>
                                {convertStatus?.status === 'uploading' ? (
                                    <>Mengunggah file...</>
                                ) : (
                                    <>Mengonversi<span style={{ display: 'block', fontSize: 10, opacity: 0.8 }}>(Proxy 480p)</span></>
                                )}
                                <span style={{ display: 'block', fontSize: 18, marginTop: 4 }}>{convertStatus?.progress}%</span>
                            </div>
                            <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    background: 'var(--amber)',
                                    width: `${convertStatus?.progress || 0}%`,
                                    transition: 'width 0.3s linear'
                                }} />
                            </div>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.3 }}>Berjalan di memori latar.<br />Silakan kerjakan fitur lain.</span>
                        </div>
                    ) : (
                        <>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Load a video/audio file to preview sync</span>
                            <label style={{ display: 'inline-block', background: 'var(--amber)', color: '#000', padding: '6px 12px', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                                Load Media
                                <input type="file" accept="video/*,audio/*" onChange={handleVideoFile} style={{ display: 'none' }} />
                            </label>
                        </>
                    )}
                </div>
            )}

            {
                videoSrc && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
                        {/* Transport Row: Rewind | Play/Pause | Forward */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                            <button
                                onClick={() => { if (videoRef.current) videoRef.current.currentTime -= 5; }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title="Back 5s"
                            >
                                <SkipBack size={18} />
                            </button>

                            <button onClick={togglePlay} style={{
                                background: 'var(--amber)', color: '#000', border: 'none',
                                width: 42, height: 42, borderRadius: '50%', fontSize: 16,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                transition: 'all 0.2s', flexShrink: 0, cursor: 'pointer',
                                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                                paddingLeft: isPlaying ? 0 : 3
                            }}>
                                {isPlaying ? '⏸' : '▶'}
                            </button>

                            <button
                                onClick={() => { if (videoRef.current) videoRef.current.currentTime += 5; }}
                                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                title="Forward 5s"
                            >
                                <SkipForward size={18} />
                            </button>
                        </div>

                        {/* Seeker Row */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div title="Seek Video" onClick={e => {
                                if (!videoRef.current) return;
                                const rect = e.currentTarget.getBoundingClientRect();
                                const pct = (e.clientX - rect.left) / rect.width;
                                videoRef.current.currentTime = pct * videoRef.current.duration;
                            }} style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden', cursor: 'pointer', position: 'relative' }}>
                                <div style={{ height: '100%', background: 'linear-gradient(to right, var(--amber), #fbbf24)', width: `${videoRef.current?.duration ? (videoTime / videoRef.current.duration) * 100 : 0}%`, transition: 'width 0.1s linear' }} />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: 13, color: 'var(--amber)', fontVariantNumeric: 'tabular-nums', fontWeight: 900, fontFamily: 'var(--mono)', letterSpacing: -0.5 }}>
                                    {fmtTime(videoTime)}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                    {videoRef.current?.duration ? fmtTime(videoRef.current.duration) : '--:--:--'}
                                </span>
                            </div>
                        </div>

                        {/* Waveform Container */}
                        <div ref={waveformRef} style={{ width: '100%', overflow: 'hidden', borderRadius: 6, background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.03)' }} />
                    </div>
                )
            }
        </>
    );
});
