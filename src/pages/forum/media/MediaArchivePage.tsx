import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import ImageCropModal from '../../../components/ImageCropModal';
import { createResizedImages } from '../../../utils/imageResize';
import {
  buildSearchText,
  mediaTypeLabel,
  normalizeTags,
  parseMediaUrl,
  platformLabel,
  type MediaPlatform,
  type SnsMediaItem,
  type SnsMediaPlaylist,
} from './mediaArchiveUtils';
import './mediaArchive.css';

declare global {
  interface Window {
    instgrm?: {
      Embeds?: {
        process?: () => void;
      };
    };
  }
}

const PAGE_SIZE = 18;
const MEDIA_ARCHIVE_PRESS_DELAY_MS = 140;
const GENRE_PRESETS = ['스윙', '린디합', '재즈', '발보아', '블루스', '탱고', '살사', '바차타'];
const DEFAULT_ARCHIVE_BUCKET = 'reference';
const LINDY_COLLECTION_SOURCE_NAME = 'The Lindy Collection';
const LINDY_COLLECTION_SITE_URL = 'https://www.lindycollection.com/';
const LINDY_COLLECTION_LICENSE_NAME = 'CC BY-NC-SA 4.0';
const LINDY_COLLECTION_LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-sa/4.0/';
const LINDY_COLLECTION_REPOSITORY_URL = 'https://github.com/lindycollection/www.lindycollection.com';
const LINDY_COLLECTION_DEFAULT_ADAPTATION_NOTE = '한국어 번역/요약 및 SwingEnjoy SNS 아카이브용 재구성';
const LINDY_COLLECTION_DEFAULT_NO_ENDORSEMENT = 'Lindy Collection의 공식 제휴 또는 보증을 의미하지 않습니다.';
const LINDY_COLLECTION_DEFAULT_RIGHTS_NOTE = '링크된 원본 영상은 각 게시자와 플랫폼의 권리 조건을 따릅니다.';
type MediaSearchSuggestion = {
  value: string;
  label: string;
  group: string;
  icon: string;
};
type MediaPlaybackProps = {
  playingItemId: string;
  onPlayItem: (itemId: string) => void;
};

const getDisplayName = (user: ReturnType<typeof useAuth>['user'], fallback?: string | null): string => {
  const metadataName = user?.user_metadata?.name;
  const metadataFullName = user?.user_metadata?.full_name;
  return (
    compactText(fallback) ||
    (typeof metadataName === 'string' ? compactText(metadataName) : '') ||
    (typeof metadataFullName === 'string' ? compactText(metadataFullName) : '') ||
    compactText(user?.email?.split('@')[0]) ||
    '사용자'
  );
};

const buildOrFilter = (term: string) => {
  const safe = term.trim().replace(/[(),]/g, ' ');
  if (!safe) return '';
  const pattern = `%${safe}%`;
  return [
    `title.ilike.${pattern}`,
    `description.ilike.${pattern}`,
    `author_name.ilike.${pattern}`,
    `tags_text.ilike.${pattern}`,
    `collection_name.ilike.${pattern}`,
    `search_text.ilike.${pattern}`,
  ].join(',');
};

const toInputDate = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const emptyForm = {
  url: '',
  title: '',
  description: '',
  authorName: '',
  thumbnailUrl: '',
  archiveBucket: DEFAULT_ARCHIVE_BUCKET,
  playlistId: '',
  newPlaylistName: '',
  newPlaylistParentId: '',
  collectionName: '',
  tags: '',
  danceGenre: '',
  sourceContext: '',
  publishedAt: '',
};

type MediaArchiveForm = typeof emptyForm;

const PENDING_MEDIA_DRAFT_KEY = 'swingenjoy:media-archive-pending-draft';
const PENDING_MEDIA_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const SHARE_TARGET_CACHE = 'rhythmjoy-share-targets-v1';
const SHARE_TARGET_PATH = '/__pwa-share-target/';
const MOBILE_SHARE_SOURCE_LABEL = '모바일 공유';
const DESKTOP_SHARE_SOURCE_LABEL = '데스크톱 공유';

interface PendingMediaDraft {
  form: MediaArchiveForm;
  savedAt: number;
  source: string;
}

interface RemoteMediaMetadata {
  title?: string | null;
  description?: string | null;
  image_url?: string | null;
  thumbnail_options?: Array<{ url?: string | null; source?: string | null; label?: string | null }>;
  thumbnailOptions?: Array<{ url?: string | null; source?: string | null; label?: string | null }>;
  author?: string | null;
  published?: string | null;
  publishedAt?: string | null;
  published_at?: string | null;
}

function normalizeMediaArchiveForm(value?: Partial<MediaArchiveForm> | null): MediaArchiveForm {
  return {
    url: compactText(value?.url),
    title: compactText(value?.title),
    description: trimText(value?.description),
    authorName: compactText(value?.authorName),
    thumbnailUrl: compactText(value?.thumbnailUrl),
    archiveBucket: compactText(value?.archiveBucket) || emptyForm.archiveBucket,
    playlistId: compactText(value?.playlistId),
    newPlaylistName: compactText(value?.newPlaylistName),
    newPlaylistParentId: compactText(value?.newPlaylistParentId),
    collectionName: compactText(value?.collectionName),
    tags: compactText(value?.tags),
    danceGenre: compactText(value?.danceGenre),
    sourceContext: compactText(value?.sourceContext),
    publishedAt: safeInputDate(value?.publishedAt),
  };
}

function hasUsefulDraft(form: MediaArchiveForm) {
  return Boolean(form.url || form.title || form.description);
}

function clearPendingMediaDraft() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PENDING_MEDIA_DRAFT_KEY);
  } catch {
    // Storage may be unavailable in private or embedded browser contexts.
  }
}

function savePendingMediaDraft(form: MediaArchiveForm, source: string) {
  if (typeof window === 'undefined' || !hasUsefulDraft(form)) return;
  const draft: PendingMediaDraft = {
    form: normalizeMediaArchiveForm(form),
    savedAt: Date.now(),
    source,
  };

  try {
    window.localStorage.setItem(PENDING_MEDIA_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Login can still continue; the draft just cannot be restored automatically.
  }
}

function readPendingMediaDraft(): PendingMediaDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_MEDIA_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingMediaDraft>;
    const savedAt = Number(parsed.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > PENDING_MEDIA_DRAFT_TTL_MS) {
      clearPendingMediaDraft();
      return null;
    }

    const form = normalizeMediaArchiveForm(parsed.form);
    if (!hasUsefulDraft(form)) {
      clearPendingMediaDraft();
      return null;
    }

    return {
      form,
      savedAt,
      source: compactText(parsed.source) || 'share',
    };
  } catch {
    clearPendingMediaDraft();
    return null;
  }
}

function safeImageUrl(value?: string | null) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^\/uploads\/[^\s"'<>]+$/i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function previewImageUrl(value?: string | null) {
  const trimmed = String(value || '').trim();
  if (/^data:image\//i.test(trimmed)) return trimmed;
  return safeImageUrl(trimmed);
}

function safeExternalUrl(value?: string | null) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function safeInputDate(value?: string | null) {
  const date = toInputDate(value);
  return date || '';
}

function compactText(value?: string | null) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimText(value?: string | null) {
  return String(value || '').trim();
}

function preventMediaArchiveDrag(event: React.DragEvent<HTMLElement>) {
  const target = event.target as HTMLElement | null;
  if (target?.closest('[data-media-drag-allowed="true"]')) return;
  event.preventDefault();
}

const TEXT_URL_RE = /https?:\/\/[^\s<>"']+/gi;

function splitTrailingUrlPunctuation(value: string) {
  const match = value.match(/^(.+?)([),.;!?]+)?$/);
  return {
    url: match?.[1] || value,
    suffix: match?.[2] || '',
  };
}

function renderTextWithLinks(value?: string | null) {
  const lines = String(value || '').split(/\r?\n/);
  const nodes: React.ReactNode[] = [];

  lines.forEach((line, lineIndex) => {
    let cursor = 0;
    Array.from(line.matchAll(TEXT_URL_RE)).forEach((match, matchIndex) => {
      const rawUrl = match[0];
      const start = match.index || 0;
      const { url, suffix } = splitTrailingUrlPunctuation(rawUrl);

      if (start > cursor) nodes.push(line.slice(cursor, start));
      nodes.push(
        <a
          key={`url:${lineIndex}:${matchIndex}:${url}`}
          href={url}
          target="_blank"
          rel="noreferrer"
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
        >
          {url}
        </a>,
      );
      if (suffix) nodes.push(suffix);
      cursor = start + rawUrl.length;
    });

    if (cursor < line.length) nodes.push(line.slice(cursor));
    if (lineIndex < lines.length - 1) nodes.push(<br key={`br:${lineIndex}`} />);
  });

  return nodes;
}

function extractFirstUrlMatching(value: string, predicate: (url: string) => boolean) {
  for (const match of value.matchAll(TEXT_URL_RE)) {
    const { url } = splitTrailingUrlPunctuation(match[0]);
    if (predicate(url)) return url;
  }
  return '';
}

function truncateText(value?: string | null, maxLength = 64) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
}

function createArchiveEntityId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const emptyPlaylistForm = {
  name: '',
  parentId: '',
  description: '',
  category: '',
  danceGenre: '',
  tags: '',
  coverUrl: '',
  isShortcut: false,
  shortcutUrl: '',
  isPublic: false,
};

type MediaPlaylistForm = typeof emptyPlaylistForm;

function playlistFormFromPlaylist(playlist: SnsMediaPlaylist): MediaPlaylistForm {
  return {
    name: compactText(playlist.name),
    parentId: compactText(playlist.parent_id),
    description: trimText(playlist.description),
    category: compactText(playlist.category),
    danceGenre: compactText(playlist.dance_genre),
    tags: (playlist.tags || []).join(', '),
    coverUrl: safeImageUrl(playlist.cover_url),
    isShortcut: Boolean(playlist.is_shortcut),
    shortcutUrl: safeExternalUrl(playlist.shortcut_url),
    isPublic: Boolean(playlist.is_public),
  };
}

function buildPlaylistSearchText(playlist: Partial<SnsMediaPlaylist>) {
  return [
    playlist.name,
    playlist.parent_id,
    playlist.description,
    playlist.description_original,
    playlist.description_translated,
    playlist.shortcut_url,
    playlist.source_name,
    playlist.source_url,
    playlist.source_repository_url,
    playlist.license_name,
    playlist.license_url,
    playlist.license_notice,
    playlist.adaptation_note,
    playlist.no_endorsement_notice,
    playlist.rights_note,
    playlist.category,
    playlist.dance_genre,
    ...(playlist.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeSuggestionValue(value?: string | null) {
  return compactText(value).toLowerCase();
}

function addMediaSearchSuggestion(
  target: Map<string, MediaSearchSuggestion>,
  value: string | null | undefined,
  group: string,
  icon: string,
  label = value,
) {
  const normalized = normalizeSuggestionValue(value);
  if (!normalized || target.has(`${group}:${normalized}`)) return;
  target.set(`${group}:${normalized}`, {
    value: compactText(value),
    label: compactText(label || value),
    group,
    icon,
  });
}

function getMediaArchiveSearchSuggestions(
  query: string,
  items: SnsMediaItem[],
  playlists: SnsMediaPlaylist[],
) {
  const term = normalizeSuggestionValue(query);
  if (!term) return [];

  const suggestions = new Map<string, MediaSearchSuggestion>();
  const matches = (value?: string | null) => normalizeSuggestionValue(value).includes(term);
  const maybeAdd = (value: string | null | undefined, group: string, icon: string, label = value) => {
    if (matches(value) || matches(label)) addMediaSearchSuggestion(suggestions, value, group, icon, label);
  };

  playlists.forEach((playlist) => {
    maybeAdd(playlist.name, '재생목록', 'ri-folder-3-line');
    maybeAdd(playlist.category, '분류', 'ri-price-tag-3-line');
    maybeAdd(playlist.dance_genre, '장르', 'ri-disc-line');
    (playlist.tags || []).forEach((tag) => maybeAdd(tag, '태그', 'ri-hashtag'));
  });

  items.forEach((item) => {
    maybeAdd(item.title, '제목', 'ri-film-line');
    maybeAdd(item.author_name, '작성자', 'ri-user-smile-line');
    maybeAdd(item.collection_name, '컬렉션', 'ri-stack-line');
    maybeAdd(item.dance_genre, '장르', 'ri-disc-line');
    (item.tags || []).forEach((tag) => maybeAdd(tag, '태그', 'ri-hashtag'));
    maybeAdd(mediaTypeLabel(item.media_type), '자료', 'ri-archive-drawer-line');
  });

  return Array.from(suggestions.values()).slice(0, 8);
}

function getFormCollectionName(form: MediaArchiveForm, playlists: SnsMediaPlaylist[], preferredPlaylist?: SnsMediaPlaylist | null) {
  const newPlaylistName = compactText(form.newPlaylistName);
  if (newPlaylistName) return newPlaylistName;
  const selectedPlaylist = preferredPlaylist || playlists.find((playlist) => playlist.id === form.playlistId);
  return compactText(selectedPlaylist?.name) || compactText(form.collectionName);
}

function getPlaylistParentId(playlist?: SnsMediaPlaylist | null) {
  return compactText(playlist?.parent_id);
}

function getPlaylistShortcutUrl(playlist?: SnsMediaPlaylist | null) {
  return playlist?.is_shortcut ? safeExternalUrl(playlist.shortcut_url) : '';
}

function isShortcutPlaylist(playlist?: SnsMediaPlaylist | null) {
  return Boolean(getPlaylistShortcutUrl(playlist));
}

function sortPlaylistsByName(playlists: SnsMediaPlaylist[]) {
  return [...playlists].sort((a, b) => compactText(a.name).localeCompare(compactText(b.name), 'ko'));
}

function getPlaylistPath(playlist: SnsMediaPlaylist, playlists: SnsMediaPlaylist[]) {
  const byId = new Map(playlists.map((entry) => [entry.id, entry]));
  const names: string[] = [];
  const seen = new Set<string>();
  let cursor: SnsMediaPlaylist | undefined = playlist;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    names.unshift(compactText(cursor.name) || '이름 없음');
    const parentId = getPlaylistParentId(cursor);
    cursor = parentId ? byId.get(parentId) : undefined;
  }

  return names.join(' / ');
}

function getPlaylistDepth(playlist: SnsMediaPlaylist, playlists: SnsMediaPlaylist[]) {
  const byId = new Map(playlists.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  let depth = 0;
  let cursor = playlist;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parentId = getPlaylistParentId(cursor);
    const parent = parentId ? byId.get(parentId) : null;
    if (!parent) break;
    depth += 1;
    cursor = parent;
  }

  return depth;
}

function playlistMatchesSearchQuery(playlist: SnsMediaPlaylist, query: string, playlists: SnsMediaPlaylist[]) {
  const term = normalizeSuggestionValue(query);
  if (!term) return false;

  return [
    playlist.name,
    playlist.description,
    playlist.description_original,
    playlist.description_translated,
    playlist.shortcut_url,
    playlist.source_name,
    playlist.source_url,
    playlist.source_repository_url,
    playlist.license_name,
    playlist.license_url,
    playlist.license_notice,
    playlist.adaptation_note,
    playlist.no_endorsement_notice,
    playlist.rights_note,
    playlist.category,
    playlist.dance_genre,
    playlist.tags_text,
    playlist.search_text,
    getPlaylistPath(playlist, playlists),
    ...(playlist.tags || []),
  ]
    .filter(Boolean)
    .some((value) => normalizeSuggestionValue(value).includes(term));
}

function getRelevantSearchPlaylists(searchQuery: string, items: SnsMediaItem[], playlists: SnsMediaPlaylist[]) {
  const term = normalizeSuggestionValue(searchQuery);
  if (!term) return [];

  const byId = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const relevantIds = new Set<string>();
  const directlyMatchedIds = new Set<string>();

  const addPlaylistBranch = (playlistId?: string | null, directMatch = false) => {
    let cursorId = compactText(playlistId);
    const seen = new Set<string>();

    while (cursorId && !seen.has(cursorId)) {
      seen.add(cursorId);
      const playlist = byId.get(cursorId);
      if (!playlist) break;
      relevantIds.add(playlist.id);
      if (directMatch) directlyMatchedIds.add(playlist.id);
      cursorId = getPlaylistParentId(playlist);
    }
  };

  items.forEach((item) => addPlaylistBranch(item.playlist_id));
  playlists.forEach((playlist) => {
    if (playlistMatchesSearchQuery(playlist, term, playlists)) {
      addPlaylistBranch(playlist.id, true);
    }
  });

  return Array.from(relevantIds)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .sort((a, b) => {
      const depthDiff = getPlaylistDepth(a, playlists) - getPlaylistDepth(b, playlists);
      if (depthDiff) return depthDiff;

      const aDirect = directlyMatchedIds.has(a.id);
      const bDirect = directlyMatchedIds.has(b.id);
      if (aDirect !== bDirect) return aDirect ? -1 : 1;

      const countDiff = getPlaylistBranchItems(b.id, items, playlists).length - getPlaylistBranchItems(a.id, items, playlists).length;
      if (countDiff) return countDiff;

      return getPlaylistPath(a, playlists).localeCompare(getPlaylistPath(b, playlists), 'ko');
    }) as SnsMediaPlaylist[];
}

function isPlaylistDescendant(playlistId: string, ancestorId: string, playlists: SnsMediaPlaylist[]) {
  if (!playlistId || !ancestorId) return false;
  const byId = new Map(playlists.map((entry) => [entry.id, entry]));
  const seen = new Set<string>();
  let cursor = byId.get(playlistId);

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    const parentId = getPlaylistParentId(cursor);
    if (parentId === ancestorId) return true;
    cursor = parentId ? byId.get(parentId) : undefined;
  }

  return false;
}

function buildPlaylistTreeOptions(playlists: SnsMediaPlaylist[], excludedId = '') {
  const allowed = playlists.filter((playlist) => (
    playlist.id !== excludedId &&
    !isShortcutPlaylist(playlist) &&
    !isPlaylistDescendant(playlist.id, excludedId, playlists)
  ));
  const byParent = new Map<string, SnsMediaPlaylist[]>();
  allowed.forEach((playlist) => {
    const parentId = getPlaylistParentId(playlist);
    const parentExists = parentId && allowed.some((entry) => entry.id === parentId);
    const key = parentExists ? parentId : '';
    byParent.set(key, [...(byParent.get(key) || []), playlist]);
  });

  const result: Array<{ playlist: SnsMediaPlaylist; depth: number; path: string }> = [];
  const visit = (parentId: string, depth: number, visited: Set<string>) => {
    const children = sortPlaylistsByName(byParent.get(parentId) || []);
    children.forEach((playlist) => {
      if (visited.has(playlist.id)) return;
      const nextVisited = new Set(visited);
      nextVisited.add(playlist.id);
      result.push({ playlist, depth, path: getPlaylistPath(playlist, playlists) });
      visit(playlist.id, depth + 1, nextVisited);
    });
  };

  visit('', 0, new Set());
  return result;
}

function extractFirstUrl(value?: string | null) {
  const text = compactText(value);
  if (!text) return '';
  const match = text.match(/https?:\/\/[^\s"'<>]+/i);
  if (!match) return '';
  return match[0].replace(/[),.?!\]]+$/, '');
}

function stripSharedUrl(value?: string | null, url?: string | null) {
  let text = compactText(value);
  const explicitUrl = compactText(url);
  if (explicitUrl) text = text.replace(explicitUrl, ' ');
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, ' ');
  return compactText(text);
}

