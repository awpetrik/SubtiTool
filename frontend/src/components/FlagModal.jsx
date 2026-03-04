import { useState } from 'react';
import { Flag } from 'lucide-react';
import useSubtiStore from '../store/useSubtiStore';

export default function FlagModal({ segId, initialNote, onClose }) {
    const [note, setNote] = useState(initialNote || '');
    const submitFlag = useSubtiStore(s => s.submitFlag);

    const handleSubmit = async () => {
        await submitFlag(segId, note);
        onClose();
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={modal} onClick={e => e.stopPropagation()}>
                <h3 style={{ margin: '0 0 4px', color: 'var(--red)', fontSize: 16, fontFamily: 'var(--display)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Flag size={16} fill="currentColor" /> Flag for Review
                </h3>
                <p style={{ margin: '0 0 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                    Tambahkan catatan untuk reviewer
                </p>
                <textarea
                    autoFocus
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Contoh: Terjemahan kurang natural, perlu disesuaikan..."
                    style={{ width: '100%', height: 80, resize: 'none', boxSizing: 'border-box', background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 4 }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={onClose} style={btnCancel}>Batal</button>
                    <button onClick={handleSubmit} style={btnSubmit}>Kirim Flag</button>
                </div>
            </div>
        </div>
    );
}

const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};
const modal = {
    background: 'var(--bg-1)', border: '1px solid var(--border)',
    borderRadius: 8, padding: 24, width: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
};
const btnCancel = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    padding: '7px 18px', borderRadius: 4,
};
const btnSubmit = {
    background: 'var(--red)', color: '#fff', border: 'none',
    padding: '7px 18px', borderRadius: 4, fontWeight: 700,
};
