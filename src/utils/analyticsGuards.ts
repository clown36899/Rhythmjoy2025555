export const ANALYTICS_ADMIN_SHIELD_KEY = 'ga-admin-shield';
export const ANALYTICS_ADMIN_DEVICE_KEY = 'ga-admin-device-shield';

export const ANALYTICS_BOT_UA_PATTERN = /bot|crawler|spider|preview|facebookexternalhit|twitterbot|slackbot|discordbot|kakaotalk-scrap|naverbot|googlebot|bingbot|yeti|daumoa|lighthouse|headless|phantom|puppeteer|playwright|selenium|webdriver|curl|wget|python-requests|gptbot|chatgpt|oai-searchbot|openai|claude|anthropic|perplexity|bytespider|ccbot|googleother|google-extended|cohere|mistralai|amazonbot|applebot-extended/i;
export const ANALYTICS_KIOSK_ROUTE_PATTERN = /^\/(?:kiosk|키오스크)(?:\/|$)/i;
export const ANALYTICS_INTERNAL_ROUTE_PATTERN = /^\/(?:admin|test|main-v2-test|debug|__|api|kiosk|키오스크)(?:\/|$)/i;
const KIOSK_MODE_STORAGE_KEY = 'rhythmjoy:kiosk-mode';
const KIOSK_MODE_VALUE = 'mini-pc';

export const isLikelyBotTraffic = (
    userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
    includeRuntimeSignals = true
): boolean => {
    if (!userAgent || ANALYTICS_BOT_UA_PATTERN.test(userAgent)) return true;
    if (!includeRuntimeSignals || typeof window === 'undefined') return false;
    if (navigator.webdriver) return true;
    if (document.visibilityState === 'prerender') return true;
    if (!navigator.languages || navigator.languages.length === 0) return true;
    if (window.outerWidth === 0 || window.outerHeight === 0) return true;

    const win = window as typeof window & {
        _phantom?: unknown;
        callPhantom?: unknown;
        Buffer?: unknown;
        emit?: unknown;
    };
    return Boolean(win._phantom || win.callPhantom || win.Buffer || win.emit);
};

export const isInternalAnalyticsRoute = (
    path = typeof window !== 'undefined' ? window.location.pathname : ''
): boolean => ANALYTICS_INTERNAL_ROUTE_PATTERN.test(path);

const hasKioskStorageFlag = (): boolean => {
    if (typeof window === 'undefined') return false;

    try {
        return (
            window.localStorage.getItem(KIOSK_MODE_STORAGE_KEY) === KIOSK_MODE_VALUE ||
            window.sessionStorage.getItem(KIOSK_MODE_STORAGE_KEY) === KIOSK_MODE_VALUE
        );
    } catch {
        return false;
    }
};

const hasKioskQueryFlag = (search = typeof window !== 'undefined' ? window.location.search : ''): boolean => {
    if (!search) return false;

    try {
        const params = new URLSearchParams(search);
        const value = params.get('kiosk') || params.get('kioskMode');
        return ['1', 'true', 'on', KIOSK_MODE_VALUE].includes(String(value || '').toLowerCase());
    } catch {
        return false;
    }
};

export const isKioskAnalyticsContext = (
    path = typeof window !== 'undefined' ? window.location.pathname : '',
    search = typeof window !== 'undefined' ? window.location.search : ''
): boolean => (
    ANALYTICS_KIOSK_ROUTE_PATTERN.test(path) ||
    hasKioskQueryFlag(search) ||
    hasKioskStorageFlag()
);

export const isLocalAnalyticsHost = (
    hostname = typeof window !== 'undefined' ? window.location.hostname : ''
): boolean => (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.local') ||
    hostname.includes('localhost') ||
    /^(192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|10\.)/.test(hostname)
);

export const isAdminAnalyticsShielded = (): boolean => {
    if (typeof window === 'undefined') return false;
    return (
        localStorage.getItem(ANALYTICS_ADMIN_SHIELD_KEY) === 'true' ||
        localStorage.getItem(ANALYTICS_ADMIN_DEVICE_KEY) === 'true'
    );
};
