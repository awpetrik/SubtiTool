import { useState } from 'react';
import useSubtiStore from '../store/useSubtiStore';

export default function GlossaryPanel() {
    const glossary = useSubtiStore(s => s.glossary);
    const addGlossary = useSubtiStore(s => s.addGlossary);
    const deleteGlossary = useSubtiStore(s => s.deleteGlossary);
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState({ source_term: '', target_term: '', note: '' });

    const handleAdd = async () => {
        if (!form.source_term || !form.target_term) return;
        await addGlossary(form);
        setForm({ source_term: '', target_term: '', note: '' });
        setAdding(false);
    };

    return (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {glossary.map(g => (
                <div key={g.id} style={row}>
                    <span style={{ color: 'var(--amber)', minWidth: 70, fontSize: 12 }}>{g.source_term}</span>
                    <span style={{ color: 'var(--text-muted)' }}>→</span>
                    <span style={{ color: 'var(--text-dim)', flex: 1, fontSize: 12 }}>{g.target_term}</span>
                    <button
                        onClick={() => deleteGlossary(g.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, padding: '0 2px' }}
                    >✕</button>
                </div>
            ))}

            {adding ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginTop: 4 }}>
                    <input
                        value={form.source_term}
                        onChange={e => setForm(f => ({ ...f, source_term: e.target.value }))}
                        placeholder="Source (EN)"
                        style={{ fontSize: 12 }}
                    />
                    <input
                        value={form.target_term}
                        onChange={e => setForm(f => ({ ...f, target_term: e.target.value }))}
                        placeholder="Target (ID)"
                        style={{ fontSize: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 5 }}>
                        <button onClick={handleAdd} style={btnAdd}>Tambah</button>
                        <button onClick={() => setAdding(false)} style={btnCancel}>Batal</button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setAdding(true)} style={btnDashed}>+ Tambah Term</button>
            )}
        </div>
    );
}

const row = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
    padding: '4px 6px', borderRadius: 3, background: 'var(--bg-2)',
};
const btnDashed = {
    background: 'none', border: '1px dashed var(--border)', color: 'var(--text-muted)',
    padding: '5px', borderRadius: 3, fontSize: 11, marginTop: 4,
};
const btnAdd = {
    flex: 1, background: 'var(--amber)', color: '#000', border: 'none',
    borderRadius: 3, padding: '5px', fontSize: 11, fontWeight: 700,
};
const btnCancel = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--text-muted)',
    borderRadius: 3, padding: '5px 8px', fontSize: 11,
};
