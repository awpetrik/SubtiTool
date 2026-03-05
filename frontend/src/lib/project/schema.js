export const STPROJ_SCHEMA_VERSION = "subtitool-project/v1";

// Simple validation utility functions
export const isValidUUID = (uuid) => {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(uuid);
};

export const isValidISODate = (dateString) => {
    if (!dateString) return false;
    const d = new Date(dateString);
    return !isNaN(d.getTime());
};

export const VALID_STATUSES = ["pending", "ai_done", "flagged", "in_review", "approved", "skipped"];
