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
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        (window.navigator as any).standalone === true
    );
}

/**
 * 현재 기기의 모바일 플랫폼을 반환합니다.
 */
export function getMobilePlatform(): 'android' | 'ios' | 'other' {
  if (typeof window === 'undefined') return 'other';
  const ua = navigator.userAgent.toLowerCase();
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'other';
}

/**
 * iOS 전용: BroadcastChannel 미지원(15.4 미만) 기기 여부 확인
 */
export function isLegacyIOS(): boolean {
    if (typeof window === 'undefined') return false;
    const isIOS = /iPhone|iPad|PWA/i.test(navigator.userAgent);
    // Safari 15.4부터 BroadcastChannel 지원.
    // 구형 기기에서 라이브러리 등이 작동하지 않으므로 감지용으로 사용.
    return isIOS && !('BroadcastChannel' in window);
}
