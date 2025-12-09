import { useNavigate, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../config/navigation';
import '../styles/components/BottomNavigation.css';

export function BottomNavigation() {
    const navigate = useNavigate();
    const location = useLocation();
    const currentPath = location.pathname;

    const handleNavigation = (path: string) => {
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
        }
    };

    return (
        <div className="bottom-nav-container">
            {NAVIGATION_ITEMS.map((item) => {
                const isActive = item.path === '/'
                    ? currentPath === '/'
                    : currentPath.startsWith(item.path);

                // Determine active color class (fallback to blue if not specified)
                const activeColorClass = item.activeColor || 'text-blue-500';
                // Extract the color part (e.g., 'text-blue-500' -> 'blue-500')
                // This is a bit of a hack to reuse existing config, ideally config should specify color variable
                const activeColorStyle = isActive ? { color: `var(--color-${activeColorClass.replace('text-', '')})` } : {};

                return (
                    <button
                        key={item.path}
                        onClick={() => handleNavigation(item.path)}
                        className={`bottom-nav-item ${isActive ? 'active' : 'inactive'}`}
                    >
                        <i
                            className={`${item.icon} bottom-nav-icon`}
                            style={activeColorStyle}
                        ></i>
                        <span
                            className="bottom-nav-label"
                            style={activeColorStyle}
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
