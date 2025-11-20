import { useEffect, useRef, forwardRef, useImperativeHandle, memo } from "react";
import { log, warn } from "../utils/logger";
import type { YouTubePlayerHandle } from "../types";

interface YouTubePlayerProps {
  videoId: string;
  slideIndex: number;
  isVisible: boolean;
  onPlayingCallback: (index: number) => void;
  onEndedCallback: (index: number) => void;
  onPlayerError: (index: number, error: any) => void;
  apiReady: boolean;
}

// YouTube Player 컴포넌트 (forwardRef + memo로 최적화)
const YouTubePlayer = memo(forwardRef<YouTubePlayerHandle, YouTubePlayerProps>(({
  videoId,
  slideIndex,
  isVisible,
  onPlayingCallback,
  onEndedCallback,
  onPlayerError,
  apiReady,
}, ref) => {
  const playerRef = useRef<any>(null);
  const hasCalledOnPlaying = useRef(false);
  const playerReady = useRef(false);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 외부에서 제어 가능하도록 함수 노출
  useImperativeHandle(ref, () => ({
    pauseVideo: () => {
      if (playerRef.current?.pauseVideo) {
        playerRef.current.pauseVideo();
        log(`[플레이어 제어] 슬라이드 ${slideIndex} - ⏸️ 일시정지 명령 실행`, {
          videoId,
          playerExists: !!playerRef.current,
          isReady: playerReady.current
        });
      } else {
        warn(`[플레이어 제어] 슬라이드 ${slideIndex} - ⚠️ 일시정지 실패: Player 없음`);
      }
    },
    playVideo: () => {
      if (playerRef.current?.playVideo) {
        playerRef.current.playVideo();
        log(`[플레이어 제어] 슬라이드 ${slideIndex} - ▶️ 재생 명령 실행`, {
          videoId,
          playerExists: !!playerRef.current,
          isReady: playerReady.current
        });
      } else {
        warn(`[플레이어 제어] 슬라이드 ${slideIndex} - ⚠️ 재생 실패: Player 없음`);
      }
    },
    isReady: () => {
      const ready = playerReady.current;
      log(`[플레이어 제어] 슬라이드 ${slideIndex} - 준비 상태 확인: ${ready ? '✅ 준비됨' : '⏳ 준비 안됨'}`, {
        videoId,
        playerExists: !!playerRef.current
      });
      return ready;
    },
  }));

  // isVisible이 false가 되면 Player 즉시 destroy (메모리 최적화)
  useEffect(() => {
    if (!isVisible && playerRef.current) {
      log(`[💾 메모리 관리] 슬라이드 ${slideIndex} - isVisible=false 감지, 메모리 해제 시작`, { videoId });
      try {
        const iframe = playerRef.current.getIframe ? playerRef.current.getIframe() : null;
        if (iframe && document.body.contains(iframe)) {
          log(`[💾 메모리 관리] 슬라이드 ${slideIndex} - Player.destroy() 호출`);
          playerRef.current.destroy();
        } else {
          warn(`[💾 메모리 관리] 슬라이드 ${slideIndex} - destroy() 스킵: iframe이 이미 DOM에서 제거됨`);
        }
      } catch (err) {
        warn(`[YouTube] Player destroy 중 오류 발생 (슬라이드 ${slideIndex}):`, err);
      }
      playerRef.current = null;
      playerReady.current = false;
      hasCalledOnPlaying.current = false;
    } else if (!isVisible) {
      log(`[🎮 플레이어] 슬라이드 ${slideIndex} - 화면 밖 (Player 인스턴스 없음)`, videoId);
    }
  }, [isVisible, videoId, slideIndex]);

  // Player 생성 (isVisible이 true일 때만 생성, 메모리 최적화)
  useEffect(() => {
    if (!isVisible) {
      log(`[플레이어 상태] 슬라이드 ${slideIndex} - 생성 스킵 (화면에 표시 안됨)`, videoId);
      return;
    }

    if (!apiReady || !videoId || playerRef.current) {
      if (playerRef.current) {
        log(`[플레이어 상태] 슬라이드 ${slideIndex} - ♻️ 기존 인스턴스 유지 중 (재생성 스킵)`, {
          videoId,
          ready: playerReady.current,
          hasPlayed: hasCalledOnPlaying.current
        });
      }
      if (!apiReady) {
        log(`[플레이어 상태] 슬라이드 ${slideIndex} - YouTube API 대기 중...`);
      }
      return;
    }

    const playerId = `yt-player-${slideIndex}`;
    
    const memBefore = (performance as any).memory?.usedJSHeapSize ?? 0;
    const memBeforeMB = (memBefore / 1024 / 1024).toFixed(1);
    
    log(`[🎮 플레이어] 슬라이드 ${slideIndex} - 🔧 생성 시작`, {
      playerId,
      videoId,
      isVisible,
      apiReady
    });
    log(`[💾 메모리] PLAYER ${slideIndex} 생성 전 - 현재 메모리: ${memBeforeMB}MB`);
    
    const timer = setTimeout(() => {
      const element = document.getElementById(playerId);
      if (!element) {
        console.error('[YouTube] DOM 요소를 찾을 수 없음:', playerId);
        return;
      }

      try {
        const isAndroidWebView = /android/i.test(navigator.userAgent) && /wv/i.test(navigator.userAgent);
        
        const originValue = isAndroidWebView 
          ? undefined
          : window.location.origin;
        
        playerRef.current = new window.YT.Player(playerId, {
          videoId,
          playerVars: {
            ...(originValue ? { origin: originValue } : {}),
            autoplay: 0,
            mute: 1,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            vq: 'medium',
            disablekb: 1,
            fs: 0,
          },
          events: {
            onReady: (event: any) => {
              playerReady.current = true;
              const playerState = event.target.getPlayerState?.() ?? -1;
              const duration = event.target.getDuration?.() ?? 0;
              const currentTime = event.target.getCurrentTime?.() ?? 0;
              const loadedFraction = event.target.getVideoLoadedFraction?.() ?? 0;
              const quality = event.target.getPlaybackQuality?.() ?? 'unknown';
              const availableQualities = event.target.getAvailableQualityLevels?.() ?? [];
              const volume = event.target.getVolume?.() ?? 0;
              
              const memReady = (performance as any).memory?.usedJSHeapSize ?? 0;
              const memReadyMB = (memReady / 1024 / 1024).toFixed(1);
              const totalMemMB = ((performance as any).memory?.totalJSHeapSize ?? 0) / 1024 / 1024;
              
              log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ✅ 준비 완료 (READY)`, {
                videoId,
                canPlay: true,
                isVisible,
                playerState,
                duration: `${duration.toFixed(1)}s`,
                currentTime: `${currentTime.toFixed(1)}s`,
                버퍼링진행도: `${(loadedFraction * 100).toFixed(1)}%`,
                재생품질: quality,
                사용가능품질: availableQualities.join(', '),
                볼륨: volume,
                메모리상태: '로드됨'
              });
              log(`[💾 메모리] PLAYER ${slideIndex} 준비 완료 - 현재: ${memReadyMB}MB / 총 할당: ${totalMemMB.toFixed(1)}MB`);
            },
            onStateChange: (event: any) => {
              const stateNames: Record<number, string> = {
                '-1': 'UNSTARTED',
                '0': 'ENDED',
                '1': 'PLAYING',
                '2': 'PAUSED',
                '3': 'BUFFERING',
                '5': 'CUED'
              };
              const stateName = stateNames[event.data] || `UNKNOWN(${event.data})`;
              
              log(`[플레이어 상태] 슬라이드 ${slideIndex} - 상태 변경: ${stateName}`, {
                videoId,
                stateCode: event.data,
                isVisible,
                hasPlayed: hasCalledOnPlaying.current
              });

              if (event.data === 1) {
                if (!hasCalledOnPlaying.current) {
                  const loadedFraction = playerRef.current?.getVideoLoadedFraction?.() ?? 0;
                  const quality = playerRef.current?.getPlaybackQuality?.() ?? 'unknown';
                  const currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
                  log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ▶️ 첫 재생 시작됨`, {
                    videoId,
                    현재시간: `${currentTime.toFixed(1)}s`,
                    버퍼링진행도: `${(loadedFraction * 100).toFixed(1)}%`,
                    재생품질: quality,
                    데이터로딩: '완료'
                  });
                  hasCalledOnPlaying.current = true;
                  onPlayingCallback(slideIndex);
                } else {
                  log(`[플레이어 상태] 슬라이드 ${slideIndex} - ▶️ 재생 중...`);
                }
              } else if (event.data === 0 && isVisible) {
                log(`[플레이어 상태] 슬라이드 ${slideIndex} - ✅ 영상 종료 → 다음 슬라이드로 전환`);
                hasCalledOnPlaying.current = false;
                onEndedCallback(slideIndex);
              } else if (event.data === 2) {
                log(`[플레이어 상태] 슬라이드 ${slideIndex} - ⏸️ 일시정지됨`);
                hasCalledOnPlaying.current = false;
              } else if (event.data === 3) {
                const loadedFraction = playerRef.current?.getVideoLoadedFraction?.() ?? 0;
                const quality = playerRef.current?.getPlaybackQuality?.() ?? 'unknown';
                log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ⏳ 버퍼링 중...`, {
                  videoId,
                  버퍼링진행도: `${(loadedFraction * 100).toFixed(1)}%`,
                  재생품질: quality,
                  데이터로딩: '진행중'
                });
              }
            },
            onError: (event: any) => {
              const errorCodes: Record<number, string> = {
                2: '잘못된 요청 파라미터',
                5: 'HTML5 플레이어 오류',
                100: '비디오를 찾을 수 없음',
                101: '임베드 허용 안됨',
                150: '임베드 허용 안됨'
              };
              const errorPayload = {
                videoId,
                errorCode: event.data
              };
              const errorMsg = errorCodes[event.data] || `알 수 없는 오류 (코드: ${event.data})`;
              warn(`[플레이어 상태] 슬라이드 ${slideIndex} - ⚠️ 재생 오류 (자동 복구됨): ${errorMsg}`, errorPayload);
              onPlayerError(slideIndex, errorPayload);
            },
          },
        });
        
        const memAfter = (performance as any).memory?.usedJSHeapSize ?? 0;
        const memAfterMB = (memAfter / 1024 / 1024).toFixed(1);
        const memDiff = ((memAfter - memBefore) / 1024 / 1024).toFixed(1);
        
        log(`[🎮 플레이어] 슬라이드 ${slideIndex} - Player 객체 생성 완료 (초기화 대기 중...)`);
        log(`[💾 메모리] PLAYER ${slideIndex} 생성 후 - 현재: ${memAfterMB}MB (증가: +${memDiff}MB)`);
      } catch (err) {
        console.error('[YouTube] Player 생성 실패:', err);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      if (playerRef.current) {
        try {
          const iframe = playerRef.current.getIframe ? playerRef.current.getIframe() : null;
          if (iframe && document.body.contains(iframe)) {
            log(`[💾 메모리 관리] 슬라이드 ${slideIndex} - cleanup: Player.destroy() 호출`);
            playerRef.current.destroy();
          } else {
            warn(`[💾 메모리 관리] 슬라이드 ${slideIndex} - cleanup 스킵: iframe이 이미 DOM에서 제거됨`);
          }
        } catch (err) {
          warn(`[YouTube] Player destroy 중 오류 발생 (슬라이드 ${slideIndex}):`, err);
        }
        playerRef.current = null;
      }
      hasCalledOnPlaying.current = false;
      playerReady.current = false;
    };
  }, [apiReady, videoId, onPlayingCallback, isVisible, slideIndex, onEndedCallback, onPlayerError]);

  return <div id={`yt-player-${slideIndex}`} className="w-full h-full" />;
}), (prevProps, nextProps) => {
  const shouldSkipRender = prevProps.videoId === nextProps.videoId && 
                           prevProps.apiReady === nextProps.apiReady &&
                           prevProps.isVisible === nextProps.isVisible;
  
  if (shouldSkipRender && prevProps.slideIndex !== nextProps.slideIndex) {
    log(`[YouTube 캐시] videoId ${prevProps.videoId} 재사용 (슬라이드 ${prevProps.slideIndex} → ${nextProps.slideIndex})`);
  }
  
  return shouldSkipRender;
});

YouTubePlayer.displayName = 'YouTubePlayer';

export default YouTubePlayer;
