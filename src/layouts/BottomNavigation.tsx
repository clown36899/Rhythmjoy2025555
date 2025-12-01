import { useNavigate, useLocation } from 'react-router-dom';
import { NAVIGATION_ITEMS } from '../config/navigation';

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
        } else {
            navigate(path);
        }
    };

    return (
        <div className="flex items-center justify-around px-2 py-2 border-t border-[#22262a] no-select" style={{ backgroundColor: "var(--header-bg-color)" }}>
            {NAVIGATION_ITEMS.map((item) => {
                const isActive = item.path === '/'
                    ? currentPath === '/'
                    : currentPath.startsWith(item.path);

                return (
                    <button
                        key={item.path}
                        onClick={(e) => {
                            if (isActive) {
                                const btn = e.currentTarget;
                                btn.style.transform = 'scale(0.95)';
                                btn.style.opacity = '0.7';
                            }
                            handleNavigation(item.path);
                        }}
                        className={`flex flex-col items-center justify-center px-2 py-1 rounded-lg transition-all active:scale-95 flex-1 relative ${isActive ? item.activeColor : "text-gray-300 hover:text-white"
                            }`}
                    >
                        <i className={`${item.icon} text-xl mb-0.5`}></i>
                        <span className="text-xs">{item.label}</span>
                        {item.badge && (
                            <span className="absolute top-0 right-1 text-[9px] text-orange-400 font-semibold no-select">
                                {item.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
