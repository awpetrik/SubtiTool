import { create } from 'zustand';

export function isSkipCandidate(text) {
  if (!text) return false;
  const clean = text.trim();
  if (clean.replace(/[\W\d_]/g, '') === '') return true;
  if (/^[♪♫]|[♪♫]$/.test(clean)) return true;
  if ((clean.startsWith('[') && clean.endsWith(']')) || (clean.startsWith('(') && clean.endsWith(')'))) {
    if (!clean.includes(':')) return true;
  }
  return false;
}

export const timecodeToSeconds = (tc) => {
  if (!tc) return 0;
  const [hms, ms] = tc.replace(',', '.').split(/[.,]/);
  if (!hms) return 0;
  const parts = hms.split(':').map(Number);
  const h = parts[0] || 0, m = parts[1] || 0, s = parts[2] || 0;
  return h * 3600 + m * 60 + s + (ms ? Number(ms) / 1000 : 0);
};

const API = 'http://localhost:8000';

const useSubtiStore = create((set, get) => ({
  // Project state
  currentProject: null,
  segments: [],
  glossary: [],
  projects: [],

  // UI state
  filterStatus: 'all',
  activeSegId: null,
  editingId: null,
  flaggingId: null,
  editValue: '',
  sidePanel: 'glossary', // 'glossary' | 'stats'
  isTranslating: false,
  jobProgress: { processed: 0, total: 0, logs: [], status: 'idle' },

  // Keyboard navigation state
  selectedSegIds: new Set(),
  undoStack: [],

  // Helpers
  prepareUndo: (segId) => {
    const seg = get().segments.find(s => s.id === segId);
    if (!seg) return;
    set(s => ({
      undoStack: [...s.undoStack, { segId: seg.id, translation: seg.translation, status: seg.status, flag_note: seg.flag_note }]
    }));
  },

  // Actions
  setFilter: (f) => set({ filterStatus: f }),
  setActiveSegId: (id) => set({ activeSegId: id }),
  setFlaggingId: (id) => set({ flaggingId: id }),
  setSidePanel: (p) => set({ sidePanel: p }),

  toggleSelection: (id) => set(s => {
    const newSel = new Set(s.selectedSegIds);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    return { selectedSegIds: newSel };
  }),
  selectAllVisible: (ids) => set({ selectedSegIds: new Set(ids) }),
  clearSelection: () => set({ selectedSegIds: new Set() }),

  replaceText: async (findVal, replaceVal, isRegex, matchWord) => {
    const { segments, currentProject, prepareUndo } = get();
    if (!findVal) return 0;

    let regex;
    try {
      let pattern = isRegex ? findVal : findVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (matchWord) pattern = `\\b${pattern}\\b`;
      regex = new RegExp(pattern, 'g');
    } catch {
      return 0; // invalid regex
    }

    const toUpdate = segments.filter(seg => seg.translation && regex.test(seg.translation));
    if (toUpdate.length === 0) return 0;

    let updatedCount = 0;
    for (const seg of toUpdate) {
      prepareUndo(seg.id);
      const newText = seg.translation.replace(regex, replaceVal);
      if (newText === seg.translation) continue;

      const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${seg.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ translation: newText }),
      });
      if (res.ok) {
        const updated = await res.json();
        set(state => ({ segments: state.segments.map(s => s.id === seg.id ? updated : s) }));
        updatedCount++;
      }
    }
    return updatedCount;
  },

  undoAction: async (targetSegId = null) => {
    const { undoStack, segments, currentProject } = get();
    if (!undoStack.length) return;

    let entry = null, index = -1;
    if (targetSegId) {
      for (let i = undoStack.length - 1; i >= 0; i--) {
        if (undoStack[i].segId === targetSegId) {
          entry = undoStack[i];
          index = i;
          break;
        }
      }
    } else {
      entry = undoStack[undoStack.length - 1];
      index = undoStack.length - 1;
    }

    if (!entry) return;

    const newStack = [...undoStack];
    newStack.splice(index, 1);
    set({ undoStack: newStack });

    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${entry.segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translation: entry.translation, status: entry.status, flag_note: entry.flag_note || '' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === entry.segId ? updated : s) });
    }
  },

  startEdit: (seg) => set({ editingId: seg.id, editValue: seg.translation || '' }),
  cancelEdit: () => set({ editingId: null, editValue: '' }),

  saveEdit: async (segId) => {
    const { currentProject, editValue, segments, prepareUndo } = get();
    prepareUndo(segId);
    set({ editingId: null });
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translation: editValue, status: 'approved' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  approve: async (segId) => {
    const { currentProject, segments, prepareUndo } = get();
    prepareUndo(segId);
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  approveSelected: async () => {
    const { selectedSegIds, segments, currentProject, prepareUndo } = get();
    if (selectedSegIds.size === 0) return;

    const ids = Array.from(selectedSegIds);
    // Doing sequentially to be safe, could be optimized to batch backend API
    for (const id of ids) {
      prepareUndo(id);
      const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      if (res.ok) {
        const updated = await res.json();
        set(state => ({ segments: state.segments.map(s => s.id === id ? updated : s) }));
      }
    }
    set({ selectedSegIds: new Set() });
  },

  setInReview: async (segId) => {
    const { currentProject, segments, prepareUndo } = get();
    prepareUndo(segId);
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  skipRow: async (segId) => {
    const { currentProject, segments, prepareUndo } = get();
    prepareUndo(segId);
    const seg = segments.find(s => s.id === segId);
    if (!seg) return;
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped', translation: seg.original }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  bulkSkipCandidates: async () => {
    const { segments, currentProject, prepareUndo } = get();
    const candidates = segments.filter(s =>
      s.status !== 'skipped' && s.status !== 'approved' && isSkipCandidate(s.original)
    );
    if (candidates.length === 0) return 0;

    for (const c of candidates) {
      prepareUndo(c.id);
      const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'skipped', translation: c.original }),
      });
      if (res.ok) {
        const updated = await res.json();
        set(state => ({ segments: state.segments.map(s => s.id === c.id ? updated : s) }));
      }
    }
    return candidates.length;
  },

  submitFlag: async (segId, flagNote) => {
    const { currentProject, segments, prepareUndo } = get();
    prepareUndo(segId);
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'flagged', flag_note: flagNote }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  retranslate: async (segId) => {
    const { currentProject, segments, prepareUndo } = get();
    prepareUndo(segId);
    const res = await fetch(`${API}/api/translate/${currentProject.id}/segment/${segId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: get().segments.map(s => s.id === segId ? updated : s) });
    }
  },

  loadProject: async (projectId) => {
    const res = await fetch(`${API}/api/projects/${projectId}`);
    if (res.ok) {
      const data = await res.json();
      set({
        currentProject: data.project, segments: data.segments, glossary: data.glossary,
        activeSegId: data.segments.length > 0 ? data.segments[0].id : null,
        selectedSegIds: new Set(), undoStack: []
      });
    }
  },

  loadProjects: async () => {
    const res = await fetch(`${API}/api/projects`);
    if (res.ok) set({ projects: await res.json() });
  },

  addGlossary: async (entry) => {
    const { currentProject, glossary } = get();
    const res = await fetch(`${API}/api/projects/${currentProject.id}/glossary`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) set({ glossary: [...glossary, await res.json()] });
  },

  deleteGlossary: async (entryId) => {
    const { currentProject, glossary } = get();
    await fetch(`${API}/api/projects/${currentProject.id}/glossary/${entryId}`, { method: 'DELETE' });
    set({ glossary: glossary.filter(g => g.id !== entryId) });
  },

  startTranslateJob: async (formData) => {
    set({ isTranslating: true, jobProgress: { processed: 0, total: 0, logs: [], status: 'running' } });
    const res = await fetch(`${API}/api/translate`, { method: 'POST', body: formData });
    if (!res.ok) {
      const err = await res.json();
      set({ isTranslating: false, jobProgress: { processed: 0, total: 0, logs: [err.detail], status: 'error' } });
      return null;
    }
    return await res.json();
  },

  listenProgress: (jobId, onDone) => {
    const es = new EventSource(`${API}/api/translate/${jobId}/progress`);
    es.addEventListener('progress', (e) => {
      const params = new URLSearchParams(e.data);
      set(state => ({
        jobProgress: {
          ...state.jobProgress,
          processed: parseInt(params.get('processed') || '0'),
          total: parseInt(params.get('total') || '0'),
          status: params.get('status'),
        }
      }));
    });
    es.addEventListener('done', () => {
      es.close();
      set({ isTranslating: false });
      onDone?.();
    });
    es.onmessage = (e) => {
      set(state => ({
        jobProgress: { ...state.jobProgress, logs: [...state.jobProgress.logs, e.data] }
      }));
    };
    es.onerror = () => {
      es.close();
      set({ isTranslating: false });
    };
  },

  getStats: () => {
    const { segments } = get();
    return {
      total: segments.length,
      approved: segments.filter(s => s.status === 'approved').length,
      ai_done: segments.filter(s => s.status === 'ai_done').length,
      flagged: segments.filter(s => s.status === 'flagged').length,
      in_review: segments.filter(s => s.status === 'in_review').length,
      pending: segments.filter(s => s.status === 'pending').length,
      skipped: segments.filter(s => s.status === 'skipped').length,
    };
  },
}));

export default useSubtiStore;
