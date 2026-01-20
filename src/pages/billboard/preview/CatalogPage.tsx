import { useNavigate, useParams } from 'react-router-dom';
import './preview.css';

const versions = [
    { id: '1', name: 'Version 1', description: 'Classic Horizontal Layout' },
    { id: '2', name: 'Version 2', description: 'Event Grid Focus' },
    { id: '5', name: 'Version 5', description: 'High Contrast Dark / Gallery' },
    { id: '7', name: 'Version 7', description: 'Portrait Billboard (Fixed 1080x1920)', status: 'Active' },
];

export default function BillboardCatalogPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();

    const handleSelect = (id: string) => {
        const targetUrl = `/billboard/${userId}/preview?v=${id}`;
        console.log("Navigating to:", targetUrl);
        navigate(targetUrl);
    };

    return (
        <div className="catalog-container" style={{
            padding: '20px',
            background: '#0a0a0a',
            minHeight: '100vh',
            color: '#fff',
            fontFamily: 'Pretendard, sans-serif',
            overflowY: 'auto' // Ensure scrolling
        }}>
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                <header style={{ marginBottom: '30px', borderBottom: '1px solid #222', paddingBottom: '20px' }}>
                    <h1 style={{ fontSize: '1.8rem', marginBottom: '5px', fontWeight: 900, color: '#e54d4d' }}>BILLBOARD CATALOG</h1>
                    <p style={{ color: '#666', fontSize: '0.9rem' }}>Select a layout version to preview. Scroll down for more options.</p>
                </header>

                <div className="catalog-list" style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    {versions.map((v) => (
                        <div
                            key={v.id}
                            className="catalog-item-bar"
                            onClick={() => handleSelect(v.id)}
                            style={{
                                background: '#141414',
                                border: v.id === '7' ? '1px solid #e54d4d' : '1px solid #222',
                                borderRadius: '8px',
                                padding: '12px 20px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.1s ease',
                                userSelect: 'none'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.borderColor = '#e54d4d'}
                            onMouseOut={(e) => e.currentTarget.style.borderColor = v.id === '7' ? '#e54d4d' : '#222'}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    color: '#e54d4d',
                                    fontWeight: 900,
                                    width: '30px',
                                    textAlign: 'center',
                                    background: '#000',
                                    padding: '2px 4px',
                                    borderRadius: '4px'
                                }}>
                                    V{v.id}
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '10px' }}>
                                    <h2 style={{ fontSize: '1rem', margin: 0, fontWeight: 700 }}>{v.name}</h2>
                                    <p style={{ color: '#555', fontSize: '0.85rem', margin: 0 }}>{v.description}</p>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {v.status && (
                                    <span style={{
                                        background: '#e54d4d',
                                        color: '#fff',
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        fontSize: '10px',
                                        fontWeight: 800
                                    }}>
                                        {v.status}
                                    </span>
                                )}
                                <div style={{ color: '#333', fontSize: '0.8rem' }}>SELECT →</div>
                            </div>
                        </div>
                    ))}
                </div>

                <footer style={{ marginTop: '40px', padding: '20px 0', borderTop: '1px solid #222', textAlign: 'center' }}>
                    <p style={{ color: '#444', fontSize: '0.8rem' }}>
                        * Selection will update the billboard layout in real-time.
                    </p>
                </footer>
            </div>
        </div>
    );
}
