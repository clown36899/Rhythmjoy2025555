declare global {
  interface Window {
    Android?: {
      playVideo: (videoId: string) => void;
    };
  }
}

export function isAndroidWebView(): boolean {
  return typeof window !== 'undefined' && typeof window.Android !== 'undefined';
}

export function playVideoNative(videoId: string): void {
  if (isAndroidWebView() && window.Android?.playVideo) {
    console.log('[Android] 네이티브 플레이어 호출:', videoId);
    window.Android.playVideo(videoId);
  } else {
    console.warn('[Android] 네이티브 플레이어 인터페이스를 찾을 수 없습니다');
  }
}
