import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { logUserInteraction } from '../lib/analytics';

import '../styles/components/ThemeToggle.css';

/**
 * Header Theme Toggle Button
 * 임시로 관리자만 볼 수 있도록 제한 (화이트 모드 테스트 중)
 */
export const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();
    const { user } = useAuth();

    // 관리자 확인 (JWT 메타데이터)
    const isAdmin = user?.user_metadata?.is_admin === true || user?.app_metadata?.is_admin === true;

    // 관리자가 아니면 토글 버튼 숨김
    if (!isAdmin) return null;

    const handleToggle = () => {
        toggleTheme();
        logUserInteraction('Theme', 'Toggle', theme === 'dark' ? 'light' : 'dark');
    };

    return (
        <button
            onClick={handleToggle}
            className="header-theme-btn"
            title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
            data-analytics-id="header_theme_toggle"
            data-analytics-type="action"
            data-analytics-section="header"
        >
            {theme === 'dark' ? (
                <i className="ri-sun-line"></i>
            ) : (
                <i className="ri-moon-line"></i>
            )}
        </button>
    );
};
