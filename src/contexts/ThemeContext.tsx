import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [theme, setTheme] = useState<Theme>(() => {
        // 1. localStorage에서 저장된 수동 설정 테마 불러오기
        const saved = localStorage.getItem('theme');
        if (saved) return saved as Theme;

        // 2. 설정이 없을 경우 시간 기반 자동 설정 (06:00 ~ 18:00 라이트, 그 외 다크)
        const hour = new Date().getHours();
        const isDayTime = hour >= 6 && hour < 18;
        return isDayTime ? 'light' : 'dark';
    });

    useEffect(() => {
        // HTML 루트에 테마 클래스 적용
        document.documentElement.setAttribute('data-theme', theme);
        // localStorage에 저장
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within ThemeProvider');
    }
    return context;
}
