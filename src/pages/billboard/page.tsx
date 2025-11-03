import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import { supabase } from "../../lib/supabase";
import type {
  BillboardUser,
  BillboardUserSettings,
  Event,
} from "../../lib/supabase";
import { parseVideoUrl } from "../../utils/videoEmbed";

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
  const [billboardUser, setBillboardUser] = useState<BillboardUser | null>(
    null,
  );
  const [settings, setSettings] = useState<BillboardUserSettings | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const progressAnimationRef = useRef<number | null>(null);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<number[]>([]);
  const playlistIndexRef = useRef(0);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("연결중...");
  
  // 해상도 기반 스케일 계산 (기준: 1080px = 1.0배)
  const [scale, setScale] = useState(1);
  
  // 비디오 iframe 로딩 상태
  const [videoLoaded, setVideoLoaded] = useState<Record<string, boolean>>({});
  const [loadTimes, setLoadTimes] = useState<number[]>([]);
  const loadStartTimeRef = useRef<number>(0);
  const videoPlayTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 화면 해상도에 따른 스케일 조정
  useEffect(() => {
    const updateScale = () => {
      const height = window.innerHeight;
      // 720px = 0.8배, 1080px = 1.2배, 1440px = 1.6배, 2160px = 2.4배
      const calculatedScale = Math.max(0.6, Math.min(3.0, height / 900));
      setScale(calculatedScale);
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    window.addEventListener('orientationchange', updateScale);

    return () => {
      window.removeEventListener('resize', updateScale);
      window.removeEventListener('orientationchange', updateScale);
    };
  }, []);

  // 모바일 주소창 숨기기
  useEffect(() => {
    // 스크롤 트릭으로 주소창 숨기기
    const hideAddressBar = () => {
      window.scrollTo(0, 1);
    };

    // 페이지 로드 후 실행
    setTimeout(hideAddressBar, 100);
    setTimeout(hideAddressBar, 500);
    setTimeout(hideAddressBar, 1000);

    // 화면 회전 시에도 실행
    window.addEventListener("orientationchange", hideAddressBar);

    return () => {
      window.removeEventListener("orientationchange", hideAddressBar);
    };
  }, []);

  useEffect(() => {
    if (billboardUser?.name) {
      document.title = `댄싱조이 - ${billboardUser.name} 빌보드`;
    }
    
    return () => {
      document.title = "광고판 - Event Discovery Platform";
    };
  }, [billboardUser]);

  useEffect(() => {
    if (!userId) {
      setError("빌보드 사용자 ID가 없습니다.");
      setIsLoading(false);
      return;
    }

    loadBillboardData();

    // Realtime 구독 설정
    const eventsChannel = supabase
      .channel("billboard-events-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          setRealtimeStatus("이벤트 변경 감지!");
          loadBillboardData();
          setTimeout(() => setRealtimeStatus("연결됨"), 3000);
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(`데이터: ${status}`);
      });

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
      .subscribe((status) => {
        setRealtimeStatus(`설정: ${status}`);
      });

    // 🚀 배포 감지 (Realtime) - 새 배포 시 즉시 새로고침!
    const deployChannel = supabase
      .channel("deploy-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deployments" },
        (payload) => {
          console.log('🚀 새 배포 감지!', payload);
          let countdown = 5;
          setRealtimeStatus(`🚀 새 배포! ${countdown}초 후 새로고침...`);
          
          const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
              setRealtimeStatus(`🚀 새 배포! ${countdown}초 후 새로고침...`);
            } else {
              clearInterval(countdownInterval);
            }
          }, 1000);
          
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        },
      )
      .subscribe((status) => {
        setRealtimeStatus(`배포: ${status}`);
      });

    // 클린업
    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(deployChannel);
    };
  }, [userId]);

  const loadBillboardData = async () => {
    try {
      // 🔧 데이터 리로드 전 모든 타이머 정리 (메모리 누수 방지)
      console.log('[빌보드] 데이터 리로드: 기존 타이머 정리 중...');
      if (videoPlayTimeoutRef.current) {
        clearTimeout(videoPlayTimeoutRef.current);
        videoPlayTimeoutRef.current = null;
      }
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
      setSettings(userSettings);

      const { data: allEvents, error: eventsError } = await supabase
        .from("events")
        .select("*")
        .order("start_date", { ascending: true });

      if (eventsError) throw eventsError;

      const filteredEvents = filterEvents(allEvents || [], userSettings);
      
      console.log('[빌보드] 필터링 완료:', filteredEvents.length, '개');
      filteredEvents.forEach((e, i) => {
        console.log(`  [${i}] ID:${e.id} ${e.title}`);
      });

      // 🔧 이벤트 수 변경 시 안전하게 인덱스 조정
      if (filteredEvents.length === 0) {
        console.log('[빌보드] ⚠️ 표시할 이벤트가 없습니다');
        setEvents([]);
        setCurrentIndex(0);
        setShuffledPlaylist([]);
      } else {
        setEvents(filteredEvents);
        
        // 현재 인덱스가 범위를 벗어나면 0으로 리셋
        const safeIndex = currentIndex >= filteredEvents.length ? 0 : currentIndex;
        
        // 랜덤 모드면 초기 재생목록 생성 (인덱스 배열을 섞음)
        if (userSettings.play_order === "random") {
          const indices = Array.from(
            { length: filteredEvents.length },
            (_, i) => i,
          );
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
  };

  const filterEvents = (
    allEvents: Event[],
    settings: BillboardUserSettings,
  ): Event[] => {
    console.log('[빌보드 필터링] 시작:', {
      excluded_event_ids: settings.excluded_event_ids,
      excluded_weekdays: settings.excluded_weekdays,
      date_filter_start: settings.date_filter_start,
      date_filter_end: settings.date_filter_end,
      total_events: allEvents.length
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const filtered = allEvents.filter((event) => {
      // 이미지/영상 없는 이벤트 제외
      if (!event?.image_full && !event?.image && !event?.video_url) {
        console.log('[필터] 미디어 없음:', event?.id, event?.title);
        return false;
      }

      // ID 필터
      if (settings.excluded_event_ids.includes(event.id)) {
        console.log('[필터] ID 제외:', event.id, event.title);
        return false;
      }

      // 요일 필터
      const eventDate = new Date(event.start_date || event.date || "");
      const weekday = eventDate.getDay();
      const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
      if (settings.excluded_weekdays.includes(weekday)) {
        console.log('[필터] 요일 제외:', event.id, event.title, `${weekdayNames[weekday]}요일(${weekday})`);
        return false;
      }

      // 날짜 범위 필터
      if (settings.date_filter_start) {
        const startDate = new Date(settings.date_filter_start);
        if (eventDate < startDate) {
          console.log('[필터] 시작일 이전:', event.id, event.title, eventDate.toISOString().split('T')[0], '<', settings.date_filter_start);
          return false;
        }
      }

      if (settings.date_filter_end) {
        const endDate = new Date(settings.date_filter_end);
        if (eventDate > endDate) {
          console.log('[필터] 종료일 이후:', event.id, event.title, eventDate.toISOString().split('T')[0], '>', settings.date_filter_end);
          return false;
        }
      }

      // 과거 이벤트 제외 (단, 날짜 범위 필터가 설정되지 않은 경우에만)
      // 관리자가 날짜 범위를 명시적으로 설정했다면 과거 이벤트도 허용
      if (!settings.date_filter_start && !settings.date_filter_end) {
        const eventEndDate = new Date(
          event.end_date || event.start_date || event.date || "",
        );
        if (eventEndDate < today) {
          console.log('[필터] 과거 이벤트:', event.id, event.title, eventEndDate.toISOString().split('T')[0], '<', today.toISOString().split('T')[0]);
          return false;
        }
      }

      return true;
    });

    console.log('[빌보드 필터링] 완료:', {
      원본: allEvents.length,
      필터링후: filtered.length,
      제외됨: allEvents.length - filtered.length
    });

    return filtered;
  };

  useEffect(() => {
    if (!settings || events.length === 0) return;

    const currentEvent = events[currentIndex];
    const hasVideo = currentEvent?.video_url && parseVideoUrl(currentEvent.video_url)?.embedUrl;

    // 기존 타이머 정리
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    if (progressAnimationRef.current) {
      cancelAnimationFrame(progressAnimationRef.current);
    }
    if (videoPlayTimeoutRef.current) {
      clearTimeout(videoPlayTimeoutRef.current);
    }

    setProgress(0);

    // requestAnimationFrame 기반 progress 업데이트 (GPU 최적화)
    let startTime = Date.now();
    const duration = settings.auto_slide_interval;
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / duration) * 100, 100);
      
      setProgress(newProgress);
      
      if (newProgress < 100) {
        progressAnimationRef.current = requestAnimationFrame(updateProgress);
      }
    };
    
    progressAnimationRef.current = requestAnimationFrame(updateProgress);

    // 영상이 아닌 경우만 일반 타이머 사용
    let interval: NodeJS.Timeout | null = null;
    
    if (!hasVideo) {
      interval = setInterval(() => {
        setProgress(0);
        if (settings.play_order === "random") {
          const nextPlaylistIdx = playlistIndexRef.current + 1;

          if (nextPlaylistIdx >= shuffledPlaylist.length) {
            const newIndices = Array.from({ length: events.length }, (_, i) => i);
            const newPlaylist = shuffleArray(newIndices);
            setShuffledPlaylist(newPlaylist);
            playlistIndexRef.current = 0;
            setCurrentIndex(newPlaylist[0] || 0);
          } else {
            playlistIndexRef.current = nextPlaylistIdx;
            setCurrentIndex(shuffledPlaylist[nextPlaylistIdx] || 0);
          }
        } else {
          setCurrentIndex((prev) => (prev + 1) % events.length);
        }
      }, settings.auto_slide_interval);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (progressAnimationRef.current) {
        cancelAnimationFrame(progressAnimationRef.current);
      }
      if (videoPlayTimeoutRef.current) {
        clearTimeout(videoPlayTimeoutRef.current);
      }
    };
  }, [events, settings, shuffledPlaylist, currentIndex]);

  // 영상 타이머 시작 함수 (중복 실행 방지)
  const startVideoTimerRef = useRef<(() => void) | undefined>(undefined);
  startVideoTimerRef.current = () => {
    if (!settings) return;
    
    // 이미 타이머가 실행 중이면 중복 실행 방지
    if (videoPlayTimeoutRef.current) {
      console.log('[빌보드] 타이머 이미 실행 중, 스킵');
      return;
    }

    const playDuration = settings.video_play_duration || 10000;
    console.log('[빌보드] 영상 로딩 완료! 타이머 시작:', playDuration / 1000, '초');
    
    // 기존 progress animation 정리
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    if (progressAnimationRef.current) {
      cancelAnimationFrame(progressAnimationRef.current);
    }

    // requestAnimationFrame 기반 progress 업데이트 (GPU 최적화)
    setProgress(0);
    let startTime = Date.now();
    
    const updateVideoProgress = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / playDuration) * 100, 100);
      
      setProgress(newProgress);
      
      if (newProgress < 100) {
        progressAnimationRef.current = requestAnimationFrame(updateVideoProgress);
      }
    };
    
    progressAnimationRef.current = requestAnimationFrame(updateVideoProgress);

    // 영상 로딩 완료 시점부터 정확히 설정된 시간 후 다음 슬라이드
    videoPlayTimeoutRef.current = setTimeout(() => {
      console.log('[빌보드] 영상 재생 완료! 다음 슬라이드로 전환');
      
      // 타이머 완료 후 ref 초기화 (중요!)
      videoPlayTimeoutRef.current = null;
      
      setProgress(0);
      if (settings.play_order === "random") {
        const nextPlaylistIdx = playlistIndexRef.current + 1;

        if (nextPlaylistIdx >= shuffledPlaylist.length) {
          const newIndices = Array.from({ length: events.length }, (_, i) => i);
          const newPlaylist = shuffleArray(newIndices);
          setShuffledPlaylist(newPlaylist);
          playlistIndexRef.current = 0;
          const newIndex = newPlaylist[0] || 0;
          console.log('[빌보드] 재생목록 리셋, 새 인덱스:', newIndex);
          setCurrentIndex(newIndex);
        } else {
          playlistIndexRef.current = nextPlaylistIdx;
          const newIndex = shuffledPlaylist[nextPlaylistIdx] || 0;
          console.log('[빌보드] 랜덤 다음:', nextPlaylistIdx, '→ 인덱스:', newIndex);
          setCurrentIndex(newIndex);
        }
      } else {
        setCurrentIndex((prev) => {
          const next = (prev + 1) % events.length;
          console.log('[빌보드] 순차 전환:', prev, '→', next);
          return next;
        });
      }
    }, playDuration);
  };

  // 슬라이드 변경 시 비디오 로딩 상태 리셋 & 로딩 시작 시간 기록
  useEffect(() => {
    const currentEvent = events[currentIndex];
    console.log('[빌보드] 슬라이드 변경:', currentIndex, '/', events.length - 1, '→', currentEvent?.title || '없음');
    setVideoLoaded({});
    loadStartTimeRef.current = Date.now();
  }, [currentIndex]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-2xl">로딩 중...</div>
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

  // 날짜 포맷 함수
  const formatDateRange = (startDate: string, endDate?: string | null) => {
    if (!endDate || startDate === endDate) {
      return startDate;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    const startMonth = String(start.getMonth() + 1).padStart(2, "0");
    const endMonth = String(end.getMonth() + 1).padStart(2, "0");
    const startDay = String(start.getDate()).padStart(2, "0");
    const endDay = String(end.getDate()).padStart(2, "0");

    // 같은 년도
    if (startYear === endYear) {
      // 같은 월
      if (startMonth === endMonth) {
        return `${startYear}-${startMonth}-${startDay}~${endDay}`;
      }
      // 다른 월
      return `${startYear}-${startMonth}-${startDay}~${endMonth}-${endDay}`;
    }

    // 다른 년도
    return `${startYear}-${startMonth}-${startDay}~${endYear}-${endMonth}-${endDay}`;
  };

  // 슬라이드 렌더링 함수
  const renderSlide = (
    event: any,
    isVisible: boolean,
    slideIndex: number,
    preload: boolean = false,
  ) => {
    const imageUrl = event?.image_full || event?.image;
    const videoUrl = event?.video_url;
    const videoInfo = videoUrl ? parseVideoUrl(videoUrl) : null;
    const isLoaded = videoLoaded[event.id] || false;

    return (
      <div
        className="portrait-container"
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: `translate(-50%, -50%) rotate(90deg)`,
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? "auto" : "none",
          transition: `opacity ${settings?.transition_duration || 500}ms ease-in-out`,
          zIndex: isVisible ? 2 : 1,
        }}
      >
        {videoInfo?.embedUrl ? (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* 비디오 iframe - URL 변경 시 remount */}
            <iframe
              key={`video-${event.id}-${videoInfo.embedUrl}`}
              src={videoInfo.embedUrl}
              className="w-full h-full"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={event.title}
              onLoad={() => {
                const loadTime = Date.now() - loadStartTimeRef.current;
                
                // 로딩 시간 기록 (최근 5개 평균 사용)
                setLoadTimes(prev => {
                  const updated = [...prev, loadTime];
                  return updated.slice(-5);
                });
                
                // 평균 로딩 시간 계산 (최소 1초, 최대 5초)
                const avgLoadTime = loadTimes.length > 0
                  ? Math.min(5000, Math.max(1000, loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length))
                  : 3000;
                
                setTimeout(() => {
                  setVideoLoaded(prev => ({ ...prev, [event.id]: true }));
                  startVideoTimerRef.current?.();
                }, avgLoadTime);
              }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
              }}
            />
            
            {/* 썸네일 오버레이 (로딩 중) - 사용자가 등록한 이미지 사용 */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                opacity: isLoaded ? 0 : 1,
                transition: 'opacity 1s ease-in-out',
                pointerEvents: isLoaded ? 'none' : 'auto',
                zIndex: 2,
              }}
            >
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt={event.title}
                  loading="lazy"
                  className="w-full h-full object-cover"
                  style={{ backgroundColor: '#000' }}
                />
              )}
            </div>
            
          </div>
        ) : (
          <img
            src={imageUrl}
            alt={event.title}
            className="w-full h-full object-contain"
            loading={preload ? "eager" : "lazy"}
          />
        )}

        {isVisible && (
          <>
            <div 
              className="absolute" 
              style={{ 
                width: '100%',
                padding: '0 42px',
                top: '20.0267px',
                zIndex: 10,
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignContent: 'space-between',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              {events.length > 1 && (
                <div 
                  className="relative" 
                  style={{ 
                    width: `${96 * scale}px`, 
                    height: `${96 * scale}px`
                  }}
                >
                  <svg 
                    className="transform -rotate-90" 
                    style={{ 
                      width: `${96 * scale}px`, 
                      height: `${96 * scale}px`
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
                      strokeDashoffset={(264 * scale) - ((264 * scale) * progress) / 100}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span 
                      className="text-white font-bold" 
                      style={{ 
                        fontSize: `${20 * scale}px`
                      }}
                    >
                      {currentIndex + 1}/{events.length}
                    </span>
                  </div>
                </div>
              )}
              
              {/* Realtime 상태 표시 */}
              <div 
                className="bg-black/70 text-white px-3 py-1 rounded text-xs"
                style={{ 
                  position: 'relative',
                  width: 'max-content'
                }}
              >
                {realtimeStatus}
              </div>
            </div>

            <div 
              key={`info-${event.id}-${slideIndex}`}
              className="absolute bottom-0 left-0 right-0"
              style={{ 
                paddingLeft: `${32 * scale}px`, 
                paddingRight: `${32 * scale}px`,
                paddingTop: `${40 * scale}px`,
                paddingBottom: `${40 * scale}px`,
                zIndex: 10,
                background: 'linear-gradient(to top, rgba(0, 0, 0, 0.8) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)'
              }}
            >

              <div className="flex items-end justify-between">
                <div className="flex-1" style={{ minWidth: 0, paddingRight: `${16 * scale}px` }}>
                  <div style={{ marginBottom: `${8 * scale}px`, display: 'flex', flexDirection: 'column', gap: `${4 * scale}px` }}>
                    {/* 날짜 - 애니메이션 제거 */}
                    {event.start_date && (
                      <div 
                        className="text-blue-400 font-semibold" 
                        style={{ 
                          fontSize: `${Math.max(24, Math.min(31 * scale, 216))}px`
                        }}
                      >
                        <i className="ri-calendar-line" style={{ marginRight: `${8 * scale}px` }}></i>
                        {formatDateRange(event.start_date, event.end_date)}
                      </div>
                    )}

                    {/* 장소 - 애니메이션 제거 */}
                    {event.location &&
                      event.location.trim() &&
                      event.location !== "미정" && (
                        <div 
                          className="text-gray-300" 
                          style={{ 
                            fontSize: `${Math.max(24, Math.min(31 * scale, 216))}px`
                          }}
                        >
                          <i className="ri-map-pin-line" style={{ marginRight: `${8 * scale}px` }}></i>
                          {event.location}
                        </div>
                      )}
                  </div>

                  {/* 제목 - 애니메이션 제거 */}
                  <h3 
                    className="text-white font-bold" 
                    style={{ 
                      fontSize: event.title.length > 30 
                        ? event.title.length > 50
                          ? `${Math.max(32, Math.min(40 * scale, 140))}px`
                          : `${Math.max(40, Math.min(50 * scale, 175))}px`
                        : `${Math.max(48, Math.min(62 * scale, 216))}px`,
                      lineHeight: 1.2,
                      wordBreak: 'keep-all',
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      width: '100%'
                    }}
                  >
                    {event.title}
                  </h3>
                </div>

                {/* QR 코드 - GPU 가속 제거 */}
                <div 
                  className="bg-white rounded-lg flex-shrink-0" 
                  style={{ 
                    padding: `${12 * scale}px`,
                    marginLeft: `${24 * scale}px`
                  }}
                >
                  <QRCodeCanvas
                    value={`${window.location.origin}/?event=${event.id}&from=qr`}
                    size={Math.round(144 * scale)}
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

  const currentEvent = events[currentIndex];

  return (
    <>
      {/* YouTube DNS prefetch 및 preconnect로 로딩 속도 개선 */}
      <link rel="dns-prefetch" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://www.youtube.com" />
      <link rel="preconnect" href="https://i.ytimg.com" />

      <div
        className="fixed inset-0 bg-black overflow-auto flex items-center justify-center"
        style={{ minHeight: "calc(100vh + 1px)" }}
      >
        {/* 현재 슬라이드만 렌더링 (메모리 최적화) */}
        {renderSlide(currentEvent, true, currentIndex)}

        <style>{`
          .portrait-container {
            position: relative;
            width: 100vh;
            height: 100vw;
          }
          
          /* 모바일 주소창 숨기기를 위한 추가 높이 */
          body {
            min-height: calc(100vh + 1px);
          }
        `}</style>
      </div>
    </>
  );
}
