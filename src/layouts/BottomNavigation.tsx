import { useNavigate, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../config/navigation';
import '../styles/components/BottomNavigation.css';
import {
    prefetchSocialPage,
    prefetchPracticePage,
    prefetchBoardPage,
    prefetchGuidePage,
    prefetchShoppingPage
} from '../router/routes';
import { useEffect, useState } from 'react';

export function BottomNavigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;
    const [calendarMode, setCalendarMode] = useState<'collapsed' | 'expanded' | 'fullscreen'>('collapsed');

    // Listen for calendar mode changes
    useEffect(() => {
        const handleCalendarModeChange = (e: Event) => {
            const customEvent = e as CustomEvent;
            setCalendarMode(customEvent.detail);
        };
        window.addEventListener('calendarModeChanged', handleCalendarModeChange);
        return () => window.removeEventListener('calendarModeChanged', handleCalendarModeChange);
    }, []);

    // Prefetch other pages for instant navigation
    useEffect(() => {
        const timer = setTimeout(() => {
            prefetchSocialPage();
            prefetchPracticePage();
            prefetchBoardPage();
            prefetchGuidePage();
            prefetchShoppingPage();
        }, 2500); // 2.5초 후 다른 페이지 리소스 로딩 시작

        return () => clearTimeout(timer);
    }, []);

    const handleNavigation = (path: string, action?: string) => {
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
            if (action === 'setFullscreenMode') {
                // Trigger fullscreen calendar mode
                window.dispatchEvent(new CustomEvent('setFullscreenMode'));
            } else {
                window.dispatchEvent(new CustomEvent('resetV2MainView'));
            }
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
        <div className="bottom-nav-container">
            {NAVIGATION_ITEMS.map((item) => {
                let isActive = false;

                if (item.path === '/') {
                    isActive = currentPath === '/';
                } else if (item.action === 'setFullscreenMode') {
                    // 전체달력: /v2 경로이면서 fullscreen 모드일 때만 활성화
                    isActive = currentPath.startsWith('/v2') && calendarMode === 'fullscreen';
                } else if (item.path === '/v2') {
                    // 이벤트: /v2 경로이면서 fullscreen이 아닐 때 활성화
                    isActive = currentPath.startsWith('/v2') && calendarMode !== 'fullscreen';
                } else {
                    isActive = currentPath.startsWith(item.path);
                }

                return (
                    <button
                        key={`${item.path}-${item.label}`}
                        onClick={() => handleNavigation(item.path, item.action)}
                        className={`bottom-nav-item ${isActive ? 'active' : 'inactive'}`}
                    >
                        <i
                            className={`${item.icon} bottom-nav-icon`}
                        ></i>
                        <span
                            className="bottom-nav-label"
                        >
                            {item.label}
                        </span>

                        {item.badge && (
                            <span className="bottom-nav-badge">
                                {item.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
