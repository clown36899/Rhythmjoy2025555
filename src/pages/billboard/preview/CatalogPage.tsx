import { useNavigate, useParams } from 'react-router-dom';
import './preview.css';

const versions = [
    { id: '1', name: 'Version 1', description: 'Classic Horizontal Layout' },
    { id: '2', name: 'Version 2', description: 'Event Grid Focus' },
    { id: '3', name: 'Version 3', description: 'Schedule List Mode' },
    { id: '4', name: 'Version 4', description: 'Large Visual / Minimal' },
    { id: '5', name: 'Version 5', description: 'High Contrast Dark' },
    { id: '6', name: 'Version 6', description: 'Social Multi-Grid' },
    { id: '7', name: 'Version 7', description: 'Portrait Billboard (Fixed 1080x1920)', status: 'Active' },
];

export default function BillboardCatalogPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();

    return (
        <div className="catalog-container" style={{ padding: '40px', background: '#000', minHeight: '100vh', color: '#fff' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '10px', fontWeight: 900 }}>Billboard Catalog</h1>
            <p style={{ color: '#888', marginBottom: '40px' }}>Select a version to preview on your billboard device.</p>

            <div className="catalog-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px'
            }}>
                {versions.map((v) => (
                    <div
                        key={v.id}
                        className="catalog-card"
                        onClick={() => navigate(`/billboard/${userId}/preview?v=${v.id}`)}
                        style={{
                            background: '#1a1a1a',
                            border: v.id === '7' ? '2px solid #e54d4d' : '1px solid #333',
                            borderRadius: '12px',
                            padding: '25px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            position: 'relative'
                        }}
                    >
                        {v.status && (
                            <span style={{
                                position: 'absolute',
                                top: '15px',
                                right: '15px',
                                background: '#e54d4d',
                                color: '#fff',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 800
                            }}>
                                {v.status}
                            </span>
                        )}
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{v.name}</h2>
                        <p style={{ color: '#aaa', fontSize: '1rem' }}>{v.description}</p>

                        <div style={{ marginTop: '20px', color: '#e54d4d', fontWeight: 600 }}>
                            Preview →
                        </div>
                    </div>
                ))}
            </div>

            <div style={{ marginTop: '50px', borderTop: '1px solid #333', paddingTop: '20px', color: '#555' }}>
                <p>Note: Versions 1-6 are currently being restored. Selecting them will fallback to Version 7.</p>
            </div>
        </div>
    );
}
