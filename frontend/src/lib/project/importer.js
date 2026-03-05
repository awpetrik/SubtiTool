import { STPROJ_SCHEMA_VERSION, VALID_STATUSES } from './schema';

/**
 * parseAndValidateProject
 * Reads a File object as text, parses JSON, and strictly validates the .stproj schema.
 * @param {File} file 
 * @returns {Promise<Object>} The validated stproj project object
 */
export async function parseAndValidateProject(file) {
    if (!file) throw new Error("No file provided.");

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const data = JSON.parse(text);

                // 1. Basic Schema Checks
                if (data["$schema"] !== STPROJ_SCHEMA_VERSION) {
                    throw new Error(`Invalid schema version. Expected ${STPROJ_SCHEMA_VERSION}.`);
                }
                if (!data.version) {
                    throw new Error("Missing format 'version' field.");
                }

                // 2. Project Metadata Checks
                if (!data.project || !data.project.id || !data.project.title) {
                    throw new Error("Missing or invalid 'project' metadata.");
                }
                if (!data.project.language_source || !data.project.language_target) {
                    throw new Error("Missing 'language_source' or 'language_target' in project metadata.");
                }

                // 3. Rows Checks
                if (!Array.isArray(data.rows)) {
                    throw new Error("'rows' field must be an array.");
                }
                if (data.rows.length === 0) {
                    throw new Error("Project contains no rows (subtitles).");
                }

                for (let i = 0; i < data.rows.length; i++) {
                    const r = data.rows[i];
                    if (r.id == null || !r.timecode_in || !r.timecode_out || typeof r.original !== 'string') {
                        throw new Error(`Row index ${i} is missing required fields (id, timecode_in, timecode_out, original).`);
                    }
                    if (!VALID_STATUSES.includes(r.status)) {
                        throw new Error(`Row index ${i} has invalid status: "${r.status}".`);
                    }
                }

                // 4. Fallback defaults for optional fields if missing
                data.glossary = Array.isArray(data.glossary) ? data.glossary : [];
                data.session = data.session || { last_row: null, filter_active: 'all', bookmarks: [] };

                resolve(data);
            } catch (err) {
                // Return descriptive error
                reject(new Error(`Validation Failed: ${err.message}`));
            }
        };

        reader.onerror = () => {
            reject(new Error("Failed to read file from disk."));
        };

        reader.readAsText(file);
    });
}
