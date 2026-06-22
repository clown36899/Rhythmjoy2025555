#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { JSDOM } from 'jsdom';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), quiet: true });

const ROUTINES_URL = 'https://www.lindycollection.com/routines/';
const ROOT_PLAYLIST_ID = 'lindycollection-routines';
const SOURCE_NAME = 'Lindy Collection';
const IMPORTER_NAME = 'Lindy Collection Importer';
const DEFAULT_TAGS = ['Lindy Collection', '루틴', 'routine', 'lindy hop', 'solo jazz', '스윙'];
const TRANSLATION_SOURCE = 'manual-ko-2026-06-22';
const SOURCE_REPOSITORY_URL = 'https://github.com/lindycollection/www.lindycollection.com';
const LICENSE_NAME = 'CC BY-NC-SA 4.0';
const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const LICENSE_NOTICE = 'Lindy Collection site content is licensed under Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International.';
const ADAPTATION_NOTE = '한국어 번역/요약 및 SwingEnjoy SNS 아카이브용 재구성';
const NO_ENDORSEMENT_NOTICE = 'Lindy Collection의 공식 제휴 또는 보증을 의미하지 않습니다.';
const RIGHTS_NOTE = '링크된 원본 영상은 각 게시자와 플랫폼의 권리 조건을 따릅니다.';
const ROUTINE_DESCRIPTION_TRANSLATIONS = {
  al_leon_shim_sham: [
    '알 민스와 리언 제임스가 대중화한 Shim Sham 변형입니다.',
    'Cari가 정리한 이 버전에 대한 좋은 요약이 있습니다.',
  ].join('\n'),
  big_apple: [
    'Big Apple 루틴입니다.',
    '안무는 영화 Keep Punching에서 나왔습니다.',
    'Wikipedia에 관련 자료가 많이 있고, Lindy Circle에는 Big Apple 댄스 역사에 대한 좋은 글이 있습니다.',
    '원조 댄서 중 한 명인 Betty Wood의 인터뷰도 참고할 수 있습니다.',
    'Shesha Marvin이 정리한 Whitey’s Big Apple from “Keep Punching” 스텝 리스트가 있습니다.',
    '현대 강사의 관점에서 정리한 좋은 개요도 있습니다.',
    'Keep Punching 라인업의 댄서: Mickey Jones, William Downes, Norma Miller, George Greenidge, Joyce Daniels, Jay Daniels, Lucile Middleton, Frankie Manning, Wilda Crawford, Thomas “Tops” Lee.',
  ].join('\n'),
  california: [
    'California Routine입니다.',
    'Swungover에 이 루틴의 역사에 대한 좋은 글이 있습니다.',
    'Frankie Manning이 안무했습니다.',
    'Lindy Hop Moves에는 Patric과 Natasha의 브레이크다운 자료가 있습니다.',
  ].join('\n'),
  dean_colins_shim_sham: [
    'Dean Colins Shim Sham입니다.',
    'Dean Colins의 개인 스타일을 따라 대중화된 버전입니다.',
    'Edinburgh University Swing Dance Society와 Lindy Hop Moves의 참고 자료가 있습니다.',
  ].join('\n'),
  doin_the_jive: 'Kelly Porter, Joshua Welter, Michael Faltesek이 Glenn Miller의 Careless Lovers 버전 곡에 맞춰 안무한 루틴입니다.',
  first_stops: [
    'First Stops는 Savoy Ballroom에서 만들어진 초기 앙상블 루틴입니다.',
    '탄생 배경은 Norma Miller의 책 “Swingin’ at the Savoy”에서 더 읽을 수 있습니다.',
    '현재는 Second Stops와 구분하기 위해 First Stops라고 부르지만, 원래는 Stops routine으로 불렸습니다.',
  ].join('\n'),
  frankie_doo: [
    'Frankie Doo는 Frankie Manning이 만든 Tranky Doo 변형입니다.',
    'Tranky Doo에서 발전한 루틴입니다.',
    'Lainey Silver가 그 변화와 차이를 다룬 글을 남겼습니다.',
  ].join('\n'),
  hat_trick_shim_sham: [
    'Al & Leon Shim Sham에 모자 트릭을 더한 Shim Sham 변형입니다. Cab Calloway의 Dinah에 맞춰 안무되었습니다.',
    'Shesha Marvin이 안무했고, Tips, Taps and Tops가 Camp Jitterbug 2010에서 처음 공연했습니다. Shesha는 12파트 튜토리얼 재생목록도 만들었습니다.',
    '다른 Shim Sham 변형을 포함한 추가 정보는 Atomic Ballroom 블로그 글에서 볼 수 있습니다.',
  ].join('\n'),
  mamas_stew: [
    'Mama’s Stew입니다.',
    'Mikey Pedroza가 정리한 좋은 배경 자료가 있습니다.',
  ].join('\n'),
  second_stops: [
    'Second Stops Routine은 Savoy Ballroom에서 만들어진 또 다른 루틴입니다.',
    '현재 First Stops라고 불리는 루틴 뒤에 이어지는 두 번째 Stops 루틴입니다.',
  ].join('\n'),
  shim_sham: [
    'Shim Sham입니다.',
    'Willie Bryant와 Leonard Reed가 안무했습니다.',
    '이 버전은 Frankie Manning을 통해 대중화되었습니다.',
    '보통 Billy May의 “Tain’t What You Do” 또는 The Bill Elliott Swing Orchestra의 “The Shim Sham Song”에 맞춰 춥니다.',
    'Wikipedia 글, Shesha Marvin의 스텝 리스트, Sonny Watson의 Shim Sham 역사, Lindy Hop Moves 요약 자료가 있습니다.',
  ].join('\n'),
  st_louis_shim_sham: [
    'Jon Tigert가 St. Louis 방문 중 안무한 루틴입니다.',
    '음악: The Four Vagabonds의 Murder He Said.',
    '추가 정보는 lindyland에서 볼 수 있습니다.',
  ].join('\n'),
  stompology_stomp_off: [
    'Stompology Stomp-Off는 solo jazz에 초점을 둔 Rochester, New York의 연례 행사 Stompology를 위해 만들어진 루틴입니다. 이 버전은 2010년 작업을 합쳐 2011년에 만들어졌습니다.',
    '음악: Lionel Hampton의 “Don’t Be That Way”.',
    '이 춤에는 두 번의 버전이 있었고, 아래에는 2011년과 2010년 공연, 리캡, 두 버전을 배우기 위한 4파트 시리즈가 함께 정리되어 있습니다.',
  ].join('\n'),
  tranky_doo: [
    'Tranky Doo입니다.',
    'Tranky Doo는 Shim Sham, Big Apple과 함께 초기 시대의 대표적인 세 루틴 중 하나입니다. 널리 공연되고 많은 댄서에게 잘 알려져 있습니다.',
    'Spirit Moves에서 볼 수 있는 초기 Lindy Hop 루틴입니다.',
    '역사적으로 Tranky Doo는 Frankie Manning이 Congaroos에 있을 때 안무했습니다.',
    'Swungover에 좋은 역사 글이 있고, Harri Heinila가 authenticjazzdance에 기원에 대한 여러 글을 남겼습니다.',
    'Frankie는 이후 현재 Frankie Doo로 알려진 변형도 만들었습니다.',
    '원래는 Tuxedo Junction에 맞춰 추었고, 현재는 Dipsy Doodle에도 자주 춥니다.',
    'Wikipedia와 간단한 개요 자료도 참고할 수 있습니다.',
  ].join('\n'),
  trickeration: [
    'Trickeration입니다.',
    'Norma Miller가 안무한 루틴입니다.',
    '전 세계 린디하퍼들에게 익숙하지만 도전적인 루틴으로 자리 잡았습니다.',
    'Norma의 댄스 troupe 오디션 안무로 사용되었다는 이야기도 있습니다.',
    '공연에 쓰이는 곡으로는 Catherine Russell의 “I’m Shooting High”(느린 편), Count Basie의 “Jive at Five”, Hot Baked Goods의 약간 느린 버전, Glenn Crytzer의 약간 빠른 버전 등이 있습니다.',
  ].join('\n'),
};

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const dumpJson = args.has('--json');

