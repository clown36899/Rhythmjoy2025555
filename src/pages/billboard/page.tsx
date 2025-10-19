import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
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
    <div className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center">
      <div className="portrait-container">
        <img
          src={imageUrl}
          alt={currentEvent.title}
          className="w-full h-full object-contain"
          style={{ transition: `opacity ${settings?.transition_duration || 500}ms ease-in-out` }}
        />

        <div className="absolute top-6 left-6 bg-black/70 backdrop-blur-sm rounded-lg px-6 py-4">
          <h2 className="text-white text-3xl font-bold">{billboardUser?.name}</h2>
          <p className="text-gray-300 text-lg mt-1">
            {currentIndex + 1} / {events.length}
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/90 to-transparent px-8 py-10 flex items-end justify-between">
          <div className="flex-1">
            <h3 className="text-white text-4xl font-bold">{currentEvent.title}</h3>
          </div>
          
          <div className="bg-white p-3 rounded-lg ml-6 flex-shrink-0">
            <QRCodeSVG
              value={`${window.location.origin}?event=${currentEvent.id}&from=qr`}
              size={120}
              level="M"
              includeMargin={false}
            />
          </div>
        </div>
      </div>

      <style>{`
        .portrait-container {
          position: relative;
          width: 100vh;
          height: 100vw;
          transform: rotate(90deg);
          transform-origin: center center;
        }
      `}</style>
    </div>
  );
}
