import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../lib/supabase";
import type {
  BillboardUser,
  BillboardUserSettings,
  Event,
} from "../../lib/supabase";
import { parseVideoUrl } from "../../utils/videoEmbed";
import { log, warn } from "./utils/logger";
import { logEvent } from "../../lib/analytics";
import { shuffleArray } from "./utils/helpers";
import type { YouTubePlayerHandle } from "./types";
import YouTubePlayer from "./components/YouTubePlayer";
import { useYouTubeAPI } from "./hooks/useYouTubeAPI";
import './billboard.css';

export default function BillboardPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const playedEventsCountRef = useRef(0); // [NEW] 재생된 이벤트 카운트
  const [billboardUser, setBillboardUser] = useState<BillboardUser | null>(null);
  const [settings, setSettings] = useState<BillboardUserSettings | null>(null);
  const settingsRef = useRef<BillboardUserSettings | null>(null); // Ref 동기화 (stale closure 방지)
  const [events, setEvents] = useState<Event[]>([]);
  const eventsRef = useRef<Event[]>([]); // Ref 동기화 (stale closure 방지)
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentEventIdRef = useRef<string | number | null>(null); // 현재 이벤트 ID 추적 (Event.id는 number 타입)
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
  const pendingDataRefreshRef = useRef(false); // 이벤트 변경 감지 플래그 (단순 boolean)
  const isLoadingDataRef = useRef(false); // 중복 로딩 방지 플래그
  const scale = 1; // 고정 스케일 (원래 크기 유지)
  const [videoLoadedMap, setVideoLoadedMap] = useState<Record<number, boolean>>({}); // 비디오 로딩 상태
  const [needsRotation, setNeedsRotation] = useState(false); // 화면 회전 필요 여부
  const [qrSize, setQrSize] = useState(144); // QR 코드 크기
  const [titleFontSize, setTitleFontSize] = useState(56); // 제목 폰트 크기
  const [dateLocationFontSize, setDateLocationFontSize] = useState(31); // 날짜+장소 폰트 크기
  const slideTimerRef = useRef<NodeJS.Timeout | null>(null); // 슬라이드 전환 타이머
  const slideStartTimeRef = useRef<number>(0); // 슬라이드 시작 시간
  const videoTimeoutRef = useRef<NodeJS.Timeout | null>(null); // 영상 재생 타임아웃 타이머
  const playerRefsRef = useRef<(YouTubePlayerHandle | null)[]>([]); // 슬라이드별 Player 참조
  const prevIndexRef = useRef<number>(0); // 이전 슬라이드 인덱스
  const currentActiveIndexRef = useRef<number>(0); // 현재 활성 슬라이드 인덱스 (attemptPlay 취소용)
  const isPausedRef = useRef<boolean>(false); // 일시정지 상태 (마우스 호버 등) 중복 실행 방지
  const youtubeApiReady = useYouTubeAPI(); // YouTube API 준비 상태
  const loadBillboardDataRef = useRef<(() => Promise<void>) | null>(null); // loadBillboardData 함수 ref
  const lastSlideChangeTimeRef = useRef<number>(Date.now()); // 워치독: 마지막 슬라이드 전환 시간
  const watchdogTimerRef = useRef<NodeJS.Timeout | null>(null); // 워치독 타이머
  // ✅ setTimeout 타이머들 (메모리 누수 방지)
  const transitionTimersRef = useRef<NodeJS.Timeout[]>([]); // 슬라이드 전환 시 사용되는 모든 setTimeout
  const reloadTimerRef = useRef<NodeJS.Timeout | null>(null); // 실시간 업데이트용 setTimeout
  const playRetryTimerRef = useRef<NodeJS.Timeout | null>(null); // Player 재생 재시도용 setTimeout
  // ✅ Supabase 채널 ref (메모리 누수 방지 - 중복 구독 방지)
  const eventsChannelRef = useRef<any>(null);
  const settingsChannelRef = useRef<any>(null);
  const deployChannelRef = useRef<any>(null);

  // 🛡️ 네트워크 워치독 상태 (각 채널별 상태 추적)
  const [channelStates, setChannelStates] = useState({
    events: 'CONNECTING',
    settings: 'CONNECTING',
    deploy: 'CONNECTING'
  });
  const networkWatchdogTimerRef = useRef<NodeJS.Timeout | null>(null); // 네트워크 복구 타이머

  // 빌보드 페이지 배경색을 검은색으로 설정 + 스크롤 금지
  useEffect(() => {
    document.body.style.backgroundColor = '#000000';
    document.documentElement.style.backgroundColor = '#000000';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.backgroundColor = '';
      document.documentElement.style.backgroundColor = '';
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, []);

  // Google 번역 팝업 방지
  useEffect(() => {
    // <html> 태그에 직접 번역 방지 속성 및 클래스 추가 (가장 확실한 방법)
    const htmlElement = document.documentElement;
    htmlElement.setAttribute('translate', 'no');
    htmlElement.classList.add('notranslate');

    return () => {
      // 컴포넌트 언마운트 시 속성 및 클래스 제거
      htmlElement.removeAttribute('translate');
      htmlElement.classList.remove('notranslate');
    };
  }, []);

  // 화면 비율 감지 및 하단 정보 영역 크기 계산
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;

    const calculateSizes = () => {
      const isLandscape = window.innerWidth > window.innerHeight;
      setNeedsRotation(isLandscape);

      // 화면 높이의 10% 계산 (회전 여부에 따라) - 제목+QR 영역
      const effectiveHeight = isLandscape ? window.innerWidth : window.innerHeight;
      const maxHeight = effectiveHeight * 0.1;

      // QR 코드 크기: 최대 높이의 80% 정도, 최소 60px, 최대 150px
      const calculatedQrSize = Math.min(150, Math.max(60, maxHeight * 0.8));
      setQrSize(calculatedQrSize);

      // 제목 폰트 크기: QR 크기에 비례, 최소 20px, 최대 60px
      // 제목 폰트 크기: 화면 너비에 비례하여 더 크게 설정
      const effectiveWidth = isLandscape ? window.innerHeight : window.innerWidth;
      const calculatedFontSize = Math.min(80, Math.max(36, effectiveWidth * 0.075));
      setTitleFontSize(calculatedFontSize);

      // 날짜+장소 영역: 화면 높이의 8%
      const dateLocationMax = effectiveHeight * 0.08;

      // 날짜+장소 폰트 크기: 영역의 30% 정도, 최소 18px, 최대 36px
      const dateLocationFont = Math.min(36, Math.max(18, dateLocationMax * 0.3));
      setDateLocationFontSize(dateLocationFont);

      log(`[빌보드] 크기 계산: ${isLandscape ? '가로' : '세로'}, 제목영역: ${Math.round(maxHeight)}px (QR:${Math.round(calculatedQrSize)}px, 폰트:${Math.round(calculatedFontSize)}px), 날짜영역: ${Math.round(dateLocationMax)}px (폰트:${Math.round(dateLocationFont)}px)`);
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

  // 🛡️ 워치독(Watchdog): 15분간 슬라이드 전환 없으면 자동 새로고침
  useEffect(() => {
    const WATCHDOG_INTERVAL = 60000; // 60초마다 체크
    const STALL_THRESHOLD = 900000; // 15분(900초) 동안 변화 없으면 새로고침

    log('[워치독] 안전장치 시작 - 15분간 슬라이드 전환 없으면 자동 새로고침');

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
      } else if (timeSinceLastChange >= 600000) {
        // 10분 경과 시 경고 로그
        warn(`[워치독] ⚠️ ${minutesStalled}분 ${secondsStalled}초간 슬라이드 전환 없음 (5분 후 자동 새로고침)`);
      }
    }, WATCHDOG_INTERVAL);

    return () => {
      if (watchdogTimerRef.current) {
        clearInterval(watchdogTimerRef.current);
        watchdogTimerRef.current = null;
      }
    };
  }, [userId]); // 워치독은 한 번만 시작, Ref로 최신 값 추적

  // ✅ 모든 타이머 정리 함수 (메모리 누수 방지)
  // ⚠️ watchdogTimer는 제외 (한 번만 생성되고 계속 실행되어야 함)
  const clearAllTimers = useCallback(() => {
    log('[🧹 타이머 정리] 슬라이드 관련 타이머 정리 시작');

    // 슬라이드 전환 타이머 (setInterval)
    if (slideTimerRef.current) {
      clearInterval(slideTimerRef.current);
      slideTimerRef.current = null;
      log('[🧹 타이머 정리] slideTimer 정리 완료');
    }

    // ⚠️ watchdogTimer는 정리하지 않음 (3분 자동 복구 기능 유지)
    // watchdogTimerRef는 별도 useEffect에서 관리됨

    // 미리 로드 타이머 (setTimeout)
    if (preloadTimerRef.current) {
      clearTimeout(preloadTimerRef.current);
      preloadTimerRef.current = null;
      log('[🧹 타이머 정리] preloadTimer 정리 완료');
    }

    // 전환 애니메이션 타이머들 (setTimeout[])
    if (transitionTimersRef.current.length > 0) {
      transitionTimersRef.current.forEach(timer => clearTimeout(timer));
      transitionTimersRef.current = [];
      log('[🧹 타이머 정리] transitionTimers 정리 완료');
    }

    // 데이터 새로고침 타이머 (setTimeout)
    if (reloadTimerRef.current) {
      clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = null;
      log('[🧹 타이머 정리] reloadTimer 정리 완료');
    }

    // 재생 재시도 타이머 (setTimeout)
    if (playRetryTimerRef.current) {
      clearTimeout(playRetryTimerRef.current);
      playRetryTimerRef.current = null;
      log('[🧹 타이머 정리] playRetryTimer 정리 완료');
    }

    log('[🧹 타이머 정리] ✅ 슬라이드 타이머 정리 완료 (watchdog은 계속 실행 중)');

    // 네트워크 워치독 타이머도 정리
    if (networkWatchdogTimerRef.current) {
      clearTimeout(networkWatchdogTimerRef.current);
      networkWatchdogTimerRef.current = null;
    }
  }, []);

  // 슬라이드 타이머 시작 함수
  const startSlideTimer = useCallback((slideInterval: number) => {
    // ✅ 모든 타이머 일괄 정리 (중복 생성 방지, 메모리 누수 방지)
    clearAllTimers();

    const startTime = Date.now();
    slideStartTimeRef.current = startTime;

    // 🛡️ 워치독: 타이머 시작 = 정상 작동 신호
    lastSlideChangeTimeRef.current = startTime;

    // Ref로 정확한 슬라이드 번호 계산 (stale closure 방지)
    const logIndex = currentEventIdRef.current
      ? eventsRef.current.findIndex(e => e.id === currentEventIdRef.current)
      : 0;
    const displayIndex = logIndex >= 0 ? logIndex : 0;

    log(`[⏱️ 타이머] 슬라이드 ${displayIndex} - 간격: ${slideInterval}ms, 시작시간: ${new Date().toLocaleTimeString()}`);

    // ✅ 다음 슬라이드 미리 로드 (재생 시작 5초 후, 슬라이드가 5초보다 짧으면 중간)
    const preloadDelay = Math.min(5000, slideInterval / 2);

    // preload 타이머가 없을 때만 설정 (중복 방지)
    if (!preloadTimerRef.current && preloadDelay > 0 && preloadDelay < slideInterval) {
      log(`[⏱️ 타이머] Preload 타이머 설정: ${preloadDelay}ms 후 다음 슬라이드 준비 (재생 시작 후 ${preloadDelay / 1000}초, 메모리 절약)`);
      preloadTimerRef.current = setTimeout(() => {
        const latestEvents = eventsRef.current;
        const latestSettings = settingsRef.current;
        const latestShuffledPlaylist = shuffledPlaylistRef.current;

        // ✅ events가 없으면 preload 스킵
        if (latestEvents.length === 0) {
          warn(`[미리 로드] events 없음 → 미리 로드 스킵`);
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
            log(`[미리 로드] 플레이리스트 끝 → 새 shuffle 미리 계산, 다음: ${calculatedNextIndex}`);
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

          log(`[🔜 미리 로드] 슬라이드 ${displayIndex} → 다음 슬라이드 ${calculatedNextIndex} 미리 준비 (${preloadDelay}ms 후)`);
          log(`[🔜 미리 로드] ⭐ setNextSlideIndex(${calculatedNextIndex}) 호출`, {
            타입: hasVideo ? '영상' : '이미지',
            videoId: videoId || 'N/A',
            제목: nextEvent?.title || 'N/A',
            플레이어생성: hasVideo ? '예정' : '없음 (이미지는 플레이어 불필요)'
          });
          setNextSlideIndex(calculatedNextIndex);
        } else {
          warn(`[🔜 미리 로드] ⚠️ 잘못된 인덱스: ${calculatedNextIndex}, events: ${latestEvents.length}`);
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
      log(`[타이머 종료] - 설정: ${slideInterval}ms, 실제경과: ${elapsed}ms, 종료시간: ${new Date().toLocaleTimeString()}`);

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
          log(`[🔄 슬라이드 전환] preload 타이머 정리 (전환 완료)`);
        }
        setNextSlideIndex(null);
        log(`[🔄 슬라이드 전환] nextSlideIndex 리셋 → null`);

        // 현재 이벤트 ID로 인덱스 찾기 (ref 사용)
        const currentEventId = currentEventIdRef.current;
        const previousIndex = currentEventId ? latestEvents.findIndex(e => e.id === currentEventId) : 0;

        // [NEW] 5회 재생 후 프리뷰 페이지로 이동 logic (이미지 슬라이드도 적용)
        playedEventsCountRef.current += 1;
        log(`[카운트(타이머)] 재생된 이벤트 수: ${playedEventsCountRef.current}`);

        // 테스트 모드 확인
        const isTestMode = new URLSearchParams(window.location.search).get('test') === 'true';
        const threshold = isTestMode ? 2 : 5;

        // 디버그 상태 업데이트
        if (isTestMode) {
          setRealtimeStatus(`TEST MODE: ${playedEventsCountRef.current}/${threshold} (Event #${previousIndex})`);
        }

        if (playedEventsCountRef.current >= threshold) {
          log(`[전환] ${threshold}회 재생 완료 → 프리뷰 페이지로 이동 (테스트모드: ${isTestMode})`);
          playedEventsCountRef.current = 0;
          clearAllTimers();
          navigate(`/billboard/${userId}/preview${isTestMode ? '?test=true' : ''}`);
          return;
        }

        log(`[💾 메모리 관리] 슬라이드 전환 시작 - 이전: ${previousIndex}, 메모리 해제 예정`);

        // 🎯 변경사항 감지 시 데이터만 새로고침 (React.memo가 Player 캐시 보존)
        if (pendingDataRefreshRef.current) {
          log(`[변경사항 감지] 플래그 ON → 전체 데이터 새로고침`);

          // 플래그 초기화
          pendingDataRefreshRef.current = false;
          setRealtimeStatus(`변경사항 감지, 데이터 새로고침 중...`);

          // 데이터만 새로고침 (페이지 reload 안함 → React.memo가 Player 보존)
          loadBillboardDataRef.current?.();

          // ✅ 상태 업데이트 타이머 저장 (메모리 누수 방지)
          const statusTimer = setTimeout(() => setRealtimeStatus("연결됨"), 2000);
          transitionTimersRef.current.push(statusTimer);
        }

        // ⚡ videoLoadedMap 먼저 초기화 (setCurrentIndex 전에!)
        setVideoLoadedMap(prev => {
          const newMap = { ...prev };
          delete newMap[previousIndex]; // 이전 슬라이드 초기화

          // 다음 슬라이드 인덱스 미리 계산하여 초기화
          if (latestSettings?.play_order === 'random') {
            const next = playlistIndexRef.current + 1;
            if (next >= latestShuffledPlaylist.length) {
              const newList = precomputedShuffleRef.current || shuffleArray(
                Array.from({ length: latestEvents.length }, (_, i) => i),
              );
              const nextIndex = newList[0] ?? 0;
              delete newMap[nextIndex]; // 다음 슬라이드 초기화
            } else {
              const nextIndex = latestShuffledPlaylist[next] ?? 0;
              delete newMap[nextIndex]; // 다음 슬라이드 초기화
            }
          } else {
            const nextIndex = (previousIndex + 1) % latestEvents.length;
            delete newMap[nextIndex]; // 다음 슬라이드 초기화
          }

          log(`[🖼️ 썸네일] videoLoadedMap 초기화 완료 (썸네일 표시 준비)`);
          return newMap;
        });

        // 정상 슬라이드 전환 (플레이리스트 재구성 없을 때만)
        if (latestSettings?.play_order === "random") {
          const next = playlistIndexRef.current + 1;
          if (next >= latestShuffledPlaylist.length) {
            // ✅ 미리 계산된 shuffle이 있으면 재사용 (부드러운 전환)
            let newList = precomputedShuffleRef.current;
            if (!newList) {
              warn(`[슬라이드 전환] ⚠️ precomputed shuffle 없음, 새로 생성 (전환이 부드럽지 않을 수 있음)`);
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
            log(`[슬라이드 전환] Random 모드 wrap → 새 playlist 시작: ${nextIndex}`);
          } else {
            playlistIndexRef.current = next;
            const nextIndex = latestShuffledPlaylist[next] ?? 0;
            log(`[💾 메모리 관리] 슬라이드 ${nextIndex}로 전환 → 슬라이드 ${previousIndex} 메모리 해제됨 (React 자동)`);
            setCurrentIndex(nextIndex);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
          }
        } else {
          setCurrentIndex((prev) => {
            const nextIndex = (prev + 1) % latestEvents.length;
            log(`[💾 메모리 관리] 슬라이드 ${nextIndex}로 전환 → 슬라이드 ${previousIndex} 메모리 해제됨 (React 자동)`);
            currentEventIdRef.current = latestEvents[nextIndex]?.id || null; // ID 업데이트
            return nextIndex;
          });
        }
      }, 500);
      transitionTimersRef.current.push(transitionTimer);
    }, slideInterval);
  }, [clearAllTimers]); // clearAllTimers 함수 포함 (타이머 정리)


  // [리팩토링] 다음 슬라이드로 이동
  const advanceToNextSlide = useCallback((reason: string = 'timer') => {
    // 멈춤 상태면 전환 안함
    if (isPausedRef.current) return;

    // [NEW] 5회 재생 후 프리뷰 페이지로 이동 logic
    // 단순히 다음 슬라이드로 넘어가는 것이 아니라, 카운트를 체크
    playedEventsCountRef.current += 1;
    log(`[카운트] 재생된 이벤트 수: ${playedEventsCountRef.current}`);

    // 테스트 모드 확인
    const isTestMode = new URLSearchParams(window.location.search).get('test') === 'true';
    const threshold = isTestMode ? 2 : 5;

    if (playedEventsCountRef.current >= threshold) {
      log(`[전환] ${threshold}회 재생 완료 → 프리뷰 페이지로 이동 (테스트모드: ${isTestMode})`);
      playedEventsCountRef.current = 0;
      clearAllTimers();
      navigate(`/billboard/${userId}/preview${isTestMode ? '?test=true' : ''}`);
      return;
    }

    // 마지막 슬라이드 변경 시간 업데이트
    lastSlideChangeTimeRef.current = Date.now();
    warn(`[🔄 강제 전환] 사유: ${reason} → 즉시 다음 슬라이드로 전환`);
    clearAllTimers();

    const latestEvents = eventsRef.current;
    const latestSettings = settingsRef.current;
    const latestShuffledPlaylist = shuffledPlaylistRef.current;
    const currentActiveIndex = currentActiveIndexRef.current;

    const transitionTimer = setTimeout(() => {
      if (latestSettings?.play_order === "random") {
        const nextPlaylistIndex = playlistIndexRef.current + 1;
        if (nextPlaylistIndex >= latestShuffledPlaylist.length) {
          const newShuffled = (precomputedShuffleRef.current && precomputedShuffleRef.current.length > 0)
            ? precomputedShuffleRef.current
            : shuffleArray(Array.from({ length: latestEvents.length }, (_, i) => i));
          shuffledPlaylistRef.current = newShuffled;
          setShuffledPlaylist(newShuffled);
          playlistIndexRef.current = 0;
          const targetIndex = newShuffled[0];
          setCurrentIndex(targetIndex);
          precomputedShuffleRef.current = [];
        } else {
          playlistIndexRef.current = nextPlaylistIndex;
          const targetIndex = latestShuffledPlaylist[nextPlaylistIndex];
          setCurrentIndex(targetIndex);
        }
      } else {
        const nextIdx = (currentActiveIndex + 1) % latestEvents.length;
        setCurrentIndex(nextIdx);
      }
    }, 500);
    transitionTimersRef.current.push(transitionTimer);
  }, [clearAllTimers]);

  // YouTube 재생 오류 콜백 (useCallback으로 안정화)
  const handlePlayerError = useCallback((slideIndex: number, error: any) => {
    log(`[빌보드] 영상 재생 오류 감지 (정상 처리됨), 슬라이드: ${slideIndex}`, error);
    if (slideIndex === currentActiveIndexRef.current) {
      advanceToNextSlide('error');
    }
  }, [advanceToNextSlide]);

  // YouTube 영상 재생 시작 콜백
  const handleVideoPlaying = useCallback((slideIndex: number) => {
    log('[빌보드] 영상 재생 시작 감지 (onStateChange), 슬라이드:', slideIndex);

    // ✅ 영상 재생 성공: 타임아웃 취소
    if (videoTimeoutRef.current) {
      log(`[타임아웃] 영상 재생 성공으로 타임아웃 취소`);
      clearTimeout(videoTimeoutRef.current);
      videoTimeoutRef.current = null;
    }

    if (slideIndex === currentActiveIndexRef.current) {
      const currentSettings = settingsRef.current;
      if (currentSettings) {
        const videoDuration = currentSettings.video_play_duration || 10000;
        log(`[⏱️ 타이머] 영상 재생 시작 → ${videoDuration / 1000}초 후 다음 슬라이드로 전환`);
        startSlideTimer(videoDuration);
      }
      // 썸네일 숨기기 (videoLoadedMap 업데이트)
      setVideoLoadedMap(prev => ({ ...prev, [slideIndex]: true }));
    }
  }, [startSlideTimer]);

  // State-Ref 동기화 (stale closure 방지)
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // YouTube 영상 재생 종료 콜백
  const handleVideoEnded = useCallback((slideIndex: number) => {
    log('[빌보드] 영상 종료 감지, 슬라이드:', slideIndex);
    if (slideIndex === currentActiveIndexRef.current) {
      advanceToNextSlide('ended');
    }
  }, [advanceToNextSlide]);

  useEffect(() => {
    if (events[currentIndex]) {
      currentEventIdRef.current = events[currentIndex].id;
      // 🛡️ 워치독: 슬라이드 인덱스 변경 시간 업데이트 (이벤트가 여러개일 때)
      // 이벤트가 1개일 때는 startSlideTimer에서 업데이트
      lastSlideChangeTimeRef.current = Date.now();
    }
  }, [currentIndex, events]);

  useEffect(() => {
    shuffledPlaylistRef.current = shuffledPlaylist;
  }, [shuffledPlaylist]);

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
    log(`[🔄 슬라이드 전환] currentIndex: ${prevIndex} → ${currentIndex}, nextSlideIndex 리셋: ${nextSlideIndex} → null`);
    setNextSlideIndex(null);

    // 현재 활성 슬라이드 업데이트
    currentActiveIndexRef.current = currentIndex;

    // 이전 슬라이드 pause
    if (prevIndex !== currentIndex && playerRefsRef.current[prevIndex]) {
      log(`[슬라이드 전환] ${prevIndex} → ${currentIndex}, 이전 슬라이드 일시정지`);
      playerRefsRef.current[prevIndex]?.pauseVideo();
    }

    // 현재 슬라이드가 영상이면 재생 시작
    if (hasVideo) {
      const targetIndex = currentIndex;  // 현재 타겟 캡처 (클로저 보존)
      const videoUrl = currentEvent?.video_url || '';
      log(`[▶️ 영상 재생] 슬라이드 ${targetIndex} 재생 준비 시작`, {
        videoUrl,
        youtubeApiReady,
        이벤트제목: currentEvent?.title
      });
      // Player가 준비될 때까지 대기 후 재생
      let attemptCount = 0;
      const maxAttempts = 50;  // 최대 5초 대기 (50 * 100ms)
      const attemptPlay = () => {
        attemptCount++;

        // 슬라이드가 변경되었으면 재시도 중단
        if (currentActiveIndexRef.current !== targetIndex) {
          log(`[▶️ 영상 재생] 슬라이드 ${targetIndex} 재시도 중단 (현재: ${currentActiveIndexRef.current})`);
          return;
        }

        const player = playerRefsRef.current[targetIndex];
        const hasPlayer = !!player;
        const hasIsReady = !!(player && player.isReady);
        const isPlayerReady = hasPlayer && hasIsReady && player.isReady();

        // 10번째, 25번째, 50번째 시도에서 상세 로그
        if (attemptCount === 1 || attemptCount === 10 || attemptCount === 25 || attemptCount === maxAttempts) {
          log(`[▶️ 영상 재생] 슬라이드 ${targetIndex} 재생 시도 ${attemptCount}/${maxAttempts}`, {
            Player존재: hasPlayer,
            isReady메서드존재: hasIsReady,
            Player준비완료: isPlayerReady,
            youtubeApiReady
          });
        }

        // Player가 준비되었는지 확인
        if (isPlayerReady) {
          log(`[✅ 영상 재생] 슬라이드 ${targetIndex} Player 준비 완료! playVideo() 호출`, {
            재시도횟수: attemptCount,
            소요시간: `${attemptCount * 100}ms`
          });
          player.playVideo();

          // ❌ 타이머 시작 제거: 실제 재생 감지 시점(handleVideoPlaying)에서 시작
          // YouTube iframe 로드 시간으로 인해 playVideo() 호출 시점과
          // 실제 재생 시작 시점이 8-10초 차이 날 수 있음
          log(`[▶️ 영상 재생] playVideo() 호출 완료, onStateChange 이벤트 대기 중...`);
        } else if (attemptCount < maxAttempts) {
          // Player가 아직 준비 안되면 100ms 후 재시도
          // ✅ 이전 재시도 타이머 정리 (메모리 누수 방지)
          if (playRetryTimerRef.current) clearTimeout(playRetryTimerRef.current);
          playRetryTimerRef.current = setTimeout(attemptPlay, 100);
        } else {
          console.error(`[❌ 영상 재생] Player ${targetIndex} 준비 시간 초과 (5초, ${maxAttempts}회 재시도)`, {
            Player존재: hasPlayer,
            isReady메서드존재: hasIsReady,
            youtubeApiReady,
            videoUrl
          });
          // ✅ Fallback: Player 준비 실패 시에도 타이머 시작하여 다음 슬라이드로 전환
          const currentSettings = settingsRef.current;
          if (currentSettings) {
            const fallbackInterval = currentSettings.auto_slide_interval || 5000;
            log(`[⚠️ Fallback] 영상 로드 실패 → 이미지 타이머로 전환: ${fallbackInterval}ms`);
            startSlideTimer(fallbackInterval);
          }
        }
      };
      attemptPlay();
    } else {
      // [Fix] 이미지 슬라이드: 즉시 타이머 시작
      const currentSettings = settingsRef.current;
      if (currentSettings) {
        // 테스트모드면 3초, 아니면 설정값
        const isTestMode = new URLSearchParams(window.location.search).get('test') === 'true';
        const slideDuration = isTestMode ? 3000 : (currentSettings.auto_slide_interval || 10000);

        log(`[🖼️ 이미지] 슬라이드 ${currentIndex} (테스트:${isTestMode}) → ${slideDuration / 1000}초 후 전환`);
        startSlideTimer(slideDuration);
      }
    }

    // 디버그 상태 업데이트 (테스트 모드일 때만 카운트 표시)
    if (new URLSearchParams(window.location.search).get('test') === 'true') {
      const threshold = 2; // Test mode threshold
      setRealtimeStatus(`TEST MODE: ${playedEventsCountRef.current + 1}/${threshold} (Event #${currentIndex})`);
    }

    prevIndexRef.current = currentIndex;
  }, [currentIndex, events, settings, startSlideTimer, youtubeApiReady]);

  // 데이터 로드 및 Realtime 구독
  useEffect(() => {
    if (!userId) {
      setError("빌보드 사용자 ID가 없습니다.");
      setIsLoading(false);
      return;
    }
    loadBillboardData();

    // ✅ 중복 구독 방지: 기존 채널이 있으면 먼저 제거
    log('[📡 채널 관리] Supabase 채널 설정 시작');

    if (eventsChannelRef.current) {
      log('[📡 채널 관리] ⚠️ 기존 eventsChannel 발견 - 제거');
      supabase.removeChannel(eventsChannelRef.current);
      eventsChannelRef.current = null;
    }
    if (settingsChannelRef.current) {
      log('[📡 채널 관리] ⚠️ 기존 settingsChannel 발견 - 제거');
      supabase.removeChannel(settingsChannelRef.current);
      settingsChannelRef.current = null;
    }
    if (deployChannelRef.current) {
      log('[📡 채널 관리] ⚠️ 기존 deployChannel 발견 - 제거');
      supabase.removeChannel(deployChannelRef.current);
      deployChannelRef.current = null;
    }

    // ✅ 새 채널 생성 및 ref에 저장
    eventsChannelRef.current = supabase
      .channel("billboard-events-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        (payload) => {
          log("[변경사항 감지] 이벤트 변경:", payload.eventType, payload);

          // 이벤트가 0개일 때는 즉시 데이터만 새로고침 (타이머가 안 돌아가므로)
          if (eventsRef.current.length === 0) {
            log("[변경사항 감지] 빈 화면 → 즉시 데이터 새로고침");
            setRealtimeStatus("새 이벤트 감지! 즉시 새로고침...");
            // ✅ 이전 reload 타이머 정리 (메모리 누수 방지)
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = setTimeout(() => {
              loadBillboardDataRef.current?.();
              reloadTimerRef.current = null;
            }, 500);
            return;
          }

          // ✅ 플래그만 켬 (단순화: 대기열 없음, 메모리 안전)
          if (!pendingDataRefreshRef.current) {
            log("[변경사항 감지] 플래그 켬 → 다음 슬라이드 전환 시 전체 새로고침");
            pendingDataRefreshRef.current = true;
            setRealtimeStatus(`변경 감지 (슬라이드 완료 후 적용)`);
          } else {
            log("[변경사항 감지] 플래그 이미 ON → 무시");
          }
        },
      )
      .subscribe((status) => {
        log('[📡 채널 관리] eventsChannel 상태:', status);
        setChannelStates(prev => ({ ...prev, events: status }));
        if (status === 'SUBSCRIBED') setRealtimeStatus(`데이터: 연결됨`);
        else setRealtimeStatus(`데이터: ${status}`);
      });

    settingsChannelRef.current = supabase
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
          log("[변경사항 감지] 설정 변경:", _payload.eventType);

          // 이벤트가 0개일 때는 즉시 데이터만 새로고침 (타이머가 안 돌아가므로)
          if (eventsRef.current.length === 0) {
            log("[변경사항 감지] 빈 화면 → 즉시 설정 새로고침");
            setRealtimeStatus("설정 변경 감지! 즉시 새로고침...");
            // ✅ 이전 reload 타이머 정리 (메모리 누수 방지)
            if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
            reloadTimerRef.current = setTimeout(() => {
              loadBillboardDataRef.current?.();
              reloadTimerRef.current = null;
            }, 500);
            return;
          }

          // ✅ 플래그만 켬 (이벤트 변경과 동일하게 통일)
          if (!pendingDataRefreshRef.current) {
            log("[변경사항 감지] 설정 변경 - 플래그 켬 → 다음 슬라이드 전환 시 전체 새로고침");
            pendingDataRefreshRef.current = true;
            setRealtimeStatus(`설정 변경 감지 (슬라이드 완료 후 적용)`);
          } else {
            log("[변경사항 감지] 설정 변경 - 플래그 이미 ON → 무시");
          }
        },
      )
      .subscribe((status) => {
        log('[📡 채널 관리] settingsChannel 상태:', status);
        setChannelStates(prev => ({ ...prev, settings: status }));
        if (status === 'SUBSCRIBED') setRealtimeStatus(`설정: 연결됨`);
        else setRealtimeStatus(`설정: ${status}`);
      });

    deployChannelRef.current = supabase
      .channel("deploy-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deployments" },
        (payload) => {
          log("새 배포 감지!", payload);
          setPendingReload(true);
          pendingReloadTimeRef.current = Date.now();
          setRealtimeStatus("새 배포! 슬라이드 완료 후 새로고침...");
        },
      )
      .subscribe((status) => {
        log('[📡 채널 관리] deployChannel 상태:', status);
        setChannelStates(prev => ({ ...prev, deploy: status }));
        if (status === 'SUBSCRIBED') setRealtimeStatus(`배포감지: 연결됨`);
        else setRealtimeStatus(`배포감지: ${status}`);
      });

    log('[📡 채널 관리] ✅ 3개 채널 생성 완료 (중복 방지됨)');

    return () => {
      // ✅ 모든 타이머 일괄 정리 (메모리 누수 방지)
      log("[cleanup] 컴포넌트 언마운트: 모든 타이머 및 채널 정리");
      clearAllTimers();

      // ✅ 채널 정리 (ref에서)
      log('[📡 채널 관리] cleanup: Supabase 채널 제거 시작');
      if (eventsChannelRef.current) {
        supabase.removeChannel(eventsChannelRef.current);
        eventsChannelRef.current = null;
        log('[📡 채널 관리] eventsChannel 제거 완료');
      }
      if (settingsChannelRef.current) {
        supabase.removeChannel(settingsChannelRef.current);
        settingsChannelRef.current = null;
        log('[📡 채널 관리] settingsChannel 제거 완료');
      }
      if (deployChannelRef.current) {
        supabase.removeChannel(deployChannelRef.current);
        deployChannelRef.current = null;
        log('[📡 채널 관리] deployChannel 제거 완료');
      }
      log('[📡 채널 관리] ✅ 모든 채널 제거 완료');
    };
  }, [userId, clearAllTimers]);

  // 🛡️ 네트워크 워치독: 연결 끊김이 5초 이상 지속되면 강제 새로고침
  useEffect(() => {
    // 1. 연결 실패 상태 감지 (SUBSCRIBED가 아닌 모든 상태)
    const hasError = Object.values(channelStates).some(
      status => status !== 'SUBSCRIBED'
    );

    // 2. 완전 복구 상태 감지 (모두 연결됨)
    const allConnected = Object.values(channelStates).every(
      status => status === 'SUBSCRIBED'
    );

    if (hasError) {
      if (!networkWatchdogTimerRef.current) {
        log('[워치독] 🚨 네트워크 연결 끊김 감지! 60초 후 재접속(새로고침) 시도 예정...', channelStates);
        setRealtimeStatus(`⚠️ 연결 끊김! 60초 후 자동복구...`);

        networkWatchdogTimerRef.current = setTimeout(() => {
          log('[워치독] 💥 60초 경과: 연결 복구 실패 → 강제 새로고침 실행');
          logEvent('Billboard', 'Auto Reload', `Watcher Timeout - ${billboardUser?.name || userId}`);
          window.location.reload();
        }, 60000); // 60초 대기
      }
    } else if (allConnected) {
      // 완전 복구: 타이머 있으면 제거
      if (networkWatchdogTimerRef.current) {
        log('[워치독] ✅ 네트워크 연결 완전 복구! 재접속 타이머 해제');
        clearTimeout(networkWatchdogTimerRef.current);
        networkWatchdogTimerRef.current = null;
        setRealtimeStatus('연결됨 (복구완료)');
      }
    }
  }, [channelStates]);

  const filterEvents = useCallback((
    allEvents: Partial<Event>[],
    settings: BillboardUserSettings,
  ): Event[] => {
    // 한국 시간 기준 오늘 날짜 (KST = UTC+9)
    const today = new Date();
    const koreaOffset = 9 * 60;
    const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
    koreaTime.setHours(0, 0, 0, 0);

    return allEvents.filter((event) => {
      if (!event.id) return false; // id가 없으면 제외 (필수)
      if (!event?.image_full && !event?.image && !event?.video_url) return false;

      const eventId = typeof event.id === 'string' ? parseInt(event.id, 10) : event.id;
      if (settings.excluded_event_ids.includes(eventId)) return false;

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
    }) as Event[];
  }, []);

  const loadBillboardData = useCallback(async () => {
    // ✅ 중복 호출 방지: 이미 로딩 중이면 건너뜀
    if (isLoadingDataRef.current) {
      log("[빌보드] ⚠️ 이미 데이터 로딩 중 - 중복 호출 방지");
      return;
    }

    isLoadingDataRef.current = true;
    try {
      log("[빌보드] 데이터 리로드: 기존 타이머 정리 중...");

      // [NEW] 테스트 모드 확인
      const isTestMode = new URLSearchParams(window.location.search).get('test') === 'true';

      let user: BillboardUser;
      let userSettings: BillboardUserSettings;
      let allEvents: any[] | null;

      if (isTestMode) {
        log("[빌보드] 🧪 테스트 모드 활성화: Mock 데이터 사용 (DB 조회 생략)");
        user = {
          id: userId || 'test-user',
          name: '테스트 사용자',
          // location: '테스트 지점', // Type Error fix
          password_hash: 'mock_hash', // Type Error fix
          is_active: true,
          created_at: new Date().toISOString(),
          // updated_at: new Date().toISOString() // Type Error fix
        };
        userSettings = {
          id: 9999,
          billboard_user_id: userId || 'test-user',
          play_order: 'sequential', // Type Error fix: 'order' -> 'sequential'
          auto_slide_interval: 3000, // 3초 (빠른 테스트)
          video_play_duration: 10000,
          auto_slide_interval_video: 5000,
          // slide_transition_effect: 'fade', // Type Error fix
          // show_weather: false, // Type Error fix
          // show_clock: false, // Type Error fix
          // show_news: false, // Type Error fix
          // theme: 'dark', // Type Error fix
          font_size: 'medium',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          date_filter_start: null,
          date_filter_end: null,
          excluded_weekdays: [],
          excluded_event_ids: []
        };
        // Mock 이벤트 3개 생성
        allEvents = [
          {
            id: 10001,
            title: '테스트 이벤트 1 (이미지)',
            date: new Date().toISOString(),
            start_date: new Date().toISOString(),
            end_date: new Date().toISOString(),
            time: '12:00',
            location: '테스트룸 A',
            image_full: 'https://via.placeholder.com/1920x1080/2c3e50/ffffff?text=TEST+EVENT+1',
            category: 'TEST',
            genre: 'TEST'
          },
          {
            id: 10002,
            title: '테스트 이벤트 2 (이미지)',
            date: new Date().toISOString(),
            start_date: new Date().toISOString(),
            end_date: new Date().toISOString(),
            time: '14:00',
            location: '테스트룸 B',
            image_full: 'https://via.placeholder.com/1920x1080/e74c3c/ffffff?text=TEST+EVENT+2',
            category: 'TEST',
            genre: 'TEST'
          },
          {
            id: 10003,
            title: '테스트 이벤트 3 (이미지)',
            date: new Date().toISOString(),
            start_date: new Date().toISOString(),
            end_date: new Date().toISOString(),
            time: '16:00',
            location: '테스트룸 C',
            image_full: 'https://via.placeholder.com/1920x1080/8e44ad/ffffff?text=TEST+EVENT+3',
            category: 'TEST',
            genre: 'TEST'
          }
        ];
        setBillboardUser(user);
        setSettings(userSettings);
      } else {
        // [기존 로직] DB 조회
        const { data: userData, error: userError } = await supabase
          .from("billboard_users")
          .select("*")
          .eq("id", userId)
          .eq("is_active", true)
          .maybeSingle();
        if (userError) throw userError;
        if (!userData) throw new Error("빌보드 사용자를 찾을 수 없습니다.");
        user = userData;
        setBillboardUser(user);

        // Analytics: 빌보드 로드 기록 (범인 색출용)
        logEvent('Billboard', 'Start', `${user.name} (${userId})`);

        const { data: settingsData, error: settingsError } = await supabase
          .from("billboard_user_settings")
          .select("*")
          .eq("billboard_user_id", userId)
          .maybeSingle();
        if (settingsError) throw settingsError;
        if (!settingsData) throw new Error("빌보드 설정을 불러올 수 없습니다.");
        userSettings = settingsData;
        setSettings(userSettings);

        const { data: eventsData, error: eventsError } = await supabase
          .from("events")
          .select("id,title,date,start_date,end_date,time,location,image_full,image,video_url,show_title_on_billboard,category,genre")
          .order("start_date", { ascending: true });
        if (eventsError) throw eventsError;
        allEvents = eventsData;
      }

      const filteredEvents = filterEvents(allEvents || [], userSettings);
      log("[빌보드] 필터링 완료:", {
        전체이벤트: allEvents?.length || 0,
        필터링후: filteredEvents.length,
        날짜필터시작: userSettings.date_filter_start || 'null',
        날짜필터종료: userSettings.date_filter_end || 'null',
      });

      if (filteredEvents.length === 0) {
        setEvents([]);
        setCurrentIndex(0);
        setShuffledPlaylist([]);

        // ✅ playerRefsRef 배열 정리 (이벤트 0개)
        log('[💾 메모리 관리] 이벤트 0개 → playerRefsRef 배열 완전 비우기');
        playerRefsRef.current.length = 0;

        // ✅ videoLoadedMap 정리 (이벤트 0개)
        log('[💾 메모리 관리] 이벤트 0개 → videoLoadedMap 완전 비우기');
        setVideoLoadedMap({});
      } else {
        setEvents(filteredEvents);
        const safeIndex = currentIndex >= filteredEvents.length ? 0 : currentIndex;
        if (userSettings.play_order === "random") {
          const indices = Array.from({ length: filteredEvents.length }, (_, i) => i);
          const shuffled = shuffleArray(indices);
          setShuffledPlaylist(shuffled);
          setShuffledPlaylist(shuffled);
          playlistIndexRef.current = 0;
          setCurrentIndex(shuffled[0] || 0);
        } else {
          setCurrentIndex(safeIndex);
        }

        // [Fix] 데이터 로드 시 카운트 리셋 (새로고침 시 등)
        playedEventsCountRef.current = 0;

        // ✅ playerRefsRef 배열 크기 조정 (메모리 누수 방지)
        const oldLength = playerRefsRef.current.length;
        const newLength = filteredEvents.length;

        if (oldLength > newLength) {
          // 배열이 줄어들 때: 남는 Player 참조 제거
          log(`[💾 메모리 관리] playerRefsRef 배열 축소: ${oldLength} → ${newLength}`);

          // 남는 슬롯의 Player는 이미 isVisible=false로 destroy됨
          // 배열 크기만 조정하여 참조 제거
          playerRefsRef.current.length = newLength;

          log('[💾 메모리 관리] ✅ 남는 Player 참조 제거 완료');

          // ✅ videoLoadedMap도 정리 (남는 항목 제거)
          setVideoLoadedMap(prev => {
            const newMap: Record<number, boolean> = {};
            for (let i = 0; i < newLength; i++) {
              if (prev[i]) {
                newMap[i] = prev[i];
              }
            }
            const removedCount = Object.keys(prev).length - Object.keys(newMap).length;
            if (removedCount > 0) {
              log(`[💾 메모리 관리] videoLoadedMap 정리: ${removedCount}개 항목 제거`);
            }
            return newMap;
          });
        } else if (oldLength < newLength) {
          log(`[💾 메모리 관리] playerRefsRef 배열 확장: ${oldLength} → ${newLength} (새 슬라이드 추가됨)`);
        }
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error("빌보드 데이터 로드 실패:", err);
      setError(err.message || "데이터를 불러오는데 실패했습니다.");
      setIsLoading(false);
    } finally {
      // ✅ 로딩 플래그 해제 (성공/실패 모두)
      isLoadingDataRef.current = false;
    }
  }, [userId, filterEvents, currentIndex]);

  // loadBillboardData 함수를 ref에 동기화
  useEffect(() => {
    loadBillboardDataRef.current = loadBillboardData;
  }, [loadBillboardData]);

  // 슬라이드 전환 시 이미지 타이머 설정 (영상은 handleVideoPlaying에서 타이머 시작)
  useEffect(() => {
    if (!settings || events.length === 0) return;

    // 현재 이벤트 가져오기
    const currentEvent = events[currentIndex];
    const hasVideo = !!currentEvent?.video_url;

    // 이미지 슬라이드만 여기서 타이머 시작
    if (!hasVideo) {
      const slideInterval = settings.auto_slide_interval;
      log(`[슬라이드 ${currentIndex}] 이미지 감지 - 즉시 타이머 시작: ${slideInterval}ms`);
      startSlideTimer(slideInterval);
    } else {
      // 영상 슬라이드는 handleVideoPlaying 콜백에서 타이머를 시작함
      // ✅ 안전장치: 30초 내에 재생 시작 안되면 강제 전환 (GPU 오류 등으로 재생 불가능할 경우 대비)
      const VIDEO_TIMEOUT_MS = 30000;
      log(`[슬라이드 ${currentIndex}] 영상 감지 - 재생 대기 (타임아웃: ${VIDEO_TIMEOUT_MS / 1000}초)`);

      if (videoTimeoutRef.current) clearTimeout(videoTimeoutRef.current);

      videoTimeoutRef.current = setTimeout(() => {
        if (currentIndex === currentActiveIndexRef.current) {
          console.error(`[🚨 영상 타임아웃] ${VIDEO_TIMEOUT_MS / 1000}초 동안 재생되지 않음. 다음 슬라이드로 강제 전환.`);
          advanceToNextSlide('timeout');
        }
      }, VIDEO_TIMEOUT_MS);
    }
  }, [events, settings, currentIndex, startSlideTimer, advanceToNextSlide]);

  // 문서 제목 설정
  useEffect(() => {
    if (billboardUser?.name) {
      document.title = `댄싱조이 - ${billboardUser.name} 빌보드`;
    }
    return () => {
      document.title = "댄스빌보드 - Event Discovery Platform";
    };
  }, [billboardUser]);

  // 로딩/에러/빈 화면
  if (isLoading) {
    return (
      <div className="billboard-loading-container">
        <div className="billboard-loading-content">
          {/* 부드러운 스피너 애니메이션 */}
          <div className="billboard-spinner-container">
            <div className="billboard-spinner-bg"></div>
            <div className="billboard-spinner"></div>
          </div>
          <div className="billboard-loading-text">이벤트 불러오는 중</div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="billboard-error-container">
        <div className="billboard-error-text">{error}</div>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="billboard-empty-container">
        <div className="billboard-empty-content">
          <div className="billboard-empty-username">{billboardUser?.name}</div>
          <div className="billboard-empty-message">표시할 이벤트가 없습니다.</div>
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
                className="billboard-image"
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
              className="billboard-youtube-container"
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
                  if (el) {
                    playerRefsRef.current[slideIndex] = el;
                    log(`[💾 메모리 관리] playerRefsRef[${slideIndex}] = Player 참조 저장`);
                  } else {
                    playerRefsRef.current[slideIndex] = null;
                    log(`[💾 메모리 관리] playerRefsRef[${slideIndex}] = null (참조 해제)`);
                  }
                }}
                videoId={videoInfo.videoId}
                slideIndex={slideIndex}
                isVisible={isVisible}
                apiReady={youtubeApiReady}
                onPlayingCallback={handleVideoPlaying}
                onEndedCallback={handleVideoEnded}
                onPlayerError={handlePlayerError}
              />
            </div>
          </>
        ) : (
          /* === 일반 이미지 === */
          imageUrl && isVisible && (
            <img
              src={imageUrl}
              alt={event.title}
              className="billboard-image"
              style={{ backgroundColor: "#000" }}
              loading="lazy"
              onLoad={() => {
                log(`[🖼️ 이미지] 슬라이드 ${slideIndex} - 이미지 로드 완료`, {
                  imageUrl: imageUrl.substring(0, 50) + '...',
                  타입: '일반 이미지'
                });
              }}
            />
          )
        )}

        {/* === 정보 레이어 === */}
        {isVisible && (
          <>
            <div
              className="billboard-top-info"
              style={{
                width: "100%",
                padding: "0 42px",
                top: "0",
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
                  className="billboard-progress-container"
                  style={{
                    width: `${96 * scale}px`,
                    height: `${96 * scale}px`,
                  }}
                >
                  {/* 펄스 링 (외부) - 부하 1%, CSS animation만 사용 */}
                  <div
                    className="billboard-pulse-outer"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.15)',
                      animation: 'billboard-pulse 3s ease-in-out infinite',
                    }}
                  />
                  {/* 펄스 링 (내부) */}
                  <div
                    className="billboard-pulse-inner"
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
                    className="billboard-slide-number"
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
                className="billboard-status-badge"
                style={{ position: "relative", width: "max-content" }}
              >
                {realtimeStatus}
              </div>
            </div>

            {/* 하단 정보 레이어 */}
            <div
              key={`info-${event.id}-${slideIndex}`}
              className={`billboard-bottom-info ${(event.show_title_on_billboard ?? true) ? 'info-background' : ''}`}
              style={{
                paddingLeft: `${32 * scale}px`,
                paddingRight: `${32 * scale}px`,
                paddingBottom: `${40 * scale}px`,
                paddingTop: `${80 * scale}px`, // 그라데이션 영역 확보
                zIndex: 10,
              }}
            >
              {(event.show_title_on_billboard ?? true) && (
                <>
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
                </>
              )}

              {/* 하단 정보: (제목 + 날짜/장소) + QR */}
              <div className={`billboard-info-wrapper ${(event.show_title_on_billboard ?? true) ? 'billboard-info-wrapper-between' : 'billboard-info-wrapper-end'}`}>
                {/* 왼쪽 정보: 제목, 날짜, 장소 (조건부 렌더링) */}
                {(event.show_title_on_billboard ?? true) && (
                  <div className="billboard-text-info">
                    {/* 제목 */}
                    <h3
                      className="billboard-title"
                      style={{
                        fontSize: `${titleFontSize}px`,
                        lineHeight: 1.2,
                        wordBreak: "keep-all",
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 3, // 최대 3줄까지 표시
                        WebkitBoxOrient: "vertical",
                        animation: `zoomInUp 1.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards`,
                        opacity: 0,
                        transform: `scale(0.2) translateY(${titleFontSize * 2}px) rotate(-15deg)`,
                      }}
                    >
                      {event.title}
                    </h3>

                    {/* 날짜 */}
                    {event.start_date && (
                      <div
                        className="billboard-date"
                        style={{
                          fontSize: `${dateLocationFontSize}px`,
                          lineHeight: 1.2,
                          animation: `slideInLeft 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards`,
                          opacity: 0,
                          transform: `translateX(-${dateLocationFontSize * 5}px) rotate(-8deg)`,
                        }}
                      >
                        <i className="ri-calendar-line billboard-date-icon" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                        {formatDateRange(event.start_date, event.end_date)}
                      </div>
                    )}
                    {/* 장소 */}
                    {event.location && event.location.trim() && event.location !== "미정" && (
                      <div
                        className="billboard-location"
                        style={{
                          fontSize: `${dateLocationFontSize}px`,
                          lineHeight: 1.2,
                          animation: `slideInRight 1s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s forwards`,
                          opacity: 0,
                          transform: `translateX(${dateLocationFontSize * 5}px) rotate(8deg)`,
                        }}
                      >
                        <i className="ri-map-pin-line billboard-location-icon" style={{ marginRight: `${dateLocationFontSize * 0.3}px` }}></i>
                        {event.location}
                      </div>
                    )}
                  </div>
                )}

                {/* QR 코드 */}
                <div
                  className="billboard-qr-container"
                  style={{
                    filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.7))",
                  }}
                >
                  <p
                    className="billboard-qr-label"
                    style={{
                      fontSize: `${Math.max(12, qrSize * 0.15)}px`,
                      marginBottom: `${qrSize * 0.05}px`,
                      width: `${Math.round(qrSize)}px`,
                      whiteSpace: "nowrap",
                      textShadow: "0 2px 4px rgba(0, 0, 0, 0.8)",
                    }}
                  >
                    등록 + 상세
                  </p>
                  <div
                    className="billboard-qr-wrapper"
                    style={{ padding: `${qrSize * 0.08}px` }}
                  >
                    <QRCodeCanvas
                      value={`${window.location.origin}/v2?event=${event.id}&category=${event.category}&from=qr`}
                      size={Math.round(qrSize)}
                      level="M"
                      includeMargin={false}
                    />
                  </div>
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
        .info-background {
          background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.7) 40%, transparent 100%);
        }
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
      <div className="billboard-page" style={{
        overflow: 'hidden',
        width: '100vw',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
      }}>
        {/* 현재 + 다음 슬라이드만 DOM에 유지 (부드러운 전환 + 메모리 최적화) */}
        {events.map((event, index) => {
          // 현재 + 다음 슬라이드 렌더링 (마지막 5초 전에 다음 슬라이드 미리 로드)
          const shouldRender = index === currentIndex || index === nextSlideIndex;

          // ✅ 로그: 렌더링 판단
          if (shouldRender) {
            log(`[🎬 렌더링] 슬라이드 ${index} 렌더링 중 - currentIndex: ${currentIndex}, nextSlideIndex: ${nextSlideIndex}, 역할: ${index === currentIndex ? '현재' : '다음'}`);
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
