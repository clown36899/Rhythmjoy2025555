import type { AnalyticsSummary, BottomMenuAppStat, BottomMenuAppUserStat, UserInfo, GuestInfo, UserActivityInfo, UserSessionInfo } from '../../src/utils/analyticsReportTypes';
import { isAnalyticsBotUserAgent, isAnalyticsInternalRouteRow, isAnalyticsDatacenterRow } from './analytics-purity.js';
import type { AnalyticsSources } from './analytics-reports';
const isLikelyBotTraffic = (ua: string, _legacyFlag = false) => isAnalyticsBotUserAgent(ua);
const isInternalAnalyticsRoute = (path: string) => isAnalyticsInternalRouteRow({ page_url: path });
const isAnalyticsDatacenterIp = (ip: string) => isAnalyticsDatacenterRow({ client_ip: ip });
const getKRDateString = (date: Date) => new Date(date.getTime() + 9 * 3600000).toISOString().slice(0, 10);
const getAnalyticsUserDisplayName = (userId: string | null | undefined, nickname?: string | null) =>
    nickname || (userId ? `회원 ${userId.substring(0, 8)}` : '회원');
const asAnalyticsBool = (value: unknown) => (
    value === true ||
    value === 1 ||
    String(value || '').toLowerCase() === 'true' ||
    String(value || '').toLowerCase() === '1'
);
const normalizeAnalyticsEmail = (value: unknown) => String(value || '').trim().toLowerCase();

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
    'home_menu_groove-lab': '홈 메뉴 · 개발중 그루브 랩',
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


