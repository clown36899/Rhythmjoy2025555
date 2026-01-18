import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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
    'day_select': '날짜 선택'
};

const getTypeName = (type: string): string => TYPE_NAMES[type] || type;

interface AnalyticsSummary {
    total_clicks: number;
    user_clicks: number; // 클릭 기반
    anon_clicks: number; // 클릭 기반
    session_users?: number; // 세션 기반 (순수 접속자)
    session_anon?: number; // 세션 기반 (순수 접속자)
    admin_clicks: number;
    type_breakdown: { type: string; count: number }[];
    daily_details: {
        date: string;
        displayDate: string;
        total: number;
        user: number;  // [PHASE 7]
        guest: number; // [PHASE 7]
        events: { title: string; type: string; count: number }[];
    }[];
    total_top_items: { title: string; type: string; count: number }[];
    total_sections: { section: string; count: number }[];
    // [PHASE 15-17] Advanced analytics
    referrer_stats?: { source: string; count: number }[];
    session_stats?: {
        total_sessions: number;
        avg_duration: number;
        bounce_rate: number;
    };
    journey_patterns?: { path: string[]; count: number }[];
}

interface UserInfo {
    user_id: string;
    nickname: string | null;
}

export default function SiteAnalyticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'summary' | 'daily' | 'advanced'>('daily'); // 기본값을 'daily'로 변경
    const [userList, setUserList] = useState<UserInfo[]>([]);
    const [showUserList, setShowUserList] = useState(false);
    // [PHASE 18] 캐싱
    const [cache, setCache] = useState<Map<string, AnalyticsSummary>>(new Map());

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
        // [PHASE 18] 캐싱 체크 (forceRefresh가 true면 캐시 무시)
        const cacheKey = `${viewMode}-${dateRange.start}-${dateRange.end}`;
        if (!forceRefresh && cache.has(cacheKey)) {
            console.log('[Analytics] Using cached data');
            setSummary(cache.get(cacheKey)!);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            let startStr, endStr;

            // [PHASE 9] View Mode 분리
            // Summary Mode: "전체 요약"은 기간 선택과 무관하게 최근 1년(또는 전체) 데이터를 가져옴
            // Daily Mode: "날짜별 상세"는 사용자가 선택한 기간(dateRange)을 따름
            if (viewMode === 'summary') {
                // Summary: 최근 365일 (사실상 전체)
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - 365);

                startStr = getKRDateString(past) + 'T00:00:00+09:00';
                endStr = getKRDateString(today) + 'T23:59:59+09:00';
                console.log(`[Analytics] Summary Mode: Fetching All-Time (Last 365 Days)`);
            } else {
                // Daily: 선택한 기간
                startStr = dateRange.start + 'T00:00:00+09:00';
                endStr = dateRange.end + 'T23:59:59+09:00';
                console.log(`[Analytics] Daily Mode: Fetching Range ${startStr} ~ ${endStr}`);
            }

            const { data, error } = await supabase
                .from('site_analytics_logs')
                .select('*')
                .gte('created_at', startStr)
                .lte('created_at', endStr)
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log(`[Analytics DEBUG] Raw data fetched: ${data.length} rows`);
            console.log(`[Analytics DEBUG] Sample data:`, data.slice(0, 3));

            // [PHASE 5] Admin Exclusion
            // 사용자의 요청으로 관리자 데이터는 통계에서 완전히 제외합니다.
            const validData = data.filter(d => !d.is_admin);

            console.log(`[Analytics DEBUG] After admin filter: ${validData.length} rows (removed ${data.length - validData.length} admin)`);

            // 2. 중복 클릭 제거 (Unique Count: 동일 유저가 동일 타겟을 여러 번 클릭해도 1회로 집계)
            const uniqueSet = new Set<string>();
            const uniqueData = validData.filter(d => {
                // 유저 식별자 (로그인 ID 또는 핑거프린트)
                const userIdentifier = d.user_id || d.fingerprint || 'unknown';
                // 고유 키: 타겟 + 유저 (날짜는 구분하지 않음 = 기간 내 1회만 인정)
                // 만약 '일별' 중복을 허용하려면 날짜를 키에 포함해야 함. 유저 요구사항("100번 눌러도 1번")에 따라 전체 기간 Unique로 처리.
                const uniqueKey = `${d.target_type}:${d.target_id}:${userIdentifier}`;

                if (uniqueSet.has(uniqueKey)) {
                    return false;
                }
                uniqueSet.add(uniqueKey);
                return true;
            });

            console.log(`[Analytics DEBUG] After unique filter: ${uniqueData.length} rows (removed ${validData.length - uniqueData.length} duplicates)`);

            // 클릭 기반 사용자 통계 (기존 방식)
            const clickBasedUserIds = new Set<string>();
            const clickBasedFingerprints = new Set<string>();

            uniqueData.forEach(d => {
                if (d.user_id) {
                    clickBasedUserIds.add(d.user_id);
                } else if (d.fingerprint) {
                    clickBasedFingerprints.add(d.fingerprint);
                }
            });

            const clickBasedLoggedIn = clickBasedUserIds.size;
            const clickBasedAnon = clickBasedFingerprints.size;

            console.log(`[Analytics DEBUG] Click-based - Logged in: ${clickBasedLoggedIn}, Anonymous: ${clickBasedAnon}`);

            // 세션 기반 사용자 통계 (순수 접속자)
            const { data: sessionData, error: sessionError } = await supabase
                .from('session_logs')
                .select('*')
                .gte('session_start', startStr)
                .lte('session_start', endStr)
                .not('is_admin', 'eq', 1);

            let sessionBasedUserIds = new Set<string>();
            let sessionBasedFingerprints = new Set<string>();

            if (!sessionError && sessionData) {
                console.log(`[Analytics DEBUG] Session data fetched: ${sessionData.length} sessions`);

                sessionData.forEach(session => {
                    if (session.user_id) {
                        sessionBasedUserIds.add(session.user_id);
                    } else if (session.fingerprint) {
                        sessionBasedFingerprints.add(session.fingerprint);
                    }
                });
            }

            const sessionBasedLoggedIn = sessionBasedUserIds.size;
            const sessionBasedAnon = sessionBasedFingerprints.size;

            console.log(`[Analytics DEBUG] Session-based - Logged in: ${sessionBasedLoggedIn}, Anonymous: ${sessionBasedAnon}`);

            // 사용자 정보 추출 (클릭 기반 사용자 목록)
            if (clickBasedUserIds.size > 0) {
                const userIdsArray = Array.from(clickBasedUserIds);

                const { data: users, error: userError } = await supabase
                    .from('board_users')
                    .select('user_id, nickname')
                    .in('user_id', userIdsArray);

                if (!userError && users && users.length > 0) {
                    setUserList(users);
                    console.log(`[Analytics DEBUG] 로그인 사용자 목록 (${users.length}명):`);
                    users.forEach(u => {
                        console.log(`  - ${u.nickname || u.user_id.substring(0, 8)} (ID: ${u.user_id.substring(0, 8)}...)`);
                    });
                } else {
                    // RLS 에러 또는 조회 실패시 fallback: ID만 표시
                    const fallbackUsers = userIdsArray.map(user_id => ({
                        user_id,
                        nickname: null
                    }));
                    setUserList(fallbackUsers);
                    console.log(`[Analytics DEBUG] Fallback user list (${fallbackUsers.length}명) - RLS 에러:`, userError);
                }
            } else {
                setUserList([]);
            }

            // 통계 집계는 이제 '순수 유니크 데이터(uniqueData)'를 기준으로 함
            const processedData = uniqueData;

            const total = processedData.length;
            // loggedIn and anon are now calculated from sessions above
            const admin = processedData.filter(d => d.is_admin).length;

            // [PHASE 11] 타입별 클릭 수 집계
            const typeBreakdown = new Map<string, number>();
            processedData.forEach(d => {
                const type = d.target_type || 'unknown';
                typeBreakdown.set(type, (typeBreakdown.get(type) || 0) + 1);
            });
            const typeStats = Array.from(typeBreakdown.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => ({ type, count }));

            // [PHASE 15] Referrer 통계 (분류 개선)
            const getReferrerCategory = (ref: string): string => {
                if (!ref) return '직접 입력';
                try {
                    const url = new URL(ref);
                    const hostname = url.hostname;
                    if (hostname === window.location.hostname) return '내부 이동';
                    if (hostname.includes('google')) return 'Google 검색';
                    if (hostname.includes('naver')) return 'Naver 검색';
                    if (hostname.includes('daum')) return 'Daum 검색';
                    if (hostname.includes('kakao')) return 'Kakao';
                    if (hostname.includes('instagram')) return 'Instagram';
                    if (hostname.includes('facebook')) return 'Facebook';
                    return hostname;
                } catch {
                    return '알 수 없음';
                }
            };

            const referrerMap = new Map<string, number>();
            data.forEach(d => {
                const category = getReferrerCategory(d.referrer || '');
                referrerMap.set(category, (referrerMap.get(category) || 0) + 1);
            });
            const referrerStats = Array.from(referrerMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([source, count]) => ({ source, count }));

            // [PHASE 16] 세션 통계 (이탈률 정확도 개선)
            const { data: sessions, error: sessionsError } = await supabase
                .from('session_logs')
                .select('*')
                .gte('session_start', startStr)
                .lte('session_start', endStr)
                .not('is_admin', 'eq', 1);

            let sessionStats = {
                total_sessions: 0,
                avg_duration: 0,
                bounce_rate: 0
            };

            if (!sessionsError && sessions) {
                const completedSessions = sessions.filter(s => s.duration_seconds !== null);
                const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0);

                // [PHASE 18] 이탈률 개선: 클릭 1회 이하 AND 체류 시간 30초 미만
                const bouncedSessions = completedSessions.filter(s => {
                    const clicks = s.total_clicks || 0;
                    const duration = s.duration_seconds || 0;
                    return clicks <= 1 && duration < 30;
                });

                sessionStats = {
                    total_sessions: sessions.length,
                    avg_duration: completedSessions.length > 0 ? Math.round(totalDuration / completedSessions.length) : 0,
                    bounce_rate: completedSessions.length > 0 ? (bouncedSessions.length / completedSessions.length) * 100 : 0
                };
            }

            // [PHASE 17] 사용자 여정 패턴 (세션별 클릭 순서)
            const journeyMap = new Map<string, number>();
            const sessionGroups = new Map<string, any[]>();

            data.forEach(d => {
                if (d.session_id) {
                    if (!sessionGroups.has(d.session_id)) {
                        sessionGroups.set(d.session_id, []);
                    }
                    sessionGroups.get(d.session_id)!.push(d);
                }
            });

            sessionGroups.forEach(logs => {
                const sorted = logs.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
                const path = sorted.slice(0, 5).map(l => l.target_type);
                const pathKey = path.join(' → ');
                journeyMap.set(pathKey, (journeyMap.get(pathKey) || 0) + 1);
            });

            const journeyPatterns = Array.from(journeyMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([pathStr, count]) => ({
                    path: pathStr.split(' → '),
                    count
                }));

            const totalItemMap = new Map<string, { title: string, type: string, count: number }>();
            const totalSectionMap = new Map<string, number>();

            processedData.forEach(d => {
                const key = d.target_type + ':' + d.target_id;
                const existing = totalItemMap.get(key) || { title: d.target_title || d.target_id, type: d.target_type, count: 0 };
                totalItemMap.set(key, { ...existing, count: existing.count + 1 });
                totalSectionMap.set(d.section, (totalSectionMap.get(d.section) || 0) + 1);
            });

            const totalTopItems = Array.from(totalItemMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
            const totalSections = Array.from(totalSectionMap.entries())
                .map(([section, count]) => ({ section, count }))
                .sort((a, b) => b.count - a.count);

            const dateGroups = new Map<string, any[]>();
            processedData.forEach(d => {
                // [FIX] UTC 날짜가 아니라 KST 날짜로 그룹핑해야 정확함 (새벽 00~09시 데이터가 전날로 가는 문제 해결)
                const kstDate = getKRDateString(new Date(d.created_at));
                const dateKey = kstDate;

                const group = dateGroups.get(dateKey) || [];
                group.push(d);
                dateGroups.set(dateKey, group);
            });

            const dailyDetails = Array.from(dateGroups.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([date, logs]) => {
                    // [PHASE 7] 날짜별 회원/게스트 구분 집계
                    let dUser = 0;
                    let dGuest = 0;

                    const eventMap = new Map<string, { title: string, type: string, count: number }>();
                    logs.forEach(l => {
                        // 날짜별 회원/게스트 카운트
                        if (l.user_id && !l.is_admin) dUser++;
                        else if (!l.user_id && !l.is_admin) dGuest++;

                        const key = l.target_type + ':' + l.target_id;
                        const existing = eventMap.get(key) || { title: l.target_title || l.target_id, type: l.target_type, count: 0 };
                        eventMap.set(key, { ...existing, count: existing.count + 1 });
                    });

                    const dObj = new Date(date);
                    const displayDate = dObj.toLocaleDateString('ko-KR', {
                        month: 'long', day: 'numeric', weekday: 'short'
                    });

                    return {
                        date,
                        displayDate,
                        total: logs.length,
                        user: dUser,
                        guest: dGuest,
                        events: Array.from(eventMap.values()).sort((a, b) => b.count - a.count)
                    };
                });

            const newSummary = {
                total_clicks: total,
                user_clicks: clickBasedLoggedIn, // 클릭 기반
                anon_clicks: clickBasedAnon, // 클릭 기반
                session_users: sessionBasedLoggedIn, // 세션 기반 (순수 접속자)
                session_anon: sessionBasedAnon, // 세션 기반 (순수 접속자)
                admin_clicks: admin,
                type_breakdown: typeStats,
                daily_details: dailyDetails,
                total_top_items: totalTopItems,
                total_sections: totalSections,
                // [PHASE 15-17] Advanced analytics
                referrer_stats: referrerStats,
                session_stats: sessionStats,
                journey_patterns: journeyPatterns
            };

            setSummary(newSummary);

            // [PHASE 18] 캐시에 저장
            const cacheKey = `${viewMode}-${dateRange.start}-${dateRange.end}`;
            setCache(new Map(cache.set(cacheKey, newSummary)));

            // [PHASE 3] Auto Snapshot: 오늘치 스냅샷이 없으면 조용히 생성
            if (dateRange.end === getKRDateString(new Date())) {
                checkAndAutoSnapshot({
                    user_clicks: clickBasedLoggedIn,
                    anon_clicks: clickBasedAnon,
                    admin_clicks: admin
                } as any);
            }
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    // [PHASE 18] CSV Export 기능
    const exportToCSV = () => {
        if (!summary) return;

        const csv = [
            ['날짜', '총 클릭', '로그인 사용자', 'Guest'],
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

    const checkAndAutoSnapshot = async (currentStats: { user_clicks: number, anon_clicks: number, admin_clicks: number }) => {
        try {
            const today = getKRDateString(new Date());
            const startStr = today + 'T00:00:00+09:00';
            const endStr = today + 'T23:59:59+09:00';

            const { data, error } = await supabase
                .from('site_usage_stats')
                .select('id')
                .gte('snapshot_time', startStr)
                .lte('snapshot_time', endStr)
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                await supabase.rpc('create_usage_snapshot', {
                    p_logged_in: currentStats.user_clicks,
                    p_anonymous: currentStats.anon_clicks,
                    p_admin: currentStats.admin_clicks
                });
                console.log('[Analytics] 📸 Auto-snapshot created for today');
            }
        } catch (err) {
            console.error('[Analytics] Auto-snapshot check failed:', err);
        }
    };

    // 최근 7일 트렌드 데이터 계산
    const trendData = summary ? summary.daily_details.slice(0, 7).reverse() : [];
    const maxDayClicks = trendData.length > 0 ? Math.max(...trendData.map(d => d.total)) : 0;

    if (!isOpen) return null;

    return (
        <div className="analytics-modal-overlay" onClick={onClose}>
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
                            <button className="refresh-btn" onClick={() => fetchAnalytics(true)} disabled={loading} title="새로고침">
                                <i className={loading ? "ri-refresh-line spinning" : "ri-refresh-line"}></i>
                            </button>
                        </div>
                        <div className="view-mode-tabs">
                            <button className={viewMode === 'summary' ? 'active' : ''} onClick={() => setViewMode('summary')}>전체 요약</button>
                            <button className={viewMode === 'daily' ? 'active' : ''} onClick={() => setViewMode('daily')}>날짜별 상세</button>
                            <button className={viewMode === 'advanced' ? 'active' : ''} onClick={() => setViewMode('advanced')}>고급 분석</button>
                        </div>
                    </div>

                    {/* [PHASE 9] 날짜 선택기: '날짜별 상세' 모드에서만 표시 */}
                    {viewMode === 'daily' && (
                        <div className="range-picker">
                            <div className="range-shortcuts">
                                <button onClick={() => setShortcutRange(0)}>오늘</button>
                                <button onClick={() => setShortcutRange(1)}>어제</button>
                                <button onClick={() => setShortcutRange(7)}>7일</button>
                                <button onClick={() => setShortcutRange(30)}>30일</button>
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
                    {loading ? (
                        <div className="analytics-loading">데이터 분석 중...</div>
                    ) : summary && summary.total_clicks > 0 ? (
                        <div className="analytics-scroll-container">
                            <div className="analytics-summary-mini">
                                <span>기간 내 총 클릭: <strong>{summary.total_clicks}</strong></span>
                                <span
                                    className="clickable-stat"
                                    onClick={() => userList.length > 0 && setShowUserList(true)}
                                    style={{ cursor: userList.length > 0 ? 'pointer' : 'default' }}
                                    title={userList.length > 0 ? '사용자 목록 보기' : ''}
                                >
                                    클릭 로그인: <strong className="highlight-blue">{summary.user_clicks}</strong>
                                    {userList.length > 0 && <i className="ri-user-line" style={{ marginLeft: '4px', fontSize: '0.9em' }}></i>}
                                </span>
                                <span>클릭 Guest: <strong className="highlight-gray">{summary.anon_clicks}</strong></span>
                            </div>

                            {/* 세션 기반 통계 (순수 접속자) */}
                            {(summary.session_users !== undefined || summary.session_anon !== undefined) && (
                                <div className="analytics-summary-mini" style={{ marginTop: '8px', borderTop: '1px solid #333', paddingTop: '8px' }}>
                                    <span style={{ fontSize: '0.85em', color: '#888' }}>순수 접속자 (세션 기반)</span>
                                    <span>접속 로그인: <strong className="highlight-blue">{summary.session_users || 0}</strong></span>
                                    <span>접속 Guest: <strong className="highlight-gray">{summary.session_anon || 0}</strong></span>
                                </div>
                            )}

                            {/* [PHASE 11] 타입별 통계 */}
                            {summary.type_breakdown.length > 0 && (
                                <div className="type-breakdown-mini">
                                    {summary.type_breakdown.map((item, idx) => {
                                        const percent = ((item.count / summary.total_clicks) * 100).toFixed(1);
                                        return (
                                            <span key={idx} className="type-stat">
                                                {getTypeName(item.type)}: <strong>{item.count}</strong> ({percent}%)
                                            </span>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 사용자 목록 팝업 */}
                            {showUserList && (
                                <div className="user-list-overlay" onClick={() => setShowUserList(false)}>
                                    <div className="user-list-modal" onClick={e => e.stopPropagation()}>
                                        <div className="user-list-header">
                                            <h3>로그인 사용자 목록 ({userList.length}명)</h3>
                                            <button onClick={() => setShowUserList(false)}><i className="ri-close-line"></i></button>
                                        </div>
                                        <div className="user-list-body">
                                            {userList.map((user, idx) => (
                                                <div key={user.user_id} className="user-list-item">
                                                    <span className="user-index">{idx + 1}</span>
                                                    <span className="user-name">{user.nickname || `User ${user.user_id.substring(0, 8)}`}</span>
                                                    <span className="user-id">{user.user_id.substring(0, 8)}...</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* [PHASE 2] 트렌드 미니 차트 */}
                            <div className="analytics-trend-section">
                                <h3><i className="ri-line-chart-line"></i> 최근 7일 클릭 트렌드</h3>
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

                            {viewMode === 'summary' ? (
                                <div className="summary-view-content">
                                    <div className="analytics-grid">
                                        <div className="grid-section">
                                            <h3><i className="ri-trophy-line"></i> 기간 통합 인기 콘텐츠 (Top 20)</h3>
                                            <div className="ranking-list">
                                                {summary.total_top_items.length > 0 ? (
                                                    summary.total_top_items.map((item, idx) => (
                                                        <div key={idx} className="ranking-item">
                                                            <span className="item-rank">{idx + 1}</span>
                                                            <div className="item-info">
                                                                <span className="item-title">{item.title}</span>
                                                                <span className="item-meta">{item.type}</span>
                                                            </div>
                                                            <span className="item-count">{item.count}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="no-data-msg">데이터가 없습니다.</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid-section">
                                            <h3><i className="ri-pie-chart-line"></i> 유입 경로 비중</h3>
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
                            ) : (
                                <div className="daily-view-content">
                                    <div className="daily-record-list">
                                        {summary.daily_details.map((day, dIdx) => (
                                            <div key={dIdx} className="daily-section">
                                                <div className="daily-header">
                                                    <div className="daily-header-left">
                                                        <span className="daily-date">{day.displayDate}</span>
                                                        <div className="daily-badges">
                                                            <span className="badge-user">회원 {day.user}</span>
                                                            <span className="badge-guest">Guest {day.guest}</span>
                                                        </div>
                                                    </div>
                                                    <span className="daily-total">{day.total} clicks</span>
                                                </div>
                                                <div className="daily-events-grid">
                                                    {day.events.map((evt, eIdx) => (
                                                        <div key={eIdx} className="daily-event-row">
                                                            <span className="evt-type">{evt.type}</span>
                                                            <span className="evt-title">{evt.title}</span>
                                                            <span className="evt-count">{evt.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="analytics-empty">
                            <i className="ri-inbox-line"></i>
                            <p>선택한 기간에 수집된 데이터가 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
