const TARGETS = {
  production: 'https://swingenjoy.com/forum/media',
  local: 'http://127.0.0.1:5173/forum/media',
};

const LINK_TARGETS = {
  production: 'https://swingenjoy.com/links',
  local: 'http://127.0.0.1:5173/links',
};

const clipperRoot = document.querySelector('.clipper');
const clipperSubtitle = document.getElementById('clipperSubtitle');
const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');
const platformBadge = document.getElementById('platformBadge');
const thumbnailPreview = document.getElementById('thumbnailPreview');
const accountInfo = document.getElementById('accountInfo');
const accountPlatformText = document.getElementById('accountPlatformText');
const accountHandleText = document.getElementById('accountHandleText');
const accountDestinationText = document.getElementById('accountDestinationText');
const targetMode = document.getElementById('targetMode');
const captureMode = document.getElementById('captureMode');
const bucketInput = document.getElementById('bucketInput');
const playlistInput = document.getElementById('playlistInput');
const playlistStatus = document.getElementById('playlistStatus');
const newPlaylistInput = document.getElementById('newPlaylistInput');
const newPlaylistParentInput = document.getElementById('newPlaylistParentInput');
const tagsInput = document.getElementById('tagsInput');
const genreInput = document.getElementById('genreInput');
const saveButton = document.getElementById('saveButton');
const statusText = document.getElementById('statusText');
const mediaOnlyFields = Array.from(document.querySelectorAll('[data-media-only="true"]'));

let activeTab = null;
let activeThumbnailUrl = '';
let activePageMeta = {
  title: '',
  author: '',
  description: '',
  publishedAt: '',
  url: '',
};
let activeResolvedTitle = '';
let activePageStatus = '';
let playlists = [];
let savedSettings = {};

function detectPlatform(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') return 'YouTube';
    if (host === 'instagram.com') return 'Instagram';
    return 'Link';
  } catch {
    return 'Unknown';
  }
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

function getAccountPlatformLabel(accountTarget) {
  if (accountTarget?.platform === 'instagram') return 'Instagram';
  if (accountTarget?.platform === 'youtube') return 'YouTube';
  return '계정';
}

function cleanHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
}

