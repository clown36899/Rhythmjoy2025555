import { useCallback, useEffect, useMemo, useState } from 'react';
import './LocalDbTestPage.css';

type ApiResult<T> = {
  data: T;
  error?: { message?: string } | null;
  count?: number | null;
};

type BoardUserRow = {
  user_id?: string;
  nickname?: string;
  email?: string;
  bio?: string | null;
  region?: string | null;
  dance_genres?: string | null;
  profile_image?: string | null;
  social_links?: Record<string, unknown> | string | null;
  updated_at?: string;
};

type EventRow = {
  id?: string | number;
  title?: string;
  date?: string;
  start_date?: string;
  time?: string;
  location?: string;
  category?: string;
  genre?: string;
  description?: string;
};

type LoadState = {
  loading: boolean;
  error: string | null;
  health: Record<string, unknown> | null;
  users: BoardUserRow[];
  events: EventRow[];
  loadedAt: string | null;
};

const initialState: LoadState = {
  loading: true,
  error: null,
  health: null,
  users: [],
  events: [],
  loadedAt: null,
};

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || `${response.status} ${response.statusText}`);
  }
  return payload as T;
}

async function queryCafe24Table<T>(table: string, limit = 20): Promise<ApiResult<T[]>> {
  const response = await fetch(`/api/cafe24-data/${encodeURIComponent(table)}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      select: '*',
      filters: [],
      orFilters: [],
      orders: [{ column: 'updated_at', ascending: false }],
      limit,
    }),
  });
  return readJson<ApiResult<T[]>>(response);
}

function getSocialLinks(value: BoardUserRow['social_links']) {
  if (!value) return [];
  const parsed = typeof value === 'string'
    ? (() => {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    })()
    : value;

  const links: { label: string; url: string }[] = [];
  const fixedLabels: Record<string, string> = {
    instagram: 'Instagram',
    youtube: 'YouTube',
    website: '웹사이트',
    kakao_openchat: '오픈채팅',
  };

  Object.entries(fixedLabels).forEach(([key, label]) => {
    const url = typeof parsed?.[key] === 'string' ? parsed[key] : '';
    if (url) links.push({ label, url });
  });

  if (Array.isArray(parsed?.extra)) {
    parsed.extra.forEach((item: any) => {
      if (item?.label && item?.url) links.push({ label: String(item.label), url: String(item.url) });
    });
  }

  return links;
}

export default function LocalDbTestPage() {
  const [state, setState] = useState<LoadState>(initialState);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const [health, usersResult, eventsResult] = await Promise.all([
        fetch('/api/auth/providers', { headers: { Accept: 'application/json' } })
          .then((response) => readJson<Record<string, unknown>>(response))
          .then((payload) => ({ api: true, ...payload }))
          .catch((error: any) => ({ api: false, message: error?.message || 'API 상태 확인 실패' })),
        queryCafe24Table<BoardUserRow>('board_users'),
        queryCafe24Table<EventRow>('events'),
      ]);

      setState({
        loading: false,
        error: null,
        health,
        users: usersResult.data || [],
        events: eventsResult.data || [],
        loadedAt: new Date().toLocaleString(),
      });
    } catch (error: any) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error?.message || '로컬 DB 조회에 실패했습니다.',
        loadedAt: new Date().toLocaleString(),
      }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusText = useMemo(() => {
    if (state.loading) return '조회 중';
    if (state.error) return '연결 실패';
    return '연결됨';
  }, [state.error, state.loading]);

  const providerSummary = useMemo(() => {
    const providers = state.health?.providers;
    if (!providers || typeof providers !== 'object') return '-';
    return Object.entries(providers as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([name]) => name)
      .join(', ') || '-';
  }, [state.health]);

  return (
    <main className="local-db-page">
      <header className="local-db-header">
        <div>
          <span className="local-db-kicker">Local Docker MySQL</span>
          <h1>로컬 DB 테스트</h1>
          <p>Vite 프론트가 로컬 API를 거쳐 Docker MySQL 데이터를 읽는지 확인합니다.</p>
        </div>
        <button className="local-db-refresh" onClick={load} disabled={state.loading}>
          <i className={state.loading ? 'ri-loader-4-line local-db-spin' : 'ri-refresh-line'} />
          새로고침
        </button>
      </header>

      <section className={`local-db-status ${state.error ? 'is-error' : 'is-ok'}`}>
        <div>
          <strong>{statusText}</strong>
          <span>{state.loadedAt || '-'}</span>
        </div>
        <code>{state.error || 'API: /api/cafe24-data/* -> MySQL'}</code>
      </section>

      <section className="local-db-grid">
        <article className="local-db-panel">
          <div className="local-db-panel-title">
            <i className="ri-heart-pulse-line" />
            API 상태
          </div>
          <dl className="local-db-meta">
            <div>
              <dt>api</dt>
              <dd>{String(state.health?.api ?? '-')}</dd>
            </div>
            <div>
              <dt>providers</dt>
              <dd>{providerSummary}</dd>
            </div>
            <div>
              <dt>database</dt>
              <dd>Docker MySQL :3307</dd>
            </div>
          </dl>
        </article>

        <article className="local-db-panel">
          <div className="local-db-panel-title">
            <i className="ri-user-smile-line" />
            board_users <span>{state.users.length}</span>
          </div>
          <div className="local-db-list">
            {state.users.map((user) => (
              <div className="local-db-user-card" key={user.user_id || user.nickname}>
                <div className="local-db-avatar">{(user.nickname || '?').slice(0, 1)}</div>
                <div className="local-db-user-main">
                  <strong>{user.nickname || '이름 없음'}</strong>
                  <small>{user.email || user.user_id}</small>
                  <p>{user.bio || '소개 없음'}</p>
                  <div className="local-db-tags">
                    {user.region && <span>{user.region}</span>}
                    {user.dance_genres && <span>{user.dance_genres}</span>}
                  </div>
                  <div className="local-db-links">
                    {getSocialLinks(user.social_links).map((link) => (
                      <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                        <i className="ri-external-link-line" />
                        {link.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {!state.loading && !state.users.length && <p className="local-db-empty">사용자 테스트 데이터가 없습니다.</p>}
          </div>
        </article>

        <article className="local-db-panel is-wide">
          <div className="local-db-panel-title">
            <i className="ri-calendar-event-line" />
            events <span>{state.events.length}</span>
          </div>
          <div className="local-db-event-table">
            <div className="local-db-event-head">
              <span>날짜</span>
              <span>제목</span>
              <span>장르</span>
              <span>장소</span>
            </div>
            {state.events.map((event) => (
              <div className="local-db-event-row" key={String(event.id || event.title)}>
                <span>{event.date || event.start_date || '-'}</span>
                <strong>{event.title || 'Untitled'}</strong>
                <span>{event.genre || event.category || '-'}</span>
                <span>{event.location || '-'}</span>
              </div>
            ))}
            {!state.loading && !state.events.length && <p className="local-db-empty">이벤트 테스트 데이터가 없습니다.</p>}
          </div>
        </article>
      </section>
    </main>
  );
}
