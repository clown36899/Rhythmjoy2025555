// YouTube IFrame Player API 타입
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
    __ytApiPromise?: Promise<void>;
  }
}

// YouTube Player 컴포넌트 인터페이스
export interface YouTubePlayerHandle {
  pauseVideo: () => void;
  playVideo: () => void;
  isReady: () => boolean;
}

export {};
