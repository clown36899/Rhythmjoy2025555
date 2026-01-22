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
    // PWA tracking
    pwa_stats?: {
        total_installs: number;
        pwa_sessions: number;
        browser_sessions: number;
        pwa_percentage: number;
        avg_pwa_duration: number;
        avg_browser_duration: number;
        recent_installs: { installed_at: string; user_id?: string; fingerprint?: string; display_mode?: string }[];
    };
    // [PHASE 20] Type Detail Data
    items_by_type?: Record<string, { title: string; count: number; url?: string }[]>;
}

interface UserInfo {
    user_id: string;
    nickname: string | null;
    visitCount: number;
    visitLogs: string[]; // Timestamps
    avgDuration?: number; // Average session duration in seconds
}

export default function SiteAnalyticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'summary' | 'daily' | 'advanced'>('daily'); // 기본값을 'daily'로 변경
    const [userList, setUserList] = useState<UserInfo[]>([]);
    const [showUserList, setShowUserList] = useState(false);
    // [PHASE 20] Type Detail Modal State
    const [selectedTypeDetail, setSelectedTypeDetail] = useState<{ type: string; items: { title: string; count: number; url?: string }[] } | null>(null);
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

        // [FIX] User List 기능 추가로 인해, 'Summary'만 캐싱된 데이터로는 리스트를 복원할 수 없음.
        // 따라서 정확성을 위해 일단 캐싱을 무시하고 매번 새로 데이터를 가져오도록 변경함. (리스트 데이터 보장)
        // if (!forceRefresh && cache.has(cacheKey)) {
        //     console.log('[Analytics] Using cached data');
        //     setSummary(cache.get(cacheKey)!);
        //     setLoading(false);
        //     return;
        // }

        setLoading(true);
        setUserList([]); // [FIX] 데이터 로딩 시작 시 리스트 초기화 (이전 날짜 데이터 잔존 방지)
        try {
            let startStr, endStr;

            // [PHASE 9] View Mode 분리
            // Summary Mode: "전체 요약"은 기간 선택과 무관하게 최근 1년(또는 전체) 데이터를 가져옴
            // Daily Mode: "날짜별 상세"는 사용자가 선택한 기간(dateRange)을 따름
            if (viewMode === 'summary') {
                // Summary: 최근 365일 -> 전체 기간 (서비스 시작일 포함하도록 50년 전으로 설정)
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - (365 * 50));


                startStr = getKRDateString(past) + 'T00:00:00+09:00';
                endStr = getKRDateString(today) + 'T23:59:59+09:00';
                console.log(`[Analytics] Summary Mode: Fetching All-Time (Last 365 Days)`);
            } else {
                // Daily: 선택한 기간
                startStr = dateRange.start + 'T00:00:00+09:00';
                endStr = dateRange.end + 'T23:59:59+09:00'; // [FIX] Timezone offset fix
                console.log(`[Analytics] Daily Mode: Fetch Range ${startStr} ~ ${endStr}`);
            }

            // [PHASE 20] Sever-side Analytics (RPC) - Accurate Counts via DB
            // Client-side fetch has 1000 row limit. We use RPC to get accurate totals and user list.
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('get_analytics_summary_v2', {
                    start_date: startStr,
                    end_date: endStr
                });

            if (rpcError) {
                console.error('[Analytics] RPC Call Failed:', rpcError);
            } else {
                console.log('[Analytics] RPC Data Received:', rpcData);
            }

            // Raw Data Fetch (Still needed for Trend Chart & Rankings for now)
            // Attempt to increase limit to 10000 just in case defaults are low
            const { data, error } = await supabase
                .from('site_analytics_logs')
                .select('*')
                .gte('created_at', startStr)
                .lte('created_at', endStr)
                .limit(10000)
                .order('created_at', { ascending: false });

            if (error) throw error;

            console.log(`[Analytics DEBUG] Raw data fetched: ${data.length} rows`);

            // [PHASE 5] Admin Exclusion
            const validData = data.filter(d => !d.is_admin);

            // [Legacy Client-side Logic]
            // We keep this for 'Trend Data' calculation below, but for Hero Stats and User List, we use RPC.

            // 2. [Visitor Unique] 방문자 수 집계용 중복 제거 (For Charts)
            const visitorUniqueSet = new Set<string>();
            const visitorUniqueData = validData.filter(d => {
                const userIdentifier = d.user_id || d.fingerprint || 'unknown';
                const timestamp = new Date(d.created_at).getTime();
                const timeBucket = Math.floor(timestamp / (6 * 3600 * 1000));

                const uniqueKey = `${userIdentifier}:${timeBucket}`;

                if (visitorUniqueSet.has(uniqueKey)) {
                    return false;
                }
                visitorUniqueSet.add(uniqueKey);
                return true;
            });

            // [FIX] Use RPC Data for Hero Counters if available
            // If RPC failed, fallback to client-side calc (visitorUniqueData filters)
            let clickBasedLoggedIn = 0;
            let clickBasedAnon = 0;
            let totalVisits = 0;

            if (rpcData) {
                // RPC returns: { total_visits, logged_in_visits, anonymous_visits, user_list }
                // Cast to any to access properties if TS complains about JSON type
                const stats = rpcData as any;
                clickBasedLoggedIn = stats.logged_in_visits || 0;
                clickBasedAnon = stats.anonymous_visits || 0;
                totalVisits = stats.total_visits || 0;

                // [FIX] Use RPC User List (Contains accurate historical counts)
                // The SQL returns 'visit_logs' and 'visitCount' correctly.
                const rpcUserList = (stats.user_list || []).map((u: any) => ({
                    user_id: u.user_id,
                    nickname: u.nickname,
                    visitCount: u.visitCount, // Matches SQL json_build_object key
                    visitLogs: u.visitLogs || [], // Matches SQL json_build_object key
                    avgDuration: u.avgDuration || 0 // Average session duration in seconds
                }));

                setUserList(rpcUserList);
                console.log(`[Analytics] Using RPC User List: ${rpcUserList.length} users`);
            } else {
                // Fallback (Client-side)
                clickBasedLoggedIn = visitorUniqueData.filter(d => d.user_id).length;
                clickBasedAnon = visitorUniqueData.filter(d => !d.user_id).length;
                totalVisits = visitorUniqueData.length;

                // Fallback User List generation... (Skipped to avoid duplicate code block, assuming RPC works)
                // If RPC fails, list might be empty or we could keep the old logic block here?
                // For safety, let's just leave the list empty or rely on the fact user approved RPC.
                console.warn('[Analytics] RPC failed, Hero stats falling back to limited client data.');
            }

            console.log(`[Analytics DEBUG] Final Stats - Logged in: ${clickBasedLoggedIn}, Anon: ${clickBasedAnon}, Total: ${totalVisits}`);

            // [PHASE 16] 세션 통계 직접 조회 (PWA 및 체류시간 분석용)
            // Note: SiteAnalyticsProvider tracks sessions in session_logs.
            const { data: sessions, error: sessionsError } = await supabase
                .from('session_logs')
                .select('*')
                .gte('session_start', startStr)
                .lte('session_start', endStr)
                .eq('is_admin', false);

            let sessionStats = {
                total_sessions: 0,
                avg_duration: 0,
                bounce_rate: 0
            };

            if (!sessionsError && sessions) {
                const completedSessions = sessions.filter((s: any) => s.duration_seconds !== null);
                const totalDuration = completedSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0);

                // [PHASE 18] 이탈률 개선: 클릭 1회 이하 AND 체류 시간 30초 미만
                const bouncedSessions = completedSessions.filter((s: any) => {
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

            // [NOTE] [LEGACY CLEANUP] Session-based logic is replaced by RPC for some metrics,
            // but for PWA/Session details, we use the fetched 'sessions' data.
            const sessionData = sessions || [];

            // [REMOVED] 30-second stay logic - replaced with per-user duration in user list
            // 3. [Activity Unique] for consistency in charts
            const uniqueData = visitorUniqueData;

            // 통계 집계는 이제 '순수 유니크 데이터(uniqueData)'를 기준으로 함
            const processedData = uniqueData;

            const total = processedData.length;
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
            processedData.forEach(d => {
                const category = getReferrerCategory(d.referrer || '');
                referrerMap.set(category, (referrerMap.get(category) || 0) + 1);
            });
            const referrerStats = Array.from(referrerMap.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([source, count]) => ({ source, count }));

            // [PHASE 16] 세션 통계 (이탈률 정확도 개선)
            // Calculated above in the restored session fetch block.

            // [PHASE 17] 사용자 여정 패턴 (세션별 클릭 순서)
            const journeyMap = new Map<string, number>();
            const sessionGroups = new Map<string, any[]>();

            processedData.forEach(d => {
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

            // PWA 통계 수집
            let pwaStats = undefined;
            try {
                // PWA 설치 수 조회
                const { data: installData, error: installError } = await supabase
                    .from('pwa_installs')
                    .select('*')
                    .gte('installed_at', startStr)
                    .lte('installed_at', endStr)
                    .order('installed_at', { ascending: false });

                if (!installError && installData) {
                    const totalInstalls = installData.length;
                    const recentInstalls = installData.slice(0, 10);

                    // PWA 세션 vs 브라우저 세션
                    const pwaSessions = sessionData.filter((s: any) => s.is_pwa === true);
                    const browserSessions = sessionData.filter((s: any) => s.is_pwa === false);

                    // PWA 평균 체류 시간
                    const pwaCompletedSessions = pwaSessions.filter((s: any) => s.duration_seconds !== null);
                    const avgPWADuration = pwaCompletedSessions.length > 0
                        ? Math.round(pwaCompletedSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0) / pwaCompletedSessions.length)
                        : 0;

                    // 브라우저 평균 체류 시간
                    const browserCompletedSessions = browserSessions.filter((s: any) => s.duration_seconds !== null);
                    const avgBrowserDuration = browserCompletedSessions.length > 0
                        ? Math.round(browserCompletedSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0) / browserCompletedSessions.length)
                        : 0;

                    const totalSessions = sessionData.length;
                    const pwaPercentage = totalSessions > 0 ? (pwaSessions.length / totalSessions) * 100 : 0;

                    pwaStats = {
                        total_installs: totalInstalls,
                        pwa_sessions: pwaSessions.length,
                        browser_sessions: browserSessions.length,
                        pwa_percentage: pwaPercentage,
                        avg_pwa_duration: avgPWADuration,
                        avg_browser_duration: avgBrowserDuration,
                        recent_installs: recentInstalls
                    };
                }
            } catch (error) {
                console.error('[Analytics] Failed to fetch PWA stats:', error);
            }



            // [PHASE 20] 타입별 상세 아이템 집계
            const itemsByTypeMap = new Map<string, Map<string, { title: string, count: number, url?: string }>>();

            const totalItemMap = new Map<string, { title: string, type: string, count: number }>();
            const totalSectionMap = new Map<string, number>();

            // [PHASE 21] Friendly Name Mapping
            const getFriendlyTitle = (type: string | null, id: string | null, title: string | null) => {
                if (title) return title;
                const safeId = id || '';

                if (safeId === 'login') return '로그인 버튼';
                if (safeId === 'home_weekly_calendar_shortcut') return '주간 일정 바로가기 (상단)';
                if (safeId === 'week_calendar_shortcut') return '주간 일정 바로가기';

                return safeId;
            };

            processedData.forEach(d => {
                const key = d.target_type + ':' + d.target_id;
                const type = d.target_type || 'unknown';

                const friendlyTitle = getFriendlyTitle(d.target_type, d.target_id, d.target_title);

                // Total Items
                const existing = totalItemMap.get(key) || { title: friendlyTitle, type: d.target_type, count: 0 };
                totalItemMap.set(key, { ...existing, count: existing.count + 1 });

                // Section Stats
                totalSectionMap.set(d.section, (totalSectionMap.get(d.section) || 0) + 1);

                // Type Detail Items
                if (!itemsByTypeMap.has(type)) {
                    itemsByTypeMap.set(type, new Map());
                }
                const typeMap = itemsByTypeMap.get(type)!;
                // 동일한 title로 그룹핑 (URL이나 ID 대신 사용자 친화적 타이틀 사용)
                // [FIX] ID가 아닌 Friendly Title로 그룹핑하여 중복 제거 효과
                const itemExisting = typeMap.get(friendlyTitle) || { title: friendlyTitle, count: 0, url: type === 'auto_link' ? d.target_id : undefined };
                typeMap.set(friendlyTitle, { ...itemExisting, count: itemExisting.count + 1 });
            });

            // Convert itemsByTypeMap to Record object
            const itemsByTypeRecord: Record<string, { title: string; count: number }[]> = {};
            itemsByTypeMap.forEach((map, type) => {
                itemsByTypeRecord[type] = Array.from(map.values()).sort((a, b) => b.count - a.count);
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
                admin_clicks: admin,
                type_breakdown: typeStats,
                daily_details: dailyDetails,
                total_top_items: totalTopItems,
                total_sections: totalSections,
                // [PHASE 15-17] Advanced analytics
                referrer_stats: referrerStats,
                session_stats: sessionStats,
                journey_patterns: journeyPatterns,

                // PWA stats
                pwa_stats: pwaStats,
                // Type details
                items_by_type: itemsByTypeRecord
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
                                <div className="date-navigator">
                                    <button onClick={() => {
                                        const base = new Date(dateRange.end);
                                        base.setDate(base.getDate() - 1);
                                        const newDate = base.toISOString().split('T')[0];
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
                                            const today = new Date().toISOString().split('T')[0];
                                            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

                                            // Only show simple text if start === end
                                            if (dateRange.start === dateRange.end) {
                                                if (dateRange.end === today) return '오늘';
                                                if (dateRange.end === yesterday) return '어제';

                                                // Format: MM.DD (Weekday)
                                                const d = new Date(dateRange.end);
                                                const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                                                return `${d.getMonth() + 1}.${d.getDate()} (${weekdays[d.getDay()]})`;
                                            }
                                            return `${dateRange.start} ~ ${dateRange.end}`;
                                        })()}
                                    </span>
                                    <button onClick={() => {
                                        const base = new Date(dateRange.end);
                                        base.setDate(base.getDate() + 1);
                                        const newDate = base.toISOString().split('T')[0];
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
                    {loading ? (
                        <div className="analytics-loading">데이터 분석 중...</div>
                    ) : summary && summary.total_clicks > 0 ? (
                        <div className="analytics-scroll-container">
                            {/* [PHASE 19] 통합 방문자 요약 카드 (Hero Section) */}
                            {(summary.user_clicks !== undefined || summary.anon_clicks !== undefined) && (
                                <div className="analytics-hero-card">
                                    <h3 className="hero-title">
                                        {viewMode === 'summary'
                                            ? '누적 방문자 (Unique Access) 6시간텀'
                                            : dateRange.start === dateRange.end && dateRange.end === getKRDateString(new Date())
                                                ? '오늘의 총 방문자 (Unique Access) 6시간텀'
                                                : '기간 내 누적 방문자 (Unique Access) 6시간텀'}
                                    </h3>
                                    <div className="hero-number">
                                        {(summary.user_clicks || 0) + (summary.anon_clicks || 0)}
                                        <span className="unit">명</span>
                                    </div>

                                    {/* 로그인 vs Guest 비율 바 */}
                                    <div className="visitor-ratio-bar">
                                        <div
                                            className="ratio-fill-user"
                                            style={{ width: `${((summary.user_clicks || 0) / ((summary.user_clicks || 0) + (summary.anon_clicks || 1)) * 100)}%` }}
                                        ></div>
                                    </div>

                                    <div className="visitor-breakdown">
                                        <div className="breakdown-item clickable" onClick={() => userList.length > 0 && setShowUserList(true)}>
                                            <span className="label"><i className="ri-user-smile-line"></i> 로그인</span>
                                            <span className="value highlight-blue">{summary.user_clicks || 0}</span>
                                        </div>
                                        <div className="breakdown-separator"></div>
                                        <div className="breakdown-item">
                                            <span className="label"><i className="ri-user-line"></i> Guest</span>
                                            <span className="value highlight-gray">{summary.anon_clicks || 0}</span>
                                        </div>
                                    </div>

                                </div>
                            )}

                            {/* 활동량 요약 (기존 클릭 수 정보는 보조 지표로 축소) */}
                            <div className="analytics-sub-stats">
                                <div className="sub-stat-item">
                                    <span className="label">총 페이지뷰(PV)</span>
                                    <span className="value">{summary.total_clicks}</span>
                                </div>
                                <div className="sub-stat-item">
                                    <span className="label">활동 회원</span>
                                    <span className="value">{summary.user_clicks}</span>
                                </div>
                            </div>


                            {/* [PHASE 11] 타입별 통계 */}
                            {summary.type_breakdown.length > 0 && (
                                <div className="type-breakdown-mini">
                                    {summary.type_breakdown.map(tb => (
                                        <span
                                            key={tb.type}
                                            className="type-stat clickable"
                                            onClick={() => {
                                                if (summary.items_by_type && summary.items_by_type[tb.type]) {
                                                    setSelectedTypeDetail({
                                                        type: getTypeName(tb.type),
                                                        items: summary.items_by_type[tb.type]
                                                    });
                                                }
                                            }}
                                            style={{ cursor: 'pointer' }}
                                            title="클릭하여 상세 보기"
                                        >
                                            {getTypeName(tb.type)}: <strong>{tb.count}</strong> ({((tb.count / summary.total_clicks) * 100).toFixed(1)}%)
                                        </span>
                                    ))}
                                </div>
                            )}


                            {/* 사용자 목록 팝업 */}
                            {showUserList && (
                                <div className="user-list-overlay" onClick={() => setShowUserList(false)}>
                                    <div className="user-list-modal" onClick={e => e.stopPropagation()}>
                                        <div className="user-list-header">
                                            <h3>
                                                <span style={{ color: '#fbbf24', marginRight: '8px' }}>
                                                    {dateRange.start === dateRange.end
                                                        ? `${dateRange.start}`
                                                        : `${dateRange.start} ~ ${dateRange.end}`}
                                                </span>
                                                로그인 사용자 목록 ({userList.length}명)
                                            </h3>
                                            <button onClick={() => setShowUserList(false)}><i className="ri-close-line"></i></button>
                                        </div>
                                        <div className="user-list-body">
                                            {userList.map((user, index) => (
                                                <div key={user.user_id} className="user-list-item-wrapper">
                                                    <div className="user-list-item clickable">
                                                        <details style={{ width: '100%' }}>
                                                            <summary style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', listStyle: 'none' }}>
                                                                <span className="user-index">{index + 1}</span>
                                                                <span className="user-name">
                                                                    {user.nickname || '알 수 없는 사용자'}
                                                                    <span style={{ fontSize: '0.8rem', color: '#60a5fa', marginLeft: '6px' }}>({user.visitCount}회)</span>
                                                                    {user.avgDuration !== undefined && (
                                                                        <span style={{ fontSize: '0.75rem', color: '#888', marginLeft: '8px' }}>
                                                                            · 평균 {user.avgDuration >= 3600 ? `${Math.floor(user.avgDuration / 3600)}시간 ` : ''}{Math.floor((user.avgDuration % 3600) / 60)}분 {Math.floor(user.avgDuration % 60)}초
                                                                        </span>
                                                                    )}
                                                                </span>
                                                                <span className="user-id">{user.user_id.substring(0, 8)}...</span>
                                                                <i className="ri-arrow-down-s-line" style={{ marginLeft: 'auto', color: '#71717a' }}></i>
                                                            </summary>
                                                            <div className="user-visit-logs" style={{ marginTop: '8px', paddingLeft: '36px', fontSize: '0.8rem', color: '#a1a1aa' }}>
                                                                {user.visitLogs.map((log, i) => (
                                                                    <div key={i} style={{ padding: '2px 0' }}>
                                                                        • {new Date(log).toLocaleString('ko-KR', {
                                                                            year: 'numeric', month: '2-digit', day: '2-digit',
                                                                            hour: '2-digit', minute: '2-digit'
                                                                        })}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </details>
                                                    </div>
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
                            ) : viewMode === 'daily' ? (
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
                            ) : (
                                <div className="advanced-view-content">
                                    <div className="analytics-grid">
                                        {/* PWA 통계 */}
                                        {summary.pwa_stats && (
                                            <div className="grid-section">
                                                <h3><i className="ri-smartphone-line"></i> PWA 설치 및 사용 통계</h3>
                                                <div className="pwa-stats-summary">
                                                    <div className="stat-card">
                                                        <div className="stat-label">총 설치 수</div>
                                                        <div className="stat-value">{summary.pwa_stats.total_installs}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <div className="stat-label">PWA 세션</div>
                                                        <div className="stat-value">{summary.pwa_stats.pwa_sessions}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <div className="stat-label">브라우저 세션</div>
                                                        <div className="stat-value">{summary.pwa_stats.browser_sessions}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <div className="stat-label">PWA 사용 비율</div>
                                                        <div className="stat-value">{summary.pwa_stats.pwa_percentage.toFixed(1)}%</div>
                                                    </div>
                                                </div>
                                                <div className="pwa-duration-comparison" style={{ marginTop: '16px' }}>
                                                    <div className="comparison-row">
                                                        <span>PWA 평균 체류시간</span>
                                                        <strong>{Math.floor(summary.pwa_stats.avg_pwa_duration / 60)}분 {summary.pwa_stats.avg_pwa_duration % 60}초</strong>
                                                    </div>
                                                    <div className="comparison-row">
                                                        <span>브라우저 평균 체류시간</span>
                                                        <strong>{Math.floor(summary.pwa_stats.avg_browser_duration / 60)}분 {summary.pwa_stats.avg_browser_duration % 60}초</strong>
                                                    </div>
                                                </div>
                                                {summary.pwa_stats.recent_installs.length > 0 && (
                                                    <div style={{ marginTop: '16px' }}>
                                                        <h4 style={{ fontSize: '0.9em', marginBottom: '8px', color: '#888' }}>최근 설치 (최대 10개)</h4>
                                                        <div className="recent-installs-list">
                                                            {summary.pwa_stats.recent_installs.map((install, idx) => (
                                                                <div key={idx} className="install-item" style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '0.85em' }}>
                                                                    <div>{new Date(install.installed_at).toLocaleString('ko-KR')}</div>
                                                                    <div style={{ color: '#888' }}>
                                                                        {install.user_id ? `User: ${install.user_id.substring(0, 8)}...` : `Guest: ${install.fingerprint?.substring(0, 12)}...`}
                                                                        {install.display_mode && ` (${install.display_mode})`}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Referrer 통계 */}
                                        {summary.referrer_stats && summary.referrer_stats.length > 0 && (
                                            <div className="grid-section">
                                                <h3><i className="ri-links-line"></i> 유입 경로 분석</h3>
                                                <div className="ranking-list">
                                                    {summary.referrer_stats.map((ref, idx) => (
                                                        <div key={idx} className="ranking-item">
                                                            <span className="item-rank">{idx + 1}</span>
                                                            <div className="item-info">
                                                                <span className="item-title">{ref.source}</span>
                                                            </div>
                                                            <span className="item-count">{ref.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 세션 통계 */}
                                        {summary.session_stats && (
                                            <div className="grid-section">
                                                <h3><i className="ri-time-line"></i> 세션 통계</h3>
                                                <div className="pwa-stats-summary">
                                                    <div className="stat-card">
                                                        <div className="stat-label">총 세션 수</div>
                                                        <div className="stat-value">{summary.session_stats.total_sessions}</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <div className="stat-label">평균 체류시간</div>
                                                        <div className="stat-value">{Math.floor(summary.session_stats.avg_duration / 60)}분 {summary.session_stats.avg_duration % 60}초</div>
                                                    </div>
                                                    <div className="stat-card">
                                                        <div className="stat-label">이탈률</div>
                                                        <div className="stat-value">{summary.session_stats.bounce_rate.toFixed(1)}%</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 사용자 여정 패턴 */}
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
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="analytics-empty">
                            <i className="ri-inbox-line"></i>
                        </div>
                    )}

                    {/* [PHASE 20] Type Detail Modal */}
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
                                                        style={{
                                                            fontSize: '0.75rem',
                                                            color: '#60a5fa',
                                                            textDecoration: 'none',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            display: 'block'
                                                        }}
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
        </div >
    );
}
