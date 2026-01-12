export const authLogger = {
    log: (message: string, data?: any) => {
        try {
            const logs = JSON.parse(localStorage.getItem('auth_debug_logs') || '[]');
            const timestamp = new Date().toISOString();
            logs.push({ timestamp, message, data });
            // Keep only last 100 logs
            if (logs.length > 100) logs.shift();
            localStorage.setItem('auth_debug_logs', JSON.stringify(logs));
            // console.log(`[AuthDebug] ${message}`, data || '');
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
