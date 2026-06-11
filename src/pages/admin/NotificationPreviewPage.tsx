import React from 'react';
import NotificationHistoryModal from '../../components/NotificationHistoryModal';
import { useAuth } from '../../contexts/AuthContext';
import { notificationStore } from '../../lib/notificationStore';
import type { NotificationRecord } from '../../lib/notificationStore';
import { supabase } from '../../lib/supabase';
import './NotificationPreviewPage.css';

type LocalEventPreview = {
  id: number | string;
  title: string;
  date?: string | null;
  start_date?: string | null;
  location?: string | null;
  category?: string | null;
  image?: string | null;
  image_micro?: string | null;
  image_thumbnail?: string | null;
  image_medium?: string | null;
  image_full?: string | null;
};

const LOCAL_SEED_FLAG = 'swingenjoy:admin-notification-preview-seeded:v1';

const fallbackImages = [
  '/uploads/images/event-posters/1780377362748_f2x3x/medium.webp',
  '/uploads/images/event-posters/1780122176681_8o4ku/medium.webp',
  '/uploads/images/event-posters/1780118349312_64f7a/medium.webp',
];

function isLocalRuntime() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function addDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getImage(event: LocalEventPreview, index = 0) {
  return (
    event.image_thumbnail ||
    event.image_medium ||
    event.image ||
    event.image_full ||
    event.image_micro ||
    fallbackImages[index % fallbackImages.length]
  );
}

function buildNotification(events: LocalEventPreview[]): NotificationRecord {
  const now = new Date().toISOString();
  const firstEvent = events[0];
  const items = events.map((event, index) => {
    const date = event.start_date || event.date || '';
    const location = event.location || '장소 정보 없음';
    return {
      eventId: String(event.id),
      title: event.title,
      body: `${date} · ${location}`,
      url: `/v2?id=${event.id}`,
      image: getImage(event, index),
      category: event.category || 'event',
      location,
      date,
    };
  });

  return {
    id: `local-admin-notification-${Date.now()}`,
    title: firstEvent?.title || '로컬 알림 테스트',
    body: firstEvent
      ? `${firstEvent.start_date || firstEvent.date || ''} · ${firstEvent.location || '장소 정보 없음'}`
      : '로컬 DB 테스트 알림',
    url: firstEvent ? `/v2?id=${firstEvent.id}` : '/v2',
    received_at: now,
    is_read: false,
    image: firstEvent ? getImage(firstEvent, 0) : fallbackImages[0],
    data: {
      localTest: true,
      adminOnly: true,
      category: firstEvent?.category || 'event',
      batchKey: `local-admin-preview-${Date.now()}`,
      items,
    },
  };
}

