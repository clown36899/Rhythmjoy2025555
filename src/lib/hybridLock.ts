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

    constructor(name: string, timeout: number = 1500) {
        this.lockKey = `sb-lock-${name}`;
        // [Safety] 타임아웃이 0 이하로 들어오거나 너무 짧으면 최소 500ms 보장 (경쟁 상황 대비)
        this.timeout = (timeout <= 0) ? 1500 : Math.max(timeout, 500);
    }

    async acquire(fn: () => Promise<any> | any): Promise<any> {
        let start = Date.now();
        const myId = Math.random().toString(36).substring(2);

        // [Secret Mode Safe Guard] localStorage 접근 가능 여부 체크
        try {
            localStorage.setItem(`${this.lockKey}-test`, '1');
            localStorage.removeItem(`${this.lockKey}-test`);
        } catch (e) {
            console.warn('[HybridLock] LocalStorage access blocked (Secret Mode?). Bypassing lock.');
            return await fn();
        }

        // [Performance Fix] 메인 스레드 점유로 인해 루프 진입 전 이미 타임아웃된 경우 체크
        const beforeLoop = Date.now();
        const initialDrift = beforeLoop - start;

        if (initialDrift >= this.timeout) {
            console.warn(`[HybridLock] Main thread was blocked for ${initialDrift}ms (Timeout: ${this.timeout}ms). This is a 'Long Task' issue in the app, bypassing lock.`);
        }

        // Polling loop
        while (Date.now() - start < this.timeout) {
            try {
                const currentLock = localStorage.getItem(this.lockKey);

                // 락이 없거나, 락이 있어도 너무 오래된 경우(Dead Lock 방지 - 2.5초)
                // 타임아웃(1.5초)보다 약간 길게 설정하여 안전 확보
                if (!currentLock || (Date.now() - parseInt(currentLock.split('|')[1]) > 2500)) {
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
            const loopTick = Date.now();
            await new Promise(r => setTimeout(r, 50));

            // [Anti-Saturation] 만약 setTimeout이 50ms보다 훨씬 늦게 실행되었다면 (예: 200ms+)
            // 메인 스레드가 심각하게 잠긴 것이므로 락 획득 시도를 잠시 멈추거나 조건부 우회 검토
            const gap = Date.now() - loopTick;
            if (gap > 200) {
                console.warn(`[HybridLock] High main thread saturation detected (${gap}ms gap). Extending tolerance.`);
                start += gap;
                await new Promise(r => setTimeout(r, 100)); // 휴식 시간 연장
            }
        }

        // Timeout fallback: Just run it (unsafe but better than crash)
        console.warn(`[HybridLock] Lock acquisition timed out (${this.timeout}ms), bypassing lock`);
        return await fn();
    }
}

export const hybridLock = async (name: string, timeout: number = 1500, fn: () => Promise<any> | any) => {
    // [Safety] Supabase 내부에서 timeout을 0이나 undefined로 넘길 경우 기본값 적용
    const effectiveTimeout = (!timeout || timeout <= 0) ? 1500 : timeout;

    // 1. Safari나 모바일 환경이면 무조건 커스텀 락 사용 (안전 최우선)
    if (isSafariOrMobile()) {
        const locker = new LocalStorageLock(name, effectiveTimeout);
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
