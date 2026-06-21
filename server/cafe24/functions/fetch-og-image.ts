import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

type Handler = (event: {
    httpMethod: string;
    queryStringParameters?: Record<string, string | undefined> | null;
    body?: string | null;
}) => Promise<{
    statusCode: number;
    headers?: Record<string, string>;
    body: string;
}>;

type ThumbnailOption = {
    url: string;
    label: string;
    source: string;
};

const MAX_PAGE_IMAGE_CANDIDATES = 8;
const MAX_THUMBNAIL_CANDIDATES = 14;
const MAX_CACHED_ACCOUNT_IMAGE_BYTES = 8 * 1024 * 1024;
const sourcePriority: Record<string, number> = {
    'direct-image': 0,
    'account-avatar': 1,
    'og-image': 2,
    'meta-image': 3,
    'json-ld': 4,
    'image-src': 5,
    'preload-image': 6,
    'page-image': 7,
    'screenshot': 8,
    'apple-touch-icon': 9,
    'favicon': 10,
    'favicon-fallback': 11
};

function decodeHtml(value: string): string {
    return String(value || '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)))
        .trim();
}

function parseBody(body?: string | null): Record<string, unknown> {
    if (!body) return {};
    try {
        const parsed = JSON.parse(body);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
        return {};
    }
}

function getTargetUrl(event: Parameters<Handler>[0]): string {
    const body = parseBody(event.body);
    return String(event.queryStringParameters?.url || body.url || '').trim();
}

function extractAttrs(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrPattern = /([^\s"'=<>`]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let match: RegExpExecArray | null;

    while ((match = attrPattern.exec(tag))) {
        attrs[match[1].toLowerCase()] = decodeHtml(match[2] || match[3] || match[4] || '');
    }

    return attrs;
}

function tagAttrs(html: string, tagName: string): Record<string, string>[] {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    return Array.from(html.matchAll(pattern)).map((match) => extractAttrs(match[0]));
}

function firstMetaContent(metaTags: Record<string, string>[], keys: string[]): string {
    const keySet = new Set(keys.map((key) => key.toLowerCase()));
    const match = metaTags.find((attrs) => {
        const name = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
        return keySet.has(name);
    });
    return match?.content || '';
}

function cleanLongText(value: string): string {
    return String(value || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
        .trim();
}

function firstSrcFromSrcset(value: string): string {
    const first = String(value || '').split(',')[0] || '';
    return first.trim().split(/\s+/)[0] || '';
}

function resolveCandidateUrl(rawUrl: string, pageUrl: URL): string {
    const value = decodeHtml(String(rawUrl || '').replace(/^url\((.*)\)$/i, '$1').replace(/^["']|["']$/g, ''));
    if (!value || /^(?:data|blob|javascript|mailto|tel):/i.test(value)) return '';
    if (value.startsWith('/uploads/')) return value;
    try {
        return new URL(value, pageUrl).toString();
    } catch (_error) {
        return '';
    }
}

function screenshotUrl(targetUrl: string): string {
    const cleanTarget = String(targetUrl || '').replace(/#.*$/, '');
    return `https://image.thum.io/get/width/900/crop/500/noanimate/${cleanTarget}`;
}

function uploadRoot(): string {
    return path.resolve(process.cwd(), process.env.CAFE24_UPLOADS_DIR || 'uploads');
}

function publicUploadUrl(...parts: string[]): string {
    return `/uploads/${parts.map((part) => String(part || '').replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;
}

function extensionFromContentType(contentType: string): string {
    const value = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (value === 'image/jpeg' || value === 'image/jpg') return 'jpg';
    if (value === 'image/png') return 'png';
    if (value === 'image/webp') return 'webp';
    if (value === 'image/gif') return 'gif';
    return '';
}

function safeFileSegment(value: string): string {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80) || 'account';
}

async function cacheRemoteAccountImage(rawUrl: string, pageUrl: URL, sourceKey: string): Promise<string> {
    const imageUrl = resolveCandidateUrl(rawUrl, pageUrl);
    if (!imageUrl) return '';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
        const response = await fetch(imageUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': pageUrl.toString()
            }
        });
        if (!response.ok) return '';

        const contentType = response.headers.get('content-type') || '';
        const ext = extensionFromContentType(contentType);
        if (!ext) return '';

        const arrayBuffer = await response.arrayBuffer();
        if (!arrayBuffer.byteLength || arrayBuffer.byteLength > MAX_CACHED_ACCOUNT_IMAGE_BYTES) return '';

        const buffer = Buffer.from(arrayBuffer);
        const contentHash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
        const fileName = `${safeFileSegment(sourceKey)}-${contentHash}.${ext}`;
        const uploadDir = path.join(uploadRoot(), 'images', 'account-profiles');
        const filePath = path.join(uploadDir, fileName);

        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(filePath, buffer);

        return publicUploadUrl('images', 'account-profiles', fileName);
    } catch (_error) {
        return '';
    } finally {
        clearTimeout(timer);
    }
}

function isYouTubeUrl(url: URL): boolean {
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    return host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be';
}

function isYouTubeAccountUrl(url: URL): boolean {
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    const first = parts[0] || '';
    return host === 'youtube.com' && (
        first.startsWith('@') ||
        (['channel', 'c', 'user'].includes(first) && Boolean(parts[1]))
    );
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
    'tv'
]);

function isInstagramUrl(url: URL): boolean {
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    return host === 'instagram.com';
}

function getInstagramAccountHandle(url: URL): string {
    if (!isInstagramUrl(url)) return '';
    const handle = (url.pathname.split('/').filter(Boolean)[0] || '').replace(/^@+/, '').trim();
    if (!handle || INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase())) return '';
    return /^[A-Za-z0-9._]+$/.test(handle) ? handle : '';
}

function isInstagramAccountUrl(url: URL): boolean {
    return Boolean(getInstagramAccountHandle(url));
}

function isGenericYouTubeImageUrl(url: string): boolean {
    const value = String(url || '').toLowerCase();
    return (
        value.includes('youtube-logo') ||
        value.includes('youtube.com/img/desktop') ||
        value.includes('/youtube/img/') ||
        value.includes('/yt/about/') ||
        value.includes('yt_1200') ||
        value.includes('youtube_social') ||
        value.includes('yt_logo')
    );
}

function textFromRuns(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return '';
    const record = value as Record<string, unknown>;
    if (typeof record.simpleText === 'string') return record.simpleText;
    if (Array.isArray(record.runs)) {
        return record.runs
            .map((run) => (run && typeof run === 'object' && typeof (run as Record<string, unknown>).text === 'string'
                ? (run as Record<string, string>).text
                : ''))
            .join('');
    }
    return '';
}

function extractBalancedJson(text: string, startIndex: number): string {
    const openIndex = text.indexOf('{', startIndex);
    if (openIndex < 0) return '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = openIndex; index < text.length; index += 1) {
        const char = text[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;
        if (depth === 0) return text.slice(openIndex, index + 1);
    }
    return '';
}

function extractYouTubeDescriptionFromHtml(html: string): string {
    const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1] || '');
    for (const script of scripts) {
        const markerIndex = script.indexOf('ytInitialPlayerResponse');
        if (markerIndex < 0) continue;
        const rawJson = extractBalancedJson(script, markerIndex);
        if (!rawJson) continue;
        try {
            const response = JSON.parse(rawJson) as Record<string, unknown>;
            const videoDetails = response.videoDetails as Record<string, unknown> | undefined;
            const microformat = response.microformat as Record<string, unknown> | undefined;
            const playerMicroformat = microformat?.playerMicroformatRenderer as Record<string, unknown> | undefined;
            const candidates = [
                typeof videoDetails?.shortDescription === 'string' ? videoDetails.shortDescription : '',
                textFromRuns(playerMicroformat?.description),
            ];
            const description = candidates.map(cleanLongText).find((text) => text.length >= 8);
            if (description) return description;
        } catch (_error) {
            // Continue; YouTube can emit multiple script payloads.
        }
    }
    const shortDescription = html.match(/"shortDescription"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (shortDescription?.[1]) {
        try {
            return cleanLongText(JSON.parse(`"${shortDescription[1]}"`));
        } catch (_error) {
            return cleanLongText(decodeHtml(shortDescription[1]));
        }
    }
    return '';
}

function extractYouTubeTitleFromHtml(html: string): string {
    const scripts = Array.from(html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).map((match) => match[1] || '');
    for (const script of scripts) {
        const markerIndex = script.indexOf('ytInitialPlayerResponse');
        if (markerIndex < 0) continue;
        const rawJson = extractBalancedJson(script, markerIndex);
        if (!rawJson) continue;
        try {
            const response = JSON.parse(rawJson) as Record<string, unknown>;
            const videoDetails = response.videoDetails as Record<string, unknown> | undefined;
            const microformat = response.microformat as Record<string, unknown> | undefined;
            const playerMicroformat = microformat?.playerMicroformatRenderer as Record<string, unknown> | undefined;
            const candidates = [
                typeof videoDetails?.title === 'string' ? videoDetails.title : '',
                textFromRuns(playerMicroformat?.title),
            ];
            const title = candidates.map((value) => decodeHtml(value).trim()).find((value) => value.length >= 2);
            if (title) return title;
        } catch (_error) {
            // Continue; YouTube can emit multiple script payloads.
        }
    }
    return '';
}

function extractYouTubeAccountMetadataFromHtml(html: string): { title: string; description: string } {
    const markerIndex = html.indexOf('"channelMetadataRenderer"');
    if (markerIndex < 0) return { title: '', description: '' };

    const rawJson = extractBalancedJson(html, markerIndex);
    if (!rawJson) return { title: '', description: '' };

    try {
        const metadata = JSON.parse(rawJson) as Record<string, unknown>;
        return {
            title: decodeHtml(typeof metadata.title === 'string' ? metadata.title : '').trim(),
            description: cleanLongText(decodeHtml(typeof metadata.description === 'string' ? metadata.description : ''))
        };
    } catch (_error) {
        return { title: '', description: '' };
    }
}

function decodeJsonStringFragment(value: string): string {
    try {
        return JSON.parse(`"${value.replace(/"/g, '\\"')}"`);
    } catch (_error) {
        return decodeHtml(value)
            .replace(/\\\//g, '/')
            .replace(/\\u0026/g, '&')
            .replace(/\\u003d/g, '=');
    }
}

function extractYouTubeAccountAvatarFromHtml(html: string): string {
    const candidates = new Set<string>();
    const encodedUrlPattern = /https?:\\\/\\\/yt3\.(?:ggpht|googleusercontent)\.com\\\/[^"\\]+(?:\\u0026[^"\\]+)*/g;
    const plainUrlPattern = /https?:\/\/yt3\.(?:ggpht|googleusercontent)\.com\/[^"'<>\\\s]+/g;

    Array.from(html.matchAll(encodedUrlPattern)).forEach((match) => {
        candidates.add(decodeJsonStringFragment(match[0]));
    });
    Array.from(html.matchAll(plainUrlPattern)).forEach((match) => {
        candidates.add(decodeHtml(match[0]));
    });

    return Array.from(candidates)
        .map((url) => url.replace(/\\u0026/g, '&').replace(/\\\//g, '/'))
        .filter((url) => url && !isGenericYouTubeImageUrl(url))
        .sort((a, b) => {
            const sizeOf = (value: string) => Number(value.match(/[?=&]s(?:z)?=(\d+)/)?.[1] || value.match(/=s(\d+)/)?.[1] || 0);
            return sizeOf(b) - sizeOf(a);
        })[0] || '';
}

type InstagramProfileInfo = {
    username: string;
    fullName: string;
    biography: string;
    avatarUrl: string;
};

async function fetchInstagramProfileInfo(handle: string): Promise<InstagramProfileInfo | null> {
    const cleanHandle = String(handle || '').replace(/^@+/, '').trim();
    if (!cleanHandle || !/^[A-Za-z0-9._]+$/.test(cleanHandle)) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
        const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanHandle)}`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': `https://www.instagram.com/${encodeURIComponent(cleanHandle)}/`,
                'X-IG-App-ID': '936619743392459',
                'X-ASBD-ID': '129477'
            }
        });
        if (!response.ok) return null;

        const data = await response.json() as {
            data?: {
                user?: {
                    username?: string;
                    full_name?: string;
                    biography?: string;
                    profile_pic_url?: string;
                    profile_pic_url_hd?: string;
                };
            };
        };
        const user = data?.data?.user;
        if (!user) return null;

        return {
            username: decodeHtml(user.username || cleanHandle),
            fullName: decodeHtml(user.full_name || ''),
            biography: cleanLongText(decodeHtml(user.biography || '')),
            avatarUrl: user.profile_pic_url_hd || user.profile_pic_url || ''
        };
    } catch (_error) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

function sortThumbnailOptions(options: ThumbnailOption[]): ThumbnailOption[] {
    return options
        .map((option, index) => ({ option, index }))
        .sort((a, b) => {
            const bySource = (sourcePriority[a.option.source] ?? 50) - (sourcePriority[b.option.source] ?? 50);
            return bySource || a.index - b.index;
        })
        .map(({ option }) => option);
}

function collectJsonLdImages(value: unknown, add: (rawUrl: string, label: string, source: string) => void): void {
    const imageKeys = new Set(['image', 'logo', 'thumbnail', 'thumbnailurl', 'contenturl']);

    const collectImageValue = (candidate: unknown, label: string) => {
        if (typeof candidate === 'string') {
            add(candidate, label, 'json-ld');
            return;
        }
        if (Array.isArray(candidate)) {
            candidate.forEach((item) => collectImageValue(item, label));
            return;
        }
        if (candidate && typeof candidate === 'object') {
            const record = candidate as Record<string, unknown>;
            ['url', 'contentUrl', '@id'].forEach((key) => {
                if (typeof record[key] === 'string') add(record[key] as string, label, 'json-ld');
            });
        }
    };

    const walk = (node: unknown, depth = 0) => {
        if (!node || depth > 8) return;
        if (Array.isArray(node)) {
            node.forEach((item) => walk(item, depth + 1));
            return;
        }
        if (typeof node !== 'object') return;

        for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
            if (imageKeys.has(key.toLowerCase())) {
                collectImageValue(child, key.toLowerCase() === 'logo' ? '사이트 로고' : '구조화 이미지');
            } else if (child && typeof child === 'object') {
                walk(child, depth + 1);
            }
        }
    };

    walk(value);
}

export const handler: Handler = async (event) => {
    const { httpMethod } = event;

    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (httpMethod !== 'GET' && httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const targetUrl = getTargetUrl(event);

    if (!targetUrl) {
        return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }

    try {
        // Basic validation
        const parsedTarget = new URL(targetUrl);
        if (!/^https?:$/.test(parsedTarget.protocol)) {
            throw new Error('Only http and https URLs are supported');
        }

        const thumbnailOptions: ThumbnailOption[] = [];
        const seen = new Set<string>();
        const isInstagramAccount = isInstagramAccountUrl(parsedTarget);
        const isYouTubeAccount = isYouTubeAccountUrl(parsedTarget);
        const addCandidate = (rawUrl: string, label: string, source: string) => {
            const normalized = resolveCandidateUrl(rawUrl, parsedTarget);
            if (!normalized || seen.has(normalized)) return;
            if (isYouTubeUrl(parsedTarget) && isGenericYouTubeImageUrl(normalized)) return;
            seen.add(normalized);
            thumbnailOptions.push({ url: normalized, label, source });
        };

        const instagramHandle = getInstagramAccountHandle(parsedTarget);
        if (instagramHandle) {
            const profile = await fetchInstagramProfileInfo(instagramHandle);
            if (profile?.avatarUrl) {
                const cachedAvatar = await cacheRemoteAccountImage(profile.avatarUrl, parsedTarget, `instagram-${instagramHandle}`);
                addCandidate(cachedAvatar || profile.avatarUrl, '프로필 이미지', 'account-avatar');
                const limitedOptions = sortThumbnailOptions(thumbnailOptions).slice(0, MAX_THUMBNAIL_CANDIDATES);
                const title = profile.fullName || profile.username || instagramHandle;
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        url: targetUrl,
                        title,
                        description: profile.biography,
                        image_url: limitedOptions[0]?.url || null,
                        thumbnail_options: limitedOptions,
                        thumbnailOptions: limitedOptions,
                        success: true
                    })
                };
            }
        }

        // Fetch the target page html
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 9000);
        let response: Response;
        try {
            response = await fetch(targetUrl, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Referer': 'https://www.google.com/'
                }
            });
        } finally {
            clearTimeout(timer);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch URL: ${response.status} `);
        }

        const contentType = response.headers.get('content-type') || '';
        if (/^image\//i.test(contentType)) {
            addCandidate(targetUrl, '원본 이미지', 'direct-image');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    url: targetUrl,
                    title: parsedTarget.hostname.replace(/^www\./, ''),
                    description: '',
                    image_url: thumbnailOptions[0]?.url || null,
                    thumbnail_options: thumbnailOptions,
                    thumbnailOptions,
                    success: true
                })
            };
        }

        const html = await response.text();
        const metaTags = tagAttrs(html, 'meta');
        const linkTags = tagAttrs(html, 'link');
        const imgTags = tagAttrs(html, 'img');
        const youtubeAccountMetadata = isYouTubeAccount ? extractYouTubeAccountMetadataFromHtml(html) : { title: '', description: '' };

        // Extract Title
        const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        let title = youtubeAccountMetadata.title
            || firstMetaContent(metaTags, ['og:title', 'twitter:title', 'og:site_name'])
            || (titleMatch && titleMatch[1] ? titleMatch[1] : '');
        title = decodeHtml(title);
        if (isYouTubeUrl(parsedTarget) && !isYouTubeAccount) {
            title = extractYouTubeTitleFromHtml(html) || title;
        }

        // Extract Description
        let description = youtubeAccountMetadata.description
            || firstMetaContent(metaTags, ['description', 'og:description', 'twitter:description']);
        description = decodeHtml(description);
        if (isYouTubeUrl(parsedTarget) && !isYouTubeAccount) {
            description = extractYouTubeDescriptionFromHtml(html) || description;
        }

        if (isYouTubeAccount) {
            const accountAvatar = extractYouTubeAccountAvatarFromHtml(html);
            if (accountAvatar) {
                const youtubeKey = parsedTarget.pathname.split('/').filter(Boolean).join('-') || parsedTarget.hostname;
                const cachedAvatar = await cacheRemoteAccountImage(accountAvatar, parsedTarget, `youtube-${youtubeKey}`);
                addCandidate(cachedAvatar || accountAvatar, '프로필 이미지', 'account-avatar');
            }
        }

        // Extract representative images.
        ['og:image', 'og:image:url', 'og:image:secure_url'].forEach((key) => {
            metaTags
                .filter((attrs) => (attrs.property || attrs.name || '').toLowerCase() === key && attrs.content)
                .forEach((attrs) => addCandidate(attrs.content, '대표 이미지', 'og-image'));
        });

        ['twitter:image', 'twitter:image:src', 'image', 'thumbnail', 'thumbnailurl'].forEach((key) => {
            metaTags
                .filter((attrs) => (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase() === key && attrs.content)
                .forEach((attrs) => addCandidate(attrs.content, key.startsWith('twitter') ? '소셜 이미지' : '페이지 대표 이미지', 'meta-image'));
        });

        linkTags.forEach((attrs) => {
            const rel = String(attrs.rel || '').toLowerCase();
            if (!attrs.href) return;
            if (rel.includes('image_src')) addCandidate(attrs.href, '링크 이미지', 'image-src');
            if (rel.includes('apple-touch-icon')) addCandidate(attrs.href, '사이트 아이콘', 'apple-touch-icon');
            if (rel.includes('icon')) addCandidate(attrs.href, '사이트 아이콘', 'favicon');
            if (String(attrs.as || '').toLowerCase() === 'image') addCandidate(attrs.href, '프리로드 이미지', 'preload-image');
        });

        const jsonLdScripts = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
        jsonLdScripts.forEach((match) => {
            try {
                collectJsonLdImages(JSON.parse(match[1].trim()), addCandidate);
            } catch (_error) {
                // Ignore malformed structured data.
            }
        });

        let pageImageCount = 0;
        imgTags.forEach((attrs) => {
            if (pageImageCount >= MAX_PAGE_IMAGE_CANDIDATES) return;
            const rawUrl = attrs.src
                || attrs['data-src']
                || attrs['data-lazy-src']
                || firstSrcFromSrcset(attrs.srcset || attrs['data-srcset'] || '');
            if (!rawUrl) return;
            addCandidate(rawUrl, '페이지 이미지', 'page-image');
            pageImageCount += 1;
        });

        addCandidate(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsedTarget.hostname)}&sz=256`, '사이트 아이콘', 'favicon-fallback');
        if (!isInstagramAccount) {
            addCandidate(screenshotUrl(targetUrl), '사이트 스크린샷', 'screenshot');
        }

        const limitedOptions = sortThumbnailOptions(thumbnailOptions).slice(0, MAX_THUMBNAIL_CANDIDATES);
        const image_url = limitedOptions[0]?.url || null;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                url: targetUrl,
                title,
                description,
                image_url,
                thumbnail_options: limitedOptions,
                thumbnailOptions: limitedOptions,
                success: true
            })
        };

    } catch (error) {
        console.error(`[fetch-og-image] Error fetching ${targetUrl}:`, error);

        // Return 200 even on error to allow frontend to handle it gracefully
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                url: targetUrl,
                success: false,
                error: 'Failed to extract info from URL',
                details: error instanceof Error ? error.message : String(error),
                image_url: targetUrl ? screenshotUrl(targetUrl) : null,
                thumbnail_options: targetUrl ? [{
                    url: screenshotUrl(targetUrl),
                    label: '사이트 스크린샷',
                    source: 'screenshot'
                }] : [],
                thumbnailOptions: targetUrl ? [{
                    url: screenshotUrl(targetUrl),
                    label: '사이트 스크린샷',
                    source: 'screenshot'
                }] : []
            })
        };
    }
};
