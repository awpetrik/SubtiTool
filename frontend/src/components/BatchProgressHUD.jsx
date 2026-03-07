import React, { useEffect } from 'react';
import useSubtiStore from '../store/useSubtiStore';
import { Loader2, XOctagon } from 'lucide-react';

export default function BatchProgressHUD() {
    const { batchTranslating, batchProgress, abortBatchTranslate, listenBatchProgress, batchJobId } = useSubtiStore(s => ({
        batchTranslating: s.batchTranslating,
        batchProgress: s.batchProgress,
        abortBatchTranslate: s.abortBatchTranslate,
        listenBatchProgress: s.listenBatchProgress,
        batchJobId: s.batchJobId
    }));

    useEffect(() => {
        if (batchJobId && batchTranslating) {
            const cleanup = listenBatchProgress(batchJobId);
            return cleanup;
        }
    }, [batchJobId, listenBatchProgress, batchTranslating]);

    if (!batchTranslating) return null;

    const { processed, total, logs, status, tokens } = batchProgress;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
    const lastLog = logs.length > 0 ? logs[logs.length - 1] : 'Starting job...';

    return (
        <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-1)', border: '1px solid var(--amber)',
            borderRadius: 12, width: 400, padding: 16,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5), 0 0 20px rgba(245,158,11,0.1)',
            zIndex: 9000, display: 'flex', flexDirection: 'column', gap: 12
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--amber)', fontSize: 13, fontWeight: 700 }}>
                    <Loader2 size={16} className="animate-spin" /> Batch Translating...
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                    {processed} / {total}
                </div>
            </div>

            {/* Progress Bar */}
            <div style={{ width: '100%', height: 6, background: 'var(--bg-3)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'var(--amber)', transition: 'width 0.3s' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 250 }}>
                        {lastLog}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
                        Tokens Used: {tokens ? tokens.toLocaleString() : 0}
                    </span>
                </div>

                <button
                    onClick={abortBatchTranslate}
                    style={{
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#ef4444', padding: '6px 10px', borderRadius: 4, fontSize: 11, fontWeight: 700,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
                >
                    <XOctagon size={12} /> STOP
                </button>
            </div>
        </div>
    );
}
