import { create } from 'zustand';

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
  editValue: '',
  sidePanel: 'glossary', // 'glossary' | 'stats'
  isTranslating: false,
  jobProgress: { processed: 0, total: 0, logs: [], status: 'idle' },

  // Actions
  setFilter: (f) => set({ filterStatus: f }),
  setActiveSegId: (id) => set({ activeSegId: id }),
  setSidePanel: (p) => set({ sidePanel: p }),

  startEdit: (seg) => set({ editingId: seg.id, editValue: seg.translation }),
  cancelEdit: () => set({ editingId: null, editValue: '' }),

  saveEdit: async (segId) => {
    const { currentProject, editValue, segments } = get();
    set({ editingId: null });
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ translation: editValue, status: 'approved' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: segments.map(s => s.id === segId ? updated : s) });
    }
  },

  approve: async (segId) => {
    const { currentProject, segments } = get();
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'approved' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: segments.map(s => s.id === segId ? updated : s) });
    }
  },

  setInReview: async (segId) => {
    const { currentProject, segments } = get();
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'in_review' }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: segments.map(s => s.id === segId ? updated : s) });
    }
  },

  submitFlag: async (segId, flagNote) => {
    const { currentProject, segments } = get();
    const res = await fetch(`${API}/api/projects/${currentProject.id}/segments/${segId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'flagged', flag_note: flagNote }),
    });
    if (res.ok) {
      const updated = await res.json();
      set({ segments: segments.map(s => s.id === segId ? updated : s) });
    }
  },

  loadProject: async (projectId) => {
    const res = await fetch(`${API}/api/projects/${projectId}`);
    if (res.ok) {
      const data = await res.json();
      set({ currentProject: data.project, segments: data.segments, glossary: data.glossary });
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
    return await res.json(); // { job_id, project_id, total }
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

  // Computed stats
  getStats: () => {
    const { segments } = get();
    return {
      total: segments.length,
      approved: segments.filter(s => s.status === 'approved').length,
      ai_done: segments.filter(s => s.status === 'ai_done').length,
      flagged: segments.filter(s => s.status === 'flagged').length,
      in_review: segments.filter(s => s.status === 'in_review').length,
      pending: segments.filter(s => s.status === 'pending').length,
    };
  },
}));

export default useSubtiStore;
