import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import LocalLoading from './LocalLoading';
import './ExternalApiPartnerManagementModal.css';

type Partner = {
  id: string;
  name: string;
  key_prefix: string;
  is_active: number | boolean;
  default_category: string | null;
  default_genre: string | null;
  owner_user_id: string;
  owner_email: string | null;
  owner_nickname: string | null;
  per_minute_limit: number;
  daily_limit: number;
  event_count: number;
  last_request_at: string | null;
};

type UserOption = {
  id: string;
  email: string | null;
  nickname: string | null;
  is_admin: number | boolean;
};

type RequestLog = {
  id: number;
  partner_name: string;
  external_id: string | null;
  status_code: number;
  result: string;
  error_code: string | null;
  request_ip: string | null;
  created_at: string;
};

type AuditLog = {
  id: number;
  admin_email: string | null;
  admin_user_id: string;
  partner_name: string | null;
  action: string;
  request_ip: string | null;
  created_at: string;
};

type PartnerDraft = {
  owner_user_id: string;
  default_category: string;
  default_genre: string;
  per_minute_limit: number;
  daily_limit: number;
};

const GENRES: Record<string, string[]> = {
  social: ['소셜', '졸공'],
  event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
  class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
};

const fetchJson = async (url: string, options?: RequestInit) => {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `요청 실패 (${response.status})`);
  return body;
};

export default function ExternalApiPartnerManagementModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { isAdmin } = useAuth();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [requestLogs, setRequestLogs] = useState<RequestLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuedKey, setIssuedKey] = useState('');
  const [drafts, setDrafts] = useState<Record<string, PartnerDraft>>({});
  const [tab, setTab] = useState<'partners' | 'requests' | 'audit'>('partners');
  const [form, setForm] = useState({
    name: '',
    owner_user_id: '',
    default_category: '',
    default_genre: '',
    per_minute_limit: 10,
    daily_limit: 200,
  });

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [partnerData, userData, requestData, auditData] = await Promise.all([
        fetchJson('/api/admin/external-partners'),
        fetchJson('/api/admin/external-partner-users'),
        fetchJson('/api/admin/external-request-logs?limit=100'),
        fetchJson('/api/admin/external-admin-audit-logs?limit=100'),
      ]);
      setPartners(partnerData.partners || []);
      setDrafts(Object.fromEntries((partnerData.partners || []).map((partner: Partner) => [
        partner.id,
        {
          owner_user_id: partner.owner_user_id || '',
          default_category: partner.default_category || '',
          default_genre: partner.default_genre || '',
          per_minute_limit: Number(partner.per_minute_limit || 10),
          daily_limit: Number(partner.daily_limit || 200),
        },
      ])));
      setUsers(userData.users || []);
      setRequestLogs(requestData.logs || []);
      setAuditLogs(auditData.logs || []);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '관리 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    loadAll();
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, loadAll]);

  const availableGenres = useMemo(
    () => (form.default_category ? GENRES[form.default_category] || [] : []),
    [form.default_category],
  );

  if (!isOpen) return null;

  const createPartner = async () => {
    if (!form.name.trim() || !form.owner_user_id) {
      setError('파트너 이름과 연결 회원을 선택해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await fetchJson('/api/admin/external-partners', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          default_category: form.default_category || null,
          default_genre: form.default_genre || null,
        }),
      });
      setIssuedKey(result.api_key);
      setForm({
        name: '',
        owner_user_id: '',
        default_category: '',
        default_genre: '',
        per_minute_limit: 10,
        daily_limit: 200,
      });
      await loadAll();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '파트너를 만들지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const togglePartner = async (partner: Partner) => {
    setSaving(true);
    setError('');
    try {
      await fetchJson(`/api/admin/external-partners/${encodeURIComponent(partner.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !partner.is_active }),
      });
      await loadAll();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '상태를 변경하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = async (partner: Partner) => {
    if (!window.confirm(`${partner.name}의 기존 API Key를 즉시 폐기하고 새 키를 발급하시겠습니까?`)) return;
    setSaving(true);
    setError('');
    try {
      const result = await fetchJson(
        `/api/admin/external-partners/${encodeURIComponent(partner.id)}/rotate-key`,
        { method: 'POST', body: '{}' },
      );
      setIssuedKey(result.api_key);
      await loadAll();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '키를 재발급하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const savePartner = async (partner: Partner) => {
    const draft = drafts[partner.id];
    if (!draft?.owner_user_id) {
      setError('연결 회원을 선택해 주세요.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await fetchJson(`/api/admin/external-partners/${encodeURIComponent(partner.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...draft,
          default_category: draft.default_category || null,
          default_genre: draft.default_genre || null,
        }),
      });
      await loadAll();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '파트너 설정을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="EAPM-overlay" role="dialog" aria-modal="true" aria-label="외부 API 파트너 관리">
      <div className="EAPM-panel">
        <header className="EAPM-header">
          <div>
            <h2>외부 API 파트너 관리</h2>
            <p>회원 계정에 파트너 키를 연결하고 발급·중지·재발급 기록을 관리합니다.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="닫기"><i className="ri-close-line" /></button>
        </header>

        {!isAdmin ? (
          <div className="EAPM-state">관리자만 접근할 수 있습니다.</div>
        ) : loading ? (
          <div className="EAPM-state"><LocalLoading message="API 파트너 정보를 불러오는 중..." size="lg" /></div>
        ) : (
          <>
            {error && <div className="EAPM-error">{error}</div>}
            <nav className="EAPM-tabs" aria-label="API 관리 탭">
              <button type="button" className={tab === 'partners' ? 'is-active' : ''} onClick={() => setTab('partners')}>파트너·키</button>
              <button type="button" className={tab === 'requests' ? 'is-active' : ''} onClick={() => setTab('requests')}>API 요청 기록</button>
              <button type="button" className={tab === 'audit' ? 'is-active' : ''} onClick={() => setTab('audit')}>관리자 작업 기록</button>
              <button type="button" className="EAPM-refresh" onClick={loadAll} aria-label="새로고침"><i className="ri-refresh-line" /></button>
            </nav>

            {tab === 'partners' && (
              <div className="EAPM-content">
                <section className="EAPM-create">
                  <h3>새 파트너 키 발급</h3>
                  <div className="EAPM-formGrid">
                    <label>파트너 이름<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="예: OO 댄스 일정 연동" /></label>
                    <label>연결 회원<select value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}>
                      <option value="">회원 선택</option>
                      {users.map((user) => <option key={user.id} value={user.id}>{user.nickname || user.email || user.id}{user.is_admin ? ' · 관리자' : ''}</option>)}
                    </select></label>
                    <label>생략 시 최상위 분류<select value={form.default_category} onChange={(event) => setForm({ ...form, default_category: event.target.value, default_genre: '' })}>
                      <option value="">기본값 없음</option>
                      <option value="social">소셜</option><option value="event">행사</option><option value="class">강습</option><option value="club">동호회</option>
                    </select></label>
                    <label>생략 시 하위 분류<select value={form.default_genre} disabled={!form.default_category} onChange={(event) => setForm({ ...form, default_genre: event.target.value })}>
                      <option value="">{form.default_category ? '하위 분류 선택' : '최상위 분류를 먼저 선택'}</option>
                      {availableGenres.map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                    </select></label>
                    <label>분당 API 요청 한도<input type="number" min="1" value={form.per_minute_limit} onChange={(event) => setForm({ ...form, per_minute_limit: Number(event.target.value) })} /></label>
                    <label>24시간 API 요청 한도<input type="number" min="1" value={form.daily_limit} onChange={(event) => setForm({ ...form, daily_limit: Number(event.target.value) })} /></label>
                  </div>
                  <p className="EAPM-hint">기본 분류는 요청에서 분류를 생략했을 때만 적용됩니다. 파트너는 요청마다 다른 허용 분류를 보낼 수 있습니다. 키 원문은 발급 직후 한 번만 표시됩니다.</p>
                  <button type="button" className="EAPM-primary" disabled={saving} onClick={createPartner}>{saving ? '처리 중...' : 'API Key 발급'}</button>
                </section>

                <section className="EAPM-list">
                  <h3>발급된 파트너</h3>
                  {partners.length === 0 ? <p className="EAPM-empty">발급된 파트너 키가 없습니다.</p> : partners.map((partner) => (
                    <article key={partner.id} className={`EAPM-card ${partner.is_active ? '' : 'is-disabled'}`}>
                      <div className="EAPM-cardMain">
                        <strong>{partner.name}</strong>
                        <span>{partner.owner_nickname || partner.owner_email || partner.owner_user_id || '연결 회원 없음'}</span>
                        <small>Key: rj_live_{partner.key_prefix}_… · 일정 {Number(partner.event_count || 0)}개</small>
                        <small>생략 시 분류: {partner.default_category ? `${partner.default_category} / ${partner.default_genre}` : '기본값 없음'} · API 한도 {partner.per_minute_limit}/분, {partner.daily_limit}/24시간</small>
                      </div>
                      {drafts[partner.id] && (
                        <div className="EAPM-cardSettings">
                          <label>연결 회원<select value={drafts[partner.id].owner_user_id} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], owner_user_id: event.target.value },
                          })}>
                            <option value="">회원 선택</option>
                            {users.map((user) => <option key={user.id} value={user.id}>{user.nickname || user.email || user.id}{user.is_admin ? ' · 관리자' : ''}</option>)}
                          </select></label>
                          <label>생략 시 최상위 분류<select value={drafts[partner.id].default_category} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], default_category: event.target.value, default_genre: '' },
                          })}>
                            <option value="">기본값 없음</option>
                            <option value="social">소셜</option><option value="event">행사</option><option value="class">강습</option><option value="club">동호회</option>
                          </select></label>
                          <label>생략 시 하위 분류<select value={drafts[partner.id].default_genre} disabled={!drafts[partner.id].default_category} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], default_genre: event.target.value },
                          })}>
                            <option value="">{drafts[partner.id].default_category ? '선택' : '요청마다 선택'}</option>
                            {(GENRES[drafts[partner.id].default_category] || []).map((genre) => <option key={genre} value={genre}>{genre}</option>)}
                          </select></label>
                          <label>분당 요청 한도<input type="number" min="1" value={drafts[partner.id].per_minute_limit} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], per_minute_limit: Number(event.target.value) },
                          })} /></label>
                          <label>24시간 요청 한도<input type="number" min="1" value={drafts[partner.id].daily_limit} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], daily_limit: Number(event.target.value) },
                          })} /></label>
                        </div>
                      )}
                      <div className="EAPM-actions">
                        <button type="button" disabled={saving} onClick={() => savePartner(partner)}>설정 저장</button>
                        <button type="button" disabled={saving} onClick={() => togglePartner(partner)}>{partner.is_active ? '중지' : '다시 사용'}</button>
                        <button type="button" disabled={saving} onClick={() => rotateKey(partner)}>키 재발급</button>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            )}

            {tab === 'requests' && (
              <div className="EAPM-logList">
                {requestLogs.map((log) => <div key={log.id}><strong>{log.partner_name}</strong><span>{log.result} · HTTP {log.status_code}</span><small>{log.external_id || '-'} · {log.request_ip || '-'} · {new Date(log.created_at).toLocaleString('ko-KR')}</small></div>)}
                {!requestLogs.length && <p className="EAPM-empty">API 요청 기록이 없습니다.</p>}
              </div>
            )}

            {tab === 'audit' && (
              <div className="EAPM-logList">
                {auditLogs.map((log) => <div key={log.id}><strong>{log.partner_name || log.partner_id}</strong><span>{log.action}</span><small>{log.admin_email || log.admin_user_id} · {log.request_ip || '-'} · {new Date(log.created_at).toLocaleString('ko-KR')}</small></div>)}
                {!auditLogs.length && <p className="EAPM-empty">관리자 작업 기록이 없습니다.</p>}
              </div>
            )}
          </>
        )}
      </div>

      {issuedKey && (
        <div className="EAPM-keyOverlay" role="alertdialog" aria-modal="true" aria-label="새 API Key">
          <div className="EAPM-keyBox">
            <h3>API Key가 발급되었습니다</h3>
            <p>이 화면을 닫으면 키 원문을 다시 확인할 수 없습니다. 지금 안전한 곳에 복사해 주세요.</p>
            <code>{issuedKey}</code>
            <div>
              <button type="button" onClick={() => navigator.clipboard.writeText(issuedKey)}>복사</button>
              <button type="button" className="EAPM-primary" onClick={() => setIssuedKey('')}>보관 완료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
