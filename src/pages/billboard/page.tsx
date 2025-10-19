import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { BillboardUser, BillboardUserSettings, Event } from '../../lib/supabase';

export default function BillboardPage() {
  const { userId } = useParams<{ userId: string }>();
  const [billboardUser, setBillboardUser] = useState<BillboardUser | null>(null);
  const [settings, setSettings] = useState<BillboardUserSettings | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setError('빌보드 사용자 ID가 없습니다.');
      setIsLoading(false);
      return;
    }

    loadBillboardData();
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
      setIsLoading(false);
    } catch (err: any) {
      console.error('빌보드 데이터 로드 실패:', err);
      setError(err.message || '데이터를 불러오는데 실패했습니다.');
      setIsLoading(false);
    }
  };

  const filterEvents = (allEvents: Event[], settings: BillboardUserSettings): Event[] => {
    return allEvents.filter((event) => {
      if (!event.image_full && !event.image) return false;

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

    const interval = setInterval(() => {
      if (settings.play_order === 'random') {
        setCurrentIndex(Math.floor(Math.random() * events.length));
      } else {
        setCurrentIndex((prev) => (prev + 1) % events.length);
      }
    }, settings.auto_slide_interval);

    return () => clearInterval(interval);
  }, [events, settings]);

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

  const currentEvent = events[currentIndex];
  const imageUrl = currentEvent.image_full || currentEvent.image;

  return (
    <div className="fixed inset-0 bg-black overflow-hidden portrait-billboard">
      <div className="relative w-full h-full flex items-center justify-center">
        <img
          src={imageUrl}
          alt={currentEvent.title}
          className="w-full h-full object-contain"
          style={{ transition: `opacity ${settings?.transition_duration || 500}ms ease-in-out` }}
        />

        <div className="absolute top-8 left-8 bg-black/70 backdrop-blur-sm rounded-lg p-4">
          <h2 className="text-white text-2xl font-bold">{billboardUser?.name}</h2>
          <p className="text-gray-300 text-sm mt-1">
            {currentIndex + 1} / {events.length}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-8">
          <h3 className="text-white text-3xl font-bold mb-2">{currentEvent.title}</h3>
          <div className="flex items-center gap-6 text-gray-300 text-lg">
            {currentEvent.time && (
              <div className="flex items-center gap-2">
                <i className="ri-time-line"></i>
                <span>{currentEvent.time}</span>
              </div>
            )}
            {currentEvent.location && (
              <div className="flex items-center gap-2">
                <i className="ri-map-pin-line"></i>
                <span>{currentEvent.location}</span>
              </div>
            )}
            {currentEvent.price && (
              <div className="flex items-center gap-2">
                <i className="ri-price-tag-3-line"></i>
                <span>{currentEvent.price}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .portrait-billboard {
          width: 1080px;
          height: 1920px;
          max-width: 100vw;
          max-height: 100vh;
        }

        @media (orientation: landscape) {
          .portrait-billboard {
            width: 100vh;
            height: 100vw;
            transform: rotate(0deg);
          }
        }
      `}</style>
    </div>
  );
}