function parseAccountTarget(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase();
    const parts = parsed.pathname.split('/').filter(Boolean);

    if (host === 'instagram.com') {
      const handle = cleanHandle(parts[0]);
      if (handle && !INSTAGRAM_RESERVED_PATHS.has(handle.toLowerCase())) {
        return {
          platform: 'instagram',
          handle,
          normalizedUrl: `https://www.instagram.com/${handle}/`,
        };
      }
    }

    if (host === 'youtube.com') {
      const first = parts[0] || '';
      if (first.startsWith('@')) {
        const handle = cleanHandle(first);
        if (handle) {
          return {
            platform: 'youtube',
            handle,
            normalizedUrl: `https://www.youtube.com/@${handle}`,
          };
        }
      }
      if (YOUTUBE_ACCOUNT_PATHS.has(first) && parts[1]) {
        const handle = cleanHandle(parts[1]);
        return {
          platform: 'youtube',
          handle,
          normalizedUrl: `https://www.youtube.com/${first}/${handle}`,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || '';
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (['shorts', 'embed', 'live'].includes(parts[0])) return parts[1] || '';
    }
  } catch {
    return '';
  }
  return '';
}

function getYouTubeThumbnailUrl(url) {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';
}

function isGenericYouTubeImage(url) {
  const value = String(url || '').toLowerCase();
  if (!value) return false;
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

function cleanTitle(title) {
  return String(title || '')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/\s*•\s*Instagram.*$/i, '')
    .trim();
}

function isGenericTitle(title, platform) {
  const value = cleanTitle(title).toLowerCase();
  if (!value) return true;
  if (platform === 'Instagram') {
    return ['instagram', 'reels', 'instagram reels', '인스타그램', '게시물', 'posts', 'profile', '프로필', '릴스'].includes(value);
  }
  if (platform === 'YouTube') {
    return ['youtube', 'youtube premium'].includes(value);
  }
  return false;
}

function cleanAccountTitle(title, accountTarget) {
  let value = cleanTitle(title);
  if (accountTarget?.platform === 'instagram' && accountTarget.handle) {
    const escapedHandle = accountTarget.handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    value = value
      .replace(new RegExp(`\\s*\\(@?${escapedHandle}\\)\\s*$`, 'i'), '')
      .replace(new RegExp(`\\s*@${escapedHandle}\\s*$`, 'i'), '')
      .trim();
  }
  return value;
}

function isWeakAccountDescription(description, accountTarget) {
  const value = String(description || '').replace(/\s+/g, ' ').trim();
  if (!value) return true;
  const lower = value.toLowerCase();
  if (accountTarget?.platform === 'instagram') {
    return (
      /팔로워\s*[\d,.a-z가-힣]+\s*명?,?\s*팔로잉\s*[\d,.a-z가-힣]+\s*명?,?\s*게시물\s*[\d,.a-z가-힣]+\s*개/i.test(value) ||
      /님의\s+instagram\s+사진\s+및\s+동영상\s+보기/i.test(value) ||
      /see\s+instagram\s+photos\s+and\s+videos\s+from/i.test(lower) ||
      /followers?.*following.*posts?.*instagram/i.test(lower) ||
      lower.includes('see everyday moments from your close friends')
    );
  }
  return false;
}

function truncateText(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function resolveArchiveTitle(platform, browserTitle, meta = {}) {
  const metaTitle = cleanTitle(meta.title);
  const tabTitle = cleanTitle(browserTitle);
  if (metaTitle && !isGenericTitle(metaTitle, platform)) return metaTitle;
  if (platform === 'Instagram') {
    const caption = truncateText(meta.description, 58);
    if (meta.author && caption) return `${meta.author}: ${caption}`;
    if (caption) return caption;
    if (meta.author) return `${meta.author} Instagram`;
  }
  if (tabTitle && !isGenericTitle(tabTitle, platform)) return tabTitle;
  return platform === 'Instagram' ? 'Instagram 게시물' : tabTitle || '제목 없음';
}

function resolveAccountTitle(accountTarget, browserTitle, meta = {}) {
  const platformLabel = getAccountPlatformLabel(accountTarget);
  const candidates = [meta.author, meta.title, browserTitle]
    .map((title) => cleanAccountTitle(title, accountTarget))
    .filter((title) => title && !isGenericTitle(title, platformLabel));
  return candidates[0] || (accountTarget.platform === 'youtube' ? `@${accountTarget.handle}` : accountTarget.handle);
}

function setStatus(message) {
  statusText.textContent = message || '';
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getTargetBaseUrl() {
  return TARGETS[targetMode.value] || TARGETS.production;
}

function getLinkTargetBaseUrl() {
  return LINK_TARGETS[targetMode.value] || LINK_TARGETS.production;
}

function getApiUrl(path) {
  return new URL(path, getTargetBaseUrl()).toString();
}

function getPlaylistParentId(playlist) {
  return compactText(playlist?.parent_id);
}

function sortPlaylistsByName(items) {
  return [...items].sort((a, b) => compactText(a.name).localeCompare(compactText(b.name), 'ko'));
}

function getPlaylistPath(playlist, allPlaylists) {
  const byId = new Map(allPlaylists.map((entry) => [entry.id, entry]));
  const segments = [];
  const visited = new Set();
  let cursor = playlist;
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    segments.unshift(compactText(cursor.name) || '이름 없음');
    const parentId = getPlaylistParentId(cursor);
    cursor = parentId ? byId.get(parentId) : null;
  }
  return segments.join(' / ');
}

function buildPlaylistTreeOptions(allPlaylists) {
  const playlistIds = new Set(allPlaylists.map((playlist) => playlist.id));
  const byParent = new Map();

  allPlaylists.forEach((playlist) => {
    const parentId = getPlaylistParentId(playlist);
    const key = parentId && playlistIds.has(parentId) ? parentId : '';
    byParent.set(key, [...(byParent.get(key) || []), playlist]);
  });

  const result = [];
  const visit = (parentId, depth, visited) => {
    const children = sortPlaylistsByName(byParent.get(parentId) || []);
    children.forEach((playlist) => {
      if (visited.has(playlist.id)) return;
      const nextVisited = new Set(visited);
      nextVisited.add(playlist.id);
      result.push({ playlist, depth, path: getPlaylistPath(playlist, allPlaylists) });
      visit(playlist.id, depth + 1, nextVisited);
    });
  };

  visit('', 0, new Set());
  return result;
}

function getSelectedPlaylist() {
  return playlists.find((playlist) => playlist.id === playlistInput.value) || null;
}

function appendOption(select, value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  select.appendChild(option);
}

function renderPlaylistOptions() {
  const options = buildPlaylistTreeOptions(playlists);
  const selectedPlaylistId = savedSettings.playlistId || playlistInput.value || '';
  const selectedParentId = savedSettings.newPlaylistParentId || newPlaylistParentInput.value || '';

  playlistInput.innerHTML = '';
  appendOption(playlistInput, '', playlists.length ? '선택 안 함' : '재생목록 없음');
  options.forEach(({ playlist, path }) => {
    appendOption(playlistInput, playlist.id, path);
  });
  playlistInput.disabled = !playlists.length;
  playlistInput.value = playlists.some((playlist) => playlist.id === selectedPlaylistId) ? selectedPlaylistId : '';

  newPlaylistParentInput.innerHTML = '';
  appendOption(newPlaylistParentInput, '', '최상위');
  options.forEach(({ playlist, path }) => {
    appendOption(newPlaylistParentInput, playlist.id, path);
  });
  newPlaylistParentInput.value = playlists.some((playlist) => playlist.id === selectedParentId) ? selectedParentId : '';

  playlistStatus.textContent = playlists.length
    ? `${playlists.length}개 폴더를 불러왔어요. 선택하면 앱 등록폼에도 그대로 반영됩니다.`
    : '폴더가 없으면 앱 등록폼에서 새 재생목록을 만들 수 있어요.';
}

async function readPlaylistsFromCurrentSite() {
  const response = await fetch('/api/cafe24-data/sns_media_playlists/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      table: 'sns_media_playlists',
      action: 'select',
      select: '*',
      filters: [],
      orFilters: [],
      orders: [{ column: 'updated_at', ascending: false }],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || payload?.message || response.statusText);
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchPlaylistsFromOpenAppTab() {
  const origin = new URL(getTargetBaseUrl()).origin;
  const tabs = await chrome.tabs.query({ url: `${origin}/*` });
  const preferredTabs = [...tabs].sort((a, b) => Number(Boolean(b.active)) - Number(Boolean(a.active)));

  for (const tab of preferredTabs) {
    if (!tab.id) continue;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readPlaylistsFromCurrentSite,
      });
      const data = results?.[0]?.result;
      if (Array.isArray(data)) return data;
    } catch (error) {
      console.warn('[sns-clipper] playlist tab sync failed', error);
    }
  }

  return null;
}

