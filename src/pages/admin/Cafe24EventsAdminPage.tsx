import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import type { Event as AppEvent } from '../../lib/cafe24Client';
import './Cafe24EventsAdminPage.css';

type EventForm = {
  id?: string | number;
  title: string;
  category: string;
  genre: string;
  dance_scope: string;
  activity_type: string;
  date: string;
  start_date: string;
  end_date: string;
  event_dates: string;
  time: string;
  location: string;
  address: string;
  location_link: string;
  description: string;
  image: string;
  link1: string;
  link_name1: string;
};

const emptyForm: EventForm = {
  title: '',
  category: 'event',
  genre: '',
  dance_scope: 'swing',
  activity_type: 'event',
  date: '',
  start_date: '',
  end_date: '',
  event_dates: '',
  time: '',
  location: '',
  address: '',
  location_link: '',
  description: '',
  image: '',
  link1: '',
  link_name1: '',
};

function todayString() {
  const today = new Date();
  today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  return today.toISOString().slice(0, 10);
}

function formFromEvent(event: AppEvent): EventForm {
  return {
    id: event.id,
    title: event.title || '',
    category: event.category || 'event',
    genre: event.genre || '',
    dance_scope: event.dance_scope || 'swing',
    activity_type: event.activity_type || event.category || 'event',
    date: event.date || event.start_date || '',
    start_date: event.start_date || event.date || '',
    end_date: event.end_date || event.start_date || event.date || '',
    event_dates: Array.isArray(event.event_dates) ? event.event_dates.join(', ') : '',
    time: event.time || '',
    location: event.location || '',
    address: event.address || '',
    location_link: event.location_link || '',
    description: event.description || '',
    image: event.image || event.image_medium || event.image_thumbnail || '',
    link1: event.link1 || '',
    link_name1: event.link_name1 || '',
  };
}

