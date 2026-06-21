export type LinkType = 'site' | 'person_account';

export type AccountPlatform = 'instagram' | 'youtube' | 'other';

export interface ParsedLinkTarget {
    normalizedUrl: string;
    linkType: LinkType;
    accountPlatform: AccountPlatform;
    accountHandle: string;
}

const INSTAGRAM_RESERVED_PATHS = new Set([
    'about',
    'accounts',
    'api',
    'developer',
    'direct',
    'explore',
    'p',
    'privacy',
    'reel',
    'reels',
    'stories',
    'tv',
]);

const YOUTUBE_ACCOUNT_PATHS = new Set(['channel', 'c', 'user']);

export function normalizeLinkUrl(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return '';
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

function cleanPathPart(value?: string | null) {
    return String(value || '')
        .trim()
        .replace(/^@+/, '')
        .replace(/[?#].*$/, '')
        .replace(/\/+$/, '');
}

function normalizeHost(hostname: string) {
    return hostname.replace(/^www\./i, '').replace(/^m\./i, '').toLowerCase();
}

export function parseLinkTarget(input: string): ParsedLinkTarget | null {
    try {
        const normalized = normalizeLinkUrl(input);
        if (!normalized) return null;

        const url = new URL(normalized);
        const host = normalizeHost(url.hostname);
        const parts = url.pathname.split('/').filter(Boolean);

        if (host === 'instagram.com') {
            const handle = cleanPathPart(parts[0]);
            if (handle && !INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase())) {
                return {
                    normalizedUrl: `https://www.instagram.com/${handle}/`,
                    linkType: 'person_account',
                    accountPlatform: 'instagram',
                    accountHandle: handle,
                };
            }
        }

        if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            const first = parts[0] || '';
            if (first.startsWith('@')) {
                const handle = cleanPathPart(first);
                if (handle) {
                    return {
                        normalizedUrl: `https://www.youtube.com/@${handle}`,
                        linkType: 'person_account',
                        accountPlatform: 'youtube',
                        accountHandle: handle,
                    };
                }
            }

            if (YOUTUBE_ACCOUNT_PATHS.has(first) && parts[1]) {
                const handle = cleanPathPart(parts[1]);
                return {
                    normalizedUrl: `https://www.youtube.com/${first}/${handle}`,
                    linkType: 'person_account',
                    accountPlatform: 'youtube',
                    accountHandle: first === 'channel' ? handle : handle,
                };
            }
        }

        return {
            normalizedUrl: url.toString(),
            linkType: 'site',
            accountPlatform: 'other',
            accountHandle: '',
        };
    } catch {
        return null;
    }
}

export function getLinkTypeLabel(type?: string | null) {
    return type === 'person_account' ? '인물 계정' : '사이트';
}

export function getPlatformLabel(platform?: string | null) {
    if (platform === 'instagram') return 'Instagram';
    if (platform === 'youtube') return 'YouTube';
    return 'Web';
}

export function getPlatformIcon(platform?: string | null) {
    if (platform === 'instagram') return 'ri-instagram-line';
    if (platform === 'youtube') return 'ri-youtube-line';
    return 'ri-global-line';
}

export function getFallbackTitle(target: ParsedLinkTarget | null) {
    if (!target) return '';
    if (target.linkType === 'person_account' && target.accountHandle) {
        return target.accountPlatform === 'youtube' ? `@${target.accountHandle}` : target.accountHandle;
    }
    return '';
}

export function getDisplayDomain(value: string) {
    try {
        return new URL(value).hostname.replace(/^www\./, '');
    } catch {
        return value;
    }
}
