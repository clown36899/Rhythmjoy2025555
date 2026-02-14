export const authLogger = {
    log: (message: string, data?: unknown) => {
        // [Debug] 배포 환경에서도 즉시 확인 가능하도록 스타일 적용
        const style = 'background: #1a1a2e; color: #00ff00; font-weight: bold; padding: 2px 8px; border-radius: 4px; border: 1px solid #00ff00;';
        console.log(`%c[Auth] ${message}`, style, data || '');

        try {
            const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
            const timestamp = new Date().toISOString();
            logs.push({ timestamp, message, data });
            if (logs.length > 500) logs.shift(); // 용량 대폭 확장
            localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
        } catch (e) {
            // localStorage 실패해도 console로그는 이미 찍힘
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
