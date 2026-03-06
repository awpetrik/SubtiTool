import { Download, FolderOpen, AlertCircle, Key } from 'lucide-react';
import { useProjectIO } from '../lib/project/useProjectIO';
import useSubtiStore from '../store/useSubtiStore';
import { memo, useState, useEffect } from 'react';

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

    const [geminiKey, setGeminiKey] = useState('');
    useEffect(() => { setGeminiKey(localStorage.getItem('gemini_key') || ''); }, []);

    const handleKeyChange = (e) => {
        const val = e.target.value;
        setGeminiKey(val);
        localStorage.setItem('gemini_key', val);
    };

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

            <div
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--bg-2)', padding: '2px 8px',
                    borderRadius: 4, border: '1px solid var(--border)',
                    transition: 'border-color 0.2s',
                    width: 140
                }}
                onFocus={e => e.currentTarget.style.borderColor = 'var(--amber)'}
                onBlur={e => e.currentTarget.style.borderColor = 'var(--border)'}
                title="Masukkan API Key Gemini Anda di sini untuk fitur AI (Shorten, Rephrase, Retranslate)"
            >
                <Key size={12} color={geminiKey ? 'var(--amber)' : 'var(--text-muted)'} />
                <input
                    type="password"
                    placeholder="Gemini API Key..."
                    value={geminiKey}
                    onChange={handleKeyChange}
                    style={{
                        background: 'transparent', border: 'none', color: 'var(--text)',
                        fontSize: 11, outline: 'none', width: '100%', height: 24,
                        fontFamily: 'var(--mono)'
                    }}
                />
            </div>
        </div>
    );
});