async function readStoredShareTargetParams(shareId: string) {
  const safeShareId = String(shareId || '').replace(/[^a-z0-9-]/gi, '');
  if (!safeShareId || typeof window === 'undefined' || !('caches' in window)) return null;

  try {
    const cache = await window.caches.open(SHARE_TARGET_CACHE);
    const request = new Request(`${window.location.origin}${SHARE_TARGET_PATH}${safeShareId}`);
    const response = await cache.match(request);
    if (!response) return null;

    const payload = await response.json().catch(() => null) as {
      title?: string;
      text?: string;
      url?: string;
    } | null;
    await cache.delete(request);
    if (!payload) return null;

    const params = new URLSearchParams();
    if (payload.title) params.set('title', payload.title);
    if (payload.text) params.set('text', payload.text);
    if (payload.url) params.set('url', payload.url);
    params.set('source', MOBILE_SHARE_SOURCE_LABEL);
    return params;
  } catch (error) {
    console.warn('[MediaArchive] stored share payload read failed:', error);
    return null;
  }
}

function normalizeImportSource(value?: string | null) {
  const source = compactText(value);
  if (!source) return '';
  const normalized = source.toLowerCase();
  if (normalized.includes('android') || normalized.includes('mobile') || source.includes('모바일')) {
    return MOBILE_SHARE_SOURCE_LABEL;
  }
  if (
    normalized.includes('chrome') ||
    normalized.includes('desktop') ||
    normalized.includes('clipper') ||
    source.includes('데스크톱') ||
    source.includes('클리퍼')
  ) {
    return DESKTOP_SHARE_SOURCE_LABEL;
  }
  return source;
}

function getImportSourceContext(params: URLSearchParams, isShareTarget: boolean, previous?: string | null) {
  return normalizeImportSource(params.get('source')) ||
    normalizeImportSource(previous) ||
    (isShareTarget ? MOBILE_SHARE_SOURCE_LABEL : DESKTOP_SHARE_SOURCE_LABEL);
}

function getSharedMediaUrl(params: URLSearchParams) {
  return compactText(params.get('add')) ||
    compactText(params.get('url')) ||
    compactText(params.get('link')) ||
    extractFirstUrl(params.get('text')) ||
    extractFirstUrl(params.get('title'));
}

function isGenericImportedTitle(value?: string | null, platform?: MediaPlatform | null) {
  const title = compactText(value).toLowerCase();
  if (!title) return true;
  if (platform === 'instagram') {
    return ['instagram', 'instagram 게시물', 'reels', 'instagram reels', '인스타그램'].includes(title);
  }
  if (platform === 'youtube') {
    return ['youtube', 'youtube premium'].includes(title);
  }
  return false;
}

function deriveArchiveTitle(params: URLSearchParams, addUrl: string) {
  const media = parseMediaUrl(addUrl);
  const rawTitle = compactText(params.get('title'));
  const description = compactText(params.get('description') || params.get('text'));
  const author = compactText(params.get('author'));
  if (!isGenericImportedTitle(rawTitle, media?.platform)) return rawTitle;
  if (media?.platform === 'youtube') {
    const sharedText = truncateText(stripSharedUrl(description, addUrl), 90);
    if (sharedText && !isGenericImportedTitle(sharedText, media.platform)) return sharedText;
  }
  if (media?.platform === 'instagram') {
    const caption = truncateText(stripSharedUrl(description, addUrl), 68);
    if (author && caption) return `${author}: ${caption}`;
    if (caption) return caption;
    if (author) return `${author} Instagram`;
    return 'Instagram 게시물';
  }
  return rawTitle;
}

function buildImportedForm(prev: MediaArchiveForm, params: URLSearchParams, addUrl: string, isShareTarget: boolean) {
  const sharedDescription = params.get('description') || stripSharedUrl(params.get('text'), addUrl);
  const readFirstParam = (...keys: string[]) => {
    const key = keys.find((entry) => params.has(entry));
    return key ? params.get(key) || '' : null;
  };
  const playlistId = readFirstParam('playlistId', 'playlist', 'folderId') ?? prev.playlistId;
  const newPlaylistName = readFirstParam('newPlaylistName', 'new_playlist') ?? prev.newPlaylistName;
  const newPlaylistParentId = readFirstParam('newPlaylistParentId', 'new_playlist_parent') ?? prev.newPlaylistParentId;
  const collectionName = readFirstParam('collection') ?? prev.collectionName;
  return normalizeMediaArchiveForm({
    ...prev,
    url: addUrl,
    title: deriveArchiveTitle(params, addUrl) || prev.title,
    description: sharedDescription || prev.description,
    authorName: params.get('author') || prev.authorName,
    thumbnailUrl: safeImageUrl(params.get('thumbnail')) || prev.thumbnailUrl,
    archiveBucket: params.get('bucket') || prev.archiveBucket,
    playlistId: newPlaylistName ? '' : playlistId,
    newPlaylistName,
    newPlaylistParentId: newPlaylistName ? newPlaylistParentId : '',
    collectionName,
    tags: params.get('tags') || prev.tags,
    danceGenre: params.get('genre') || prev.danceGenre,
    publishedAt: safeInputDate(params.get('published')) || prev.publishedAt,
    sourceContext: getImportSourceContext(params, isShareTarget, prev.sourceContext),
  });
}

function getRemoteMetadataThumbnail(data: RemoteMediaMetadata) {
  const fromOptions = (data.thumbnail_options || data.thumbnailOptions || [])
    .map((option) => safeImageUrl(option?.url))
    .find(Boolean);
  return safeImageUrl(data.image_url) || fromOptions || '';
}

function getRemoteShortcutThumbnail(data: RemoteMediaMetadata) {
  const options = (data.thumbnail_options || data.thumbnailOptions || [])
    .map((option) => ({
      url: safeImageUrl(option?.url),
      source: compactText(option?.source).toLowerCase(),
    }))
    .filter((option) => option.url);
  const preferredSources = new Set(['direct-image', 'account-avatar', 'og-image', 'meta-image', 'json-ld', 'image-src', 'preload-image']);
  return (
    options.find((option) => preferredSources.has(option.source))?.url ||
    options.find((option) => option.source === 'screenshot')?.url ||
    options.find((option) => option.source === 'page-image')?.url ||
    safeImageUrl(data.image_url) ||
    options[0]?.url ||
    ''
  );
}

function isGeneratedShortcutCoverUrl(value?: string | null) {
  const url = compactText(value).toLowerCase();
  return (
    url.includes('image.thum.io/get/') ||
    url.includes('thum.io/get/') ||
    url.includes('s.wordpress.com/mshots/v1/')
  );
}

function getRemoteMetadataPublishedDate(data: RemoteMediaMetadata) {
  return safeInputDate(data.published || data.publishedAt || data.published_at);
}

