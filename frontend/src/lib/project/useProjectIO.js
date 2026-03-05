import { useState, useRef, useCallback } from 'react';
import { parseAndValidateProject } from './importer';
import { serializeProject } from './exporter';
import useSubtiStore from '../../store/useSubtiStore';

export function useProjectIO() {
    const fileInputRef = useRef(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState(null);

    // EXPORT
    const exportProject = useCallback(() => {
        try {
            const state = useSubtiStore.getState();
            // Optional: Block export if no rows exist
            if (!state.segments || state.segments.length === 0) {
                alert("Cannot export: Proyek ini kosong (tidak ada baris).");
                return;
            }
            serializeProject(state);
        } catch (err) {
            console.error(err);
            alert("Error exporting: " + err.message);
        }
    }, []);

    // IMPORT
    const importProject = useCallback(() => {
        // Clear previous error
        setImportError(null);
        // Trigger hidden input click
        if (fileInputRef.current) {
            fileInputRef.current.value = null; // reset so same file can be re-selected
            fileInputRef.current.click();
        }
    }, []);

    const handleFileChange = useCallback(async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsImporting(true);
        setImportError(null);

        try {
            // 1. Read & Validate
            const stprojData = await parseAndValidateProject(file);

            // 2. Map JSON data back to Zustand App State
            const mappedSegments = stprojData.rows.map(r => ({
                id: r.id,
                timecode_start: r.timecode_in,
                timecode_end: r.timecode_out,
                original: r.original,
                translation: r.translation || "",
                status: r.status,
                flag_note: (r.flags && r.flags.length > 0) ? r.flags[0] : null,
            }));

            const mappedProject = {
                id: stprojData.project.id,
                title: stprojData.project.title,
                created_at: stprojData.project.created_at,
                lang_from: stprojData.project.language_source,
                lang_to: stprojData.project.language_target,
            };

            const mappedGlossary = (stprojData.glossary || []).map(g => ({
                id: g.id,
                source_term: g.source_term,
                target_term: g.target_term,
                notes: g.notes || ""
            }));

            // 3. Inject full state swap into Zustand store
            const store = useSubtiStore.getState();
            store.setActiveSegId(null);
            store.cancelEdit();
            store.clearSelection();

            useSubtiStore.setState({
                // Replace root items
                currentProject: mappedProject,
                segments: mappedSegments,
                glossary: mappedGlossary,

                // Extra media fallback handling
                videoSrc: null,

                // Session restoration
                filterStatus: stprojData.session?.filter_active || "all",
                selectedSegIds: new Set(stprojData.session?.bookmarks || []),
                activeSegId: stprojData.session?.last_row || (mappedSegments[0] ? mappedSegments[0].id : null),

                // Reset logic values
                editingId: null,
                editValue: '',
            });

            // Optional: alert success using plain browser alert, or can be improved later
            alert(`Project "${mappedProject.title}" loaded successfully — ${mappedSegments.length} rows.`);

        } catch (err) {
            console.error("Import failed:", err);
            setImportError(err.message);
        } finally {
            setIsImporting(false);
        }
    }, []);

    return {
        exportProject,
        importProject,
        fileInputRef,
        handleFileChange,
        isImporting,
        importError,
    };
}
