import { useState, useEffect, useRef } from 'react';
import type { AnalyticsSummary, UserInfo, GuestInfo } from '../utils/analyticsReportTypes';
import { loadAnalyticsReport } from '../utils/analyticsReportCache';
import './SiteAnalyticsModal.css';

// [PHASE 18] 타입명 한글화
const TYPE_NAMES: Record<string, string> = {
    'nav_item': '네비게이션',
    'event': '이벤트',
    'group': '그룹',
    'social': '소셜',
    'tab': '탭 전환',
    'external_link': '외부 링크',
    'shop': '쇼핑',
    'venue': '연습실',
    'bio_link': '바이오 링크',
    'auto_link': '자동 링크',
    'action': '액션',
    'social_regular': '정기 소셜',
    'day_select': '날짜 선택',
    'event_registration': '이벤트 등록',
    'event_update': '이벤트 수정',
    'social_schedule_create': '소셜 등록',
    'social_schedule_update': '소셜 수정',
    'shop_create': '쇼핑몰 등록',
    'venue_create': '장소 등록',
    'venue_update': '장소 수정',
    'page_view': '페이지 이동',
    'auth': '로그인',
    'board_post_create': '게시글 등록',
    'board_post_update': '게시글 수정',
    'board_memo_create': '익명 메모 등록',
    'board_memo_update': '익명 메모 수정'
};

const getTypeName = (type: string): string => TYPE_NAMES[type] || type;
const getAnalyticsUserDisplayName = (userId: string | null | undefined, nickname?: string | null) =>
    nickname || (userId ? `회원 ${userId.substring(0, 8)}` : '회원');
