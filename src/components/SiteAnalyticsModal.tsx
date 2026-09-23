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
    // 데스크탑/모바일 레이아웃 분기 (JS 감지, CSS 반응형 사용하지 않음)
    const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
    useEffect(() => {
        const handler = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

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
            ['날짜', '활동 로그', '회원 활동', 'Guest 활동'],
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
        a.download = `analytics-${dateRange.start}-${dateRange.end}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // [PHASE 21] 트렌드 데이터 계산 (선택된 기간 전체 반영)
    const trendData = summary ? [...summary.daily_details].reverse() : [];
    const maxDayClicks = trendData.length > 0 ? Math.max(...trendData.map(d => d.total)) : 0;

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

    const renderQuickInsights = () => {
        if (!summary) return null;

        const totalVisitors = (summary.user_clicks || 0) + (summary.anon_clicks || 0);
        const loginRatio = totalVisitors > 0 ? ((summary.user_clicks || 0) / totalVisitors) * 100 : 0;
        const topType = summary.type_breakdown[0];
        const topTypeShare = topType && summary.total_clicks > 0 ? (topType.count / summary.total_clicks) * 100 : 0;
        const topReferrer = summary.referrer_stats?.[0];
        const totalReferrerCount = (summary.referrer_stats || []).reduce((sum, ref) => sum + ref.count, 0);
        const topReferrerShare = topReferrer && totalReferrerCount > 0 ? (topReferrer.count / totalReferrerCount) * 100 : 0;
        const bounceRate = summary.session_stats?.bounce_rate ?? 0;
        const engagementRate = summary.session_stats?.engagement_rate ?? Math.max(0, 100 - bounceRate);
        const avgDuration = summary.session_stats?.avg_duration ?? 0;

        return (
            <div className="insight-panel">
                <div className="insight-panel-title"><i className="ri-sparkling-line"></i> 운영 체크</div>
                <div className="insight-grid">
                    <div className="insight-card">
                        <span className="insight-label">회원 전환</span>
                        <strong>{loginRatio.toFixed(1)}%</strong>
                        <small>{loginRatio >= 35 ? '로그인 방문 양호' : '비로그인 방문 중심'}</small>
                        <div className="insight-meter"><span style={{ width: `${loginRatio}%` }}></span></div>
                    </div>
                    <div className="insight-card">
                        <span className="insight-label">활동 집중도</span>
                        <strong>{topType ? getTypeName(topType.type) : '-'}</strong>
                        <small>{topType ? `${topType.count}회 · ${topTypeShare.toFixed(1)}%` : '데이터 없음'}</small>
                    </div>
                    <div className="insight-card">
                        <span className="insight-label">유입 의존도</span>
                        <strong>{topReferrer?.source || '-'}</strong>
                        <small>{topReferrer ? `${topReferrer.count}회 · ${topReferrerShare.toFixed(1)}%` : '데이터 없음'}</small>
                    </div>
                    <div className="insight-card">
                        <span className="insight-label">체류 품질</span>
                        <strong>{Math.floor(avgDuration / 60)}분 {avgDuration % 60}초</strong>
                        <small>참여율 {engagementRate.toFixed(1)}% · 이탈 {bounceRate.toFixed(1)}%</small>
                        <div className="insight-meter"><span style={{ width: `${Math.min(engagementRate, 100)}%` }}></span></div>
                    </div>
                </div>
            </div>
        );
    };

    const renderSessionPwaPanel = (periodLabel?: string) => {
        if (!summary?.session_stats && !summary?.pwa_stats) return null;

        return (
            <div className="analytics-section-group top-kpi-card session-pwa-section">
                <div className="analytics-section-title">
                    <i className="ri-dashboard-3-line"></i> 세션 & PWA
                    {periodLabel && <span className="section-period">{periodLabel}</span>}
                </div>
                <div className="session-pwa-layout">
                    {summary.session_stats && (
                        <div className="session-panel">
                            <div className="panel-kicker">세션 품질</div>
                            <div className="session-main-number">
                                {Math.floor(summary.session_stats.avg_duration / 60)}분 {summary.session_stats.avg_duration % 60}초
                                <span>평균 활성 체류시간 · 30분 cap</span>
                            </div>
                            <div className="session-metric-row">
                                <div>
                                    <span>보정 세션</span>
                                    <strong>{summary.session_stats.total_sessions}</strong>
                                    {summary.session_stats.raw_sessions !== undefined && summary.session_stats.raw_sessions !== summary.session_stats.total_sessions && (
                                        <small>원본 {summary.session_stats.raw_sessions}</small>
                                    )}
                                </div>
                                <div>
                                    <span>참여율</span>
                                    <strong>{(summary.session_stats.engagement_rate ?? Math.max(0, 100 - summary.session_stats.bounce_rate)).toFixed(1)}%</strong>
                                    <small>중앙값 {Math.floor((summary.session_stats.median_duration || 0) / 60)}분 {(summary.session_stats.median_duration || 0) % 60}초</small>
                                </div>
                            </div>
                        </div>
                    )}
                    {summary.pwa_stats && (
                        <div className="pwa-panel">
                            <div className="panel-kicker">앱 사용 비율</div>
                            <div className="pwa-donut-panel">
                                <div className="pwa-donut" style={{ '--pwa-ratio': `${summary.pwa_stats.pwa_percentage * 3.6}deg` } as React.CSSProperties}>
                                    <span>{summary.pwa_stats.pwa_percentage.toFixed(0)}%</span>
                                </div>
                                <div className="donut-legend">
                                    <span><i className="legend-dot pwa"></i>PWA {summary.pwa_stats.pwa_sessions}</span>
                                    <span><i className="legend-dot browser"></i>브라우저 {summary.pwa_stats.browser_sessions}</span>
                                    <span><i className="legend-dot install"></i>설치 {summary.pwa_stats.total_installs}</span>
                                </div>
                            </div>
                            <div className="pwa-duration-comparison compact">
                                <div className="comparison-row"><span>PWA 체류</span><strong>{Math.floor(summary.pwa_stats.avg_pwa_duration / 60)}분 {summary.pwa_stats.avg_pwa_duration % 60}초</strong></div>
                                <div className="comparison-row"><span>브라우저 체류</span><strong>{Math.floor(summary.pwa_stats.avg_browser_duration / 60)}분 {summary.pwa_stats.avg_browser_duration % 60}초</strong></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const formatDateTime = (value: string | null) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('ko-KR', {
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
                            <details key={app.id} className="bottom-menu-app-row" open={index < 3}>
                                <summary>
                                    <span className="item-rank">{index + 1}</span>
                                    <span className="bottom-menu-app-main">
                                        <strong>{app.title}</strong>
                                        <span>
                                            {app.uniqueVisitors}명 · 회원 {app.memberClicks} / Guest {app.guestClicks}
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
                                                    {user.isGuest && <small>Guest</small>}
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
        <div className="analytics-modal-overlay" onClick={onClose} onDragStart={event => event.preventDefault()}>
            <div className="analytics-modal-content" translate="no" onClick={e => e.stopPropagation()}>
                <div className="analytics-modal-header">
                    <div className="header-title-group">
                        <div className="title-left">
                            <h2><i className="ri-bar-chart-2-line"></i> 운영 통계 리포트</h2>
                            {summary && summary.daily_details.length > 0 && (
                                <button className="analytics-export-btn-mini" onClick={exportToCSV} title="CSV로 내보내기">
                                    <i className="ri-download-line"></i>
                                </button>
                            )}
                            <button className="refresh-btn" onClick={() => fetchAnalytics(true)} disabled={loading} title={viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 즉시 갱신' : '원본 기록으로 통계 다시 만들기'} aria-label={viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 즉시 갱신' : '원본 기록으로 통계 다시 만들기'}>
                                <i className={loading ? "ri-refresh-line spinning" : "ri-refresh-line"}></i>
                                <span style={{ fontSize: '0.75rem', marginLeft: 4, whiteSpace: 'nowrap' }}>{viewMode === 'summary' || dateRange.end === getKRDateString(new Date()) ? '오늘 통계 갱신' : '통계 다시 만들기'}</span>
                            </button>
                        </div>
                        <div className="view-mode-tabs">
                            <button className={viewMode === 'summary' ? 'active' : ''} onClick={() => setViewMode('summary')}>전체 요약</button>
                            <button className={viewMode === 'daily' ? 'active' : ''} onClick={() => setViewMode('daily')}>날짜별 상세</button>
                        </div>
                    </div>

                    {/* [PHASE 9] 날짜 선택기: '날짜별 상세' 모드에서만 표시 */}
                    {viewMode === 'daily' && (
                        <div className="range-picker">
                            <div className="range-shortcuts">
                                <div className="date-navigator">
                                    <button onClick={() => {
                                        const base = new Date(`${dateRange.end}T00:00:00+09:00`);
                                        base.setDate(base.getDate() - 1);
                                        const newDate = getKRDateString(base);
                                        setDateRange({ start: newDate, end: newDate });
                                    }}>
                                        <i className="ri-arrow-left-s-line"></i>
                                    </button>
                                    <span
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
                                    </span>
                                    <button onClick={() => {
                                        const base = new Date(`${dateRange.end}T00:00:00+09:00`);
                                        base.setDate(base.getDate() + 1);
                                        const newDate = getKRDateString(base);
                                        setDateRange({ start: newDate, end: newDate });
                                    }}>
                                        <i className="ri-arrow-right-s-line"></i>
                                    </button>
                                </div>
                                <div className="period-buttons">
                                    <button onClick={() => setShortcutRange(7)}>7일</button>
                                    <button onClick={() => setShortcutRange(30)}>30일</button>
                                </div>
                            </div>
                            <div className="range-inputs">
                                <div className="date-input-group">
                                    <label>시작일</label>
                                    <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                                </div>
                                <span>→</span>
                                <div className="date-input-group">
                                    <label>종료일</label>
                                    <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                    )}

                    <button className="analytics-close-btn" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="analytics-modal-body">
                    {!loading && reportNotice && <p className="no-data-msg" role="status">{reportNotice}</p>}
                    {loadError ? (
                        <div className="analytics-empty" role="alert">
                            <p>{loadError}</p>
                            <button onClick={() => fetchAnalytics()}>다시 시도</button>
                        </div>
                    ) : loading ? (
                        <div className="analytics-loading">통계 불러오는 중...</div>
                    ) : summary && (summary.total_clicks > 0 || (summary.user_clicks || 0) + (summary.anon_clicks || 0) > 0) ? (
                        <div className="analytics-scroll-container">

                            {/* ===== 전체 요약 탭 ===== */}
                            {viewMode === 'summary' && (
                                <div className={isMobile ? "summary-view-content" : "desktop-summary-content"}>

                                    {/* S1: 방문자 현황 */}
                                    <div className="analytics-section-group top-kpi-card">
                                        <div className="analytics-section-title"><i className="ri-user-3-line"></i> 방문자 현황 <span className="section-period">최근 1년</span></div>
                                        {(summary.user_clicks !== undefined || summary.anon_clicks !== undefined) && (
                                            <div className="analytics-hero-card">
                                                <h3 className="hero-title">
                                                    고유 방문자
                                                    <span className="hero-title-desc">회원 ID/기기 기준 중복 제외</span>
                                                </h3>
                                                <div className="hero-number">
                                                    {(summary.user_clicks || 0) + (summary.anon_clicks || 0)}
                                                    <span className="unit">명</span>
                                                </div>
                                                <div className="visitor-ratio-bar">
                                                    <div className="ratio-fill-user" style={{ width: `${((summary.user_clicks || 0) / ((summary.user_clicks || 0) + (summary.anon_clicks || 1)) * 100)}%` }}></div>
                                                </div>
                                                <div className="visitor-breakdown">
                                                    <div className="breakdown-item clickable" onClick={() => userCount > 0 && loadVisitorDetails('users')}>
                                                        <span className="label"><i className="ri-user-smile-line"></i> 로그인</span>
                                                        <span className="value highlight-blue">{summary.user_clicks || 0}</span>
                                                    </div>
                                                    <div className="breakdown-separator"></div>
                                                    <div className="breakdown-item clickable" onClick={() => guestCount > 0 && loadVisitorDetails('guests')}>
                                                        <span className="label" title="로그인하지 않은 기기 기준"><i className="ri-user-line"></i> Guest</span>
                                                        <span className="value highlight-gray">{summary.anon_clicks || 0}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="analytics-sub-stats">
                                            <div className="sub-stat-item">
                                                <div className="label-group">
                                                    <span className="label">보정 세션</span>
                                                    <span className="label-desc">30분 내 조각 병합</span>
                                                </div>
                                                <span className="value">{(summary.visitor_summary?.session_total ?? summary.session_stats?.total_sessions ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="sub-stat-item">
                                                <div className="label-group">
                                                    <span className="label">활동 로그</span>
                                                    <span className="label-desc">클릭/링크 이벤트</span>
                                                </div>
                                                <span className="value">{(summary.total_pv || 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {renderSessionPwaPanel('최근 1년')}
                                    {renderBottomMenuAppsPanel('최근 1년')}

                                    {/* S4: 접속 패턴 분석 (요일/시간대/월별) */}
                                    {summary.visitor_stats && (
                                        <div className="analytics-section-group">
                                            <div className="analytics-section-title"><i className="ri-pulse-line"></i> 접속 패턴 분석</div>
                                            <div className="analytics-grid visitor-stats-grid">
                                                <div className="grid-section full-width">
                                                    <h3><i className="ri-calendar-event-line"></i> 요일별 방문 집중도</h3>
                                                    <div className="trend-chart-container" style={{ height: '180px', marginTop: '1rem', alignItems: 'flex-end' }}>
                                                        {summary.visitor_stats.weekday.map((d, i) => (
                                                            <div key={i} className="trend-bar-wrapper" style={{ flex: 1 }}>
                                                                <div className="trend-bar-at-bottom">
                                                                    <div className="trend-bar-fill" style={{ height: `${d.ratio}%`, backgroundColor: d.ratio > 80 ? '#fbbf24' : '#60a5fa' }}>
                                                                        <span className="trend-tooltip">{d.count}회</span>
                                                                    </div>
                                                                </div>
                                                                <span className="trend-label">{d.day}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid-section full-width">
                                                    <h3><i className="ri-time-line"></i> 시간대별 접속량 (Peak Time)</h3>
                                                    <div className="trend-chart-container" style={{ height: '180px', marginTop: '1rem', overflowX: 'auto' }}>
                                                        {summary.visitor_stats.hourly.map((h, i) => (
                                                            <div key={i} className="trend-bar-wrapper" style={{ minWidth: '30px', flex: 1 }}>
                                                                <div className="trend-bar-at-bottom">
                                                                    <div className="trend-bar-fill" style={{ height: `${h.ratio}%`, backgroundColor: h.ratio > 80 ? '#fbbf24' : '#a78bfa' }}>
                                                                        <span className="trend-tooltip">{h.count}</span>
                                                                    </div>
                                                                </div>
                                                                <span className="trend-label" style={{ fontSize: '0.7rem' }}>{h.hour}시</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid-section full-width">
                                                    <h3><i className="ri-calendar-line"></i> 월별 보정 세션 추이</h3>
                                                    <div className="trend-chart-container" style={{ height: '180px', marginTop: '1rem' }}>
                                                        {summary.visitor_stats.monthly.length === 0 ? (
                                                            <div style={{ width: '100%', textAlign: 'center', color: '#666' }}>데이터 수집 중입니다...</div>
                                                        ) : (
                                                            summary.visitor_stats.monthly.map((m, i) => (
                                                                <div key={i} className="trend-bar-wrapper" style={{ flex: 1, minWidth: '50px' }}>
                                                                    <div className="trend-bar-at-bottom">
                                                                        <div className="trend-bar-fill" style={{ height: `${m.ratio}%`, backgroundColor: '#34d399' }}>
                                                                            <span className="trend-tooltip">{m.count}회</span>
                                                                        </div>
                                                                    </div>
                                                                    <span className="trend-label">{m.month.split('.')[1]}월</span>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* S4: 콘텐츠 분석 */}
                                    <div className="analytics-section-group top-kpi-card">
                                        <div className="analytics-section-title"><i className="ri-bar-chart-grouped-line"></i> 콘텐츠 분석</div>
                                        {renderTypeShareChart()}
                                        <div className="analytics-grid" style={{ marginTop: '16px' }}>
                                            <div className="grid-section popular-content-panel">
                                                <h3><i className="ri-trophy-line"></i> 기간 통합 인기 콘텐츠 (Top 20)</h3>
                                                <div className="ranking-list popular-ranking-list">
                                                    {summary.total_top_items.length > 0 ? (
                                                        summary.total_top_items.map((item, idx) => (
                                                            <div key={idx} className="ranking-item">
                                                                <span className="item-rank">{idx + 1}</span>
                                                                <div className="item-info">
                                                                    <span className="item-title" title={item.title}>{item.title}</span>
                                                                    <span className="item-meta">{getTypeName(item.type)}</span>
                                                                </div>
                                                                <span className="item-count">{item.count}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="no-data-msg">데이터가 없습니다.</div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid-section section-breakdown-panel">
                                                <h3><i className="ri-pie-chart-line"></i> 섹션별 유입 비중</h3>
                                                <div className="section-breakdown">
                                                    {summary.total_sections.map((sec, idx) => {
                                                        const percent = Math.round((sec.count / summary.total_clicks) * 100);
                                                        return (
                                                            <div key={idx} className="breakdown-row">
                                                                <div className="row-label">
                                                                    <span>{sec.section}</span>
                                                                    <span>{percent + '%'}</span>
                                                                </div>
                                                                <div className="row-bar-bg">
                                                                    <div className="row-bar-fill" style={{ width: percent + '%' }}></div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* S5: 유입 & 행동 분석 */}
                                    {((summary.referrer_stats && summary.referrer_stats.length > 0) || (summary.journey_patterns && summary.journey_patterns.length > 0)) && (
                                        <div className="analytics-section-group">
                                            <div className="analytics-section-title"><i className="ri-route-line"></i> 유입 & 행동 분석</div>
                                            <div className="analytics-grid behavior-grid">
                                                {summary.referrer_stats && summary.referrer_stats.length > 0 && (
                                                    <div className="grid-section">
                                                        <h3><i className="ri-links-line"></i> 유입 경로 분석</h3>
                                                        <div className="ranking-list">
                                                            {summary.referrer_stats.map((ref, idx) => (
                                                                <div key={idx} className="ranking-item ranking-item-bar">
                                                                    <span className="ranking-item-fill" style={{ width: `${(ref.count / Math.max(...summary.referrer_stats!.map(r => r.count), 1)) * 100}%` }}></span>
                                                                    <span className="item-rank">{idx + 1}</span>
                                                                    <div className="item-info"><span className="item-title">{ref.source}</span></div>
                                                                    <span className="item-count">{ref.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {summary.journey_patterns && summary.journey_patterns.length > 0 && (
                                                    <div className="grid-section">
                                                        <h3><i className="ri-route-line"></i> 사용자 여정 패턴 (Top 10)</h3>
                                                        <div className="journey-list">
                                                            {summary.journey_patterns.map((pattern, idx) => (
                                                                <div key={idx} className="journey-item" style={{ padding: '12px', borderBottom: '1px solid #333' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontSize: '0.9em', color: '#888', marginBottom: '4px' }}>패턴 #{idx + 1}</div>
                                                                            <div style={{ fontSize: '0.95em' }}>{pattern.path.join(' → ')}</div>
                                                                        </div>
                                                                        <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginLeft: '16px' }}>{pattern.count}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {renderQuickInsights()}
                                        </div>
                                    )}

                                    {/* S6 상세: PWA 접속/설치 로그 (Row 2 이후 별도 섹션) */}
                                    {summary.pwa_stats && (summary.pwa_stats.recent_pwa_sessions?.length ?? 0) + summary.pwa_stats.recent_installs.length > 0 && (
                                        <div className="analytics-section-group">
                                            <div className="analytics-section-title"><i className="ri-smartphone-line"></i> PWA 접속 / 설치 로그</div>
                                            {summary.pwa_stats.recent_pwa_sessions && summary.pwa_stats.recent_pwa_sessions.length > 0 && (
                                                <div style={{ marginTop: '24px' }}>
                                                    <h4 style={{ fontSize: '0.9em', marginBottom: '12px', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="ri-user-follow-line"></i> 최근 PWA 접속 사용자
                                                    </h4>
                                                    <div className="recent-installs-list">
                                                        {summary.pwa_stats.recent_pwa_sessions.map((session, idx) => (
                                                            <div key={idx} className="install-item" style={{ padding: '10px 12px', borderBottom: '1px solid #27272a', fontSize: '0.85em', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: idx % 2 === 0 ? 'rgba(39,39,42,0.3)' : 'transparent', borderRadius: '4px' }}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <div style={{ fontWeight: '600', color: '#f4f4f5' }}>{session.nickname || 'Guest'}</div>
                                                                    <div style={{ color: '#71717a', fontSize: '0.75rem' }}>
                                                                        {new Date(session.session_start).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                                        {session.display_mode && ` · ${session.display_mode}`}
                                                                    </div>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    {session.duration_seconds ? (
                                                                        <span style={{ color: '#10b981', fontWeight: '500' }}>{Math.floor(session.duration_seconds / 60)}분 {session.duration_seconds % 60}초</span>
                                                                    ) : (
                                                                        (() => {
                                                                            const isVeryRecent = (new Date().getTime() - new Date(session.session_start).getTime()) < 3600000;
                                                                            return isVeryRecent
                                                                                ? <span style={{ color: '#fbbf24', fontSize: '0.8em' }}>접속 중</span>
                                                                                : <span style={{ color: '#3f3f46', fontSize: '0.8em' }}>-</span>;
                                                                        })()
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {summary.pwa_stats.recent_installs.length > 0 && (
                                                <div style={{ marginTop: '24px' }}>
                                                    <h4 style={{ fontSize: '0.9em', marginBottom: '12px', color: '#888', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <i className="ri-download-line"></i> 최근 설치 내역
                                                    </h4>
                                                    <div className="recent-installs-list">
                                                        {summary.pwa_stats.recent_installs.map((install, idx) => (
                                                            <div key={idx} className="install-item" style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '0.85em' }}>
                                                                <div>{new Date(install.installed_at).toLocaleString('ko-KR')}</div>
                                                                <div style={{ color: '#e4e4e7', fontWeight: '500' }}>{install.nickname || (install.user_id ? '회원' : 'Guest')}</div>
                                                                <div style={{ color: '#71717a', fontSize: '0.9em' }}>
                                                                    {install.user_id ? (install.nickname ? `(${install.user_id.substring(0, 4)}..)` : `(${install.user_id.substring(0, 8)}..)`) : (install.fingerprint ? `Guest: ${install.fingerprint.substring(0, 8)}..` : '-')}
                                                                    {install.display_mode && ` · ${install.display_mode}`}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="summary-exclusion-note">
                                        * 관리자(Admin) 및 테스트용 계정은 제외됩니다. 고유 방문자는 회원 ID를 우선 적용하고, Guest는 같은 날짜의 IP hash/IP와 기기군이 같으면 fingerprint가 갈라져도 하나로 합산합니다. 세션은 같은 방문자의 30분 이내 조각을 병합하고 체류시간은 30분 상한으로 보정합니다.
                                    </div>
                                </div>
                            )}

                            {/* ===== 날짜별 상세 탭 ===== */}
                            {viewMode === 'daily' && (
                                <div className={isMobile ? "daily-view-content" : "desktop-daily-content"}>

                                    {/* D1: 방문자 현황 */}
                                    <div className="analytics-section-group daily-visitor-section">
                                        <div className="analytics-section-title"><i className="ri-user-3-line"></i> 방문자 현황</div>
                                        {(summary.user_clicks !== undefined || summary.anon_clicks !== undefined) && (
                                            <div className="analytics-hero-card">
                                                <h3 className="hero-title">
                                                    {dateRange.start === dateRange.end && dateRange.end === getKRDateString(new Date())
                                                        ? '오늘의 고유 방문자'
                                                        : '기간 내 고유 방문자'}
                                                    <span className="hero-title-desc">회원 ID/기기 기준 중복 제외</span>
                                                </h3>
                                                <div className="hero-number">
                                                    {(summary.user_clicks || 0) + (summary.anon_clicks || 0)}
                                                    <span className="unit">명</span>
                                                </div>
                                                <div className="visitor-ratio-bar">
                                                    <div className="ratio-fill-user" style={{ width: `${((summary.user_clicks || 0) / ((summary.user_clicks || 0) + (summary.anon_clicks || 1)) * 100)}%` }}></div>
                                                </div>
                                                <div className="visitor-breakdown">
                                                    <div className="breakdown-item clickable" onClick={() => userCount > 0 && loadVisitorDetails('users')}>
                                                        <span className="label"><i className="ri-user-smile-line"></i> 로그인</span>
                                                        <span className="value highlight-blue">{summary.user_clicks || 0}</span>
                                                    </div>
                                                    <div className="breakdown-separator"></div>
                                                    <div className="breakdown-item clickable" onClick={() => guestCount > 0 && loadVisitorDetails('guests')}>
                                                        <span className="label" title="로그인하지 않은 기기 기준"><i className="ri-user-line"></i> Guest</span>
                                                        <span className="value highlight-gray">{summary.anon_clicks || 0}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        <div className="analytics-sub-stats">
                                            <div className="sub-stat-item">
                                                <div className="label-group">
                                                    <span className="label">보정 세션</span>
                                                    <span className="label-desc">30분 내 조각 병합</span>
                                                </div>
                                                <span className="value">{(summary.visitor_summary?.session_total ?? summary.session_stats?.total_sessions ?? 0).toLocaleString()}</span>
                                            </div>
                                            <div className="sub-stat-item">
                                                <div className="label-group">
                                                    <span className="label">활동 로그</span>
                                                    <span className="label-desc">클릭/링크 이벤트</span>
                                                </div>
                                                <span className="value">{(summary.total_pv || 0).toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {renderSessionPwaPanel()}
                                    {renderBottomMenuAppsPanel()}

                                    {/* D4: 클릭 & 방문자 트렌드 (다일 기간일 때만) */}
                                    {dateRange.start !== dateRange.end && trendData.length > 1 && (
                                        <div className="analytics-section-group analytics-trend-group">
                                            <div className="analytics-section-title"><i className="ri-line-chart-line"></i> 클릭 & 방문자 트렌드</div>
                                            <div className="analytics-trend-section">
                                                <h3><i className="ri-mouse-line"></i> 클릭 트렌드 (Click)</h3>
                                                <div className="trend-chart-container">
                                                    {trendData.map((day, idx) => {
                                                        const height = maxDayClicks > 0 ? (day.total / maxDayClicks) * 100 : 0;
                                                        return (
                                                            <div key={idx} className="trend-bar-wrapper">
                                                                <div className="trend-bar-at-bottom">
                                                                    <div className="trend-bar-fill" style={{ height: `${height}%` }}>
                                                                        <span className="trend-tooltip">{day.total}</span>
                                                                    </div>
                                                                </div>
                                                                <span className="trend-label">{day.date.split('-')[2]}일</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div className="analytics-trend-section" style={{ marginTop: '24px' }}>
                                                <h3><i className="ri-footprint-line"></i> 고유 방문자 트렌드</h3>
                                                <div className="trend-chart-container">
                                                    {visitTrendData.length === 0 ? (
                                                        <div style={{ width: '100%', textAlign: 'center', color: '#666', fontSize: '0.9rem', padding: '20px' }}>데이터 수집 중</div>
                                                    ) : (
                                                        visitTrendData.map((day, idx) => {
                                                            const height = maxVisitCount > 0 ? (day.count / maxVisitCount) * 100 : 0;
                                                            return (
                                                                <div key={idx} className="trend-bar-wrapper">
                                                                    <div className="trend-bar-at-bottom">
                                                                        <div className="trend-bar-fill" style={{ height: `${height}%`, backgroundColor: '#f472b6' }}>
                                                                            <span className="trend-tooltip">{day.count}</span>
                                                                        </div>
                                                                    </div>
                                                                    <span className="trend-label">{day.date.split('-')[2]}일</span>
                                                                </div>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                                <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#71717a', textAlign: 'right' }}>
                                                    * 세션과 활동 로그를 합쳐 회원 ID/기기 기준으로 중복 제외. 세션 수는 같은 방문자의 30분 이내 조각을 병합한 보정값입니다.
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* D4: 콘텐츠 분석 */}
                                    <div className="analytics-section-group analytics-content-section">
                                        <div className="analytics-section-title"><i className="ri-bar-chart-grouped-line"></i> 콘텐츠 분석</div>
                                        {renderTypeShareChart()}
                                        <div className="analytics-grid" style={{ marginTop: '16px' }}>
                                            <div className="grid-section popular-content-panel">
                                                <h3><i className="ri-trophy-line"></i> 인기 콘텐츠 (Top 20)</h3>
                                                <div className="ranking-list popular-ranking-list">
                                                    {summary.total_top_items.length > 0 ? (
                                                        summary.total_top_items.map((item, idx) => (
                                                            <div key={idx} className="ranking-item">
                                                                <span className="item-rank">{idx + 1}</span>
                                                                <div className="item-info">
                                                                    <span className="item-title" title={item.title}>{item.title}</span>
                                                                    <span className="item-meta">{getTypeName(item.type)}</span>
                                                                </div>
                                                                <span className="item-count">{item.count}</span>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="no-data-msg">데이터가 없습니다.</div>
                                                    )}
                                                </div>
                                            </div>
                                            {summary.total_sections.length > 0 && (
                                                <div className="grid-section section-breakdown-panel">
                                                    <h3><i className="ri-pie-chart-line"></i> 섹션별 비중</h3>
                                                    <div className="section-breakdown">
                                                        {summary.total_sections.map((sec, idx) => {
                                                            const percent = Math.round((sec.count / summary.total_clicks) * 100);
                                                            return (
                                                                <div key={idx} className="breakdown-row">
                                                                    <div className="row-label">
                                                                        <span>{sec.section}</span>
                                                                        <span>{percent + '%'}</span>
                                                                    </div>
                                                                    <div className="row-bar-bg">
                                                                        <div className="row-bar-fill" style={{ width: percent + '%' }}></div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* D5: 유입 & 행동 분석 */}
                                    {((summary.referrer_stats && summary.referrer_stats.length > 0) || (summary.journey_patterns && summary.journey_patterns.length > 0)) && (
                                        <div className="analytics-section-group analytics-behavior-section">
                                            <div className="analytics-section-title"><i className="ri-route-line"></i> 유입 & 행동 분석</div>
                                            <div className="analytics-grid behavior-grid">
                                                {summary.referrer_stats && summary.referrer_stats.length > 0 && (
                                                    <div className="grid-section">
                                                        <h3><i className="ri-links-line"></i> 유입 경로</h3>
                                                        <div className="ranking-list">
                                                            {summary.referrer_stats.map((ref, idx) => (
                                                                <div key={idx} className="ranking-item ranking-item-bar">
                                                                    <span className="ranking-item-fill" style={{ width: `${(ref.count / Math.max(...summary.referrer_stats!.map(r => r.count), 1)) * 100}%` }}></span>
                                                                    <span className="item-rank">{idx + 1}</span>
                                                                    <div className="item-info"><span className="item-title">{ref.source}</span></div>
                                                                    <span className="item-count">{ref.count}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {summary.journey_patterns && summary.journey_patterns.length > 0 && (
                                                    <div className="grid-section">
                                                        <h3><i className="ri-route-line"></i> 사용자 여정 패턴</h3>
                                                        <div className="journey-list">
                                                            {summary.journey_patterns.map((pattern, idx) => (
                                                                <div key={idx} className="journey-item" style={{ padding: '12px', borderBottom: '1px solid #333' }}>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontSize: '0.9em', color: '#888', marginBottom: '4px' }}>패턴 #{idx + 1}</div>
                                                                            <div style={{ fontSize: '0.95em' }}>{pattern.path.join(' → ')}</div>
                                                                        </div>
                                                                        <div style={{ fontSize: '1.1em', fontWeight: 'bold', marginLeft: '16px' }}>{pattern.count}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {renderQuickInsights()}
                                        </div>
                                    )}

                                    {/* D6: 패턴 분석 (기간 2일 이상일 때만) */}
                                    {dateRange.start !== dateRange.end && summary.visitor_stats && (
                                        <div className="analytics-section-group analytics-pattern-section">
                                            <div className="analytics-section-title"><i className="ri-pulse-line"></i> 접속 패턴 분석</div>
                                            <div className="analytics-grid">
                                                <div className="grid-section full-width">
                                                    <h3><i className="ri-calendar-event-line"></i> 요일별 방문 집중도</h3>
                                                    <div className="trend-chart-container" style={{ height: '180px', marginTop: '1rem', alignItems: 'flex-end' }}>
                                                        {summary.visitor_stats.weekday.map((d, i) => (
                                                            <div key={i} className="trend-bar-wrapper" style={{ flex: 1 }}>
                                                                <div className="trend-bar-at-bottom">
                                                                    <div className="trend-bar-fill" style={{ height: `${d.ratio}%`, backgroundColor: d.ratio > 80 ? '#fbbf24' : '#60a5fa' }}>
                                                                        <span className="trend-tooltip">{d.count}회</span>
                                                                    </div>
                                                                </div>
                                                                <span className="trend-label">{d.day}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="grid-section full-width">
                                                    <h3><i className="ri-time-line"></i> 시간대별 접속량 (Peak Time)</h3>
                                                    <div className="trend-chart-container" style={{ height: '180px', marginTop: '1rem', overflowX: 'auto' }}>
                                                        {summary.visitor_stats.hourly.map((h, i) => (
                                                            <div key={i} className="trend-bar-wrapper" style={{ minWidth: '30px', flex: 1 }}>
                                                                <div className="trend-bar-at-bottom">
                                                                    <div className="trend-bar-fill" style={{ height: `${h.ratio}%`, backgroundColor: h.ratio > 80 ? '#fbbf24' : '#a78bfa' }}>
                                                                        <span className="trend-tooltip">{h.count}</span>
                                                                    </div>
                                                                </div>
                                                                <span className="trend-label" style={{ fontSize: '0.7rem' }}>{h.hour}시</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}


                                </div>
                            )}

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
                                    <button onClick={() => setShowUserList(false)}><i className="ri-close-line"></i></button>
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
                                                            <span className="user-id">{user.user_id.substring(0, 8)}...</span>
                                                            <i className="ri-arrow-down-s-line" style={{ marginLeft: 'auto', color: '#71717a' }}></i>
                                                        </summary>

                                                        <div className="user-activity-detail">
                                                            <div className="activity-privacy-note">
                                                                운영/보안 목적의 사이트 활동 기록입니다. 비밀번호, 검색어 전문, 입력 중인 내용은 수집하지 않습니다.
                                                            </div>

                                                            <div className="guest-detail-grid">
                                                                <div><span>계정 ID</span><strong>{user.user_id}</strong></div>
                                                                <div><span>평균 체류</span><strong>{formatDuration(user.avgDuration || 0)}</strong></div>
                                                                <div><span>보정 세션</span><strong>{user.visitCount}개</strong></div>
                                                                <div><span>활동 로그</span><strong>{user.activityCount || 0}개</strong></div>
                                                                <div><span>하단 메뉴</span><strong>{user.bottomMenuClicks || 0}회</strong></div>
                                                                <div><span>페이지뷰</span><strong>{user.pageViews || 0}회</strong></div>
                                                                <div><span>최근 경로</span><strong>{user.lastPage || '-'}</strong></div>
                                                            </div>

                                                            {userSessions.length > 0 && (
                                                                <div className="user-section-block">
                                                                    <h4>방문 세션</h4>
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
                                                                <h4>활동 타임라인</h4>
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

                    {/* Guest 목록 팝업 */}
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
                                        Guest 목록 ({guestCount}명)
                                    </h3>
                                    <button onClick={() => setShowGuestList(false)}><i className="ri-close-line"></i></button>
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
                                                                {getIpLabel(guest.clientIp)} · {getDeviceLabel(guest.platform, guest.userAgent)}
                                                            </span>
                                                        </span>
                                                        <span className="guest-chip">{guest.isPwa ? 'PWA' : 'WEB'}</span>
                                                        <i className="ri-arrow-down-s-line" style={{ marginLeft: 'auto', color: '#71717a' }}></i>
                                                    </summary>
                                                    <div className="guest-detail-panel">
                                                        <div className="guest-detail-grid">
                                                            <div><span>IP</span><strong>{getIpLabel(guest.clientIp)}</strong></div>
                                                            <div><span>IP Hash</span><strong>{guest.ipHash || '기록 없음'}</strong></div>
                                                            <div><span>기기/OS</span><strong>{getDeviceLabel(guest.platform, guest.userAgent)} ({getPlatformRawLabel(guest.platform)})</strong></div>
                                                            <div><span>Fingerprint</span><strong>{shortFingerprint(guest.fingerprint)}</strong></div>
                                                            <div><span>최근 페이지</span><strong>{guest.lastPage || '-'}</strong></div>
                                                            <div><span>첫 방문</span><strong>{formatDateTime(guest.firstSeen)}</strong></div>
                                                            <div><span>최근 방문</span><strong>{formatDateTime(guest.lastSeen)}</strong></div>
                                                            <div><span>세션</span><strong>{guest.sessionCount}개</strong></div>
                                                            <div><span>활동</span><strong>{guest.clickCount}회</strong></div>
                                                            <div><span>페이지뷰</span><strong>{guest.pageViews}회</strong></div>
                                                            <div><span>유입</span><strong>{guest.referrer || '직접/내부'}</strong></div>
                                                        </div>
                                                        <div className="guest-user-agent">
                                                            <span>User-Agent</span>
                                                            <strong>{guest.userAgent || '기록 없음'}</strong>
                                                        </div>
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
                                                                <h4>활동 타임라인</h4>
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
                                    <button onClick={() => setSelectedTypeDetail(null)}><i className="ri-close-line"></i></button>
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
