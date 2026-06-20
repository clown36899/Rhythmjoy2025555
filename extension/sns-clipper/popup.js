const TARGETS = {
  production: 'https://swingenjoy.com/forum/media',
  local: 'http://127.0.0.1:5173/forum/media',
};

const pageTitle = document.getElementById('pageTitle');
const pageUrl = document.getElementById('pageUrl');
const platformBadge = document.getElementById('platformBadge');
const thumbnailPreview = document.getElementById('thumbnailPreview');
const targetMode = document.getElementById('targetMode');
const bucketInput = document.getElementById('bucketInput');
const collectionInput = document.getElementById('collectionInput');
const tagsInput = document.getElementById('tagsInput');
const genreInput = document.getElementById('genreInput');
const saveButton = document.getElementById('saveButton');
const statusText = document.getElementById('statusText');

let activeTab = null;
let activeThumbnailUrl = '';
let activePageMeta = {
  title: '',
  author: '',
  description: '',
  publishedAt: '',
};
let activeResolvedTitle = '';

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
    value.includes('/youtube/img/') ||
    value.includes('/yt/about/') ||
    value.includes('youtube_social') ||
    value.includes('yt_logo')
  );
}

function cleanTitle(title) {
  return String(title || '')
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .replace(/\s*•\s*Instagram.*$/i, '')
    .trim();
}

function isGenericTitle(title, platform) {
  const value = cleanTitle(title).toLowerCase();
  if (!value) return true;
  if (platform === 'Instagram') {
    return ['instagram', 'reels', 'instagram reels', '인스타그램'].includes(value);
  }
  if (platform === 'YouTube') {
    return ['youtube', 'youtube premium'].includes(value);
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

function setStatus(message) {
  statusText.textContent = message || '';
}

function readPageMetaFromPage() {
  const cleanUrl = (value) => {
    const url = String(value || '').trim();
    if (!/^https?:\/\//i.test(url)) return '';
    return url;
  };
  const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const pickText = (selectors) => selectors
    .map((selector) => cleanText(document.querySelector(selector)?.getAttribute('content') || document.querySelector(selector)?.textContent))
    .find(Boolean) || '';
  const isInstagram = location.hostname.replace(/^www\./, '').toLowerCase() === 'instagram.com';
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
  if (isInstagram) {
    const parsedFromTitle = parseInstagramMetaText(metaTitle);
    const parsedFromDescription = parseInstagramMetaText(description);
    const caption = pickInstagramCaptionFromDom() || parsedFromTitle.caption || parsedFromDescription.caption;
    author = author || parsedFromTitle.author || parsedFromDescription.author || pickInstagramAuthorFromDom();
    normalizedDescription = caption || description;
    title = author && caption ? `${author}: ${caption}` : caption || metaTitle;
  }

  const publishedAt = cleanText(
    document.querySelector('meta[itemprop="datePublished"]')?.getAttribute('content') ||
    document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
    document.querySelector('time[datetime]')?.getAttribute('datetime') ||
    ''
  );

  return {
    thumbnail: fromMeta || poster || candidates[0]?.src || '',
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
    return results?.[0]?.result || { thumbnail: '', title: '', description: '', author: '', publishedAt: '' };
  } catch (error) {
    console.warn('[sns-clipper] metadata extraction failed', error);
    return { thumbnail: '', title: '', description: '', author: '', publishedAt: '' };
  }
}

function updatePageMetadataPreview(meta) {
  activePageMeta = {
    title: meta?.title || '',
    author: meta?.author || '',
    description: meta?.description || '',
    publishedAt: meta?.publishedAt || '',
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

async function updatePagePreview(tab) {
  activeTab = tab;
  const url = tab?.url || '';
  const title = cleanTitle(tab?.title || '');
  const platform = detectPlatform(url);
  const pageMeta = await getActiveTabMetadata(tab, platform);
  if (platform === 'YouTube') {
    pageMeta.thumbnail = getYouTubeThumbnailUrl(url) || (isGenericYouTubeImage(pageMeta.thumbnail) ? '' : pageMeta.thumbnail);
  }
  activeResolvedTitle = resolveArchiveTitle(platform, title, pageMeta);

  pageTitle.textContent = activeResolvedTitle;
  pageUrl.textContent = url;
  platformBadge.textContent = platform;
  saveButton.disabled = !url || url.startsWith('chrome://') || url.startsWith('edge://');
  updatePageMetadataPreview(pageMeta);

  if (platform === 'Link') {
    setStatus(activeThumbnailUrl ? '페이지 썸네일 후보를 찾았어요.' : '유튜브/인스타가 아니어도 링크로 저장할 수 있어요.');
  } else if (platform === 'Instagram') {
    setStatus(activeThumbnailUrl ? '인스타 썸네일 후보를 찾았어요.' : '썸네일을 못 찾으면 원본 링크만 저장됩니다.');
  } else if (platform === 'YouTube') {
    setStatus(activePageMeta.description || activePageMeta.author ? '원본 설명과 채널 정보를 가져왔어요.' : '');
  } else if (platform === 'Unknown') {
    setStatus('이 페이지는 저장하기 어려울 수 있어요.');
  } else {
    setStatus('');
  }
}

async function loadSettings() {
  const saved = await chrome.storage.local.get(['targetMode', 'bucket', 'collection', 'tags', 'genre']);
  targetMode.value = saved.targetMode || 'production';
  bucketInput.value = saved.bucket || 'reference';
  collectionInput.value = saved.collection || '';
  tagsInput.value = saved.tags || '';
  genreInput.value = saved.genre || '';
}

async function saveSettings() {
  await chrome.storage.local.set({
    targetMode: targetMode.value,
    bucket: bucketInput.value,
    collection: collectionInput.value,
    tags: tagsInput.value,
    genre: genreInput.value,
  });
}

function buildArchiveUrl() {
  const base = TARGETS[targetMode.value] || TARGETS.production;
  const params = new URLSearchParams();
  params.set('add', activeTab.url);
  params.set('title', activeResolvedTitle || cleanTitle(activeTab.title));
  params.set('source', '데스크톱 공유');
  params.set('bucket', bucketInput.value);
  if (collectionInput.value.trim()) params.set('collection', collectionInput.value.trim());
  if (activeThumbnailUrl) params.set('thumbnail', activeThumbnailUrl);
  if (activePageMeta.author) params.set('author', activePageMeta.author);
  if (activePageMeta.description) params.set('description', activePageMeta.description.slice(0, 1200));
  if (activePageMeta.publishedAt) params.set('published', activePageMeta.publishedAt.slice(0, 10));
  if (tagsInput.value.trim()) params.set('tags', tagsInput.value.trim());
  if (genreInput.value.trim()) params.set('genre', genreInput.value.trim());
  return `${base}#clipper?${params.toString()}`;
}

async function init() {
  await loadSettings();
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  await updatePagePreview(tabs[0]);
}

targetMode.addEventListener('change', saveSettings);
bucketInput.addEventListener('change', saveSettings);
collectionInput.addEventListener('change', saveSettings);
tagsInput.addEventListener('change', saveSettings);
genreInput.addEventListener('change', saveSettings);

saveButton.addEventListener('click', async () => {
  if (!activeTab?.url) return;
  await saveSettings();
  await chrome.tabs.create({ url: buildArchiveUrl(), active: true });
});

init().catch((error) => {
  console.error(error);
  pageTitle.textContent = '현재 탭을 읽지 못했습니다';
  setStatus('확장 프로그램 권한을 확인해주세요.');
  saveButton.disabled = true;
});
