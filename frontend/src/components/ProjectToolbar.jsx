import { Download, FolderOpen, AlertCircle } from 'lucide-react';
import { useProjectIO } from '../lib/project/useProjectIO';
import useSubtiStore from '../store/useSubtiStore';
import { memo } from 'react';

const btnStyle = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)',
    padding: '5px 14px', borderRadius: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
    cursor: 'pointer', transition: 'all 0.15s'
};

export const ProjectToolbar = memo(function ProjectToolbar() {
    const {
        exportProject, importProject,
        fileInputRef, handleFileChange,
        isImporting, importError
    } = useProjectIO();

    const segmentCount = useSubtiStore(state => state.segments?.length || 0);
    const noRows = segmentCount === 0;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".stproj"
                style={{ display: 'none' }}
            />

            <button
                onClick={importProject}
                disabled={isImporting}
                title="Open Project (.stproj)"
                style={{ ...btnStyle, opacity: isImporting ? 0.5 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
                {isImporting ? (
                    <span style={{
                        display: 'inline-block', width: 14, height: 14,
                        border: '2px solid var(--text-dim)', borderTopColor: 'transparent',
                        borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                    }} />
                ) : (
                    <FolderOpen size={14} />
                )}
                <span>Open Project</span>
            </button>

            <button
                onClick={exportProject}
                disabled={noRows}
                title={noRows ? "Project is empty" : "Save as Project (.stproj)"}
                style={{
                    ...btnStyle,
                    color: noRows ? '#555' : 'var(--amber)',
                    borderColor: noRows ? 'var(--border)' : 'var(--amber-border)',
                    background: noRows ? 'transparent' : 'var(--amber-dim)',
                    opacity: noRows ? 0.5 : 1,
                    cursor: noRows ? 'not-allowed' : 'pointer'
                }}
            >
                <Download size={14} />
                <span>Save as Project</span>
            </button>

            {importError && (
                <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    color: 'var(--red)', fontSize: 11, background: 'rgba(239,68,68,0.1)',
                    padding: '2px 8px', borderRadius: 3, maxWidth: 220,
                    textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap'
                }} title={importError}>
                    <AlertCircle size={12} /> Error importing
                </span>
            )}

            {/* Visual separator before other buttons */}
            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />
        </div>
    );
});