export default function NotificationPreviewPage() {
  const { isAdmin, isAuthCheckComplete, user } = useAuth();
  const [notifications, setNotifications] = React.useState<NotificationRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(true);
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [status, setStatus] = React.useState('관리자 권한 확인 중...');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isLocal = isLocalRuntime();

  const refreshNotifications = React.useCallback(async () => {
    const unread = await notificationStore.getUnread();
    setNotifications(unread as NotificationRecord[]);
  }, []);

  const createLocalDbPreview = React.useCallback(async () => {
    if (!isLocal || !isAdmin || isSeeding) return;

    setIsSeeding(true);
    setErrorMessage(null);
    setStatus('로컬 DB에 테스트 이벤트를 등록하는 중...');

    try {
      const { data: sampleImages } = await supabase
        .from('events')
        .select('image,image_micro,image_thumbnail,image_medium,image_full')
        .not('image', 'is', null)
        .limit(3);

      const imagePool = (sampleImages || []).map((event: any, index: number) => (
        event.image_medium ||
        event.image_thumbnail ||
        event.image ||
        event.image_full ||
        event.image_micro ||
        fallbackImages[index % fallbackImages.length]
      ));

      const rows = [
        {
          title: '관리자 알림 테스트 - 첫 이벤트',
          date: addDays(3),
          start_date: addDays(3),
          end_date: addDays(3),
          time: '19:30',
          location: '로컬 테스트홀 A',
          category: 'event',
          price: '테스트',
          image: imagePool[0] || fallbackImages[0],
          image_thumbnail: imagePool[0] || fallbackImages[0],
          image_medium: imagePool[0] || fallbackImages[0],
          image_full: imagePool[0] || fallbackImages[0],
          description: '관리자 전용 알림 리스트 검증을 위한 로컬 DB 테스트 이벤트입니다.',
          organizer: 'Local Admin Test',
          genre: '스윙',
          dance_scope: 'swing',
          dance_genre: 'swing',
          activity_type: 'event',
          dance_tags: ['local-test', 'notification'],
          show_title_on_billboard: false,
          user_id: user?.id || null,
        },
        {
          title: '관리자 알림 테스트 - 강습',
          date: addDays(5),
          start_date: addDays(5),
          end_date: addDays(5),
          time: '20:00',
          location: '로컬 테스트 스튜디오',
          category: 'class',
          price: '테스트',
          image: imagePool[1] || fallbackImages[1],
          image_thumbnail: imagePool[1] || fallbackImages[1],
          image_medium: imagePool[1] || fallbackImages[1],
          image_full: imagePool[1] || fallbackImages[1],
          description: '다건 알림 리스트에서 강습 카드가 이미지와 함께 보이는지 확인합니다.',
          organizer: 'Local Admin Test',
          genre: '스윙',
          dance_scope: 'swing',
          dance_genre: 'swing',
          activity_type: 'class',
          dance_tags: ['local-test', 'notification'],
          show_title_on_billboard: false,
          user_id: user?.id || null,
        },
        {
          title: '관리자 알림 테스트 - 소셜',
          date: addDays(7),
          start_date: addDays(7),
          end_date: addDays(7),
          time: '21:00',
          location: '로컬 테스트 바',
          category: 'social',
          price: '테스트',
          image: imagePool[2] || fallbackImages[2],
          image_thumbnail: imagePool[2] || fallbackImages[2],
          image_medium: imagePool[2] || fallbackImages[2],
          image_full: imagePool[2] || fallbackImages[2],
          description: '소셜도 이벤트와 동일하게 상세 모달로 연결되는지 확인합니다.',
          organizer: 'Local Admin Test',
          genre: '스윙',
          dance_scope: 'swing',
          dance_genre: 'swing',
          activity_type: 'social',
          dance_tags: ['local-test', 'notification'],
          show_title_on_billboard: false,
          user_id: user?.id || null,
        },
      ];

      const { data, error } = await supabase
        .from('events')
        .insert(rows)
        .select('id,title,date,start_date,location,category,image,image_micro,image_thumbnail,image_medium,image_full');

      if (error) throw error;
      const insertedEvents = (data || []) as LocalEventPreview[];
      if (!insertedEvents.length) {
        throw new Error('로컬 DB 테스트 이벤트가 생성되지 않았습니다.');
      }

      await notificationStore.upsertMany([buildNotification(insertedEvents)]);
      sessionStorage.setItem(LOCAL_SEED_FLAG, 'true');
      await refreshNotifications();
      setIsModalOpen(true);
      setStatus(`로컬 DB 이벤트 ${insertedEvents.length}개 등록 후 관리자 전용 알림 리스트를 생성했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setStatus('로컬 테스트 데이터 생성 실패');
    } finally {
      setIsSeeding(false);
    }
  }, [isAdmin, isLocal, isSeeding, refreshNotifications, user?.id]);

  React.useEffect(() => {
    if (!isAuthCheckComplete) return;
    if (!isLocal) {
      setStatus('이 페이지는 운영 DB 보호를 위해 localhost에서만 작동합니다.');
      return;
    }
    if (!isAdmin) {
      setStatus('관리자만 접근 가능한 테스트 페이지입니다.');
      return;
    }

    refreshNotifications();
    const shouldSeed = new URLSearchParams(window.location.search).get('seed') === '1';
    if (shouldSeed && sessionStorage.getItem(LOCAL_SEED_FLAG) !== 'true') {
      createLocalDbPreview();
    } else {
      setStatus('관리자 전용 로컬 알림 테스트 페이지입니다.');
    }
  }, [createLocalDbPreview, isAdmin, isAuthCheckComplete, isLocal, refreshNotifications]);

  if (!isAuthCheckComplete) {
    return (
      <main className="admin-notification-preview-page">
        <section className="admin-notification-preview-card">
          <p>관리자 권한 확인 중...</p>
        </section>
      </main>
    );
  }

  if (!isLocal || !isAdmin) {
    return (
      <main className="admin-notification-preview-page">
        <section className="admin-notification-preview-card">
          <p className="admin-notification-preview-eyebrow">Admin Only</p>
          <h1>알림 리스트 테스트</h1>
          <p>{status}</p>
          {!isLocal && <p>운영 DB에서는 테스트 이벤트를 만들지 않습니다.</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-notification-preview-page">
      <section className="admin-notification-preview-card">
        <p className="admin-notification-preview-eyebrow">Local Admin Test</p>
        <h1>알림 리스트 실제 테스트</h1>
        <p>{status}</p>
        {errorMessage && <p className="admin-notification-preview-error">{errorMessage}</p>}
        <div className="admin-notification-preview-actions">
          <button type="button" onClick={createLocalDbPreview} disabled={isSeeding}>
            {isSeeding ? '생성 중...' : '로컬 DB 이벤트 등록 + 알림 리스트 열기'}
          </button>
          <button type="button" onClick={() => setIsModalOpen(true)} disabled={!notifications.length}>
            알림 리스트 다시 보기
          </button>
        </div>
        <p className="admin-notification-preview-note">
          이 페이지는 localhost에서만 로컬 DB에 테스트 이벤트를 생성합니다. 운영 푸시는 발송하지 않습니다.
        </p>
      </section>

      <NotificationHistoryModal
        isOpen={isModalOpen && notifications.length > 0}
        onClose={() => setIsModalOpen(false)}
        notifications={notifications}
        onRefresh={refreshNotifications}
      />
    </main>
  );
}
