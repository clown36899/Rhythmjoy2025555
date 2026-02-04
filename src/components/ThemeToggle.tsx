import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { logUserInteraction } from '../lib/analytics';

import '../styles/components/ThemeToggle.css';

/**
 * Header Theme Toggle Button
 */
export const ThemeToggle: React.FC = () => {
    const { theme, toggleTheme } = useTheme();

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
