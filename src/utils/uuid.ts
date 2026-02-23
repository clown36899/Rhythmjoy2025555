/**
 * UUID 생성 유틸리티 (Cross-Environment Support)
 * PWA/HTTP/Insecure Context/Legacy Browsers 등 모든 환경 호환성 보장
 */
export const generateUUID = (): string => {
    // 1. Native Crypto API (Modern Secure Context)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch (error) {
            // Insecure context (http) may have crypto defined but randomUUID blocked
            // Fallback to manual generation
        }
    }

    // 2. Math.random Fallback (RFC 4122 v4 compliant)
    // performance.now()를 섞어 엔트로피 강화
    let d = new Date().getTime();
    let d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now() * 1000)) || 0;

    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        let r = Math.random() * 16;
        if (d > 0) {
            r = (d + r) % 16 | 0;
            d = Math.floor(d / 16);
        } else {
            r = (d2 + r) % 16 | 0;
            d2 = Math.floor(d2 / 16);
        }
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};
