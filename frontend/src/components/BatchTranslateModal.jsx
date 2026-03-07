import React, { useState } from 'react';
import useSubtiStore from '../store/useSubtiStore';
import { Play, X, FileText, Zap, Cpu } from 'lucide-react';

export default function BatchTranslateModal({ isOpen, onClose }) {
    const segments = useSubtiStore(s => s.segments);
    const startBatchTranslate = useSubtiStore(s => s.startBatchTranslate);

    const [engine, setEngine] = useState('gemini');
    const [contextOverlap, setContextOverlap] = useState(5);

    const pendingSegments = segments.filter(s => s.status === 'pending');
    const totalChars = pendingSegments.reduce((acc, curr) => acc + (curr.original ? curr.original.length : 0), 0);

    // Dynamic estimation based on context overlap
    const BATCH_SIZE = 40;
    const numBatches = Math.ceil(pendingSegments.length / BATCH_SIZE);
    const avgChars = pendingSegments.length > 0 ? (totalChars / pendingSegments.length) : 0;
    const overlapChars = (numBatches > 1) ? (numBatches - 1) * contextOverlap * avgChars : 0;
    const systemPromptOverhead = numBatches * 250; // Context and instructions

    const estimatedTokens = Math.ceil((totalChars + overlapChars) / 4) + systemPromptOverhead;

    // Gemini 1.5 Flash approx cost: $0.15 per 1M tokens (blended input/output)
    const estimatedCostUSD = (estimatedTokens / 1_000_000) * 0.15;

    if (!isOpen) return null;

    const handleStart = () => {
        const apiKey = localStorage.getItem('gemini_key') || '';
        startBatchTranslate({
            engine,
            context_overlap: contextOverlap,
            api_key: apiKey
        });
        onClose();
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: 'var(--bg-1)', border: '1px solid var(--border)',
                borderRadius: 12, padding: 24, width: 400, boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ margin: 0, fontSize: 16, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Zap size={18} color="var(--amber)" fill="var(--amber)" />
                        Auto-Translate Remaining
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <X size={18} />
                    </button>
                </div>

                <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--text)' }}>
                    Translating <strong>{pendingSegments.length}</strong> pending segments.
                </div>

                {/* Engine Selection */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8 }}>ENGINE</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setEngine('gemini')}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                background: engine === 'gemini' ? 'var(--bg-3)' : 'var(--bg-2)',
                                border: `1px solid ${engine === 'gemini' ? 'var(--amber)' : 'var(--border)'}`,
                                color: engine === 'gemini' ? 'var(--amber)' : 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}>
                            <Cpu size={20} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Gemini AI</span>
                        </button>
                        <button
                            onClick={() => setEngine('google')}
                            style={{
                                flex: 1, padding: '10px', borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                                background: engine === 'google' ? 'var(--bg-3)' : 'var(--bg-2)',
                                border: `1px solid ${engine === 'google' ? '#3b82f6' : 'var(--border)'}`,
                                color: engine === 'google' ? '#3b82f6' : 'var(--text-muted)',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}>
                            <FileText size={20} />
                            <span style={{ fontSize: 12, fontWeight: 600 }}>Google (Free)</span>
                        </button>
                    </div>
                </div>

                {/* Context Overlap Slider (Gemini Only) */}
                {engine === 'gemini' && (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>CONTEXT OVERLAP (LINES)</label>
                            <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600 }}>{contextOverlap}</span>
                        </div>
                        <input
                            type="range"
                            min="0" max="10"
                            value={contextOverlap}
                            onChange={(e) => setContextOverlap(parseInt(e.target.value))}
                            style={{ width: '100%', accentColor: 'var(--amber)' }}
                        />
                        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                            Higher overlap improves continuity but uses slightly more tokens.
                        </div>
                    </div>
                )}

                {/* Token Estimation */}
                {engine === 'gemini' && (
                    <div style={{ background: 'rgba(245,158,11,0.05)', border: '1px solid rgba(245,158,11,0.2)', padding: '14px 16px', borderRadius: 8, marginBottom: 20 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--amber)', letterSpacing: 0.5 }}>ESTIMATED COST</div>
                            <div style={{
                                fontSize: 13, color: '#fff', fontWeight: 900, fontFamily: 'var(--mono)',
                                padding: '2px 8px', background: 'var(--amber)', color: '#000', borderRadius: 4
                            }}>
                                ${estimatedCostUSD < 0.001 ? '<0.001' : estimatedCostUSD.toFixed(3)}
                            </div>
                        </div>
                        <div style={{ fontSize: 14, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
                            ~{estimatedTokens.toLocaleString()}
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Tokens (Est. Input+Output)</span>
                        </div>
                    </div>
                )}

                {/* Action */}
                <button
                    onClick={handleStart}
                    disabled={pendingSegments.length === 0}
                    style={{
                        width: '100%', padding: '12px', borderRadius: 6, border: 'none',
                        background: 'var(--amber)', color: '#000', fontSize: 14, fontWeight: 700,
                        cursor: pendingSegments.length === 0 ? 'not-allowed' : 'pointer',
                        opacity: pendingSegments.length === 0 ? 0.5 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                    }}
                >
                    <Play size={16} fill="#000" /> Start Batch Job
                </button>
            </div>
        </div>
    );
}
