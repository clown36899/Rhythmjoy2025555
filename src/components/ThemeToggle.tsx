import React from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { logUserInteraction } from '../lib/analytics';

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
            style={{
                marginLeft: '8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-primary)',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '8px',
                borderRadius: '50%',
                transition: 'background-color 0.2s'
            }}
        >
            {theme === 'dark' ? (
                <i className="ri-sun-line" style={{ color: 'var(--color-yellow-400)' }}></i>
            ) : (
                <i className="ri-moon-line" style={{ color: 'var(--text-primary)' }}></i>
            )}
        </button>
    );
};
