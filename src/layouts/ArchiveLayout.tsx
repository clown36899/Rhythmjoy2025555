import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import './ArchiveLayout.css';

const ArchiveLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    // Layout class management is now handled by MobileShell based on route
    // No explicit DOM manipulation needed here.

    const isDetailPage = currentPath.startsWith('/learning/') && currentPath !== '/learning';

    return (
        <div className={`archive-layout-container ${!isDetailPage ? 'has-sub-header' : ''}`}>
            {/* Archive Sub-Header (Tabs) - Hidden on Detail Pages */}
            {!isDetailPage && (
                <div className="archive-sub-header">
                    <nav className="archive-mode-tabs">
                        <button
                            className={`mode-tab ${currentPath === '/learning' ? 'active' : ''}`}
                            onClick={() => navigate('/learning')}
                        >
                            <i className="ri-list-check"></i>
                            <span>자료</span>
                        </button>
                        <button
                            className={`mode-tab ${currentPath === '/history' ? 'active' : ''}`}
                            onClick={() => navigate('/history')}
                        >
                            <i className="ri-book-read-line"></i>
                            <span>히스토리</span>
                        </button>
                    </nav>
                </div>
            )}

            <main className={`archive-content ${currentPath.startsWith('/history') ? 'is-history' : 'is-learning'}`}>
                <Outlet />
            </main>
        </div>
    );
};

export default ArchiveLayout;
