import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { NAVIGATION_ITEMS } from '../config/navigation';
import '../styles/components/BottomNavigation.css';
import {
    prefetchSocialPage,
    prefetchBoardPage,
    prefetchGuidePage,
    prefetchShoppingPage
} from '../router/prefetch';
import { useEffect } from 'react';
import { logUserInteraction } from '../lib/analytics';

interface BottomNavigationProps {
    pageAction?: {
        label?: string;
        icon: string;
        onClick: () => void;
        requireAuth?: boolean;
    } | null;
    onPageActionClick?: () => void;
}

export function BottomNavigation({ pageAction, onPageActionClick }: BottomNavigationProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const currentPath = location.pathname;


    // Prefetch other pages for instant navigation
    useEffect(() => {
        const timer = setTimeout(() => {
            prefetchSocialPage();
            prefetchBoardPage();
            prefetchGuidePage();
            prefetchShoppingPage();
        }, 2500); // 2.5초 후 다른 페이지 리소스 로딩 시작

        return () => clearTimeout(timer);
    }, []);

    const handleNavigation = (path: string, action?: string) => {
        // Analytics: Track navigation
        const pageName = path === '/' ? 'Home' : path.replace('/', '').charAt(0).toUpperCase() + path.slice(2);
        logUserInteraction('Navigation', 'Click', pageName);

        // Check for Board/History FitView Trigger
        const isHistoryMode = currentPath === '/board' && new URLSearchParams(location.search).get('category') === 'history';
        if (path === '/board' && isHistoryMode) {
            window.dispatchEvent(new CustomEvent('triggerHistoryFitView'));
            return; // Stop navigation
        }

        if (path === '/' && currentPath === '/') {
            // 이벤트 달력 페이지에서 다시 누르면 새로고침 효과
            const overlay = document.createElement('div');
            overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        max-width: 650px;
        margin: 0 auto;
      `;
            overlay.innerHTML = `
        <div style="text-align: center;">
          <i class="ri-loader-4-line" style="font-size: 48px; color: #3b82f6; animation: spin 1s linear infinite;"></i>
          <div style="color: white; margin-top: 16px; font-size: 14px;">새로고침 중...</div>
        </div>
      `;
            document.body.appendChild(overlay);

            setTimeout(() => {
                window.location.reload();
            }, 150);
        } else if (path === '/v2' && currentPath.startsWith('/v2')) {
            // V2 페이지에서 다시 누르면 메인 뷰로 리셋
            window.dispatchEvent(new CustomEvent('resetV2MainView'));
            navigate(path);
        } else {
            navigate(path);
            // Trigger action after navigation if specified
            if (action) {
                setTimeout(() => {
                    window.dispatchEvent(new CustomEvent(action));
                }, 100);
            }
        }
    };

    return (
        <div
            className="bottom-nav-container"
            onTouchMove={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {(() => {
                const items = [...NAVIGATION_ITEMS];
                // Insert FAB in the middle (index 3)
                const buttons = items.map((item, _index) => {
                    let isActive = false;

                    if (item.path === '/') {
                        isActive = currentPath === '/';
                    } else if (item.path === '/v2') {
                        isActive = currentPath.startsWith('/v2');
                    } else {
                        isActive = currentPath.startsWith(item.path);
                    }

                    const navButton = (
                        <button
                            key={`${item.path}-${item.label}`}
                            onClick={() => handleNavigation(item.path, item.action)}
                            className={`bottom-nav-item ${isActive ? 'active' : 'inactive'}`}
                            data-analytics-id={item.path}
                            data-analytics-type="nav_item"
                            data-analytics-title={item.label}
                            data-analytics-section="bottom_navigation"
                        >
                            <i
                                className={`${isActive ? item.iconFilled : item.icon} bottom-nav-icon`}
                            ></i>
                            <span className={`bottom-nav-label manual-label-wrapper ${isActive ? 'active' : ''}`}>
                                <span className="translated-part">{t(item.label)}</span>
                                <span className="fixed-part ko" translate="no">{item.label}</span>
                                <span className="fixed-part en" translate="no">{item.labelEn}</span>
                            </span>

                            {item.badge && (
                                <span className="bottom-nav-badge">
                                    {item.badge}
                                </span>
                            )}
                        </button>
                    );

                    return navButton;
                });

                // Add the FAB button if present
                if (pageAction) {


                    const fabButton = (
                        <button
                            key="fab-center"
                            onClick={onPageActionClick}
                            className={`bottom-nav-item fab-center-item board-fab`}
                            data-analytics-id="fab_action_center"
                            data-analytics-type="action"
                            data-analytics-title={pageAction.label || "Action"}
                            style={{
                                backgroundColor: '#3b82f6', // Blue
                                borderRadius: '50%',
                                width: '45px',
                                height: '45px',
                                minWidth: '45px', // Prevent shrink
                                minHeight: '45px', // Prevent shrink
                                flexShrink: 0,    // Prevent flex shrink
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginTop: '-22.5px', // Pop out a bit (half of 45px)
                                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                                border: '2px solid #111'
                            }}
                        >
                            <i
                                className={`${pageAction.icon} bottom-nav-icon fab-icon-only`}
                                style={{ color: 'white', fontSize: '24px', margin: 0 }}
                            ></i>
                        </button>
                    );
                    buttons.splice(3, 0, fabButton);
                }

                return buttons;
            })()}
        </div>
    );
}
