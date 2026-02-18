/**
 * Hybrid Lock Engine for Supabase Auth
 * 
 * [목적]
 * 1. PC (Chrome/Firefox): navigator.locks를 사용하여 가장 안정적인 탭 간 동기화 제공 (Deployment Race Condition 방지)
 * 2. Mobile/Safari: navigator.locks의 데드락 이슈(탭 백그라운드 전환 시 멈춤)를 피하기 위해 localStorage 기반 Mutex 사용
 */

const isSafariOrMobile = () => {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent.toLowerCase();
    const isSafari = ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
    const isMobile = /iphone|ipad|ipod|android/i.test(ua);
    return isSafari || isMobile;
};

// LocalStorage Mutex Polyfill
class LocalStorageLock {
    private lockKey: string;
    private timeout: number;

    constructor(name: string, timeout: number = 5000) {
        this.lockKey = `sb-lock-${name}`;
        this.timeout = timeout;
    }

    async acquire(fn: () => Promise<any> | any): Promise<any> {
        const start = Date.now();
        const myId = Math.random().toString(36).substring(2);

        // [Secret Mode Safe Guard] localStorage 접근 가능 여부 체크
        try {
            localStorage.setItem(`${this.lockKey}-test`, '1');
            localStorage.removeItem(`${this.lockKey}-test`);
        } catch (e) {
            console.warn('[HybridLock] LocalStorage access blocked (Secret Mode?). Bypassing lock.');
            return await fn();
        }

        // Polling loop
        while (Date.now() - start < this.timeout) {
            try {
                const currentLock = localStorage.getItem(this.lockKey);

                // 락이 없거나, 락이 있어도 너무 오래된 경우(Dead Lock 방지 - 5초)
                if (!currentLock || (Date.now() - parseInt(currentLock.split('|')[1]) > 5000)) {
                    // Try to acquire
                    const timestamp = Date.now();
                    localStorage.setItem(this.lockKey, `${myId}|${timestamp}`);

                    // Verification (Double check for race condition)
                    await new Promise(r => setTimeout(r, 10));
                    const verify = localStorage.getItem(this.lockKey);

                    if (verify && verify.startsWith(myId)) {
                        // Lock Acquired
                        try {
                            return await fn();
                        } finally {
                            // Release check
                            const current = localStorage.getItem(this.lockKey);
                            if (current && current.startsWith(myId)) {
                                localStorage.removeItem(this.lockKey);
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn('[HybridLock] Error during lock acquisition:', e);
                break; // 에러 발생 시 루프 중단 후 Fallback 실행
            }

            // Wait before retry
            await new Promise(r => setTimeout(r, 50));
        }

        // Timeout fallback: Just run it (unsafe but better than crash)
        console.warn('[HybridLock] Lock acquisition timed out or failed, bypassing lock');
        return await fn();
    }
}

export const hybridLock = async (name: string, timeout: number = 5000, fn: () => Promise<any> | any) => {
    // 1. Safari나 모바일 환경이면 무조건 커스텀 락 사용 (안전 최우선)
    if (isSafariOrMobile()) {
        const locker = new LocalStorageLock(name, timeout);
        return locker.acquire(fn);
    }

    // 2. PC Chrome 등 안정적인 환경은 네이티브 락 사용 (성능 최우선)
    if (typeof navigator !== 'undefined' && 'locks' in navigator) {
        try {
            return await navigator.locks.request(name, { mode: 'exclusive' }, fn);
        } catch (e) {
            console.warn('[HybridLock] Native lock failed, falling back to direct execution', e);
            return await fn();
        }
    }

    // 3. Fallback
    return await fn();
};
