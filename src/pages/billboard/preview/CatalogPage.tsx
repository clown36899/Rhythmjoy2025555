import { useNavigate, useParams } from 'react-router-dom';
import './preview.css';
import './CatalogPage.css';

const versions = [
    { id: '1', name: 'Version 1', description: 'Classic Horizontal Layout' },
    { id: '2', name: 'Version 2', description: 'Event Grid Focus' },
    { id: '5', name: 'Version 5', description: 'High Contrast Dark / Gallery' },
    { id: '7', name: 'Version 7', description: 'Portrait Billboard (Fixed 1080x1920)', status: 'Active' },
    { id: '8', name: 'Version 8', description: 'Image Wall / Poster Focus', status: 'NEW' },
];

export default function BillboardCatalogPage() {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();

    const handleSelect = (id: string) => {
        const targetUrl = `/billboard/${userId}/preview?v=${id}`;
        // console.log("Navigating to:", targetUrl);
        navigate(targetUrl);
    };

    return (
        <div className="catalog-page-container">
            <div className="catalog-wrapper">
                <header className="catalog-header">
                    <h1 className="catalog-header-title">BILLBOARD CATALOG</h1>
                    <p className="catalog-header-desc">Select a layout version to preview. Scroll down for more options.</p>
                </header>

                <div className="catalog-list-wrapper">
                    {versions.map((v) => (
                        <div
                            key={v.id}
                            className={`catalog-item-bar ${v.id === '7' ? 'highlighted' : ''}`}
                            onClick={() => handleSelect(v.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect(v.id)}
                        >
                            <div className="catalog-item-left">
                                <span className="catalog-version-badge">
                                    V{v.id}
                                </span>
                                <div className="catalog-item-text-group">
                                    <h2 className="catalog-item-name">{v.name}</h2>
                                    <p className="catalog-item-desc">{v.description}</p>
                                </div>
                            </div>

                            <div className="catalog-item-right">
                                {v.status && (
                                    <span className="catalog-status-badge">
                                        {v.status}
                                    </span>
                                )}
                                <div className="catalog-select-indicator">SELECT →</div>
                            </div>
                        </div>
                    ))}
                </div>

                <footer className="catalog-footer">
                    <p className="catalog-footer-text">
                        * Selection will update the billboard layout in real-time.
                    </p>
                </footer>
            </div>
        </div>
    );
}