export default function SiteAnalyticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'summary' | 'daily'>('daily');
    const [userList, setUserList] = useState<UserInfo[]>([]);
    const [guestList, setGuestList] = useState<GuestInfo[]>([]);
    const [userCount, setUserCount] = useState(0);
    const [guestCount, setGuestCount] = useState(0);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailError, setDetailError] = useState('');
    const detailSequence = useRef(0);
    const reportRange = useRef({ start: '', end: '' });
    const [showUserList, setShowUserList] = useState(false);
    const [showGuestList, setShowGuestList] = useState(false);
    // [PHASE 20] Type Detail Modal State
    const [selectedTypeDetail, setSelectedTypeDetail] = useState<{ type: string; items: { title: string; count: number; url?: string }[] } | null>(null);
    const requestSequence = useRef(0);
    const [reportNotice, setReportNotice] = useState('');
    const [loadError, setLoadError] = useState('');
    // Helper: Get YYYY-MM-DD in Korean Time (UTC+9)
    const getKRDateString = (date: Date) => {
        // Use Intl API for accurate timezone conversion
        return new Intl.DateTimeFormat('fr-CA', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(date);
    };

    // 기본 날짜 범위를 오늘로 설정 (오늘 통계 모달 첫 화면)
    const [dateRange, setDateRange] = useState({
        start: getKRDateString(new Date()), // 오늘
        end: getKRDateString(new Date())    // 오늘
    });

    useEffect(() => {
        if (isOpen) {
            fetchAnalytics();
        }
        return () => { requestSequence.current += 1; detailSequence.current += 1; };
    }, [isOpen, dateRange.start, dateRange.end, viewMode]);

    const setShortcutRange = (days: number) => {
        // [FIX] KST 기준으로 날짜 계산
        const today = new Date();
        const todayKST = getKRDateString(today);

        let startKST, endKST;

        if (days === 0) {
            // Today
            startKST = todayKST;
            endKST = todayKST;
        } else if (days === 1) {
            // Yesterday
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayKST = getKRDateString(yesterday);
            startKST = yesterdayKST;
            endKST = yesterdayKST;
        } else {
            // Last N days
            const pastDate = new Date(today);
            pastDate.setDate(pastDate.getDate() - (days - 1));
            startKST = getKRDateString(pastDate);
            endKST = todayKST;
        }

        console.log(`[Analytics] Setting range: ${startKST} ~ ${endKST} (${days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days + ' days'})`);

        setDateRange({
            start: startKST,
            end: endKST
        });
    };

    const fetchAnalytics = async (forceRefresh = false) => {
        const requestId = ++requestSequence.current;
        const isCurrent = () => requestSequence.current === requestId;
        setLoading(true);
        detailSequence.current += 1;
        setShowUserList(false); setShowGuestList(false); setDetailLoading(false); setDetailError('');
        setSummary(null);
        setLoadError('');
        setReportNotice('');
        setUserList([]);
        setGuestList([]);
        try {
            let startStr: string, endStr: string;

            // Summary mode -> Fetch 1 year, Daily mode -> Selected range
            if (viewMode === 'summary') {
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - 365); // 1년치 데이터 (비지터 분석용)
                startStr = getKRDateString(past) + 'T00:00:00+09:00';
                endStr = getKRDateString(today) + 'T23:59:59.999+09:00';
            } else {
                startStr = dateRange.start + 'T00:00:00+09:00';
                endStr = dateRange.end + 'T23:59:59.999+09:00';
            }

            if (!Number.isFinite(Date.parse(startStr)) || !Number.isFinite(Date.parse(endStr)) || startStr > endStr) {
                throw new Error('조회 날짜를 확인해 주세요.');
            }
            const data = await loadAnalyticsReport(startStr, endStr, forceRefresh);
            if (!isCurrent()) return;
            if (data?.status === 'pending') {
                setReportNotice('서버에서 일별 통계를 준비 중입니다. 잠시 후 다시 조회해 주세요.');
                return;
            }
            if (!data?.report) throw new Error('통계 응답이 없습니다.');
            reportRange.current = { start: startStr, end: endStr };
            setUserCount(data.userCount ?? data.report.users.length);
            setGuestCount(data.guestCount ?? data.report.guests.length);
            setSummary(data.report.summary);
            setUserList(data.report.users);
            setGuestList(data.report.guests);
            setReportNotice(data.source === 'daily_snapshot'
                ? '마감된 일별 통계 · 저장된 결과입니다.'
                : data.source === 'saved_days'
                    ? '마감된 일별 자료를 합산한 기간 통계입니다.'
                    : data.stale ? '오늘 통계 자동 갱신이 지연되고 있습니다. 마지막 저장 결과입니다.'
                        : '오늘 통계는 서버에서 1분마다 갱신합니다.');
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
            if (isCurrent()) setLoadError('통계를 불러오지 못했습니다. 다시 시도해 주세요.');
        } finally {
            if (isCurrent()) setLoading(false);
        }
    };

    const loadVisitorDetails = async (kind: 'users' | 'guests', more = false) => {
        const sequence = ++detailSequence.current;
        const offset = more ? (kind === 'users' ? userList.length : guestList.length) : 0;
        if (kind === 'users') { setShowUserList(true); setShowGuestList(false); }
        else { setShowGuestList(true); setShowUserList(false); }
        setDetailLoading(true); setDetailError('');
        try {
            const range = reportRange.current;
            const data = await loadAnalyticsReport(range.start, range.end, false, kind, offset);
            if (detailSequence.current !== sequence) return;
            if (data?.status !== 'ready' || !data.report) throw new Error('상세 준비 중');
            if (kind === 'users') {
                setUserList(list => more ? [...list, ...data.report.users] : data.report.users);
                setUserCount(data.total);
            } else {
                setGuestList(list => more ? [...list, ...data.report.guests] : data.report.guests);
                setGuestCount(data.total);
            }
        } catch {
            if (detailSequence.current === sequence) setDetailError('상세 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
        } finally { if (detailSequence.current === sequence) setDetailLoading(false); }
    };

    // [PHASE 18] CSV Export 기능
    const exportToCSV = () => {
        if (!summary) return;

        const csv = [
            ['날짜', '활동 로그', '회원 활동', '비로그인 활동'],
            ...summary.daily_details.map(d => [
                d.date,
                d.total.toString(),
                d.user.toString(),
                d.guest.toString()
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // UTF-8 BOM
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics-${reportRange.current.start.slice(0, 10)}-${reportRange.current.end.slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // [PHASE 21] 트렌드 데이터 계산 (선택된 기간 전체 반영)
    const trendData = summary ? [...summary.daily_details].reverse() : [];

    const visitTrendData = summary && summary.daily_visit_trend ? [...summary.daily_visit_trend].reverse() : [];
    const maxVisitCount = visitTrendData.length > 0 ? Math.max(...visitTrendData.map(d => d.count)) : 0;

    const renderTypeShareChart = () => {
        if (!summary || summary.type_breakdown.length === 0) return null;
        const maxCount = Math.max(...summary.type_breakdown.map(tb => tb.count), 1);

        return (
            <div className="type-share-chart">
                {summary.type_breakdown.slice(0, 8).map(tb => {
                    const percent = summary.total_clicks > 0 ? (tb.count / summary.total_clicks) * 100 : 0;
                    const width = (tb.count / maxCount) * 100;
                    const items = summary.items_by_type?.[tb.type];

                    return (
                        <button
                            key={tb.type}
                            className="type-share-row"
                            onClick={() => items && setSelectedTypeDetail({ type: getTypeName(tb.type), items })}
                            title="클릭하여 상세 보기"
                            disabled={!items}
                        >
                            <span className="type-share-label">{getTypeName(tb.type)}</span>
                            <span className="type-share-track">
                                <span className="type-share-fill" style={{ width: `${width}%` }}></span>
                            </span>
                            <span className="type-share-value">{tb.count}</span>
                            <span className="type-share-percent">{percent.toFixed(1)}%</span>
                        </button>
                    );
                })}
            </div>
        );
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('ko-KR', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const formatDuration = (seconds: number | null | undefined) => {
        if (seconds === null || seconds === undefined) return '-';
        const safeSeconds = Math.max(0, Math.floor(seconds));
        const minutes = Math.floor(safeSeconds / 60);
        const rest = safeSeconds % 60;
        return minutes > 0 ? `${minutes}분 ${rest}초` : `${rest}초`;
    };

    const shortFingerprint = (fingerprint: string | null) => {
        if (!fingerprint) return 'fingerprint 없음';
        return fingerprint.length > 18 ? `${fingerprint.slice(0, 18)}...` : fingerprint;
    };

    const getDeviceLabel = (platform: string | null, userAgent: string | null) => {
        const p = (platform || '').toLowerCase();
        const ua = (userAgent || '').toLowerCase();
        if (ua.includes('android')) return 'Android';
        if (ua.includes('iphone')) return 'iPhone';
        if (ua.includes('ipad')) return 'iPad';
        if (ua.includes('windows') || p.includes('win')) return 'Windows';
        if (ua.includes('mac os') || p.includes('mac')) return 'macOS';
        if (ua.includes('cros')) return 'ChromeOS';
        if (ua.includes('linux') || p.includes('linux')) return 'Linux/기타';
        return platform || '기기 미기록';
    };

    const getPlatformRawLabel = (platform: string | null) => (
        platform ? `원시값: ${platform}` : '원시값 없음'
    );

    const getIpLabel = (ip: string | null) => (
        ip || '기록 없음 (이전 로그)'
    );

    const renderBottomMenuAppsPanel = (periodLabel?: string) => {
        const apps = summary?.bottom_menu_apps || [];
        if (apps.length === 0) return null;

        const totalClicks = apps.reduce((sum, app) => sum + app.count, 0);
        const uniqueVisitors = new Set(apps.flatMap(app => app.users.map(user => user.visitorKey))).size;
        const maxClicks = Math.max(...apps.map(app => app.count), 1);

        return (
            <div className="analytics-section-group bottom-menu-app-section">
                <div className="analytics-section-title">
                    <i className="ri-layout-bottom-2-line"></i> 하단 메뉴 앱 사용
                    {periodLabel && <span className="section-period">{periodLabel}</span>}
                </div>

                <div className="bottom-menu-app-kpis">
                    <div>
                        <span>앱 클릭</span>
                        <strong>{totalClicks.toLocaleString()}</strong>
                    </div>
                    <div>
                        <span>사용 앱</span>
                        <strong>{apps.length.toLocaleString()}</strong>
                    </div>
                    <div>
                        <span>사용자</span>
                        <strong>{uniqueVisitors.toLocaleString()}</strong>
                    </div>
                </div>

                <div className="bottom-menu-app-list">
                    {apps.slice(0, 12).map((app, index) => {
                        const percent = totalClicks > 0 ? (app.count / totalClicks) * 100 : 0;
                        const width = (app.count / maxClicks) * 100;

                        return (
                            <details key={app.id} className="bottom-menu-app-row" >
                                <summary>
                                    <span className="item-rank">{index + 1}</span>
                                    <span className="bottom-menu-app-main">
                                        <strong>{app.title}</strong>
                                        <span>
                                            {app.uniqueVisitors}명 · 로그인 클릭 {app.memberClicks}회 / 비로그인 클릭 {app.guestClicks}회
                                            {app.lastUsed && ` · 최근 ${formatDateTime(app.lastUsed)}`}
                                        </span>
                                        <span className="bottom-menu-app-meter">
                                            <span style={{ width: `${width}%` }}></span>
                                        </span>
                                    </span>
                                    <span className="bottom-menu-app-count">
                                        {app.count}
                                        <small>{percent.toFixed(1)}%</small>
                                    </span>
                                    <i className="ri-arrow-down-s-line bottom-menu-app-chevron"></i>
                                </summary>
                                <div className="bottom-menu-user-list">
                                    {app.users.length > 0 ? (
                                        app.users.map((user) => (
                                            <div key={`${app.id}-${user.visitorKey}`} className="bottom-menu-user-row">
                                                <span>
                                                    {user.label}
                                                    {user.isGuest && <small>비로그인</small>}
                                                </span>
                                                <strong>{user.count}회</strong>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="no-data-msg">사용자 데이터가 없습니다.</div>
                                    )}
                                </div>
                            </details>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="analytics-modal-overlay analytics-review" onClick={onClose} onDragStart={event => event.preventDefault()}>
            <div className="analytics-modal-content" role="dialog" aria-modal="true" aria-label="방문 통계" translate="no" onClick={e => e.stopPropagation()}>
                <div className="analytics-modal-header">
                    <div className="header-title-group">
                        <div className="title-left">
                            <h2><i className="ri-bar-chart-2-line"></i> 방문 통계</h2>
                            {summary && summary.daily_details.length > 0 && (
                                <button className="analytics-export-btn-mini" onClick={exportToCSV} title="일별 활동 CSV 다운로드" aria-label="일별 활동 CSV 다운로드">
                                    CSV
                                </button>
                            )}
                            <button className="refresh-btn" onClick={() => fetchAnalytics(true)} disabled={loading} title={viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 즉시 갱신' : '원본 기록으로 통계 다시 만들기'} aria-label={viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 즉시 갱신' : '원본 기록으로 통계 다시 만들기'}>
                                <i className={loading ? "ri-refresh-line spinning" : "ri-refresh-line"}></i>
                                <span style={{ fontSize: '0.75rem', marginLeft: 4, whiteSpace: 'nowrap' }}>{viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 갱신' : '통계 다시 만들기'}</span>
                            </button>
                        </div>
                        <div className="view-mode-tabs">
                            <button aria-pressed={viewMode === 'daily'} className={viewMode === 'daily' ? 'active' : ''} onClick={() => setViewMode('daily')}>기간 선택</button>
                            <button aria-pressed={viewMode === 'summary'} className={viewMode === 'summary' ? 'active' : ''} onClick={() => setViewMode('summary')}>최근 1년</button>
                        </div>
                    </div>

                    {/* [PHASE 9] 날짜 선택기: '날짜별 상세' 모드에서만 표시 */}
                    {viewMode === 'daily' && (
                        <div className="range-picker">
                            <div className="range-shortcuts">
                                <div className="date-navigator">
                                    <button aria-label="이전 날짜" onClick={() => {
                                        const base = new Date(`${dateRange.end}T00:00:00+09:00`);
                                        base.setDate(base.getDate() - 1);
                                        const newDate = getKRDateString(base);
                                        setDateRange({ start: newDate, end: newDate });
                                    }}>
                                        <span aria-hidden="true">‹</span>
                                    </button>
                                    <button
                                        className="current-date-display"
                                        onClick={() => setShortcutRange(0)}
                                        title="오늘로 이동"
                                    >
                                        {(() => {
                                            const today = getKRDateString(new Date());
                                            const yesterdayDate = new Date();
                                            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                                            const yesterday = getKRDateString(yesterdayDate);

                                            // Only show simple text if start === end
                                            if (dateRange.start === dateRange.end) {
                                                if (dateRange.end === today) return '오늘';
                                                if (dateRange.end === yesterday) return '어제';

                                                // Format: MM.DD (Weekday)
                                                const d = new Date(`${dateRange.end}T00:00:00+09:00`);
                                                const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                                                return `${d.getMonth() + 1}.${d.getDate()} (${weekdays[d.getDay()]})`;
                                            }
                                            return `${dateRange.start} ~ ${dateRange.end}`;
                                        })()}
                                    </button>
                                    <button aria-label="다음 날짜" disabled={dateRange.end >= getKRDateString(new Date())} onClick={() => {
                                        const base = new Date(`${dateRange.end}T00:00:00+09:00`);
                                        base.setDate(base.getDate() + 1);
                                        const newDate = getKRDateString(base);
                                        setDateRange({ start: newDate, end: newDate });
                                    }}>
                                        <span aria-hidden="true">›</span>
                                    </button>
                                </div>
                                <div className="period-buttons">
                                    <button onClick={() => setShortcutRange(0)}>오늘</button>
                                    <button onClick={() => setShortcutRange(1)}>어제</button>
                                    <button onClick={() => setShortcutRange(7)}>7일</button>
                                    <button onClick={() => setShortcutRange(30)}>30일</button>
                                </div>
                            </div>
                            <div className="range-inputs">
                                <div className="date-input-group">
                                    <label htmlFor="analytics-start">시작일</label>
                                    <input id="analytics-start" type="date" max={getKRDateString(new Date())} value={dateRange.start} onChange={e => e.target.value && setDateRange(prev => ({ start: e.target.value, end: e.target.value > prev.end ? e.target.value : prev.end }))} />
                                </div>
                                <span>→</span>
                                <div className="date-input-group">
                                    <label htmlFor="analytics-end">종료일</label>
                                    <input id="analytics-end" type="date" min={dateRange.start} max={getKRDateString(new Date())} value={dateRange.end} onChange={e => e.target.value && setDateRange(prev => ({ start: e.target.value < prev.start ? e.target.value : prev.start, end: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    )}

                    <button className="analytics-close-btn" aria-label="통계 닫기" onClick={onClose}><span aria-hidden="true">×</span></button>
                </div>

                <div className="analytics-modal-body">
                    {!loading && reportNotice && <p className="analytics-save-status" role="status">{reportNotice}</p>}
                    {loadError ? (
                        <div className="analytics-empty" role="alert">
                            <p>{loadError}</p>
                            <button onClick={() => fetchAnalytics()}>다시 시도</button>
                        </div>
                    ) : loading ? (
                        <div className="analytics-loading" role="status">통계 불러오는 중...{(viewMode === 'summary' || dateRange.start !== dateRange.end) && <small className="analytics-loading-note">저장된 일별 자료를 합산하고 있습니다. 긴 기간은 잠시 걸릴 수 있습니다.</small>}</div>
                    ) : summary && (summary.total_clicks > 0 || (summary.user_clicks || 0) + (summary.anon_clicks || 0) > 0) ? (
                        <div className="analytics-scroll-container analytics-overview">
                            <div className="analytics-period-heading">
                                <div><span>조회 기간 · 한국 날짜 기준</span><h3>{reportRange.current.start.slice(0, 10)}{reportRange.current.start.slice(0, 10) !== reportRange.current.end.slice(0, 10) && ` ~ ${reportRange.current.end.slice(0, 10)}`}</h3></div>
                                <span className="analytics-period-badge">{reportRange.current.end.slice(0, 10) === getKRDateString(new Date()) ? '오늘 포함' : '마감된 기간'}</span>
                            </div>
                            <div className="analytics-key-metrics">
                                <section className="analytics-metric analytics-metric-primary">
                                    <h3>고유 방문자</h3><strong>{((summary.user_clicks || 0) + (summary.anon_clicks || 0)).toLocaleString()}<small>명</small></strong>
                                    <p>선택한 기간 안에서 중복 제외</p>
                                    <div className="analytics-visitor-actions">
                                        <button className="breakdown-item clickable" disabled={!userCount} onClick={() => loadVisitorDetails('users')}>로그인 <b>{summary.user_clicks || 0}</b><span>명 ›</span></button>
                                        <button className="breakdown-item clickable" disabled={!guestCount} onClick={() => loadVisitorDetails('guests')}>비로그인 <b>{summary.anon_clicks || 0}</b><span>명 ›</span></button>
                                    </div>
                                </section>
                                <section className="analytics-metric"><h3>방문 횟수</h3><strong>{(summary.visitor_summary?.session_total ?? summary.session_stats?.total_sessions ?? 0).toLocaleString()}<small>회</small></strong><p>같은 방문자의 30분 이내 기록을 묶음</p></section>
                                <section className="analytics-metric"><h3>사이트 활동</h3><strong>{summary.total_clicks.toLocaleString()}<small>회</small></strong><p>클릭·페이지 이동 등 수집된 활동</p></section>
                                <section className="analytics-metric"><h3>평균 활성 체류</h3><strong className="analytics-duration">{summary.session_stats ? formatDuration(summary.session_stats.avg_duration) : '기록 없음'}</strong><p>체류 기록이 있는 방문 기준 · 최대 30분</p></section>
                            </div>
                            {visitTrendData.length > 1 && <section className="analytics-panel">
                                <h3>일별 방문자 추이</h3><p>날짜마다 중복을 제외한 방문자입니다. 일별 합계는 기간 전체 방문자 수와 다를 수 있습니다.</p>
                                <div className="analytics-daily-chart" tabIndex={0} aria-label="일별 고유 방문자 그래프. 좌우로 스크롤하여 확인할 수 있습니다.">
                                    {visitTrendData.map(day => <div key={day.date} className="analytics-day" title={`${day.date} · ${day.count}명`}><span>{day.count}</span><div><i style={{height: `${maxVisitCount ? day.count / maxVisitCount * 100 : 0}%`}} /></div><small>{day.date.slice(5).replace('-', '/')}</small></div>)}
                                </div>
                                <details className="analytics-inline-details"><summary>일별 방문자·활동 수치 보기</summary><div className="analytics-table-wrap"><table><thead><tr><th>날짜</th><th>방문자</th><th>활동</th></tr></thead><tbody>{visitTrendData.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.count.toLocaleString()}명</td><td>{(trendData.find(d => d.date === day.date)?.total ?? 0).toLocaleString()}회</td></tr>)}</tbody></table></div></details>
                            </section>}
                            <div className="analytics-content-grid">
                                <section className="analytics-panel"><h3>많이 이용한 콘텐츠</h3><p>수집된 활동 횟수 기준 · 상위 20개</p><div className="ranking-list">
                                    {summary.total_top_items.length ? summary.total_top_items.map((item, index) => <div className="ranking-item" key={`${item.type}-${index}`}><span className="item-rank">{index + 1}</span><div className="item-info"><span className="item-title">{item.title}</span><span className="item-meta">{getTypeName(item.type)}</span></div><span className="item-count">{item.count.toLocaleString()}회</span></div>) : <p>집계된 콘텐츠 활동이 없습니다.</p>}
                                </div></section>
                                <section className="analytics-panel"><h3>어디서 들어왔나요?</h3><p>방문 기록의 유입 경로 · 상위 10개</p><div className="ranking-list">
                                    {summary.referrer_stats?.length ? summary.referrer_stats.map((ref, index) => <div className="ranking-item" key={ref.source}><span className="item-rank">{index + 1}</span><div className="item-info"><span className="item-title">{ref.source}</span></div><span className="item-count">{ref.count.toLocaleString()}회</span></div>) : <p>집계된 유입 기록이 없습니다.</p>}
                                </div></section>
                            </div>
                            <details className="analytics-panel analytics-expanded"><summary>활동 종류·메뉴 이용 상세</summary><p>종류별 비율은 전체 활동 횟수 기준입니다. 항목을 누르면 상세 목록을 볼 수 있습니다.</p>{renderTypeShareChart()}{renderBottomMenuAppsPanel()}</details>
                            <details className="analytics-panel analytics-expanded"><summary>접속 패턴·앱 이용 상세</summary>
                                {summary.visitor_stats && <div className="analytics-content-grid">
                                    <section><h3>요일별 방문 횟수</h3><div className="analytics-pattern-bars">{summary.visitor_stats.weekday.map(day => <div key={day.day}><span>{day.day}</span><meter min={0} max={Math.max(...summary.visitor_stats!.weekday.map(d => d.count), 1)} value={day.count} /><b>{day.count}회</b></div>)}</div></section>
                                    <section><h3>시간대별 방문 횟수</h3><div className="analytics-daily-chart" tabIndex={0} aria-label="시간대별 방문 횟수"><>{summary.visitor_stats.hourly.map(hour => <div className="analytics-day" key={hour.hour} title={`${hour.hour}시 · ${hour.count}회`}><span>{hour.count}</span><div><i style={{height: `${hour.ratio}%`}} /></div><small>{hour.hour}시</small></div>)}</></div></section>
                                </div>}
                                {summary.pwa_stats && <section className="analytics-app-usage"><h3>설치형 앱으로 접속한 비율 <b>{summary.pwa_stats.pwa_percentage.toFixed(1)}%</b></h3><p>앱 접속 {summary.pwa_stats.pwa_sessions.toLocaleString()}회 · 브라우저 접속 {summary.pwa_stats.browser_sessions.toLocaleString()}회</p><p>접속 기록 기준이며, 설치한 사람 수나 현재 접속자 수를 뜻하지 않습니다.</p></section>}
                            </details>
                            <details className="analytics-panel analytics-expanded"><summary>숫자를 읽는 기준</summary><ul>
                                <li>고유 방문자는 회원 ID와 기기 식별 정보를 기준으로 중복을 제외합니다. 실제 사람 수와는 차이가 있을 수 있습니다.</li>
                                <li>방문 횟수는 같은 방문자의 30분 이내 기록을 합친 값입니다. 재방문하면 한 사람이 여러 번 집계될 수 있습니다.</li>
                                <li>사이트 활동은 페이지 조회 수(PV)나 클릭 수만을 뜻하지 않습니다.</li>
                                <li>관리자·봇·내부 경로 등 기존 제외 기준을 적용한 결과입니다.</li>
                                <li>지난 날짜는 저장된 마감 결과를 읽습니다. 오늘은 서버에서 1분마다 갱신하며 이 화면에는 조회 시점의 저장 결과가 표시됩니다.</li>
                            </ul></details>
                        </div>
                    ) : (
                        <div className="analytics-empty">
                            <i className="ri-inbox-line"></i>
                            <p>{reportNotice.includes('준비 중') ? '일별 통계가 아직 준비되지 않았습니다.' : '선택한 기간에 집계 대상 방문 기록이 없습니다.'}</p>
                            {reportNotice.includes('준비 중') && <button onClick={() => fetchAnalytics()}>다시 조회</button>}
                        </div>
                    )}

                    {/* 사용자 목록 팝업 */}
                    {showUserList && (
                        <div className="user-list-overlay" onClick={() => setShowUserList(false)}>
                            <div className="user-list-modal user-activity-modal" onClick={e => e.stopPropagation()}>
                                <div className="user-list-header">
                                    <h3>
                                        <span style={{ color: '#fbbf24', marginRight: '8px' }}>
                                            {viewMode === 'summary'
                                                ? '최근 1년'
                                                : dateRange.start === dateRange.end
                                                    ? `${dateRange.start}`
                                                    : `${dateRange.start} ~ ${dateRange.end}`}
                                        </span>
                                        로그인 사용자 목록 ({userCount}명)
                                    </h3>
                                    <button aria-label="로그인 목록 닫기" onClick={() => setShowUserList(false)}><span aria-hidden="true">×</span></button>
                                </div>
                                <div className="user-list-body">
                                    {userList.map((user, index) => {
                                        const userSessions = user.sessions || [];
                                        const activityLogs = user.activityLogs || [];

                                        return (
                                            <div key={user.user_id} className="user-list-item-wrapper">
                                                <div className="user-list-item clickable user-activity-item">
                                                    <details style={{ width: '100%' }}>
                                                        <summary className="user-activity-summary">
                                                            <span className="user-index">{index + 1}</span>
                                                            <span className="user-activity-main">
                                                                <span className="user-name">
                                                                    {getAnalyticsUserDisplayName(user.user_id, user.nickname)}
                                                                    <span className="guest-count">({user.visitCount}회)</span>
                                                                </span>
                                                                <span className="guest-subline">
                                                                    활동 {user.activityCount || 0}회 · 하단메뉴 {user.bottomMenuClicks || 0}회 · {user.pageViews || 0}PV · 최근 {user.lastPage || '-'}
                                                                </span>
                                                            </span>

                                                            <i className="ri-arrow-down-s-line" style={{ marginLeft: 'auto', color: '#71717a' }}></i>
                                                        </summary>

                                                        <div className="user-activity-detail">
                                                            <div className="activity-privacy-note">
                                                                운영/보안 목적의 사이트 활동 기록입니다. 비밀번호, 검색어 전문, 입력 중인 내용은 수집하지 않습니다.
                                                            </div>

                                                            <div className="guest-detail-grid">
                                                                <div><span>계정 ID</span><strong>{user.user_id}</strong></div>
                                                                <div><span>평균 체류</span><strong>{formatDuration(user.avgDuration || 0)}</strong></div>
                                                                <div><span>방문 횟수</span><strong>{user.visitCount}개</strong></div>
                                                                <div><span>활동 로그</span><strong>{user.activityCount || 0}개</strong></div>
                                                                <div><span>하단 메뉴</span><strong>{user.bottomMenuClicks || 0}회</strong></div>
                                                                <div><span>페이지뷰</span><strong>{user.pageViews || 0}회</strong></div>
                                                                <div><span>최근 경로</span><strong>{user.lastPage || '-'}</strong></div>
                                                            </div>

                                                            {userSessions.length > 0 && (
                                                                <div className="user-section-block">
                                                                    <h4>최근 방문 기록 (최대 12개)</h4>
                                                                    <div className="guest-session-list">
                                                                        {userSessions.slice(0, 12).map((session, sessionIndex) => (
                                                                            <div key={`${session.session_id || sessionIndex}-${sessionIndex}`} className="guest-session-row">
                                                                                <div>
                                                                                    <strong>{formatDateTime(session.session_start)}</strong>
                                                                                    <span>{session.entry_page || '-'}{session.exit_page && session.exit_page !== session.entry_page ? ` → ${session.exit_page}` : ''}</span>
                                                                                </div>
                                                                                <div className="guest-session-meta">
                                                                                    <span>{formatDuration(session.duration_seconds)}</span>
                                                                                    <span>{session.page_views}PV</span>
                                                                                    <span>{session.total_clicks}클릭</span>
                                                                                    <span>{getDeviceLabel(session.platform, session.user_agent)}</span>
                                                                                    <span>{getIpLabel(session.client_ip)}</span>
                                                                                    {session.ip_hash && <span>hash {session.ip_hash}</span>}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div className="user-section-block">
                                                                <h4>최근 활동 기록 (최대 80개)</h4>
                                                                {activityLogs.length > 0 ? (
                                                                    <div className="user-activity-timeline">
                                                                        {activityLogs.slice(0, 80).map((activity) => (
                                                                            <div key={activity.id} className="user-activity-row">
                                                                                <span className="activity-dot"></span>
                                                                                <div className="activity-body">
                                                                                    <div className="activity-row-head">
                                                                                        <strong>{getTypeName(activity.type)}</strong>
                                                                                        <span>{formatDateTime(activity.created_at)}</span>
                                                                                    </div>
                                                                                    <div className="activity-title">{activity.title || activity.target_id || activity.page_url || '-'}</div>
                                                                                    <div className="activity-meta">
                                                                                        <span>{activity.page_url || activity.route || '-'}</span>
                                                                                        {activity.section && <span>{activity.section}</span>}
                                                                                        {activity.session_id && <span>session {activity.session_id.substring(0, 8)}...</span>}
                                                                                        <span>{getDeviceLabel(activity.platform, activity.user_agent)}</span>
                                                                                        <span>{getIpLabel(activity.client_ip)}</span>
                                                                                        {activity.ip_hash && <span>hash {activity.ip_hash}</span>}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="no-data-msg">해당 기간의 활동 로그가 없습니다.</div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </details>
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {detailLoading && <p role="status">상세 목록 불러오는 중...</p>}
                                    {detailError && <p role="alert">{detailError}</p>}
                                    {!detailLoading && (detailError || userList.length < userCount) && (
                                        <button onClick={() => loadVisitorDetails('users', userList.length > 0)}>
                                            {detailError ? '다시 시도' : `더 보기 (${userList.length}/${userCount})`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 비로그인 방문자 목록 팝업 */}
                    {showGuestList && (
                        <div className="user-list-overlay" onClick={() => setShowGuestList(false)}>
                            <div className="user-list-modal guest-list-modal" onClick={e => e.stopPropagation()}>
                                <div className="user-list-header">
                                    <h3>
                                        <span style={{ color: '#fbbf24', marginRight: '8px' }}>
                                            {viewMode === 'summary'
                                                ? '최근 1년'
                                                : dateRange.start === dateRange.end
                                                    ? `${dateRange.start}`
                                                    : `${dateRange.start} ~ ${dateRange.end}`}
                                        </span>
                                        비로그인 방문자 목록 ({guestCount}명)
                                    </h3>
                                    <button aria-label="비로그인 목록 닫기" onClick={() => setShowGuestList(false)}><span aria-hidden="true">×</span></button>
                                </div>
                                <div className="user-list-body">
                                    {guestList.map((guest, index) => (
                                        <div key={guest.key} className="user-list-item-wrapper">
                                            <div className="user-list-item clickable guest-list-item">
                                                <details style={{ width: '100%' }}>
                                                    <summary className="guest-summary">
                                                        <span className="user-index">{index + 1}</span>
                                                        <span className="guest-main">
                                                            <span className="user-name">
                                                                {guest.label}
                                                                <span className="guest-count">({guest.visitCount}회)</span>
                                                            </span>
                                                            <span className="guest-subline">
                                                                {getDeviceLabel(guest.platform, guest.userAgent)} · 활동 {guest.clickCount}회
                                                            </span>
                                                        </span>
                                                        <span className="guest-chip">{guest.isPwa ? '앱' : '브라우저'}</span>
                                                        <i className="ri-arrow-down-s-line" style={{ marginLeft: 'auto', color: '#71717a' }}></i>
                                                    </summary>
                                                    <div className="guest-detail-panel">
                                                        <div className="guest-detail-grid">


                                                            <div><span>기기/OS</span><strong>{getDeviceLabel(guest.platform, guest.userAgent)}</strong></div>

                                                            <div><span>최근 페이지</span><strong>{guest.lastPage || '-'}</strong></div>
                                                            <div><span>첫 방문</span><strong>{formatDateTime(guest.firstSeen)}</strong></div>
                                                            <div><span>최근 방문</span><strong>{formatDateTime(guest.lastSeen)}</strong></div>
                                                            <div><span>세션</span><strong>{guest.sessionCount}개</strong></div>
                                                            <div><span>활동</span><strong>{guest.clickCount}회</strong></div>
                                                            <div><span>페이지뷰</span><strong>{guest.pageViews}회</strong></div>
                                                            <div><span>유입</span><strong>{guest.referrer || '직접/내부'}</strong></div>
                                                        </div>
                                                        <details className="analytics-inline-details"><summary>운영 확인용 기기 정보</summary><div className="guest-detail-grid">
                                                            <div><span>IP</span><strong>{getIpLabel(guest.clientIp)}</strong></div>
                                                            <div><span>IP Hash</span><strong>{guest.ipHash || '기록 없음'}</strong></div>
                                                            <div><span>기기 식별값</span><strong>{shortFingerprint(guest.fingerprint)}</strong></div>
                                                            <div><span>기기 원시값</span><strong>{getPlatformRawLabel(guest.platform)}</strong></div>
                                                        </div><div className="guest-user-agent"><span>User-Agent</span><strong>{guest.userAgent || '기록 없음'}</strong></div></details>
                                                        {guest.sessions.length > 0 && (
                                                            <div className="guest-session-list">
                                                                {guest.sessions.slice(0, 12).map((session, sessionIndex) => (
                                                                    <div key={`${session.session_id || sessionIndex}-${sessionIndex}`} className="guest-session-row">
                                                                        <div>
                                                                            <strong>{formatDateTime(session.session_start)}</strong>
                                                                            <span>{session.entry_page || '-'}{session.exit_page && session.exit_page !== session.entry_page ? ` → ${session.exit_page}` : ''}</span>
                                                                        </div>
                                                                        <div className="guest-session-meta">
                                                                            <span>{formatDuration(session.duration_seconds)}</span>
                                                                            <span>{session.page_views}PV</span>
                                                                            <span>{session.total_clicks}클릭</span>
                                                                            <span>{getDeviceLabel(session.platform, session.user_agent)}</span>
                                                                            {session.client_ip && <span>{session.client_ip}</span>}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {guest.activityLogs && guest.activityLogs.length > 0 && (
                                                            <div className="user-section-block">
                                                                <h4>최근 활동 기록 (최대 80개)</h4>
                                                                <div className="activity-privacy-note">
                                                                    운영/보안 목적의 사이트 활동 기록입니다. 비밀번호, 검색어 전문, 입력 중인 내용은 수집하지 않습니다.
                                                                </div>
                                                                <div className="user-activity-timeline">
                                                                    {guest.activityLogs.slice(0, 80).map((activity) => (
                                                                        <div key={activity.id} className="user-activity-row">
                                                                            <span className="activity-dot"></span>
                                                                            <div className="activity-body">
                                                                                <div className="activity-row-head">
                                                                                    <strong>{getTypeName(activity.type)}</strong>
                                                                                    <span>{formatDateTime(activity.created_at)}</span>
                                                                                </div>
                                                                                <div className="activity-title">{activity.title || activity.target_id || activity.page_url || '-'}</div>
                                                                                <div className="activity-meta">
                                                                                    <span>{activity.page_url || activity.route || '-'}</span>
                                                                                    {activity.section && <span>{activity.section}</span>}
                                                                                    {activity.session_id && <span>session {activity.session_id.substring(0, 8)}...</span>}
                                                                                    <span>{getDeviceLabel(activity.platform, activity.user_agent)}</span>
                                                                                    <span>{getIpLabel(activity.client_ip)}</span>
                                                                                    {activity.ip_hash && <span>hash {activity.ip_hash}</span>}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            </div>
                                        </div>
                                    ))}
                                    {detailLoading && <p role="status">상세 목록 불러오는 중...</p>}
                                    {detailError && <p role="alert">{detailError}</p>}
                                    {!detailLoading && (detailError || guestList.length < guestCount) && (
                                        <button onClick={() => loadVisitorDetails('guests', guestList.length > 0)}>
                                            {detailError ? '다시 시도' : `더 보기 (${guestList.length}/${guestCount})`}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Type Detail Modal */}
                    {selectedTypeDetail && (
                        <div className="user-list-overlay" onClick={() => setSelectedTypeDetail(null)}>
                            <div className="user-list-modal" onClick={e => e.stopPropagation()}>
                                <div className="user-list-header">
                                    <h3><i className="ri-list-check"></i> {selectedTypeDetail.type} 상세 통계</h3>
                                    <button aria-label="활동 상세 닫기" onClick={() => setSelectedTypeDetail(null)}><span aria-hidden="true">×</span></button>
                                </div>
                                <div className="user-list-body">
                                    {selectedTypeDetail.items.map((item, index) => (
                                        <div key={index} className="user-list-item">
                                            <span className="user-index">{index + 1}</span>
                                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                <span className="user-name" style={{ fontSize: '0.9rem' }}>{item.title}</span>
                                                {item.url && (
                                                    <a
                                                        href={item.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ fontSize: '0.75rem', color: '#60a5fa', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {item.url}
                                                    </a>
                                                )}
                                            </div>
                                            <span className="user-id" style={{ color: '#60a5fa', fontWeight: 'bold', flexShrink: 0 }}>{item.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
