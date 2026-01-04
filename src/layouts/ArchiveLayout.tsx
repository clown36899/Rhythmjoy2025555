import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import './ArchiveLayout.css';

const ArchiveLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    useEffect(() => {
        // 전역 레이아웃 활성화 클래스 추가
        document.documentElement.classList.add('archive-layout-active');
        document.body.setAttribute('data-archive-route', 'true');

        return () => {
            document.documentElement.classList.remove('archive-layout-active');
            document.body.removeAttribute('data-archive-route');
        };
    }, []);

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
