import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../../lib/supabase';
import type { BillboardUser, BillboardUserSettings, Event } from '../../lib/supabase';
import { parseVideoUrl } from '../../utils/videoEmbed';

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

  useEffect(() => {
    if (!userId) {
      setError('빌보드 사용자 ID가 없습니다.');
      setIsLoading(false);
      return;
    }

    loadBillboardData();

    // Realtime 구독 설정
    const eventsChannel = supabase
      .channel('billboard-events-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          console.log('🔥 이벤트 변경 감지 - 페이지 새로고침');
          window.location.reload();
        }
      )
      .subscribe((status) => {
        console.log('📡 이벤트 채널 상태:', status);
      });

    const settingsChannel = supabase
      .channel('billboard-settings-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'billboard_user_settings' },
        (payload) => {
          console.log('⚙️ 설정 변경 감지 - userId:', userId);
          if (payload.new.billboard_user_id === userId) {
            console.log('✅ 현재 빌보드 설정 변경 - 페이지 새로고침');
            window.location.reload();
          }
        }
      )
      .subscribe((status) => {
        console.log('📡 설정 채널 상태:', status);
      });

    // 클린업
    return () => {
      supabase.removeChannel(eventsChannel);
      supabase.removeChannel(settingsChannel);
    };
  }, [userId]);

  const loadBillboardData = async () => {
    try {
      const { data: user, error: userError } = await supabase
        .from('billboard_users')
        .select('*')
        .eq('id', userId)
        .eq('is_active', true)
        .single();

      if (userError) throw new Error('빌보드 사용자를 찾을 수 없습니다.');
      setBillboardUser(user);

      const { data: userSettings, error: settingsError } = await supabase
        .from('billboard_user_settings')
        .select('*')
        .eq('billboard_user_id', userId)
        .single();

      if (settingsError) throw new Error('빌보드 설정을 불러올 수 없습니다.');
      setSettings(userSettings);

      const { data: allEvents, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .order('start_date', { ascending: true });

      if (eventsError) throw eventsError;

      const filteredEvents = filterEvents(allEvents || [], userSettings);
      setEvents(filteredEvents);
      
      // 랜덤 모드면 초기 재생목록 생성
      if (userSettings.play_order === 'random' && filteredEvents.length > 0) {
        const indices = filteredEvents.map((_, i) => i);
        setShuffledPlaylist(shuffleArray(indices));
        playlistIndexRef.current = 0;
        setCurrentIndex(0);
      }
      
      setIsLoading(false);
    } catch (err: any) {
      console.error('빌보드 데이터 로드 실패:', err);
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
      setIsLoading(false);
    }
  };

  const filterEvents = (allEvents: Event[], settings: BillboardUserSettings): Event[] => {
    return allEvents.filter((event) => {
      if (!event.image_full && !event.image && !event.video_url) return false;

      if (settings.excluded_event_ids.includes(event.id)) return false;

      const eventDate = new Date(event.start_date || event.date || '');
      const weekday = eventDate.getDay();
      if (settings.excluded_weekdays.includes(weekday)) return false;

      if (settings.date_filter_start) {
        const startDate = new Date(settings.date_filter_start);
        if (eventDate < startDate) return false;
      }

      if (settings.date_filter_end) {
        const endDate = new Date(settings.date_filter_end);
        if (eventDate > endDate) return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const eventEndDate = new Date(event.end_date || event.start_date || event.date || '');
      if (eventEndDate < today) return false;

      return true;
    });
  };

  useEffect(() => {
    if (!settings || events.length === 0) return;

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }

    setProgress(0);

    const progressStep = (50 / settings.auto_slide_interval) * 100;
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          return 0;
        }
        return prev + progressStep;
      });
    }, 50);

    const interval = setInterval(() => {
      setProgress(0);
      if (settings.play_order === 'random') {
        // 셔플된 재생목록 사용
        const currentPlaylist = shuffledPlaylist;
        const nextPlaylistIdx = (playlistIndexRef.current + 1) % currentPlaylist.length;
        playlistIndexRef.current = nextPlaylistIdx;
        
        // 재생목록 끝에 도달하면 새로 셔플
        if (nextPlaylistIdx === 0 && currentPlaylist.length > 0) {
          const newPlaylist = shuffleArray(currentPlaylist);
          setShuffledPlaylist(newPlaylist);
          setCurrentIndex(newPlaylist[0] || 0);
        } else {
          setCurrentIndex(currentPlaylist[nextPlaylistIdx] || 0);
        }
      } else {
        setCurrentIndex((prev) => (prev + 1) % events.length);
      }
    }, settings.auto_slide_interval);

    return () => {
      clearInterval(interval);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [events, settings, shuffledPlaylist]);

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
    const startMonth = String(start.getMonth() + 1).padStart(2, '0');
    const endMonth = String(end.getMonth() + 1).padStart(2, '0');
    const startDay = String(start.getDate()).padStart(2, '0');
    const endDay = String(end.getDate()).padStart(2, '0');

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
  const renderSlide = (event: any, isVisible: boolean, preload: boolean = false) => {
    const imageUrl = event.image_full || event.image;
    const videoUrl = event.video_url;
    const videoInfo = videoUrl ? parseVideoUrl(videoUrl) : null;

    return (
      <div 
        className="portrait-container"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) rotate(90deg)`,
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? 'auto' : 'none',
          transition: `opacity ${settings?.transition_duration || 500}ms ease-in-out`,
          zIndex: isVisible ? 2 : 1
        }}
      >
        {videoInfo?.embedUrl ? (
          <iframe
            key={`video-${event.id}`}
            src={`${videoInfo.embedUrl}&rel=0&modestbranding=1&playsinline=1&vq=small`}
            className="w-full h-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
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
            <div className="absolute top-6 left-6">
              {events.length > 1 && (
                <div className="relative w-24 h-24">
                  <svg className="transform -rotate-90 w-24 h-24">
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      stroke="rgba(255, 255, 255, 0.2)"
                      strokeWidth="6"
                      fill="none"
                    />
                    <circle
                      cx="48"
                      cy="48"
                      r="42"
                      stroke="white"
                      strokeWidth="6"
                      fill="none"
                      strokeDasharray="264"
                      strokeDashoffset={264 - (264 * progress) / 100}
                      style={{ transition: 'stroke-dashoffset 0.05s linear' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white text-xl font-bold">
                      {currentIndex + 1}/{events.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent px-8 py-10 flex items-end justify-between">
              <div className="flex-1">
                <div className="mb-2 space-y-1">
                  {event.start_date && (
                    <div className="text-blue-400 text-lg font-semibold">
                      <i className="ri-calendar-line mr-2"></i>
                      {formatDateRange(event.start_date, event.end_date)}
                    </div>
                  )}
                  {event.location && event.location.trim() && event.location !== '미정' && (
                    <div className="text-gray-300 text-lg">
                      <i className="ri-map-pin-line mr-2"></i>
                      {event.location}
                    </div>
                  )}
                </div>
                <h3 className="text-white text-4xl font-bold">{event.title}</h3>
              </div>
              
              <div className="bg-white p-3 rounded-lg ml-6 flex-shrink-0">
                <QRCodeCanvas
                  value={`${window.location.origin}/?event=${event.id}&from=qr`}
                  size={120}
                  level="M"
                  includeMargin={false}
                />
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
      
      <div className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center">
        {/* 현재 슬라이드 */}
        {renderSlide(currentEvent, true)}
        
        {/* tvbro용 프리로드 영역: 화면 밖에서 실제로 로드 (낮은 화질) */}
        <div 
          className="fixed"
          style={{
            top: '-9999px',
            left: '-9999px',
            width: '100vh',
            height: '100vw',
            pointerEvents: 'none'
          }}
        >
          {events.map((event, idx) => {
            // 현재 슬라이드가 아니고 비디오가 있는 경우만 미리 로드
            if (idx !== currentIndex && event.video_url) {
              const videoInfo = parseVideoUrl(event.video_url);
              if (videoInfo?.embedUrl) {
                return (
                  <iframe
                    key={`preload-${event.id}`}
                    src={`${videoInfo.embedUrl}&rel=0&modestbranding=1&playsinline=1&vq=small`}
                    style={{
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      border: 'none'
                    }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  />
                );
              }
            }
            return null;
          })}
        </div>

        <style>{`
          .portrait-container {
            position: relative;
            width: 100vh;
            height: 100vw;
          }
        `}</style>
      </div>
    </>
  );
}