function cleanText(value = '') {
  let text = String(value).replace(/\s+/g, ' ').trim();

  if (/[âÃÂ]/.test(text)) {
    const fixed = Buffer.from(text, 'latin1').toString('utf8');
    if (!/[\u0000-\u001f]/.test(fixed)) text = fixed;
  }

  return text.replace(/\s+([,.!?;:])/g, '$1').trim();
}

function trimDescription(value, maxLength = 900) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function safeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function slugFromUrl(url) {
  const slug = safeSlug(new URL(url).pathname.split('/').filter(Boolean).at(-1));
  return slug || crypto.createHash('sha1').update(url).digest('hex').slice(0, 12);
}

function stripYouTubeSuffix(value) {
  return cleanText(value).replace(/\s+-\s+YouTube\s+(Video|Playlist)$/i, '');
}

function stripTrailingSlash(pathname) {
  return pathname.replace(/\/+$/, '');
}

function parseYouTubeUrl(value) {
  const url = new URL(value);
  const host = url.hostname.replace(/^www\./, '').toLowerCase();
  let videoId = '';
  let mediaType = 'video';

  if (host === 'youtu.be') {
    videoId = stripTrailingSlash(url.pathname).split('/').filter(Boolean)[0] || '';
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const parts = stripTrailingSlash(url.pathname).split('/').filter(Boolean);
    const listId = url.searchParams.get('list') || '';
    if (listId && (parts[0] === 'watch' || parts[0] === 'playlist' || parts[1] === 'videoseries')) {
      const coverVideoId = url.searchParams.get('v') || '';
      return {
        platform: 'youtube',
        media_type: 'playlist',
        normalized_url: `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`,
        external_id: listId,
        thumbnail_url: /^[a-zA-Z0-9_-]{6,}$/.test(coverVideoId) ? `https://i.ytimg.com/vi/${coverVideoId}/hqdefault.jpg` : null,
        embed_url: `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(listId)}`,
      };
    }

    if (parts[0] === 'watch') {
      videoId = url.searchParams.get('v') || '';
    } else if (parts[0] === 'shorts') {
      videoId = parts[1] || '';
      mediaType = 'shorts';
    } else if (parts[0] === 'embed') {
      videoId = parts[1] || '';
    }
  }

  if (!/^[a-zA-Z0-9_-]{6,}$/.test(videoId)) return null;

  return {
    platform: 'youtube',
    media_type: mediaType,
    normalized_url: mediaType === 'shorts'
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`,
    external_id: videoId,
    thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    embed_url: `https://www.youtube-nocookie.com/embed/${videoId}`,
  };
}

