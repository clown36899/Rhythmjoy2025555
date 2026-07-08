import React from 'react';
import NotificationHistoryModal from '../../components/NotificationHistoryModal';
import { useAuth } from '../../contexts/AuthContext';
import { notificationStore } from '../../lib/notificationStore';
import type { NotificationRecord } from '../../lib/notificationStore';
import { cafe24 } from '../../lib/cafe24Client';
import { fetchCalendarEvents } from '../../hooks/queries/useCalendarEventsQuery';
import {
  buildDailyScheduleNotification,
  getDailyScheduleDateKey,
  getDailyScheduleEvents,
  type DailyScheduleEventPreview,
} from '../../utils/dailyScheduleNotification';
import './NotificationPreviewPage.css';

const LOCAL_SEED_FLAG = 'swingenjoy:admin-daily-notification-preview-seeded:v1';

const fallbackImages = [
  '/uploads/images/event-posters/1780377362748_f2x3x/medium.webp',
  '/uploads/images/event-posters/1780122176681_8o4ku/medium.webp',
  '/uploads/images/event-posters/1780118349312_64f7a/medium.webp',
];

function isLocalRuntime() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

export default function NotificationPreviewPage() {
  const { isAdmin, isAuthCheckComplete, user } = useAuth();
  const [notifications, setNotifications] = React.useState<NotificationRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(true);
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [isLoadingEvents, setIsLoadingEvents] = React.useState(false);
  const [todayEvents, setTodayEvents] = React.useState<DailyScheduleEventPreview[]>([]);
  const [targetDateKey] = React.useState(() => getDailyScheduleDateKey());
  const [status, setStatus] = React.useState('관리자 권한 확인 중...');
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const isLocal = isLocalRuntime();

  const refreshNotifications = React.useCallback(async () => {
    const unread = await notificationStore.getUnread();
    setNotifications(unread as NotificationRecord[]);
  }, []);

  const loadTodayEvents = React.useCallback(async () => {
    setIsLoadingEvents(true);
    setErrorMessage(null);

    try {
      const { events } = await fetchCalendarEvents(targetDateKey, targetDateKey, 'swing');
      const dailyEvents = getDailyScheduleEvents(events as DailyScheduleEventPreview[], targetDateKey);
      setTodayEvents(dailyEvents);
      setStatus(dailyEvents.length > 0
        ? `${targetDateKey} 오늘 일정 ${dailyEvents.length}개를 불러왔습니다.`
        : `${targetDateKey} 오늘 일정이 없습니다. 더미 버튼으로 미리보기를 만들 수 있습니다.`);
      return dailyEvents;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setStatus('오늘 일정 불러오기 실패');
      return [];
    } finally {
      setIsLoadingEvents(false);
    }
  }, [targetDateKey]);

  const openDailyPreview = React.useCallback(async (events?: DailyScheduleEventPreview[]) => {
    const sourceEvents = events ?? todayEvents;
    const notification = buildDailyScheduleNotification(sourceEvents, targetDateKey, {
      localTest: true,
      adminOnly: true,
    });

    await notificationStore.upsertMany([notification]);
    await refreshNotifications();
    setIsModalOpen(true);
    setStatus(sourceEvents.length > 0
      ? `오늘 아침 일정 알림 미리보기 생성 완료: ${sourceEvents.length}개 일정`
      : '오늘 일정 없음 미리보기 생성 완료. 실제 운영 발송에서는 이 케이스는 보내지 않는 기준입니다.');
  }, [refreshNotifications, targetDateKey, todayEvents]);

  const createLocalDbPreview = React.useCallback(async () => {
    if (!isLocal || !isAdmin || isSeeding) return;

    setIsSeeding(true);
    setErrorMessage(null);
    setStatus('로컬 DB에 오늘 테스트 일정을 등록하는 중...');

    try {
      const { data: sampleImages } = await cafe24
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
          title: '오늘 아침 알림 테스트 - 첫 소셜',
          date: targetDateKey,
          start_date: targetDateKey,
          end_date: targetDateKey,
          time: '19:30',
          location: '로컬 테스트홀 A',
          category: 'social',
          price: '테스트',
          image: imagePool[0] || fallbackImages[0],
          image_thumbnail: imagePool[0] || fallbackImages[0],
          image_medium: imagePool[0] || fallbackImages[0],
          image_full: imagePool[0] || fallbackImages[0],
          description: '오늘 아침 일정 알림 미리보기를 위한 로컬 DB 테스트 일정입니다.',
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
          title: '오늘 아침 알림 테스트 - 강습',
          date: targetDateKey,
          start_date: targetDateKey,
          end_date: targetDateKey,
          time: '20:00',
          location: '로컬 테스트 스튜디오',
          category: 'class',
          price: '테스트',
          image: imagePool[1] || fallbackImages[1],
          image_thumbnail: imagePool[1] || fallbackImages[1],
          image_medium: imagePool[1] || fallbackImages[1],
          image_full: imagePool[1] || fallbackImages[1],
          description: '오늘 일정 요약 알림에서 강습 항목이 같이 묶이는지 확인합니다.',
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
          title: '오늘 아침 알림 테스트 - 행사',
          date: targetDateKey,
          start_date: targetDateKey,
          end_date: targetDateKey,
          time: '21:00',
          location: '로컬 테스트 바',
          category: 'event',
          price: '테스트',
          image: imagePool[2] || fallbackImages[2],
          image_thumbnail: imagePool[2] || fallbackImages[2],
          image_medium: imagePool[2] || fallbackImages[2],
          image_full: imagePool[2] || fallbackImages[2],
          description: '오늘 아침 일정 요약의 마지막 항목 확인용 로컬 테스트 일정입니다.',
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

      const { data, error } = await cafe24
        .from('events')
        .insert(rows)
        .select('id,title,date,start_date,end_date,event_dates,time,location,category,image,image_micro,image_thumbnail,image_medium,image_full');

      if (error) throw error;
      const insertedEvents = getDailyScheduleEvents((data || []) as DailyScheduleEventPreview[], targetDateKey);
      if (!insertedEvents.length) {
        throw new Error('로컬 DB 테스트 이벤트가 생성되지 않았습니다.');
      }

      setTodayEvents(insertedEvents);
      await openDailyPreview(insertedEvents);
      sessionStorage.setItem(LOCAL_SEED_FLAG, 'true');
      setStatus(`로컬 DB 오늘 일정 ${insertedEvents.length}개 등록 후 아침 알림 미리보기를 생성했습니다.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrorMessage(message);
      setStatus('로컬 테스트 데이터 생성 실패');
    } finally {
      setIsSeeding(false);
    }
  }, [isAdmin, isLocal, isSeeding, openDailyPreview, targetDateKey, user?.id]);

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
      loadTodayEvents();
    }
  }, [createLocalDbPreview, isAdmin, isAuthCheckComplete, isLocal, loadTodayEvents, refreshNotifications]);

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
          <h1>오늘 아침 일정 알림 미리보기</h1>
          <p>{status}</p>
          {!isLocal && <p>운영 DB에서는 테스트 이벤트를 만들지 않습니다.</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-notification-preview-page">
      <section className="admin-notification-preview-card">
        <p className="admin-notification-preview-eyebrow">Local Admin Preview</p>
        <h1>오늘 아침 일정 알림 미리보기</h1>
        <p>{status}</p>
        {errorMessage && <p className="admin-notification-preview-error">{errorMessage}</p>}
        <div className="admin-notification-preview-summary">
          <span>{targetDateKey}</span>
          <strong>{isLoadingEvents ? '불러오는 중' : `${todayEvents.length}개 일정`}</strong>
        </div>
        {todayEvents.length > 0 && (
          <div className="admin-notification-preview-list" aria-label="오늘 일정 목록">
            {todayEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="admin-notification-preview-row">
                <span>{event.time || event.start_time || '--:--'}</span>
                <strong>{event.title}</strong>
                <em>{event.location || event.venue_name || event.place_name || '장소 미정'}</em>
              </div>
            ))}
          </div>
        )}
        <div className="admin-notification-preview-actions">
          <button type="button" onClick={() => loadTodayEvents()} disabled={isLoadingEvents || isSeeding}>
            {isLoadingEvents ? '불러오는 중...' : '오늘 일정 새로고침'}
          </button>
          <button type="button" onClick={() => openDailyPreview()} disabled={isLoadingEvents || isSeeding}>
            오늘 일정 알림 미리보기 생성
          </button>
          <button type="button" onClick={createLocalDbPreview} disabled={isSeeding}>
            {isSeeding ? '생성 중...' : '더미 오늘 일정 등록 + 미리보기'}
          </button>
          <button type="button" onClick={() => setIsModalOpen(true)} disabled={!notifications.length}>
            알림 리스트 다시 보기
          </button>
        </div>
        <p className="admin-notification-preview-note">
          이 페이지는 localhost에서만 더미 일정을 생성합니다. 운영 푸시는 발송하지 않으며, 실제 발송 기준은 아침 스케줄러에서 오늘 일정이 있을 때만 큐를 만드는 방식입니다.
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
