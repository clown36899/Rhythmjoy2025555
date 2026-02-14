export const authLogger = {
    log: (message: string, data?: unknown) => {
        try {
            const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
            const timestamp = new Date().toISOString();
            logs.push({ timestamp, message, data });
            if (logs.length > 200) logs.shift(); // 200개로 확장
            localStorage.setItem('auth_debug_logs', JSON.stringify(logs));

            // 더 눈에 띄는 스타일 적용
            console.log(`%c[Auth] ${message}`, 'background: #222; color: #00ff00; font-weight: bold; padding: 2px 5px; border-radius: 3px;', data || '');
        } catch (e) {
            console.warn('Failed to save auth log', e);
        }
    },
    getLogs: () => {
        try {
            return JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
        } catch (e) { return []; }
    },
    clear: () => {
        localStorage.removeItem('auth_debug_logs');
    }
};

// 전역 디버깅용 노출
if (typeof window !== 'undefined') {
    (window as any).__AUTH_LOGGER = authLogger;
}
