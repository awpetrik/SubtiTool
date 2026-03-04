import useSubtiStore from '../store/useSubtiStore';

export default function TranslateProgress() {
    const { jobProgress } = useSubtiStore();
    const { processed, total, logs, status } = jobProgress;
    const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

    return (
        <div style={{ padding: '20px 24px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: 'var(--display)', color: 'var(--amber)', fontWeight: 700 }}>
                    {status === 'error' ? '⚠ Error' : status === 'done' ? '✓ Selesai' : '⟳ Translating...'}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                    {processed} / {total} baris ({pct}%)
                </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 6, background: 'var(--bg-2)', borderRadius: 3, overflow: 'hidden', marginBottom: 14 }}>
                <div style={{
                    height: '100%', borderRadius: 3, transition: 'width 0.5s',
                    background: status === 'error' ? 'var(--red)' : status === 'done' ? 'var(--green)' : 'var(--amber)',
                    width: `${pct}%`,
                }} />
            </div>

            {/* Log terbaru */}
            <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3, maxHeight: 120, overflowY: 'auto' }}>
                {[...logs].reverse().map((log, i) => (
                    <p key={i} style={{ margin: 0, color: 'var(--text-muted)', fontSize: 11 }}>{log}</p>
                ))}
            </div>
        </div>
    );
}
