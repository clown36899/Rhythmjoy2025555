import { addClientLog } from './clientLogBuffer';

const AUTH_DEBUG = import.meta.env.VITE_AUTH_DEBUG === 'true';
const IMPORTANT_AUTH_LOG_RE = /kakao|callback|setsession|signed_in|signed_out|token_refreshed|safety net|failed|error|timeout|로그인|인증/i;

export const authLogger = {
    log: (message: string, data?: unknown) => {
        const shouldKeepInClientLog = AUTH_DEBUG || IMPORTANT_AUTH_LOG_RE.test(message);

        if (shouldKeepInClientLog && typeof window !== 'undefined') {
            addClientLog('event', `[Auth] ${message}`, data || '');
        }

        if (AUTH_DEBUG) {
            const style = 'background: #1a1a2e; color: #00ff00; font-weight: bold; padding: 2px 8px; border-radius: 4px; border: 1px solid #00ff00;';
            console.debug(`%c[Auth] ${message}`, style, data || '');
        }

        // [Safety] localStorage가 차단된 환경에서도 로깅 중단 방지
        try {
            if (AUTH_DEBUG && typeof window !== 'undefined' && window.localStorage) {
                const logs = JSON.parse(window.localStorage.getItem('auth_logs') || '[]');
                const timestamp = new Date().toISOString();
                const entry = { timestamp, message, data };
                logs.push(entry);
                if (logs.length > 500) logs.shift();
                window.localStorage.setItem('auth_logs', JSON.stringify(logs));
            }
        } catch (e) {
            // localStorage 실패 시 콘솔에는 이미 남았으므로 조용히 처리
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
