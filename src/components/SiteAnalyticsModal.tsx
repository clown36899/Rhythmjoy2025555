import { useState, useEffect } from 'react';
import { cafe24 } from '../lib/cafe24Client';
import { isInternalAnalyticsRoute, isLikelyBotTraffic } from '../utils/analyticsEngine';
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
const asAnalyticsBool = (value: unknown) => (
    value === true ||
    value === 1 ||
    String(value || '').toLowerCase() === 'true' ||
    String(value || '').toLowerCase() === '1'
);
const normalizeAnalyticsEmail = (value: unknown) => String(value || '').trim().toLowerCase();

interface BottomMenuAppUserStat {
    visitorKey: string;
    label: string;
    userId?: string | null;
    isGuest: boolean;
    count: number;
    lastUsed: string | null;
}

interface BottomMenuAppStat {
    id: string;
    title: string;
    count: number;
    uniqueVisitors: number;
    memberClicks: number;
    guestClicks: number;
    lastUsed: string | null;
    users: BottomMenuAppUserStat[];
}

interface AnalyticsSummary {
    total_clicks: number;
    user_clicks: number; // 고유 방문자 기준
    anon_clicks: number; // 고유 방문자 기준
    session_users?: number; // 세션 기준
    session_anon?: number; // 세션 기준
    admin_clicks: number;
    visitor_summary?: {
        unique_total: number;
        unique_logged_in: number;
        unique_guest: number;
        session_total: number;
        session_logged_in: number;
        session_guest: number;
        raw_session_total?: number;
        logical_session_total?: number;
        raw_activity_total?: number;
        included_activity_total?: number;
        included_session_total?: number;
        engaged_unique: number;
        guest_missing_identifier: number;
        stitched_guest_devices: number;
    };
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
        raw_sessions?: number;
        avg_duration: number;
        median_duration?: number;
        engagement_rate?: number;
        bounce_rate: number;
        duration_cap_seconds?: number;
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
        recent_installs: { installed_at: string; user_id?: string; nickname?: string; fingerprint?: string; display_mode?: string }[];
        recent_pwa_sessions?: { session_start: string; user_id?: string; nickname?: string; display_mode?: string; duration_seconds?: number }[];
    };
    // [PHASE 20] Type Detail Data
    items_by_type?: Record<string, { title: string; count: number; url?: string }[]>;
    // [PHASE 21] Visitor Stats (Added)
    visitor_stats?: {
        weekday: { day: string; count: number; ratio: number }[];
        hourly: { hour: number; label: string; count: number; ratio: number }[];
        monthly: { month: string; count: number; ratio: number }[];
    };
    daily_visit_trend?: { date: string; count: number }[];
    total_pv?: number; // [PHASE 24] 실제 PV (전체 로그 수)
    guest_list?: GuestInfo[];
    bottom_menu_apps?: BottomMenuAppStat[];
}

interface UserInfo {
    user_id: string;
    nickname: string | null;
    visitCount: number;
    visitLogs: string[]; // Timestamps
    avgDuration?: number; // Average session duration in seconds
    activityCount?: number;
    bottomMenuClicks?: number;
    pageViews?: number;
    lastPage?: string | null;
    sessions?: UserSessionInfo[];
    activityLogs?: UserActivityInfo[];
}

interface UserActivityInfo {
    id: string;
    created_at: string;
    type: string;
    title: string;
    section: string | null;
    route: string | null;
    page_url: string | null;
    target_id: string | null;
    session_id: string | null;
    client_ip: string | null;
    ip_hash: string | null;
    platform: string | null;
    user_agent: string | null;
    referrer: string | null;
    sequence_number: number | null;
}

interface UserSessionInfo {
    session_id: string | null;
    session_start: string | null;
    duration_seconds: number | null;
    page_views: number;
    total_clicks: number;
    entry_page: string | null;
    exit_page: string | null;
    referrer: string | null;
    client_ip: string | null;
    ip_hash: string | null;
    platform: string | null;
    user_agent: string | null;
    is_pwa: boolean;
}

interface GuestInfo {
    key: string;
    label: string;
    fingerprint: string | null;
    clientIp: string | null;
    ipHash: string | null;
    visitCount: number;
    sessionCount: number;
    clickCount: number;
    pageViews: number;
    firstSeen: string | null;
    lastSeen: string | null;
    lastPage: string | null;
    referrer: string | null;
    platform: string | null;
    userAgent: string | null;
    isPwa: boolean;
    pwaDisplayMode: string | null;
    sessions: {
        session_id: string | null;
        session_start: string | null;
        duration_seconds: number | null;
        page_views: number;
        total_clicks: number;
        entry_page: string | null;
        exit_page: string | null;
        referrer: string | null;
        client_ip: string | null;
        platform: string | null;
        user_agent: string | null;
        is_pwa: boolean;
    }[];
    activityLogs?: UserActivityInfo[];
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_DURATION_CAP_SECONDS = 30 * 60;

const BOTTOM_MENU_SECTIONS = new Set(['bottom_navigation', 'bottom_menu_apps']);
const BOTTOM_MENU_APP_LABELS: Record<string, string> = {
    bottom_nav_home: '하단 네비 · 홈',
    bottom_nav_calendar: '하단 네비 · 전체달력',
    bottom_nav_forum: '하단 네비 · 포럼',
    bottom_nav_social: '하단 네비 · 소셜',
    bottom_nav_shopping: '하단 네비 · 쇼핑',
    bottom_nav_guide: '하단 네비 · 안내',
    bottom_nav_fab: '하단 네비 · 중앙 액션',
    home_menu_home: '홈 메뉴 · 홈',
    home_menu_calendar: '홈 메뉴 · 캘린더',
    home_menu_events: '홈 메뉴 · 강습&행사',
    home_menu_board: '홈 메뉴 · 자유게시판',
    home_menu_places: '홈 메뉴 · map',
    'home_menu_forum-media': '홈 메뉴 · SNS 아카이브',
    'home_menu_forum-library': '홈 메뉴 · 라이브러리',
    'home_menu_forum-links': '홈 메뉴 · 사이트 모음',
    'home_menu_bpm-tapper': '홈 메뉴 · BPM 측정기',
    home_menu_metronome: '홈 메뉴 · 메트로놈',
    'home_menu_tempo-tool': '홈 메뉴 · BPM/메트로놈',
    home_menu_shopping: '홈 메뉴 · 쇼핑',
    home_menu_guide: '홈 메뉴 · 안내',
    home_menu_register: '홈 메뉴 · 일정 등록',
};

const LEGACY_BOTTOM_NAV_ID_MAP: Record<string, string> = {
    '/': 'bottom_nav_home',
    '/v2': 'bottom_nav_home',
    '/calendar': 'bottom_nav_calendar',
    '/forum': 'bottom_nav_forum',
    '/social': 'bottom_nav_social',
    '/shopping': 'bottom_nav_shopping',
    '/guide': 'bottom_nav_guide',
    fab_action_center: 'bottom_nav_fab',
};

const normalizeBottomMenuAppId = (row: any) => {
    if (!BOTTOM_MENU_SECTIONS.has(String(row.section || ''))) return null;

    const rawId = String(row.target_id || '').trim();
    if (!rawId) return null;
    if (LEGACY_BOTTOM_NAV_ID_MAP[rawId]) return LEGACY_BOTTOM_NAV_ID_MAP[rawId];
    if (rawId.startsWith('bottom_nav_') || rawId.startsWith('home_menu_')) return rawId;

    return `bottom_app_${rawId.replace(/^\/+/, '').replace(/[^a-z0-9_-]+/gi, '_') || 'unknown'}`;
};

export default function SiteAnalyticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'summary' | 'daily'>('daily');
    const [userList, setUserList] = useState<UserInfo[]>([]);
    const [guestList, setGuestList] = useState<GuestInfo[]>([]);
    const [showUserList, setShowUserList] = useState(false);
    const [showGuestList, setShowGuestList] = useState(false);
    // [PHASE 20] Type Detail Modal State
    const [selectedTypeDetail, setSelectedTypeDetail] = useState<{ type: string; items: { title: string; count: number; url?: string }[] } | null>(null);
    // [PHASE 18] 캐싱
    const [_cache, setCache] = useState<Map<string, AnalyticsSummary>>(new Map());
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