// Presentation aggregation moved intact from SiteAnalyticsModal; no browser I/O.
export function buildAnalyticsReport(startStr: string, endStr: string, sources: AnalyticsSources, rpcData: any) {
    let localUserList: UserInfo[] = [];
    const rpcError = null;
    let clickBasedLoggedIn = 0;
    let clickBasedAnon = 0;
    let rpcVisitorSummary: any = null;
    let rpcSessionSummary: any = null;
    let rpcGuestList: GuestInfo[] | null = null;

    if (!rpcData && !rpcError) throw new Error('통계 응답이 없습니다.');
    if (rpcError) {
        throw rpcError;
    } else if (rpcData) {
        const stats = rpcData as any;
        rpcVisitorSummary = stats.visitor_summary || null;
        rpcSessionSummary = stats.session_summary || null;
        clickBasedLoggedIn = rpcVisitorSummary?.unique_logged_in ?? stats.logged_in_visits ?? 0;
        clickBasedAnon = rpcVisitorSummary?.unique_guest ?? stats.anonymous_visits ?? 0;

        localUserList = (stats.user_list || []).map((u: any) => ({
            user_id: u.user_id,
            nickname: u.nickname,
            visitCount: u.visitCount,
            visitLogs: u.visitLogs || [],
            avgDuration: u.avgDuration || 0
        })).filter((u: any) => !u.user_id.startsWith('91b04b25')); // [FIX] Exclude test account from list


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
    const adminRows = sources.boardAdmins;
    const adminRowsError = null;

    if (adminRowsError) {
        throw adminRowsError;
    } else {
        (adminRows || []).forEach((row: any) => {
            if (row.user_id) adminUserIds.add(String(row.user_id));
            const email = normalizeAnalyticsEmail(row.email || row.admin_email);
            if (email) adminEmails.add(email);
        });
    }

    const analyticsUsers = sources.analyticsUsers, boardUsersForAdmin = sources.boardUsers;
    const analyticsUsersError = null, boardUsersForAdminError = null;

    if (analyticsUsersError) {
        throw analyticsUsersError;
    } else {
        (analyticsUsers || []).forEach((row: any) => {
            const email = normalizeAnalyticsEmail(row.email);
            if (asAnalyticsBool(row.is_admin) || (email && adminEmails.has(email))) {
                if (row.id) adminUserIds.add(String(row.id));
            }
        });
    }

    if (boardUsersForAdminError) {
        throw boardUsersForAdminError;
    } else {
        (boardUsersForAdmin || []).forEach((row: any) => {
            const email = normalizeAnalyticsEmail(row.email || row.admin_email);
            if (asAnalyticsBool(row.is_admin) || (email && adminEmails.has(email))) {
                if (row.user_id) adminUserIds.add(String(row.user_id));
            }
        });
    }

    const data = sources.logs;
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
    const isDatacenterAnalyticsRow = (row: any) => isAnalyticsDatacenterIp(getFilterClientIp(row));

    const botSessionIds = new Set<string>();
    const botFingerprints = new Set<string>();
    data.forEach(d => {
        if (!isBotAnalyticsRow(d)) return;
        if (d.session_id) botSessionIds.add(String(d.session_id));
        if (d.fingerprint) botFingerprints.add(String(d.fingerprint));
    });

    // RPC counts are now accurate (DB migration applied), so no need to overwrite.
    // clickBasedLoggedIn and clickBasedAnon are already set from rpcData.

    const allSessions = sources.sessions;
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
    const getGuestBridgeNetworkIdentity = (row: any) => {
        const network = getClientIp(row) || row.ip_hash || null;
        if (!network) return null;
        return `${String(network)}:${getGuestDeviceIdentity(row)}`;
    };
    const getGuestBridgeDateKey = (row: any) => {
        const value = row.session_start || row.created_at || row.timestamp || row.date;
        if (!value) return null;
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return null;
        return getKRDateString(date);
    };
    [...sessionData, ...validData].forEach((row: any) => {
        if (row.session_id && row.user_id) {
            addIdentity(sessionIdToUser, row.session_id, String(row.user_id));
        }
        if (row.fingerprint && row.user_id) {
            addIdentity(fingerprintToUser, row.fingerprint, String(row.user_id));
        }
    });

    const resolveVisitorUserId = (row: any) => {
        const fingerprint = row.fingerprint ? String(row.fingerprint) : '';
        const sessionId = row.session_id ? String(row.session_id) : '';
        if (row.user_id) return String(row.user_id);
        const sessionUserId = getSingleIdentity(sessionIdToUser, sessionId);
        if (sessionUserId) return sessionUserId;
        const fingerprintUserId = getSingleIdentity(fingerprintToUser, fingerprint);
        if (fingerprintUserId) return fingerprintUserId;
        return null;
    };

    const guestNetworkBridge = (() => {
        const networkStats = new Map<string, {
            networkId: string;
            dateKey: string;
            fingerprints: Set<string>;
            hasMissingFingerprint: boolean;
        }>();
        const getBucketKey = (networkId: string, dateKey: string) => `${networkId}::${dateKey}`;

        [...sessionData, ...validData].forEach((row: any) => {
            if (resolveVisitorUserId(row)) return;
            const networkId = getGuestBridgeNetworkIdentity(row);
            const dateKey = getGuestBridgeDateKey(row);
            if (!networkId || !dateKey) return;

            const bucketKey = getBucketKey(networkId, dateKey);
            const current = networkStats.get(bucketKey) || {
                networkId,
                dateKey,
                fingerprints: new Set<string>(),
                hasMissingFingerprint: false,
            };

            if (row.fingerprint) current.fingerprints.add(String(row.fingerprint));
            else current.hasMissingFingerprint = true;
            networkStats.set(bucketKey, current);
        });

        const buckets = new Map<string, { networkId: string; dateKey: string }>();

        networkStats.forEach((stat, bucketKey) => {
            const hasSplitIdentity = stat.fingerprints.size >= 2 || (stat.fingerprints.size >= 1 && stat.hasMissingFingerprint);
            if (!hasSplitIdentity) return;

            buckets.set(bucketKey, {
                networkId: stat.networkId,
                dateKey: stat.dateKey,
            });
        });

        return { buckets, getBucketKey };
    })();

    const getVisitorKey = (row: any, fallbackId?: string | number | null) => {
        const userId = resolveVisitorUserId(row);
        if (userId) return `user:${userId}`;
        const guestNetworkIdentity = getGuestNetworkIdentity(row);
        const guestBridgeNetworkIdentity = getGuestBridgeNetworkIdentity(row);
        const guestBridgeDateKey = getGuestBridgeDateKey(row);
        if (guestBridgeNetworkIdentity && guestBridgeDateKey) {
            const bridgeBucketKey = guestNetworkBridge.getBucketKey(guestBridgeNetworkIdentity, guestBridgeDateKey);
            if (guestNetworkBridge.buckets.has(bridgeBucketKey)) {
                return `guest:${guestBridgeNetworkIdentity}:${guestBridgeDateKey}`;
            }
        }
        const fingerprint = row.fingerprint ? String(row.fingerprint) : '';
        if (fingerprint) return `guest:${fingerprint}`;
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
    const stitchedGuestDevices = Array.from(fingerprintTypeMap.values()).filter(v => v.user && v.guest).length + guestNetworkBridge.buckets.size;

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
        const sessionUsers = sources.boardUsers.filter((row: any) => sessionUserIds.includes(row.user_id));
        const sessionUsersError = null;

        if (sessionUsersError) {
            throw sessionUsersError;
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

    const completeGuestList = rpcGuestList || nextGuestList;

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

    let sessionStats: NonNullable<AnalyticsSummary['session_stats']> = { total_sessions: 0, avg_duration: 0, bounce_rate: 0 };

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

    // Headline session quality is authoritative from the same server-side
    // purity filter and identity bridge used by the unique visitor count.
    if (rpcSessionSummary) {
        sessionStats = {
            total_sessions: Number(rpcSessionSummary.total_sessions || 0),
            raw_sessions: Number(rpcSessionSummary.raw_sessions || 0),
            avg_duration: Number(rpcSessionSummary.avg_duration || 0),
            median_duration: Number(rpcSessionSummary.median_duration || 0),
            engagement_rate: Number(rpcSessionSummary.engagement_rate || 0),
            bounce_rate: Number(rpcSessionSummary.bounce_rate || 0),
            duration_cap_seconds: Number(rpcSessionSummary.duration_cap_seconds || SESSION_DURATION_CAP_SECONDS),
        };
    }

    // PWA Stats
    let pwaStats: any = undefined;
    const installData = sources.pwaInstalls;
    const installError = null;

    if (installError) throw installError;
    if (installData) {
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
            const uniqueIds = Array.from(new Set(installUserIds));
            const uData = sources.boardUsers.filter((row: any) => uniqueIds.includes(row.user_id));
            const uError = null;

            if (uError) {
                throw uError;
            } else if (uData) {
                uData.forEach((u: any) => installUserMap.set(u.user_id, u.nickname));
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
            pwa_sessions: Number(rpcSessionSummary?.pwa_sessions ?? pwaSessions.length),
            browser_sessions: Number(rpcSessionSummary?.browser_sessions ?? browserSessions.length),
            pwa_percentage: Number(rpcSessionSummary?.pwa_percentage ?? (logicalSessions.length > 0 ? (pwaSessions.length / logicalSessions.length) * 100 : 0)),
            avg_pwa_duration: Number(rpcSessionSummary?.avg_pwa_duration ?? avgPWADuration),
            avg_browser_duration: Number(rpcSessionSummary?.avg_browser_duration ?? avgBrowserDuration),
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
    const getReferrerCategory = (ref: string, utmSource?: string | null): string => {
        const normalizedSource = String(utmSource || '').trim().toLowerCase();
        if (normalizedSource) {
            if (normalizedSource.includes('kakao')) return 'Kakao';
            if (normalizedSource.includes('instagram')) return 'Instagram';
            if (normalizedSource.includes('facebook')) return 'Facebook';
            if (normalizedSource.includes('naver')) return 'Naver';
            if (normalizedSource.includes('google')) return 'Google';
            if (normalizedSource === 'pwa') return 'PWA';
            return `UTM · ${normalizedSource}`;
        }
        if (!ref) return '직접 입력';
        try {
            const url = new URL(ref);
            const hostname = url.hostname;
            if (['swingenjoy.com', 'www.swingenjoy.com'].includes(hostname)) return '내부 이동';
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
        const category = getReferrerCategory(row.referrer || '', row.utm_source);
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
        total_clicks: Number(rpcVisitorSummary?.included_activity_total ?? validData.length),
        user_clicks: displayLoggedInVisits,
        anon_clicks: displayAnonVisits,
        session_users: sessionLoggedInVisits,
        session_anon: sessionAnonVisits,
        admin_clicks: Math.max(
            0,
            Number(rpcVisitorSummary?.raw_activity_total ?? data.length)
                - Number(rpcVisitorSummary?.included_activity_total ?? validData.length),
        ),
        visitor_summary: {
            unique_total: displayLoggedInVisits + displayAnonVisits,
            unique_logged_in: displayLoggedInVisits,
            unique_guest: displayAnonVisits,
            session_total: Number(rpcSessionSummary?.total_sessions ?? logicalSessions.length),
            session_logged_in: sessionLoggedInVisits,
            session_guest: sessionAnonVisits,
            raw_session_total: rpcVisitorSummary?.raw_session_total ?? sessionData.length,
            logical_session_total: Number(rpcSessionSummary?.total_sessions ?? logicalSessions.length),
            raw_activity_total: rpcVisitorSummary?.raw_activity_total,
            included_activity_total: rpcVisitorSummary?.included_activity_total,
            included_session_total: rpcVisitorSummary?.included_session_total,
            engaged_unique: engagedVisitorKeys.size,
            guest_missing_identifier: guestMissingIdentifier,
            stitched_guest_devices: Number(rpcVisitorSummary?.stitched_guest_devices ?? stitchedGuestDevices)
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
        total_pv: Number(rpcVisitorSummary?.included_activity_total ?? validData.length),
        bottom_menu_apps: bottomMenuAppStats
    };

    return { summary: newSummary, users: localUserList, guests: completeGuestList };
}
