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

export function isWeakAccountDescription(value?: string | null, target?: ParsedLinkTarget | null) {
    const description = String(value || '').replace(/\s+/g, ' ').trim();
    if (!description) return true;

    const lower = description.toLowerCase();
    if (target?.accountPlatform === 'instagram') {
        return (
            /팔로워\s*[\d,.a-z가-힣]+\s*명?,?\s*팔로잉\s*[\d,.a-z가-힣]+\s*명?,?\s*게시물\s*[\d,.a-z가-힣]+\s*개/i.test(description) ||
            /님의\s+instagram\s+사진\s+및\s+동영상\s+보기/i.test(description) ||
            /see\s+instagram\s+photos\s+and\s+videos\s+from/i.test(lower) ||
            /followers?.*following.*posts?.*instagram/i.test(lower) ||
            lower.includes('see everyday moments from your close friends')
        );
    }

    if (target?.accountPlatform === 'youtube') {
        return (
            /^youtube$/i.test(description) ||
            /친구,\s*가족을\s*비롯해\s*전\s*세계\s*사람들과\s*동영상\s*공유/i.test(description) ||
            /youtube에서\s+마음에\s+드는\s+동영상과\s+음악을\s+감상하고/i.test(description) ||
            /share\s+your\s+videos\s+with\s+friends,\s*family,\s*and\s+the\s+world/i.test(lower) ||
            /enjoy\s+the\s+videos\s+and\s+music\s+you\s+love/i.test(lower) ||
            /구독자\s*[\d,.천만억kmb]+\s*명/i.test(description) ||
            /동영상\s*[\d,.천만억kmb]+\s*개/i.test(description) ||
            lower.includes('subscribers') ||
            lower.includes(' videos')
        );
    }

    return false;
}

export function getDisplayDomain(value: string) {
    try {
        return new URL(value).hostname.replace(/^www\./, '');
    } catch {
        return value;
    }
}
