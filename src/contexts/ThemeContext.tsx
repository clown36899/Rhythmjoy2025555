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
        // [Fix] 사용자의 명시적 선택이 없는 한 다크 모드를 기본으로 함
        // 1. localStorage에서 저장된 수동 설정 테마 불러오기
        const saved = localStorage.getItem('theme');
        if (saved) return saved as Theme;

        // 2. 기본값: 무조건 다크 모드 (OS 설정 및 시간 기반 자동 감지 제거)
        return 'dark';
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
