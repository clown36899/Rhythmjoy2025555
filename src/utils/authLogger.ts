export const authLogger = {
    log: (message: string, data?: unknown) => {
        try {
            const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
            const timestamp = new Date().toISOString();
            logs.push({ timestamp, message, data });
            // Keep only last 100 logs
            if (logs.length > 100) logs.shift();
            localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
            console.log(`%c[AuthDebug] ${message}`, 'background: #222; color: #bada55', data || '');
        } catch (e) {
            console.warn('Failed to save auth log', e);
        }
    },
    getLogs: () => {
        return JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
    },
    clear: () => {
        localStorage.removeItem('auth_debug_logs');
    }
};
