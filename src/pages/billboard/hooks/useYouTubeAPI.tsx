import { useEffect, useState } from "react";
import { log } from "../utils/logger";

/**
 * YouTube IFrame Player API를 전역 Promise 패턴으로 로드하는 훅
 * 
 * @returns {boolean} API 준비 상태
 * 
 * 특징:
 * - window.__ytApiPromise 전역 Promise로 중복 로드 방지
 * - React Strict Mode 대응 (isMounted guard)
 * - 메모리 누수 방지
 */
export function useYouTubeAPI(): boolean {
  const [youtubeApiReady, setYoutubeApiReady] = useState(false);

  useEffect(() => {
    const isMountedRef = { current: true };
    log('[🔧 YouTube API 초기화] useEffect 시작');

    // ✅ 전역 Promise로 YouTube API 로드 (중복 로드 방지, 메모리 안전)
    if (!(window as any).__ytApiPromise) {
      log('[🔧 YouTube API 초기화] 전역 Promise 생성 시작');
      (window as any).__ytApiPromise = new Promise<void>((resolve) => {
        // 이미 로드됨
        if (window.YT && window.YT.Player) {
          log('[✅ YouTube API] 이미 로드됨 (Promise 즉시 resolve)', {
            YT존재: !!window.YT,
            Player존재: !!(window.YT && window.YT.Player)
          });
          resolve();
          return;
        }

        // 이전 핸들러 백업
        const prevHandler = window.onYouTubeIframeAPIReady;
        log('[🔧 YouTube API 초기화] 콜백 설정 중', {
          이전핸들러있음: !!prevHandler
        });
        
        // API 준비 콜백 설정
        window.onYouTubeIframeAPIReady = () => {
          log('[✅ YouTube API] 🎉 준비 완료! (Promise resolve)', {
            YT존재: !!window.YT,
            Player존재: !!(window.YT && window.YT.Player),
            타임스탬프: new Date().toLocaleTimeString()
          });
          // 이전 핸들러 실행 (있다면)
          if (prevHandler && typeof prevHandler === 'function') {
            log('[🔧 YouTube API 초기화] 이전 핸들러 실행');
            prevHandler();
          }
          resolve();
        };

        // 스크립트 로드
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
          log('[🔧 YouTube API 초기화] 🌐 스크립트 태그 삽입 시작');
          const tag = document.createElement('script');
          tag.src = 'https://www.youtube.com/iframe_api';
          const firstScript = document.getElementsByTagName('script')[0];
          firstScript.parentNode?.insertBefore(tag, firstScript);
          log('[🔧 YouTube API 초기화] 스크립트 태그 삽입 완료 (로드 대기 중...)');
        } else {
          log('[🔧 YouTube API 초기화] 스크립트 태그 이미 존재 (로드 대기 중...)');
        }
      });
    } else {
      log('[🔧 YouTube API 초기화] 전역 Promise 이미 존재 (재사용)');
    }

    // Promise 기다린 후 상태 업데이트 (isMounted guard로 메모리 누수 방지)
    log('[🔧 YouTube API 초기화] Promise.then() 대기 시작');
    (window as any).__ytApiPromise.then(() => {
      if (isMountedRef.current) {
        log('[✅ YouTube API] 🚀 상태 업데이트: youtubeApiReady = true', {
          컴포넌트마운트: true,
          YT존재: !!window.YT,
          Player존재: !!(window.YT && window.YT.Player)
        });
        setYoutubeApiReady(true);
      } else {
        log('[⚠️ YouTube API] 컴포넌트 unmount됨 → 상태 업데이트 스킵 (메모리 누수 방지)', {
          컴포넌트마운트: false
        });
      }
    });

    // Cleanup: unmount 시 플래그만 false로 설정
    return () => {
      isMountedRef.current = false;
      log('[🧹 YouTube API cleanup] isMounted = false');
    };
  }, []);

  return youtubeApiReady;
}
