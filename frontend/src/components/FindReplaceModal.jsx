import { useState, useRef, useEffect } from 'react';
import useSubtiStore from '../store/useSubtiStore';
import { X, Search } from 'lucide-react';

export default function FindReplaceModal({ onClose }) {
    const replaceText = useSubtiStore(state => state.replaceText);

    const [findVal, setFindVal] = useState('');
    const [replaceVal, setReplaceVal] = useState('');
    const [isRegex, setIsRegex] = useState(false);
    const [matchWord, setMatchWord] = useState(false);
    const [status, setStatus] = useState('');

    const inputRef = useRef(null);
    useEffect(() => {
        if (inputRef.current) inputRef.current.focus();
    }, []);

    const handleReplace = async () => {
        if (!findVal) return;
        setStatus('Replacing...');
        const count = await replaceText(findVal, replaceVal, isRegex, matchWord);
        setStatus(`Replaced ${count} occurrences.`);
        setTimeout(() => { if (count > 0) onClose(); }, 1500);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <div style={{
                background: '#111', width: 400, borderRadius: 8,
                border: '1px solid var(--border)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden'
            }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Search size={16} color="var(--amber)" /> Find & Replace (Global)
                    </h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>
                </div>

                <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Find (in Translation)</label>
                        <input
                            ref={inputRef}
                            value={findVal}
                            onChange={e => setFindVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleReplace(); }}
                            style={{
                                width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
                                color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--mono)', fontSize: 13
                            }}
                            placeholder="Text to find..."
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>Replace with</label>
                        <input
                            value={replaceVal}
                            onChange={e => setReplaceVal(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleReplace(); }}
                            style={{
                                width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)',
                                color: '#fff', borderRadius: 4, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--mono)', fontSize: 13
                            }}
                            placeholder="Replacement text..."
                        />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={matchWord} onChange={e => setMatchWord(e.target.checked)} />
                            Match Whole Word
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer' }}>
                            <input type="checkbox" checked={isRegex} onChange={e => setIsRegex(e.target.checked)} />
                            Use Regex
                        </label>
                    </div>
                </div>

                <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-1)' }}>
                    <span style={{ fontSize: 12, color: 'var(--amber)' }}>{status}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ padding: '6px 16px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        <button onClick={handleReplace} disabled={!findVal} style={{ padding: '6px 16px', background: 'var(--blue)', border: 'none', color: '#fff', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600, opacity: findVal ? 1 : 0.5 }}>Replace All</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
