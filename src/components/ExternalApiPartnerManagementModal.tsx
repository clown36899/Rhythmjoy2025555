import { useCallback, useEffect, useState } from 'react';
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
  allowed_classifications: Array<{ category: string; genre: string }> | string | null;
  environment: 'test' | 'live';
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

type PartnerRequest = {
  id: string;
  requester_user_id: string;
  requester_email: string | null;
  requester_nickname: string | null;
  partner_name: string;
  contact: string;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
};

type PartnerDraft = {
  owner_user_id: string;
  allowed_classifications: Array<{ category: string; genre: string }>;
  environment: 'test' | 'live';
  per_minute_limit: number;
  daily_limit: number;
};

const GENRES: Record<string, string[]> = {
  social: ['소셜', '졸공'],
  event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
  class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
  club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
};

const CATEGORY_LABELS: Record<string, string> = {
  social: '소셜',
  event: '행사',
  class: '강습',
  club: '동호회',
};

const parseAllowed = (value: Partner['allowed_classifications']) => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toggleClassification = (
  current: Array<{ category: string; genre: string }>,
  category: string,
  genre: string,
) => {
  const exists = current.some((item) => item.category === category && item.genre === genre);
  return exists
    ? current.filter((item) => !(item.category === category && item.genre === genre))
    : [...current, { category, genre }];
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
  const [partnerRequests, setPartnerRequests] = useState<PartnerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuedKey, setIssuedKey] = useState('');
  const [drafts, setDrafts] = useState<Record<string, PartnerDraft>>({});
  const [tab, setTab] = useState<'partners' | 'logs'>('partners');
  const [form, setForm] = useState({
    application_id: '',
    name: '',
    owner_user_id: '',
    allowed_classifications: [] as Array<{ category: string; genre: string }>,
    environment: 'test' as 'test' | 'live',
    per_minute_limit: 30,
    daily_limit: 1000,
  });

  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    try {
      const [partnerData, userData, requestData, auditData, applicationData] = await Promise.all([
        fetchJson('/api/admin/external-partners'),
        fetchJson('/api/admin/external-partner-users'),
        fetchJson('/api/admin/external-request-logs?limit=100'),
        fetchJson('/api/admin/external-admin-audit-logs?limit=100'),
        fetchJson('/api/admin/external-partner-requests'),
      ]);
      setPartners(partnerData.partners || []);
      setDrafts(Object.fromEntries((partnerData.partners || []).map((partner: Partner) => [
        partner.id,
        {
          owner_user_id: partner.owner_user_id || '',
          allowed_classifications: parseAllowed(partner.allowed_classifications),
          environment: partner.environment || 'test',
          per_minute_limit: Number(partner.per_minute_limit || 10),
          daily_limit: Number(partner.daily_limit || 200),
        },
      ])));
      setUsers(userData.users || []);
      setRequestLogs(requestData.logs || []);
      setAuditLogs(auditData.logs || []);
      setPartnerRequests(applicationData.requests || []);
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
          default_category: null,
          default_genre: null,
        }),
      });
      setIssuedKey(result.api_key);
      setForm({
        application_id: '',
        name: '',
        owner_user_id: '',
        allowed_classifications: [],
        environment: 'test',
        per_minute_limit: 30,
        daily_limit: 1000,
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
          default_category: null,
          default_genre: null,
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
              <button type="button" className={tab === 'partners' ? 'is-active' : ''} onClick={() => setTab('partners')}>승인·파트너</button>
              <button type="button" className={tab === 'logs' ? 'is-active' : ''} onClick={() => setTab('logs')}>기록</button>
              <button type="button" className="EAPM-refresh" onClick={loadAll} aria-label="새로고침"><i className="ri-refresh-line" /></button>
            </nav>

            {tab === 'partners' && (
              <div className="EAPM-content">
                <section className="EAPM-create">
                  <h3>승인 대기 요청</h3>
                  <p className="EAPM-hint">요청을 선택하면 아래 승인 설정에 신청자 정보가 자동 입력됩니다.</p>
                  <div className="EAPM-requestList">
                    {partnerRequests.filter((request) => request.status === 'pending').map((request) => (
                      <article key={request.id}>
                        <div>
                          <strong>{request.partner_name}</strong>
                          <span>{request.requester_nickname || request.requester_email || request.requester_user_id}</span>
                          <small>{request.contact} · {new Date(request.created_at).toLocaleString('ko-KR')}</small>
                          {request.note && <p>{request.note}</p>}
                        </div>
                        <button type="button" onClick={() => setForm({
                          ...form,
                          application_id: request.id,
                          name: request.partner_name,
                          owner_user_id: request.requester_user_id,
                          environment: 'test',
                          per_minute_limit: 30,
                          daily_limit: 1000,
                        })}>승인 설정</button>
                      </article>
                    ))}
                    {!partnerRequests.some((request) => request.status === 'pending') && <p className="EAPM-empty">승인 대기 중인 요청이 없습니다.</p>}
                  </div>
                </section>
                <section className="EAPM-create">
                  <h3>{form.application_id ? '요청 승인 및 테스트 키 발급' : '관리자 직접 파트너 발급'}</h3>
                  <div className="EAPM-formGrid">
                    <label>파트너 이름<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="예: OO 댄스 일정 연동" /></label>
                    <label>연결 회원<select value={form.owner_user_id} onChange={(event) => setForm({ ...form, owner_user_id: event.target.value })}>
                      <option value="">회원 선택</option>
                      {users.map((user) => <option key={user.id} value={user.id}>{user.nickname || user.email || user.id}{user.is_admin ? ' · 관리자' : ''}</option>)}
                    </select></label>
                    <label>연동 단계<select value={form.environment} onChange={(event) => {
                      const environment = event.target.value as 'test' | 'live';
                      setForm({
                        ...form,
                        environment,
                        per_minute_limit: environment === 'test' ? 30 : 10,
                        daily_limit: environment === 'test' ? 1000 : 200,
                      });
                    }}>
                      <option value="test">테스트 · 실제 일정에 노출하지 않음</option>
                      <option value="live">운영 · 실제 일정에 바로 반영</option>
                    </select></label>
                    <label>분당 API 요청 한도<input type="number" min="1" value={form.per_minute_limit} onChange={(event) => setForm({ ...form, per_minute_limit: Number(event.target.value) })} /></label>
                    <label>24시간 API 요청 한도<input type="number" min="1" value={form.daily_limit} onChange={(event) => setForm({ ...form, daily_limit: Number(event.target.value) })} /></label>
                  </div>
                  <fieldset className="EAPM-permissions">
                    <legend>등록을 허용할 장르 <small>복수 선택 가능</small></legend>
                    <p>선택하지 않으면 사이트의 모든 조합을 허용합니다. 같은 장르 이름도 최상위 분류가 다르면 별도 권한입니다. 예: class/린디합과 club/린디합.</p>
                    {Object.entries(GENRES).map(([category, genres]) => (
                      <div className="EAPM-permissionRow" key={category}>
                        <strong>{CATEGORY_LABELS[category]} <code>{category}</code></strong>
                        <div>
                          {genres.map((genre) => {
                            const checked = form.allowed_classifications.some((item) => item.category === category && item.genre === genre);
                            return <label key={genre} className={checked ? 'is-selected' : ''}>
                              <input type="checkbox" checked={checked} onChange={() => setForm({
                                ...form,
                                allowed_classifications: toggleClassification(form.allowed_classifications, category, genre),
                              })} />
                              {genre}
                            </label>;
                          })}
                        </div>
                      </div>
                    ))}
                  </fieldset>
                  <p className="EAPM-hint"><strong>권장 절차:</strong> 테스트 키 발급 → 상대방 서버 연동 확인 → 요청 기록 검토 → 운영으로 전환해 주세요. 키 원문은 발급 직후 한 번만 표시됩니다.</p>
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
                        <small>
                          <b className={`EAPM-mode ${partner.environment === 'live' ? 'is-live' : ''}`}>
                            {partner.environment === 'live' ? '운영' : '테스트'}
                          </b>
                          {' · '}허용 장르 {parseAllowed(partner.allowed_classifications).length
                            ? `${parseAllowed(partner.allowed_classifications).length}개 선택`
                            : '전체'}
                          {' · '}한도 {partner.per_minute_limit}/분, {partner.daily_limit}/24시간
                        </small>
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
                          <label>연동 단계<select value={drafts[partner.id].environment} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], environment: event.target.value as 'test' | 'live' },
                          })}>
                            <option value="test">테스트 · 미노출</option>
                            <option value="live">운영 · 실제 반영</option>
                          </select></label>
                          <label>분당 요청 한도<input type="number" min="1" value={drafts[partner.id].per_minute_limit} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], per_minute_limit: Number(event.target.value) },
                          })} /></label>
                          <label>24시간 요청 한도<input type="number" min="1" value={drafts[partner.id].daily_limit} onChange={(event) => setDrafts({
                            ...drafts,
                            [partner.id]: { ...drafts[partner.id], daily_limit: Number(event.target.value) },
                          })} /></label>
                          <fieldset className="EAPM-permissions EAPM-cardPermissions">
                            <legend>허용 장르 <small>미선택 시 전체 허용</small></legend>
                            <p>같은 이름이라도 최상위 분류별로 따로 선택합니다.</p>
                            {Object.entries(GENRES).map(([category, genres]) => (
                              <div className="EAPM-permissionRow" key={category}>
                                <strong>{CATEGORY_LABELS[category]}</strong>
                                <div>{genres.map((genre) => {
                                  const checked = drafts[partner.id].allowed_classifications.some((item) => item.category === category && item.genre === genre);
                                  return <label key={genre} className={checked ? 'is-selected' : ''}>
                                    <input type="checkbox" checked={checked} onChange={() => setDrafts({
                                      ...drafts,
                                      [partner.id]: {
                                        ...drafts[partner.id],
                                        allowed_classifications: toggleClassification(drafts[partner.id].allowed_classifications, category, genre),
                                      },
                                    })} />
                                    {genre}
                                  </label>;
                                })}</div>
                              </div>
                            ))}
                          </fieldset>
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

            {tab === 'logs' && (
              <div className="EAPM-logList">
                <h3>API 호출 기록</h3>
                {requestLogs.map((log) => <div key={log.id}><strong>{log.partner_name}</strong><span>{log.result} · HTTP {log.status_code}</span><small>{log.external_id || '-'} · {log.request_ip || '-'} · {new Date(log.created_at).toLocaleString('ko-KR')}</small></div>)}
                {!requestLogs.length && <p className="EAPM-empty">API 요청 기록이 없습니다.</p>}
                <h3>관리자 변경 기록</h3>
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
