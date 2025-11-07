declare global {
  interface Window {
    Android?: {
      playVideo: (videoId: string) => void;
      hideVideo: () => void;
      setOrientation: (isPortrait: boolean) => void;
    };
  }
}

export function isAndroidWebView(): boolean {
  return typeof window !== 'undefined' && typeof window.Android !== 'undefined';
}

export function playVideoNative(videoId: string): void {
  if (isAndroidWebView() && window.Android?.playVideo) {
    console.log('[Android] 네이티브 플레이어 재생:', videoId);
    window.Android.playVideo(videoId);
  } else {
    console.warn('[Android] 네이티브 플레이어 인터페이스를 찾을 수 없습니다');
  }
}

export function hideVideoNative(): void {
  if (isAndroidWebView() && window.Android?.hideVideo) {
    console.log('[Android] 네이티브 플레이어 숨김');
    window.Android.hideVideo();
  }
}

export function notifyOrientationNative(isPortrait: boolean): void {
  if (isAndroidWebView() && window.Android?.setOrientation) {
    console.log('[Android] 화면 방향 알림:', isPortrait ? '세로' : '가로');
    window.Android.setOrientation(isPortrait);
  } else if (isAndroidWebView()) {
    console.warn('[Android] setOrientation 인터페이스를 찾을 수 없습니다 (구버전 APK일 수 있음)');
  }
}