async function fetchPlaylistsFromApi() {
  const response = await fetch(getApiUrl('/api/cafe24-data/sns_media_playlists/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      table: 'sns_media_playlists',
      action: 'select',
      select: '*',
      filters: [],
      orFilters: [],
      orders: [{ column: 'updated_at', ascending: false }],
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    throw new Error(payload?.error?.message || payload?.message || response.statusText);
  }
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchPlaylists() {
  playlistInput.disabled = true;
  playlistStatus.textContent = '재생목록/폴더를 불러오는 중...';
  try {
    playlists = await fetchPlaylistsFromOpenAppTab();
    if (!playlists) {
      playlists = await fetchPlaylistsFromApi();
    }
    renderPlaylistOptions();
  } catch (error) {
    console.warn('[sns-clipper] playlist fetch failed', error);
    playlists = [];
    renderPlaylistOptions();
    playlistStatus.textContent = '폴더 목록을 불러오지 못했어요. 열린 앱 등록폼에서 선택할 수 있습니다.';
  }
}

function readPageMetaFromPage() {
  const cleanUrl = (value) => {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) return '';
    return url;
  };
  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const cleanLongText = (value) => String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
  const pickText = (selectors) => selectors
    .map((selector) => cleanText(document.querySelector(selector)?.getAttribute('content') || document.querySelector(selector)?.textContent))
    .find(Boolean) || '';
  const host = location.hostname.replace(/^www\./, '').toLowerCase();
  const isInstagram = host === 'instagram.com';
  const isYouTube = ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host);
  const pathParts = location.pathname.split('/').filter(Boolean);
  const instagramReservedPaths = new Set([
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
  const isInstagramAccountPage = isInstagram &&
    /^[A-Za-z0-9._]+$/.test(pathParts[0] || '') &&
    !instagramReservedPaths.has(String(pathParts[0] || '').toLowerCase());
  const instagramAccountHandle = isInstagramAccountPage ? String(pathParts[0] || '') : '';
  const isYouTubeAccountPage = isYouTube && (
    (pathParts[0] || '').startsWith('@') ||
    ['channel', 'c', 'user'].includes(pathParts[0] || '')
  );
  const isGenericYouTubeImageUrl = (url) => {
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
  };
  const isNoiseText = (value) => {
    const text = cleanText(value).toLowerCase();
    if (!text || text.length < 2) return true;
    return [
      'instagram',
      'reels',
      'explore',
      'home',
      'search',
      'more',
      '팔로우',
      '좋아요',
      '댓글',
      '공유',
      '더 보기',
      '릴스',
      '검색',
      '홈',
    ].includes(text);
  };
  const cleanInstagramCaption = (value) => {
    let text = cleanText(value);
    text = text.replace(/^\d[\d,\\.]*\s*(likes?|좋아요).*?:\s*/i, '');
    text = text.replace(/^[^:]{1,80}\s+on\s+Instagram:\s*/i, '');
    text = text.replace(/^["“]|["”]$/g, '').trim();
    return isNoiseText(text) ? '' : text;
  };
  const cleanInstagramAccountTitle = (value) => {
    let text = cleanText(value)
      .replace(/\s*•\s*Instagram.*$/i, '')
      .replace(/\s*-\s*Instagram\s*$/i, '')
      .trim();
    if (instagramAccountHandle) {
      const escapedHandle = instagramAccountHandle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      text = text
        .replace(new RegExp(`\\s*\\(@?${escapedHandle}\\)\\s*$`, 'i'), '')
        .replace(new RegExp(`\\s*@${escapedHandle}\\s*$`, 'i'), '')
        .trim();
    }
    return ['instagram', 'reels', 'instagram reels', '인스타그램', '게시물', 'posts', 'profile', '프로필', '릴스'].includes(text.toLowerCase()) ? '' : text;
  };
  const cleanInstagramAccountDescription = (value) => {
    const text = cleanLongText(value);
    const flat = cleanText(text);
    const lower = flat.toLowerCase();
    const isWeak = (
      /팔로워\s*[\d,.a-z가-힣]+\s*명?,?\s*팔로잉\s*[\d,.a-z가-힣]+\s*명?,?\s*게시물\s*[\d,.a-z가-힣]+\s*개/i.test(flat) ||
      /님의\s+instagram\s+사진\s+및\s+동영상\s+보기/i.test(flat) ||
      /see\s+instagram\s+photos\s+and\s+videos\s+from/i.test(lower) ||
      /followers?.*following.*posts?.*instagram/i.test(lower) ||
      lower.includes('see everyday moments from your close friends')
    );
    return isWeak ? '' : text;
  };
  const decodeJsonStringFragment = (value) => {
    try {
      return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`);
    } catch {
      return String(value || '')
        .replace(/\\\//g, '/')
        .replace(/\\u0026/g, '&')
        .replace(/&amp;/gi, '&');
    }
  };
  const isGenericInstagramImageUrl = (url) => {
    const value = String(url || '').toLowerCase();
    return (
      value.includes('static.cdninstagram.com') ||
      value.includes('/rsrc.php/') ||
      value.includes('instagram-logo') ||
      value.includes('instagram.com/static')
    );
  };
  const parseInstagramMetaText = (value) => {
    const text = cleanText(value);
    if (!text) return { author: '', caption: '' };
    const quoted = text.match(/^(.*?)\s+on\s+Instagram:\s*["“](.*?)["”]?$/i);
    if (quoted) {
      return {
        author: cleanText(quoted[1]).replace(/^@/, ''),
        caption: cleanInstagramCaption(quoted[2]),
      };
    }
    const colon = text.match(/^(.*?)\s+on\s+Instagram:\s*(.*)$/i);
    if (colon) {
      return {
        author: cleanText(colon[1]).replace(/^@/, ''),
        caption: cleanInstagramCaption(colon[2]),
      };
    }
    return { author: '', caption: cleanInstagramCaption(text) };
  };
  const pickInstagramAuthorFromDom = () => {
    const roots = [
      document.querySelector('article'),
      document.querySelector('main'),
      document.body,
    ].filter(Boolean);
    for (const root of roots) {
      const links = Array.from(root.querySelectorAll('a[href^="/"]'));
      const match = links
        .map((link) => ({
          href: link.getAttribute('href') || '',
          text: cleanText(link.textContent),
        }))
        .find((item) => (
          /^\/[A-Za-z0-9._]+\/?$/.test(item.href) &&
          item.text &&
          item.text.length <= 40 &&
          !['explore', 'reels', 'accounts', 'direct'].includes(item.href.split('/').filter(Boolean)[0])
        ));
      if (match) return match.text.replace(/^@/, '');
    }
    return '';
  };
  const pickInstagramCaptionFromDom = () => {
    const selectors = [
      'article h1',
      'article span[dir="auto"]',
      'main h1',
      'main span[dir="auto"]',
    ];
    return selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((node) => cleanInstagramCaption(node.textContent))
      .find((text) => text && text.length >= 8) || '';
  };
  const pickInstagramProfileAvatarFromDom = () => {
    const selectors = [
      'main header img[src]',
      'header img[src]',
      'main img[alt*="profile picture"][src]',
      'main img[alt*="프로필"][src]',
      'img[src*="t51.2885-19"][src]',
      'img[src*="scontent"][src]',
      'img[src*="fbcdn.net"][src]',
    ];
    const candidates = selectors
      .flatMap((selector, selectorIndex) => Array.from(document.querySelectorAll(selector)).map((img) => ({ img, selectorIndex })))
      .map(({ img, selectorIndex }) => {
        const image = img;
        const rect = image.getBoundingClientRect();
        const src = cleanUrl(image.currentSrc || image.src);
        const visibleArea = Math.max(rect.width, 0) * Math.max(rect.height, 0);
        const naturalArea = Math.max(image.naturalWidth || 0, 0) * Math.max(image.naturalHeight || 0, 0);
        const squareBias = Math.abs((image.naturalWidth || rect.width || 0) - (image.naturalHeight || rect.height || 0));
        const profilePicBias = src.includes('t51.2885-19') ? 0 : 1;
        return { src, visibleArea, naturalArea, squareBias, profilePicBias, selectorIndex };
      })
      .filter((item) => (
        item.src &&
        !isGenericInstagramImageUrl(item.src) &&
        (item.src.includes('t51.2885-19') || item.visibleArea >= 1200 || item.naturalArea >= 1200)
      ))
      .sort((a, b) => (
        a.profilePicBias - b.profilePicBias ||
        a.selectorIndex - b.selectorIndex ||
        a.squareBias - b.squareBias ||
        b.visibleArea + b.naturalArea / 100 - (a.visibleArea + a.naturalArea / 100)
      ));
    if (candidates[0]?.src) return candidates[0].src;

    const html = document.documentElement?.innerHTML || '';
    const encodedPattern = /"profile_pic_url_hd"\s*:\s*"((?:\\.|[^"\\])+)"/g;
    const plainPattern = /https?:\/\/[^"'<>\\\s]+t51\.2885-19[^"'<>\\\s]+/g;
    const scriptCandidates = [
      ...Array.from(html.matchAll(encodedPattern)).map((match) => decodeJsonStringFragment(match[1])),
      ...Array.from(html.matchAll(plainPattern)).map((match) => match[0]),
    ]
      .map(cleanUrl)
      .filter((src) => src && !isGenericInstagramImageUrl(src));
    return scriptCandidates[0] || '';
  };
  const textFromRuns = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value.simpleText === 'string') return value.simpleText;
    if (Array.isArray(value.runs)) {
      return value.runs.map((run) => run?.text || '').join('');
    }
    return '';
  };
  const extractBalancedJson = (text, startIndex) => {
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
  };
  const getYouTubePlayerResponse = () => {
    const scripts = Array.from(document.scripts).map((script) => script.textContent || '');
    for (const script of scripts) {
      const markerIndex = script.indexOf('ytInitialPlayerResponse');
      if (markerIndex < 0) continue;
      const rawJson = extractBalancedJson(script, markerIndex);
      if (!rawJson) continue;
      try {
        return JSON.parse(rawJson);
      } catch {
        // Keep scanning; YouTube can emit multiple script payloads.
      }
    }
    return null;
  };
  const pickYouTubeDescriptionFromPageData = () => {
    const response = getYouTubePlayerResponse();
    const candidates = [
      response?.videoDetails?.shortDescription,
      textFromRuns(response?.microformat?.playerMicroformatRenderer?.description),
    ];
    return candidates.map(cleanLongText).find((text) => text.length >= 8) || '';
  };
  const pickYouTubeDescriptionFromDom = () => {
    const selectors = [
      'ytd-watch-metadata #description-inline-expander #attributed-snippet-text',
      'ytd-watch-metadata ytd-text-inline-expander #attributed-snippet-text',
      'ytd-watch-metadata #description-inline-expander yt-attributed-string',
      'ytd-watch-metadata ytd-text-inline-expander yt-attributed-string',
      '#description-inline-expander',
      '#description-text',
      'ytd-video-secondary-info-renderer #description',
    ];
    return selectors
      .map((selector) => cleanLongText(document.querySelector(selector)?.textContent))
      .find((text) => text.length >= 8 && !/^더보기$/i.test(text)) || '';
  };
  const pickYouTubeChannelDescriptionFromDom = () => {
    const selectors = [
      'yt-page-header-view-model [role="text"]',
      'ytd-channel-about-metadata-renderer #description-container',
      'ytd-channel-about-metadata-renderer yt-attributed-string',
    ];
    return selectors
      .map((selector) => cleanLongText(document.querySelector(selector)?.getAttribute('content') || document.querySelector(selector)?.textContent))
      .find((text) => {
        const lower = cleanText(text).toLowerCase();
        if (text.length < 8 || /^youtube$/i.test(text)) return false;
        if (/^@?[a-z0-9._-]+$/i.test(text)) return false;
        if (/구독자\s*[\d,.천만억kmb]+\s*명/i.test(text)) return false;
        if (/동영상\s*[\d,.천만억kmb]+\s*개/i.test(text)) return false;
        return !lower.includes('subscribers') && !lower.includes('videos');
      }) || '';
  };
  const pickYouTubeChannelAvatarFromDom = () => {
    const selectors = [
      'yt-page-header-view-model img[src]',
      'ytd-page-header-renderer img[src]',
      'ytd-c4-tabbed-header-renderer #avatar img[src]',
      'ytd-channel-header-renderer #avatar img[src]',
      'yt-decorated-avatar-view-model img[src]',
      'img[src*="yt3.ggpht.com"]',
      'img[src*="yt3.googleusercontent.com"]',
    ];
    const candidatesBySelector = selectors
      .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
      .map((img) => {
        const image = img;
        const rect = image.getBoundingClientRect();
        const src = cleanUrl(image.currentSrc || image.src);
        const visibleArea = Math.max(rect.width, 0) * Math.max(rect.height, 0);
        const naturalArea = Math.max(image.naturalWidth || 0, 0) * Math.max(image.naturalHeight || 0, 0);
        const squareBias = Math.abs((image.naturalWidth || rect.width || 0) - (image.naturalHeight || rect.height || 0));
        return { src, visibleArea, naturalArea, squareBias };
      })
      .filter((item) => (
        item.src &&
        !isGenericYouTubeImageUrl(item.src) &&
        (item.src.includes('yt3.') || item.visibleArea >= 800 || item.naturalArea >= 800)
      ))
      .sort((a, b) => (
        Number(b.src.includes('yt3.')) - Number(a.src.includes('yt3.')) ||
        a.squareBias - b.squareBias ||
        b.visibleArea + b.naturalArea / 100 - (a.visibleArea + a.naturalArea / 100)
      ));
    return candidatesBySelector[0]?.src || '';
  };

  const fromMeta = [
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]',
  ]
    .map((selector) => document.querySelector(selector)?.getAttribute('content'))
    .map(cleanUrl)
    .find(Boolean);

  const poster = Array.from(document.querySelectorAll('video[poster]'))
    .map((video) => cleanUrl(video.getAttribute('poster')))
    .find(Boolean);

  const candidates = Array.from(document.images)
    .map((img) => {
      const rect = img.getBoundingClientRect();
      const src = cleanUrl(img.currentSrc || img.src);
      return {
        src,
        area: Math.max(rect.width, 0) * Math.max(rect.height, 0),
        naturalArea: Math.max(img.naturalWidth || 0, 0) * Math.max(img.naturalHeight || 0, 0),
      };
    })
    .filter((item) => item.src && item.area >= 12000 && item.naturalArea >= 12000)
    .sort((a, b) => (b.area + b.naturalArea / 100) - (a.area + a.naturalArea / 100));

  const description = pickText([
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ]);
  const metaTitle = pickText([
    'meta[property="og:title"]',
    'meta[name="twitter:title"]',
    'meta[property="twitter:title"]',
  ]) || cleanText(document.title);

  let author = pickText([
    'meta[name="author"]',
    'meta[property="article:author"]',
    'span[itemprop="author"] link[itemprop="name"]',
    '[itemprop="author"] [itemprop="name"]',
  ]);

  if (!author) {
    author = cleanText(
      document.querySelector('ytd-channel-name a')?.textContent ||
      document.querySelector('#channel-name a')?.textContent ||
      document.querySelector('header a[href^="/"]')?.textContent ||
      document.querySelector('article header a[href^="/"]')?.textContent
    );
  }

  let title = metaTitle;
  let normalizedDescription = description;
  if (isInstagramAccountPage) {
    const accountTitle = cleanInstagramAccountTitle(metaTitle) || cleanInstagramAccountTitle(document.title);
    author = accountTitle || author;
    title = accountTitle || metaTitle;
    normalizedDescription = cleanInstagramAccountDescription(description);
  } else if (isInstagram) {
    const parsedFromTitle = parseInstagramMetaText(metaTitle);
    const parsedFromDescription = parseInstagramMetaText(description);
    const caption = pickInstagramCaptionFromDom() || parsedFromTitle.caption || parsedFromDescription.caption;
    author = author || parsedFromTitle.author || parsedFromDescription.author || pickInstagramAuthorFromDom();
    normalizedDescription = caption || description;
    title = author && caption ? `${author}: ${caption}` : caption || metaTitle;
  }
  if (isYouTubeAccountPage) {
    normalizedDescription = pickYouTubeChannelDescriptionFromDom() || description;
  } else if (isYouTube) {
    normalizedDescription = pickYouTubeDescriptionFromPageData() || pickYouTubeDescriptionFromDom() || description;
  }

  const publishedAt = cleanText(
    document.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content') ||
    document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    document.querySelector('time[datetime]')?.getAttribute('datetime') ||
    ''
  );

  const youtubeAccountAvatar = isYouTubeAccountPage ? pickYouTubeChannelAvatarFromDom() : '';
  const instagramAccountAvatar = isInstagramAccountPage ? pickInstagramProfileAvatarFromDom() : '';

  return {
    url: location.href,
    thumbnail: instagramAccountAvatar || youtubeAccountAvatar || fromMeta || poster || candidates[0]?.src || '',
    title,
    description: normalizedDescription,
    author,
    publishedAt,
  };
}

async function getActiveTabMetadata(tab, platform) {
  if (!tab?.id || !['Instagram', 'YouTube', 'Link'].includes(platform)) {
    return { thumbnail: '', description: '', author: '', publishedAt: '' };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readPageMetaFromPage,
    });
    return results?.[0]?.result || { thumbnail: '', title: '', description: '', author: '', publishedAt: '', url: '' };
  } catch (error) {
    console.warn('[sns-clipper] metadata extraction failed', error);
    return { thumbnail: '', title: '', description: '', author: '', publishedAt: '', url: '' };
  }
}

function updatePageMetadataPreview(meta) {
  activePageMeta = {
    title: meta?.title || '',
    author: meta?.author || '',
    description: meta?.description || '',
    publishedAt: meta?.publishedAt || '',
    url: meta?.url || '',
  };
  const url = meta?.thumbnail || '';
  activeThumbnailUrl = url || '';
  if (!activeThumbnailUrl) {
    thumbnailPreview.hidden = true;
    thumbnailPreview.removeAttribute('src');
    return;
  }
  thumbnailPreview.src = activeThumbnailUrl;
  thumbnailPreview.hidden = false;
}

function renderAccountInfo(accountTarget) {
  if (!accountTarget) {
    accountInfo.hidden = true;
    return;
  }

  accountInfo.hidden = false;
  accountPlatformText.textContent = getAccountPlatformLabel(accountTarget);
  accountHandleText.textContent = `@${accountTarget.handle}`;
  accountDestinationText.textContent = targetMode.value === 'local' ? '사이트 모음 · 로컬' : '사이트 모음';
}

function updateCaptureModeUi() {
  const isAccountMode = captureMode.value === 'account';
  const accountTarget = parseAccountTarget(activeTab?.url || '');
  const baseDisabled = !activeTab?.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://');
  const platform = detectPlatform(activeTab?.url || '');

  clipperRoot.classList.toggle('is-account-mode', isAccountMode);
  mediaOnlyFields.forEach((field) => {
    field.hidden = isAccountMode;
  });

  saveButton.querySelector('span').textContent = isAccountMode ? '계정 등록폼 열기' : '공유 등록폼 열기';
  saveButton.disabled = baseDisabled || (isAccountMode && !accountTarget);
  clipperSubtitle.textContent = isAccountMode ? '인물 계정 등록' : 'YouTube · Instagram';

  if (isAccountMode) {
    if (accountTarget) {
      const accountTitle = resolveAccountTitle(accountTarget, activeTab?.title || '', activePageMeta);
      pageTitle.textContent = accountTitle;
      platformBadge.textContent = `${getAccountPlatformLabel(accountTarget)} 계정`;
      renderAccountInfo(accountTarget);
      setStatus(`${getAccountPlatformLabel(accountTarget)} 계정 @${accountTarget.handle} · 사이트 모음 등록폼으로 보냅니다.`);
    } else {
      pageTitle.textContent = activeResolvedTitle || cleanTitle(activeTab?.title || '') || '계정 페이지를 찾지 못했습니다';
      platformBadge.textContent = platform;
      renderAccountInfo(null);
      setStatus('인물 계정은 Instagram 프로필 또는 YouTube 채널 페이지에서만 등록할 수 있어요.');
    }
    return;
  }

  pageTitle.textContent = activeResolvedTitle || cleanTitle(activeTab?.title || '') || '제목 없음';
  platformBadge.textContent = platform;
  renderAccountInfo(null);
  if (accountTarget) {
    setStatus('계정 페이지입니다. 계정을 저장하려면 등록 대상을 인물 계정으로 바꾸세요.');
    return;
  }
  setStatus(activePageStatus);
}

async function updatePagePreview(tab) {
  activeTab = tab;
  const url = tab?.url || '';
  const title = cleanTitle(tab?.title || '');
  const platform = detectPlatform(url);
  const accountTarget = parseAccountTarget(url);
  const pageMeta = await getActiveTabMetadata(tab, platform);
  if (platform === 'YouTube') {
    pageMeta.thumbnail = getYouTubeThumbnailUrl(url) || (isGenericYouTubeImage(pageMeta.thumbnail) ? '' : pageMeta.thumbnail);
  }
  captureMode.value = accountTarget ? 'account' : 'media';
  activeResolvedTitle = accountTarget
    ? resolveAccountTitle(accountTarget, title, pageMeta)
    : resolveArchiveTitle(platform, title, pageMeta);

  pageTitle.textContent = activeResolvedTitle;
  pageUrl.textContent = url;
  platformBadge.textContent = platform;
  saveButton.disabled = !url || url.startsWith('chrome://') || url.startsWith('edge://');
  updatePageMetadataPreview(pageMeta);

  if (platform === 'Link') {
    activePageStatus = activeThumbnailUrl ? '페이지 썸네일 후보를 찾았어요.' : '유튜브/인스타가 아니어도 링크로 저장할 수 있어요.';
  } else if (platform === 'Instagram') {
    activePageStatus = activeThumbnailUrl ? '인스타 썸네일 후보를 찾았어요.' : '썸네일을 못 찾으면 원본 링크만 저장됩니다.';
  } else if (platform === 'YouTube') {
    activePageStatus = activePageMeta.description || activePageMeta.author ? '원본 설명과 채널 정보를 가져왔어요.' : '';
  } else if (platform === 'Unknown') {
    activePageStatus = '이 페이지는 저장하기 어려울 수 있어요.';
  } else {
    activePageStatus = '';
  }

  updateCaptureModeUi();
}

async function loadSettings() {
  savedSettings = await chrome.storage.local.get([
    'targetMode',
    'bucket',
    'playlistId',
    'newPlaylistName',
    'newPlaylistParentId',
    'tags',
    'genre',
  ]);
  targetMode.value = savedSettings.targetMode || 'production';
  bucketInput.value = savedSettings.bucket || 'reference';
  newPlaylistInput.value = savedSettings.newPlaylistName || '';
  tagsInput.value = savedSettings.tags || '';
  genreInput.value = savedSettings.genre || '';
}

async function saveSettings() {
  savedSettings = {
    targetMode: targetMode.value,
    bucket: bucketInput.value,
    playlistId: playlistInput.value,
    newPlaylistName: newPlaylistInput.value.trim(),
    newPlaylistParentId: newPlaylistParentInput.value,
    tags: tagsInput.value,
    genre: genreInput.value,
  };
  await chrome.storage.local.set({
    ...savedSettings,
  });
}

function buildArchiveUrl() {
  const base = TARGETS[targetMode.value] || TARGETS.production;
  const params = new URLSearchParams();
  params.set('add', activeTab.url);
  params.set('title', activeResolvedTitle || cleanTitle(activeTab.title));
  params.set('source', '데스크톱 공유');
  params.set('bucket', bucketInput.value);
  const selectedPlaylist = getSelectedPlaylist();
  const newPlaylistName = newPlaylistInput.value.trim();
  if (newPlaylistName) {
    params.set('playlistId', '');
    params.set('newPlaylistName', newPlaylistName);
    if (newPlaylistParentInput.value) params.set('newPlaylistParentId', newPlaylistParentInput.value);
    params.set('collection', newPlaylistName);
  } else if (selectedPlaylist) {
    params.set('playlistId', selectedPlaylist.id);
    params.set('playlist', selectedPlaylist.id);
    params.set('collection', compactText(selectedPlaylist.name));
    if (!genreInput.value.trim() && selectedPlaylist.dance_genre) {
      params.set('genre', compactText(selectedPlaylist.dance_genre));
    }
  } else {
    params.set('playlistId', '');
    params.set('collection', '');
  }
  if (activeThumbnailUrl) params.set('thumbnail', activeThumbnailUrl);
  if (activePageMeta.author) params.set('author', activePageMeta.author);
  if (activePageMeta.description) params.set('description', activePageMeta.description.slice(0, 4000));
  if (activePageMeta.publishedAt) params.set('published', activePageMeta.publishedAt.slice(0, 10));
  if (tagsInput.value.trim()) params.set('tags', tagsInput.value.trim());
  if (genreInput.value.trim()) params.set('genre', genreInput.value.trim());
  return `${base}#clipper?${params.toString()}`;
}

function buildAccountUrl() {
  const accountTarget = parseAccountTarget(activeTab.url);
  if (!accountTarget) return '';

  const base = getLinkTargetBaseUrl();
  const params = new URLSearchParams();
  const platformLabel = accountTarget.platform === 'instagram' ? 'Instagram' : 'YouTube';
  let title = cleanAccountTitle(activePageMeta.author || activeResolvedTitle || activeTab.title, accountTarget);
  if (!title || isGenericTitle(title, platformLabel)) {
    title = accountTarget.platform === 'youtube' ? `@${accountTarget.handle}` : accountTarget.handle;
  }

  params.set('clipper', 'account');
  params.set('type', 'person_account');
  params.set('url', accountTarget.normalizedUrl);
  params.set('title', title);
  params.set('category', '인물');
  params.set('platform', accountTarget.platform);
  params.set('handle', accountTarget.handle);
  params.set('source', '데스크톱 공유');
  if (activeThumbnailUrl) params.set('thumbnail', activeThumbnailUrl);
  if (activePageMeta.description && !isWeakAccountDescription(activePageMeta.description, accountTarget)) {
    params.set('description', activePageMeta.description.slice(0, 4000));
  }
  return `${base}?${params.toString()}`;
}

async function init() {
  await loadSettings();
  await fetchPlaylists();
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  await updatePagePreview(tabs[0]);
}

targetMode.addEventListener('change', async () => {
  await saveSettings();
  await fetchPlaylists();
  updateCaptureModeUi();
});
captureMode.addEventListener('change', updateCaptureModeUi);
bucketInput.addEventListener('change', saveSettings);
playlistInput.addEventListener('change', async () => {
  if (playlistInput.value) {
    newPlaylistInput.value = '';
    newPlaylistParentInput.value = '';
  }
  await saveSettings();
});
newPlaylistInput.addEventListener('input', async () => {
  if (newPlaylistInput.value.trim()) {
    playlistInput.value = '';
  }
  await saveSettings();
});
newPlaylistParentInput.addEventListener('change', saveSettings);
tagsInput.addEventListener('change', saveSettings);
genreInput.addEventListener('change', saveSettings);

saveButton.addEventListener('click', async () => {
  if (!activeTab?.url) return;
  await saveSettings();
  const url = captureMode.value === 'account' ? buildAccountUrl() : buildArchiveUrl();
  if (!url) {
    setStatus('이 페이지에서는 선택한 등록 대상을 만들 수 없어요.');
    return;
  }
  await chrome.tabs.create({ url, active: true });
});

init().catch((error) => {
  console.error(error);
  pageTitle.textContent = '현재 탭을 읽지 못했습니다';
  setStatus('확장 프로그램 권한을 확인해주세요.');
  saveButton.disabled = true;
});
