import { useEffect, useState, useRef, useCallback } from "react";
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

// YouTube Player 컴포넌트 (컴포넌트 외부에 정의)
function YouTubePlayer({
  videoId,
  slideIndex,
  onPlayingCallback,
}: {
  videoId: string;
  slideIndex: number;
  onPlayingCallback: (index: number) => void;
}) {
  const playerRef = useRef<any>(null);
  const [apiReady, setApiReady] = useState(false);
  const hasCalledOnPlaying = useRef(false);

  // YouTube API 로드
  useEffect(() => {
    if (window.YT && window.YT.Player) {
      setApiReady(true);
      return;
    }

    window.onYouTubeIframeAPIReady = () => {
      console.log('[YouTube API] 준비 완료');
      setApiReady(true);
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode?.insertBefore(tag, firstScript);
    }
  }, []);

  // Player 생성
  useEffect(() => {
    if (!apiReady || !videoId || playerRef.current) return;

    const playerId = `yt-player-${slideIndex}`;
    console.log('[YouTube] Player 생성 시작:', playerId);
    
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
            autoplay: 1,
            mute: 1,
            loop: 1,
            playlist: videoId,
            controls: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            iv_load_policy: 3,
          },
          events: {
            onReady: (event: any) => {
              console.log('[YouTube] Player 준비 완료, 재생 시작:', slideIndex);
              event.target.playVideo();
            },
            onStateChange: (event: any) => {
              if (event.data === 1 && !hasCalledOnPlaying.current) {
                // 재생 중 - 한 번만 호출
                console.log('[YouTube] 재생 시작 감지:', slideIndex);
                hasCalledOnPlaying.current = true;
                onPlayingCallback(slideIndex);
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
    }, 300);

    return () => {
      clearTimeout(timer);
      if (playerRef.current?.destroy) {
        try {
          playerRef.current.destroy();
        } catch (e) {
          // 무시
        }
      }
      playerRef.current = null;
      hasCalledOnPlaying.current = false;
    };
  }, [apiReady, videoId, slideIndex, onPlayingCallback]);

  return <div id={`yt-player-${slideIndex}`} className="w-full h-full" />;
}

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
  const [events, setEvents] = useState<Event[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [shuffledPlaylist, setShuffledPlaylist] = useState<number[]>([]);
  const playlistIndexRef = useRef(0);
  const [realtimeStatus, setRealtimeStatus] = useState<string>("연결중...");
  const [pendingReload, setPendingReload] = useState(false);
  const pendingReloadTimeRef = useRef<number>(0);
  const scale = 1; // 고정 스케일 (원래 크기 유지)
  const [videoLoadedMap, setVideoLoadedMap] = useState<Record<number, boolean>>({}); // 비디오 로딩 상태

  // YouTube 재생 콜백 (useCallback으로 안정화)
  const handleVideoPlaying = useCallback((index: number) => {
    console.log('[빌보드] 영상 재생 감지:', index);
    setVideoLoadedMap(prev => ({ ...prev, [index]: true }));
  }, []);

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
        () => {
          setRealtimeStatus("이벤트 변경 감지!");
          loadBillboardData();
          setTimeout(() => setRealtimeStatus("연결됨"), 3000);
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

  const loadBillboardData = async () => {
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
  };

  const filterEvents = (
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
      if (settings.date_filter_start && eventDate < new Date(settings.date_filter_start))
        return false;
      if (settings.date_filter_end && eventDate > new Date(settings.date_filter_end))
        return false;
      if (!settings.date_filter_start && !settings.date_filter_end) {
        const eventEndDate = new Date(
          event.end_date || event.start_date || event.date || "",
        );
        if (eventEndDate < today) return false;
      }
      return true;
    });
  };

  // 슬라이드 전환 타이머
  useEffect(() => {
    if (!settings || events.length === 0) return;
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setProgress(0);
    const step = (50 / settings.auto_slide_interval) * 100;
    progressIntervalRef.current = setInterval(() => {
      setProgress((p) => (p >= 100 ? 0 : p + step));
    }, 50);

    const interval = setInterval(() => {
      setProgress(0);
      if (pendingReload) {
        setTimeout(() => window.location.reload(), 500);
        return;
      }
      setTimeout(() => {
        if (settings.play_order === "random") {
          const next = playlistIndexRef.current + 1;
          if (next >= shuffledPlaylist.length) {
            const newList = shuffleArray(
              Array.from({ length: events.length }, (_, i) => i),
            );
            setShuffledPlaylist(newList);
            playlistIndexRef.current = 0;
            setCurrentIndex(newList[0] ?? 0);
          } else {
            playlistIndexRef.current = next;
            setCurrentIndex(shuffledPlaylist[next] ?? 0);
          }
        } else {
          setCurrentIndex((prev) => (prev + 1) % events.length);
        }
      }, 500);
    }, settings.auto_slide_interval);

    return () => {
      clearInterval(interval);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [events, settings, shuffledPlaylist, currentIndex]);

  // 로딩/에러/빈 화면
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
          width: "100vh",
          height: "100vw",
          transform: `translate(-50%, -50%) rotate(90deg)`,
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
            {!videoLoaded && thumbnailUrl && (
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
                zIndex: videoLoaded ? 2 : 0,
                opacity: videoLoaded ? 1 : 0,
                transition: "opacity 0.8s ease-in-out",
              }}
            >
              <YouTubePlayer
                videoId={videoInfo.videoId}
                slideIndex={slideIndex}
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
                      style={{ transition: "stroke-dashoffset 0.05s linear" }}
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

              {/* 제목 + QR */}
              <div className="flex items-end justify-between">
                <div
                  className="flex-1"
                  style={{ minWidth: 0, paddingRight: `${8 * scale}px` }}
                >
                  <div
                    style={{
                      marginBottom: `${8 * scale}px`,
                      display: "flex",
                      flexDirection: "column",
                      gap: `${4 * scale}px`,
                    }}
                  >
                    {event.start_date && (
                      <div
                        className="text-blue-400 font-semibold"
                        style={{
                          fontSize: `${Math.max(24, Math.min(31 * scale, 216))}px`,
                          animation: `slideInLeft 1s cubic-bezier(0.34, 1.56, 0.64, 1) 1.5s forwards`,
                          opacity: 0,
                          transform: `translateX(-${150 * scale}px) rotate(-8deg)`,
                        }}
                      >
                        <i className="ri-calendar-line" style={{ marginRight: `${8 * scale}px` }}></i>
                        {formatDateRange(event.start_date, event.end_date)}
                      </div>
                    )}
                    {event.location && event.location.trim() && event.location !== "미정" && (
                      <div
                        className="text-gray-300"
                        style={{
                          fontSize: `${Math.max(24, Math.min(31 * scale, 216))}px`,
                          animation: `slideInRight 1s cubic-bezier(0.34, 1.56, 0.64, 1) 2.2s forwards`,
                          opacity: 0,
                          transform: `translateX(${150 * scale}px) rotate(8deg)`,
                        }}
                      >
                        <i className="ri-map-pin-line" style={{ marginRight: `${8 * scale}px` }}></i>
                        {event.location}
                      </div>
                    )}
                  </div>
                  <h3
                    className="text-white font-bold"
                    style={{
                      fontSize:
                        event.title.length > 60
                          ? `${Math.max(28, Math.min(36 * scale, 125))}px`
                          : event.title.length > 40
                          ? `${Math.max(32, Math.min(42 * scale, 145))}px`
                          : event.title.length > 25
                          ? `${Math.max(38, Math.min(48 * scale, 170))}px`
                          : `${Math.max(44, Math.min(56 * scale, 195))}px`,
                      lineHeight: 1.25,
                      wordBreak: "keep-all",
                      width: "100%",
                      overflow: "hidden",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      animation: `zoomInUp 1.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0s forwards`,
                      opacity: 0,
                      transform: `scale(0.2) translateY(${100 * scale}px) rotate(-15deg)`,
                    }}
                  >
                    {event.title}
                  </h3>
                </div>
                <div
                  className="bg-white rounded-lg flex-shrink-0"
                  style={{
                    padding: `${12 * scale}px`,
                    marginLeft: `${12 * scale}px`,
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
        {renderSlide(currentEvent, true, currentIndex)}
      </div>
    </>
  );
}

