import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle, memo } from "react";
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
  onPlayingCallback: (index: number) => void;
  apiReady: boolean;  // 부모로부터 API 준비 상태 받기
}>(({
  videoId,
  slideIndex,
  onPlayingCallback,
  apiReady,  // props로 받기
}, ref) => {
  const playerRef = useRef<any>(null);
  const hasCalledOnPlaying = useRef(false);
  const playerReady = useRef(false);  // YouTube Player 준비 상태

  // 외부에서 제어 가능하도록 함수 노출
  useImperativeHandle(ref, () => ({
    pauseVideo: () => {
      if (playerRef.current?.pauseVideo) {
        playerRef.current.pauseVideo();
        console.log('[YouTube] 일시정지:', slideIndex);
      }
    },
    playVideo: () => {
      if (playerRef.current?.playVideo) {
        playerRef.current.playVideo();
        console.log('[YouTube] 재생:', slideIndex);
      }
    },
    isReady: () => playerReady.current,  // 준비 상태 확인 메서드
  }));

  // Player 생성
  useEffect(() => {
    if (!apiReady || !videoId || playerRef.current) {
      if (playerRef.current) {
        console.log(`[YouTube 캐시] Player 이미 존재, 재생성 스킵: ${videoId}`);
      }
      return;
    }

    const playerId = `yt-player-${slideIndex}`;
    console.log('[YouTube] Player 생성 시작:', playerId, 'videoId:', videoId);
    
    const timer = setTimeout(() => {
      const element = document.getElementById(playerId);
      if (!element) {
        console.error('[YouTube] DOM 요소를 찾을 수 없음:', playerId);
        return;
      }

      try {
        playerRef.current = new window.YT.Player(playerId, {
          videoId,
          playerVars: {
            origin: window.location.origin,
            autoplay: 0,  // 자동재생 비활성화 (부모가 명시적으로 playVideo 호출)
            mute: 1,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event: any) => {
              console.log('[YouTube] Player 준비 완료:', slideIndex);
              playerReady.current = true;  // 준비 상태 플래그 설정
              // 현재 슬라이드만 자동 재생 (나머지는 pause 상태 유지)
              // 부모 컴포넌트에서 명시적으로 playVideo 호출할 예정
            },
            onStateChange: (event: any) => {
              // 재생 시작 감지 (YT.PlayerState.PLAYING = 1)
              if (event.data === 1) {
                if (!hasCalledOnPlaying.current) {
                  console.log('[YouTube] 재생 시작 감지 (첫 재생):', slideIndex);
                  hasCalledOnPlaying.current = true;
                  onPlayingCallback(slideIndex);
                }
              }
              // 종료 감지 (YT.PlayerState.ENDED = 0) → 0초로 돌아가서 루프 재생
              else if (event.data === 0) {
                console.log('[YouTube] 재생 종료 감지 → 0초로 돌아가서 다시 재생:', slideIndex);
                if (playerRef.current?.seekTo && playerRef.current?.playVideo) {
                  playerRef.current.seekTo(0, true); // 0초로 이동
                  setTimeout(() => {
                    playerRef.current?.playVideo(); // 다시 재생
                  }, 100);
                }
                hasCalledOnPlaying.current = false; // 플래그 리셋
              }
              // 일시정지 감지 (YT.PlayerState.PAUSED = 2)
              else if (event.data === 2) {
                console.log('[YouTube] 일시정지 감지:', slideIndex);
                // 다음 재생을 위해 플래그 리셋
                hasCalledOnPlaying.current = false;
              }
            },
            onError: (event: any) => {
              console.error('[YouTube] Player 에러:', event.data);
            },
          },
        });
        console.log('[YouTube] Player 객체 생성 완료');
      } catch (err) {
        console.error('[YouTube] Player 생성 실패:', err);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      // destroy() 제거 - Player 객체 유지하여 캐시 활용
      console.log('[YouTube] Player cleanup (destroy 안함, 캐시 유지):', videoId);
      // hasCalledOnPlaying 리셋하여 재진입 시 다시 재생 가능
      hasCalledOnPlaying.current = false;
    };
  }, [apiReady, videoId, onPlayingCallback]);  // ✅ slideIndex 제거 - videoId만 의존

  return <div id={`yt-player-${slideIndex}`} className="w-full h-full" />;
}), (prevProps, nextProps) => {
  // ✅ videoId만 비교 - 같은 영상이면 slideIndex 달라도 Player 재사용
  // slideIndex는 표시 목적이므로 캐싱과 무관
  const shouldSkipRender = prevProps.videoId === nextProps.videoId && 
                           prevProps.apiReady === nextProps.apiReady;
  
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
  const currentEventIdRef = useRef<string | null>(null); // 현재 이벤트 ID 추적
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
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

  // 슬라이드 타이머 시작 함수
  const startSlideTimer = useCallback((slideInterval: number) => {
    // 기존 타이머 정리
    if (slideTimerRef.current) {
      clearInterval(slideTimerRef.current);
      slideTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    
    const startTime = Date.now();
    slideStartTimeRef.current = startTime;
    console.log(`[타이머 시작] 슬라이드 ${currentIndex} - 간격: ${slideInterval}ms, 시작시간: ${new Date().toLocaleTimeString()}`);
    
    // 진행바 업데이트 (50ms 간격으로 매우 부드러운 애니메이션)
    setProgress(0);
    const step = (50 / slideInterval) * 100;
    progressIntervalRef.current = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + step));
    }, 50);

    // 슬라이드 전환 타이머
    slideTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Ref 사용 (stale closure 방지)
      const latestEvents = eventsRef.current;
      const latestShuffledPlaylist = shuffledPlaylistRef.current;
      const latestSettings = settingsRef.current;
      const latestPendingReload = pendingReloadRef.current;
      console.log(`[타이머 종료] - 설정: ${slideInterval}ms, 실제경과: ${elapsed}ms, 종료시간: ${new Date().toLocaleTimeString()}`);
      
      setProgress(0);
      if (latestPendingReload) {
        setTimeout(() => window.location.reload(), 500);
        return;
      }
      
      setTimeout(() => {
        // 현재 이벤트 ID로 인덱스 찾기 (ref 사용)
        const currentEventId = currentEventIdRef.current;
        const previousIndex = currentEventId ? latestEvents.findIndex(e => e.id === currentEventId) : 0;
        
        // 🎯 변경사항 감지 시 데이터만 새로고침 (React.memo가 Player 캐시 보존)
        if (pendingChangesRef.current.length > 0) {
          const changeCount = pendingChangesRef.current.length;
          console.log(`[변경사항 감지] ${changeCount}건 → 데이터만 새로고침`);
          
          // 대기열 초기화
          pendingChangesRef.current = [];
          setRealtimeStatus(`변경 ${changeCount}건 감지, 데이터 새로고침 중...`);
          
          // 데이터만 새로고침 (페이지 reload 안함 → React.memo가 Player 보존)
          loadBillboardDataRef.current?.();
          
          setTimeout(() => setRealtimeStatus("연결됨"), 2000);
        }
        
        // 정상 슬라이드 전환 (플레이리스트 재구성 없을 때만)
        if (latestSettings?.play_order === "random") {
          const next = playlistIndexRef.current + 1;
          if (next >= latestShuffledPlaylist.length) {
            const newList = shuffleArray(
              Array.from({ length: latestEvents.length }, (_, i) => i),
            );
            setShuffledPlaylist(newList);
            shuffledPlaylistRef.current = newList; // Ref 동기화
            playlistIndexRef.current = 0;
            const nextIndex = newList[0] ?? 0;
            setCurrentIndex(nextIndex);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
          } else {
            playlistIndexRef.current = next;
            const nextIndex = latestShuffledPlaylist[next] ?? 0;
            setCurrentIndex(nextIndex);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
          }
        } else {
          setCurrentIndex((prev) => {
            const nextIndex = (prev + 1) % latestEvents.length;
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
            return nextIndex;
          });
        }
        
        // 슬라이드 전환 후 이전 슬라이드의 비디오 로딩 상태 초기화
        setTimeout(() => {
          setVideoLoadedMap(prev => {
            const newMap = { ...prev };
            delete newMap[previousIndex];
            return newMap;
          });
        }, 100);
      }, 500);
    }, slideInterval);
  }, []); // 모든 state ref로 변경, dependency array 비움 (stale closure 완전 제거)

  // 메모리 모니터링
  const checkMemory = useCallback(() => {
    if ((performance as any).memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = (performance as any).memory;
      const usedMB = (usedJSHeapSize / 1048576).toFixed(2);
      const limitMB = (jsHeapSizeLimit / 1048576).toFixed(2);
      const percentage = ((usedJSHeapSize / jsHeapSizeLimit) * 100).toFixed(1);
      const videoCount = events.filter(e => !!e.video_url).length;
      console.log(`[메모리] 사용: ${usedMB}MB / ${limitMB}MB (${percentage}%), 전체: ${events.length}개 (영상: ${videoCount}개)`);
    }
  }, [events]);

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
          setTimeout(attemptPlay, 100);
        } else {
          console.error(`[슬라이드 전환] Player ${targetIndex} 준비 시간 초과 (5초)`);
        }
      };
      attemptPlay();
    }
    
    prevIndexRef.current = currentIndex;
    
    // 메모리 모니터링
    checkMemory();
  }, [currentIndex, checkMemory, events, settings, startSlideTimer, youtubeApiReady]);

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

  // 모바일 주소창 숨기기
  useEffect(() => {
    const hideAddressBar = () => {
      window.scrollTo(0, 1);
    };
    setTimeout(hideAddressBar, 100);
    setTimeout(hideAddressBar, 500);
    setTimeout(hideAddressBar, 1000);
    window.addEventListener("orientationchange", hideAddressBar);
    return () => {
      window.removeEventListener("orientationchange", hideAddressBar);
    };
  }, []);

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
            setTimeout(() => {
              loadBillboardDataRef.current?.();
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
        { event: "UPDATE", schema: "public", table: "billboard_user_settings" },
        (payload) => {
          if (payload.new.billboard_user_id === userId) {
            setRealtimeStatus("설정 변경 감지!");
            loadBillboardData();
            setTimeout(() => setRealtimeStatus("연결됨"), 3000);
          }
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
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(deployChannel);
    };
  }, [userId]);

  const filterEvents = useCallback((
    allEvents: Event[],
    settings: BillboardUserSettings,
  ): Event[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return allEvents.filter((event) => {
      if (!event?.image_full && !event?.image && !event?.video_url) return false;
      if (settings.excluded_event_ids.includes(event.id)) return false;
      const eventDate = new Date(event.start_date || event.date || "");
      const weekday = eventDate.getDay();
      if (settings.excluded_weekdays.includes(weekday)) return false;
      
      // 종료날짜 기준으로 필터링
      const eventEndDate = new Date(
        event.end_date || event.start_date || event.date || "",
      );
      if (settings.date_filter_start && eventEndDate < new Date(settings.date_filter_start))
        return false;
      if (settings.date_filter_end && eventEndDate > new Date(settings.date_filter_end))
        return false;
      if (!settings.date_filter_start && !settings.date_filter_end) {
        if (eventEndDate < today) return false;
      }
      return true;
    });
  }, []);

  const loadBillboardData = useCallback(async () => {
    try {
      console.log("[빌보드] 데이터 리로드: 기존 타이머 정리 중...");
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

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
      });
      setSettings(userSettings);

      const { data: allEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true });
      if (eventsError) throw eventsError;

      const filteredEvents = filterEvents(allEvents || [], userSettings);
      console.log("[빌보드] 필터링 완료:", filteredEvents.length, "개");

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
      console.log(`[슬라이드 ${currentIndex}] 영상 감지 - 실제 재생 감지 시 타이머 시작 예정`);
    }

    return () => {
      console.log(`[타이머 cleanup] 슬라이드 ${currentIndex} 타이머 정리`);
      if (slideTimerRef.current) {
        clearInterval(slideTimerRef.current);
        slideTimerRef.current = null;
      }
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      setProgress(0);
    };
  }, [events, settings, currentIndex, startSlideTimer]);

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
    const imageUrl = event?.image_full || event?.image;
    const videoUrl = event?.video_url;
    const videoInfo = videoUrl ? parseVideoUrl(videoUrl) : null;
    const videoLoaded = videoLoadedMap[slideIndex] || false;
    
    // 썸네일: 사용자 업로드 이미지 우선, 없으면 YouTube 기본 썸네일
    const thumbnailUrl = imageUrl || videoInfo?.thumbnailUrl;

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
            {thumbnailUrl && (
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
                  opacity: videoLoaded ? 0 : 1,
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
                apiReady={youtubeApiReady}
                onPlayingCallback={handleVideoPlaying}
              />
            </div>
          </>
        ) : (
          /* === 일반 이미지 === */
          <img
            src={imageUrl}
            alt={event.title}
            className="w-full h-full object-contain"
            style={{ backgroundColor: "#000" }}
            loading="lazy"
          />
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
                  className="relative"
                  style={{
                    width: `${96 * scale}px`,
                    height: `${96 * scale}px`,
                  }}
                >
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
                      cx={48 * scale}
                      cy={48 * scale}
                      r={42 * scale}
                      stroke="white"
                      strokeWidth={6 * scale}
                      fill="none"
                      strokeDasharray={264 * scale}
                      strokeDashoffset={264 * scale - (264 * scale * progress) / 100}
                      style={{ transition: "stroke-dashoffset 0.15s ease-out" }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="text-white font-bold"
                      style={{ fontSize: `${20 * scale}px` }}
                    >
                      {currentIndex + 1}/{events.length}
                    </span>
                  </div>
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
        {/* 모든 슬라이드를 DOM에 유지 (visibility로 표시/숨김, MediaCodec 캐시 보존) */}
        {events.map((event, index) => (
          <div
            key={`slide-${event.id}-${index}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              visibility: index === currentIndex ? 'visible' : 'hidden',
            }}
          >
            {renderSlide(event, index === currentIndex, index)}
          </div>
        ))}
      </div>
    </>
  );
}