    const fetchAnalytics = async (_forceRefresh = false) => {
        setLoading(true);
        setUserList([]);
        setGuestList([]);
        let localUserList: UserInfo[] = [];

        try {
            let startStr: string, endStr: string;

            // Summary mode -> Fetch 1 year, Daily mode -> Selected range
            if (viewMode === 'summary') {
                const today = new Date();
                const past = new Date();
                past.setDate(today.getDate() - 365); // 1년치 데이터 (비지터 분석용)
                startStr = getKRDateString(past) + 'T00:00:00+09:00';
                endStr = getKRDateString(today) + 'T23:59:59+09:00';
            } else {
                startStr = dateRange.start + 'T00:00:00+09:00';
                endStr = dateRange.end + 'T23:59:59+09:00';
            }

            // RPC Call
            const { data: rpcData, error: rpcError } = await cafe24
                .rpc('get_analytics_summary_v2', {
                    start_date: startStr,
                    end_date: endStr
                });

            let clickBasedLoggedIn = 0;
            let clickBasedAnon = 0;
            let rpcVisitorSummary: any = null;
            let rpcGuestList: GuestInfo[] | null = null;

            if (rpcError) {
                console.error('[Analytics] RPC Call Failed:', rpcError);
            } else if (rpcData) {
                const stats = rpcData as any;
                rpcVisitorSummary = stats.visitor_summary || null;
                clickBasedLoggedIn = rpcVisitorSummary?.unique_logged_in ?? stats.logged_in_visits ?? 0;
                clickBasedAnon = rpcVisitorSummary?.unique_guest ?? stats.anonymous_visits ?? 0;

                localUserList = (stats.user_list || []).map((u: any) => ({
                    user_id: u.user_id,
                    nickname: u.nickname,
                    visitCount: u.visitCount,
                    visitLogs: u.visitLogs || [],
                    avgDuration: u.avgDuration || 0
                })).filter((u: any) => !u.user_id.startsWith('91b04b25')); // [FIX] Exclude test account from list

                setUserList(localUserList);
                rpcGuestList = Array.isArray(stats.guest_list)
                    ? stats.guest_list.map((guest: any) => ({
                        key: String(guest.key),
                        label: guest.label || 'Guest',
                        fingerprint: guest.fingerprint || null,
                        clientIp: guest.clientIp || guest.client_ip || null,
                        ipHash: guest.ipHash || guest.ip_hash || null,
                        visitCount: Number(guest.visitCount || guest.visit_count || 0) || 1,
                        sessionCount: Number(guest.sessionCount || guest.session_count || 0),
                        clickCount: Number(guest.clickCount || guest.click_count || 0),
                        pageViews: Number(guest.pageViews || guest.page_views || 0),
                        firstSeen: guest.firstSeen || guest.first_seen || null,
                        lastSeen: guest.lastSeen || guest.last_seen || null,
                        lastPage: guest.lastPage || guest.last_page || null,
                        referrer: guest.referrer || null,
                        platform: guest.platform || null,
                        userAgent: guest.userAgent || guest.user_agent || null,
                        isPwa: Boolean(guest.isPwa || guest.is_pwa),
                        pwaDisplayMode: guest.pwaDisplayMode || guest.pwa_display_mode || null,
                        sessions: Array.isArray(guest.sessions) ? guest.sessions : [],
                        activityLogs: Array.isArray(guest.activityLogs || guest.activity_logs)
                            ? (guest.activityLogs || guest.activity_logs)
                            : []
                    }))
                    : null;
            }

            // [PHASE 22] 특정 사용자 제외 (앱테스트계정 ID Prefix)
            // 풀 ID를 못 가져오는 경우를 대비해 Prefix로 차단 (UUID 충돌 가능성 희박)
            const excludedPrefix = '91b04b25';
            const adminUserIds = new Set<string>();
            const adminEmails = new Set<string>();
            const { data: adminRows, error: adminRowsError } = await cafe24
                .from('board_admins')
                .select('user_id,email,admin_email');

            if (adminRowsError) {
                console.warn('[Analytics] Failed to fetch admin identities:', adminRowsError);
            } else {
                (adminRows || []).forEach((row: any) => {
                    if (row.user_id) adminUserIds.add(String(row.user_id));
                    const email = normalizeAnalyticsEmail(row.email || row.admin_email);
                    if (email) adminEmails.add(email);
                });
            }

            const [{ data: analyticsUsers, error: analyticsUsersError }, { data: boardUsersForAdmin, error: boardUsersForAdminError }] = await Promise.all([
                cafe24.from('users').select('id,email,is_admin'),
                cafe24.from('board_users').select('user_id,email,admin_email,is_admin'),
            ]);

            if (analyticsUsersError) {
                console.warn('[Analytics] Failed to fetch analytics user admin identities:', analyticsUsersError);
            } else {
                (analyticsUsers || []).forEach((row: any) => {
                    const email = normalizeAnalyticsEmail(row.email);
                    if (asAnalyticsBool(row.is_admin) || (email && adminEmails.has(email))) {
                        if (row.id) adminUserIds.add(String(row.id));
                    }
                });
            }

            if (boardUsersForAdminError) {
                console.warn('[Analytics] Failed to fetch board user admin identities:', boardUsersForAdminError);
            } else {
                (boardUsersForAdmin || []).forEach((row: any) => {
                    const email = normalizeAnalyticsEmail(row.email || row.admin_email);
                    if (asAnalyticsBool(row.is_admin) || (email && adminEmails.has(email))) {
                        if (row.user_id) adminUserIds.add(String(row.user_id));
                    }
                });
            }

            // Raw data fetch with pagination.
            let allLogs: any[] = [];
            let page = 0;
            const PAGE_SIZE = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data: chunk, error } = await cafe24
                    .from('site_analytics_logs')
                    .select('*')
                    .gte('created_at', startStr)
                    .lte('created_at', endStr)
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                if (chunk && chunk.length > 0) {
                    allLogs = allLogs.concat(chunk);
                    if (chunk.length < PAGE_SIZE) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
                if (allLogs.length > 300000) break; // Safety brake
            }
            const data = allLogs;
            const getAnalyticsRowPath = (row: any) => row.page_url || row.route || row.entry_page || row.exit_page || row.path || row.target_id || '';
            const isInternalAnalyticsRow = (row: any) => {
                const path = String(getAnalyticsRowPath(row) || '');
                return isInternalAnalyticsRoute(path)
                    || String(row.section || '').includes('admin')
                    || String(row.target_id || '').startsWith('admin_');
            };
            const isBotAnalyticsRow = (row: any) => (
                row.user_agent ? isLikelyBotTraffic(row.user_agent, false) : false
            );
            const isExplicitlyExcludedAnalyticsRow = (row: any) => (
                row.analytics_excluded === true ||
                row.analytics_excluded === 1 ||
                String(row.analytics_excluded || '').toLowerCase() === 'true'
            );
            const hasAnalyticsIdentityEvidence = (row: any) => (
                Boolean(row.user_id || row.userId || row.fingerprint || row.user_agent || row.platform)
            );
            const getFilterClientIp = (row: any) => row.client_ip || row.ip_address || row.ip || null;
            const getFilterGuestDeviceIdentity = (row: any) => {
                const raw = `${row.platform || ''} ${row.user_agent || ''}`.toLowerCase();
                if (raw.includes('ipad')) return 'ipad';
                if (raw.includes('iphone') || raw.includes('ios') || raw.includes('crios')) return 'iphone';
                if (raw.includes('android')) return 'android';
                if (raw.includes('windows') || raw.includes('win32') || raw.includes('win64') || raw.includes('wow64')) return 'windows';
                if (raw.includes('mac os') || raw.includes('macintosh') || raw.includes('macintel') || raw.includes('macos')) return 'macos';
                if (raw.includes('cros') || raw.includes('chrome os')) return 'chromeos';
                if (raw.includes('linux') || raw.includes('x11')) return 'linux';
                return row.platform ? String(row.platform).trim().toLowerCase() : 'unknown';
            };
            const getFilterGuestNetworkIdentity = (row: any) => {
                const network = row.ip_hash || getFilterClientIp(row);
                if (!network) return null;
                return `${String(network)}:${getFilterGuestDeviceIdentity(row)}`;
            };
            const isDatacenterIp = (value: unknown) => {
                const parts = String(value || '').replace(/^::ffff:/, '').trim().split('.').map(Number);
                if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
                const [a, b] = parts;
                return (a === 44 && b >= 192) || [3, 13, 18, 34, 35, 52, 54].includes(a);
            };
            const isDatacenterAnalyticsRow = (row: any) => isDatacenterIp(getFilterClientIp(row));

            const botSessionIds = new Set<string>();
            const botFingerprints = new Set<string>();
            data.forEach(d => {
                if (!isBotAnalyticsRow(d)) return;
                if (d.session_id) botSessionIds.add(String(d.session_id));
                if (d.fingerprint) botFingerprints.add(String(d.fingerprint));
            });

            // RPC counts are now accurate (DB migration applied), so no need to overwrite.
            // clickBasedLoggedIn and clickBasedAnon are already set from rpcData.

            // Session Data (Paginated)
            let allSessions: any[] = [];
            page = 0;
            hasMore = true;

            while (hasMore) {
                const { data: sChunk, error: sError } = await cafe24
                    .from('session_logs')
                    .select('*')
                    .gte('session_start', startStr)
                    .lte('session_start', endStr)
                    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

                if (sError) {
                    console.error('Session fetch error:', sError);
                    break;
                }

                if (sChunk && sChunk.length > 0) {
                    allSessions = allSessions.concat(sChunk);
                    if (sChunk.length < PAGE_SIZE) {
                        hasMore = false;
                    } else {
                        page++;
                    }
                } else {
                    hasMore = false;
                }
                if (allSessions.length > 50000) break;
            }
            const rawSessionIdToUser = new Map<string, Set<string>>();
            const rawFingerprintToUser = new Map<string, Set<string>>();
            const addRawIdentity = (map: Map<string, Set<string>>, key: unknown, userId: string) => {
                if (!key || !userId) return;
                const stringKey = String(key);
                const values = map.get(stringKey) || new Set<string>();
                values.add(userId);
                map.set(stringKey, values);
            };
            const getSingleRawIdentity = (map: Map<string, Set<string>>, key: unknown) => {
                if (!key) return null;
                const values = map.get(String(key));
                if (!values || values.size !== 1) return null;
                return Array.from(values)[0];
            };
            [...allSessions, ...data].forEach((row: any) => {
                if (!row.user_id) return;
                const userId = String(row.user_id);
                addRawIdentity(rawSessionIdToUser, row.session_id, userId);
                addRawIdentity(rawFingerprintToUser, row.fingerprint, userId);
            });
            const adminSessionIds = new Set<string>();
            const adminFingerprints = new Set<string>();
            const adminNetworkDeviceIds = new Set<string>();
            let adminDeviceChanged = true;
            while (adminDeviceChanged) {
                adminDeviceChanged = false;
                [...allSessions, ...data].forEach((row: any) => {
                    const networkDeviceId = getFilterGuestNetworkIdentity(row);
                    const directAdmin = asAnalyticsBool(row.is_admin) || (row.user_id && adminUserIds.has(String(row.user_id)));
                    const linkedAdminDevice = (
                        (row.session_id && adminSessionIds.has(String(row.session_id))) ||
                        (row.fingerprint && adminFingerprints.has(String(row.fingerprint))) ||
                        (networkDeviceId && adminNetworkDeviceIds.has(networkDeviceId))
                    );
                    if (!directAdmin && !linkedAdminDevice) return;
                    if (row.session_id && !adminSessionIds.has(String(row.session_id))) {
                        adminSessionIds.add(String(row.session_id));
                        adminDeviceChanged = true;
                    }
                    if (row.fingerprint && !adminFingerprints.has(String(row.fingerprint))) {
                        adminFingerprints.add(String(row.fingerprint));
                        adminDeviceChanged = true;
                    }
                    if (networkDeviceId && !adminNetworkDeviceIds.has(networkDeviceId)) {
                        adminNetworkDeviceIds.add(networkDeviceId);
                        adminDeviceChanged = true;
                    }
                });
            }

            const resolveAnalyticsUserId = (row: any) => {
                if (row.user_id) return String(row.user_id);
                const sessionUserId = getSingleRawIdentity(rawSessionIdToUser, row.session_id);
                if (sessionUserId) return sessionUserId;
                const fingerprintUserId = getSingleRawIdentity(rawFingerprintToUser, row.fingerprint);
                if (fingerprintUserId) return fingerprintUserId;
                return null;
            };

            const isAdminAnalyticsRow = (row: any) => {
                if (asAnalyticsBool(row.is_admin)) return true;
                if (row.user_id) return adminUserIds.has(String(row.user_id));
                if (row.session_id && adminSessionIds.has(String(row.session_id))) return true;
                if (row.fingerprint && adminFingerprints.has(String(row.fingerprint))) return true;
                const networkDeviceId = getFilterGuestNetworkIdentity(row);
                if (networkDeviceId && adminNetworkDeviceIds.has(networkDeviceId)) return true;
                const sessionUsers = row.session_id ? rawSessionIdToUser.get(String(row.session_id)) : null;
                const fingerprintUsers = row.fingerprint ? rawFingerprintToUser.get(String(row.fingerprint)) : null;
                return Boolean(
                    (sessionUsers && Array.from(sessionUsers).some((userId) => adminUserIds.has(userId))) ||
                    (fingerprintUsers && Array.from(fingerprintUsers).some((userId) => adminUserIds.has(userId)))
                );
            };

            const validData = data.filter(d => {
                const userId = resolveAnalyticsUserId(d);
                return (
                    !isExplicitlyExcludedAnalyticsRow(d) &&
                    !isInternalAnalyticsRow(d) &&
                    !isDatacenterAnalyticsRow(d) &&
                    !isAdminAnalyticsRow(d) &&
                    (userId || hasAnalyticsIdentityEvidence(d)) &&
                    (userId ? !userId.startsWith(excludedPrefix) : true) &&
                    !isBotAnalyticsRow(d)
                );
            });

            const sessions = allSessions.filter(s => {
                const userId = resolveAnalyticsUserId(s);
                return (
                    !isExplicitlyExcludedAnalyticsRow(s) &&
                    !isInternalAnalyticsRow(s) &&
                    !isDatacenterAnalyticsRow(s) &&
                    !isAdminAnalyticsRow(s) &&
                    (userId || hasAnalyticsIdentityEvidence(s)) &&
                    (userId ? !userId.startsWith(excludedPrefix) : true) &&
                    (s.session_id ? !botSessionIds.has(String(s.session_id)) : true) &&
                    (s.fingerprint ? !botFingerprints.has(String(s.fingerprint)) : true) &&
                    !isBotAnalyticsRow(s)
                );
            });
            const sessionsError = null;

            const sessionData = sessions || [];

            const fingerprintToUser = new Map<string, Set<string>>();
            const sessionIdToUser = new Map<string, Set<string>>();
            const addIdentity = (map: Map<string, Set<string>>, key: unknown, userId: string) => {
                if (!key || !userId) return;
                const stringKey = String(key);
                const values = map.get(stringKey) || new Set<string>();
                values.add(userId);
                map.set(stringKey, values);
            };
            const getSingleIdentity = (map: Map<string, Set<string>>, key: unknown) => {
                if (!key) return null;
                const values = map.get(String(key));
                if (!values || values.size !== 1) return null;
                return Array.from(values)[0];
            };
            const getClientIp = (row: any) => row.client_ip || row.ip_address || row.ip || null;
            const getGuestDeviceIdentity = (row: any) => {
                const raw = `${row.platform || ''} ${row.user_agent || ''}`.toLowerCase();
                if (raw.includes('ipad')) return 'ipad';
                if (raw.includes('iphone') || raw.includes('ios') || raw.includes('crios')) return 'iphone';
                if (raw.includes('android')) return 'android';
                if (raw.includes('windows') || raw.includes('win32') || raw.includes('win64') || raw.includes('wow64')) return 'windows';
                if (raw.includes('mac os') || raw.includes('macintosh') || raw.includes('macintel') || raw.includes('macos')) return 'macos';
                if (raw.includes('cros') || raw.includes('chrome os')) return 'chromeos';
                if (raw.includes('linux') || raw.includes('x11')) return 'linux';
                return row.platform ? String(row.platform).trim().toLowerCase() : 'unknown';
            };
            const getGuestNetworkIdentity = (row: any) => {
                const network = row.ip_hash || getClientIp(row);
                if (!network) return null;
                return `${String(network)}:${getGuestDeviceIdentity(row)}`;
            };
            [...sessionData, ...validData].forEach((row: any) => {
                if (row.session_id && row.user_id) {
                    addIdentity(sessionIdToUser, row.session_id, String(row.user_id));
                }
                if (row.fingerprint && row.user_id) {
                    addIdentity(fingerprintToUser, row.fingerprint, String(row.user_id));
                }
            });

            const getVisitorKey = (row: any, fallbackId?: string | number | null) => {
                const fingerprint = row.fingerprint ? String(row.fingerprint) : '';
                const sessionId = row.session_id ? String(row.session_id) : '';
                if (row.user_id) return `user:${String(row.user_id)}`;
                const sessionUserId = getSingleIdentity(sessionIdToUser, sessionId);
                if (sessionUserId) return `user:${sessionUserId}`;
                const fingerprintUserId = getSingleIdentity(fingerprintToUser, fingerprint);
                if (fingerprintUserId) return `user:${fingerprintUserId}`;
                if (fingerprint) return `guest:${fingerprint}`;
                const guestNetworkIdentity = getGuestNetworkIdentity(row);
                if (guestNetworkIdentity) return `guest:${guestNetworkIdentity}`;
                if (fallbackId) return `guest_session:${String(fallbackId)}`;
                return 'guest:unknown';
            };

            const getCappedDuration = (row: any) => {
                if (row.duration_seconds === null || row.duration_seconds === undefined) return null;
                const parsed = Number(row.duration_seconds);
                if (!Number.isFinite(parsed)) return null;
                return Math.min(Math.max(0, Math.floor(parsed)), SESSION_DURATION_CAP_SECONDS);
            };

            const getPageViewCount = (row: any) => {
                const parsed = Number(row.page_views);
                return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
            };

            const getRowPage = (row: any) => row.page_url || row.entry_page || row.exit_page || row.route || null;
            const getRowReferrer = (row: any) => row.referrer || null;
            const getFriendlyTitle = (_type: string | null, id: string | null, title: string | null) => {
                if (title) return title;
                const safeId = id || '';
                if (safeId === 'login') return '로그인 버튼';
                if (safeId === 'home_weekly_calendar_shortcut') return '주간 일정 바로가기 (상단)';
                if (safeId === 'week_calendar_shortcut') return '주간 일정 바로가기';
                if (_type === 'page_view') return getRowPage({ page_url: id }) || '페이지 이동';
                return safeId || '활동';
            };

            const logicalSessions = (() => {
                const normalized = sessionData
                    .map((s: any) => {
                        const startMs = new Date(s.session_start).getTime();
                        const duration = getCappedDuration(s);
                        return {
                            ...s,
                            visitorKey: getVisitorKey(s, s.session_id),
                            startMs,
                            endMs: startMs + ((duration || 0) * 1000),
                            duration_seconds: duration,
                            page_views: getPageViewCount(s),
                            raw_session_count: 1,
                            has_duration: duration !== null,
                        };
                    })
                    .filter((s: any) => Number.isFinite(s.startMs))
                    .sort((a: any, b: any) => {
                        const visitorCompare = a.visitorKey.localeCompare(b.visitorKey);
                        return visitorCompare || a.startMs - b.startMs;
                    });

                const merged: any[] = [];
                normalized.forEach((session: any) => {
                    const previous = merged[merged.length - 1];
                    const previousEnd = previous ? Math.max(previous.endMs, previous.startMs) : 0;
                    const sameVisitor = previous?.visitorKey === session.visitorKey;
                    const withinTimeout = sameVisitor && session.startMs - previousEnd <= SESSION_TIMEOUT_MS;

                    if (withinTimeout) {
                        previous.endMs = Math.max(previous.endMs, session.endMs, session.startMs);
                        previous.duration_seconds = Math.min(
                            SESSION_DURATION_CAP_SECONDS,
                            Math.floor(Math.max(0, previous.endMs - previous.startMs) / 1000)
                        );
                        previous.total_clicks = Number(previous.total_clicks || 0) + Number(session.total_clicks || 0);
                        previous.page_views = Number(previous.page_views || 0) + Number(session.page_views || 1);
                        previous.raw_session_count += 1;
                        previous.has_duration = previous.has_duration || session.has_duration;
                        previous.is_pwa = Boolean(previous.is_pwa || session.is_pwa);
                        previous.user_id = previous.user_id || session.user_id;
                        previous.fingerprint = previous.fingerprint || session.fingerprint;
                        previous.session_start = previous.session_start < session.session_start ? previous.session_start : session.session_start;
                        return;
                    }

                    merged.push({ ...session });
                });

                return merged;
            })();

            const visitorIdentityMap = new Map<string, { key: string; type: 'user' | 'guest'; firstSeen: string; lastSeen: string }>();
            const addVisitorIdentity = (row: any, timeIso: string | null, fallbackId?: string | number | null) => {
                if (!timeIso) return;
                const key = getVisitorKey(row, fallbackId);
                const type = key.startsWith('user:') ? 'user' : 'guest';
                const existing = visitorIdentityMap.get(key);
                if (!existing) {
                    visitorIdentityMap.set(key, { key, type, firstSeen: timeIso, lastSeen: timeIso });
                    return;
                }
                if (new Date(timeIso).getTime() < new Date(existing.firstSeen).getTime()) existing.firstSeen = timeIso;
                if (new Date(timeIso).getTime() > new Date(existing.lastSeen).getTime()) existing.lastSeen = timeIso;
            };

            sessionData.forEach((s: any) => addVisitorIdentity(s, s.session_start, s.session_id));
            validData.forEach((d: any) => addVisitorIdentity(d, d.created_at, d.session_id || d.id));

            const uniqueVisitors = Array.from(visitorIdentityMap.values());
            const uniqueLoggedInVisitors = uniqueVisitors.filter(v => v.type === 'user').length;
            const uniqueGuestVisitors = uniqueVisitors.filter(v => v.type === 'guest').length;
            const engagedVisitorKeys = new Set<string>();
            validData.forEach((d: any) => engagedVisitorKeys.add(getVisitorKey(d, d.session_id || d.id)));
            const guestMissingIdentifier = [
                ...sessionData.filter((s: any) => !s.user_id && !s.fingerprint && !getGuestNetworkIdentity(s)),
                ...validData.filter((d: any) => !d.user_id && !d.fingerprint && !getGuestNetworkIdentity(d))
            ].length;
            const fingerprintTypeMap = new Map<string, { user: boolean; guest: boolean }>();
            [...sessionData, ...validData].forEach((row: any) => {
                if (!row.fingerprint) return;
                const current = fingerprintTypeMap.get(row.fingerprint) || { user: false, guest: false };
                if (row.user_id) current.user = true;
                else current.guest = true;
                fingerprintTypeMap.set(row.fingerprint, current);
            });
            const stitchedGuestDevices = Array.from(fingerprintTypeMap.values()).filter(v => v.user && v.guest).length;

            const sessionLoggedInVisits = logicalSessions.filter((s: any) => getVisitorKey(s, s.session_id).startsWith('user:')).length;
            const sessionAnonVisits = logicalSessions.filter((s: any) => !getVisitorKey(s, s.session_id).startsWith('user:')).length;
            const hasVisitorData = uniqueVisitors.length > 0;
            const displayLoggedInVisits = rpcVisitorSummary?.unique_logged_in ?? (hasVisitorData ? uniqueLoggedInVisitors : clickBasedLoggedIn);
            const displayAnonVisits = rpcVisitorSummary?.unique_guest ?? (hasVisitorData ? uniqueGuestVisitors : clickBasedAnon);

            const userActivityMap = new Map<string, UserActivityInfo[]>();
            validData.forEach((event: any, index: number) => {
                const visitorKey = getVisitorKey(event, event.session_id || event.id || index);
                if (!visitorKey.startsWith('user:')) return;

                const userId = visitorKey.slice(5);
                const item: UserActivityInfo = {
                    id: String(event.id || `${event.session_id || 'event'}-${event.sequence_number || index}`),
                    created_at: event.created_at,
                    type: event.target_type || 'activity',
                    title: getFriendlyTitle(event.target_type, event.target_id, event.target_title),
                    section: event.section || null,
                    route: event.route || null,
                    page_url: event.page_url || null,
                    target_id: event.target_id || null,
                    session_id: event.session_id || null,
                    client_ip: getClientIp(event),
                    ip_hash: event.ip_hash || null,
                    platform: event.platform || null,
                    user_agent: event.user_agent || null,
                    referrer: event.referrer || null,
                    sequence_number: Number.isFinite(Number(event.sequence_number)) ? Number(event.sequence_number) : null,
                };

                const list = userActivityMap.get(userId) || [];
                list.push(item);
                userActivityMap.set(userId, list);
            });

            userActivityMap.forEach((list) => {
                list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            });

            const bottomMenuClicksByUser = new Map<string, number>();
            validData.forEach((event: any, index: number) => {
                if (!normalizeBottomMenuAppId(event)) return;

                const visitorKey = getVisitorKey(event, event.session_id || event.id || index);
                if (!visitorKey.startsWith('user:')) return;

                const userId = visitorKey.slice(5);
                bottomMenuClicksByUser.set(userId, (bottomMenuClicksByUser.get(userId) || 0) + 1);
            });

            const userSessionDetailMap = new Map<string, UserSessionInfo[]>();
            logicalSessions.forEach((session: any) => {
                const visitorKey = getVisitorKey(session, session.session_id);
                if (!visitorKey.startsWith('user:')) return;

                const userId = visitorKey.slice(5);
                const item: UserSessionInfo = {
                    session_id: session.session_id || null,
                    session_start: session.session_start || null,
                    duration_seconds: getCappedDuration(session),
                    page_views: getPageViewCount(session),
                    total_clicks: Number(session.total_clicks || 0),
                    entry_page: session.entry_page || null,
                    exit_page: session.exit_page || null,
                    referrer: session.referrer || null,
                    client_ip: getClientIp(session),
                    ip_hash: session.ip_hash || null,
                    platform: session.platform || null,
                    user_agent: session.user_agent || null,
                    is_pwa: Boolean(session.is_pwa),
                };

                const list = userSessionDetailMap.get(userId) || [];
                list.push(item);
                userSessionDetailMap.set(userId, list);
            });

            userSessionDetailMap.forEach((list) => {
                list.sort((a, b) => new Date(b.session_start || 0).getTime() - new Date(a.session_start || 0).getTime());
            });

            const sessionUserMap = new Map<string, UserInfo & { durationTotal: number; durationCount: number }>();
            logicalSessions
                .forEach((s: any) => {
                    const visitorKey = getVisitorKey(s, s.session_id);
                    if (!visitorKey.startsWith('user:')) return;
                    const userId = visitorKey.slice(5);
                    const existing = sessionUserMap.get(userId) || {
                        user_id: userId,
                        nickname: null,
                        visitCount: 0,
                        visitLogs: [],
                        avgDuration: 0,
                        activityCount: 0,
                        pageViews: 0,
                        lastPage: null,
                        sessions: [],
                        activityLogs: [],
                        durationTotal: 0,
                        durationCount: 0
                    };
                    existing.visitCount += 1;
                    existing.visitLogs.push(s.session_start);
                    existing.pageViews = Number(existing.pageViews || 0) + getPageViewCount(s);
                    existing.lastPage = existing.lastPage || s.exit_page || s.entry_page || null;
                    if (typeof s.duration_seconds === 'number') {
                        existing.durationTotal += s.duration_seconds;
                        existing.durationCount += 1;
                    }
                    sessionUserMap.set(userId, existing);
                });

            const sessionUserIds = Array.from(sessionUserMap.keys());
            const rpcNicknameMap = new Map<string, string | null>(
                localUserList.map((userInfo) => [userInfo.user_id, userInfo.nickname])
            );
            const nicknameMap = new Map<string, string | null>();
            if (sessionUserIds.length > 0) {
                const { data: sessionUsers, error: sessionUsersError } = await cafe24
                    .from('board_users')
                    .select('user_id, nickname')
                    .in('user_id', sessionUserIds);

                if (sessionUsersError) {
                    console.warn('[Analytics] Failed to fetch session user nicknames:', sessionUsersError);
                } else {
                    (sessionUsers || []).forEach((u: any) => nicknameMap.set(u.user_id, u.nickname));
                }
            }

            const sessionUserList = Array.from(sessionUserMap.values())
                .map(userInfo => {
                    const avgDuration = userInfo.durationCount > 0 ? Math.round(userInfo.durationTotal / userInfo.durationCount) : 0;
                    return {
                        user_id: userInfo.user_id,
                        nickname: getAnalyticsUserDisplayName(
                            userInfo.user_id,
                            nicknameMap.get(userInfo.user_id) || rpcNicknameMap.get(userInfo.user_id) || userInfo.nickname
                        ),
                        visitCount: userInfo.visitCount,
                        visitLogs: userInfo.visitLogs.sort((a, b) => new Date(b).getTime() - new Date(a).getTime()),
                        avgDuration,
                        activityCount: userActivityMap.get(userInfo.user_id)?.length || 0,
                        bottomMenuClicks: bottomMenuClicksByUser.get(userInfo.user_id) || 0,
                        pageViews: userInfo.pageViews || 0,
                        lastPage: userInfo.lastPage || userActivityMap.get(userInfo.user_id)?.[0]?.page_url || userActivityMap.get(userInfo.user_id)?.[0]?.route || null,
                        sessions: userSessionDetailMap.get(userInfo.user_id) || [],
                        activityLogs: userActivityMap.get(userInfo.user_id)?.slice(0, 150) || []
                    };
                })
                .sort((a, b) => b.visitCount - a.visitCount);

            if (sessionUserList.length > 0) {
                localUserList = sessionUserList;
                setUserList(sessionUserList);
            }

            const guestMap = new Map<string, GuestInfo & { seenMs: number[]; sessionClickCount: number; activityEventCount: number }>();

            const ensureGuest = (row: any, timeIso: string | null, fallbackId?: string | number | null) => {
                if (!timeIso) return null;
                const key = getVisitorKey(row, fallbackId);
                if (key.startsWith('user:')) return null;

                const ms = new Date(timeIso).getTime();
                if (!Number.isFinite(ms)) return null;

                const existing = guestMap.get(key) || {
                    key,
                    label: 'Guest',
                    fingerprint: row.fingerprint ? String(row.fingerprint) : null,
                    clientIp: getClientIp(row),
                    ipHash: row.ip_hash || null,
                    visitCount: 0,
                    sessionCount: 0,
                    clickCount: 0,
                    sessionClickCount: 0,
                    activityEventCount: 0,
                    pageViews: 0,
                    firstSeen: timeIso,
                    lastSeen: timeIso,
                    lastPage: getRowPage(row),
                    referrer: getRowReferrer(row),
                    platform: row.platform || null,
                    userAgent: row.user_agent || null,
                    isPwa: Boolean(row.is_pwa),
                    pwaDisplayMode: row.pwa_display_mode || null,
                    sessions: [],
                    activityLogs: [],
                    seenMs: [],
                };

                existing.fingerprint = existing.fingerprint || (row.fingerprint ? String(row.fingerprint) : null);
                existing.clientIp = existing.clientIp || getClientIp(row);
                existing.ipHash = existing.ipHash || row.ip_hash || null;
                existing.platform = existing.platform || row.platform || null;
                existing.userAgent = existing.userAgent || row.user_agent || null;
                existing.referrer = existing.referrer || getRowReferrer(row);
                existing.isPwa = Boolean(existing.isPwa || row.is_pwa);
                existing.pwaDisplayMode = existing.pwaDisplayMode || row.pwa_display_mode || null;
                existing.seenMs.push(ms);

                const currentLast = existing.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
                if (ms >= currentLast) {
                    existing.lastSeen = timeIso;
                    existing.lastPage = getRowPage(row) || existing.lastPage;
                    existing.clientIp = getClientIp(row) || existing.clientIp;
                    existing.platform = row.platform || existing.platform;
                    existing.userAgent = row.user_agent || existing.userAgent;
                }

                const currentFirst = existing.firstSeen ? new Date(existing.firstSeen).getTime() : ms;
                if (ms <= currentFirst) existing.firstSeen = timeIso;

                guestMap.set(key, existing);
                return existing;
            };

            sessionData.forEach((session: any) => {
                const guest = ensureGuest(session, session.session_start, session.session_id);
                if (!guest) return;
                guest.sessionCount += 1;
                guest.pageViews += getPageViewCount(session);
                guest.sessionClickCount += Number(session.total_clicks || 0);
                guest.sessions.push({
                    session_id: session.session_id || null,
                    session_start: session.session_start || null,
                    duration_seconds: getCappedDuration(session),
                    page_views: getPageViewCount(session),
                    total_clicks: Number(session.total_clicks || 0),
                    entry_page: session.entry_page || null,
                    exit_page: session.exit_page || null,
                    referrer: session.referrer || null,
                    client_ip: getClientIp(session),
                    platform: session.platform || null,
                    user_agent: session.user_agent || null,
                    is_pwa: Boolean(session.is_pwa),
                });
            });

            validData.forEach((event: any, index: number) => {
                const guest = ensureGuest(event, event.created_at, event.session_id || event.id);
                if (!guest) return;
                guest.activityEventCount += 1;
                guest.activityLogs = guest.activityLogs || [];
                guest.activityLogs.push({
                    id: String(event.id || `${event.session_id || 'event'}-${event.sequence_number || index}`),
                    created_at: event.created_at,
                    type: event.target_type || event.type || 'activity',
                    title: getFriendlyTitle(event.target_type || null, event.target_id || null, event.target_title || null),
                    section: event.section || null,
                    route: event.route || null,
                    page_url: event.page_url || null,
                    target_id: event.target_id || null,
                    session_id: event.session_id || null,
                    client_ip: getClientIp(event),
                    ip_hash: event.ip_hash || null,
                    platform: event.platform || null,
                    user_agent: event.user_agent || null,
                    referrer: event.referrer || null,
                    sequence_number: event.sequence_number ?? null
                });
                if (!guest.lastPage) guest.lastPage = getRowPage(event);
            });

            const nextGuestList = Array.from(guestMap.values())
                .map((guest) => {
                    const { seenMs, sessionClickCount, activityEventCount, ...safeGuest } = guest;
                    const visitBuckets = new Set(seenMs.map(ms => Math.floor(ms / (6 * 60 * 60 * 1000))));
                    return {
                        ...safeGuest,
                        clickCount: Math.max(activityEventCount || 0, sessionClickCount || 0),
                        visitCount: visitBuckets.size || safeGuest.sessionCount || 1,
                        sessions: [...safeGuest.sessions].sort((a, b) =>
                            new Date(b.session_start || 0).getTime() - new Date(a.session_start || 0).getTime()
                        ),
                        activityLogs: [...(safeGuest.activityLogs || [])]
                            .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                            .slice(0, 80),
                    };
                })
                .sort((a, b) => new Date(b.lastSeen || 0).getTime() - new Date(a.lastSeen || 0).getTime())
                .map((guest, index) => ({ ...guest, label: `Guest ${index + 1}` }));

            setGuestList(rpcGuestList || nextGuestList);

            const guestLabelMap = new Map<string, string>(
                nextGuestList.map((guest) => [guest.key, guest.label])
            );
            const bottomAppMap = new Map<string, BottomMenuAppStat & { userMap: Map<string, BottomMenuAppUserStat> }>();

            validData.forEach((event: any, index: number) => {
                const appId = normalizeBottomMenuAppId(event);
                if (!appId) return;

                const visitorKey = getVisitorKey(event, event.session_id || event.id || index);
                const isGuest = !visitorKey.startsWith('user:');
                const userId = isGuest ? null : visitorKey.slice(5);
                const existing = bottomAppMap.get(appId) || {
                    id: appId,
                    title: BOTTOM_MENU_APP_LABELS[appId] || event.target_title || appId,
                    count: 0,
                    uniqueVisitors: 0,
                    memberClicks: 0,
                    guestClicks: 0,
                    lastUsed: null,
                    users: [],
                    userMap: new Map<string, BottomMenuAppUserStat>(),
                };

                existing.count += 1;
                if (isGuest) existing.guestClicks += 1;
                else existing.memberClicks += 1;
                if (!existing.lastUsed || new Date(event.created_at).getTime() > new Date(existing.lastUsed).getTime()) {
                    existing.lastUsed = event.created_at;
                }

                const userStat = existing.userMap.get(visitorKey) || {
                    visitorKey,
                    label: isGuest
                        ? (guestLabelMap.get(visitorKey) || 'Guest')
                        : getAnalyticsUserDisplayName(userId, nicknameMap.get(userId!) || rpcNicknameMap.get(userId!) || null),
                    userId,
                    isGuest,
                    count: 0,
                    lastUsed: null,
                };

                userStat.count += 1;
                if (!userStat.lastUsed || new Date(event.created_at).getTime() > new Date(userStat.lastUsed).getTime()) {
                    userStat.lastUsed = event.created_at;
                }

                existing.userMap.set(visitorKey, userStat);
                existing.uniqueVisitors = existing.userMap.size;
                bottomAppMap.set(appId, existing);
            });

            const bottomMenuAppStats = Array.from(bottomAppMap.values())
                .map(({ userMap, ...app }) => ({
                    ...app,
                    users: Array.from(userMap.values())
                        .sort((a, b) => b.count - a.count || new Date(b.lastUsed || 0).getTime() - new Date(a.lastUsed || 0).getTime())
                        .slice(0, 12),
                }))
                .sort((a, b) => b.count - a.count || new Date(b.lastUsed || 0).getTime() - new Date(a.lastUsed || 0).getTime());

            let sessionStats = { total_sessions: 0, avg_duration: 0, bounce_rate: 0 };

            // [PHASE 21] Visitor Analysis Logic
            const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
            const weekdayCounts = new Array(7).fill(0);
            const hourlyCounts = new Array(24).fill(0);
            const monthlyCountsMap = new Map<string, number>();

            const visitorPatternRows = logicalSessions.length > 0
                ? logicalSessions.map((s: any) => ({ time: s.session_start }))
                : validData.map((d: any) => ({ time: d.created_at }));

            visitorPatternRows.forEach((row: any) => {
                const date = new Date(row.time);
                // Convert to KST for accurate weekday/hour
                const kstDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));

                weekdayCounts[kstDate.getDay()]++;
                hourlyCounts[kstDate.getHours()]++;

                const monthKey = `${kstDate.getFullYear()}.${String(kstDate.getMonth() + 1).padStart(2, '0')}`;
                monthlyCountsMap.set(monthKey, (monthlyCountsMap.get(monthKey) || 0) + 1);
            });

            const maxWeekday = Math.max(...weekdayCounts, 1);
            const maxHourly = Math.max(...hourlyCounts, 1);
            const monthlyCounts = Array.from(monthlyCountsMap.entries())
                .map(([month, count]) => ({ month, count }))
                .sort((a, b) => a.month.localeCompare(b.month)); // Oldest first
            const maxMonthly = Math.max(...monthlyCounts.map(m => m.count), 1);

            const visitor_stats = {
                weekday: weekdayCounts.map((count, idx) => ({
                    day: weekdays[idx],
                    count,
                    ratio: (count / maxWeekday) * 100
                })),
                hourly: hourlyCounts.map((count, idx) => ({
                    hour: idx,
                    label: `${idx}시`,
                    count,
                    ratio: (count / maxHourly) * 100
                })),
                monthly: monthlyCounts.map(m => ({
                    month: m.month,
                    count: m.count,
                    ratio: (m.count / maxMonthly) * 100
                }))
            };


            if (!sessionsError && sessions) {
                const completedSessions = logicalSessions.filter((s: any) => s.has_duration);
                const durations = completedSessions
                    .map((s: any) => Number(s.duration_seconds || 0))
                    .sort((a: number, b: number) => a - b);
                const totalDuration = durations.reduce((sum: number, duration: number) => sum + duration, 0);
                const medianDuration = durations.length > 0 ? durations[Math.floor((durations.length - 1) / 2)] : 0;
                const engagedSessions = logicalSessions.filter((s: any) =>
                    Number(s.duration_seconds || 0) > 10 ||
                    Number(s.total_clicks || 0) > 0 ||
                    Number(s.page_views || 0) >= 2
                );

                sessionStats = {
                    total_sessions: logicalSessions.length,
                    raw_sessions: sessionData.length,
                    avg_duration: durations.length > 0 ? Math.round(totalDuration / durations.length) : 0,
                    median_duration: medianDuration,
                    engagement_rate: logicalSessions.length > 0 ? (engagedSessions.length / logicalSessions.length) * 100 : 0,
                    bounce_rate: logicalSessions.length > 0 ? ((logicalSessions.length - engagedSessions.length) / logicalSessions.length) * 100 : 0,
                    duration_cap_seconds: SESSION_DURATION_CAP_SECONDS
                };
            }

            // PWA Stats
            let pwaStats: any = undefined;
            const { data: installData, error: installError } = await cafe24
                .from('pwa_installs')
                .select('*')
                .gte('installed_at', startStr)
                .lte('installed_at', endStr)
                .order('installed_at', { ascending: false });

            if (!installError && installData) {
                const filteredInstallData = installData.filter((inst: any) => {
                    const userId = resolveAnalyticsUserId(inst);
                    return (
                        !isAdminAnalyticsRow(inst) &&
                        (userId ? !userId.startsWith(excludedPrefix) : true)
                    );
                });
                const pwaSessions = logicalSessions.filter((s: any) => s.is_pwa === true);
                const browserSessions = logicalSessions.filter((s: any) => s.is_pwa === false);
                const pwaCompletedSessions = pwaSessions.filter((s: any) => s.has_duration);
                const avgPWADuration = pwaCompletedSessions.length > 0 ? Math.round(pwaCompletedSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0) / pwaCompletedSessions.length) : 0;
                const browserCompletedSessions = browserSessions.filter((s: any) => s.has_duration);
                const avgBrowserDuration = browserCompletedSessions.length > 0 ? Math.round(browserCompletedSessions.reduce((sum: number, s: any) => sum + (s.duration_seconds || 0), 0) / browserCompletedSessions.length) : 0;

                const recentPWASessions = pwaSessions
                    .sort((a, b) => new Date(b.session_start).getTime() - new Date(a.session_start).getTime())
                    .slice(0, 10)
                    .map((s: any) => {
                        const user = localUserList.find(u => u.user_id === s.user_id);
                        return {
                            session_start: s.session_start,
                            user_id: s.user_id,
                            nickname: user ? user.nickname : (s.user_id ? '회원' : 'Guest'),
                            display_mode: s.pwa_display_mode,
                            duration_seconds: s.duration_seconds
                        };
                    });

                // [FIX] 최근 설치 유저 닉네임 별도 조회 (Safe Fetch)
                const installUserIds = filteredInstallData
                    .slice(0, 50)
                    .map((i: any) => i.user_id)
                    .filter((id: any) => id && id.length > 20); // Check for valid UUID-like strings

                const installUserMap = new Map<string, string>();
                if (installUserIds.length > 0) {
                    try {
                        const uniqueIds = Array.from(new Set(installUserIds));
                        const { data: uData, error: uError } = await cafe24
                            .from('board_users')
                            .select('user_id, nickname')
                            .in('user_id', uniqueIds);

                        if (uError) {
                            console.warn('[Analytics] Failed to fetch nicknames:', uError);
                        } else if (uData) {
                            uData.forEach((u: any) => installUserMap.set(u.user_id, u.nickname));
                        }
                    } catch (err) {
                        console.error('[Analytics] Error resolving nicknames:', err);
                    }
                }

                // Deduplicate installs by user_id (Keep latest) and exclude guests
                const uniqueInstallMap = new Map();
                filteredInstallData.forEach((inst: any) => {
                    if (inst.user_id && !uniqueInstallMap.has(inst.user_id)) {
                        uniqueInstallMap.set(inst.user_id, inst);
                    }
                });
                const uniqueInstalls = Array.from(uniqueInstallMap.values());

                const recentInstalls = uniqueInstalls.slice(0, 10).map((inst: any) => {
                    const explicitNickname = installUserMap.get(inst.user_id);
                    const listUser = localUserList.find(u => u.user_id === inst.user_id);
                    // 1. Explicit fetch 2. Summary list 3. Default
                    const finalNickname = explicitNickname || (listUser ? listUser.nickname : null);

                    return {
                        ...inst,
                        nickname: finalNickname || (inst.user_id ? '회원' : 'Guest')
                    };
                });

                pwaStats = {
                    total_installs: uniqueInstalls.length,
                    pwa_sessions: pwaSessions.length,
                    browser_sessions: browserSessions.length,
                    pwa_percentage: logicalSessions.length > 0 ? (pwaSessions.length / logicalSessions.length) * 100 : 0,
                    avg_pwa_duration: avgPWADuration,
                    avg_browser_duration: avgBrowserDuration,
                    recent_installs: recentInstalls,
                    recent_pwa_sessions: recentPWASessions
                };
            }

            // Type Breakdown
            const typeBreakdownMap = new Map<string, number>();
            validData.forEach(d => {
                const type = d.target_type || 'unknown';
                typeBreakdownMap.set(type, (typeBreakdownMap.get(type) || 0) + 1);
            });
            const typeStats = Array.from(typeBreakdownMap.entries()).sort((a, b) => b[1] - a[1]).map(([type, count]) => ({ type, count }));

            // Referrer stats
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
                } catch { return '알 수 없음'; }
            };

            const referrerMap = new Map<string, number>();
            const referrerRows = logicalSessions.length > 0 ? logicalSessions : (() => {
                const firstActivityByVisitor = new Map<string, any>();
                validData.forEach(d => {
                    const key = getVisitorKey(d, d.session_id || d.id);
                    if (!firstActivityByVisitor.has(key)) firstActivityByVisitor.set(key, d);
                });
                return Array.from(firstActivityByVisitor.values());
            })();
            referrerRows.forEach((row: any) => {
                const category = getReferrerCategory(row.referrer || '');
                referrerMap.set(category, (referrerMap.get(category) || 0) + 1);
            });
            const referrerStats = Array.from(referrerMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([source, count]) => ({ source, count }));

            // Journey patterns
            const journeyMap = new Map<string, number>();
            const sessionGroups = new Map<string, any[]>();
            validData.forEach(d => {
                if (d.session_id) {
                    if (!sessionGroups.has(d.session_id)) sessionGroups.set(d.session_id, []);
                    sessionGroups.get(d.session_id)!.push(d);
                }
            });
            sessionGroups.forEach(logs => {
                const sorted = logs.sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0));
                const path = sorted.slice(0, 5).map(l => l.target_type);
                const pathKey = path.join(' → ');
                journeyMap.set(pathKey, (journeyMap.get(pathKey) || 0) + 1);
            });
            const journeyPatterns = Array.from(journeyMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([pathStr, count]) => ({ path: pathStr.split(' → '), count }));

            // Detailed Item 집계
            const itemsByTypeMap = new Map<string, Map<string, { title: string, count: number, url?: string }>>();
            const totalItemMap = new Map<string, { title: string, type: string, count: number }>();
            const totalSectionMap = new Map<string, number>();

            validData.forEach(d => {
                const key = d.target_type + ':' + d.target_id;
                const type = d.target_type || 'unknown';
                const friendlyTitle = getFriendlyTitle(d.target_type, d.target_id, d.target_title);
                const existing = totalItemMap.get(key) || { title: friendlyTitle, type: d.target_type, count: 0 };
                totalItemMap.set(key, { ...existing, count: existing.count + 1 });
                totalSectionMap.set(d.section, (totalSectionMap.get(d.section) || 0) + 1);
                if (!itemsByTypeMap.has(type)) itemsByTypeMap.set(type, new Map());
                const typeMap = itemsByTypeMap.get(type)!;
                const itemExisting = typeMap.get(friendlyTitle) || { title: friendlyTitle, count: 0, url: type === 'auto_link' ? d.target_id : undefined };
                typeMap.set(friendlyTitle, { ...itemExisting, count: itemExisting.count + 1 });
            });

            const itemsByTypeRecord: Record<string, { title: string; count: number }[]> = {};
            itemsByTypeMap.forEach((map, type) => { itemsByTypeRecord[type] = Array.from(map.values()).sort((a, b) => b.count - a.count); });
            const totalTopItems = Array.from(totalItemMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
            const totalSections = Array.from(totalSectionMap.entries()).map(([section, count]) => ({ section, count })).sort((a, b) => b.count - a.count);

            // Daily records
            // Click trend uses full activity logs; visitor trend below uses deduped visitor identities.
            const dailyGroups = new Map<string, any[]>();
            validData.forEach(d => {
                const kstDate = getKRDateString(new Date(d.created_at));
                const group = dailyGroups.get(kstDate) || [];
                group.push(d);
                dailyGroups.set(kstDate, group);
            });

            // [FIX] Generate full date range to ensure zero-filling for BOTH trends
            const trendDates: string[] = [];
            const rangeStartDate = startStr.slice(0, 10);
            const rangeEndDate = endStr.slice(0, 10);
            const dStart = new Date(`${rangeStartDate}T00:00:00+09:00`);
            const dEnd = new Date(`${rangeEndDate}T00:00:00+09:00`);
            // Safety: limit to 365 days
            let loops = 0;
            // Create a working date copy to avoid side effects if dStart is used elsewhere
            const curr = new Date(dStart);
            while (curr <= dEnd && loops < 366) {
                trendDates.push(getKRDateString(curr));
                curr.setDate(curr.getDate() + 1);
                loops++;
            }
            if (trendDates.length === 0 && dailyGroups.size > 0) {
                // Fallback if range generation failed but we have data
                trendDates.push(...Array.from(dailyGroups.keys()).sort());
            }

            const dailyDetails = trendDates.map(date => {
                const logs = dailyGroups.get(date) || [];
                let dUser = 0, dGuest = 0;
                const eventMap = new Map<string, { title: string, type: string, count: number }>();
                logs.forEach(l => {
                    const visitorKey = getVisitorKey(l, l.session_id || l.id);
                    if (visitorKey.startsWith('user:') && !asAnalyticsBool(l.is_admin)) dUser++;
                    else if (!visitorKey.startsWith('user:') && !asAnalyticsBool(l.is_admin)) dGuest++;
                    const key = l.target_type + ':' + l.target_id;
                    const existing = eventMap.get(key) || { title: l.target_title || l.target_id, type: l.target_type, count: 0 };
                    eventMap.set(key, { ...existing, count: existing.count + 1 });
                });
                return {
                    date,
                    displayDate: new Date(date).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }),
                    total: logs.length,
                    user: dUser,
                    guest: dGuest,
                    events: Array.from(eventMap.values()).sort((a, b) => b.count - a.count)
                };
            }).reverse(); // Descending for UI

            // [PHASE 23] Daily unique visitor trend from session starts plus activity fallback.
            const visitTrendMap = new Map<string, Set<string>>();

            sessionData.forEach((s: any) => {
                const kstDate = getKRDateString(new Date(s.session_start));
                if (!visitTrendMap.has(kstDate)) visitTrendMap.set(kstDate, new Set());
                visitTrendMap.get(kstDate)!.add(getVisitorKey(s, s.session_id));
            });

            const fallbackSessionMap = new Map<string, Set<string>>();
            validData.forEach(d => {
                const kstDate = getKRDateString(new Date(d.created_at));
                const visitorKey = getVisitorKey(d, d.session_id || d.id);

                if (!fallbackSessionMap.has(kstDate)) {
                    fallbackSessionMap.set(kstDate, new Set());
                }
                fallbackSessionMap.get(kstDate)!.add(visitorKey);
            });

            const dailyVisitTrend = trendDates.map(date => {
                const visitorKeys = new Set<string>(visitTrendMap.get(date) || []);
                const fallbackKeys = fallbackSessionMap.get(date);

                if (fallbackKeys) {
                    fallbackKeys.forEach(key => visitorKeys.add(key));
                }

                return { date, count: visitorKeys.size };
            }).sort((a, b) => b.date.localeCompare(a.date)); // Descending match

            const newSummary = {
                total_clicks: validData.length,
                user_clicks: displayLoggedInVisits,
                anon_clicks: displayAnonVisits,
                session_users: sessionLoggedInVisits,
                session_anon: sessionAnonVisits,
                admin_clicks: data.length - validData.length,
                visitor_summary: {
                    unique_total: displayLoggedInVisits + displayAnonVisits,
                    unique_logged_in: displayLoggedInVisits,
                    unique_guest: displayAnonVisits,
                    session_total: rpcVisitorSummary?.included_session_total ?? logicalSessions.length,
                    session_logged_in: sessionLoggedInVisits,
                    session_guest: sessionAnonVisits,
                    raw_session_total: rpcVisitorSummary?.raw_session_total ?? sessionData.length,
                    logical_session_total: logicalSessions.length,
                    raw_activity_total: rpcVisitorSummary?.raw_activity_total,
                    included_activity_total: rpcVisitorSummary?.included_activity_total,
                    included_session_total: rpcVisitorSummary?.included_session_total,
                    engaged_unique: engagedVisitorKeys.size,
                    guest_missing_identifier: guestMissingIdentifier,
                    stitched_guest_devices: stitchedGuestDevices
                },
                type_breakdown: typeStats,
                daily_details: dailyDetails,
                total_top_items: totalTopItems,
                total_sections: totalSections,
                referrer_stats: referrerStats,
                session_stats: sessionStats,
                journey_patterns: journeyPatterns,
                pwa_stats: pwaStats,
                items_by_type: itemsByTypeRecord,
                visitor_stats,
                daily_visit_trend: dailyVisitTrend,
                total_pv: validData.length, // [PHASE 24] 전체 로그 기반 PV
                bottom_menu_apps: bottomMenuAppStats
            };

            setSummary(newSummary as any);

            // Cache
            const cacheKey = `${viewMode}-${dateRange.start}-${dateRange.end}`;
            setCache(prev => new Map(prev.set(cacheKey, newSummary as any)));

            // Auto Snapshot
            if (dateRange.end === getKRDateString(new Date())) {
                checkAndAutoSnapshot({
                    user_clicks: displayLoggedInVisits,
                    anon_clicks: displayAnonVisits,
                    admin_clicks: 0 // Admin excluded from this logic
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

    const checkAndAutoSnapshot = async (currentStats: { user_clicks: number, anon_clicks: number, admin_clicks: number }) => {
        try {
            const today = getKRDateString(new Date());
            const startStr = today + 'T00:00:00+09:00';
            const endStr = today + 'T23:59:59+09:00';

            const { data, error } = await cafe24
                .from('site_usage_stats')
                .select('id')
                .gte('snapshot_time', startStr)
                .lte('snapshot_time', endStr)
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                await cafe24.rpc('create_usage_snapshot', {
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
                    {loading ? (
                        <div className="analytics-loading">데이터 분석 중...</div>
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
                                                    <div className="breakdown-item clickable" onClick={() => userList.length > 0 && setShowUserList(true)}>
                                                        <span className="label"><i className="ri-user-smile-line"></i> 로그인</span>
                                                        <span className="value highlight-blue">{summary.user_clicks || 0}</span>
                                                    </div>
                                                    <div className="breakdown-separator"></div>
                                                    <div className="breakdown-item clickable" onClick={() => guestList.length > 0 && setShowGuestList(true)}>
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
                                        * 관리자(Admin) 및 테스트용 계정은 제외됩니다. 고유 방문자는 회원 ID와 기기 fingerprint를 합쳐 중복 제거하며, 기간 내 로그인으로 식별된 같은 기기는 회원 방문자로 합산됩니다. 세션은 같은 방문자의 30분 이내 조각을 병합하고 체류시간은 30분 상한으로 보정합니다.
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
                                                    <div className="breakdown-item clickable" onClick={() => userList.length > 0 && setShowUserList(true)}>
                                                        <span className="label"><i className="ri-user-smile-line"></i> 로그인</span>
                                                        <span className="value highlight-blue">{summary.user_clicks || 0}</span>
                                                    </div>
                                                    <div className="breakdown-separator"></div>
                                                    <div className="breakdown-item clickable" onClick={() => guestList.length > 0 && setShowGuestList(true)}>
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
                                        로그인 사용자 목록 ({userList.length}명)
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
                                        Guest 목록 ({guestList.length}명)
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
