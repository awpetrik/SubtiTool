import { STPROJ_SCHEMA_VERSION } from './schema';

/**
 * serializeProject
 * Converts the current Zustand app state into a JSON Blob and triggers a download.
 * @param {Object} state - Current Zustand state (useSubtiStore.getState())
 */
export function serializeProject(state) {
    if (!state.currentProject) {
        throw new Error("Cannot export: No project currently loaded.");
    }

    const nowISO = new Date().toISOString();

    const stprojData = {
        "$schema": STPROJ_SCHEMA_VERSION,
        "version": "1.0.0",
        "exported_at": nowISO,

        "project": {
            "id": state.currentProject.id || crypto.randomUUID(),
            "title": state.currentProject.title || "Untitled Project",
            "created_at": state.currentProject.created_at || nowISO,
            "updated_at": nowISO,
            "language_source": state.currentProject.lang_from || "EN",
            "language_target": state.currentProject.lang_to || "ID"
        },

        "authors": [], // Not implemented yet per scope

        "media": {
            "filename": state.videoSrc ? state.videoSrc.split('/').pop() : null, // Extract filename if possible
            "duration_ms": 0,
            "fingerprint": null
        },

        "glossary": (state.glossary || []).map(g => ({
            "id": g.id || crypto.randomUUID(),
            "source_term": g.source_term || "",
            "target_term": g.target_term || "",
            "notes": g.notes || "",
            "created_by": null,
            "locked": false
        })),

        "settings": {
            "max_cps": 25,
            "max_line_length": 42,
            "min_duration_ms": 800
        },

        "rows": (state.segments || []).map((seg) => ({
            "id": seg.id,
            "timecode_in": seg.timecode_start,
            "timecode_out": seg.timecode_end,
            "cps": 0, // Simplified for now, computed dynamically in UI
            "original": seg.original || "",
            "translation": seg.translation || "",
            "status": seg.status || "pending",
            "flags": seg.flag_note ? [seg.flag_note] : [],
            "comments": [],
            "author_id": null,
            "history": [] // Simplified for now
        })),

        "session": {
            "last_row": state.activeSegId || null,
            "filter_active": state.filterStatus || "all",
            "bookmarks": Array.from(state.selectedSegIds || [])
        }
    };

    // Serialize to pretty JSON
    const jsonString = JSON.stringify(stprojData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });

    // Download trigger
    const safeTitle = stprojData.project.title.replace(/[^a-zA-Z0-9 _-]/g, '_').trim();
    const dateStr = nowISO.split('T')[0];
    const filename = `${safeTitle}_${dateStr}.stproj`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