function payloadFromForm(form: EventForm) {
  const startDate = form.start_date || form.date;
  const endDate = form.end_date || startDate;

  return {
    ...form,
    date: form.date || startDate,
    start_date: startDate,
    end_date: endDate,
    event_dates: form.event_dates
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    image_thumbnail: form.image,
    image_medium: form.image,
  };
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `API failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export default function Cafe24EventsAdminPage() {
  const { user, isAdmin, isAuthCheckComplete, signInWithKakao, signOut } = useAuth();
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [form, setForm] = useState<EventForm>({ ...emptyForm, date: todayString(), start_date: todayString(), end_date: todayString() });
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => String(a.start_date || a.date || '').localeCompare(String(b.start_date || b.date || '')));
  }, [events]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const today = todayString();
      const data = await apiJson<{ events: AppEvent[] }>(`/api/events?cutoff=${today}&limit=3000`);
      setEvents(data.events || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) loadEvents().catch((error) => setMessage(error.message));
  }, [isAdmin]);

  const updateField = (key: keyof EventForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    const today = todayString();
    setSelectedId(null);
    setForm({ ...emptyForm, date: today, start_date: today, end_date: today });
    setMessage('');
  };

  const selectEvent = (event: AppEvent) => {
    setSelectedId(event.id);
    setForm(formFromEvent(event));
    setMessage('');
  };

  const saveEvent = async () => {
    setLoading(true);
    setMessage('');
    try {
      const payload = payloadFromForm(form);
      const url = selectedId ? `/api/events/${encodeURIComponent(String(selectedId))}` : '/api/events';
      await apiJson(url, { method: 'POST', body: JSON.stringify(selectedId ? { ...payload, _method: 'PUT' } : payload) });
      setMessage(selectedId ? '수정되었습니다.' : '등록되었습니다.');
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const deleteEvent = async () => {
    if (!selectedId) return;
    if (!window.confirm('이 이벤트를 삭제할까요?')) return;

    setLoading(true);
    setMessage('');
    try {
      await apiJson(`/api/events/${encodeURIComponent(String(selectedId))}/delete`, {
        method: 'POST',
        body: JSON.stringify({ _method: 'DELETE' }),
      });
      setMessage('삭제되었습니다.');
      resetForm();
      await loadEvents();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (file: File) => {
    const dataBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    const data = await apiJson<{ url: string }>('/api/uploads/events', {
      method: 'POST',
      body: JSON.stringify({ dataBase64, mimeType: file.type }),
    });

    updateField('image', data.url);
  };

  if (!isAuthCheckComplete) {
    return <main className="c24-admin-page"><div className="c24-status">확인 중...</div></main>;
  }

  if (!user) {
    return (
      <main className="c24-admin-page">
        <section className="c24-auth-panel">
          <h1>Cafe24 이벤트 관리</h1>
          <button type="button" onClick={signInWithKakao}>
            <i className="ri-kakao-talk-fill" />
            카카오로 로그인
          </button>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="c24-admin-page">
        <section className="c24-auth-panel">
          <h1>관리자 권한이 필요합니다</h1>
          <button type="button" onClick={signOut}>로그아웃</button>
        </section>
      </main>
    );
  }

  return (
    <main className="c24-admin-page">
      <header className="c24-admin-header">
        <div>
          <h1>Cafe24 이벤트 관리</h1>
          <p>{user.email || user.user_metadata?.name}</p>
        </div>
        <div className="c24-header-actions">
          <a href="/api/stats/events" target="_blank" rel="noreferrer">이벤트 통계</a>
          <button type="button" onClick={loadEvents} disabled={loading}>
            <i className="ri-refresh-line" />
          </button>
          <button type="button" onClick={signOut}>로그아웃</button>
        </div>
      </header>

      <section className="c24-admin-layout">
        <aside className="c24-event-list">
          <div className="c24-list-header">
            <strong>일정 {sortedEvents.length}</strong>
            <button type="button" onClick={resetForm}>새 일정</button>
          </div>
          <div className="c24-list-scroll">
            {sortedEvents.map((event) => (
              <button
                type="button"
                key={event.id}
                className={String(selectedId) === String(event.id) ? 'is-active' : ''}
                onClick={() => selectEvent(event)}
              >
                <span>{event.start_date || event.date}</span>
                <strong>{event.title}</strong>
                <em>{event.location || event.category}</em>
              </button>
            ))}
          </div>
        </aside>

        <section className="c24-editor">
          <div className="c24-form-grid">
            <label>
              제목
              <input value={form.title} onChange={(event) => updateField('title', event.target.value)} />
            </label>
            <label>
              분류
              <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
                <option value="event">행사</option>
                <option value="class">강습</option>
                <option value="club">동호회</option>
                <option value="social">소셜</option>
              </select>
            </label>
            <label>
              장르
              <input value={form.genre} onChange={(event) => updateField('genre', event.target.value)} />
            </label>
            <label>
              날짜
              <input type="date" value={form.date} onChange={(event) => updateField('date', event.target.value)} />
            </label>
            <label>
              시작일
              <input type="date" value={form.start_date} onChange={(event) => updateField('start_date', event.target.value)} />
            </label>
            <label>
              종료일
              <input type="date" value={form.end_date} onChange={(event) => updateField('end_date', event.target.value)} />
            </label>
            <label>
              복수 날짜
              <input value={form.event_dates} onChange={(event) => updateField('event_dates', event.target.value)} placeholder="2026-06-01, 2026-06-08" />
            </label>
            <label>
              시간
              <input value={form.time} onChange={(event) => updateField('time', event.target.value)} placeholder="19:30" />
            </label>
            <label>
              장소
              <input value={form.location} onChange={(event) => updateField('location', event.target.value)} />
            </label>
            <label>
              주소
              <input value={form.address} onChange={(event) => updateField('address', event.target.value)} />
            </label>
            <label className="c24-wide">
              카카오 지도 링크
              <div className="c24-inline">
                <input value={form.location_link} onChange={(event) => updateField('location_link', event.target.value)} />
                <a
                  href={`https://map.kakao.com/?q=${encodeURIComponent(form.address || form.location || form.title)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  검색
                </a>
              </div>
            </label>
            <label className="c24-wide">
              대표 이미지
              <div className="c24-inline">
                <input value={form.image} onChange={(event) => updateField('image', event.target.value)} />
                <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} />
              </div>
            </label>
            <label>
              링크 이름
              <input value={form.link_name1} onChange={(event) => updateField('link_name1', event.target.value)} />
            </label>
            <label>
              링크 URL
              <input value={form.link1} onChange={(event) => updateField('link1', event.target.value)} />
            </label>
            <label className="c24-wide">
              설명
              <textarea value={form.description} onChange={(event) => updateField('description', event.target.value)} rows={8} />
            </label>
          </div>

          {message && <p className="c24-message">{message}</p>}

          <div className="c24-editor-actions">
            <button type="button" onClick={saveEvent} disabled={loading || !form.title}>
              <i className="ri-save-line" />
              {selectedId ? '수정' : '등록'}
            </button>
            {selectedId && (
              <button type="button" className="is-danger" onClick={deleteEvent} disabled={loading}>
                <i className="ri-delete-bin-line" />
                삭제
              </button>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
