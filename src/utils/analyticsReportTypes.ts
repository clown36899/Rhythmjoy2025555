export interface BottomMenuAppUserStat {
    visitorKey: string;
    label: string;
    userId?: string | null;
    isGuest: boolean;
    count: number;
    lastUsed: string | null;
}

export interface BottomMenuAppStat {
    id: string;
    title: string;
    count: number;
    uniqueVisitors: number;
    memberClicks: number;
    guestClicks: number;
    lastUsed: string | null;
    users: BottomMenuAppUserStat[];
}

export interface AnalyticsSummary {
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

export interface UserInfo {
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

export interface UserActivityInfo {
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

export interface UserSessionInfo {
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

export interface GuestInfo {
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

