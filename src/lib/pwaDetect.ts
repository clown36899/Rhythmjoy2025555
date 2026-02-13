/**
 * 공유 PWA 감지 유틸리티
 * manifest.json의 display: "fullscreen" 설정과 호환되도록
 * 모든 display-mode를 체크합니다.
 */
export function isPWAMode(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;

    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as any).standalone === true ||
        window.location.search.includes('utm_source=pwa')
    );
}