function groupByKey(items: SnsMediaItem[], getKey: (item: SnsMediaItem) => string) {
  const groups = new Map<string, SnsMediaItem[]>();
  items.forEach((item) => {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return Array.from(groups.entries()).map(([key, groupItems]) => ({ key, items: groupItems }));
}

function createMediaArchiveId() {
  return createArchiveEntityId('media');
}

function createMediaPlaylistId() {
  return createArchiveEntityId('playlist');
}

function formFromMediaItem(item: SnsMediaItem): MediaArchiveForm {
  const displayDescription = (
    trimText(item.description_translated) ||
    trimText(item.description) ||
    trimText(item.description_original)
  );

  return normalizeMediaArchiveForm({
    url: item.url || item.normalized_url,
    title: item.title,
    description: displayDescription,
    authorName: item.author_name,
    thumbnailUrl: item.thumbnail_url,
    archiveBucket: item.archive_bucket || emptyForm.archiveBucket,
    playlistId: item.playlist_id,
    collectionName: item.collection_name,
    tags: (item.tags || []).join(', '),
    danceGenre: item.dance_genre,
    sourceContext: item.source_context,
    publishedAt: item.published_at,
  });
}

function loadInstagramScript() {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector<HTMLScriptElement>('script[src="//www.instagram.com/embed.js"], script[src="https://www.instagram.com/embed.js"]');
  if (!existing) {
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.instagram.com/embed.js';
    document.body.appendChild(script);
    script.onload = () => window.instgrm?.Embeds?.process?.();
    return;
  }
  window.instgrm?.Embeds?.process?.();
}

type YouTubePlayerCommand = {
  id: number;
  func: 'playVideo' | 'pauseVideo';
};

function getYouTubeEmbedUrl(url?: string | null, options: { autoplay?: boolean; minimalControls?: boolean } = {}) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (options.autoplay) parsed.searchParams.set('autoplay', '1');
    if (options.minimalControls) {
      parsed.searchParams.set('controls', '0');
      parsed.searchParams.set('disablekb', '1');
      parsed.searchParams.set('enablejsapi', '1');
      parsed.searchParams.set('fs', '0');
      parsed.searchParams.set('iv_load_policy', '3');
      parsed.searchParams.set('modestbranding', '1');
      parsed.searchParams.set('playsinline', '1');
      parsed.searchParams.set('rel', '0');
      if (typeof window !== 'undefined') {
        parsed.searchParams.set('origin', window.location.origin);
      }
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function postYouTubePlayerCommand(frame: HTMLIFrameElement | null, func: YouTubePlayerCommand['func']) {
  frame?.contentWindow?.postMessage(JSON.stringify({
    event: 'command',
    func,
    args: [],
  }), '*');
}

const MediaEmbed: React.FC<{
  item: SnsMediaItem;
  autoplay?: boolean;
  minimalControls?: boolean;
  playerCommand?: YouTubePlayerCommand | null;
}> = ({ item, autoplay = false, minimalControls = false, playerCommand = null }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (item.platform === 'instagram') {
      window.setTimeout(loadInstagramScript, 50);
    }
  }, [item.platform, item.id]);

  useEffect(() => {
    if (item.platform !== 'youtube' || !playerCommand) return;
    postYouTubePlayerCommand(frameRef.current, playerCommand.func);
  }, [item.platform, playerCommand]);

  if (item.platform === 'youtube' && item.embed_url) {
    return (
      <iframe
        ref={frameRef}
        className={`media-embed-frame ${minimalControls ? 'media-embed-frame--minimal' : ''}`}
        src={getYouTubeEmbedUrl(item.embed_url, { autoplay, minimalControls })}
        title={item.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  if (item.platform === 'instagram') {
    return (
      <div className="media-instagram-embed">
        <blockquote
          className="instagram-media"
          data-instgrm-permalink={item.normalized_url}
          data-instgrm-version="14"
        >
          <a href={item.normalized_url} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
            Instagram에서 보기
          </a>
        </blockquote>
      </div>
    );
  }

  return (
    <a className="media-link-fallback" href={item.normalized_url || item.url} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
      <i className="ri-external-link-line" />
      원본 열기
    </a>
  );
};

const MediaThumbnailImage: React.FC<{
  src?: string | null;
  alt?: string;
  loading?: 'lazy' | 'eager';
  fallbackIcon: string;
  fallbackClassName: string;
}> = ({ src, alt = '', loading, fallbackIcon, fallbackClassName }) => {
  const imageSrc = compactText(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageSrc]);

  if (!imageSrc || failed) {
    return (
      <span className={fallbackClassName}>
        <i className={fallbackIcon} />
      </span>
    );
  }

  return (
    <img
      src={imageSrc}
      alt={alt}
      loading={loading}
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
};

function getPlatformFallbackIcon(platform?: MediaPlatform | null) {
  if (platform === 'instagram') return 'ri-instagram-line';
  if (platform === 'youtube') return 'ri-youtube-line';
  return 'ri-link';
}

type TranslatableDescription = {
  id?: string | null;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  description_original?: string | null;
  description_translated?: string | null;
  translation_source?: string | null;
  author_name?: string | null;
  collection_name?: string | null;
  source_context?: string | null;
  source_name?: string | null;
  source_url?: string | null;
  source_repository_url?: string | null;
  license_name?: string | null;
  license_url?: string | null;
  license_notice?: string | null;
  adaptation_note?: string | null;
  no_endorsement_notice?: string | null;
  rights_note?: string | null;
  tags?: string[];
  tags_text?: string | null;
};

function normalizeDescriptionText(value?: string | null) {
  return compactText(value).toLowerCase();
}

const TranslatedDescription: React.FC<{
  value: TranslatableDescription;
  className: string;
}> = ({ value, className }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const translatedText = trimText(value.description_translated) || trimText(value.description);
  const originalText = trimText(value.description_original);
  const hasOriginal = Boolean(
    originalText &&
    normalizeDescriptionText(originalText) !== normalizeDescriptionText(translatedText),
  );
  const visibleText = hasOriginal && showOriginal ? originalText : translatedText || originalText;
  const hasVisibleText = Boolean(compactText(visibleText));
  const descriptionClasses = className.split(/\s+/).filter(Boolean);
  const isExpandableDescription = (
    descriptionClasses.includes('media-card-description') ||
    descriptionClasses.includes('media-mini-description')
  );
  const canExpand = hasVisibleText && isExpandableDescription && (visibleText.length > 180 || visibleText.includes('\n'));

  if (!hasVisibleText) return null;

  return (
    <div className={`media-translated-description ${className} ${expanded ? 'is-expanded' : ''}`}>
      <p className="media-translated-description-text">{renderTextWithLinks(visibleText)}</p>
      {canExpand && (
        <button
          type="button"
          className="media-description-toggle"
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
          onClick={() => setExpanded((current) => !current)}
        >
          <i className={expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} />
          {expanded ? '접기' : '자세히'}
        </button>
      )}
      {hasOriginal && (
        <button
          type="button"
          className="media-translation-toggle"
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
          onClick={() => setShowOriginal((current) => !current)}
        >
          <i className={showOriginal ? 'ri-translate-2' : 'ri-file-text-line'} />
          {showOriginal ? '번역 보기' : '번역원문보기'}
        </button>
      )}
    </div>
  );
};

function getLicenseDetectionText(value: TranslatableDescription) {
  return [
    value.id,
    value.title,
    value.name,
    value.description,
    value.description_original,
    value.description_translated,
    value.author_name,
    value.collection_name,
    value.source_context,
    value.source_name,
    value.source_url,
    value.license_name,
    value.license_url,
    value.tags_text,
    ...(value.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();
}

function isLindyCollectionEntry(value: TranslatableDescription) {
  const text = getLicenseDetectionText(value);
  return (
    text.includes('lindy collection') ||
    text.includes('lindycollection') ||
    text.includes('lindycollection.com')
  );
}

function getLindyCollectionSourceUrl(value: TranslatableDescription) {
  const metadataUrl = compactText(value.source_url);
  if (/^https?:\/\/(www\.)?lindycollection\.com\//i.test(metadataUrl)) return metadataUrl;

  return extractFirstUrlMatching(
    [
      value.description,
      value.description_translated,
      value.description_original,
      value.source_context,
    ].filter(Boolean).join('\n'),
    (url) => /^https?:\/\/(www\.)?lindycollection\.com\//i.test(url),
  ) || LINDY_COLLECTION_SITE_URL;
}

const LicenseAttributionNotice: React.FC<{
  value: TranslatableDescription;
  compact?: boolean;
}> = ({ value, compact = false }) => {
  const hasExplicitLicense = Boolean(compactText(value.license_name) || compactText(value.license_url));
  const isLindyEntry = isLindyCollectionEntry(value);
  if (!hasExplicitLicense && !isLindyEntry) return null;

  const sourceName = compactText(value.source_name) || (isLindyEntry ? LINDY_COLLECTION_SOURCE_NAME : '');
  const sourceUrl = sourceName ? getLindyCollectionSourceUrl(value) : compactText(value.source_url);
  const repositoryUrl = compactText(value.source_repository_url) || (isLindyEntry ? LINDY_COLLECTION_REPOSITORY_URL : '');
  const licenseName = compactText(value.license_name) || (isLindyEntry ? LINDY_COLLECTION_LICENSE_NAME : '');
  const licenseUrl = compactText(value.license_url) || (isLindyEntry ? LINDY_COLLECTION_LICENSE_URL : '');
  const hasTranslation = Boolean(
    compactText(value.translation_source) ||
    (
      trimText(value.description_original) &&
      normalizeDescriptionText(value.description_original) !== normalizeDescriptionText(value.description_translated || value.description)
    ),
  );
  const adaptationNote = compactText(value.adaptation_note) || (hasTranslation && isLindyEntry ? LINDY_COLLECTION_DEFAULT_ADAPTATION_NOTE : '');
  const noEndorsementNotice = compactText(value.no_endorsement_notice) || (isLindyEntry ? LINDY_COLLECTION_DEFAULT_NO_ENDORSEMENT : '');
  const rightsNote = compactText(value.rights_note) || (isLindyEntry ? LINDY_COLLECTION_DEFAULT_RIGHTS_NOTE : '');

  return (
    <aside className={`media-license-notice ${compact ? 'media-license-notice--compact' : ''}`} aria-label="라이선스 및 출처 정보">
      {sourceName && (
        <span>
          <i className="ri-links-line" />
          자료 출처:
          {' '}
          {sourceUrl ? (
            <a href={sourceUrl} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
              {sourceName}
            </a>
          ) : sourceName}
        </span>
      )}
      {licenseName && (
        <span>
          <i className="ri-creative-commons-line" />
          라이선스:
          {' '}
          {licenseUrl ? (
            <a href={licenseUrl} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
              {licenseName}
            </a>
          ) : licenseName}
        </span>
      )}
      {adaptationNote && (
        <span>
          <i className="ri-translate-2" />
          {adaptationNote}
        </span>
      )}
      {repositoryUrl && !compact && (
        <span>
          <i className="ri-github-line" />
          <a href={repositoryUrl} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
            원본 저장소
          </a>
        </span>
      )}
      {noEndorsementNotice && (
        <span>
          <i className="ri-shield-check-line" />
          {noEndorsementNotice}
        </span>
      )}
      {rightsNote && !compact && (
        <span>
          <i className="ri-information-line" />
          {rightsNote}
        </span>
      )}
    </aside>
  );
};

const MediaCard: React.FC<{
  item: SnsMediaItem;
  canManage: boolean;
  onEdit: (item: SnsMediaItem) => void;
  onApprove: (item: SnsMediaItem) => void;
  onDelete: (item: SnsMediaItem) => void;
} & MediaPlaybackProps> = ({ item, canManage, onEdit, onApprove, onDelete, playingItemId, onPlayItem }) => {
  const expanded = playingItemId === item.id;
  const dateLabel = item.published_at || item.created_at;
  const originalUrl = item.normalized_url || item.url;
  const handlePreviewClick = () => {
    if (item.platform === 'instagram' || item.platform === 'other') {
      window.open(originalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    onPlayItem(item.id);
  };

  return (
    <article className={`media-card media-card--${item.platform} ${!item.is_approved ? 'is-pending' : ''}`}>
      <div className="media-preview">
        {expanded ? (
          <MediaEmbed item={item} autoplay />
        ) : (
          <button className="media-preview-button" type="button" onClick={handlePreviewClick}>
            <MediaThumbnailImage
              src={item.thumbnail_url}
              loading="lazy"
              fallbackIcon={item.platform === 'instagram' ? 'ri-instagram-line' : 'ri-play-circle-line'}
              fallbackClassName="media-preview-placeholder"
            />
            <span className="media-play">
              <i className={item.platform === 'instagram' || item.platform === 'other' ? 'ri-external-link-line' : 'ri-play-fill'} />
            </span>
          </button>
        )}
      </div>

      <div className="media-card-body">
        <div className="media-card-meta">
          {item.collection_name && <span><i className="ri-folder-3-line" />{item.collection_name}</span>}
          <span>{platformLabel(item.platform)}</span>
          <span>{mediaTypeLabel(item.media_type)}</span>
          {!item.is_approved && <span className="media-pending-badge">대기</span>}
        </div>
        <h2>{item.title || '제목 없음'}</h2>
        <TranslatedDescription value={item} className="media-card-description" />
        <div className="media-card-info">
          {item.author_name && <span><i className="ri-user-smile-line" />{item.author_name}</span>}
          {item.dance_genre && <span><i className="ri-disc-line" />{item.dance_genre}</span>}
          {dateLabel && <span><i className="ri-calendar-line" />{toInputDate(dateLabel) || dateLabel}</span>}
        </div>
        {!!item.tags?.length && (
          <div className="media-tags">
            {item.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        )}
      </div>

      <div className="media-card-actions">
        {item.platform !== 'youtube' && (
          <a href={originalUrl} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
            <i className="ri-external-link-line" />
            원본
          </a>
        )}
        {canManage && (
          <button type="button" onClick={() => onEdit(item)}>
            <i className="ri-edit-2-line" />
            수정
          </button>
        )}
        {canManage && !item.is_approved && (
          <button type="button" onClick={() => onApprove(item)}>
            <i className="ri-check-line" />
            승인
          </button>
        )}
        {canManage && (
          <button type="button" className="danger" onClick={() => onDelete(item)}>
            <i className="ri-delete-bin-line" />
          </button>
        )}
      </div>
    </article>
  );
};

const MediaPreviewCard: React.FC<{ item: SnsMediaItem }> = ({ item }) => {
  const dateLabel = item.published_at || item.created_at;

  return (
    <article className={`media-card media-card--preview media-card--${item.platform}`}>
      <div className="media-preview">
        <div className="media-preview-button media-preview-button--static">
          <MediaThumbnailImage
            src={item.thumbnail_url}
            fallbackIcon={getPlatformFallbackIcon(item.platform)}
            fallbackClassName="media-preview-placeholder"
          />
          <span className="media-play">
            <i className={item.platform === 'youtube' ? 'ri-play-fill' : 'ri-external-link-line'} />
          </span>
        </div>
      </div>

      <div className="media-card-body">
        <div className="media-card-meta">
          {item.collection_name && <span><i className="ri-folder-3-line" />{item.collection_name}</span>}
          <span>{platformLabel(item.platform)}</span>
          <span>{mediaTypeLabel(item.media_type)}</span>
        </div>
        <h2>{item.title || '제목 없음'}</h2>
        <TranslatedDescription value={item} className="media-card-description" />
        <div className="media-card-info">
          {item.author_name && <span><i className="ri-user-smile-line" />{item.author_name}</span>}
          {item.dance_genre && <span><i className="ri-disc-line" />{item.dance_genre}</span>}
          {dateLabel && <span><i className="ri-calendar-line" />{toInputDate(dateLabel) || dateLabel}</span>}
        </div>
        {!!item.tags?.length && (
          <div className="media-tags">
            {item.tags.map((tag) => <span key={tag}>#{tag}</span>)}
          </div>
        )}
      </div>

      <div className="media-card-actions">
        <span className="media-preview-action"><i className="ri-external-link-line" />원본</span>
      </div>
    </article>
  );
};

const MediaModalFrame: React.FC<{
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ label, onClose, children }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      className="media-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      {children}
    </div>
  );
};

const MediaAddChoiceModal: React.FC<{
  onClose: () => void;
  onSelectMedia: () => void;
  onSelectPlaylist: () => void;
}> = ({ onClose, onSelectMedia, onSelectPlaylist }) => (
  <MediaModalFrame label="SNS 아카이브 추가" onClose={onClose}>
    <section className="media-add-choice-panel media-modal-panel">
      <header className="media-add-choice-header">
        <div>
          <p className="media-eyebrow">Add</p>
          <h2>무엇을 추가할까요?</h2>
        </div>
        <button type="button" className="media-icon-button" onClick={onClose} aria-label="추가 선택 닫기">
          <i className="ri-close-line" />
        </button>
      </header>
      <div className="media-add-choice-grid">
        <button type="button" onClick={onSelectMedia}>
          <i className="ri-film-line" />
          <span>
            <strong>개별 영상</strong>
            <small>YouTube, Instagram 게시물을 카드로 저장</small>
          </span>
        </button>
        <button type="button" onClick={onSelectPlaylist}>
          <i className="ri-folder-add-line" />
          <span>
            <strong>재생목록</strong>
            <small>영상을 담을 상위/하위 폴더 만들기</small>
          </span>
        </button>
      </div>
    </section>
  </MediaModalFrame>
);

const MediaItemEditPanel: React.FC<{
  item: SnsMediaItem;
  form: MediaArchiveForm;
  playlists: SnsMediaPlaylist[];
  availableGenres: string[];
  onChange: (form: MediaArchiveForm) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
}> = ({ item, form, playlists, availableGenres, onChange, onClose, onSubmit }) => {
  const playlistOptions = useMemo(() => buildPlaylistTreeOptions(playlists), [playlists]);
  const updateForm = (patch: Partial<MediaArchiveForm>) => onChange({ ...form, ...patch });
  const handlePlaylistChange = (playlistId: string) => {
    const playlist = playlists.find((entry) => entry.id === playlistId);
    updateForm({
      playlistId,
      newPlaylistName: '',
      newPlaylistParentId: '',
      collectionName: playlist ? playlist.name : form.collectionName,
    });
  };

  return (
    <MediaModalFrame label="SNS 카드 수정" onClose={onClose}>
      <form className="media-edit-panel media-modal-panel" onSubmit={onSubmit}>
        <header className="media-edit-header">
          <div>
            <p className="media-eyebrow">Edit Archive</p>
            <h2>{item.title || 'SNS 카드 수정'}</h2>
          </div>
          <button type="button" className="media-icon-button" onClick={onClose} aria-label="닫기">
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="media-field-grid">
          <label className="media-field media-field--wide">
            <span>URL</span>
            <input value={form.url} onChange={(event) => updateForm({ url: event.target.value })} required />
          </label>
          <label className="media-field">
            <span>제목</span>
            <input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} />
          </label>
          <label className="media-field">
            <span>작성자/채널</span>
            <input value={form.authorName} onChange={(event) => updateForm({ authorName: event.target.value })} />
          </label>
          <label className="media-field">
            <span>춤 장르</span>
            <input value={form.danceGenre} onChange={(event) => updateForm({ danceGenre: event.target.value })} list="media-edit-genre-presets" />
            <datalist id="media-edit-genre-presets">
              {availableGenres.map((genreName) => <option key={genreName} value={genreName} />)}
            </datalist>
          </label>
          <label className="media-field">
            <span>날짜</span>
            <input type="date" value={form.publishedAt} onChange={(event) => updateForm({ publishedAt: event.target.value })} />
          </label>
          <label className="media-field">
            <span>재생목록</span>
            <select value={form.playlistId} onChange={(event) => handlePlaylistChange(event.target.value)}>
              <option value="">선택 안 함</option>
              {playlistOptions.map(({ playlist, path }) => (
                <option key={playlist.id} value={playlist.id}>{path}</option>
              ))}
            </select>
          </label>
          <label className="media-field">
            <span>새 재생목록</span>
            <input
              value={form.newPlaylistName}
              onChange={(event) => updateForm({ newPlaylistName: event.target.value, playlistId: '' })}
              placeholder="바로 만들어 묶기"
            />
          </label>
          <label className="media-field media-field--wide">
            <span>새 재생목록 위치</span>
            <select
              value={form.newPlaylistParentId}
              onChange={(event) => updateForm({ newPlaylistParentId: event.target.value, playlistId: '' })}
            >
              <option value="">최상위</option>
              {playlistOptions.map(({ playlist, path }) => (
                <option key={playlist.id} value={playlist.id}>{path}</option>
              ))}
            </select>
          </label>
          <label className="media-field media-field--wide">
            <span>컬렉션 이름</span>
            <input
              value={form.collectionName}
              onChange={(event) => updateForm({ collectionName: event.target.value })}
              placeholder="재생목록을 쓰지 않는 임시 묶음 이름"
            />
          </label>
          <label className="media-field media-field--wide">
            <span>검색 태그</span>
            <input value={form.tags} onChange={(event) => updateForm({ tags: event.target.value })} />
          </label>
          <label className="media-field media-field--wide">
            <span>원본 설명 / 메모</span>
            <textarea value={form.description} onChange={(event) => updateForm({ description: event.target.value })} rows={4} />
          </label>
          <details className="media-advanced-fields">
            <summary>고급 정보</summary>
            <div className="media-field-grid">
              <label className="media-field media-field--wide">
                <span>썸네일 URL</span>
                <input value={form.thumbnailUrl} onChange={(event) => updateForm({ thumbnailUrl: event.target.value })} />
              </label>
              <label className="media-field media-field--wide">
                <span>출처 맥락</span>
                <input value={form.sourceContext} onChange={(event) => updateForm({ sourceContext: event.target.value })} />
              </label>
            </div>
          </details>
        </div>

        <div className="media-edit-actions">
          <button type="button" onClick={onClose}>취소</button>
          <button type="submit" className="media-save-button">
            <i className="ri-save-3-line" />
            수정 저장
          </button>
        </div>
      </form>
    </MediaModalFrame>
  );
};

const MediaMiniCard: React.FC<{
  item: SnsMediaItem;
  canManage?: boolean;
  onEdit?: (item: SnsMediaItem) => void;
} & MediaPlaybackProps> = ({ item, canManage = false, onEdit, playingItemId, onPlayItem }) => {
  const expanded = playingItemId === item.id;
  const [isPaused, setIsPaused] = useState(false);
  const [playerCommand, setPlayerCommand] = useState<YouTubePlayerCommand | null>(null);
  const metaText = [
    item.author_name,
    item.dance_genre,
    item.collection_name,
    platformLabel(item.platform),
  ].filter(Boolean).join(' · ');
  const originalUrl = item.normalized_url || item.url;
  const canEdit = canManage && Boolean(onEdit);

  useEffect(() => {
    if (expanded) setIsPaused(false);
  }, [expanded, item.id]);

  const sendPlayerCommand = (func: YouTubePlayerCommand['func']) => {
    setPlayerCommand({ id: Date.now(), func });
    setIsPaused(func === 'pauseVideo');
  };

  if (expanded) {
    return (
      <article className="media-mini-card media-mini-card--expanded is-playing">
        <div className="media-mini-player">
          <MediaEmbed item={item} autoplay minimalControls playerCommand={playerCommand} />
        </div>
        <div className="media-mini-expanded-footer">
          <span className="media-mini-copy">
            <strong>{item.title || '제목 없음'}</strong>
            <small>{metaText}</small>
          </span>
          <span className="media-mini-expanded-actions">
            {item.platform === 'youtube' && (
              <button
                type="button"
                className="media-mini-action-button"
                draggable={false}
                onDragStart={preventMediaArchiveDrag}
                onClick={() => sendPlayerCommand(isPaused ? 'playVideo' : 'pauseVideo')}
              >
                <i className={isPaused ? 'ri-play-fill' : 'ri-pause-fill'} />
                {isPaused ? '재생' : '일시정지'}
              </button>
            )}
            <button
              type="button"
              className="media-mini-action-button"
              draggable={false}
              onDragStart={preventMediaArchiveDrag}
              onClick={() => onPlayItem('')}
            >
              <i className="ri-close-line" />
              닫기
            </button>
            {originalUrl && (
              <a
                className="media-mini-action-button"
                href={originalUrl}
                target="_blank"
                rel="noreferrer"
                draggable={false}
                onDragStart={preventMediaArchiveDrag}
              >
                <i className="ri-youtube-line" />
                원본
              </a>
            )}
            {canEdit && (
              <button
                type="button"
                className="media-mini-edit-button"
                draggable={false}
                onDragStart={preventMediaArchiveDrag}
                onClick={() => onEdit?.(item)}
              >
                <i className="ri-edit-2-line" />
                수정
              </button>
            )}
          </span>
        </div>
        <TranslatedDescription value={item} className="media-mini-description" />
      </article>
    );
  }

  const handlePlay = () => {
    if (item.platform === 'instagram' || item.platform === 'other') {
      window.open(item.normalized_url || item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    onPlayItem(item.id);
  };

  return (
    <article className={`media-mini-card ${canEdit ? 'media-mini-card--editable' : ''}`}>
      <button
        className="media-mini-main-button"
        type="button"
        draggable={false}
        onDragStart={preventMediaArchiveDrag}
        onClick={handlePlay}
      >
        <span className="media-mini-thumb">
          <MediaThumbnailImage
            src={item.thumbnail_url}
            loading="lazy"
            fallbackIcon={getPlatformFallbackIcon(item.platform)}
            fallbackClassName="media-mini-thumb-placeholder"
          />
          <span className="media-play">
            <i className={item.platform === 'youtube' ? 'ri-play-fill' : 'ri-external-link-line'} />
          </span>
        </span>
        <span className="media-mini-copy">
          <strong>{item.title || '제목 없음'}</strong>
          <small>{metaText}</small>
        </span>
      </button>
      {canEdit && (
        <button
          type="button"
          className="media-mini-edit-button"
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
          onClick={() => onEdit?.(item)}
        >
          <i className="ri-edit-2-line" />
          수정
        </button>
      )}
      <TranslatedDescription value={item} className="media-mini-description" />
    </article>
  );
};

const ArchivePlacementPreview: React.FC<{ item: SnsMediaItem }> = ({ item }) => {
  const chips = [
    item.dance_genre ? { key: 'genre', icon: 'ri-disc-line', label: item.dance_genre } : null,
    item.collection_name ? { key: 'collection', icon: 'ri-folder-3-line', label: item.collection_name } : null,
    ...(item.tags || []).slice(0, 4).map((tag) => ({ key: `tag-${tag}`, icon: 'ri-price-tag-3-line', label: tag })),
  ].filter(Boolean) as Array<{ key: string; icon: string; label: string }>;

  if (!chips.length) return null;

  return (
    <div className="media-placement-preview">
      {chips.map((chip) => (
        <span key={chip.key}>
          <i className={chip.icon} />
          {chip.label}
        </span>
      ))}
    </div>
  );
};

const ModeEmptyState: React.FC<{ icon: string; title: string; detail: string }> = ({ icon, title, detail }) => (
  <div className="media-state media-state--empty">
    <i className={icon} />
    <strong>{title}</strong>
    <span>{detail}</span>
  </div>
);

interface LegacyArchiveGroup {
  key: string;
  title: string;
  items: SnsMediaItem[];
}

type MediaArchiveNavigationDirection = 'neutral' | 'forward' | 'back';

function getPlaylistChildren(parentId: string, playlists: SnsMediaPlaylist[]) {
  const playlistIds = new Set(playlists.map((playlist) => playlist.id));
  return sortPlaylistsByName(playlists.filter((playlist) => {
    const currentParentId = getPlaylistParentId(playlist);
    if (parentId) return currentParentId === parentId;
    return !currentParentId || !playlistIds.has(currentParentId);
  }));
}

function getPlaylistBranchIds(playlistId: string, playlists: SnsMediaPlaylist[]) {
  const ids = new Set<string>();
  const visit = (id: string) => {
    if (!id || ids.has(id)) return;
    ids.add(id);
    getPlaylistChildren(id, playlists).forEach((child) => visit(child.id));
  };
  visit(playlistId);
  return ids;
}

function getPlaylistBranchItems(playlistId: string, items: SnsMediaItem[], playlists: SnsMediaPlaylist[]) {
  const branchIds = getPlaylistBranchIds(playlistId, playlists);
  return items.filter((item) => item.playlist_id && branchIds.has(item.playlist_id));
}

function getPlaylistDirectItems(playlistId: string, items: SnsMediaItem[]) {
  return items.filter((item) => item.playlist_id === playlistId);
}

function getMediaItemCoverUrl(item: SnsMediaItem) {
  const parsed = parseMediaUrl(item.normalized_url || item.url || '');
  return safeImageUrl(item.thumbnail_url) || safeImageUrl(parsed?.thumbnail_url);
}

function getCoverUrls(mediaItems: SnsMediaItem[], coverUrl?: string | null) {
  const seen = new Set<string>();
  const urls = [safeImageUrl(coverUrl), ...mediaItems.map(getMediaItemCoverUrl)]
    .filter(Boolean)
    .filter((url) => {
      if (seen.has(url)) return false;
      seen.add(url);
      return true;
    });
  return urls.slice(0, 3);
}

function getPlaylistCoverUrls(playlist: SnsMediaPlaylist, items: SnsMediaItem[], playlists: SnsMediaPlaylist[]) {
  return getCoverUrls(getPlaylistBranchItems(playlist.id, items, playlists), playlist.cover_url);
}

function buildLegacyArchiveGroups(items: SnsMediaItem[], playlists: SnsMediaPlaylist[]) {
  const playlistIds = new Set(playlists.map((playlist) => playlist.id));
  return groupByKey(
    items.filter((item) => !item.playlist_id || !playlistIds.has(item.playlist_id)),
    (item) => compactText(item.collection_name) || '컬렉션 미지정',
  ).map((group) => ({
    key: `collection:${group.key}`,
    title: group.key,
    items: group.items,
  })).sort((a, b) => {
    if (a.title === '컬렉션 미지정') return 1;
    if (b.title === '컬렉션 미지정') return -1;
    return b.items.length - a.items.length || a.title.localeCompare(b.title, 'ko');
  });
}

function getPlaylistBreadcrumbs(playlist: SnsMediaPlaylist, playlists: SnsMediaPlaylist[]) {
  const byId = new Map(playlists.map((entry) => [entry.id, entry]));
  const crumbs: SnsMediaPlaylist[] = [];
  const seen = new Set<string>();
  let cursor: SnsMediaPlaylist | undefined = playlist;

  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    crumbs.unshift(cursor);
    const parentId = getPlaylistParentId(cursor);
    cursor = parentId ? byId.get(parentId) : undefined;
  }

  return crumbs;
}

function getItemLegacyGroupKey(item: SnsMediaItem) {
  return `collection:${compactText(item.collection_name) || '컬렉션 미지정'}`;
}

const CollectionArchiveView: React.FC<{
  items: SnsMediaItem[];
  playlists: SnsMediaPlaylist[];
  searchQuery: string;
  canManageItem: (item: SnsMediaItem) => boolean;
  canManagePlaylist: (playlist: SnsMediaPlaylist) => boolean;
  onEditItem: (item: SnsMediaItem) => void;
  onEditPlaylist: (playlist: SnsMediaPlaylist) => void;
  onMovePlaylist: (playlist: SnsMediaPlaylist, parentId: string) => Promise<boolean>;
} & MediaPlaybackProps> = ({
  items,
  playlists,
  searchQuery,
  canManageItem,
  canManagePlaylist,
  onEditItem,
  onEditPlaylist,
  onMovePlaylist,
  playingItemId,
  onPlayItem,
}) => {
  const [activePlaylistId, setActivePlaylistId] = useState('');
  const [activeLegacyKey, setActiveLegacyKey] = useState('');
  const [navigationDirection, setNavigationDirection] = useState<MediaArchiveNavigationDirection>('neutral');
  const [pressedRowKey, setPressedRowKey] = useState('');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [draggedPlaylistId, setDraggedPlaylistId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [dragPreview, setDragPreview] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const dragClickSuppressTimerRef = useRef<number | null>(null);
  const suppressPlaylistOpenRef = useRef(false);
  const pointerDragRef = useRef<{
    playlist: SnsMediaPlaylist;
    pointerId: number;
    startX: number;
    startY: number;
    previousUserSelect: string;
    dragging: boolean;
    cleanup: (() => void) | null;
  } | null>(null);
  const activePlaylist = playlists.find((playlist) => playlist.id === activePlaylistId) || null;
  const legacyGroups = useMemo(() => buildLegacyArchiveGroups(items, playlists), [items, playlists]);
  const activeLegacyGroup = legacyGroups.find((group) => group.key === activeLegacyKey) || null;
  const currentParentId = activePlaylist?.id || '';
  const isSearching = Boolean(compactText(searchQuery));
  const visiblePlaylists = useMemo(() => {
    const children = getPlaylistChildren(currentParentId, playlists);
    if (!isSearching) return children;
    return children.filter((playlist) => (
      isShortcutPlaylist(playlist) ||
      getPlaylistBranchItems(playlist.id, items, playlists).length > 0
    ));
  }, [currentParentId, isSearching, items, playlists]);
  const directItems = activePlaylist ? getPlaylistDirectItems(activePlaylist.id, items) : [];
  const breadcrumbs = activePlaylist ? getPlaylistBreadcrumbs(activePlaylist, playlists) : [];
  const uncategorizedLegacyGroups = legacyGroups.filter((group) => group.title === '컬렉션 미지정');
  const namedLegacyGroups = legacyGroups.filter((group) => group.title !== '컬렉션 미지정');
  const stackClassName = `media-library-stack media-library-stack--${navigationDirection}`;
  const playlistsById = useMemo(() => new Map(playlists.map((playlist) => [playlist.id, playlist])), [playlists]);
  const searchPlaylists = useMemo(
    () => getRelevantSearchPlaylists(searchQuery, items, playlists),
    [items, playlists, searchQuery],
  );

  useEffect(() => {
    if (activePlaylistId && !activePlaylist) {
      setNavigationDirection('back');
      setActivePlaylistId('');
    }
  }, [activePlaylist, activePlaylistId]);

  useEffect(() => {
    if (activeLegacyKey && !activeLegacyGroup) {
      setNavigationDirection('back');
      setActiveLegacyKey('');
    }
  }, [activeLegacyGroup, activeLegacyKey]);

  useEffect(() => {
    setNavigationDirection('neutral');
    setActivePlaylistId('');
    setActiveLegacyKey('');
    setIsOrganizing(false);
    setDraggedPlaylistId('');
    setDropTargetId('');
  }, [searchQuery]);

  useEffect(() => () => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    if (dragClickSuppressTimerRef.current) window.clearTimeout(dragClickSuppressTimerRef.current);
    if (pointerDragRef.current?.cleanup) pointerDragRef.current.cleanup();
  }, []);

  const openWithPressFeedback = (rowKey: string, navigate: () => void) => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    setPressedRowKey(rowKey);
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null;
      navigate();
      setPressedRowKey('');
    }, MEDIA_ARCHIVE_PRESS_DELAY_MS);
  };

  const handleRowKeyDown = (event: React.KeyboardEvent<HTMLElement>, rowKey: string, navigate: () => void) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    openWithPressFeedback(rowKey, navigate);
  };

  const navigateToPlaylist = (playlistId: string, direction: MediaArchiveNavigationDirection = 'forward') => {
    setNavigationDirection(direction);
    setActiveLegacyKey('');
    setActivePlaylistId(playlistId);
  };

  const navigateToRoot = () => {
    setNavigationDirection('back');
    setActivePlaylistId('');
    setActiveLegacyKey('');
  };

  const navigateToLegacyGroup = (groupKey: string) => {
    setNavigationDirection('forward');
    setActivePlaylistId('');
    setActiveLegacyKey(groupKey);
  };

  const getLegacyGroupDisplayTitle = (group: LegacyArchiveGroup) => (
    group.title === '컬렉션 미지정' ? '미분류' : group.title
  );

  const clearPlaylistDragState = () => {
    setDraggedPlaylistId('');
    setDropTargetId('');
    setDragPreview(null);
  };

  const keepPlaylistOpenSuppressed = () => {
    suppressPlaylistOpenRef.current = true;
    if (dragClickSuppressTimerRef.current) {
      window.clearTimeout(dragClickSuppressTimerRef.current);
    }
    dragClickSuppressTimerRef.current = window.setTimeout(() => {
      suppressPlaylistOpenRef.current = false;
      dragClickSuppressTimerRef.current = null;
    }, 180);
  };

  const getDraggedPlaylist = () => (
    draggedPlaylistId ? playlists.find((playlist) => playlist.id === draggedPlaylistId) || null : null
  );

  const canMovePlaylistInto = (source: SnsMediaPlaylist, target: SnsMediaPlaylist) => {
    if (source.id === target.id) return false;
    if (isShortcutPlaylist(target)) return false;
    if (isPlaylistDescendant(target.id, source.id, playlists)) return false;
    return true;
  };

  const canDropPlaylistInto = (target: SnsMediaPlaylist) => {
    const source = getDraggedPlaylist();
    if (!source) return false;
    return canMovePlaylistInto(source, target);
  };

  const canMovePlaylistToParent = (source: SnsMediaPlaylist, parentId: string) => {
    const nextParentId = compactText(parentId);
    if (source.id === nextParentId) return false;
    if (nextParentId && isPlaylistDescendant(nextParentId, source.id, playlists)) return false;
    if (getPlaylistParentId(source) === nextParentId) return false;
    return true;
  };

  const canDropPlaylistToParent = (parentId: string) => {
    const source = getDraggedPlaylist();
    if (!source) return false;
    return canMovePlaylistToParent(source, parentId);
  };

  const getDropTargetClassName = (targetKey: string, canDrop: boolean) => {
    if (dropTargetId !== targetKey) return '';
    return canDrop ? ' is-drop-target' : ' is-drop-blocked';
  };

  const getPointerDropCandidate = (source: SnsMediaPlaylist, x: number, y: number) => {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const playlistDropTarget = element?.closest('[data-media-playlist-drop-id]') as HTMLElement | null;
    if (playlistDropTarget) {
      const targetId = playlistDropTarget.dataset.mediaPlaylistDropId || '';
      const target = playlists.find((playlist) => playlist.id === targetId) || null;
      if (target) {
        return {
          type: 'playlist' as const,
          target,
          targetKey: target.id,
          canDrop: canMovePlaylistInto(source, target),
        };
      }
    }

    const parentDropTarget = element?.closest('[data-media-parent-drop-key]') as HTMLElement | null;
    if (parentDropTarget) {
      const parentId = parentDropTarget.dataset.mediaParentDropId || '';
      const targetKey = parentDropTarget.dataset.mediaParentDropKey || (parentId ? `path:${parentId}` : 'path:root');
      return {
        type: 'parent' as const,
        parentId,
        targetKey,
        canDrop: canMovePlaylistToParent(source, parentId),
      };
    }

    return null;
  };

  const handlePlaylistDragStart = (event: React.DragEvent<HTMLElement>, playlist: SnsMediaPlaylist) => {
    event.stopPropagation();
    if (!isOrganizing || !canManagePlaylist(playlist)) {
      event.preventDefault();
      return;
    }

    keepPlaylistOpenSuppressed();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', playlist.id);
    event.dataTransfer.setData('application/x-swingenjoy-playlist', playlist.id);
    setDraggedPlaylistId(playlist.id);
    setDropTargetId('');
  };

  const handlePlaylistDragEnd = () => {
    keepPlaylistOpenSuppressed();
    clearPlaylistDragState();
  };

  const handlePlaylistPointerDown = (event: React.PointerEvent<HTMLElement>, playlist: SnsMediaPlaylist) => {
    if (!isOrganizing || !canManagePlaylist(playlist)) return;
    if (event.pointerType !== 'mouse' || event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('.media-folder-inline-action, .media-folder-source-button')) return;

    event.preventDefault();
    event.stopPropagation();

    if (pointerDragRef.current?.cleanup) pointerDragRef.current.cleanup();

    const dragSession = {
      playlist,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previousUserSelect: document.body.style.userSelect,
      dragging: false,
      cleanup: null as (() => void) | null,
    };

    const finishPointerDrag = (upEvent?: PointerEvent, cancelled = false) => {
      const session = pointerDragRef.current;
      if (!session || session.pointerId !== dragSession.pointerId) return;

      const wasDragging = session.dragging;
      const candidate = !cancelled && upEvent && wasDragging
        ? getPointerDropCandidate(session.playlist, upEvent.clientX, upEvent.clientY)
        : null;

      if (session.cleanup) session.cleanup();
      document.body.style.userSelect = session.previousUserSelect;
      pointerDragRef.current = null;
      keepPlaylistOpenSuppressed();
      clearPlaylistDragState();

      if (!candidate?.canDrop) return;
      if (candidate.type === 'playlist') {
        void onMovePlaylist(session.playlist, candidate.target.id);
        return;
      }
      void onMovePlaylist(session.playlist, candidate.parentId);
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== dragSession.pointerId) return;
      const deltaX = moveEvent.clientX - dragSession.startX;
      const deltaY = moveEvent.clientY - dragSession.startY;
      const distance = Math.hypot(deltaX, deltaY);

      if (!dragSession.dragging && distance < 4) return;
      if (!dragSession.dragging) {
        dragSession.dragging = true;
        document.body.style.userSelect = 'none';
        keepPlaylistOpenSuppressed();
        setDraggedPlaylistId(playlist.id);
      }

      moveEvent.preventDefault();
      const candidate = getPointerDropCandidate(playlist, moveEvent.clientX, moveEvent.clientY);
      setDropTargetId(candidate?.targetKey || '');
      setDragPreview({
        id: playlist.id,
        label: playlist.name,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });
    };

    const handlePointerUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== dragSession.pointerId) return;
      upEvent.preventDefault();
      finishPointerDrag(upEvent);
    };

    const handlePointerCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== dragSession.pointerId) return;
      finishPointerDrag(cancelEvent, true);
    };

    dragSession.cleanup = () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('pointercancel', handlePointerCancel);
    };

    pointerDragRef.current = dragSession;
    document.addEventListener('pointermove', handlePointerMove, { passive: false });
    document.addEventListener('pointerup', handlePointerUp, { passive: false });
    document.addEventListener('pointercancel', handlePointerCancel, { passive: false });
  };

  const handlePlaylistDragOver = (event: React.DragEvent<HTMLElement>, target: SnsMediaPlaylist) => {
    if (!isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const canDrop = canDropPlaylistInto(target);
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none';
    setDropTargetId(target.id);
  };

  const handlePlaylistDropTargetLeave = (event: React.DragEvent<HTMLElement>, targetKey: string) => {
    const relatedTarget = event.relatedTarget as Node | null;
    if (relatedTarget && event.currentTarget.contains(relatedTarget)) return;
    setDropTargetId((current) => (current === targetKey ? '' : current));
  };

  const handlePlaylistDrop = async (event: React.DragEvent<HTMLElement>, target: SnsMediaPlaylist) => {
    if (!isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const source = getDraggedPlaylist();
    keepPlaylistOpenSuppressed();
    clearPlaylistDragState();
    if (!source) return;
    if (source.id === target.id || isPlaylistDescendant(target.id, source.id, playlists)) return;
    await onMovePlaylist(source, target.id);
  };

  const handlePlaylistParentDragOver = (event: React.DragEvent<HTMLElement>, parentId: string, targetKey: string) => {
    if (!isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const canDrop = canDropPlaylistToParent(parentId);
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none';
    setDropTargetId(targetKey);
  };

  const handlePlaylistParentDrop = async (event: React.DragEvent<HTMLElement>, parentId: string, targetKey: string) => {
    if (!isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const source = getDraggedPlaylist();
    const canDrop = canDropPlaylistToParent(parentId);
    keepPlaylistOpenSuppressed();
    clearPlaylistDragState();
    if (!source || !canDrop) return;
    await onMovePlaylist(source, targetKey === 'path:root' ? '' : parentId);
  };

  const renderOrganizeButton = () => (
    <button
      type="button"
      className={`media-folder-organize-button ${isOrganizing ? 'active' : ''}`}
      onClick={() => {
        clearPlaylistDragState();
        setIsOrganizing((current) => !current);
      }}
    >
      <i className={isOrganizing ? 'ri-check-line' : 'ri-drag-move-2-line'} />
      {isOrganizing ? '이동 완료' : '이동편집'}
    </button>
  );

  const renderOrganizeHint = () => (
    isOrganizing ? (
      <div className="media-folder-organize-hint">
        <i className="ri-drag-move-line" />
        재생목록을 잡고 다른 재생목록 위에 놓으면 그 안으로, 상단 경로에 놓으면 그 위치로 이동합니다.
      </div>
    ) : null
  );

  const renderFolderCover = (urls: string[], fallbackIcon: string, count: number, modifier = '') => (
    <span className={`media-folder-cover-stack ${modifier}`} aria-hidden="true">
      {urls.length ? urls.map((url, index) => (
        <span key={`${url}:${index}`} className={`media-folder-cover-card media-folder-cover-card--${index + 1}`}>
          <MediaThumbnailImage
            src={url}
            loading="lazy"
            fallbackIcon={fallbackIcon}
            fallbackClassName="media-folder-cover-image-fallback"
          />
        </span>
      )) : (
        <span className="media-folder-cover-empty">
          <i className={fallbackIcon} />
        </span>
      )}
      {count > 0 && <span className="media-folder-cover-count">{count}</span>}
    </span>
  );

  const renderPlaylistRow = (playlist: SnsMediaPlaylist) => {
    const rowKey = `playlist:${playlist.id}`;
    const childCount = getPlaylistChildren(playlist.id, playlists).length;
    const branchItems = getPlaylistBranchItems(playlist.id, items, playlists);
    const coverUrls = getPlaylistCoverUrls(playlist, items, playlists);
    const canManage = canManagePlaylist(playlist);
    const isDragging = draggedPlaylistId === playlist.id;
    const isDropTarget = dropTargetId === playlist.id;
    const canDrop = isDropTarget && canDropPlaylistInto(playlist);
    const shortcutUrl = getPlaylistShortcutUrl(playlist);
    const sourceUrl = compactText(playlist.source_url) || (isLindyCollectionEntry(playlist) ? getLindyCollectionSourceUrl(playlist) : '');
    const rowActionUrl = shortcutUrl || (!getPlaylistParentId(playlist) ? sourceUrl : '');
    const rowActionLabel = shortcutUrl ? '바로가기' : '원문';
    const rowSubtitle = shortcutUrl
      ? trimText(playlist.description)
      : `${branchItems.length}개 카드${childCount ? ` · ${childCount}개 하위` : ''}`;
    const metadata = [
      shortcutUrl ? '바로가기' : null,
      playlist.category,
      playlist.dance_genre,
      ...(playlist.tags || []).slice(0, 3),
    ].filter(Boolean) as string[];
    const openShortcut = () => {
      if (!shortcutUrl) return;
      window.open(shortcutUrl, '_blank', 'noopener,noreferrer');
    };

    return (
      <article key={playlist.id} className={`media-folder-row ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? (canDrop ? 'is-drop-target' : 'is-drop-blocked') : ''}`}>
        <div
          role="button"
          tabIndex={0}
          className={`media-folder-row-main ${isOrganizing && canManage ? 'is-organizable' : ''} ${pressedRowKey === rowKey ? 'is-pressing' : ''}`}
          draggable={false}
          data-media-drag-allowed={isOrganizing && canManage ? 'true' : undefined}
          data-media-playlist-drop-id={playlist.id}
          onClick={() => {
            if (isOrganizing || suppressPlaylistOpenRef.current) return;
            openWithPressFeedback(rowKey, shortcutUrl ? openShortcut : () => navigateToPlaylist(playlist.id, 'forward'));
          }}
          onKeyDown={(event) => handleRowKeyDown(event, rowKey, shortcutUrl ? openShortcut : () => navigateToPlaylist(playlist.id, 'forward'))}
          onPointerDown={(event) => handlePlaylistPointerDown(event, playlist)}
          onDragStart={(event) => handlePlaylistDragStart(event, playlist)}
          onDragEnd={handlePlaylistDragEnd}
          onDragOver={(event) => handlePlaylistDragOver(event, playlist)}
          onDragLeave={(event) => handlePlaylistDropTargetLeave(event, playlist.id)}
          onDrop={(event) => handlePlaylistDrop(event, playlist)}
        >
          {renderFolderCover(coverUrls, shortcutUrl ? 'ri-external-link-line' : 'ri-folder-3-line', branchItems.length)}
          <span className="media-folder-row-copy">
            <span className="media-folder-row-title">
              <strong>{playlist.name}</strong>
              {canManage && (
                <button
                  type="button"
                  className="media-folder-inline-action"
                  draggable={false}
                  onClick={(event) => {
                    event.stopPropagation();
                    onEditPlaylist(playlist);
                  }}
                  aria-label={`${playlist.name} 수정`}
                >
                  <i className="ri-edit-2-line" />
                </button>
              )}
            </span>
            {rowSubtitle && <small>{rowSubtitle}</small>}
            {!!metadata.length && (
              <span className="media-folder-row-tags">
                {metadata.map((entry) => <span key={entry}>{entry}</span>)}
              </span>
            )}
          </span>
          {rowActionUrl && (
            <button
              type="button"
              className="media-folder-source-button"
              draggable={false}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                window.open(rowActionUrl, '_blank', 'noopener,noreferrer');
              }}
              aria-label={`${playlist.name} ${rowActionLabel} 열기`}
            >
              <i className="ri-external-link-line" />
              <span>{rowActionLabel}</span>
            </button>
          )}
          {isOrganizing && canManage && (
            <span
              className="media-folder-drag-handle"
              aria-hidden="true"
            >
              <i className="ri-drag-move-line" />
            </span>
          )}
          <i className="ri-arrow-right-s-line" />
        </div>
      </article>
    );
  };

  const renderLegacyRow = (group: LegacyArchiveGroup) => {
    const rowKey = `legacy:${group.key}`;
    const isUncategorized = group.title === '컬렉션 미지정';
    const icon = isUncategorized ? 'ri-inbox-archive-line' : 'ri-stack-line';
    const title = getLegacyGroupDisplayTitle(group);
    const detail = isUncategorized ? '폴더 없음' : '기존 컬렉션';
    const coverUrls = getCoverUrls(group.items);

    return (
      <article key={group.key} className={`media-folder-row ${isUncategorized ? 'media-folder-row--uncategorized' : 'media-folder-row--legacy'}`}>
        <div
          role="button"
          tabIndex={0}
          className={`media-folder-row-main ${pressedRowKey === rowKey ? 'is-pressing' : ''}`}
          onClick={() => openWithPressFeedback(rowKey, () => navigateToLegacyGroup(group.key))}
          onKeyDown={(event) => handleRowKeyDown(event, rowKey, () => navigateToLegacyGroup(group.key))}
        >
          {renderFolderCover(coverUrls, icon, group.items.length)}
          <span className="media-folder-row-copy">
            <span className="media-folder-row-title">
              <strong>{title}</strong>
            </span>
            <small>{group.items.length}개 카드 · {detail}</small>
          </span>
          <i className="ri-arrow-right-s-line" />
        </div>
      </article>
    );
  };

  const renderFolderList = (children: React.ReactNode) => (
    <div className="media-folder-list">
      {children}
    </div>
  );

  const renderSectionHeader = (title: string, count: number) => (
    <header className="media-folder-section-header">
      <h3>{title}</h3>
      <span>{count}개</span>
    </header>
  );

  const renderPathTrail = () => (
    <div className="media-folder-path-trail">
      {breadcrumbs.map((crumb) => {
        const targetKey = `path:${crumb.id}`;
        const canDrop = canDropPlaylistToParent(crumb.id);
        return (
          <button
            key={crumb.id}
            type="button"
            className={`${crumb.id === activePlaylist?.id ? 'active' : ''}${getDropTargetClassName(targetKey, canDrop)}`}
            data-media-parent-drop-id={crumb.id}
            data-media-parent-drop-key={targetKey}
            onClick={() => navigateToPlaylist(crumb.id, 'back')}
            onDragOver={(event) => handlePlaylistParentDragOver(event, crumb.id, targetKey)}
            onDragLeave={(event) => handlePlaylistDropTargetLeave(event, targetKey)}
            onDrop={(event) => handlePlaylistParentDrop(event, crumb.id, targetKey)}
          >
            {crumb.name}
          </button>
        );
      })}
    </div>
  );

  const renderLibrarySection = (title: string, count: number, children: React.ReactNode, variant = '') => {
    if (!count) return null;
    return (
      <section className={`media-library-section ${variant ? `media-library-section--${variant}` : ''}`}>
        {renderSectionHeader(title, count)}
        {renderFolderList(children)}
      </section>
    );
  };

  const renderDragPreview = () => (
    dragPreview ? (
      <div
        className="media-folder-drag-preview"
        style={{ transform: `translate3d(${dragPreview.x + 12}px, ${dragPreview.y + 12}px, 0)` }}
      >
        <i className="ri-folder-transfer-line" />
        <span>{dragPreview.label}</span>
      </div>
    ) : null
  );

  const renderSearchResultItem = (item: SnsMediaItem) => {
    const playlist = item.playlist_id ? playlistsById.get(item.playlist_id) : null;
    const legacyKey = playlist ? '' : getItemLegacyGroupKey(item);
    const legacyGroup = legacyGroups.find((group) => group.key === legacyKey) || null;
    const locationLabel = playlist
      ? getPlaylistPath(playlist, playlists)
      : legacyGroup
        ? getLegacyGroupDisplayTitle(legacyGroup)
        : '미분류';
    const locationIcon = playlist ? 'ri-folder-3-line' : 'ri-stack-line';

    return (
      <article key={item.id} className="media-search-result-card">
        <MediaMiniCard item={item} playingItemId={playingItemId} onPlayItem={onPlayItem} />
        <button
          type="button"
          className="media-result-location-button"
          onClick={() => {
            if (playlist) {
              navigateToPlaylist(playlist.id, 'forward');
              return;
            }
            if (legacyGroup) navigateToLegacyGroup(legacyGroup.key);
          }}
          disabled={!playlist && !legacyGroup}
        >
          <i className={locationIcon} />
          <span>위치</span>
          <strong>{locationLabel}</strong>
          <i className="ri-arrow-right-s-line" />
        </button>
      </article>
    );
  };

  const renderSearchResults = () => (
    <section key="library-search" className={`media-library-view media-library-search-view ${stackClassName}`}>
      <header className="media-library-header media-library-search-header">
        <div>
          <p className="media-eyebrow">Search</p>
          <h2>검색 결과</h2>
          <span>{searchPlaylists.length}개 재생목록 · {items.length}개 카드 · 원래 위치로 바로 이동 가능</span>
        </div>
      </header>
      {!!searchPlaylists.length && (
        <section className="media-library-section media-library-section--search-playlists">
          {renderSectionHeader('재생목록', searchPlaylists.length)}
          {renderFolderList(searchPlaylists.map(renderPlaylistRow))}
        </section>
      )}
      {!!items.length && (
        <section className="media-library-section media-library-section--results">
          {renderSectionHeader('검색된 카드', items.length)}
          <div className="media-search-result-list">
            {items.map(renderSearchResultItem)}
          </div>
        </section>
      )}
      {!!namedLegacyGroups.length && (
        <section className="media-library-section media-library-section--related-legacy">
          {renderSectionHeader('관련 컬렉션', namedLegacyGroups.length)}
          {renderFolderList(namedLegacyGroups.map(renderLegacyRow))}
        </section>
      )}
      {!!uncategorizedLegacyGroups.length && (
        <section className="media-library-section media-library-section--uncategorized">
          {renderSectionHeader('미분류 결과', uncategorizedLegacyGroups.length)}
          {renderFolderList(uncategorizedLegacyGroups.map(renderLegacyRow))}
        </section>
      )}
    </section>
  );

  const renderActivePlaylist = () => {
    if (!activePlaylist) return null;
    const parentId = getPlaylistParentId(activePlaylist);
    const parentPlaylist = parentId ? playlists.find((playlist) => playlist.id === parentId) : null;
    const branchItems = getPlaylistBranchItems(activePlaylist.id, items, playlists);
    const upDropTargetKey = parentId ? `path:${parentId}` : 'path:root';
    const canDropToUpTarget = canDropPlaylistToParent(parentId);

    return (
      <section key={activePlaylist.id} className={`media-playlist-detail media-folder-room ${stackClassName}`}>
        <nav className="media-folder-path" aria-label="재생목록 경로">
          <button
            type="button"
            className={`media-folder-up-button${getDropTargetClassName(upDropTargetKey, canDropToUpTarget)}`}
            data-media-parent-drop-id={parentId}
            data-media-parent-drop-key={upDropTargetKey}
            onClick={() => navigateToPlaylist(parentId, 'back')}
            onDragOver={(event) => handlePlaylistParentDragOver(event, parentId, upDropTargetKey)}
            onDragLeave={(event) => handlePlaylistDropTargetLeave(event, upDropTargetKey)}
            onDrop={(event) => handlePlaylistParentDrop(event, parentId, upDropTargetKey)}
          >
            <i className="ri-arrow-left-line" />
            {parentPlaylist ? parentPlaylist.name : '최상위'}
          </button>
          {renderPathTrail()}
        </nav>
        <div className="media-playlist-detail-toolbar" aria-label={`${activePlaylist.name} 폴더 정보`}>
          <h2 className="media-visually-hidden">{activePlaylist.name}</h2>
          <div className="media-playlist-detail-stats">
            <span>
              <i className="ri-movie-2-line" />
              {branchItems.length}개 카드
            </span>
            <span>
              <i className="ri-folder-3-line" />
              {visiblePlaylists.length}개 하위
            </span>
          </div>
          <div className="media-playlist-detail-actions">
            {canManagePlaylist(activePlaylist) && (
              <button
                type="button"
                className="media-folder-organize-button media-folder-edit-button"
                onClick={() => onEditPlaylist(activePlaylist)}
                aria-label={`${activePlaylist.name} 수정`}
              >
                <i className="ri-edit-2-line" />
                폴더 수정
              </button>
            )}
            {renderOrganizeButton()}
          </div>
        </div>
        {renderOrganizeHint()}
        <TranslatedDescription value={activePlaylist} className="media-playlist-description" />
        <LicenseAttributionNotice value={activePlaylist} />
        {!!visiblePlaylists.length && (
          <section className="media-folder-section media-folder-section--children">
            {renderSectionHeader('하위 폴더', visiblePlaylists.length)}
            {renderFolderList(visiblePlaylists.map(renderPlaylistRow))}
          </section>
        )}
        {directItems.length ? (
          <section className="media-folder-section">
            {renderSectionHeader('영상 카드', directItems.length)}
            <div className="media-mini-list media-mini-list--detail">
              {directItems.map((item) => (
                <MediaMiniCard
                  key={item.id}
                  item={item}
                  canManage={canManageItem(item)}
                  onEdit={onEditItem}
                  playingItemId={playingItemId}
                  onPlayItem={onPlayItem}
                />
              ))}
            </div>
          </section>
        ) : !visiblePlaylists.length ? (
          <ModeEmptyState icon="ri-inbox-line" title="아직 카드가 없습니다" detail="카드를 수정하면서 이 폴더를 선택하면 여기에 모입니다." />
        ) : null}
        {renderDragPreview()}
      </section>
    );
  };

  if (activeLegacyGroup) {
    const isUncategorized = activeLegacyGroup.title === '컬렉션 미지정';
    return (
      <section key={activeLegacyGroup.key} className={`media-playlist-detail media-legacy-detail ${isUncategorized ? 'media-legacy-detail--uncategorized' : ''} ${stackClassName}`}>
        <header className="media-playlist-detail-header">
          <button type="button" className="media-icon-button" onClick={navigateToRoot} aria-label="재생목록 목록으로">
            <i className="ri-arrow-left-line" />
          </button>
          <div>
            <p className="media-eyebrow">{isUncategorized ? 'Unsorted' : 'Collection'}</p>
            <h2>{getLegacyGroupDisplayTitle(activeLegacyGroup)}</h2>
            <span>{activeLegacyGroup.items.length}개 카드</span>
          </div>
        </header>
        <div className="media-mini-grid media-mini-grid--detail">
          {activeLegacyGroup.items.map((item) => (
            <MediaMiniCard
              key={item.id}
              item={item}
              canManage={canManageItem(item)}
              onEdit={onEditItem}
              playingItemId={playingItemId}
              onPlayItem={onPlayItem}
            />
          ))}
        </div>
      </section>
    );
  }

  if (!activePlaylist && !visiblePlaylists.length && !legacyGroups.length) {
    return <ModeEmptyState icon="ri-folder-3-line" title="폴더가 없습니다" detail="댄스, 린디합, 패턴처럼 자유롭게 상위/하위 폴더를 만들 수 있습니다." />;
  }

  if (activePlaylist) {
    return renderActivePlaylist();
  }

  if (isSearching) {
    return renderSearchResults();
  }

  return (
    <section key="library-root" className={`media-library-view ${stackClassName}`}>
      <header className="media-library-header">
        <div>
          <p className="media-eyebrow">Library</p>
          <h2>재생목록</h2>
          <span>{visiblePlaylists.length}개 폴더 · {namedLegacyGroups.length}개 컬렉션 · {uncategorizedLegacyGroups.length}개 미분류</span>
        </div>
        {renderOrganizeButton()}
      </header>
      {renderOrganizeHint()}
      <div className="media-library-sections">
        {renderLibrarySection('폴더', visiblePlaylists.length, visiblePlaylists.map(renderPlaylistRow), 'folders')}
        {renderLibrarySection('기존 컬렉션', namedLegacyGroups.length, namedLegacyGroups.map(renderLegacyRow), 'legacy')}
        {renderLibrarySection('미분류', uncategorizedLegacyGroups.length, uncategorizedLegacyGroups.map(renderLegacyRow), 'uncategorized')}
      </div>
      {renderDragPreview()}
    </section>
  );
};

const MediaArchivePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, userProfile, signInWithKakao } = useAuth();
  const [items, setItems] = useState<SnsMediaItem[]>([]);
  const [suggestionItems, setSuggestionItems] = useState<SnsMediaItem[]>([]);
  const [playlists, setPlaylists] = useState<SnsMediaPlaylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [playingItemId, setPlayingItemId] = useState('');
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [highlightedSearchSuggestionIndex, setHighlightedSearchSuggestionIndex] = useState(-1);
  const [form, setForm] = useState(emptyForm);
  const [playlistForm, setPlaylistForm] = useState<MediaPlaylistForm>(emptyPlaylistForm);
  const [editingPlaylist, setEditingPlaylist] = useState<SnsMediaPlaylist | null>(null);
  const [editingItem, setEditingItem] = useState<SnsMediaItem | null>(null);
  const [editForm, setEditForm] = useState<MediaArchiveForm>(emptyForm);
  const [draftNotice, setDraftNotice] = useState('');
  const [parsed, setParsed] = useState(() => parseMediaUrl(''));
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [playlistMetadataLoading, setPlaylistMetadataLoading] = useState(false);
  const [playlistMetadataError, setPlaylistMetadataError] = useState('');
  const [playlistCoverFile, setPlaylistCoverFile] = useState<File | null>(null);
  const [playlistCoverTempSrc, setPlaylistCoverTempSrc] = useState<string | null>(null);
  const [isPlaylistCoverCropOpen, setIsPlaylistCoverCropOpen] = useState(false);
  const [playlistCoverLoadFailed, setPlaylistCoverLoadFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const playlistCoverFileInputRef = useRef<HTMLInputElement | null>(null);
  const clipperImportKeyRef = useRef('');
  const metadataFetchKeyRef = useRef('');
  const playlistMetadataFetchKeyRef = useRef('');
  const restoredDraftRef = useRef(false);

  const canCreate = Boolean(user);
  const searchSuggestions = useMemo(
    () => getMediaArchiveSearchSuggestions(query, suggestionItems.length ? suggestionItems : items, playlists),
    [items, playlists, query, suggestionItems],
  );
  const showSearchSuggestions = searchFocused && Boolean(compactText(query)) && searchSuggestions.length > 0;
  const handlePlayItem = useCallback((itemId: string) => {
    setPlayingItemId(itemId);
  }, []);

  const availableGenres = useMemo(() => {
    const fromItems = items.map((item) => item.dance_genre).filter(Boolean) as string[];
    const fromPlaylists = playlists.map((playlist) => playlist.dance_genre).filter(Boolean) as string[];
    return Array.from(new Set([...GENRE_PRESETS, ...fromItems, ...fromPlaylists])).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [items, playlists]);

  const playlistParentOptions = useMemo(
    () => buildPlaylistTreeOptions(playlists, editingPlaylist?.id || ''),
    [editingPlaylist?.id, playlists],
  );

  const playlistOptions = useMemo(() => buildPlaylistTreeOptions(playlists), [playlists]);

  const playlistCoverPreviewUrl = useMemo(
    () => previewImageUrl(playlistForm.coverUrl),
    [playlistForm.coverUrl],
  );

  const fetchPlaylistShortcutMetadata = useCallback(async (
    shortcutUrl: string,
    options: { replaceCover?: boolean; signal?: AbortSignal } = {},
  ) => {
    const normalizedShortcutUrl = safeExternalUrl(shortcutUrl);
    if (!normalizedShortcutUrl) return false;

    setPlaylistMetadataLoading(true);
    setPlaylistMetadataError('');
    try {
      const response = await fetch('/api/fetch-og-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalizedShortcutUrl }),
        signal: options.signal,
      });
      if (!response.ok) throw new Error(`metadata fetch failed: ${response.status}`);
      const data = (await response.json()) as RemoteMediaMetadata;

      const remoteTitle = compactText(data.title);
      const remoteDescription = trimText(data.description);
      const remoteThumbnail = getRemoteShortcutThumbnail(data);

      setPlaylistForm((prev) => {
        if (!prev.isShortcut || safeExternalUrl(prev.shortcutUrl) !== normalizedShortcutUrl) return prev;

        const next = { ...prev };
        let changed = false;

        if (remoteTitle && !compactText(next.name)) {
          next.name = remoteTitle;
          changed = true;
        }
        if (remoteDescription && !trimText(next.description)) {
          next.description = remoteDescription;
          changed = true;
        }
        if (remoteThumbnail) {
          const currentCover = compactText(next.coverUrl);
          const shouldReplaceCover = Boolean(
            options.replaceCover ||
            !previewImageUrl(currentCover) ||
            isGeneratedShortcutCoverUrl(currentCover)
          );
          if (shouldReplaceCover && currentCover !== remoteThumbnail) {
            next.coverUrl = remoteThumbnail;
            changed = true;
          }
        }

        return changed ? next : prev;
      });

      if (remoteThumbnail && options.replaceCover) {
        setPlaylistCoverFile(null);
        setPlaylistCoverLoadFailed(false);
      }
      if (!remoteThumbnail && options.replaceCover) {
        setPlaylistMetadataError('커버 후보를 찾지 못했습니다. 파일 업로드나 직접 URL 입력을 사용해주세요.');
      }
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('[MediaArchive] playlist metadata fetch failed:', error);
        setPlaylistMetadataError('사이트 커버를 가져오지 못했습니다. 파일 업로드나 직접 URL 입력을 사용해주세요.');
      }
      return false;
    } finally {
      if (!options.signal?.aborted) setPlaylistMetadataLoading(false);
    }
  }, []);

  const previewItem = useMemo<SnsMediaItem>(() => {
    const media = parsed || parseMediaUrl(form.url);
    const tags = normalizeTags(form.tags);
    const thumbnailUrl = safeImageUrl(form.thumbnailUrl) || media?.thumbnail_url || null;
    const now = new Date().toISOString();

    return {
      id: 'preview',
      platform: media?.platform || 'other',
      media_type: media?.media_type || 'link',
      title: form.title.trim() || (media ? `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}` : '제목 없음'),
      url: form.url.trim(),
      normalized_url: media?.normalized_url || form.url.trim(),
      external_id: media?.external_id || null,
      thumbnail_url: thumbnailUrl,
      embed_url: media?.embed_url || null,
      archive_bucket: form.archiveBucket,
      playlist_id: form.playlistId || null,
      collection_name: getFormCollectionName(form, playlists) || null,
      description: form.description.trim() || null,
      author_name: form.authorName.trim() || null,
      tags,
      tags_text: tags.join(', '),
      dance_genre: form.danceGenre.trim() || null,
      source_context: form.sourceContext.trim() || null,
      is_approved: true,
      created_at: now,
      updated_at: now,
      published_at: form.publishedAt || null,
      search_text: '',
    };
  }, [form, parsed, playlists]);

  const activeSearchQuery = compactText(submittedQuery);
  const hasSearchPlaylistResults = useMemo(
    () => Boolean(activeSearchQuery && getRelevantSearchPlaylists(activeSearchQuery, items, playlists).length),
    [activeSearchQuery, items, playlists],
  );

  const fetchItems = useCallback(async (nextPage = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      let request = cafe24
        .from('sns_media_items')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1);

      const orFilter = buildOrFilter(submittedQuery);
      if (orFilter) request = request.or(orFilter);

      const { data, error } = await request;
      if (error) throw error;
      const rows = (data || []) as SnsMediaItem[];
      setItems((prev) => append ? [...prev, ...rows] : rows);
      setPage(nextPage);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (error) {
      console.error('[MediaArchive] fetch failed:', error);
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [submittedQuery]);

  const fetchPlaylists = useCallback(async () => {
    setPlaylistsLoading(true);
    try {
      const { data, error } = await cafe24
        .from('sns_media_playlists')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setPlaylists((data || []) as SnsMediaPlaylist[]);
    } catch (error) {
      console.error('[MediaArchive] playlist fetch failed:', error);
      setPlaylists([]);
    } finally {
      setPlaylistsLoading(false);
    }
  }, []);

  const fetchSuggestionItems = useCallback(async () => {
    try {
      const { data, error } = await cafe24
        .from('sns_media_items')
        .select('*')
        .order('updated_at', { ascending: false })
        .range(0, 199);
      if (error) throw error;
      setSuggestionItems((data || []) as SnsMediaItem[]);
    } catch (error) {
      console.warn('[MediaArchive] search suggestion fetch failed:', error);
      setSuggestionItems([]);
    }
  }, []);

  useEffect(() => {
    fetchItems(0, false);
  }, [fetchItems]);

  useEffect(() => {
    const nextQuery = compactText(query);
    const timer = window.setTimeout(() => {
      setSubmittedQuery((prev) => (prev === nextQuery ? prev : nextQuery));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    fetchPlaylists();
  }, [fetchPlaylists]);

  useEffect(() => {
    fetchSuggestionItems();
  }, [fetchSuggestionItems]);

  useEffect(() => {
    setPlayingItemId('');
  }, [submittedQuery]);

  useEffect(() => {
    if (playingItemId && !items.some((item) => item.id === playingItemId)) {
      setPlayingItemId('');
    }
  }, [items, playingItemId]);

  useEffect(() => {
    setHighlightedSearchSuggestionIndex(-1);
  }, [query]);

  useEffect(() => {
    setPlaylistCoverLoadFailed(false);
  }, [playlistForm.coverUrl]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || loading || loadingMore) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        fetchItems(page + 1, true);
      }
    }, { rootMargin: '600px 0px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchItems, hasMore, loading, loadingMore, page]);

  useEffect(() => {
    setParsed(parseMediaUrl(form.url));
  }, [form.url]);

  useEffect(() => {
    const sourceUrl = compactText(form.url);
    const media = parseMediaUrl(sourceUrl);
    if (!showForm || !sourceUrl || !media) return undefined;

    const metadataUrl = media.normalized_url || sourceUrl;
    if (metadataFetchKeyRef.current === metadataUrl) return undefined;
    metadataFetchKeyRef.current = metadataUrl;

    const controller = new AbortController();
    let cancelled = false;
    setMetadataLoading(true);

    (async () => {
      try {
        const response = await fetch('/api/fetch-og-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: metadataUrl }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`metadata fetch failed: ${response.status}`);
        const data = (await response.json()) as RemoteMediaMetadata;
        if (cancelled) return;

        setForm((prev) => {
          const prevUrl = compactText(prev.url);
          const prevMedia = parseMediaUrl(prevUrl);
          const sameUrl = prevMedia?.normalized_url === metadataUrl || prevUrl === sourceUrl;
          if (!sameUrl) return prev;

          const next = { ...prev };
          const remoteTitle = compactText(data.title);
          const remoteDescription = trimText(data.description);
          const remoteThumbnail = getRemoteMetadataThumbnail(data);
          const remotePublished = getRemoteMetadataPublishedDate(data);
          let changed = false;

          if (
            remoteTitle &&
            !isGenericImportedTitle(remoteTitle, prevMedia?.platform) &&
            isGenericImportedTitle(next.title, prevMedia?.platform)
          ) {
            next.title = remoteTitle;
            changed = true;
          }
          if (remoteDescription && !trimText(next.description)) {
            next.description = remoteDescription;
            changed = true;
          }
          if (remoteThumbnail && prevMedia?.platform !== 'youtube' && !safeImageUrl(next.thumbnailUrl)) {
            next.thumbnailUrl = remoteThumbnail;
            changed = true;
          }
          if (data.author && !compactText(next.authorName)) {
            next.authorName = compactText(data.author);
            changed = true;
          }
          if (remotePublished && !next.publishedAt) {
            next.publishedAt = remotePublished;
            changed = true;
          }

          return changed ? normalizeMediaArchiveForm(next) : prev;
        });
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn('[MediaArchive] metadata fetch failed:', error);
        }
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [form.url, showForm]);

  useEffect(() => {
    const shortcutUrl = safeExternalUrl(playlistForm.shortcutUrl);
    if (!showPlaylistForm || !playlistForm.isShortcut || !shortcutUrl) return undefined;
    if (playlistMetadataFetchKeyRef.current === shortcutUrl) return undefined;
    playlistMetadataFetchKeyRef.current = shortcutUrl;

    const controller = new AbortController();
    void fetchPlaylistShortcutMetadata(shortcutUrl, { signal: controller.signal });

    return () => {
      controller.abort();
    };
  }, [fetchPlaylistShortcutMetadata, playlistForm.isShortcut, playlistForm.shortcutUrl, showPlaylistForm]);

  useEffect(() => {
    let cancelled = false;
    const searchParams = new URLSearchParams(location.search);
    const shareId = compactText(searchParams.get('share_id'));

    if (location.pathname.includes('/forum/media/share') && shareId) {
      (async () => {
        const params = await readStoredShareTargetParams(shareId);
        if (cancelled || !params) return;

        const addUrl = getSharedMediaUrl(params);
        if (!addUrl) return;
        const importKey = [
          shareId,
          addUrl,
          params.get('title') || '',
          params.get('text') || '',
        ].join(':');
        if (clipperImportKeyRef.current === importKey) return;
        clipperImportKeyRef.current = importKey;

        setShowAddChoice(false);
        setShowPlaylistForm(false);
        setShowForm(true);
        setDraftNotice('공유 등록으로 받은 내용을 임시 보관했습니다. 로그인 후에도 이어서 DB에 저장할 수 있습니다.');
        setForm((prev) => {
          const nextForm = buildImportedForm(prev, params, addUrl, true);
          savePendingMediaDraft(nextForm, 'mobile-share');
          return nextForm;
        });

        navigate('/forum/media', { replace: true });
      })();

      return () => {
        cancelled = true;
      };
    }

    const hashValue = location.hash.startsWith('#clipper?')
      ? location.hash.slice('#clipper?'.length)
      : location.hash.startsWith('#?')
        ? location.hash.slice(2)
        : '';
    const hashParams = new URLSearchParams(hashValue);
    const hasSearchImport = ['add', 'url', 'link', 'text', 'title'].some((key) => searchParams.has(key));
    const params = hasSearchImport ? searchParams : hashParams;
    const addUrl = getSharedMediaUrl(params);
    if (!addUrl) return;
    const isShareTarget = location.pathname.includes('/forum/media/share');

    const importKey = [
      addUrl,
      params.get('title') || '',
      params.get('text') || '',
      params.get('thumbnail') || '',
      params.get('author') || '',
      params.get('description') || '',
      params.get('collection') || '',
      params.get('playlistId') || params.get('playlist') || params.get('folderId') || '',
      params.get('newPlaylistName') || params.get('new_playlist') || '',
      params.get('newPlaylistParentId') || params.get('new_playlist_parent') || '',
    ].join(':');
    if (clipperImportKeyRef.current === importKey) return;
    clipperImportKeyRef.current = importKey;

    setShowAddChoice(false);
    setShowPlaylistForm(false);
    setShowForm(true);
    setDraftNotice(isShareTarget
      ? '공유 등록으로 받은 내용을 임시 보관했습니다. 로그인 후에도 이어서 DB에 저장할 수 있습니다.'
      : '데스크톱 공유 등록으로 받은 내용을 임시 보관했습니다. 저장 버튼을 누르면 DB에 저장됩니다.');
    setForm((prev) => {
      const nextForm = buildImportedForm(prev, params, addUrl, isShareTarget);
      savePendingMediaDraft(nextForm, isShareTarget ? 'mobile-share' : 'desktop-share');
      return nextForm;
    });

    navigate('/forum/media', { replace: true });
    return () => {
      cancelled = true;
    };
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (restoredDraftRef.current) return;
    const hasIncomingPayload = Boolean(location.search) || location.hash.startsWith('#clipper?') || location.hash.startsWith('#?');
    if (hasIncomingPayload) return;

    const draft = readPendingMediaDraft();
    if (!draft) return;
    restoredDraftRef.current = true;
    setShowAddChoice(false);
    setShowPlaylistForm(false);
    setShowForm(true);
    setForm(draft.form);
    setDraftNotice(user
      ? '이전에 공유한 내용을 다시 열었습니다. 저장 버튼을 누르면 DB에 저장됩니다.'
      : '공유 내용을 임시 보관 중입니다. 로그인 후 같은 내용으로 이어서 저장됩니다.');
  }, [location.hash, location.search, user]);

  const resetForm = () => {
    setForm(emptyForm);
    setParsed(null);
    setDraftNotice('');
    setMetadataLoading(false);
    metadataFetchKeyRef.current = '';
    clearPendingMediaDraft();
  };

  const closeMediaForm = () => {
    setShowForm(false);
    resetForm();
  };

  const openMediaForm = () => {
    setShowAddChoice(false);
    setShowPlaylistForm(false);
    resetPlaylistForm();
    setShowForm(true);
  };

  const resetPlaylistForm = () => {
    setPlaylistForm(emptyPlaylistForm);
    setEditingPlaylist(null);
    setPlaylistMetadataLoading(false);
    setPlaylistMetadataError('');
    setPlaylistCoverFile(null);
    setPlaylistCoverTempSrc(null);
    setIsPlaylistCoverCropOpen(false);
    setPlaylistCoverLoadFailed(false);
    if (playlistCoverFileInputRef.current) {
      playlistCoverFileInputRef.current.value = '';
    }
    playlistMetadataFetchKeyRef.current = '';
  };

  const closePlaylistForm = () => {
    setShowPlaylistForm(false);
    resetPlaylistForm();
  };

  const openPlaylistForm = () => {
    setShowAddChoice(false);
    if (showForm) closeMediaForm();
    setShowPlaylistForm(true);
  };

  const openAddChoice = () => {
    if (showForm) closeMediaForm();
    if (showPlaylistForm) closePlaylistForm();
    setEditingItem(null);
    setEditForm(emptyForm);
    setShowAddChoice(true);
  };

  const closeAddChoice = () => {
    setShowAddChoice(false);
  };

  const readPlaylistCoverFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일을 선택해주세요.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const imageSource = event.target?.result as string;
      setPlaylistCoverTempSrc(imageSource);
      setIsPlaylistCoverCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const handlePlaylistCoverFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) readPlaylistCoverFile(file);
    event.target.value = '';
  };

  const openPlaylistCoverEditor = () => {
    if (playlistCoverPreviewUrl) {
      setPlaylistCoverTempSrc(playlistCoverPreviewUrl);
      setIsPlaylistCoverCropOpen(true);
      return;
    }
    playlistCoverFileInputRef.current?.click();
  };

  const handlePlaylistCoverCropComplete = (croppedFile: File, croppedPreviewUrl: string) => {
    setPlaylistCoverFile(croppedFile);
    setPlaylistCoverTempSrc(croppedPreviewUrl);
    setPlaylistCoverLoadFailed(false);
    setPlaylistForm((prev) => ({ ...prev, coverUrl: croppedPreviewUrl }));
  };

  const uploadPlaylistCoverFile = async (playlistId: string, file: File) => {
    const resized = await createResizedImages(file, undefined, `playlist-cover-${playlistId}.jpg`);
    const variants = [
      ['micro', resized.micro],
      ['thumbnail', resized.thumbnail],
      ['medium', resized.medium],
      ['full', resized.full],
    ] as const;

    const uploadedUrls = await Promise.all(variants.map(async ([name, uploadFile]) => {
      const extension = uploadFile.name.split('.').pop() || 'webp';
      const path = `sns-media-playlists/${playlistId}/cover-${name}.${extension}`;
      const { error } = await cafe24.storage
        .from('images')
        .upload(path, uploadFile, { upsert: true, contentType: uploadFile.type });
      if (error) throw error;
      return [name, cafe24.storage.from('images').getPublicUrl(path).data.publicUrl] as const;
    }));

    const publicUrls = Object.fromEntries(uploadedUrls) as Record<typeof variants[number][0], string>;
    return publicUrls.medium || publicUrls.thumbnail || publicUrls.full || publicUrls.micro;
  };

  const canManagePlaylist = useCallback((playlist: SnsMediaPlaylist) => (
    Boolean(isAdmin || playlist.created_by === user?.id || playlist.owner_id === user?.id)
  ), [isAdmin, user?.id]);

  const canManageItem = useCallback((item: SnsMediaItem) => (
    Boolean(isAdmin || item.created_by === user?.id)
  ), [isAdmin, user?.id]);

  const savePlaylistFromForm = async (
    sourceForm: MediaPlaylistForm,
    existing?: SnsMediaPlaylist | null,
    coverFile?: File | null,
  ) => {
    if (!user) {
      await signInWithKakao();
      return null;
    }

    const name = compactText(sourceForm.name);
    if (!name) {
      alert('재생목록 이름을 입력해주세요.');
      return null;
    }

    const tags = normalizeTags(sourceForm.tags);
    const now = new Date().toISOString();
    const shortcutUrl = sourceForm.isShortcut ? safeExternalUrl(sourceForm.shortcutUrl) : '';
    if (sourceForm.isShortcut && !shortcutUrl) {
      alert('사이트 바로가기 URL을 http:// 또는 https:// 주소로 입력해주세요.');
      return null;
    }
    const playlistId = existing?.id || createMediaPlaylistId();
    const coverUrl = coverFile
      ? await uploadPlaylistCoverFile(playlistId, coverFile)
      : safeImageUrl(sourceForm.coverUrl) || null;
    const payload: Partial<SnsMediaPlaylist> = {
      id: playlistId,
      name,
      parent_id: compactText(sourceForm.parentId) || null,
      description: trimText(sourceForm.description) || null,
      category: compactText(sourceForm.category) || null,
      dance_genre: compactText(sourceForm.danceGenre) || null,
      tags,
      tags_text: tags.join(', '),
      cover_url: coverUrl,
      is_shortcut: Boolean(sourceForm.isShortcut),
      shortcut_url: shortcutUrl || null,
      is_public: Boolean(sourceForm.isPublic),
      owner_id: existing?.owner_id || user.id,
      created_by: existing?.created_by || user.id,
      created_by_name: existing?.created_by_name || getDisplayName(user, typeof userProfile?.nickname === 'string' ? userProfile.nickname : null),
      updated_at: now,
    };
    payload.search_text = buildPlaylistSearchText(payload).slice(0, 2000);

    const result = existing
      ? await cafe24.from('sns_media_playlists').update(payload).eq('id', existing.id)
      : await cafe24.from('sns_media_playlists').insert(payload);

    if (result.error) throw result.error;

    if (existing) {
      const relabelResult = await cafe24
        .from('sns_media_items')
        .update({ collection_name: name, updated_at: now })
        .eq('playlist_id', existing.id);
      if (relabelResult.error) {
        console.warn('[MediaArchive] playlist item relabel failed:', relabelResult.error);
      }
    }

    const saved = payload as SnsMediaPlaylist;
    setPlaylists((prev) => {
      const next = prev.filter((playlist) => playlist.id !== saved.id);
      return [saved, ...next];
    });
    return saved;
  };

  const handlePlaylistSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const saved = await savePlaylistFromForm(playlistForm, editingPlaylist, playlistCoverFile);
      if (!saved) return;
      setShowPlaylistForm(false);
      resetPlaylistForm();
      await fetchPlaylists();
      await fetchItems(0, false);
      await fetchSuggestionItems();
    } catch (error) {
      console.error('[MediaArchive] playlist save failed:', error);
      alert('재생목록 저장 중 오류가 발생했습니다.');
    }
  };

  const handleEditPlaylist = (playlist: SnsMediaPlaylist) => {
    setShowAddChoice(false);
    setShowForm(false);
    setEditingPlaylist(playlist);
    setPlaylistForm(playlistFormFromPlaylist(playlist));
    setShowPlaylistForm(true);
  };

  const handleMovePlaylist = useCallback(async (playlist: SnsMediaPlaylist, parentId: string) => {
    if (!user) {
      await signInWithKakao();
      return false;
    }

    if (!canManagePlaylist(playlist)) {
      alert('이 재생목록을 이동할 권한이 없습니다.');
      return false;
    }

    const nextParentId = compactText(parentId);
    if (nextParentId === playlist.id) return false;
    if (nextParentId && !playlists.some((entry) => entry.id === nextParentId)) {
      alert('이동할 재생목록을 찾을 수 없습니다.');
      return false;
    }
    if (nextParentId && isPlaylistDescendant(nextParentId, playlist.id, playlists)) {
      alert('자기 하위 재생목록 안으로는 이동할 수 없습니다.');
      return false;
    }
    if (getPlaylistParentId(playlist) === nextParentId) return false;

    const now = new Date().toISOString();
    const nextPlaylist: SnsMediaPlaylist = {
      ...playlist,
      parent_id: nextParentId || null,
      updated_at: now,
    };
    const payload: Partial<SnsMediaPlaylist> = {
      parent_id: nextPlaylist.parent_id,
      updated_at: now,
      search_text: buildPlaylistSearchText(nextPlaylist).slice(0, 2000),
    };

    setPlaylists((prev) => prev.map((entry) => (
      entry.id === playlist.id ? { ...entry, ...payload } : entry
    )));

    const { error } = await cafe24
      .from('sns_media_playlists')
      .update(payload)
      .eq('id', playlist.id);

    if (error) {
      console.error('[MediaArchive] playlist move failed:', error);
      alert('재생목록 이동 중 오류가 발생했습니다.');
      await fetchPlaylists();
      return false;
    }

    await fetchPlaylists();
    await fetchSuggestionItems();
    return true;
  }, [canManagePlaylist, fetchPlaylists, fetchSuggestionItems, playlists, signInWithKakao, user]);

  const resolveFormPlaylist = async (sourceForm: MediaArchiveForm) => {
    const newPlaylistName = compactText(sourceForm.newPlaylistName);
    if (newPlaylistName) {
      return savePlaylistFromForm({
        ...emptyPlaylistForm,
        name: newPlaylistName,
        parentId: compactText(sourceForm.newPlaylistParentId),
        category: compactText(sourceForm.collectionName),
        danceGenre: compactText(sourceForm.danceGenre),
        tags: sourceForm.tags,
      });
    }
    return playlists.find((playlist) => playlist.id === sourceForm.playlistId) || null;
  };

  const handleEditItem = (item: SnsMediaItem) => {
    setShowAddChoice(false);
    setShowForm(false);
    setShowPlaylistForm(false);
    resetPlaylistForm();
    setEditingItem(item);
    setEditForm(formFromMediaItem(item));
  };

  const handleItemEditSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingItem || !user) return;

    const media = parseMediaUrl(editForm.url);
    if (!media) {
      alert('유튜브나 인스타그램 URL을 확인해주세요.');
      return;
    }

    try {
      const playlist = await resolveFormPlaylist(editForm);
      const titleFallback = media.platform === 'instagram'
        ? truncateText(editForm.description, 68) || `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}`
        : `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}`;
      const title = isGenericImportedTitle(editForm.title, media.platform)
        ? titleFallback
        : editForm.title.trim() || titleFallback;
      const tags = normalizeTags(editForm.tags);
      const description = editForm.description.trim() || null;
      const payload: Partial<SnsMediaItem> = {
        ...media,
        title,
        url: editForm.url.trim(),
        description,
        author_name: editForm.authorName.trim() || null,
        thumbnail_url: safeImageUrl(editForm.thumbnailUrl) || media.thumbnail_url,
        tags,
        tags_text: tags.join(', '),
        archive_bucket: editForm.archiveBucket,
        playlist_id: playlist?.id || editForm.playlistId || null,
        collection_name: getFormCollectionName(editForm, playlists, playlist) || null,
        dance_genre: editForm.danceGenre.trim() || null,
        source_context: editForm.sourceContext.trim() || null,
        published_at: editForm.publishedAt || null,
        updated_at: new Date().toISOString(),
        search_text: '',
      };
      if (trimText(editingItem.description_translated) || trimText(editingItem.description_original)) {
        payload.description_translated = description;
      }
      payload.search_text = buildSearchText(payload).slice(0, 2000);

      const { error } = await cafe24
        .from('sns_media_items')
        .update(payload)
        .eq('id', editingItem.id);
      if (error) throw error;

      setEditingItem(null);
      setEditForm(emptyForm);
      await fetchPlaylists();
      await fetchItems(0, false);
      await fetchSuggestionItems();
    } catch (error) {
      console.error('[MediaArchive] item update failed:', error);
      alert('수정 저장 중 오류가 발생했습니다.');
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      savePendingMediaDraft(normalizeMediaArchiveForm(form), 'login-required');
      await signInWithKakao();
      return;
    }

    const media = parseMediaUrl(form.url);
    if (!media) {
      alert('유튜브나 인스타그램 URL을 확인해주세요.');
      return;
    }

    try {
      const playlist = await resolveFormPlaylist(form);
      const titleFallback = media.platform === 'instagram'
        ? truncateText(form.description, 68) || `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}`
        : `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}`;
      const title = isGenericImportedTitle(form.title, media.platform)
        ? titleFallback
        : form.title.trim() || titleFallback;
      const tags = normalizeTags(form.tags);
      const now = new Date().toISOString();
      const payload: Partial<SnsMediaItem> = {
        ...media,
        id: createMediaArchiveId(),
        title,
        url: form.url.trim(),
        description: form.description.trim() || null,
        author_name: form.authorName.trim() || null,
        thumbnail_url: safeImageUrl(form.thumbnailUrl) || media.thumbnail_url,
        tags,
        tags_text: tags.join(', '),
        archive_bucket: form.archiveBucket,
        playlist_id: playlist?.id || form.playlistId || null,
        collection_name: getFormCollectionName(form, playlists, playlist) || null,
        dance_genre: form.danceGenre.trim() || null,
        source_context: form.sourceContext.trim() || null,
        created_by: user.id,
        created_by_name: getDisplayName(user, userProfile?.nickname),
        published_at: form.publishedAt || null,
        updated_at: now,
        search_text: '',
      } as Partial<SnsMediaItem>;

      payload.search_text = buildSearchText(payload).slice(0, 2000);

      if (isAdmin) {
        payload.is_approved = true;
        payload.approved_at = now;
        payload.approved_by = user.id;
      }

      const { error } = await cafe24
        .from('sns_media_items')
        .insert(payload);
      if (error) throw error;
      resetForm();
      setShowForm(false);
      await fetchPlaylists();
      await fetchItems(0, false);
      await fetchSuggestionItems();
    } catch (error) {
      console.error('[MediaArchive] save failed:', error);
      alert('저장 중 오류가 발생했습니다.');
    }
  };

  const handleApprove = async (item: SnsMediaItem) => {
    if (!isAdmin || !user) return;
    const { error } = await cafe24
      .from('sns_media_items')
      .update({ is_approved: true, approved_at: new Date().toISOString(), approved_by: user.id })
      .eq('id', item.id);
    if (error) {
      alert('승인 중 오류가 발생했습니다.');
      return;
    }
    fetchItems(0, false);
    fetchSuggestionItems();
  };

  const handleDelete = async (item: SnsMediaItem) => {
    if (!confirm('이 영상을 아카이브에서 삭제할까요?')) return;
    const { error } = await cafe24.from('sns_media_items').delete().eq('id', item.id);
    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
      return;
    }
    fetchItems(0, false);
    fetchSuggestionItems();
  };

  const selectSearchSuggestion = (suggestion: MediaSearchSuggestion) => {
    setQuery(suggestion.value);
    setSubmittedQuery(suggestion.value);
    setSearchFocused(false);
    setHighlightedSearchSuggestionIndex(-1);
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSearchSuggestions) {
      if (event.key === 'Escape') setSearchFocused(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedSearchSuggestionIndex((current) => (
        current + 1 >= searchSuggestions.length ? 0 : current + 1
      ));
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedSearchSuggestionIndex((current) => (
        current <= 0 ? searchSuggestions.length - 1 : current - 1
      ));
      return;
    }

    if (event.key === 'Enter' && highlightedSearchSuggestionIndex >= 0) {
      event.preventDefault();
      const suggestion = searchSuggestions[highlightedSearchSuggestionIndex];
      if (suggestion) selectSearchSuggestion(suggestion);
      return;
    }

    if (event.key === 'Escape') {
      setSearchFocused(false);
      setHighlightedSearchSuggestionIndex(-1);
    }
  };

  const renderArchiveView = () => {
    return (
      <CollectionArchiveView
        items={items}
        playlists={playlists}
        searchQuery={activeSearchQuery}
        canManageItem={canManageItem}
        canManagePlaylist={canManagePlaylist}
        onEditItem={handleEditItem}
        onEditPlaylist={handleEditPlaylist}
        onMovePlaylist={handleMovePlaylist}
        playingItemId={playingItemId}
        onPlayItem={handlePlayItem}
      />
    );
  };

  return (
    <main className="media-archive-page" onDragStartCapture={preventMediaArchiveDrag}>
      <header className="media-archive-header">
        <button className="media-back-button" type="button" onClick={() => navigate('/')} aria-label="홈으로 이동">
          <i className="ri-arrow-left-line" />
        </button>
        <div>
          <p className="media-eyebrow">SNS Archive</p>
          <h1>SNS 영상 아카이브</h1>
          <p>유튜브, 인스타그램 Reels와 게시물을 모아 검색합니다.</p>
        </div>
        <div className="media-header-actions">
          <button className="media-add-button" type="button" onClick={openAddChoice}>
            <i className="ri-add-line" />
            <span>추가</span>
          </button>
        </div>
      </header>

      {showAddChoice && (
        <MediaAddChoiceModal
          onClose={closeAddChoice}
          onSelectMedia={openMediaForm}
          onSelectPlaylist={openPlaylistForm}
        />
      )}

      {showPlaylistForm && (
        <MediaModalFrame label={editingPlaylist ? '재생목록 수정' : '재생목록 추가'} onClose={closePlaylistForm}>
          <form className="media-playlist-panel media-modal-panel" onSubmit={handlePlaylistSubmit}>
            <header className="media-playlist-form-header">
              <div>
                <p className="media-eyebrow">Playlist</p>
                <h2>{editingPlaylist ? '재생목록 수정' : '재생목록 추가'}</h2>
              </div>
              <button type="button" className="media-icon-button" onClick={closePlaylistForm} aria-label="재생목록 폼 닫기">
                <i className="ri-close-line" />
              </button>
            </header>
            <div className="media-field-grid">
              <label className="media-field">
                <span>이름</span>
                <input
                  value={playlistForm.name}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="예: Lindy Hop 기본기"
                  required
                />
              </label>
              <label className="media-field">
                <span>상위 폴더</span>
                <select
                  value={playlistForm.parentId}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, parentId: event.target.value }))}
                >
                  <option value="">최상위</option>
                  {playlistParentOptions.map(({ playlist, path }) => (
                    <option key={playlist.id} value={playlist.id}>{path}</option>
                  ))}
                </select>
              </label>
              <label className="media-field">
                <span>분류</span>
                <input
                  value={playlistForm.category}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, category: event.target.value }))}
                  placeholder="예: 장르, 루틴, 공연, 역사"
                />
              </label>
              <label className="media-field">
                <span>춤 장르</span>
                <input
                  value={playlistForm.danceGenre}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, danceGenre: event.target.value }))}
                  list="media-playlist-genre-presets"
                />
                <datalist id="media-playlist-genre-presets">
                  {availableGenres.map((item) => <option key={item} value={item} />)}
                </datalist>
              </label>
              <div className="media-field media-field--wide media-playlist-cover-field">
                <span>커버 URL</span>
                <div className="media-cover-url-row">
                  <input
                    value={playlistForm.coverUrl}
                    onChange={(event) => {
                      setPlaylistCoverFile(null);
                      setPlaylistMetadataError('');
                      setPlaylistForm((prev) => ({ ...prev, coverUrl: event.target.value }));
                    }}
                    placeholder="비워두면 카드 썸네일을 사용"
                  />
                  <button
                    type="button"
                    className="media-ghost-button"
                    onClick={() => {
                      const shortcutUrl = safeExternalUrl(playlistForm.shortcutUrl);
                      if (!shortcutUrl) {
                        alert('먼저 바로가기 URL을 입력해주세요.');
                        return;
                      }
                      void fetchPlaylistShortcutMetadata(shortcutUrl, { replaceCover: true });
                    }}
                    disabled={!playlistForm.isShortcut || !safeExternalUrl(playlistForm.shortcutUrl) || playlistMetadataLoading}
                  >
                    <i className={playlistMetadataLoading ? 'ri-loader-4-line ri-spin' : 'ri-search-eye-line'} />
                    가져오기
                  </button>
                  <button
                    type="button"
                    className="media-ghost-button"
                    onClick={() => playlistCoverFileInputRef.current?.click()}
                  >
                    <i className="ri-upload-cloud-2-line" />
                    업로드
                  </button>
                  <button
                    type="button"
                    className="media-ghost-button"
                    onClick={openPlaylistCoverEditor}
                    disabled={!playlistCoverPreviewUrl}
                  >
                    <i className="ri-crop-2-line" />
                    편집
                  </button>
                  <button
                    type="button"
                    className="media-ghost-button"
                    onClick={() => {
                      setPlaylistCoverFile(null);
                      setPlaylistCoverTempSrc(null);
                      setPlaylistCoverLoadFailed(false);
                      setPlaylistForm((prev) => ({ ...prev, coverUrl: '' }));
                    }}
                    disabled={!compactText(playlistForm.coverUrl) && !playlistCoverFile}
                    aria-label="커버 지우기"
                  >
                    <i className="ri-close-line" />
                  </button>
                </div>
                <small className={`media-field-help ${playlistMetadataError ? 'media-field-help--error' : ''}`}>
                  {playlistMetadataError || (playlistMetadataLoading ? '사이트 제목과 커버 후보를 확인하는 중...' : '바로가기 커버가 깨지면 다시 가져오거나 업로드 후 편집하세요.')}
                </small>
                {(playlistCoverPreviewUrl || compactText(playlistForm.coverUrl)) && (
                  <div className={`media-cover-editor-preview ${playlistCoverLoadFailed ? 'is-broken' : ''}`}>
                    {playlistCoverPreviewUrl && !playlistCoverLoadFailed ? (
                      <img
                        src={playlistCoverPreviewUrl}
                        alt="카드 커버 미리보기"
                        draggable={false}
                        onDragStart={preventMediaArchiveDrag}
                        onError={() => setPlaylistCoverLoadFailed(true)}
                      />
                    ) : (
                      <span className="media-cover-editor-placeholder">
                        <i className="ri-image-line" />
                        <b>커버를 불러오지 못했습니다</b>
                      </span>
                    )}
                    <div className="media-cover-editor-actions">
                      <button type="button" onClick={() => playlistCoverFileInputRef.current?.click()}>
                        <i className="ri-upload-cloud-2-line" />
                        업로드
                      </button>
                      <button type="button" onClick={openPlaylistCoverEditor} disabled={!playlistCoverPreviewUrl}>
                        <i className="ri-crop-2-line" />
                        편집
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <label className="media-check-field">
                <input
                  type="checkbox"
                  checked={playlistForm.isShortcut}
                  onChange={(event) => setPlaylistForm((prev) => ({
                    ...prev,
                    isShortcut: event.target.checked,
                  }))}
                />
                <span>사이트 바로가기형 재생목록</span>
              </label>
              {playlistForm.isShortcut && (
                <label className="media-field media-field--wide">
                  <span>바로가기 URL</span>
                  <input
                    value={playlistForm.shortcutUrl}
                    onChange={(event) => setPlaylistForm((prev) => ({ ...prev, shortcutUrl: event.target.value }))}
                    placeholder="https://example.com"
                    required={playlistForm.isShortcut}
                  />
                  <small className="media-field-help">
                    {playlistMetadataLoading ? '사이트 제목과 썸네일을 확인하는 중...' : '저장 후 카드 클릭 시 이 사이트를 새 창으로 엽니다.'}
                  </small>
                </label>
              )}
              <label className="media-field media-field--wide">
                <span>태그</span>
                <input
                  value={playlistForm.tags}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, tags: event.target.value }))}
                  placeholder="예: 스윙아웃, 초급, 영감"
                />
              </label>
              <label className="media-field media-field--wide">
                <span>설명</span>
                <textarea
                  value={playlistForm.description}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, description: event.target.value }))}
                  rows={3}
                />
              </label>
              <label className="media-check-field">
                <input
                  type="checkbox"
                  checked={playlistForm.isPublic}
                  onChange={(event) => setPlaylistForm((prev) => ({ ...prev, isPublic: event.target.checked }))}
                />
                <span>공개 재생목록</span>
              </label>
            </div>
            <div className="media-edit-actions">
              <button type="button" onClick={closePlaylistForm}>취소</button>
              <button type="submit" className="media-save-button">
                <i className="ri-save-3-line" />
                {canCreate ? '저장' : '로그인 후 저장'}
              </button>
            </div>
            <input
              ref={playlistCoverFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handlePlaylistCoverFileSelect}
            />
            <ImageCropModal
              isOpen={isPlaylistCoverCropOpen}
              imageUrl={playlistCoverTempSrc}
              onClose={() => setIsPlaylistCoverCropOpen(false)}
              onCropComplete={handlePlaylistCoverCropComplete}
              onChangeImage={() => playlistCoverFileInputRef.current?.click()}
              onImageUpdate={readPlaylistCoverFile}
              fileName={`${compactText(playlistForm.name) || 'playlist-cover'}.jpg`}
              originalImageUrl={playlistCoverTempSrc}
            />
          </form>
        </MediaModalFrame>
      )}

      {showForm && (
        <MediaModalFrame label="영상 추가" onClose={closeMediaForm}>
        <form className="media-submit-panel media-submit-panel--composer media-modal-panel media-composer-modal" onSubmit={handleSubmit}>
          <header className="media-modal-form-header">
            <div>
              <p className="media-eyebrow">Add Archive</p>
              <h2>영상 추가</h2>
            </div>
            <button type="button" className="media-icon-button" onClick={closeMediaForm} aria-label="영상 추가 닫기">
              <i className="ri-close-line" />
            </button>
          </header>
          <section className="media-compose-preview" aria-label="등록 미리보기">
            <div className="media-compose-section-title">
              <i className="ri-eye-line" />
              <span>등록 미리보기</span>
            </div>
            <MediaPreviewCard item={previewItem} />
            <ArchivePlacementPreview item={previewItem} />
          </section>

          <section className="media-compose-fields" aria-label="아카이브 정보">
            <div className="media-compose-section-title">
              <i className="ri-archive-drawer-line" />
              <span>아카이브 정보</span>
            </div>
            {draftNotice && (
              <div className="media-draft-notice">
                <i className="ri-inbox-archive-line" />
                <span>{draftNotice}</span>
              </div>
            )}

            <div className="media-field-grid">
              <label className="media-field media-field--wide">
                <span>URL</span>
                <input
                  value={form.url}
                  onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))}
                  placeholder="YouTube 또는 Instagram URL"
                  required
                />
              </label>
              <label className="media-field">
                <span>제목</span>
                <input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              </label>
              <label className="media-field">
                <span>작성자/채널</span>
                <input value={form.authorName} onChange={(event) => setForm((prev) => ({ ...prev, authorName: event.target.value }))} />
              </label>
              <label className="media-field">
                <span>춤 장르</span>
                <input value={form.danceGenre} onChange={(event) => setForm((prev) => ({ ...prev, danceGenre: event.target.value }))} list="media-genre-presets" />
                <datalist id="media-genre-presets">
                  {GENRE_PRESETS.map((item) => <option key={item} value={item} />)}
                </datalist>
              </label>
              <label className="media-field">
                <span>날짜</span>
                <input type="date" value={form.publishedAt} onChange={(event) => setForm((prev) => ({ ...prev, publishedAt: event.target.value }))} />
              </label>
              <label className="media-field">
                <span>재생목록</span>
                <select
                  value={form.playlistId}
                  onChange={(event) => {
                    const playlist = playlists.find((entry) => entry.id === event.target.value);
                    setForm((prev) => ({
                      ...prev,
                      playlistId: event.target.value,
                      newPlaylistName: '',
                      newPlaylistParentId: '',
                      collectionName: playlist ? playlist.name : prev.collectionName,
                    }));
                  }}
                >
                  <option value="">{playlistsLoading ? '불러오는 중...' : '선택 안 함'}</option>
                  {playlistOptions.map(({ playlist, path }) => (
                    <option key={playlist.id} value={playlist.id}>{path}</option>
                  ))}
                </select>
              </label>
              <label className="media-field">
                <span>새 재생목록</span>
                <input
                  value={form.newPlaylistName}
                  onChange={(event) => setForm((prev) => ({ ...prev, newPlaylistName: event.target.value, playlistId: '' }))}
                  placeholder="저장하면서 만들기"
                />
              </label>
              <label className="media-field media-field--wide">
                <span>새 재생목록 위치</span>
                <select
                  value={form.newPlaylistParentId}
                  onChange={(event) => setForm((prev) => ({ ...prev, newPlaylistParentId: event.target.value, playlistId: '' }))}
                >
                  <option value="">최상위</option>
                  {playlistOptions.map(({ playlist, path }) => (
                    <option key={playlist.id} value={playlist.id}>{path}</option>
                  ))}
                </select>
              </label>
              <label className="media-field media-field--wide">
                <span>컬렉션 이름</span>
                <input
                  value={form.collectionName}
                  onChange={(event) => setForm((prev) => ({ ...prev, collectionName: event.target.value }))}
                  placeholder="재생목록을 쓰지 않는 임시 묶음 이름"
                />
              </label>
              <label className="media-field media-field--wide">
                <span>검색 태그</span>
                <input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="예: 스윙아웃, 공연, 팔로워, 영감" />
              </label>
              <label className="media-field media-field--wide">
                <span>원본 설명 / 메모</span>
                <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} placeholder="원본 설명이 있으면 자동 입력됩니다. 나중에 찾을 포인트를 덧붙여도 됩니다." />
                {metadataLoading && <small className="media-field-help">원본 페이지 설명을 확인하는 중...</small>}
              </label>
              <details className="media-advanced-fields">
                <summary>고급 정보</summary>
                <div className="media-field-grid">
                  <label className="media-field media-field--wide">
                    <span>썸네일 URL</span>
                    <input
                      value={form.thumbnailUrl}
                      onChange={(event) => setForm((prev) => ({ ...prev, thumbnailUrl: event.target.value }))}
                      placeholder="인스타그램 썸네일 후보가 있으면 자동 입력됩니다"
                    />
                  </label>
                  <label className="media-field media-field--wide">
                    <span>출처 맥락</span>
                    <input value={form.sourceContext} onChange={(event) => setForm((prev) => ({ ...prev, sourceContext: event.target.value }))} placeholder="예: 모바일 공유, 데스크톱 공유, 수업 참고" />
                  </label>
                </div>
              </details>
            </div>

            <button className="media-save-button" type="submit">
              <i className="ri-archive-line" />
              {canCreate ? '이 모습으로 저장' : '로그인 후 저장'}
            </button>
          </section>
        </form>
        </MediaModalFrame>
      )}

      {editingItem && (
        <MediaItemEditPanel
          item={editingItem}
          form={editForm}
          playlists={playlists}
          availableGenres={availableGenres}
          onChange={setEditForm}
          onClose={() => {
            setEditingItem(null);
            setEditForm(emptyForm);
          }}
          onSubmit={handleItemEditSubmit}
        />
      )}

      <section className="media-controls">
        <form className="media-search" onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query.trim());
          setSearchFocused(false);
        }}>
          <i className="ri-search-line" />
          <div className="media-search-input-wrap">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => {
                window.setTimeout(() => setSearchFocused(false), 120);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="제목, 작성자, 컬렉션, 태그 검색"
              aria-autocomplete="list"
              aria-expanded={showSearchSuggestions}
            />
            {showSearchSuggestions && (
              <div className="media-search-suggestions" role="listbox" aria-label="검색 자동완성">
                {searchSuggestions.map((suggestion, index) => (
                  <button
                    key={`${suggestion.group}:${suggestion.value}`}
                    type="button"
                    className={highlightedSearchSuggestionIndex === index ? 'active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSearchSuggestion(suggestion)}
                    role="option"
                    aria-selected={highlightedSearchSuggestionIndex === index}
                  >
                    <i className={suggestion.icon} />
                    <span>
                      <strong>{suggestion.label}</strong>
                      <small>{suggestion.group}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {query && (
            <button
              type="button"
              className="media-search-clear"
              onClick={() => {
                setQuery('');
                setSubmittedQuery('');
                setSearchFocused(false);
              }}
              aria-label="검색어 지우기"
            >
              <i className="ri-close-line" />
            </button>
          )}
          <button type="submit">검색</button>
        </form>
        {activeSearchQuery && (
          <div className="media-search-status">
            <i className="ri-search-eye-line" />
            <span><strong>{activeSearchQuery}</strong> 검색 결과</span>
          </div>
        )}
      </section>

      {loading || (activeSearchQuery && playlistsLoading && items.length === 0) ? (
        <div className="media-state">불러오는 중...</div>
      ) : items.length === 0 && !hasSearchPlaylistResults ? (
        <div className="media-state media-state--empty">
          <i className={activeSearchQuery ? 'ri-search-line' : 'ri-film-line'} />
          <strong>{activeSearchQuery ? '검색 결과가 없습니다' : '아직 저장된 영상이 없습니다'}</strong>
          <span>{activeSearchQuery ? '검색어를 줄여보세요.' : '좋은 영상 링크를 첫 번째로 모아보세요.'}</span>
          {activeSearchQuery && (
            <button
              type="button"
              className="media-ghost-button"
              onClick={() => {
                setQuery('');
                setSubmittedQuery('');
              }}
            >
              <i className="ri-close-circle-line" />
              검색 초기화
            </button>
          )}
        </div>
      ) : (
        renderArchiveView()
      )}

      <div ref={sentinelRef} className="media-sentinel">
        {loadingMore && <span>더 불러오는 중...</span>}
        {!hasMore && items.length > 0 && <span>마지막입니다</span>}
      </div>
    </main>
  );
};

export default MediaArchivePage;
