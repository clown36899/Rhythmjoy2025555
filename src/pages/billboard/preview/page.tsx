import { useEffect, useState, useLayoutEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import BillboardLayoutV7 from './versions/v7/BillboardLayoutV7';
import BillboardLayoutV5 from './versions/v5/BillboardLayoutV5';
import BillboardLayoutV1 from './versions/v1/BillboardLayoutV1';
import BillboardLayoutV2 from './versions/v2/BillboardLayoutV2';
import './preview.css';

interface Props {
    forcedVersion?: string;
}

export default function BillboardPreviewPage({ forcedVersion }: Props) {
    const navigate = useNavigate();
    const { userId } = useParams<{ userId: string }>();
    const [searchParams] = useSearchParams();

    // Priority: Prop > Query Param > Default '7'
    const version = forcedVersion || searchParams.get('v') || '7';

    const [needsRotation, setNeedsRotation] = useState(false);
    const [viewportSize, setViewportSize] = useState({ w: window.innerWidth, h: window.innerHeight });

    useEffect(() => {
        console.log("Preview Timer Disabled for Customization");
    }, [navigate, userId]);

    useLayoutEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setViewportSize({ w, h });
            setNeedsRotation(w > h);
        };

        window.addEventListener('resize', updateLayout);
        updateLayout();

        const htmlElement = document.documentElement;
        htmlElement.style.backgroundColor = '#000000';
        htmlElement.style.overflow = 'hidden';
        htmlElement.classList.add('layout-wide-mode');
        document.body.style.overflow = 'hidden';

        return () => {
            window.removeEventListener('resize', updateLayout);
            htmlElement.classList.remove('layout-wide-mode');
        };
    }, []);

    const wrapperStyle: React.CSSProperties = needsRotation ? {
        position: "fixed",
        top: 0,
        width: `${viewportSize.h}px`,
        height: `${viewportSize.w}px`,
        transform: "rotate(90deg)",
        transformOrigin: "top left",
        left: `${viewportSize.w}px`,
        backgroundColor: "black",
        overflow: "hidden"
    } : {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "black",
        overflow: "hidden"
    };

    return (
        <div className="billboard-preview-root-fully-responsive">
            {/* Navigation to Catalog */}
            <button
                onClick={() => navigate(`/billboard/${userId}/preview/catalog`)}
                style={{
                    position: 'fixed',
                    top: '20px',
                    left: '20px',
                    zIndex: 9999,
                    background: 'rgba(25, 25, 25, 0.7)',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    padding: '10px 18px',
                    borderRadius: '50px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                    transition: 'all 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.background = 'rgba(229, 77, 77, 0.9)'}
                onMouseOut={(e) => e.currentTarget.style.background = 'rgba(25, 25, 25, 0.7)'}
            >
                <i className="fas fa-th-large"></i> CATALOG
            </button>

            <div className="billboard-preview-wrapper" style={wrapperStyle}>
                {version === '5' ? <BillboardLayoutV5 /> :
                    version === '2' ? <BillboardLayoutV2 /> :
                        version === '1' ? <BillboardLayoutV1 /> :
                            <BillboardLayoutV7 />}
            </div>
        </div>
    );
}
