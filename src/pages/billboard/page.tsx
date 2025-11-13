import { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle, memo } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../lib/supabase";
import type {
  BillboardUser,
  BillboardUserSettings,
  Event,
} from "../../lib/supabase";
import { parseVideoUrl } from "../../utils/videoEmbed";

// YouTube IFrame Player API 타입
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

// YouTube Player 컴포넌트 인터페이스
export interface YouTubePlayerHandle {
  pauseVideo: () => void;
  playVideo: () => void;
  isReady: () => boolean;
}

// YouTube Player 컴포넌트 (forwardRef + memo로 최적화)
const YouTubePlayer = memo(forwardRef<YouTubePlayerHandle, {
  videoId: string;
  slideIndex: number;
  isVisible: boolean;  // 현재 표시 중인지 여부
  onPlayingCallback: (index: number) => void;
  apiReady: boolean;  // 부모로부터 API 준비 상태 받기
}>(({
  videoId,
  slideIndex,
  isVisible,  // props로 받기
  onPlayingCallback,
  apiReady,  // props로 받기
}, ref) => {
  const playerRef = useRef<any>(null);
  const hasCalledOnPlaying = useRef(false);
  const playerReady = useRef(false);  // YouTube Player 준비 상태
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);  // 루프 재생 타이머 (메모리 누수 방지)

  // 외부에서 제어 가능하도록 함수 노출
  useImperativeHandle(ref, () => ({
    pauseVideo: () => {
      if (playerRef.current?.pauseVideo) {
        playerRef.current.pauseVideo();
        console.log(`[플레이어 제어] 슬라이드 ${slideIndex} - ⏸️ 일시정지 명령 실행`, {
          videoId,
          playerExists: !!playerRef.current,
          isReady: playerReady.current
        });
      } else {
        console.warn(`[플레이어 제어] 슬라이드 ${slideIndex} - ⚠️ 일시정지 실패: Player 없음`);
      }
    },
    playVideo: () => {
      if (playerRef.current?.playVideo) {
        playerRef.current.playVideo();
        console.log(`[플레이어 제어] 슬라이드 ${slideIndex} - ▶️ 재생 명령 실행`, {
          videoId,
          playerExists: !!playerRef.current,
          isReady: playerReady.current
        });
      } else {
        console.warn(`[플레이어 제어] 슬라이드 ${slideIndex} - ⚠️ 재생 실패: Player 없음`);
      }
    },
    isReady: () => {
      const ready = playerReady.current;
      console.log(`[플레이어 제어] 슬라이드 ${slideIndex} - 준비 상태 확인: ${ready ? '✅ 준비됨' : '⏳ 준비 안됨'}`, {
        videoId,
        playerExists: !!playerRef.current
      });
      return ready;
    },
  }));

  // isVisible이 false가 되면 Player 즉시 destroy (메모리 최적화)
  useEffect(() => {
    if (!isVisible && playerRef.current) {
      try {
        // 메모리 측정 (제거 전) - WebView에서는 0 표시됨
        const memBeforeDestroy = (performance as any).memory?.usedJSHeapSize ?? 0;
        const memBeforeDestroyMB = (memBeforeDestroy / 1024 / 1024).toFixed(1);
        const isWebView = /wv/.test(navigator.userAgent);
        
        console.log(`[💾 메모리 관리] 슬라이드 ${slideIndex} - isVisible=false 감지, 메모리 해제 시작`, {
          videoId,
          playerExists: !!playerRef.current,
          wasReady: playerReady.current,
          환경: isWebView ? 'WebView' : '웹브라우저'
        });
        
        if (!isWebView && memBeforeDestroy > 0) {
          console.log(`[💾 메모리] PLAYER ${slideIndex} 제거 전 - 현재 메모리: ${memBeforeDestroyMB}MB`);
        }
        
        // ✅ 1단계: 비디오 버퍼 플러시 (APK WebView 메모리 누적 방지)
        console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - 1단계: 비디오 버퍼 플러시`);
        if (playerRef.current.stopVideo) {
          playerRef.current.stopVideo();
        }
        if (playerRef.current.clearVideo) {
          playerRef.current.clearVideo();
        }
        
        // ✅ 2단계: Player 인스턴스 제거
        console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - 2단계: destroy() 호출`);
        playerRef.current.destroy();
        
        // ✅ 3단계: iframe DOM 요소 직접 제거 (WebView 리소스 해제 보장)
        const playerId = `yt-player-${slideIndex}`;
        const iframeElement = document.getElementById(playerId);
        if (iframeElement) {
          console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - 3단계: iframe DOM 제거`);
          iframeElement.innerHTML = ''; // 내부 정리
          iframeElement.remove(); // DOM 제거
        }
        
        // 메모리 측정 (제거 후) - GC가 즉시 실행되지 않을 수 있음
        if (!isWebView && memBeforeDestroy > 0) {
          setTimeout(() => {
            const memAfterDestroy = (performance as any).memory?.usedJSHeapSize ?? 0;
            const memAfterDestroyMB = (memAfterDestroy / 1024 / 1024).toFixed(1);
            const memFreed = ((memBeforeDestroy - memAfterDestroy) / 1024 / 1024).toFixed(1);
            console.log(`[💾 메모리] PLAYER ${slideIndex} 제거 후 - 현재: ${memAfterDestroyMB}MB (감소: ${memFreed}MB, GC 대기중)`);
          }, 100);
        }
        
        console.log(`[💾 메모리 관리] ✅ PLAYER ${slideIndex} 완전 제거 완료 (버퍼+destroy+DOM)`);
      } catch (err) {
        console.error('[YouTube] Player destroy 실패:', err);
      }
      playerRef.current = null;
      playerReady.current = false;
      hasCalledOnPlaying.current = false;
    } else if (!isVisible) {
      console.log(`[🎮 플레이어] 슬라이드 ${slideIndex} - 화면 밖 (Player 인스턴스 없음)`, videoId);
    }
  }, [isVisible, videoId, slideIndex]);

  // Player 생성 (isVisible이 true일 때만 생성, 메모리 최적화)
  useEffect(() => {
    // isVisible이 false이면 Player 생성 스킵
    if (!isVisible) {
      console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - 생성 스킵 (화면에 표시 안됨)`, videoId);
      return;
    }

    if (!apiReady || !videoId || playerRef.current) {
      if (playerRef.current) {
        console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - ♻️ 기존 인스턴스 유지 중 (재생성 스킵)`, {
          videoId,
          ready: playerReady.current,
          hasPlayed: hasCalledOnPlaying.current
        });
      }
      if (!apiReady) {
        console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - YouTube API 대기 중...`);
      }
      return;
    }

    const playerId = `yt-player-${slideIndex}`;
    
    // 메모리 측정 (생성 전)
    const memBefore = (performance as any).memory?.usedJSHeapSize ?? 0;
    const memBeforeMB = (memBefore / 1024 / 1024).toFixed(1);
    
    console.log(`[🎮 플레이어] 슬라이드 ${slideIndex} - 🔧 생성 시작`, {
      playerId,
      videoId,
      isVisible,
      apiReady
    });
    console.log(`[💾 메모리] PLAYER ${slideIndex} 생성 전 - 현재 메모리: ${memBeforeMB}MB`);
    
    const timer = setTimeout(() => {
      const element = document.getElementById(playerId);
      if (!element) {
        console.error('[YouTube] DOM 요소를 찾을 수 없음:', playerId);
        return;
      }

      try {
        // Android WebView 감지
        const isAndroidWebView = /android/i.test(navigator.userAgent) && /wv/i.test(navigator.userAgent);
        
        // Origin 설정 (동적)
        const originValue = isAndroidWebView 
          ? undefined  // APK WebView: origin 제거 (postMessage 오류 방지)
          : window.location.origin;  // 웹: 항상 동적 origin 사용
        
        playerRef.current = new window.YT.Player(playerId, {
          videoId,
          playerVars: {
            ...(originValue ? { origin: originValue } : {}), // origin이 있을 때만 추가
            autoplay: 0,  // 자동재생 비활성화 (부모가 명시적으로 playVideo 호출)
            mute: 1,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
            vq: 'medium',  // 화질 제한 (360p) - 메모리 절약 (40MB → 25-30MB)
            disablekb: 1,  // 키보드 컨트롤 비활성화
            fs: 0,  // 전체화면 버튼 비활성화
          },
          events: {
            onReady: (event: any) => {
              playerReady.current = true;  // 준비 상태 플래그 설정
              const playerState = event.target.getPlayerState?.() ?? -1;
              const duration = event.target.getDuration?.() ?? 0;
              const currentTime = event.target.getCurrentTime?.() ?? 0;
              const loadedFraction = event.target.getVideoLoadedFraction?.() ?? 0;
              const quality = event.target.getPlaybackQuality?.() ?? 'unknown';
              const availableQualities = event.target.getAvailableQualityLevels?.() ?? [];
              const volume = event.target.getVolume?.() ?? 0;
              
              // 메모리 측정 (준비 완료 시)
              const memReady = (performance as any).memory?.usedJSHeapSize ?? 0;
              const memReadyMB = (memReady / 1024 / 1024).toFixed(1);
              const totalMemMB = ((performance as any).memory?.totalJSHeapSize ?? 0) / 1024 / 1024;
              
              console.log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ✅ 준비 완료 (READY)`, {
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
              console.log(`[💾 메모리] PLAYER ${slideIndex} 준비 완료 - 현재: ${memReadyMB}MB / 총 할당: ${totalMemMB.toFixed(1)}MB`);
              // 현재 슬라이드만 자동 재생 (나머지는 pause 상태 유지)
              // 부모 컴포넌트에서 명시적으로 playVideo 호출할 예정
            },
            onStateChange: (event: any) => {
              // 상태 코드를 문자열로 변환
              const stateNames: Record<number, string> = {
                '-1': 'UNSTARTED',
                '0': 'ENDED',
                '1': 'PLAYING',
                '2': 'PAUSED',
                '3': 'BUFFERING',
                '5': 'CUED'
              };
              const stateName = stateNames[event.data] || `UNKNOWN(${event.data})`;
              
              console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - 상태 변경: ${stateName}`, {
                videoId,
                stateCode: event.data,
                isVisible,
                hasPlayed: hasCalledOnPlaying.current
              });

              // 재생 시작 감지 (YT.PlayerState.PLAYING = 1)
              if (event.data === 1) {
                if (!hasCalledOnPlaying.current) {
                  const loadedFraction = playerRef.current?.getVideoLoadedFraction?.() ?? 0;
                  const quality = playerRef.current?.getPlaybackQuality?.() ?? 'unknown';
                  const currentTime = playerRef.current?.getCurrentTime?.() ?? 0;
                  console.log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ▶️ 첫 재생 시작됨`, {
                    videoId,
                    현재시간: `${currentTime.toFixed(1)}s`,
                    버퍼링진행도: `${(loadedFraction * 100).toFixed(1)}%`,
                    재생품질: quality,
                    데이터로딩: '완료'
                  });
                  hasCalledOnPlaying.current = true;
                  onPlayingCallback(slideIndex);
                } else {
                  console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - ▶️ 재생 중...`);
                }
              }
              // 종료 감지 (YT.PlayerState.ENDED = 0) → 0초로 돌아가서 루프 재생 (현재 표시 중일 때만)
              else if (event.data === 0 && isVisible) {
                console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - 🔁 재생 종료 → 0초로 돌아가서 다시 재생`);
                if (playerRef.current?.seekTo && playerRef.current?.playVideo) {
                  playerRef.current.seekTo(0, true); // 0초로 이동
                  // ✅ 기존 타이머 정리 (메모리 누수 방지)
                  if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
                  loopTimerRef.current = setTimeout(() => {
                    playerRef.current?.playVideo(); // 다시 재생
                    loopTimerRef.current = null;
                  }, 100);
                }
                hasCalledOnPlaying.current = false; // 플래그 리셋
              }
              // 일시정지 감지 (YT.PlayerState.PAUSED = 2)
              else if (event.data === 2) {
                console.log(`[플레이어 상태] 슬라이드 ${slideIndex} - ⏸️ 일시정지됨`);
                // 다음 재생을 위해 플래그 리셋
                hasCalledOnPlaying.current = false;
              }
              // 버퍼링 감지 (YT.PlayerState.BUFFERING = 3)
              else if (event.data === 3) {
                const loadedFraction = playerRef.current?.getVideoLoadedFraction?.() ?? 0;
                const quality = playerRef.current?.getPlaybackQuality?.() ?? 'unknown';
                console.log(`[📊 플레이어 데이터] 슬라이드 ${slideIndex} - ⏳ 버퍼링 중...`, {
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
              const errorMsg = errorCodes[event.data] || `알 수 없는 오류 (코드: ${event.data})`;
              console.error(`[플레이어 상태] 슬라이드 ${slideIndex} - ❌ 오류 발생: ${errorMsg}`, {
                videoId,
                errorCode: event.data
              });
            },
          },
        });
        
        // 메모리 측정 (생성 후)
        const memAfter = (performance as any).memory?.usedJSHeapSize ?? 0;
        const memAfterMB = (memAfter / 1024 / 1024).toFixed(1);
        const memDiff = ((memAfter - memBefore) / 1024 / 1024).toFixed(1);
        
        console.log(`[🎮 플레이어] 슬라이드 ${slideIndex} - Player 객체 생성 완료 (초기화 대기 중...)`);
        console.log(`[💾 메모리] PLAYER ${slideIndex} 생성 후 - 현재: ${memAfterMB}MB (증가: +${memDiff}MB)`);
      } catch (err) {
        console.error('[YouTube] Player 생성 실패:', err);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // ✅ 루프 타이머 정리 (메모리 누수 방지)
      if (loopTimerRef.current) {
        clearTimeout(loopTimerRef.current);
        loopTimerRef.current = null;
      }
      // ✅ Player 메모리 해제 (Android TV 안정성 확보)
      if (playerRef.current?.destroy) {
        try {
          console.log(`[💾 메모리 관리] 슬라이드 ${slideIndex} - cleanup 함수 실행, 메모리 해제 시작`, videoId);
          
          // ✅ 1단계: 비디오 버퍼 플러시 (APK WebView 메모리 누적 방지)
          console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - cleanup 1단계: 비디오 버퍼 플러시`);
          if (playerRef.current.stopVideo) {
            playerRef.current.stopVideo();
          }
          if (playerRef.current.clearVideo) {
            playerRef.current.clearVideo();
          }
          
          // ✅ 2단계: Player 인스턴스 제거
          console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - cleanup 2단계: destroy() 호출`);
          playerRef.current.destroy();
          
          // ✅ 3단계: iframe DOM 요소 직접 제거 (WebView 리소스 해제 보장)
          const playerId = `yt-player-${slideIndex}`;
          const iframeElement = document.getElementById(playerId);
          if (iframeElement) {
            console.log(`[🎮 플레이어] 🚮 PLAYER ${slideIndex} - cleanup 3단계: iframe DOM 제거`);
            iframeElement.innerHTML = ''; // 내부 정리
            iframeElement.remove(); // DOM 제거
          }
          
          console.log(`[💾 메모리 관리] ✅ PLAYER ${slideIndex} cleanup 완료 - 완전 제거됨`);
        } catch (err) {
          console.error('[YouTube] Player destroy 실패:', err);
        }
        playerRef.current = null;
      }
      // hasCalledOnPlaying 리셋하여 재진입 시 다시 재생 가능
      hasCalledOnPlaying.current = false;
      playerReady.current = false;
    };
  }, [apiReady, videoId, onPlayingCallback, isVisible, slideIndex]);  // ✅ isVisible 추가 - 화면 표시 시 재생성

  return <div id={`yt-player-${slideIndex}`} className="w-full h-full" />;
}), (prevProps, nextProps) => {
  // ✅ videoId, apiReady, isVisible 비교 - isVisible 변경 시 재렌더링하여 메모리 최적화
  // slideIndex는 표시 목적이므로 캐싱과 무관
  const shouldSkipRender = prevProps.videoId === nextProps.videoId && 
                           prevProps.apiReady === nextProps.apiReady &&
                           prevProps.isVisible === nextProps.isVisible;
  
  if (shouldSkipRender && prevProps.slideIndex !== nextProps.slideIndex) {
    console.log(`[YouTube 캐시] videoId ${prevProps.videoId} 재사용 (슬라이드 ${prevProps.slideIndex} → ${nextProps.slideIndex})`);
  }
  
  return shouldSkipRender;
});

// displayName 설정 (forwardRef 사용 시 필요)
YouTubePlayer.displayName = 'YouTubePlayer';

// 배열 셔플 함수
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export default function BillboardPage() {
  const { userId } = useParams<{ userId: string }>();
  const [billboardUser, setBillboardUser] = useState<BillboardUser | null>(null);
  const [settings, setSettings] = useState<BillboardUserSettings | null>(null);
  const settingsRef = useRef<BillboardUserSettings | null>(null); // Ref 동기화 (stale closure 방지)
  const [events, setEvents] = useState<Event[]>([]);
  const eventsRef = useRef<Event[]>([]); // Ref 동기화 (stale closure 방지)
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentEventIdRef = useRef<number | null>(null); // 현재 이벤트 ID 추적 (Event.id는 number 타입)
  const [nextSlideIndex, setNextSlideIndex] = useState<number | null>(null); // 다음 슬라이드 인덱스 (미리 로드용)
  const preloadTimerRef = useRef<NodeJS.Timeout | null>(null); // 다음 슬라이드 미리 로드 타이머
  const precomputedShuffleRef = useRef<number[] | null>(null); // Random 모드 wrap용 미리 계산된 shuffle
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<number[]>([]);
  const shuffledPlaylistRef = useRef<number[]>([]); // Ref 동기화 (stale closure 방지)
  const playlistIndexRef = useRef(0);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("연결중...");
  const [pendingReload, setPendingReload] = useState(false);
  const pendingReloadRef = useRef(false); // Ref 동기화 (stale closure 방지)
  const pendingReloadTimeRef = useRef<number>(0);
  const pendingChangesRef = useRef<any[]>([]); // 지연 업데이트용 대기열 (ref로 stale closure 방지)
  const scale = 1; // 고정 스케일 (원래 크기 유지)
  const [videoLoadedMap, setVideoLoadedMap] = useState<Record<number, boolean>>({}); // 비디오 로딩 상태
  const [needsRotation, setNeedsRotation] = useState(false); // 화면 회전 필요 여부
  const [bottomInfoHeight, setBottomInfoHeight] = useState(0); // 하단 정보 영역 높이 (화면의 10%)
  const [qrSize, setQrSize] = useState(144); // QR 코드 크기
  const [titleFontSize, setTitleFontSize] = useState(56); // 제목 폰트 크기
  const [dateLocationHeight, setDateLocationHeight] = useState(0); // 날짜+장소 영역 높이 (화면의 8%)
  const [dateLocationFontSize, setDateLocationFontSize] = useState(31); // 날짜+장소 폰트 크기
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null); // 슬라이드 전환 타이머
  const slideStartTimeRef = useRef<number>(0); // 슬라이드 시작 시간
  const playerRefsRef = useRef<(YouTubePlayerHandle | null)[]>([]); // 슬라이드별 Player 참조
  const prevIndexRef = useRef<number>(0); // 이전 슬라이드 인덱스
  const currentActiveIndexRef = useRef<number>(0); // 현재 활성 슬라이드 인덱스 (attemptPlay 취소용)
  const [youtubeApiReady, setYoutubeApiReady] = useState(false); // YouTube API 준비 상태
  const loadBillboardDataRef = useRef<(() => Promise<void>) | null>(null); // loadBillboardData 함수 ref
  const lastSlideChangeTimeRef = useRef<number>(Date.now()); // 워치독: 마지막 슬라이드 전환 시간
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null); // 워치독 타이머
  // ✅ setTimeout 타이머들 (메모리 누수 방지)
  const transitionTimersRef = useRef<NodeJS.Timeout[]>([]); // 슬라이드 전환 시 사용되는 모든 setTimeout
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null); // 실시간 업데이트용 setTimeout
  const playRetryTimerRef = useRef<NodeJS.Timeout | null>(null); // Player 재생 재시도용 setTimeout

  // 화면 비율 감지 및 하단 정보 영역 크기 계산
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const calculateSizes = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setNeedsRotation(isLandscape);
      
      // 화면 높이의 10% 계산 (회전 여부에 따라) - 제목+QR 영역
      const effectiveHeight = isLandscape ? window.innerWidth : window.innerHeight;
      const maxHeight = effectiveHeight * 0.1;
      setBottomInfoHeight(maxHeight);
      
      // QR 코드 크기: 최대 높이의 80% 정도, 최소 60px, 최대 150px
      const calculatedQrSize = Math.min(150, Math.max(60, maxHeight * 0.8));
      setQrSize(calculatedQrSize);
      
      // 제목 폰트 크기: QR 크기에 비례, 최소 20px, 최대 60px
      const calculatedFontSize = Math.min(60, Math.max(20, calculatedQrSize * 0.4));
      setTitleFontSize(calculatedFontSize);
      
      // 날짜+장소 영역: 화면 높이의 8%
      const dateLocationMax = effectiveHeight * 0.08;
      setDateLocationHeight(dateLocationMax);
      
      // 날짜+장소 폰트 크기: 영역의 30% 정도, 최소 18px, 최대 36px
      const dateLocationFont = Math.min(36, Math.max(18, dateLocationMax * 0.3));
      setDateLocationFontSize(dateLocationFont);
      
      console.log(`[빌보드] 크기 계산: ${isLandscape ? '가로' : '세로'}, 제목영역: ${Math.round(maxHeight)}px (QR:${Math.round(calculatedQrSize)}px, 폰트:${Math.round(calculatedFontSize)}px), 날짜영역: ${Math.round(dateLocationMax)}px (폰트:${Math.round(dateLocationFont)}px)`);
    };

    const handleResize = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(calculateSizes, 100);
    };

    calculateSizes();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      clearTimeout(debounceTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // YouTube API 로드 (부모에서 한 번만)
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      console.log('[YouTube API] 이미 로드됨');
      setYoutubeApiReady(true);
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      console.log('[YouTube API] 준비 완료');
      setYoutubeApiReady(true);
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      console.log('[YouTube API] 스크립트 로드 시작');
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode?.insertBefore(tag, firstScript);
    }
  }, []);

  // 🛡️ 워치독(Watchdog): 3분간 슬라이드 전환 없으면 자동 새로고침
  useEffect(() => {
    const WATCHDOG_INTERVAL = 30000; // 30초마다 체크
    const STALL_THRESHOLD = 180000; // 3분(180초) 동안 변화 없으면 새로고침
    
    console.log('[워치독] 안전장치 시작 - 3분간 슬라이드 전환 없으면 자동 새로고침');
    
    watchdogTimerRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastChange = now - lastSlideChangeTimeRef.current;
      const minutesStalled = Math.floor(timeSinceLastChange / 60000);
      const secondsStalled = Math.floor((timeSinceLastChange % 60000) / 1000);
      
      if (timeSinceLastChange >= STALL_THRESHOLD) {
        // 오류 로그 저장 (localStorage)
        const errorLog = {
          timestamp: new Date().toISOString(),
          timeSinceLastChange: timeSinceLastChange,
          currentIndex: currentIndex,
          currentEventId: currentEventIdRef.current,
          eventsCount: eventsRef.current.length,
          currentEvent: eventsRef.current[currentIndex] ? {
            id: eventsRef.current[currentIndex].id,
            title: eventsRef.current[currentIndex].title,
            hasVideo: !!eventsRef.current[currentIndex].video_url,
          } : null,
          billboardUserId: userId,
          userAgent: navigator.userAgent,
        };
        
        try {
          // 최근 10개 로그만 저장 (메모리 절약)
          const existingLogs = JSON.parse(localStorage.getItem('billboard_error_logs') || '[]');
          const newLogs = [errorLog, ...existingLogs.slice(0, 9)];
          localStorage.setItem('billboard_error_logs', JSON.stringify(newLogs));
          console.error('[워치독] 오류 로그 저장:', errorLog);
        } catch (err) {
          console.error('[워치독] 로그 저장 실패:', err);
        }
        
        console.error(`[워치독] 🚨 ${minutesStalled}분 ${secondsStalled}초간 슬라이드 전환 없음! 자동 새로고침 실행`);
        window.location.reload();
      } else if (timeSinceLastChange >= 120000) {
        // 2분 경과 시 경고 로그
        console.warn(`[워치독] ⚠️ ${minutesStalled}분 ${secondsStalled}초간 슬라이드 전환 없음 (1분 후 자동 새로고침)`);
      }
    }, WATCHDOG_INTERVAL);
    
    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [userId]); // 워치독은 한 번만 시작, Ref로 최신 값 추적

  // 슬라이드 타이머 시작 함수
  const startSlideTimer = useCallback((slideInterval: number) => {
    // ✅ 기존 모든 타이머 정리 (메모리 누수 방지)
    if (slideTimerRef.current) {
      clearInterval(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    // transition 타이머들 정리
    transitionTimersRef.current.forEach(timer => clearTimeout(timer));
    transitionTimersRef.current = [];
    // reload 타이머 정리
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
    }
    // ✅ preload 타이머는 여기서 정리하지 않음 (슬라이드 전환 시에만 정리)
    
    const startTime = Date.now();
    slideStartTimeRef.current = startTime;
    
    // 🛡️ 워치독: 타이머 시작 = 정상 작동 신호
    lastSlideChangeTimeRef.current = startTime;
    
    // Ref로 정확한 슬라이드 번호 계산 (stale closure 방지)
    const logIndex = currentEventIdRef.current 
      ? eventsRef.current.findIndex(e => e.id === currentEventIdRef.current)
      : 0;
    const displayIndex = logIndex >= 0 ? logIndex : 0;
    
    console.log(`[⏱️ 타이머] 슬라이드 ${displayIndex} - 간격: ${slideInterval}ms, 시작시간: ${new Date().toLocaleTimeString()}`);
    
    // ✅ 다음 슬라이드 미리 로드 (재생 시작 5초 후, 슬라이드가 5초보다 짧으면 중간)
    const preloadDelay = Math.min(5000, slideInterval / 2);
    
    // preload 타이머가 없을 때만 설정 (중복 방지)
    if (!preloadTimerRef.current && preloadDelay > 0 && preloadDelay < slideInterval) {
      console.log(`[⏱️ 타이머] Preload 타이머 설정: ${preloadDelay}ms 후 다음 슬라이드 준비 (재생 시작 후 ${preloadDelay/1000}초, 메모리 절약)`);
      preloadTimerRef.current = setTimeout(() => {
        const latestEvents = eventsRef.current;
        const latestSettings = settingsRef.current;
        const latestShuffledPlaylist = shuffledPlaylistRef.current;
        
        // ✅ events가 없으면 preload 스킵
        if (latestEvents.length === 0) {
          console.warn(`[미리 로드] events 없음 → 미리 로드 스킵`);
          preloadTimerRef.current = null;
          return;
        }
        
        // 다음 슬라이드 인덱스 계산
        let calculatedNextIndex: number | null = null;
        if (latestSettings?.play_order === "random") {
          const next = playlistIndexRef.current + 1;
          if (next >= latestShuffledPlaylist.length) {
            // ✅ 플레이리스트 끝: 새 shuffle 미리 계산 (부드러운 전환 보장)
            const newShuffledList = shuffleArray(
              Array.from({ length: latestEvents.length }, (_, i) => i)
            );
            precomputedShuffleRef.current = newShuffledList;
            calculatedNextIndex = newShuffledList[0];
            console.log(`[미리 로드] 플레이리스트 끝 → 새 shuffle 미리 계산, 다음: ${calculatedNextIndex}`);
          } else {
            calculatedNextIndex = latestShuffledPlaylist[next];
          }
        } else {
          const currentEventId = currentEventIdRef.current;
          const currentIdx = currentEventId ? latestEvents.findIndex(e => e.id === currentEventId) : 0;
          calculatedNextIndex = (currentIdx + 1) % latestEvents.length;
        }
        
        if (calculatedNextIndex !== null && calculatedNextIndex < latestEvents.length) {
          const nextEvent = latestEvents[calculatedNextIndex];
          const hasVideo = !!nextEvent?.video_url;
          const videoId = hasVideo ? nextEvent.video_url?.split('v=')[1]?.split('&')[0] : null;
          
          console.log(`[🔜 미리 로드] 슬라이드 ${displayIndex} → 다음 슬라이드 ${calculatedNextIndex} 미리 준비 (${preloadDelay}ms 후)`);
          console.log(`[🔜 미리 로드] ⭐ setNextSlideIndex(${calculatedNextIndex}) 호출`, {
            타입: hasVideo ? '영상' : '이미지',
            videoId: videoId || 'N/A',
            제목: nextEvent?.title || 'N/A',
            플레이어생성: hasVideo ? '예정' : '없음 (이미지는 플레이어 불필요)'
          });
          setNextSlideIndex(calculatedNextIndex);
        } else {
          console.warn(`[🔜 미리 로드] ⚠️ 잘못된 인덱스: ${calculatedNextIndex}, events: ${latestEvents.length}`);
        }
        preloadTimerRef.current = null;
      }, preloadDelay);
    }

    // 슬라이드 전환 타이머
    slideTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Ref 사용 (stale closure 방지)
      const latestEvents = eventsRef.current;
      const latestShuffledPlaylist = shuffledPlaylistRef.current;
      const latestSettings = settingsRef.current;
      const latestPendingReload = pendingReloadRef.current;
      console.log(`[타이머 종료] - 설정: ${slideInterval}ms, 실제경과: ${elapsed}ms, 종료시간: ${new Date().toLocaleTimeString()}`);
      
      // 🛡️ 워치독: 타이머 종료 = 정상 작동 신호 (이벤트 1개일 때도 업데이트)
      lastSlideChangeTimeRef.current = Date.now();
      
      if (latestPendingReload) {
        // ✅ 페이지 reload 타이머 저장 (메모리 누수 방지)
        const timer = setTimeout(() => window.location.reload(), 500);
        transitionTimersRef.current.push(timer);
        return;
      }
      
      // ✅ 슬라이드 전환 타이머 저장 (메모리 누수 방지)
      const transitionTimer = setTimeout(() => {
        // ✅ Preload 타이머 정리 및 nextSlideIndex 리셋 (전환 완료)
        if (preloadTimerRef.current) {
          clearTimeout(preloadTimerRef.current);
          preloadTimerRef.current = null;
          console.log(`[🔄 슬라이드 전환] preload 타이머 정리 (전환 완료)`);
        }
        setNextSlideIndex(null);
        console.log(`[🔄 슬라이드 전환] nextSlideIndex 리셋 → null`);
        
        // 현재 이벤트 ID로 인덱스 찾기 (ref 사용)
        const currentEventId = currentEventIdRef.current;
        const previousIndex = currentEventId ? latestEvents.findIndex(e => e.id === currentEventId) : 0;
        
        console.log(`[💾 메모리 관리] 슬라이드 전환 시작 - 이전: ${previousIndex}, 메모리 해제 예정`);
        
        // 🎯 변경사항 감지 시 데이터만 새로고침 (React.memo가 Player 캐시 보존)
        if (pendingChangesRef.current.length > 0) {
          const changeCount = pendingChangesRef.current.length;
          console.log(`[변경사항 감지] ${changeCount}건 → 데이터만 새로고침`);
          
          // 대기열 초기화
          pendingChangesRef.current = [];
          setRealtimeStatus(`변경 ${changeCount}건 감지, 데이터 새로고침 중...`);
          
          // 데이터만 새로고침 (페이지 reload 안함 → React.memo가 Player 보존)
          loadBillboardDataRef.current?.();
          
          // ✅ 상태 업데이트 타이머 저장 (메모리 누수 방지)
          const statusTimer = setTimeout(() => setRealtimeStatus("연결됨"), 2000);
          transitionTimersRef.current.push(statusTimer);
        }
        
        // 정상 슬라이드 전환 (플레이리스트 재구성 없을 때만)
        if (latestSettings?.play_order === "random") {
          const next = playlistIndexRef.current + 1;
          if (next >= latestShuffledPlaylist.length) {
            // ✅ 미리 계산된 shuffle이 있으면 재사용 (부드러운 전환)
            let newList = precomputedShuffleRef.current;
            if (!newList) {
              console.warn(`[슬라이드 전환] ⚠️ precomputed shuffle 없음, 새로 생성 (전환이 부드럽지 않을 수 있음)`);
              newList = shuffleArray(
                Array.from({ length: latestEvents.length }, (_, i) => i),
              );
            }
            precomputedShuffleRef.current = null; // 사용 후 리셋
            setShuffledPlaylist(newList);
            shuffledPlaylistRef.current = newList; // Ref 동기화
            playlistIndexRef.current = 0;
            const nextIndex = newList[0] ?? 0;
            setCurrentIndex(nextIndex);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
            console.log(`[슬라이드 전환] Random 모드 wrap → 새 playlist 시작: ${nextIndex}`);
          } else {
            playlistIndexRef.current = next;
            const nextIndex = latestShuffledPlaylist[next] ?? 0;
            console.log(`[💾 메모리 관리] 슬라이드 ${nextIndex}로 전환 → 슬라이드 ${previousIndex} 메모리 해제됨 (React 자동)`);
            setCurrentIndex(nextIndex);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
          }
        } else {
          setCurrentIndex((prev) => {
            const nextIndex = (prev + 1) % latestEvents.length;
            console.log(`[💾 메모리 관리] 슬라이드 ${nextIndex}로 전환 → 슬라이드 ${previousIndex} 메모리 해제됨 (React 자동)`);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
            return nextIndex;
          });
        }
        
        // 슬라이드 전환 후 이전 슬라이드의 비디오 로딩 상태 초기화
        // ✅ 비디오 로딩 상태 초기화 타이머 저장 (메모리 누수 방지)
        const videoLoadedTimer = setTimeout(() => {
          setVideoLoadedMap(prev => {
            const newMap = { ...prev };
            delete newMap[previousIndex];
            return newMap;
          });
        }, 100);
        transitionTimersRef.current.push(videoLoadedTimer);
      }, 500);
      transitionTimersRef.current.push(transitionTimer);
    }, slideInterval);
  }, []); // 모든 state ref로 변경, dependency array 비움 (stale closure 완전 제거)


  // State-Ref 동기화 (stale closure 방지)
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    shuffledPlaylistRef.current = shuffledPlaylist;
  }, [shuffledPlaylist]);

  useEffect(() => {
    if (events[currentIndex]) {
      currentEventIdRef.current = events[currentIndex].id;
      // 🛡️ 워치독: 슬라이드 인덱스 변경 시간 업데이트 (이벤트가 여러개일 때)
      // 이벤트가 1개일 때는 startSlideTimer에서 업데이트
      lastSlideChangeTimeRef.current = Date.now();
    }
  }, [currentIndex, events]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    pendingReloadRef.current = pendingReload;
  }, [pendingReload]);

  // currentIndex 변경 시 슬라이드 전환 (pause 이전, play 현재)
  useEffect(() => {
    const prevIndex = prevIndexRef.current;
    const currentEvent = events[currentIndex];
    const hasVideo = !!currentEvent?.video_url;
    
    // ✅ 슬라이드 전환 시 다음 슬라이드 인덱스 리셋 (이전 미리 로드 취소)
    console.log(`[🔄 슬라이드 전환] currentIndex: ${prevIndex} → ${currentIndex}, nextSlideIndex 리셋: ${nextSlideIndex} → null`);
    setNextSlideIndex(null);
    
    // 현재 활성 슬라이드 업데이트
    currentActiveIndexRef.current = currentIndex;
    
    // 이전 슬라이드 pause
    if (prevIndex !== currentIndex && playerRefsRef.current[prevIndex]) {
      console.log(`[슬라이드 전환] ${prevIndex} → ${currentIndex}, 이전 슬라이드 일시정지`);
      playerRefsRef.current[prevIndex]?.pauseVideo();
    }
    
    // 현재 슬라이드가 영상이면 재생 시작
    if (hasVideo) {
      const targetIndex = currentIndex;  // 현재 타겟 캡처 (클로저 보존)
      console.log(`[슬라이드 전환] 현재 슬라이드 ${targetIndex} 재생 준비`);
      // Player가 준비될 때까지 대기 후 재생
      let attemptCount = 0;
      const maxAttempts = 50;  // 최대 5초 대기 (50 * 100ms)
      const attemptPlay = () => {
        // 슬라이드가 변경되었으면 재시도 중단
        if (currentActiveIndexRef.current !== targetIndex) {
          console.log(`[슬라이드 전환] 슬라이드 ${targetIndex} 재시도 중단 (현재: ${currentActiveIndexRef.current})`);
          return;
        }
        
        const player = playerRefsRef.current[targetIndex];
        // Player가 준비되었는지 확인
        if (player && player.isReady && player.isReady()) {
          console.log(`[슬라이드 전환] 현재 슬라이드 ${targetIndex} 재생 시작`);
          player.playVideo();
          
          // ❌ 타이머 시작 제거: 실제 재생 감지 시점(handleVideoPlaying)에서 시작
          // YouTube iframe 로드 시간으로 인해 playVideo() 호출 시점과
          // 실제 재생 시작 시점이 8-10초 차이 날 수 있음
          console.log(`[디버그] playVideo() 호출 완료, 실제 재생 시 타이머 시작 예정`);
        } else if (attemptCount < maxAttempts) {
          // Player가 아직 준비 안되면 100ms 후 재시도
          attemptCount++;
          // ✅ 이전 재시도 타이머 정리 (메모리 누수 방지)
          if (playRetryTimerRef.current) clearTimeout(playRetryTimerRef.current);
          playRetryTimerRef.current = setTimeout(attemptPlay, 100);
        } else {
          console.error(`[슬라이드 전환] Player ${targetIndex} 준비 시간 초과 (5초) - fallback으로 이미지 타이머 시작`);
          // ✅ Fallback: Player 준비 실패 시에도 타이머 시작하여 다음 슬라이드로 전환
          const currentSettings = settingsRef.current;
          if (currentSettings) {
            const fallbackInterval = currentSettings.auto_slide_interval || 5000;
            console.log(`[Fallback 타이머] 영상 로드 실패, 이미지 타이머로 전환: ${fallbackInterval}ms`);
            startSlideTimer(fallbackInterval);
          }
        }
      };
      attemptPlay();
    }
    
    prevIndexRef.current = currentIndex;
  }, [currentIndex, events, settings, startSlideTimer, youtubeApiReady]);

  // YouTube 재생 콜백 (useCallback으로 안정화)
  const handleVideoPlaying = useCallback((slideIndex: number) => {
    console.log('[빌보드] 영상 재생 감지 (onStateChange), 슬라이드:', slideIndex);
    const currentActiveIndex = currentActiveIndexRef.current;
    
    // 현재 활성 슬라이드의 영상만 처리
    if (slideIndex === currentActiveIndex) {
      setVideoLoadedMap(prev => ({ ...prev, [slideIndex]: true }));
      
      // ✅ 실제 재생 시작 시점에 타이머 시작 (정확한 재생 시간 보장)
      const currentSettings = settingsRef.current;
      if (currentSettings) {
        const slideInterval = currentSettings.video_play_duration || 10000;
        console.log(`[타이머 시작] 실제 재생 감지, 타이머: ${slideInterval}ms`);
        startSlideTimer(slideInterval);
      }
    }
  }, [startSlideTimer]);


  // 문서 제목 설정
  useEffect(() => {
    if (billboardUser?.name) {
      document.title = `댄싱조이 - ${billboardUser.name} 빌보드`;
    }
    return () => {
      document.title = "광고판 - Event Discovery Platform";
    };
  }, [billboardUser]);

  // 데이터 로드 및 Realtime 구독
  useEffect(() => {
    if (!userId) {
      setError("빌보드 사용자 ID가 없습니다.");
      setIsLoading(false);
      return;
    }
    loadBillboardData();

    const eventsChannel = supabase
      .channel("billboard-events-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        (payload) => {
          console.log("[변경사항 감지] 이벤트 변경:", payload.eventType, payload);
          
          // 이벤트가 0개일 때는 즉시 데이터만 새로고침 (타이머가 안 돌아가므로)
          if (eventsRef.current.length === 0) {
            console.log("[변경사항 감지] 빈 화면 → 즉시 데이터 새로고침");
            setRealtimeStatus("새 이벤트 감지! 즉시 새로고침...");
            // ✅ 이전 reload 타이머 정리 (메모리 누수 방지)
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = setTimeout(() => {
              loadBillboardDataRef.current?.();
              reloadTimerRef.current = null;
            }, 500);
            return;
          }
          
          // 대기열에 추가 (지연 업데이트, ref 사용)
          pendingChangesRef.current = [...pendingChangesRef.current, payload];
          
          // UI 피드백
          const count = pendingChangesRef.current.length;
          setRealtimeStatus(`새 변경 ${count}건 대기중 (슬라이드 완료 후 적용)`);
        },
      )
      .subscribe((status) => setRealtimeStatus(`데이터: ${status}`));

    const settingsChannel = supabase
      .channel("billboard-settings-changes")
      .on(
        "postgres_changes",
        { 
          event: "UPDATE", 
          schema: "public", 
          table: "billboard_user_settings",
          filter: `billboard_user_id=eq.${userId}`  // 서버 레벨 필터 (네트워크 90% 감소)
        },
        (_payload) => {
          // 이미 필터링된 상태로 수신 (if 체크 불필요)
          setRealtimeStatus("설정 변경 감지!");
          loadBillboardData();
          // ✅ 이전 reload 타이머 정리 (메모리 누수 방지)
          if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = setTimeout(() => {
            setRealtimeStatus("연결됨");
            reloadTimerRef.current = null;
          }, 3000);
        },
      )
      .subscribe((status) => setRealtimeStatus(`설정: ${status}`));

    const deployChannel = supabase
      .channel("deploy-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deployments" },
        (payload) => {
          console.log("새 배포 감지!", payload);
          setPendingReload(true);
          pendingReloadTimeRef.current = Date.now();
          setRealtimeStatus("새 배포! 슬라이드 완료 후 새로고침...");
        },
      )
      .subscribe((status) => setRealtimeStatus(`배포: ${status}`));

    return () => {
      // ✅ 모든 타이머 정리 (메모리 누수 방지)
      console.log("[cleanup] 컴포넌트 언마운트: 모든 타이머 정리");
      // transition 타이머들 정리
      transitionTimersRef.current.forEach(timer => clearTimeout(timer));
      transitionTimersRef.current = [];
      // reload 타이머 정리
      if (reloadTimerRef.current) {
        clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = null;
      }
      // play retry 타이머 정리
      if (playRetryTimerRef.current) {
        clearTimeout(playRetryTimerRef.current);
        playRetryTimerRef.current = null;
      }
      // ✅ preload 타이머 정리
      if (preloadTimerRef.current) {
        clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
      // 채널 정리
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(deployChannel);
    };
  }, [userId]);

  const filterEvents = useCallback((
    allEvents: Event[],
    settings: BillboardUserSettings,
  ): Event[] => {
    // 한국 시간 기준 오늘 날짜 (KST = UTC+9)
    const today = new Date();
    const koreaOffset = 9 * 60;
    const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
    koreaTime.setHours(0, 0, 0, 0);
    
    return allEvents.filter((event) => {
      if (!event?.image_full && !event?.image && !event?.video_url) return false;
      if (settings.excluded_event_ids.includes(event.id)) return false;
      const eventDate = new Date(event.start_date || event.date || "");
      const weekday = eventDate.getDay();
      if (settings.excluded_weekdays.includes(weekday)) return false;
      
      // 시작날짜 기준으로 필터링 (지난 이벤트 제외)
      const eventStartDate = new Date(event.start_date || event.date || "");
      eventStartDate.setHours(0, 0, 0, 0);
      
      // 관리자 설정 날짜 범위 필터
      if (settings.date_filter_start) {
        const filterStart = new Date(settings.date_filter_start);
        filterStart.setHours(0, 0, 0, 0);
        if (eventStartDate < filterStart) return false;
      }
      if (settings.date_filter_end) {
        const filterEnd = new Date(settings.date_filter_end);
        filterEnd.setHours(0, 0, 0, 0);
        if (eventStartDate > filterEnd) return false;
      }
      
      // 기본 필터: 시작일이 오늘 이전이면 제외 (시작일 >= 오늘만 노출)
      if (!settings.date_filter_start && !settings.date_filter_end) {
        if (eventStartDate < koreaTime) return false;
      }
      return true;
    });
  }, []);

  const loadBillboardData = useCallback(async () => {
    try {
      console.log("[빌보드] 데이터 리로드: 기존 타이머 정리 중...");

      const { data: user, error: userError } = await supabase
        .from("billboard_users")
        .select("*")
        .eq("id", userId)
        .eq("is_active", true)
        .single();
      if (userError) throw new Error("빌보드 사용자를 찾을 수 없습니다.");
      setBillboardUser(user);

      const { data: userSettings, error: settingsError } = await supabase
        .from("billboard_user_settings")
        .select("*")
        .eq("billboard_user_id", userId)
        .single();
      if (settingsError) throw new Error("빌보드 설정을 불러올 수 없습니다.");
      console.log("[빌보드] 설정 로드:", {
        auto_slide_interval: userSettings.auto_slide_interval,
        video_play_duration: userSettings.video_play_duration,
        auto_slide_interval_video: userSettings.auto_slide_interval_video,
        date_filter_start: userSettings.date_filter_start,
        date_filter_end: userSettings.date_filter_end,
        excluded_weekdays: userSettings.excluded_weekdays,
        excluded_event_ids: userSettings.excluded_event_ids?.length || 0,
      });
      setSettings(userSettings);

      const { data: allEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true });
      if (eventsError) throw eventsError;

      const filteredEvents = filterEvents(allEvents || [], userSettings);
      console.log("[빌보드] 필터링 완료:", {
        전체이벤트: allEvents?.length || 0,
        필터링후: filteredEvents.length,
        날짜필터시작: userSettings.date_filter_start || 'null',
        날짜필터종료: userSettings.date_filter_end || 'null',
      });

      if (filteredEvents.length === 0) {
        setEvents([]);
        setCurrentIndex(0);
        setShuffledPlaylist([]);
      } else {
        setEvents(filteredEvents);
        const safeIndex = currentIndex >= filteredEvents.length ? 0 : currentIndex;
        if (userSettings.play_order === "random") {
          const indices = Array.from({ length: filteredEvents.length }, (_, i) => i);
          const shuffled = shuffleArray(indices);
          setShuffledPlaylist(shuffled);
          playlistIndexRef.current = 0;
          setCurrentIndex(shuffled[0] || 0);
        } else {
          setCurrentIndex(safeIndex);
        }
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("빌보드 데이터 로드 실패:", err);
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
      setIsLoading(false);
    }
  }, [userId, filterEvents, currentIndex]);
  
  // loadBillboardData 함수를 ref에 동기화
  useEffect(() => {
    loadBillboardDataRef.current = loadBillboardData;
  }, [loadBillboardData]);

  // 슬라이드 전환 시 이미지 타이머 설정 (영상은 playVideo()에서 타이머 시작)
  // 현재 슬라이드의 영상 로드 상태만 추적 (전체 videoLoadedMap이 아님 → 불필요한 재실행 방지)
  const currentVideoLoaded = !!videoLoadedMap[currentIndex];
  
  useEffect(() => {
    if (!settings || events.length === 0) return;
    
    // 현재 이벤트 가져오기
    const currentEvent = events[currentIndex];
    const hasVideo = !!currentEvent?.video_url;
    
    // 이미지 슬라이드만 여기서 타이머 시작
    if (!hasVideo) {
      const slideInterval = settings.auto_slide_interval;
      console.log(`[슬라이드 ${currentIndex}] 이미지 감지 - 즉시 타이머 시작: ${slideInterval}ms`);
      startSlideTimer(slideInterval);
    } else {
      // 영상 슬라이드: 이미 재생 중이면 타이머 재시작 (데이터 새로고침 후 타이머 손실 방지)
      if (currentVideoLoaded) {
        const slideInterval = settings.video_play_duration || 10000;
        console.log(`[슬라이드 ${currentIndex}] 영상 이미 재생 중 - 타이머 재시작: ${slideInterval}ms`);
        startSlideTimer(slideInterval);
      } else {
        console.log(`[슬라이드 ${currentIndex}] 영상 감지 - 실제 재생 감지 시 타이머 시작 예정`);
      }
    }

    return () => {
      console.log(`[타이머 cleanup] 슬라이드 ${currentIndex} 타이머 정리`);
      if (slideTimerRef.current) {
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = null;
      }
    };
  }, [events, settings, currentIndex, startSlideTimer, currentVideoLoaded]);

  // 로딩/에러/빈 화면
  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          {/* 부드러운 스피너 애니메이션 */}
          <div className="relative w-20 h-20">
            <div className="absolute inset-0 border-4 border-gray-700 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-t-white border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
          </div>
          <div className="text-white text-xl font-light animate-pulse">이벤트 불러오는 중</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-red-500 text-2xl text-center p-8">{error}</div>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-2xl text-center">
          <div className="mb-4">{billboardUser?.name}</div>
          <div className="text-gray-400 text-lg">표시할 이벤트가 없습니다.</div>
        </div>
      </div>
    );
  }

  // 날짜 포맷
  const formatDateRange = (startDate: string, endDate?: string | null) => {
    if (!endDate || startDate === endDate) return startDate;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = String(start.getMonth() + 1).padStart(2, "0");
    const endMonth = String(end.getMonth() + 1).padStart(2, "0");
    const startDay = String(start.getDate()).padStart(2, "0");
    const endDay = String(end.getDate()).padStart(2, "0");
    if (startYear === endYear) {
      if (startMonth === endMonth) {
        return `${startYear}-${startMonth}-${startDay}~${endDay}`;
      }
      return `${startYear}-${startMonth}-${startDay}~${endMonth}-${endDay}`;
    }
    return `${startYear}-${startMonth}-${startDay}~${endYear}-${endMonth}-${endDay}`;
  };

  // 슬라이드 렌더링
  const renderSlide = (event: any, isVisible: boolean, slideIndex: number) => {
    // full 우선 사용 (새 이미지: 1280px, 기존 이미지: 2160px)
    const imageUrl = event?.image_full || event?.image;
    const videoUrl = event?.video_url;
    const videoInfo = videoUrl ? parseVideoUrl(videoUrl) : null;
    const videoLoaded = videoLoadedMap[slideIndex] || false;
    
    // 썸네일: 사용자 업로드 이미지 우선, 없으면 YouTube 기본 썸네일
    const thumbnailUrl = imageUrl || videoInfo?.thumbnailUrl;
    
    // 🖼️ 이미지 메모리 관리 로그
    useEffect(() => {
      if (videoInfo?.videoId) {
        // 영상 슬라이드
        if (thumbnailUrl && !videoLoaded) {
          console.log(`[🖼️ 이미지] 슬라이드 ${slideIndex} - 썸네일 로드 (메모리 할당)`, {
            videoId: videoInfo.videoId,
            thumbnailUrl: thumbnailUrl.substring(0, 50) + '...'
          });
        } else if (videoLoaded) {
          console.log(`[🖼️ 이미지] 슬라이드 ${slideIndex} - ✅ 썸네일 DOM 제거 (메모리 해제)`, {
            videoId: videoInfo.videoId,
            설명: '비디오 로드 완료, 썸네일 디코딩 버퍼 해제'
          });
        }
      } else if (imageUrl) {
        // 이미지 슬라이드
        console.log(`[🖼️ 이미지] 슬라이드 ${slideIndex} - 이미지 로드 (메모리 할당)`, {
          imageUrl: imageUrl.substring(0, 50) + '...',
          타입: '일반 이미지'
        });
      }
      
      // cleanup: 슬라이드 언마운트 시
      return () => {
        if (videoInfo?.videoId || imageUrl) {
          console.log(`[🖼️ 이미지] 슬라이드 ${slideIndex} - 언마운트 (메모리 해제 예정)`, {
            타입: videoInfo?.videoId ? '영상' : '이미지',
            설명: 'React cleanup, WebView GC 대기'
          });
        }
      };
    }, [slideIndex, videoLoaded, thumbnailUrl, imageUrl, videoInfo?.videoId]);

    return (
      <div
        className="portrait-container"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          width: needsRotation ? "100vh" : "100vw",
          height: needsRotation ? "100vw" : "100vh",
          transform: needsRotation 
            ? `translate(-50%, -50%) rotate(90deg)`
            : `translate(-50%, -50%)`,
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? "auto" : "none",
          transition: `opacity ${settings?.transition_duration ?? 500}ms ease-in-out`,
          zIndex: isVisible ? 2 : 1,
        }}
      >
        {/* === 유튜브 영상 + 썸네일 === */}
        {videoInfo?.videoId ? (
          <>
            {/* 썸네일 (로딩 중에만 표시) - 커스텀 이미지 우선, 없으면 YouTube 기본 */}
            {thumbnailUrl && !videoLoaded && (
              <img
                src={thumbnailUrl}
                alt={event.title}
                className="w-full h-full object-contain"
                style={{
                  backgroundColor: "#000",
                  position: "absolute",
                  top: 0,
                  left: 0,
                  zIndex: 1,
                  opacity: 1,
                  transition: "opacity 0.8s ease-in-out",
                }}
              />
            )}
            {/* YouTube Player */}
            <div
              className="w-full h-full"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                zIndex: 2,
                opacity: videoLoaded ? 1 : 0,
                transition: "opacity 0.8s ease-in-out",
              }}
            >
              <YouTubePlayer
                ref={(el) => {
                  playerRefsRef.current[slideIndex] = el;
                }}
                videoId={videoInfo.videoId}
                slideIndex={slideIndex}
                isVisible={isVisible}
                apiReady={youtubeApiReady}
                onPlayingCallback={handleVideoPlaying}
              />
            </div>
          </>
        ) : (
          /* === 일반 이미지 === */
          imageUrl && (
            <img
              src={imageUrl}
              alt={event.title}
              className="w-full h-full object-contain"
              style={{ backgroundColor: "#000" }}
              loading="lazy"
            />
          )
        )}

        {/* === 정보 레이어 === */}
        {isVisible && (
          <>
            <div
              className="absolute"
              style={{
                width: "100%",
                padding: "0 42px",
                top: "20.0267px",
                zIndex: 10,
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                alignContent: "space-between",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              {events.length > 1 && (
                <div
                  className="relative flex items-center justify-center"
                  style={{
                    width: `${96 * scale}px`,
                    height: `${96 * scale}px`,
                  }}
                >
                  {/* 펄스 링 (외부) - 부하 1%, CSS animation만 사용 */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      animation: 'billboard-pulse 3s ease-in-out infinite',
                    }}
                  />
                  {/* 펄스 링 (내부) */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: `${72 * scale}px`,
                      height: `${72 * scale}px`,
                      top: `${12 * scale}px`,
                      left: `${12 * scale}px`,
                      backgroundColor: 'rgba(255, 255, 255, 0.25)',
                      animation: 'billboard-pulse-inner 3s ease-in-out infinite',
                    }}
                  />
                  {/* 슬라이드 번호 */}
                  <span
                    className="relative text-white font-bold z-10"
                    style={{ fontSize: `${20 * scale}px` }}
                  >
                    {currentIndex + 1}/{events.length}
                  </span>
                  
                  {/* 
                  === 기존 SVG 원형 프로그레스 바 (주석 처리) ===
                  <svg
                    className="transform -rotate-90"
                    style={{
                      width: `${96 * scale}px`,
                      height: `${96 * scale}px`,
                    }}
                  >
                    <circle
                      cx={48 * scale}
                      cy={48 * scale}
                      r={42 * scale}
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeWidth={6 * scale}
                      fill="none"
                    />
                    <circle
                      key={`progress-${currentIndex}`}
                      cx={48 * scale}
                      cy={48 * scale}
                      r={42 * scale}
                      stroke="white"
                      strokeWidth={6 * scale}
                      fill="none"
                      strokeDasharray={264 * scale}
                      style={{
                        ['--dash-total' as any]: `${264 * scale}`,
                        animation: `progressCircle ${settings?.auto_slide_interval ?? 5000}ms linear forwards`,
                      }}
                    />
                  </svg>
                  */}
                </div>
              )}
              <div
                className="bg-black/70 text-white px-3 py-1 rounded text-xs"
                style={{ position: "relative", width: "max-content" }}
              >
                {realtimeStatus}
              </div>
            </div>

            {/* 하단 정보 레이어 */}
            <div
              key={`info-${event.id}-${slideIndex}`}
              className="absolute bottom-0 left-0 right-0"
              style={{
                paddingLeft: `${32 * scale}px`,
                paddingRight: `${32 * scale}px`,
                paddingTop: `${40 * scale}px`,
                paddingBottom: `${40 * scale}px`,
                zIndex: 10,
                background:
                  "linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)",
              }}
            >
              {/* 장식 요소들 */}
              <div
                style={{
                  position: "absolute",
                  top: `${-80 * scale}px`,
                  left: `${20 * scale}px`,
                  width: `${60 * scale}px`,
                  height: `${60 * scale}px`,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0))",
                  animation: `float1 2.5s ease-in-out 0s forwards`,
                  opacity: 0,
                  transform: `scale(0) translateY(-${50 * scale}px)`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${-60 * scale}px`,
                  right: `${40 * scale}px`,
                  width: `${80 * scale}px`,
                  height: `${80 * scale}px`,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(circle, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0))",
                  animation: `float2 2.6s ease-in-out 0.3s forwards`,
                  opacity: 0,
                  transform: `scale(0) translateY(-${80 * scale}px)`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${-90 * scale}px`,
                  left: `${120 * scale}px`,
                  width: `${40 * scale}px`,
                  height: `${40 * scale}px`,
                  backgroundColor: "rgba(255, 255, 255, 0.7)",
                  transform: "rotate(45deg)",
                  animation: `diamond 2.8s ease-in-out 0.6s forwards`,
                  opacity: 0,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${-70 * scale}px`,
                  right: `${150 * scale}px`,
                  width: `${50 * scale}px`,
                  height: `${50 * scale}px`,
                  backgroundColor: "rgba(255, 255, 255, 0.6)",
                  transform: "rotate(45deg)",
                  animation: `diamond2 2.7s ease-in-out 0.9s forwards`,
                  opacity: 0,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${10 * scale}px`,
                  left: `${-30 * scale}px`,
                  width: `${12 * scale}px`,
                  height: `${12 * scale}px`,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.9)",
                  boxShadow: `0 0 ${20 * scale}px rgba(255, 255, 255, 0.6)`,
                  animation: `particle1 3s ease-in-out 1.2s forwards`,
                  opacity: 0,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${40 * scale}px`,
                  right: `${-20 * scale}px`,
                  width: `${14 * scale}px`,
                  height: `${14 * scale}px`,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.85)",
                  boxShadow: `0 0 ${25 * scale}px rgba(255, 255, 255, 0.5)`,
                  animation: `particle2 2.9s ease-in-out 1.5s forwards`,
                  opacity: 0,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: `${-50 * scale}px`,
                  left: `${250 * scale}px`,
                  width: `${10 * scale}px`,
                  height: `${10 * scale}px`,
                  borderRadius: "50%",
                  backgroundColor: "rgba(255, 255, 255, 0.8)",
                  boxShadow: `0 0 ${18 * scale}px rgba(255, 255, 255, 0.5)`,
                  animation: `particle3 2.8s ease-in-out 1.8s forwards`,
                  opacity: 0,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: `${48 * scale}px`,
                  right: `${48 * scale}px`,
                  height: `${2 * scale}px`,
                  backgroundColor: "rgba(255, 255, 255, 0.3)",
                  transformOrigin: "left",
                  animation: `drawLine 1.2s ease-out 4.2s forwards`,
                  transform: "scaleX(0)",
                }}
              />

              {/* 날짜 + 장소 (8% 제한) */}
              <div
                style={{
                  minHeight: `${dateLocationHeight}px`,
                  marginBottom: `${dateLocationHeight * 0.1}px`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: `${dateLocationHeight * 0.05}px`,
                }}
              >
                {event.start_date && (
                  <div
                    className="text-blue-400 font-semibold"
                    style={{
                      fontSize: `${dateLocationFontSize}px`,
                      lineHeight: 1.2,
                      animation: `slideInLeft 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards`,
                      opacity: 0,
                      transform: `translateX(-${dateLocationFontSize * 5}px) rotate(-8deg)`,
                    }}
                  >
                    <i className="ri-calendar-line" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                    {formatDateRange(event.start_date, event.end_date)}
                  </div>
                )}
                {event.location && event.location.trim() && event.location !== "미정" && (
                  <div
                    className="text-gray-300"
                    style={{
                      fontSize: `${dateLocationFontSize}px`,
                      lineHeight: 1.2,
                      animation: `slideInRight 1s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s forwards`,
                      opacity: 0,
                      transform: `translateX(${dateLocationFontSize * 5}px) rotate(8deg)`,
                    }}
                  >
                    <i className="ri-map-pin-line" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                    {event.location}
                  </div>
                )}
              </div>

              {/* 제목 + QR (10% 제한 영역) */}
              <div 
                className="flex items-center justify-between"
                style={{
                  minHeight: `${bottomInfoHeight}px`,
                }}
              >
                <h3
                  className="text-white font-bold flex-1"
                  style={{
                    fontSize: `${titleFontSize}px`,
                    lineHeight: 1.2,
                    wordBreak: "keep-all",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    paddingRight: `${qrSize * 0.1}px`,
                    animation: `zoomInUp 1.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards`,
                    opacity: 0,
                    transform: `scale(0.2) translateY(${titleFontSize * 2}px) rotate(-15deg)`,
                  }}
                >
                  {event.title}
                </h3>
                <div
                  className="bg-white rounded-lg flex-shrink-0"
                  style={{
                    padding: `${qrSize * 0.08}px`,
                    marginLeft: `${qrSize * 0.1}px`,
                  }}
                >
                  <QRCodeCanvas
                    value={`${window.location.origin}/?event=${event.id}&from=qr`}
                    size={Math.round(qrSize)}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <link rel="dns-prefetch" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />
      <style>{`
        @keyframes billboard-pulse { 
          0%, 100% { opacity: 0.15; transform: scale(1); }
          50% { opacity: 0.3; transform: scale(1.08); }
        }
        @keyframes billboard-pulse-inner { 
          0%, 100% { opacity: 0.25; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.05); }
        }
        @keyframes progressCircle { from { stroke-dashoffset: var(--dash-total); } to { stroke-dashoffset: 0; } }
        @keyframes float1 { 0% { opacity: 0; transform: scale(0) translateY(-50px); } 30% { opacity: 0.8; transform: scale(1.3) translateY(5px); } 60% { opacity: 0.6; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.8) translateY(10px); } }
        @keyframes float2 { 0% { opacity: 0; transform: scale(0) translateY(-80px); } 30% { opacity: 0.7; transform: scale(1.4) translateY(8px); } 60% { opacity: 0.5; transform: scale(1) translateY(0); } 100% { opacity: 0; transform: scale(0.7) translateY(15px); } }
        @keyframes diamond { 0% { opacity: 0; transform: rotate(45deg) scale(0); } 30% { opacity: 0.7; transform: rotate(225deg) scale(1.3); } 60% { opacity: 0.5; transform: rotate(405deg) scale(1); } 100% { opacity: 0; transform: rotate(495deg) scale(0.6); } }
        @keyframes diamond2 { 0% { opacity: 0; transform: rotate(45deg) scale(0); } 30% { opacity: 0.6; transform: rotate(-135deg) scale(1.4); } 60% { opacity: 0.4; transform: rotate(-315deg) scale(1); } 100% { opacity: 0; transform: rotate(-405deg) scale(0.5); } }
        @keyframes particle1 { 0% { opacity: 0; transform: translateX(-100px) translateY(-50px) scale(0); } 30% { opacity: 0.9; transform: translateX(50px) translateY(25px) scale(1.5); } 60% { opacity: 0.6; transform: translateX(0) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(30px) translateY(-20px) scale(0.5); } }
        @keyframes particle2 { 0% { opacity: 0; transform: translateX(100px) translateY(-50px) scale(0); } 30% { opacity: 0.8; transform: translateX(-50px) translateY(25px) scale(1.6); } 60% { opacity: 0.5; transform: translateX(0) translateY(0) scale(1); } 100% { opacity: 0; transform: translateX(-30px) translateY(-20px) scale(0.4); } }
        @keyframes particle3 { 0% { opacity: 0; transform: translateY(-80px) scale(0); } 30% { opacity: 0.7; transform: translateY(20px) scale(1.4); } 60% { opacity: 0.4; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-15px) scale(0.6); } }
        @keyframes drawLine { 0% { transform: scaleX(0); } 100% { transform: scaleX(1); } }
        @keyframes slideInLeft { 0% { opacity: 0; transform: translateX(-150px) rotate(-8deg); } 100% { opacity: 1; transform: translateX(0) rotate(0deg); } }
        @keyframes slideInRight { 0% { opacity: 0; transform: translateX(150px) rotate(8deg); } 100% { opacity: 1; transform: translateX(0) rotate(0deg); } }
        @keyframes zoomInUp { 0% { opacity: 0; transform: scale(0.2) translateY(100px) rotate(-15deg); } 60% { opacity: 1; transform: scale(1.2) translateY(-15px) rotate(5deg); } 80% { opacity: 1; transform: scale(0.9) translateY(5px) rotate(-3deg); } 100% { opacity: 1; transform: scale(1) translateY(0) rotate(0deg); } }
        @keyframes fadeInScale { 0% { opacity: 0; transform: scale(0.2) translateY(100px) rotate(-15deg); } 60% { opacity: 1; transform: scale(1.2) translateY(-15px) rotate(5deg); } 80% { opacity: 1; transform: scale(0.9) translateY(5px) rotate(-3deg); } 100% { opacity: 1; transform: scale(1) translateY(0) rotate(0deg); } }
        @keyframes qrBounce { 0% { transform: rotate(540deg) scale(0.1); } 100% { transform: rotate(270deg) scale(1.3); } }
      `}</style>
      <div className="billboard-page">
        {/* 현재 + 다음 슬라이드만 DOM에 유지 (부드러운 전환 + 메모리 최적화) */}
        {events.map((event, index) => {
          // 현재 + 다음 슬라이드 렌더링 (마지막 5초 전에 다음 슬라이드 미리 로드)
          const shouldRender = index === currentIndex || index === nextSlideIndex;
          
          // ✅ 로그: 렌더링 판단
          if (shouldRender) {
            console.log(`[🎬 렌더링] 슬라이드 ${index} 렌더링 중 - currentIndex: ${currentIndex}, nextSlideIndex: ${nextSlideIndex}, 역할: ${index === currentIndex ? '현재' : '다음'}`);
          }
          
          if (!shouldRender) return null;
          
          return (
            <div
              key={`slide-${event.id}-${index}`}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: index === currentIndex ? 1 : 0,
                zIndex: index === currentIndex ? 10 : 1,
                pointerEvents: index === currentIndex ? 'auto' : 'none',
                transition: `opacity ${settings?.transition_duration ?? 500}ms ease-in-out`,
              }}
            >
              {renderSlide(event, index === currentIndex || index === nextSlideIndex, index)}
            </div>
          );
        })}
      </div>
    </>
  );
}

