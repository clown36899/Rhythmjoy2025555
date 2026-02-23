import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { isLegacyIOS } from '../lib/pwaDetect';
import './ArchiveLayout.css';

const ArchiveLayout = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const currentPath = location.pathname;

    // Layout class management is now handled by MobileShell based on route
    // No explicit DOM manipulation needed here.

    const isDetailPage = currentPath.startsWith('/learning/') && currentPath !== '/learning';

    // [iOS Legacy Guard] 구형 기기 접근 차단
    if (isLegacyIOS()) {
        return (
            <div className="archive-layout-container legacy-guard">
                <div className="legacy-guard-content">
                    <i className="ri-error-warning-line guard-icon"></i>
                    <h2 className="guard-title">기기 호환성 안내</h2>
                    <p className="guard-desc">
                        현재 사용 중인 구형 아이폰(iOS 15.4 미만)에서는<br />
                        댄스 라이브러리 기능을 지원하지 않습니다.<br />
                        최신 버전의 iOS로 업데이트를 권장드립니다.
                    </p>
                    <button className="guard-back-btn" onClick={() => navigate('/')}>
                        메인으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`archive-layout-container ${!isDetailPage ? 'has-sub-header' : ''}`}>
            {/* Archive Sub-Header (Tabs) - Hidden on Detail Pages */}
            {!isDetailPage && (
                <div className="archive-sub-header">
                    <nav className="archive-mode-tabs">
                        <button
                            className="mode-tab back-tab"
                            onClick={() => navigate('/board')}
                        >
                            <i className="ri-arrow-left-line"></i>
                            <span>돌아가기</span>
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