async function fetchDocument(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'SwingEnjoy SNS archive importer (+https://swingenjoy.com)',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const html = await response.text();
  return new JSDOM(html, { url }).window.document;
}

function extractRoutineDescription(article) {
  const parts = [];
  for (const child of article.children) {
    if (/^H2$/i.test(child.tagName) && /clips/i.test(child.textContent || '')) break;
    if (['SCRIPT', 'STYLE'].includes(child.tagName)) continue;

    const text = cleanText(child.textContent || '');
    if (text) parts.push(text);
  }
  return parts.join('\n');
}

function buildSearchText(row) {
  return [
    row.title,
    row.name,
    row.description,
    row.description_original,
    row.description_translated,
    row.source_name,
    row.source_url,
    row.source_repository_url,
    row.license_name,
    row.license_url,
    row.license_notice,
    row.adaptation_note,
    row.no_endorsement_notice,
    row.rights_note,
    row.author_name,
    row.collection_name,
    row.dance_genre,
    row.source_context,
    ...(row.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .slice(0, 2000);
}

function lindyLicenseMetadata(sourceUrl) {
  return {
    source_name: SOURCE_NAME,
    source_url: sourceUrl,
    source_repository_url: SOURCE_REPOSITORY_URL,
    license_name: LICENSE_NAME,
    license_url: LICENSE_URL,
    license_notice: LICENSE_NOTICE,
    adaptation_note: ADAPTATION_NOTE,
    no_endorsement_notice: NO_ENDORSEMENT_NOTICE,
    rights_note: RIGHTS_NOTE,
  };
}

function uniqueBy(items, getKey) {
  const seen = new Set();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeRoutines() {
  const index = await fetchDocument(ROUTINES_URL);
  const routineLinks = uniqueBy(
    Array.from(index.querySelectorAll('a[href]'))
      .map((anchor) => ({
        title: cleanText(anchor.textContent || '').replace(/\s+\d+\s+Clips\b.*$/i, ''),
        url: anchor.href,
      }))
      .filter((link) => link.url.includes('/routines/') && link.url !== ROUTINES_URL),
    (link) => link.url,
  );

  const routines = [];
  for (const link of routineLinks) {
    const doc = await fetchDocument(link.url);
    const article = doc.querySelector('.post-content') || doc.body;
    const title = cleanText(doc.querySelector('h1')?.textContent || link.title);
    const slug = slugFromUrl(link.url);
    const description = extractRoutineDescription(article);
    const videos = uniqueBy(
      Array.from(article.querySelectorAll('h3 a[href]'))
        .map((anchor) => ({
          title: stripYouTubeSuffix(anchor.textContent || ''),
          url: anchor.href,
        }))
        .filter((entry) => /(?:youtube\.com|youtu\.be)/i.test(entry.url))
        .map((entry) => ({
          ...entry,
          media: parseYouTubeUrl(entry.url),
        }))
        .filter((entry) => entry.media?.external_id),
      (entry) => `${entry.media.media_type}:${entry.media.external_id}`,
    );

    routines.push({
      slug,
      title,
      url: link.url,
      description,
      videos,
    });
  }

  return routines;
}

function playlistBase(now) {
  return {
    category: 'routine',
    dance_genre: '린디합',
    is_public: true,
    owner_id: 'system',
    created_by: 'system',
    created_by_name: IMPORTER_NAME,
    created_at: now,
    updated_at: now,
  };
}

function mediaBase(now) {
  return {
    archive_bucket: 'reference',
    dance_genre: '린디합',
    author_name: SOURCE_NAME,
    is_approved: true,
    created_by: 'system',
    created_by_name: IMPORTER_NAME,
    created_at: now,
    updated_at: now,
    approved_at: now,
    approved_by: 'system',
    published_at: null,
  };
}

function buildSourceLinkItem({
  id,
  title,
  sourceUrl,
  playlistId,
  collectionName,
  tags,
  now,
  translatedDescription,
  originalDescription,
}) {
  const row = {
    id,
    platform: 'other',
    media_type: 'link',
    title,
    url: sourceUrl,
    normalized_url: sourceUrl,
    external_id: null,
    description: translatedDescription,
    description_original: originalDescription,
    description_translated: translatedDescription,
    description_language: 'en',
    translation_language: 'ko',
    translation_source: TRANSLATION_SOURCE,
    ...lindyLicenseMetadata(sourceUrl),
    thumbnail_url: null,
    embed_url: null,
    tags,
    tags_text: tags.join(', '),
    playlist_id: playlistId,
    collection_name: collectionName,
    source_context: `Lindy Collection source page / ${collectionName}`,
    ...mediaBase(now),
  };
  row.search_text = buildSearchText(row);
  return row;
}

function buildRows(routines) {
  const now = new Date().toISOString();
  const playlistRows = [];
  const itemRows = [];
  const firstCover = routines.flatMap((routine) => routine.videos).find((entry) => entry.media?.thumbnail_url)?.media.thumbnail_url || null;
  const rootTranslatedDescription = [
    'Lindy Collection의 Routines 페이지를 기준으로 정리한 스윙/린디합 루틴 영상 아카이브입니다.',
    `출처: ${ROUTINES_URL}`,
    '원문 라이선스: Creative Commons BY-NC-SA 4.0',
  ].join('\n');
  const rootOriginalDescription = [
    'An archive of swing and Lindy Hop routine videos curated from the Lindy Collection Routines page.',
    `Source: ${ROUTINES_URL}`,
    'Original license: Creative Commons BY-NC-SA 4.0',
  ].join('\n');

  const rootPlaylist = {
    id: ROOT_PLAYLIST_ID,
    name: 'Lindy Collection: Routines',
    parent_id: null,
    description: rootTranslatedDescription,
    description_original: rootOriginalDescription,
    description_translated: rootTranslatedDescription,
    description_language: 'en',
    translation_language: 'ko',
    translation_source: TRANSLATION_SOURCE,
    ...lindyLicenseMetadata(ROUTINES_URL),
    tags: DEFAULT_TAGS,
    tags_text: DEFAULT_TAGS.join(', '),
    cover_url: firstCover,
    ...playlistBase(now),
  };
  rootPlaylist.search_text = buildSearchText(rootPlaylist);
  playlistRows.push(rootPlaylist);
  itemRows.push(buildSourceLinkItem({
    id: `${ROOT_PLAYLIST_ID}-source-link`,
    title: 'Lindy Collection: Routines 원본 사이트',
    sourceUrl: ROUTINES_URL,
    playlistId: ROOT_PLAYLIST_ID,
    collectionName: 'Lindy Collection: Routines',
    tags: DEFAULT_TAGS,
    now,
    translatedDescription: [
      'Lindy Collection Routines 원본 사이트 링크입니다.',
      `출처: ${ROUTINES_URL}`,
    ].join('\n'),
    originalDescription: [
      'Source link for the Lindy Collection Routines page.',
      `Source: ${ROUTINES_URL}`,
    ].join('\n'),
  }));

  for (const routine of routines) {
    const playlistId = `lindycollection-routine-${safeSlug(routine.slug)}`;
    const tags = uniqueBy([...DEFAULT_TAGS, routine.title, routine.slug.replace(/[_-]+/g, ' ')], (tag) => tag.toLowerCase());
    const coverUrl = routine.videos.find((entry) => entry.media?.thumbnail_url)?.media.thumbnail_url || null;
    const originalDescription = [
      trimDescription(routine.description),
      `Source: ${routine.url}`,
    ].filter(Boolean).join('\n\n');
    const translatedDescription = [
      trimDescription(ROUTINE_DESCRIPTION_TRANSLATIONS[routine.slug] || routine.description),
      `출처: ${routine.url}`,
    ].filter(Boolean).join('\n\n');
    const routinePlaylist = {
      id: playlistId,
      name: routine.title,
      parent_id: ROOT_PLAYLIST_ID,
      description: translatedDescription,
      description_original: originalDescription,
      description_translated: translatedDescription,
      description_language: 'en',
      translation_language: 'ko',
      translation_source: TRANSLATION_SOURCE,
      ...lindyLicenseMetadata(routine.url),
      tags,
      tags_text: tags.join(', '),
      cover_url: coverUrl,
      ...playlistBase(now),
    };
    routinePlaylist.search_text = buildSearchText(routinePlaylist);
    playlistRows.push(routinePlaylist);

    routine.videos.forEach((entry, index) => {
      const media = entry.media;
      const safeExternalId = safeSlug(media.external_id) || crypto.createHash('sha1').update(entry.url).digest('hex').slice(0, 16);
      const title = entry.title || `${routine.title} clip ${index + 1}`;
      const itemOriginalDescription = [
        `Clip listed under the "${routine.title}" routine in Lindy Collection.`,
        `Source: ${routine.url}`,
      ].join('\n');
      const itemTranslatedDescription = [
        `Lindy Collection의 "${routine.title}" 루틴 항목에 수록된 클립입니다.`,
        `원문: ${routine.url}`,
      ].join('\n');
      const row = {
        id: `lindycollection-${safeSlug(routine.slug)}-${media.media_type}-${safeExternalId}`,
        platform: media.platform,
        media_type: media.media_type,
        title,
        url: entry.url,
        normalized_url: media.normalized_url,
        external_id: media.external_id,
        description: itemTranslatedDescription,
        description_original: itemOriginalDescription,
        description_translated: itemTranslatedDescription,
        description_language: 'en',
        translation_language: 'ko',
        translation_source: TRANSLATION_SOURCE,
        thumbnail_url: media.thumbnail_url,
        embed_url: media.embed_url,
        tags,
        tags_text: tags.join(', '),
        playlist_id: playlistId,
        collection_name: routine.title,
        source_context: `Lindy Collection Routines / ${routine.title}`,
        ...mediaBase(now),
      };
      row.search_text = buildSearchText(row);
      itemRows.push(row);
    });
  }

  return { playlistRows, itemRows };
}

function toMysqlDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function createPool() {
  const missing = ['MYSQL_USER', 'MYSQL_PASSWORD'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    database: process.env.MYSQL_DATABASE || 'swingenjoy_app',
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    waitForConnections: true,
    connectionLimit: 3,
    charset: 'utf8mb4',
    timezone: '+09:00',
  });
}

async function upsertRows(tableName, rows) {
  if (!rows.length) return 0;
  const pool = createPool();
  try {
    for (const row of rows) {
      await pool.execute(
        `INSERT INTO generic_records (table_name, record_id, data_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           data_json = VALUES(data_json),
           updated_at = VALUES(updated_at),
           imported_at = CURRENT_TIMESTAMP`,
        [
          tableName,
          row.id,
          JSON.stringify(row),
          toMysqlDateTime(row.created_at),
          toMysqlDateTime(row.updated_at),
        ],
      );
    }
  } finally {
    await pool.end();
  }

  return rows.length;
}

async function deleteStaleRows(tableName, keepIds, prefix) {
  if (!keepIds.length) return 0;
  const pool = createPool();
  const placeholders = keepIds.map(() => '?').join(', ');
  try {
    const [result] = await pool.execute(
      `DELETE FROM generic_records
       WHERE table_name = ?
         AND record_id LIKE ?
         AND record_id NOT IN (${placeholders})`,
      [tableName, `${prefix}%`, ...keepIds],
    );
    return result.affectedRows || 0;
  } finally {
    await pool.end();
  }
}

async function main() {
  const routines = await scrapeRoutines();
  const { playlistRows, itemRows } = buildRows(routines);
  const summary = {
    source: ROUTINES_URL,
    apply: applyChanges,
    routines: routines.length,
    playlists: playlistRows.length,
    mediaItems: itemRows.length,
    routineMediaCounts: routines.map((routine) => ({
      title: routine.title,
      clips: routine.videos.length,
    })),
  };

  if (dumpJson) {
    console.log(JSON.stringify({ summary, playlists: playlistRows, items: itemRows }, null, 2));
    return;
  }

  console.log(JSON.stringify(summary, null, 2));

  if (!applyChanges) {
    console.log('Dry-run only. Re-run with --apply to write sns_media_playlists and sns_media_items.');
    return;
  }

  const playlistsWritten = await upsertRows('sns_media_playlists', playlistRows);
  const itemsWritten = await upsertRows('sns_media_items', itemRows);
  const stalePlaylistsDeleted = await deleteStaleRows('sns_media_playlists', playlistRows.map((row) => row.id), 'lindycollection-');
  const staleItemsDeleted = await deleteStaleRows('sns_media_items', itemRows.map((row) => row.id), 'lindycollection-');
  console.log(`Applied ${playlistsWritten} playlists and ${itemsWritten} media items. Removed ${stalePlaylistsDeleted} stale playlists and ${staleItemsDeleted} stale media items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
