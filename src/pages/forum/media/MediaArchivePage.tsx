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

type YouTubePlayerInstance = {
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  getCurrentTime?: () => number;
  getDuration?: () => number;
  getVideoLoadedFraction?: () => number;
  getPlaybackRate?: () => number;
  getPlayerState?: () => number;
  getAvailablePlaybackRates?: () => number[];
  setPlaybackRate?: (rate: number) => void;
  mute?: () => void;
  unMute?: () => void;
  isMuted?: () => boolean;
  destroy?: () => void;
};

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
const MEDIA_DESCRIPTION_EXPAND_MIN_LENGTH = 80;
const MEDIA_PLAYER_BOTTOM_NAV_EVENT = 'swingenjoy:media-player-bottom-nav';
const MEDIA_PLAYER_QUERY_PARAM = 'play';
const MEDIA_PLAYER_CONTROL_ENGAGED_MS = 2600;
const PLAYLIST_COVER_STORAGE_PREFIX = 'sns-media-playlists';
const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
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

type MediaArchivePlayerLocationState = {
  mediaArchivePlayer?: boolean;
};

type TrashClearFields = {
  deleted_at: null;
  delete_expires_at: null;
  deleted_by: null;
  deleted_branch_root_id: null;
  updated_at: string;
};

type PlaylistTrashClearFields = TrashClearFields & {
  deleted_branch_item_count: null;
  deleted_branch_playlist_count: null;
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
const MEDIA_PLAYLIST_CONTEXT_KEY = 'swingenjoy:media-archive-current-playlist';
const MEDIA_PLAYLIST_CONTEXT_TTL_MS = 2 * 60 * 60 * 1000;
const SHARE_TARGET_CACHE = 'rhythmjoy-share-targets-v1';
const SHARE_TARGET_PATH = '/__pwa-share-target/';
const MOBILE_SHARE_SOURCE_LABEL = '모바일 공유';
const DESKTOP_SHARE_SOURCE_LABEL = '데스크톱 공유';

interface PendingMediaDraft {
  form: MediaArchiveForm;
  savedAt: number;
  source: string;
}

interface MediaPlaylistContext {
  playlistId: string;
  name: string;
  savedAt: number;
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

function saveMediaPlaylistContext(playlist: Pick<SnsMediaPlaylist, 'id' | 'name'>) {
  if (typeof window === 'undefined') return;
  const playlistId = compactText(playlist.id);
  if (!playlistId) return;

  const context: MediaPlaylistContext = {
    playlistId,
    name: compactText(playlist.name),
    savedAt: Date.now(),
  };

  try {
    window.sessionStorage.setItem(MEDIA_PLAYLIST_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // The form can still be completed manually when session storage is unavailable.
  }
}

function readMediaPlaylistContext(): MediaPlaylistContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(MEDIA_PLAYLIST_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MediaPlaylistContext>;
    const savedAt = Number(parsed.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > MEDIA_PLAYLIST_CONTEXT_TTL_MS) {
      window.sessionStorage.removeItem(MEDIA_PLAYLIST_CONTEXT_KEY);
      return null;
    }
    const playlistId = compactText(parsed.playlistId);
    if (!playlistId) return null;
    return {
      playlistId,
      name: compactText(parsed.name),
      savedAt,
    };
  } catch {
    try {
      window.sessionStorage.removeItem(MEDIA_PLAYLIST_CONTEXT_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
    return null;
  }
}

function clearMediaPlaylistContext() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(MEDIA_PLAYLIST_CONTEXT_KEY);
  } catch {
    // Ignore storage cleanup failures.
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

function isWeakImportedMediaDescription(value?: string | null) {
  const description = compactText(value);
  if (!description) return false;
  const lower = description.toLowerCase();
  return (
    /^youtube$/i.test(description) ||
    /youtube에서\s+마음에\s+드는\s+동영상과\s+음악을\s+감상하고/i.test(description) ||
    /직접\s+만든\s+콘텐츠를\s+업로드하여\s+친구/i.test(description) ||
    /친구,\s*가족뿐\s+아니라\s+전\s+세계\s+사람들과\s+콘텐츠를\s+공유/i.test(description) ||
    /enjoy\s+the\s+videos\s+and\s+music\s+you\s+love/i.test(lower) ||
    /share\s+(?:it\s+all|your\s+videos)\s+with\s+friends,\s*family,\s*and\s+the\s+world/i.test(lower)
  );
}

function cleanImportedMediaDescription(value?: string | null) {
  const description = trimText(value);
  return isWeakImportedMediaDescription(description) ? '' : description;
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

function getSelectableTreePlaylists(playlists: SnsMediaPlaylist[], excludedId = '') {
  return playlists.filter((playlist) => (
    playlist.id !== excludedId &&
    !isShortcutPlaylist(playlist) &&
    !isPlaylistDescendant(playlist.id, excludedId, playlists)
  ));
}

function buildPlaylistChildrenMap(playlists: SnsMediaPlaylist[]) {
  const allowedIds = new Set(playlists.map((playlist) => playlist.id));
  const byParent = new Map<string, SnsMediaPlaylist[]>();
  playlists.forEach((playlist) => {
    const parentId = getPlaylistParentId(playlist);
    const parentExists = parentId && allowedIds.has(parentId);
    const key = parentExists ? parentId : '';
    byParent.set(key, [...(byParent.get(key) || []), playlist]);
  });

  byParent.forEach((children, parentId) => {
    byParent.set(parentId, sortPlaylistsByName(children));
  });

  return byParent;
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

function buildImportedForm(
  prev: MediaArchiveForm,
  params: URLSearchParams,
  addUrl: string,
  isShareTarget: boolean,
  defaultPlaylistContext: MediaPlaylistContext | null = null,
) {
  const sharedDescription = params.get('description') || stripSharedUrl(params.get('text'), addUrl);
  const readFirstParam = (...keys: string[]) => {
    const key = keys.find((entry) => params.has(entry));
    return key ? params.get(key) || '' : null;
  };
  const defaultPlaylistId = compactText(defaultPlaylistContext?.playlistId);
  const explicitPlaylistId = readFirstParam('playlistId', 'playlist', 'folderId');
  const playlistId = explicitPlaylistId ?? (prev.playlistId || defaultPlaylistId);
  const newPlaylistName = readFirstParam('newPlaylistName', 'new_playlist') ?? prev.newPlaylistName;
  const newPlaylistParentId = readFirstParam('newPlaylistParentId', 'new_playlist_parent') ?? prev.newPlaylistParentId;
  const collectionName = readFirstParam('collection') ?? (
    prev.collectionName ||
    (playlistId && playlistId === defaultPlaylistId ? defaultPlaylistContext?.name || '' : '')
  );
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

function getPlaylistCoverStorageFolderPath(playlistId?: string | null) {
  const id = compactText(playlistId);
  if (!id || !/^[a-zA-Z0-9._-]+$/.test(id)) return '';
  return `${PLAYLIST_COVER_STORAGE_PREFIX}/${id}`;
}

function isPlaylistOwnedCoverUrl(value: string | null | undefined, playlistId: string) {
  const folderPath = getPlaylistCoverStorageFolderPath(playlistId);
  const url = compactText(value).split('?')[0];
  return Boolean(folderPath && url.startsWith(`/uploads/images/${folderPath}/`));
}

async function removePlaylistCoverFolders(playlistIds: string[]) {
  const paths = Array.from(new Set(
    playlistIds
      .map(getPlaylistCoverStorageFolderPath)
      .filter(Boolean),
  ));
  if (!paths.length) return;
  const { error } = await cafe24.storage.from('images').remove(paths);
  if (error) throw error;
}

function createTrashExpiry(deletedAtIso: string) {
  const deletedAt = new Date(deletedAtIso).getTime();
  const baseTime = Number.isFinite(deletedAt) ? deletedAt : Date.now();
  return new Date(baseTime + TRASH_RETENTION_MS).toISOString();
}

function formatTrashDate(value?: string | null) {
  if (!value) return '날짜 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function isTrashExpired(value?: string | null) {
  if (!value) return false;
  const expiresAt = new Date(value).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function getTrashClearFields(now = new Date().toISOString()): TrashClearFields {
  return {
    deleted_at: null,
    delete_expires_at: null,
    deleted_by: null,
    deleted_branch_root_id: null,
    updated_at: now,
  };
}

function getPlaylistTrashClearFields(now = new Date().toISOString()): PlaylistTrashClearFields {
  return {
    ...getTrashClearFields(now),
    deleted_branch_item_count: null,
    deleted_branch_playlist_count: null,
  };
}

function getTrashLabel(value: SnsMediaItem | SnsMediaPlaylist) {
  return truncateText('title' in value ? value.title : value.name, 80) || value.id;
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

let youtubeIframeApiPromise: Promise<void> | null = null;

function loadYouTubeIframeApi() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeIframeApiPromise) return youtubeIframeApiPromise;

  youtubeIframeApiPromise = new Promise((resolve, reject) => {
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (existing) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      youtubeIframeApiPromise = null;
      reject(new Error('YouTube IFrame API load failed'));
    };
    document.body.appendChild(script);
  });

  return youtubeIframeApiPromise;
}

function formatMediaTime(value?: number) {
  const safeValue = Number.isFinite(value) && value ? Math.max(0, Math.floor(value)) : 0;
  const minutes = Math.floor(safeValue / 60);
  const seconds = safeValue % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

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

const MediaEmbed: React.FC<{
  item: SnsMediaItem;
  autoplay?: boolean;
  minimalControls?: boolean;
}> = ({ item, autoplay = false, minimalControls = false }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (item.platform === 'instagram') {
      window.setTimeout(loadInstagramScript, 50);
    }
  }, [item.platform, item.id]);

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

const YOUTUBE_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const YOUTUBE_STATE_UNSTARTED = -1;
const YOUTUBE_STATE_ENDED = 0;
const YOUTUBE_STATE_PLAYING = 1;
const YOUTUBE_STATE_PAUSED = 2;
const YOUTUBE_STATE_BUFFERING = 3;
const YOUTUBE_STATE_CUED = 5;
const MEDIA_JOG_PREVIEW_RATE = 0.25;
const MEDIA_JOG_PAINT_DELAY_MS = 90;
const MEDIA_JOG_POINTER_SEEK_INTERVAL_MS = 70;
const MEDIA_JOG_TOUCH_SEEK_INTERVAL_MS = 150;
const MEDIA_JOG_POINTER_BUFFERING_SEEK_INTERVAL_MS = 120;
const MEDIA_JOG_TOUCH_BUFFERING_SEEK_INTERVAL_MS = 220;
const MEDIA_JOG_POINTER_MIN_SEEK_STEP_SECONDS = 0.18;
const MEDIA_JOG_TOUCH_MIN_SEEK_STEP_SECONDS = 0.35;
const MEDIA_JOG_POINTER_BUFFERING_MIN_SEEK_STEP_SECONDS = 0.28;
const MEDIA_JOG_TOUCH_BUFFERING_MIN_SEEK_STEP_SECONDS = 0.55;
const MEDIA_JOG_BUFFERING_COOLDOWN_MS = 700;
const MEDIA_JOG_PAUSE_GUARD_MS = 1200;
const MEDIA_JOG_SECONDS_PER_PIXEL = 0.035;
const MEDIA_JOG_MAX_OFFSET_SECONDS = 12;
const MEDIA_PLAYER_TIME_UPDATE_EPSILON_SECONDS = 0.05;
const MEDIA_PLAYER_DURATION_UPDATE_EPSILON_SECONDS = 0.25;
const MEDIA_PLAYER_LOADED_UPDATE_EPSILON = 0.003;
const MEDIA_PLAYER_SEEK_SETTLE_EPSILON_SECONDS = 0.45;
const MEDIA_QUICK_SKIP_SECONDS = [-1, 1];
const MEDIA_DETAIL_SKIP_SECONDS = [-10, -5, 5, 10];
type MediaJogEventSource = 'pointer' | 'touch';
type MediaJogInputMode = 'pointer' | 'touch';

const normalizeYouTubePlaybackRates = (rates?: number[]) => {
  const normalized = Array.from(new Set((rates || [])
    .filter((rate) => Number.isFinite(rate) && rate > 0)
    .map((rate) => Number(rate.toFixed(2)))))
    .sort((a, b) => a - b);

  if (!normalized.length) return YOUTUBE_SPEED_OPTIONS;
  return normalized.includes(1) ? normalized : [...normalized, 1].sort((a, b) => a - b);
};

const arePlaybackRatesEqual = (left: number[], right: number[]) => (
  left.length === right.length && left.every((rate, index) => rate === right[index])
);

const getSlowestJogPlaybackRate = (rates: number[]) => (
  rates.find((rate) => rate > 0 && rate < 1) ?? rates[0] ?? MEDIA_JOG_PREVIEW_RATE
);

const setNumberIfMeaningfullyChanged = (
  setter: React.Dispatch<React.SetStateAction<number>>,
  nextValue: number,
  epsilon = 0,
) => {
  if (!Number.isFinite(nextValue)) return;
  setter((previousValue) => (
    Math.abs(previousValue - nextValue) <= epsilon ? previousValue : nextValue
  ));
};

const YouTubeCustomPlayer: React.FC<{
  item: SnsMediaItem;
}> = ({ item }) => {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerInstance | null>(null);
  const bottomNavEventIdRef = useRef(`media-player-${Math.random().toString(36).slice(2)}`);
  const controlEngagedTimerRef = useRef<number | null>(null);
  const scrubSessionRef = useRef(false);
  const scrubCommitTimerRef = useRef<number | null>(null);
  const scrubTargetTimeRef = useRef(0);
  const pendingSeekTargetRef = useRef<number | null>(null);
  const jogPauseGuardUntilRef = useRef(0);
  const jogSessionRef = useRef<{
    startX: number;
    startTime: number;
    lastTime: number;
    pendingOffset: number;
    wasMuted: boolean;
    previousPlaybackRate: number;
    inputMode: MediaJogInputMode;
    eventSource: MediaJogEventSource;
    rafId: number | null;
    seekTimerId: number | null;
    paintTimerId: number | null;
    lastSeekIssuedAt: number;
    lastSeekTime: number;
    pendingSeekTime: number;
    lastBufferingAt: number;
    pointerId: number | null;
    captureTarget: HTMLElement | null;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadedFraction, setLoadedFraction] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [availablePlaybackRates, setAvailablePlaybackRates] = useState<number[]>(YOUTUBE_SPEED_OPTIONS);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(0);
  const [pendingSeekTime, setPendingSeekTime] = useState<number | null>(null);
  const [isJogging, setIsJogging] = useState(false);
  const [jogOffsetSeconds, setJogOffsetSeconds] = useState(0);
  const [isControlEngaged, setIsControlEngaged] = useState(false);
  const [isPlayerVisible, setIsPlayerVisible] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const embedUrl = getYouTubeEmbedUrl(item.embed_url, { autoplay: true, minimalControls: true });
  const safeDuration = duration > 0 ? duration : 0;
  const displayedTime = isScrubbing ? scrubTime : pendingSeekTime ?? currentTime;
  const seekValue = safeDuration > 0 ? Math.min(displayedTime, safeDuration) : 0;
  const progressPercent = safeDuration > 0 ? Math.min(100, Math.max(0, (seekValue / safeDuration) * 100)) : 0;
  const loadedPercent = Math.min(100, Math.max(0, loadedFraction * 100));
  const timelineStyle = {
    '--media-player-progress': `${progressPercent}%`,
    '--media-player-buffered': `${loadedPercent}%`,
  } as React.CSSProperties;
  const jogOffsetLabel = `${jogOffsetSeconds > 0 ? '+' : ''}${jogOffsetSeconds.toFixed(1)}s`;
  const shouldHideBottomNav = isPlayerVisible && (ready || isJogging || isControlEngaged);

  const emitBottomNavEngagement = useCallback((active: boolean) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(MEDIA_PLAYER_BOTTOM_NAV_EVENT, {
      detail: {
        id: bottomNavEventIdRef.current,
        active,
      },
    }));
  }, []);

  const markControlsEngaged = useCallback((durationMs = MEDIA_PLAYER_CONTROL_ENGAGED_MS) => {
    setIsControlEngaged(true);
    if (controlEngagedTimerRef.current !== null) {
      window.clearTimeout(controlEngagedTimerRef.current);
    }
    controlEngagedTimerRef.current = window.setTimeout(() => {
      controlEngagedTimerRef.current = null;
      setIsControlEngaged(false);
    }, durationMs);
  }, []);

  const clearScrubCommitTimer = useCallback(() => {
    if (scrubCommitTimerRef.current === null) return;
    window.clearTimeout(scrubCommitTimerRef.current);
    scrubCommitTimerRef.current = null;
  }, []);

  const setPendingSeekDisplay = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;
    pendingSeekTargetRef.current = time;
    setPendingSeekTime(time);
  }, []);

  const clearPendingSeekDisplay = useCallback((nextTime?: number) => {
    pendingSeekTargetRef.current = null;
    setPendingSeekTime(null);
    if (typeof nextTime === 'number' && Number.isFinite(nextTime)) {
      setCurrentTime(nextTime);
    }
  }, []);

  useEffect(() => {
    const element = shellRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setIsPlayerVisible(true);
      return undefined;
    }

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      setIsPlayerVisible(Boolean(entry?.isIntersecting && entry.intersectionRatio > 0.08));
    }, {
      threshold: [0, 0.08, 0.2],
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  useEffect(() => {
    emitBottomNavEngagement(shouldHideBottomNav);
    return () => emitBottomNavEngagement(false);
  }, [emitBottomNavEngagement, shouldHideBottomNav]);

  useEffect(() => () => {
    if (controlEngagedTimerRef.current !== null) {
      window.clearTimeout(controlEngagedTimerRef.current);
    }
    clearScrubCommitTimer();
    emitBottomNavEngagement(false);
  }, [clearScrubCommitTimer, emitBottomNavEngagement]);

  useEffect(() => {
    let cancelled = false;
    let createdPlayer: YouTubePlayerInstance | null = null;
    setReady(false);
    setCurrentTime(0);
    setDuration(0);
    setLoadedFraction(0);
    setPlaybackRate(1);
    setAvailablePlaybackRates(YOUTUBE_SPEED_OPTIONS);
    setIsPaused(true);
    scrubSessionRef.current = false;
    pendingSeekTargetRef.current = null;
    setPendingSeekTime(null);
    jogPauseGuardUntilRef.current = 0;
    setIsScrubbing(false);
    setScrubTime(0);
    setIsJogging(false);
    setJogOffsetSeconds(0);
    if (jogSessionRef.current?.rafId) {
      window.cancelAnimationFrame(jogSessionRef.current.rafId);
    }
    if (jogSessionRef.current?.seekTimerId) {
      window.clearTimeout(jogSessionRef.current.seekTimerId);
    }
    if (jogSessionRef.current?.paintTimerId) {
      window.clearTimeout(jogSessionRef.current.paintTimerId);
    }
    clearScrubCommitTimer();
    jogSessionRef.current = null;

    loadYouTubeIframeApi()
      .then(() => {
        if (cancelled || !frameRef.current || !window.YT?.Player) return;

        createdPlayer = new window.YT.Player(frameRef.current, {
          events: {
            onReady: (event) => {
              if (cancelled) return;
              playerRef.current = event.target;
              const nextPlaybackRates = normalizeYouTubePlaybackRates(event.target.getAvailablePlaybackRates?.());
              setReady(true);
              setDuration(event.target.getDuration?.() || 0);
              setLoadedFraction(event.target.getVideoLoadedFraction?.() || 0);
              setAvailablePlaybackRates(nextPlaybackRates);
              setPlaybackRate(event.target.getPlaybackRate?.() || 1);
              setIsPaused(true);
              event.target.playVideo?.();
            },
            onStateChange: (event) => {
              if (event.data === (window.YT?.PlayerState?.PLAYING ?? YOUTUBE_STATE_PLAYING)) {
                if (jogSessionRef.current || Date.now() < jogPauseGuardUntilRef.current) {
                  try {
                    event.target.mute?.();
                    event.target.pauseVideo?.();
                  } catch {
                    // YouTube can reject transient commands while the iframe is changing state.
                  }
                  setIsPaused(true);
                  return;
                }
                setIsPaused(false);
              }
              if (
                event.data === YOUTUBE_STATE_UNSTARTED ||
                event.data === YOUTUBE_STATE_CUED ||
                event.data === (window.YT?.PlayerState?.PAUSED ?? YOUTUBE_STATE_PAUSED) ||
                event.data === (window.YT?.PlayerState?.ENDED ?? YOUTUBE_STATE_ENDED)
              ) {
                setIsPaused(true);
              }
            },
            onPlaybackRateChange: (event) => {
              if (cancelled) return;
              const nextRate = typeof event.data === 'number'
                ? event.data
                : event.target.getPlaybackRate?.() || 1;
              setPlaybackRate(nextRate);
              const nextPlaybackRates = normalizeYouTubePlaybackRates(event.target.getAvailablePlaybackRates?.());
              setAvailablePlaybackRates((previousRates) => (
                arePlaybackRatesEqual(previousRates, nextPlaybackRates) ? previousRates : nextPlaybackRates
              ));
            },
          },
        });
        playerRef.current = createdPlayer;
      })
      .catch(() => {
        setReady(false);
      });

    return () => {
      cancelled = true;
      if (jogSessionRef.current?.rafId) {
        window.cancelAnimationFrame(jogSessionRef.current.rafId);
      }
      if (jogSessionRef.current?.seekTimerId) {
        window.clearTimeout(jogSessionRef.current.seekTimerId);
      }
      if (jogSessionRef.current?.paintTimerId) {
        window.clearTimeout(jogSessionRef.current.paintTimerId);
      }
      jogSessionRef.current = null;
      playerRef.current = null;
      try {
        createdPlayer?.destroy?.();
      } catch {
        // YouTube iframe cleanup can throw if the iframe has already navigated.
      }
    };
  }, [clearScrubCommitTimer, item.id, embedUrl]);

  useEffect(() => {
    if (!ready) return undefined;
    const intervalId = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      const isJogActive = Boolean(jogSessionRef.current);
      if (!isJogActive && !scrubSessionRef.current) {
        const nextCurrentTime = player.getCurrentTime?.() || 0;
        const pendingSeekTarget = pendingSeekTargetRef.current;
        if (pendingSeekTarget !== null) {
          const nextPlayerState = player.getPlayerState?.();
          const isPlaying = nextPlayerState === (window.YT?.PlayerState?.PLAYING ?? YOUTUBE_STATE_PLAYING);
          const hasSettled =
            Math.abs(nextCurrentTime - pendingSeekTarget) <= MEDIA_PLAYER_SEEK_SETTLE_EPSILON_SECONDS ||
            (isPlaying && nextCurrentTime > pendingSeekTarget + MEDIA_PLAYER_SEEK_SETTLE_EPSILON_SECONDS);
          if (hasSettled) {
            clearPendingSeekDisplay(nextCurrentTime);
          }
        } else {
          setNumberIfMeaningfullyChanged(
            setCurrentTime,
            nextCurrentTime,
            MEDIA_PLAYER_TIME_UPDATE_EPSILON_SECONDS,
          );
        }
      }
      setNumberIfMeaningfullyChanged(
        setDuration,
        player.getDuration?.() || 0,
        MEDIA_PLAYER_DURATION_UPDATE_EPSILON_SECONDS,
      );
      setNumberIfMeaningfullyChanged(
        setLoadedFraction,
        player.getVideoLoadedFraction?.() || 0,
        MEDIA_PLAYER_LOADED_UPDATE_EPSILON,
      );
      const nextPlaybackRates = normalizeYouTubePlaybackRates(player.getAvailablePlaybackRates?.());
      setAvailablePlaybackRates((previousRates) => (
        arePlaybackRatesEqual(previousRates, nextPlaybackRates) ? previousRates : nextPlaybackRates
      ));
      if (!isJogActive) {
        setNumberIfMeaningfullyChanged(setPlaybackRate, player.getPlaybackRate?.() || 1);
      }
    }, 500);

    return () => window.clearInterval(intervalId);
  }, [clearPendingSeekDisplay, ready]);

  const clearJogPaintTimer = (session: NonNullable<typeof jogSessionRef.current>) => {
    if (!session.paintTimerId) return;
    window.clearTimeout(session.paintTimerId);
    session.paintTimerId = null;
  };

  const paintJogFrame = useCallback((session: NonNullable<typeof jogSessionRef.current>) => {
    const player = playerRef.current;
    if (!player) return;
    clearJogPaintTimer(session);
    jogPauseGuardUntilRef.current = Date.now() + MEDIA_JOG_PAUSE_GUARD_MS;
    try {
      player.mute?.();
      player.playVideo?.();
    } catch {
      // Some embedded videos may reject programmatic playback until YouTube has fully initialized.
    }
    session.paintTimerId = window.setTimeout(() => {
      if (jogSessionRef.current !== session) return;
      try {
        player.pauseVideo?.();
      } catch {
        // Keep the jog session alive even if the iframe ignores the pause request.
      }
      setIsPaused(true);
      session.paintTimerId = null;
    }, MEDIA_JOG_PAINT_DELAY_MS);
  }, []);

  const issueJogSeek = useCallback((session: NonNullable<typeof jogSessionRef.current>, time: number, force = false) => {
    const player = playerRef.current;
    if (!player) return;
    const now = window.performance?.now?.() ?? Date.now();
    const isBuffering = player.getPlayerState?.() === (window.YT?.PlayerState?.BUFFERING ?? YOUTUBE_STATE_BUFFERING);
    if (isBuffering) {
      session.lastBufferingAt = now;
    }
    const recentlyBuffered = session.lastBufferingAt > 0 && now - session.lastBufferingAt < MEDIA_JOG_BUFFERING_COOLDOWN_MS;
    const seekInterval = session.inputMode === 'touch'
      ? recentlyBuffered
        ? MEDIA_JOG_TOUCH_BUFFERING_SEEK_INTERVAL_MS
        : MEDIA_JOG_TOUCH_SEEK_INTERVAL_MS
      : recentlyBuffered
        ? MEDIA_JOG_POINTER_BUFFERING_SEEK_INTERVAL_MS
        : MEDIA_JOG_POINTER_SEEK_INTERVAL_MS;
    const minSeekStep = session.inputMode === 'touch'
      ? recentlyBuffered
        ? MEDIA_JOG_TOUCH_BUFFERING_MIN_SEEK_STEP_SECONDS
        : MEDIA_JOG_TOUCH_MIN_SEEK_STEP_SECONDS
      : recentlyBuffered
        ? MEDIA_JOG_POINTER_BUFFERING_MIN_SEEK_STEP_SECONDS
        : MEDIA_JOG_POINTER_MIN_SEEK_STEP_SECONDS;
    const canSeekNow =
      force ||
      session.lastSeekIssuedAt <= 0 ||
      now - session.lastSeekIssuedAt >= seekInterval ||
      Math.abs(time - session.lastSeekTime) >= minSeekStep;

    session.pendingSeekTime = time;

    const runSeek = (targetTime: number) => {
      const nextPlayer = playerRef.current;
      if (!nextPlayer || jogSessionRef.current !== session) return;
      nextPlayer.seekTo?.(targetTime, true);
      session.lastSeekIssuedAt = window.performance?.now?.() ?? Date.now();
      session.lastSeekTime = targetTime;
      paintJogFrame(session);
    };

    if (canSeekNow) {
      if (session.seekTimerId) {
        window.clearTimeout(session.seekTimerId);
        session.seekTimerId = null;
      }
      runSeek(time);
      return;
    }

    if (session.seekTimerId) return;
    const delay = Math.max(0, seekInterval - (now - session.lastSeekIssuedAt));
    session.seekTimerId = window.setTimeout(() => {
      if (jogSessionRef.current !== session) return;
      session.seekTimerId = null;
      runSeek(session.pendingSeekTime);
    }, delay);
  }, [paintJogFrame]);

  const togglePlayback = () => {
    const player = playerRef.current;
    if (!player) return;
    markControlsEngaged();
    if (isPaused) {
      player.playVideo?.();
      setIsPaused(false);
      return;
    }
    player.pauseVideo?.();
    setIsPaused(true);
  };

  const seekToTime = (time: number) => {
    markControlsEngaged();
    const upperBound = safeDuration || Number.POSITIVE_INFINITY;
    const nextTime = Math.max(0, Math.min(upperBound, time));
    setCurrentTime(nextTime);
    setPendingSeekDisplay(nextTime);
    try {
      playerRef.current?.seekTo?.(nextTime, true);
    } catch {
      // Keep the UI on the requested time even if YouTube needs to load first.
    }
  };

  const skipBy = (deltaSeconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    markControlsEngaged();
    const baseTime = pendingSeekTargetRef.current ?? player.getCurrentTime?.() ?? currentTime;
    seekToTime(baseTime + deltaSeconds);
  };

  const clampSeekTime = useCallback((time: number) => {
    if (!Number.isFinite(time)) return 0;
    const upperBound = safeDuration || Number.POSITIVE_INFINITY;
    return Math.max(0, Math.min(upperBound, time));
  }, [safeDuration]);

  const previewSeek = useCallback((time: number) => {
    if (!ready || !safeDuration) return;
    markControlsEngaged(4000);
    const nextTime = clampSeekTime(time);
    scrubSessionRef.current = true;
    scrubTargetTimeRef.current = nextTime;
    setIsScrubbing(true);
    setScrubTime(nextTime);
  }, [clampSeekTime, markControlsEngaged, ready, safeDuration]);

  const commitSeek = useCallback((time: number) => {
    if (!ready || !safeDuration) return;
    clearScrubCommitTimer();
    const nextTime = clampSeekTime(time);
    scrubSessionRef.current = false;
    scrubTargetTimeRef.current = nextTime;
    setIsScrubbing(false);
    setScrubTime(nextTime);
    setCurrentTime(nextTime);
    setPendingSeekDisplay(nextTime);
    markControlsEngaged(4000);
    try {
      playerRef.current?.seekTo?.(nextTime, true);
    } catch {
      // The iframe may ignore a seek while YouTube is switching buffer state.
    }
  }, [clampSeekTime, clearScrubCommitTimer, markControlsEngaged, ready, safeDuration, setPendingSeekDisplay]);

  const scheduleSeekCommit = useCallback((time: number) => {
    clearScrubCommitTimer();
    scrubCommitTimerRef.current = window.setTimeout(() => {
      scrubCommitTimerRef.current = null;
      commitSeek(time);
    }, 180);
  }, [clearScrubCommitTimer, commitSeek]);

  const handleSeekPreview = (event: React.FormEvent<HTMLInputElement> | React.ChangeEvent<HTMLInputElement>) => {
    const nextTime = Number(event.currentTarget.value);
    previewSeek(nextTime);
    scheduleSeekCommit(nextTime);
  };

  const handleSeekCommit = () => {
    if (!scrubSessionRef.current) return;
    commitSeek(scrubTargetTimeRef.current);
  };

  const handleSeekKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!ready || !safeDuration) return;
    const keySeeks = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'];
    if (!keySeeks.includes(event.key)) return;
    const nextTime = Number(event.currentTarget.value);
    previewSeek(nextTime);
    scheduleSeekCommit(nextTime);
  };

  const handleSeekKeyUp = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!scrubSessionRef.current) return;
    commitSeek(Number(event.currentTarget.value));
  };

  const beginJog = useCallback((
    clientX: number,
    inputMode: MediaJogInputMode,
    eventSource: MediaJogEventSource,
    pointerId: number | null = null,
    captureTarget: HTMLElement | null = null,
  ) => {
    const player = playerRef.current;
    if (!ready || !player) return false;
    markControlsEngaged();
    const startTime = pendingSeekTargetRef.current ?? player.getCurrentTime?.() ?? currentTime;
    clearPendingSeekDisplay(startTime);
    const playerState = player.getPlayerState?.();
    const wasMuted = Boolean(player.isMuted?.());
    const previousPlaybackRate = player.getPlaybackRate?.() || playbackRate || 1;
    const nextPlaybackRates = normalizeYouTubePlaybackRates(player.getAvailablePlaybackRates?.());
    setAvailablePlaybackRates((previousRates) => (
      arePlaybackRatesEqual(previousRates, nextPlaybackRates) ? previousRates : nextPlaybackRates
    ));
    jogPauseGuardUntilRef.current = Date.now() + MEDIA_JOG_PAUSE_GUARD_MS;
    try {
      player.mute?.();
      player.pauseVideo?.();
      setIsPaused(true);
    } catch {
      // Jog preview must remain silent and paused even if an embed command is ignored.
    }
    try {
      player.setPlaybackRate?.(getSlowestJogPlaybackRate(nextPlaybackRates));
    } catch {
      // Not every YouTube embed accepts every playback rate.
    }
    if (jogSessionRef.current?.rafId) {
      window.cancelAnimationFrame(jogSessionRef.current.rafId);
    }
    if (jogSessionRef.current?.seekTimerId) {
      window.clearTimeout(jogSessionRef.current.seekTimerId);
    }
    if (jogSessionRef.current?.paintTimerId) {
      window.clearTimeout(jogSessionRef.current.paintTimerId);
    }
    jogSessionRef.current = {
      startX: clientX,
      startTime,
      lastTime: startTime,
      pendingOffset: 0,
      wasMuted,
      previousPlaybackRate,
      inputMode,
      eventSource,
      rafId: null,
      seekTimerId: null,
      paintTimerId: null,
      lastSeekIssuedAt: 0,
      lastSeekTime: startTime,
      pendingSeekTime: startTime,
      lastBufferingAt: playerState === (window.YT?.PlayerState?.BUFFERING ?? YOUTUBE_STATE_BUFFERING)
        ? (window.performance?.now?.() ?? Date.now())
        : 0,
      pointerId,
      captureTarget,
    };
    paintJogFrame(jogSessionRef.current);
    setIsJogging(true);
    setJogOffsetSeconds(0);
    return true;
  }, [clearPendingSeekDisplay, currentTime, markControlsEngaged, paintJogFrame, playbackRate, ready]);

  const updateJogToClientX = useCallback((clientX: number) => {
    const session = jogSessionRef.current;
    if (!session || !ready) return;
    const rawOffset = (clientX - session.startX) * MEDIA_JOG_SECONDS_PER_PIXEL;
    const nextOffset = Math.max(-MEDIA_JOG_MAX_OFFSET_SECONDS, Math.min(MEDIA_JOG_MAX_OFFSET_SECONDS, rawOffset));
    const nextTime = Math.max(0, Math.min(safeDuration || Number.POSITIVE_INFINITY, session.startTime + nextOffset));
    session.lastTime = nextTime;
    session.pendingOffset = nextOffset;
    if (!session.rafId) {
      session.rafId = window.requestAnimationFrame(() => {
        if (jogSessionRef.current !== session) return;
        setJogOffsetSeconds(session.pendingOffset);
        setCurrentTime(session.lastTime);
        session.rafId = null;
      });
    }
    issueJogSeek(session, nextTime);
  }, [issueJogSeek, ready, safeDuration]);

  const finishJog = useCallback(() => {
    const session = jogSessionRef.current;
    if (!session) return;
    if (session.rafId) {
      window.cancelAnimationFrame(session.rafId);
    }
    if (session.seekTimerId) {
      window.clearTimeout(session.seekTimerId);
      session.seekTimerId = null;
    }
    setJogOffsetSeconds(session.pendingOffset);
    setCurrentTime(session.lastTime);
    setPendingSeekDisplay(session.lastTime);
    clearJogPaintTimer(session);
    jogPauseGuardUntilRef.current = Date.now() + MEDIA_JOG_PAUSE_GUARD_MS;
    try {
      playerRef.current?.seekTo?.(session.lastTime, true);
      playerRef.current?.pauseVideo?.();
    } catch {
      // Keep the visual target stable while YouTube catches up to the final jog position.
    }
    try {
      playerRef.current?.setPlaybackRate?.(session.previousPlaybackRate);
      setPlaybackRate(session.previousPlaybackRate);
    } catch {
      setPlaybackRate(playerRef.current?.getPlaybackRate?.() || playbackRate);
    }
    if (session.captureTarget && session.pointerId !== null) {
      try {
        session.captureTarget.releasePointerCapture(session.pointerId);
      } catch {
        // Pointer capture may already be released by the browser.
      }
    }
    if (!session.wasMuted) {
      try {
        playerRef.current?.unMute?.();
      } catch {
        // Muting is best-effort; playback is already forced to paused.
      }
    }
    setIsPaused(true);
    jogSessionRef.current = null;
    setIsJogging(false);
    setJogOffsetSeconds(0);
  }, [playbackRate, setPendingSeekDisplay]);

  useEffect(() => {
    if (!isJogging) return undefined;

    const handleWindowPointerMove = (event: PointerEvent) => {
      const session = jogSessionRef.current;
      if (!session || session.eventSource !== 'pointer') return;
      if (session.pointerId !== null && event.pointerId !== session.pointerId) return;
      event.preventDefault();
      updateJogToClientX(event.clientX);
    };
    const handleWindowPointerEnd = (event: PointerEvent) => {
      const session = jogSessionRef.current;
      if (!session || session.eventSource !== 'pointer') return;
      if (session.pointerId !== null && event.pointerId !== session.pointerId) return;
      event.preventDefault();
      finishJog();
    };
    const handleWindowTouchMove = (event: TouchEvent) => {
      const session = jogSessionRef.current;
      if (!session || session.eventSource !== 'touch') return;
      const touch = event.touches[0];
      if (!touch) return;
      event.preventDefault();
      updateJogToClientX(touch.clientX);
    };
    const handleWindowTouchEnd = (event: TouchEvent) => {
      const session = jogSessionRef.current;
      if (!session || session.eventSource !== 'touch') return;
      event.preventDefault();
      finishJog();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerEnd, { passive: false });
    window.addEventListener('pointercancel', handleWindowPointerEnd, { passive: false });
    window.addEventListener('touchmove', handleWindowTouchMove, { passive: false });
    window.addEventListener('touchend', handleWindowTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleWindowTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerEnd);
      window.removeEventListener('pointercancel', handleWindowPointerEnd);
      window.removeEventListener('touchmove', handleWindowTouchMove);
      window.removeEventListener('touchend', handleWindowTouchEnd);
      window.removeEventListener('touchcancel', handleWindowTouchEnd);
    };
  }, [finishJog, isJogging, updateJogToClientX]);

  const handleJogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready) return;
    const delta = event.key === 'ArrowLeft' ? -0.5 : event.key === 'ArrowRight' ? 0.5 : 0;
    if (!delta) return;
    event.preventDefault();
    skipBy(delta);
  };

  const handleJogPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (jogSessionRef.current) return;
    event.preventDefault();
    let captureTarget: HTMLElement | null = event.currentTarget;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      captureTarget = null;
    }
    beginJog(event.clientX, event.pointerType === 'touch' ? 'touch' : 'pointer', 'pointer', event.pointerId, captureTarget);
  };

  const handleJogTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (jogSessionRef.current) return;
    const touch = event.touches[0];
    if (!touch) return;
    event.preventDefault();
    beginJog(touch.clientX, 'touch', 'touch');
  };

  const handlePlaybackRateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    markControlsEngaged();
    const nextRate = Number(event.target.value);
    setPlaybackRate(nextRate);
    try {
      playerRef.current?.setPlaybackRate?.(nextRate);
    } catch {
      setPlaybackRate(playerRef.current?.getPlaybackRate?.() || 1);
    }
  };

  const handleFullscreen = () => {
    markControlsEngaged();
    if (typeof document === 'undefined') return;

    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => undefined);
      return;
    }

    const target = shellRef.current;
    if (!target?.requestFullscreen) return;
    void target.requestFullscreen().catch(() => undefined);
  };

  return (
    <div className={`media-custom-player ${ready ? 'is-ready' : 'is-loading'}`} ref={shellRef}>
      <div className="media-mini-player">
        <iframe
          ref={frameRef}
          className="media-embed-frame media-embed-frame--minimal"
          src={embedUrl}
          title={item.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <div
        className="media-custom-controls"
        aria-label="YouTube 플레이어 컨트롤"
        onPointerDown={() => markControlsEngaged()}
        onFocusCapture={() => markControlsEngaged()}
        onKeyDownCapture={() => markControlsEngaged()}
      >
        <div className="media-custom-timeline-row">
          <div className={`media-custom-timeline ${isScrubbing ? 'is-scrubbing' : ''}`} style={timelineStyle}>
            <input
              className="media-custom-seek"
              type="range"
              min="0"
              max={safeDuration || 0}
              step="0.1"
              value={seekValue}
              disabled={!ready || !safeDuration}
              draggable={false}
              onDragStart={preventMediaArchiveDrag}
              onPointerUp={handleSeekCommit}
              onPointerCancel={handleSeekCommit}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              onBlur={handleSeekCommit}
              onInput={handleSeekPreview}
              onChange={handleSeekPreview}
              onKeyDown={handleSeekKeyDown}
              onKeyUp={handleSeekKeyUp}
              aria-label="재생 위치"
            />
          </div>
          <div className="media-custom-timeline-meta">
            <div className="media-custom-quick-controls" aria-label="빠른 조그 컨트롤">
              <button
                type="button"
                className="media-custom-play-button"
                draggable={false}
                disabled={!ready}
                onDragStart={preventMediaArchiveDrag}
                onClick={togglePlayback}
                aria-label={ready ? (isPaused ? '재생' : '일시정지') : '로딩 중'}
              >
                <i className={!ready ? 'ri-loader-4-line ri-spin' : isPaused ? 'ri-play-fill' : 'ri-pause-fill'} />
              </button>
              {MEDIA_QUICK_SKIP_SECONDS.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  className="media-custom-skip-button"
                  draggable={false}
                  disabled={!ready}
                  onDragStart={preventMediaArchiveDrag}
                  onClick={() => skipBy(seconds)}
                  aria-label={`${Math.abs(seconds)}초 ${seconds < 0 ? '뒤로' : '앞으로'}`}
                >
                  {seconds > 0 ? `+${seconds}` : seconds}
                </button>
              ))}
            </div>
            <span className="media-custom-time-group" aria-label={`현재 ${formatMediaTime(displayedTime)}, 전체 ${formatMediaTime(safeDuration)}`}>
              <span>{formatMediaTime(displayedTime)}</span>
              <span>/</span>
              <span>{formatMediaTime(safeDuration)}</span>
            </span>
          </div>
        </div>
        <div
          className={`media-custom-jog ${isJogging ? 'is-jogging' : ''}`}
          role="slider"
          tabIndex={ready ? 0 : -1}
          aria-label="드래그로 재생 위치 미세 조정"
          aria-valuemin={-MEDIA_JOG_MAX_OFFSET_SECONDS}
          aria-valuemax={MEDIA_JOG_MAX_OFFSET_SECONDS}
          aria-valuenow={Number(jogOffsetSeconds.toFixed(1))}
          aria-disabled={!ready}
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
          onPointerDown={handleJogPointerDown}
          onTouchStart={handleJogTouchStart}
          onKeyDown={handleJogKeyDown}
        >
          <span className="media-custom-jog-side">뒤로</span>
          <span className="media-custom-jog-handle" aria-hidden="true">
            <i className="ri-drag-move-2-line" />
            <span>{isJogging ? jogOffsetLabel : '드래그'}</span>
          </span>
          <span className="media-custom-jog-side">앞으로</span>
        </div>
        <div className="media-custom-control-row">
          {MEDIA_DETAIL_SKIP_SECONDS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              className="media-custom-skip-button"
              draggable={false}
              disabled={!ready}
              onDragStart={preventMediaArchiveDrag}
              onClick={() => skipBy(seconds)}
              aria-label={`${Math.abs(seconds)}초 ${seconds < 0 ? '뒤로' : '앞으로'}`}
            >
              {seconds > 0 ? `+${seconds}` : seconds}
            </button>
          ))}
          <label className="media-custom-speed">
            <span>속도</span>
            <select
              value={playbackRate}
              disabled={!ready}
              onChange={handlePlaybackRateChange}
              aria-label="재생 속도"
            >
              {availablePlaybackRates.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}x
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`media-custom-action-button ${isFullscreen ? 'is-fullscreen-exit' : ''}`}
            draggable={false}
            onDragStart={preventMediaArchiveDrag}
            onClick={handleFullscreen}
            aria-label={isFullscreen ? '전체화면 나가기' : '전체화면'}
          >
            <i className={isFullscreen ? 'ri-fullscreen-exit-line' : 'ri-fullscreen-line'} />
            {isFullscreen ? '돌아가기' : '전체'}
          </button>
        </div>
      </div>
    </div>
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

function hasDescriptionText(value: TranslatableDescription) {
  return Boolean(
    compactText(cleanImportedMediaDescription(value.description_translated)) ||
    compactText(cleanImportedMediaDescription(value.description)) ||
    compactText(cleanImportedMediaDescription(value.description_original))
  );
}

const TranslatedDescription: React.FC<{
  value: TranslatableDescription;
  className: string;
  allowExpand?: boolean;
}> = ({ value, className, allowExpand = true }) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const translatedText = cleanImportedMediaDescription(value.description_translated) || cleanImportedMediaDescription(value.description);
  const originalText = cleanImportedMediaDescription(value.description_original);
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
  const canExpand = allowExpand && hasVisibleText && isExpandableDescription && (
    visibleText.length > MEDIA_DESCRIPTION_EXPAND_MIN_LENGTH ||
    visibleText.includes('\n')
  );

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
          {expanded ? '접기' : '자세히 보기'}
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

function hasLicenseAttribution(value: TranslatableDescription) {
  return Boolean(
    compactText(value.license_name) ||
    compactText(value.license_url) ||
    isLindyCollectionEntry(value)
  );
}

function hasStandaloneBodyContent(value: TranslatableDescription) {
  return hasDescriptionText(value) || hasLicenseAttribution(value);
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
} & MediaPlaybackProps> = ({ item, canManage, onEdit, onApprove, playingItemId, onPlayItem }) => {
  const expanded = playingItemId === item.id;
  const dateLabel = item.published_at || item.created_at;
  const originalUrl = item.normalized_url || item.url;
  const showCustomYouTubePlayer = expanded && item.platform === 'youtube' && Boolean(item.embed_url);
  const handlePreviewClick = () => {
    if (item.platform === 'instagram' || item.platform === 'other') {
      window.open(originalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    onPlayItem(item.id);
  };

  return (
    <article className={`media-card media-card--${item.platform} ${!item.is_approved ? 'is-pending' : ''}`}>
      <div className={`media-preview ${showCustomYouTubePlayer ? 'media-preview--custom-player' : ''}`}>
        {expanded ? (
          showCustomYouTubePlayer ? (
            <YouTubeCustomPlayer item={item} />
          ) : (
            <MediaEmbed item={item} autoplay />
          )
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
        {expanded && <TranslatedDescription value={item} className="media-card-description" />}
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
        <TranslatedDescription value={item} className="media-card-description" allowExpand={false} />
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

function getPlaylistSlashPath(playlist: SnsMediaPlaylist | null | undefined, playlists: SnsMediaPlaylist[]) {
  if (!playlist) return '/';
  const path = getPlaylistPath(playlist, playlists);
  return path ? `/${path}` : '/';
}

const PlaylistTreePicker: React.FC<{
  label: string;
  playlists: SnsMediaPlaylist[];
  value: string;
  onChange: (playlistId: string) => void;
  excludedId?: string;
  help?: string;
}> = ({
  label,
  playlists,
  value,
  onChange,
  excludedId = '',
  help,
}) => {
  const selectablePlaylists = useMemo(
    () => getSelectableTreePlaylists(playlists, excludedId),
    [excludedId, playlists],
  );
  const playlistById = useMemo(
    () => new Map(selectablePlaylists.map((playlist) => [playlist.id, playlist])),
    [selectablePlaylists],
  );
  const childrenByParent = useMemo(
    () => buildPlaylistChildrenMap(selectablePlaylists),
    [selectablePlaylists],
  );
  const initialParentId = value && playlistById.has(value) ? value : '';
  const [currentParentId, setCurrentParentId] = useState(initialParentId);
  const lastValueRef = useRef(value);

  useEffect(() => {
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    setCurrentParentId(value && playlistById.has(value) ? value : '');
  }, [playlistById, value]);

  useEffect(() => {
    if (!currentParentId || playlistById.has(currentParentId)) return;
    setCurrentParentId('');
  }, [currentParentId, playlistById]);

  const currentParent = currentParentId ? playlistById.get(currentParentId) || null : null;
  const currentChildren = childrenByParent.get(currentParentId) || [];
  const currentBreadcrumbs = currentParent ? getPlaylistBreadcrumbs(currentParent, selectablePlaylists) : [];

  const navigateTo = (playlistId: string) => {
    const nextPlaylistId = playlistId && playlistById.has(playlistId) ? playlistId : '';
    lastValueRef.current = nextPlaylistId;
    setCurrentParentId(nextPlaylistId);
    onChange(nextPlaylistId);
  };

  const navigateToPlaylist = (playlist: SnsMediaPlaylist) => navigateTo(playlist.id);

  return (
    <div className="media-field media-field--wide media-location-picker">
      <span>{label}</span>
      <div className="media-location-browser">
        <div className={`media-location-path ${currentParent ? 'has-back' : ''}`} aria-live="polite">
          {currentParent && (
            <button type="button" className="media-location-back" onClick={() => navigateTo(getPlaylistParentId(currentParent))} aria-label="상위 폴더로 이동">
              <i className="ri-arrow-left-line" />
            </button>
          )}
          <i className={currentParent ? 'ri-folder-open-line' : 'ri-folder-line'} />
          <nav className="media-location-crumbs" aria-label={`${label} 경로`}>
            <button type="button" className={!currentParent ? 'is-current' : ''} onClick={() => navigateTo('')}>
              /
            </button>
            {currentBreadcrumbs.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={playlist.id === currentParentId ? 'is-current' : ''}
                onClick={() => navigateTo(playlist.id)}
              >
                {playlist.name || '이름 없음'}
              </button>
            ))}
          </nav>
        </div>

        <div className="media-location-folder-list">
          {currentChildren.length ? currentChildren.map((playlist) => {
            const childCount = (childrenByParent.get(playlist.id) || []).length;
            const playlistLabel = playlist.name || '이름 없음';
            return (
              <button
                key={playlist.id}
                type="button"
                className="media-location-folder-row"
                onClick={() => navigateToPlaylist(playlist)}
                aria-label={`${playlistLabel} 폴더 열기`}
              >
                <i className="ri-folder-3-line" />
                <span>
                  <strong>{playlistLabel}</strong>
                  {childCount > 0 && <small>{childCount}개 하위 폴더</small>}
                </span>
                <i className="ri-arrow-right-s-line" />
              </button>
            );
          }) : (
            <div className="media-location-empty">
              <i className="ri-folder-warning-line" />
              <span>하위 폴더 없음</span>
            </div>
          )}
        </div>
      </div>
      {help && <small className="media-field-help">{help}</small>}
    </div>
  );
};

const MediaPlaylistDestinationPicker: React.FC<{
  playlists: SnsMediaPlaylist[];
  playlistId: string;
  newPlaylistName: string;
  newPlaylistParentId: string;
  onChange: (patch: Partial<MediaArchiveForm>) => void;
}> = ({
  playlists,
  playlistId,
  newPlaylistName,
  newPlaylistParentId,
  onChange,
}) => {
  const selectablePlaylists = useMemo(
    () => getSelectableTreePlaylists(playlists),
    [playlists],
  );
  const playlistById = useMemo(
    () => new Map(selectablePlaylists.map((playlist) => [playlist.id, playlist])),
    [selectablePlaylists],
  );
  const childrenByParent = useMemo(
    () => buildPlaylistChildrenMap(selectablePlaylists),
    [selectablePlaylists],
  );
  const selectedPlaylist = playlistById.get(playlistId) || null;
  const creatingName = compactText(newPlaylistName);
  const initialParentId = creatingName
    ? compactText(newPlaylistParentId)
    : selectedPlaylist
      ? selectedPlaylist.id
      : '';
  const [currentParentId, setCurrentParentId] = useState(initialParentId);
  const lastValueRef = useRef(`${playlistId}|${newPlaylistName}|${newPlaylistParentId}`);

  useEffect(() => {
    const nextValue = `${playlistId}|${newPlaylistName}|${newPlaylistParentId}`;
    if (nextValue === lastValueRef.current) return;
    lastValueRef.current = nextValue;
    const nextSelected = playlistById.get(playlistId) || null;
    setCurrentParentId(compactText(newPlaylistName)
      ? compactText(newPlaylistParentId)
      : nextSelected
        ? nextSelected.id
        : '');
  }, [newPlaylistName, newPlaylistParentId, playlistById, playlistId]);

  useEffect(() => {
    if (!currentParentId || playlistById.has(currentParentId)) return;
    setCurrentParentId('');
  }, [currentParentId, playlistById]);

  const currentParent = currentParentId ? playlistById.get(currentParentId) || null : null;
  const currentChildren = childrenByParent.get(currentParentId) || [];
  const currentPath = getPlaylistSlashPath(currentParent, selectablePlaylists);
  const currentBreadcrumbs = currentParent ? getPlaylistBreadcrumbs(currentParent, selectablePlaylists) : [];
  const [showCreateForm, setShowCreateForm] = useState(Boolean(creatingName));

  useEffect(() => {
    if (creatingName) setShowCreateForm(true);
  }, [creatingName]);

  const patchValue = (patch: Partial<MediaArchiveForm>) => {
    lastValueRef.current = `${patch.playlistId ?? playlistId}|${patch.newPlaylistName ?? newPlaylistName}|${patch.newPlaylistParentId ?? newPlaylistParentId}`;
    onChange(patch);
  };

  const navigateTo = (parentId: string) => {
    const nextParentId = parentId && playlistById.has(parentId) ? parentId : '';
    const nextPlaylist = nextParentId ? playlistById.get(nextParentId) || null : null;
    setCurrentParentId(nextParentId);
    if (creatingName) {
      patchValue({
        playlistId: '',
        newPlaylistParentId: nextParentId,
      });
      return;
    }
    patchValue({
      playlistId: nextParentId,
      newPlaylistName: '',
      newPlaylistParentId: '',
      collectionName: nextPlaylist?.name || '',
    });
  };

  const handleNewPlaylistName = (value: string) => {
    const nextName = compactText(value);
    patchValue({
      newPlaylistName: value,
      newPlaylistParentId: nextName ? currentParentId : '',
      ...(nextName ? { playlistId: '', collectionName: value } : {}),
    });
  };

  const startNewPlaylist = () => {
    setShowCreateForm(true);
    patchValue({
      newPlaylistParentId: currentParentId,
    });
  };

  return (
    <div className="media-field media-field--wide media-destination-picker">
      <span>저장 위치</span>
      <div className="media-destination-simple">
        <div className={`media-location-path ${currentParent ? 'has-back' : ''} ${currentParentId && !creatingName ? 'is-target' : ''}`}>
          {currentParent && (
            <button type="button" className="media-location-back" onClick={() => navigateTo(getPlaylistParentId(currentParent))} aria-label="상위 폴더로 이동">
              <i className="ri-arrow-left-line" />
            </button>
          )}
          <i className={currentParent ? 'ri-folder-open-line' : 'ri-folder-line'} />
          <nav className="media-location-crumbs" aria-label="저장 위치 경로">
            <button type="button" className={!currentParent ? 'is-current' : ''} onClick={() => navigateTo('')}>
              /
            </button>
            {currentBreadcrumbs.map((playlist) => (
              <button
                key={playlist.id}
                type="button"
                className={playlist.id === currentParentId ? 'is-current' : ''}
                onClick={() => navigateTo(playlist.id)}
              >
                {playlist.name || '이름 없음'}
              </button>
            ))}
          </nav>
        </div>

        <div className="media-destination-actions">
          <button type="button" className="media-destination-action" onClick={startNewPlaylist}>
            <i className="ri-add-line" />
            새 재생목록
          </button>
        </div>

        {showCreateForm && (
          <label className={`media-destination-create-row ${creatingName ? 'is-active' : ''}`}>
            <span>
              <i className="ri-add-line" />
              새 재생목록 이름
            </span>
            <input
              value={newPlaylistName}
              onChange={(event) => handleNewPlaylistName(event.target.value)}
              placeholder={`${currentPath}에 만들 이름`}
            />
          </label>
        )}

        <div className="media-location-folder-list">
          {currentChildren.length ? currentChildren.map((playlist) => {
            const childCount = (childrenByParent.get(playlist.id) || []).length;
            const playlistLabel = playlist.name || '이름 없음';
            return (
              <button
                key={playlist.id}
                type="button"
                className="media-location-folder-row"
                onClick={() => navigateTo(playlist.id)}
                aria-label={`${playlistLabel} 폴더 열기`}
              >
                <i className="ri-folder-3-line" />
                <span>
                  <strong>{playlistLabel}</strong>
                  {childCount > 0 && <small>{childCount}개 하위 폴더</small>}
                </span>
                <i className="ri-arrow-right-s-line" />
              </button>
            );
          }) : (
            <div className="media-location-empty">
              <i className="ri-folder-warning-line" />
              <span>하위 폴더 없음</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MediaItemEditPanel: React.FC<{
  item: SnsMediaItem;
  form: MediaArchiveForm;
  playlists: SnsMediaPlaylist[];
  availableGenres: string[];
  onChange: (form: MediaArchiveForm) => void;
  onClose: () => void;
  onDelete: (item: SnsMediaItem) => void;
  onSubmit: (event: React.FormEvent) => void;
}> = ({ item, form, playlists, availableGenres, onChange, onClose, onDelete, onSubmit }) => {
  const updateForm = (patch: Partial<MediaArchiveForm>) => onChange({ ...form, ...patch });

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
          <MediaPlaylistDestinationPicker
            playlists={playlists}
            playlistId={form.playlistId}
            newPlaylistName={form.newPlaylistName}
            newPlaylistParentId={form.newPlaylistParentId}
            onChange={updateForm}
          />
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
          <button type="button" className="media-danger-button media-edit-delete-button" onClick={() => onDelete(item)}>
            <i className="ri-delete-bin-line" />
            삭제
          </button>
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
  canMove?: boolean;
  isDragging?: boolean;
  isOrganizing?: boolean;
  onEdit?: (item: SnsMediaItem) => void;
  onMovePointerDown?: (event: React.PointerEvent<HTMLElement>, item: SnsMediaItem) => void;
} & MediaPlaybackProps> = ({
  item,
  canManage = false,
  canMove = false,
  isDragging = false,
  isOrganizing = false,
  onEdit,
  onMovePointerDown,
  playingItemId,
  onPlayItem,
}) => {
  const expanded = playingItemId === item.id;
  const metaText = [
    item.author_name,
    item.dance_genre,
    item.collection_name,
    platformLabel(item.platform),
  ].filter(Boolean).join(' · ');
  const canEdit = canManage && Boolean(onEdit);

  if (expanded) {
    return (
      <article className="media-mini-card media-mini-card--expanded is-playing">
        {item.platform === 'youtube' && item.embed_url ? (
          <YouTubeCustomPlayer item={item} />
        ) : (
          <div className="media-mini-player">
            <MediaEmbed item={item} autoplay />
          </div>
        )}
        <div className="media-mini-expanded-footer">
          <span className="media-mini-copy">
            <strong>{item.title || '제목 없음'}</strong>
            <small>{metaText}</small>
          </span>
          <span className="media-mini-expanded-actions">
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
  const canDragMove = isOrganizing && canMove && Boolean(onMovePointerDown);

  return (
    <article
      className={`media-mini-card ${canEdit ? 'media-mini-card--editable' : ''} ${canDragMove ? 'media-mini-card--organizable' : ''} ${isDragging ? 'is-dragging' : ''}`}
      draggable={false}
      data-media-drag-allowed={canDragMove ? 'true' : undefined}
      onPointerDown={(event) => {
        if (canDragMove) onMovePointerDown?.(event, item);
      }}
    >
      <button
        className="media-mini-main-button"
        type="button"
        draggable={false}
        onDragStart={preventMediaArchiveDrag}
        onClick={(event) => {
          if (canDragMove) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          handlePlay();
        }}
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
      {canDragMove && (
        <span
          className="media-mini-drag-handle"
          aria-hidden="true"
        >
          <i className="ri-drag-move-line" />
        </span>
      )}
    </article>
  );
};

const MediaStandalonePlayerPage: React.FC<{
  item: SnsMediaItem;
  onBack: () => void;
  canManage?: boolean;
  onEdit?: (item: SnsMediaItem) => void;
}> = ({ item, onBack, canManage = false, onEdit }) => {
  const [isBodyModalOpen, setIsBodyModalOpen] = useState(false);
  const metaText = [
    item.author_name,
    item.dance_genre,
    item.collection_name,
    platformLabel(item.platform),
  ].filter(Boolean).join(' · ');
  const originalUrl = item.normalized_url || item.url;
  const showCustomYouTubePlayer = item.platform === 'youtube' && Boolean(item.embed_url);
  const hasBodyContent = hasStandaloneBodyContent(item);

  return (
    <main className="media-archive-player-page" onDragStartCapture={preventMediaArchiveDrag}>
      <button
        type="button"
        className="media-player-back-button"
        draggable={false}
        onDragStart={preventMediaArchiveDrag}
        onClick={onBack}
        aria-label="아카이브로 돌아가기"
      >
        <i className="ri-arrow-left-line" />
        <span>돌아가기</span>
      </button>
      <section className="media-standalone-player-shell" aria-label={item.title || '영상 재생'}>
        {showCustomYouTubePlayer ? (
          <YouTubeCustomPlayer item={item} />
        ) : (
          <div className="media-standalone-embed-wrap">
            <MediaEmbed item={item} autoplay />
          </div>
        )}
        <div className="media-standalone-player-meta">
          <div className="media-standalone-player-copy">
            <h1>{item.title || '제목 없음'}</h1>
            {metaText && <p>{metaText}</p>}
          </div>
          <div className="media-standalone-player-actions">
            {item.platform !== 'youtube' && originalUrl && (
              <a href={originalUrl} target="_blank" rel="noreferrer" draggable={false} onDragStart={preventMediaArchiveDrag}>
                <i className="ri-external-link-line" />
                원본
              </a>
            )}
            {hasBodyContent && (
              <button
                type="button"
                className="media-standalone-body-button"
                draggable={false}
                onDragStart={preventMediaArchiveDrag}
                onClick={() => setIsBodyModalOpen(true)}
              >
                <i className="ri-file-text-line" />
                본문
              </button>
            )}
            {canManage && onEdit && (
              <button type="button" draggable={false} onDragStart={preventMediaArchiveDrag} onClick={() => onEdit(item)}>
                <i className="ri-edit-2-line" />
                수정
              </button>
            )}
          </div>
        </div>
        <TranslatedDescription value={item} className="media-standalone-description" />
        <LicenseAttributionNotice value={item} compact />
      </section>
      {isBodyModalOpen && (
        <MediaModalFrame label="본문" onClose={() => setIsBodyModalOpen(false)}>
          <section className="media-standalone-body-panel media-modal-panel">
            <header className="media-standalone-body-header">
              <div>
                <p className="media-eyebrow">Body</p>
                <h2>{item.title || '본문'}</h2>
              </div>
              <button
                type="button"
                className="media-icon-button"
                onClick={() => setIsBodyModalOpen(false)}
                aria-label="본문 닫기"
              >
                <i className="ri-close-line" />
              </button>
            </header>
            <div className="media-standalone-body-content">
              <TranslatedDescription value={item} className="media-body-modal-description" allowExpand={false} />
              <LicenseAttributionNotice value={item} compact />
            </div>
          </section>
        </MediaModalFrame>
      )}
    </main>
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
type MediaArchiveHistoryView =
  | { kind: 'playlist'; id: string }
  | { kind: 'legacy'; id: string };

const MEDIA_ARCHIVE_HISTORY_VIEW_KEY = '__swingenjoyMediaArchiveView';

function getMediaArchiveHistoryViewKey(view: MediaArchiveHistoryView) {
  return `${view.kind}:${view.id}`;
}

function getMediaArchiveHistoryView(state: unknown): MediaArchiveHistoryView | null {
  if (!state || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[MEDIA_ARCHIVE_HISTORY_VIEW_KEY];
  if (!value || typeof value !== 'object') return null;
  const kind = (value as Record<string, unknown>).kind;
  const id = (value as Record<string, unknown>).id;
  if ((kind !== 'playlist' && kind !== 'legacy') || typeof id !== 'string' || !id) return null;
  return { kind, id };
}

function pushMediaArchiveHistoryView(view: MediaArchiveHistoryView) {
  if (typeof window === 'undefined') return;
  const currentState = window.history.state;
  const nextState = currentState && typeof currentState === 'object' ? { ...currentState } : {};
  nextState[MEDIA_ARCHIVE_HISTORY_VIEW_KEY] = view;
  window.history.pushState(nextState, '', window.location.href);
}

function replaceMediaArchiveHistoryView(view: MediaArchiveHistoryView | null) {
  if (typeof window === 'undefined') return;
  const currentState = window.history.state;
  const nextState = currentState && typeof currentState === 'object' ? { ...currentState } : {};
  if (view) {
    nextState[MEDIA_ARCHIVE_HISTORY_VIEW_KEY] = view;
  } else {
    delete nextState[MEDIA_ARCHIVE_HISTORY_VIEW_KEY];
  }
  window.history.replaceState(nextState, '', window.location.href);
}

function getMediaPlayerQueryId(search: string) {
  return compactText(new URLSearchParams(search).get(MEDIA_PLAYER_QUERY_PARAM));
}

function setMediaPlayerQueryId(search: string, itemId: string) {
  const params = new URLSearchParams(search);
  params.set(MEDIA_PLAYER_QUERY_PARAM, itemId);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

function clearMediaPlayerQueryId(search: string) {
  const params = new URLSearchParams(search);
  params.delete(MEDIA_PLAYER_QUERY_PARAM);
  const nextSearch = params.toString();
  return nextSearch ? `?${nextSearch}` : '';
}

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

function getPlaylistHistoryLineage(playlistId: string, playlists: SnsMediaPlaylist[]): MediaArchiveHistoryView[] {
  const playlist = playlists.find((entry) => entry.id === playlistId);
  if (!playlist) return playlistId ? [{ kind: 'playlist', id: playlistId }] : [];
  return getPlaylistBreadcrumbs(playlist, playlists).map((entry) => ({ kind: 'playlist', id: entry.id }));
}

function getItemLegacyGroupKey(item: SnsMediaItem) {
  return `collection:${compactText(item.collection_name) || '컬렉션 미지정'}`;
}

function getMediaItemArchiveView(item: SnsMediaItem): MediaArchiveHistoryView {
  const playlistId = compactText(item.playlist_id);
  return playlistId ? { kind: 'playlist', id: playlistId } : { kind: 'legacy', id: getItemLegacyGroupKey(item) };
}

type MediaPointerDragSource =
  | { kind: 'playlist'; playlist: SnsMediaPlaylist }
  | { kind: 'item'; item: SnsMediaItem };

type MediaPointerDragSession = MediaPointerDragSource & {
  pointerId: number;
  startX: number;
  startY: number;
  previousUserSelect: string;
  dragging: boolean;
  cleanup: (() => void) | null;
};

const CollectionArchiveView: React.FC<{
  items: SnsMediaItem[];
  playlists: SnsMediaPlaylist[];
  searchQuery: string;
  initialView?: MediaArchiveHistoryView | null;
  onInitialViewApplied?: () => void;
  canOrganize: boolean;
  canManageItem: (item: SnsMediaItem) => boolean;
  canMoveItem: (item: SnsMediaItem) => boolean;
  canManagePlaylist: (playlist: SnsMediaPlaylist) => boolean;
  onEditItem: (item: SnsMediaItem) => void;
  onEditPlaylist: (playlist: SnsMediaPlaylist) => void;
  onMoveItem: (item: SnsMediaItem, playlistId: string) => Promise<boolean>;
  onMovePlaylist: (playlist: SnsMediaPlaylist, parentId: string) => Promise<boolean>;
  onActivePlaylistChange?: (playlist: SnsMediaPlaylist | null) => void;
} & MediaPlaybackProps> = ({
  items,
  playlists,
  searchQuery,
  initialView = null,
  onInitialViewApplied,
  canOrganize,
  canManageItem,
  canMoveItem,
  canManagePlaylist,
  onEditItem,
  onEditPlaylist,
  onMoveItem,
  onMovePlaylist,
  onActivePlaylistChange,
  playingItemId,
  onPlayItem,
}) => {
  const [activePlaylistId, setActivePlaylistId] = useState(() => initialView?.kind === 'playlist' ? initialView.id : '');
  const [activeLegacyKey, setActiveLegacyKey] = useState(() => initialView?.kind === 'legacy' ? initialView.id : '');
  const [navigationDirection, setNavigationDirection] = useState<MediaArchiveNavigationDirection>(() => initialView ? 'forward' : 'neutral');
  const [pressedRowKey, setPressedRowKey] = useState('');
  const [isOrganizing, setIsOrganizing] = useState(false);
  const [draggedPlaylistId, setDraggedPlaylistId] = useState('');
  const [draggedItemId, setDraggedItemId] = useState('');
  const [dropTargetId, setDropTargetId] = useState('');
  const [dragPreview, setDragPreview] = useState<{ id: string; label: string; x: number; y: number } | null>(null);
  const archiveHistoryStackRef = useRef<string[]>([]);
  const pressTimerRef = useRef<number | null>(null);
  const dragClickSuppressTimerRef = useRef<number | null>(null);
  const suppressPlaylistOpenRef = useRef(false);
  const searchQueryInitializedRef = useRef(false);
  const appliedInitialViewRef = useRef('');
  const folderPathAnchorRef = useRef<HTMLDivElement | null>(null);
  const folderPathRef = useRef<HTMLElement | null>(null);
  const pointerDragRef = useRef<MediaPointerDragSession | null>(null);
  const [folderPathFixed, setFolderPathFixed] = useState(false);
  const [folderPathFrame, setFolderPathFrame] = useState({ top: 0, left: 0, width: 0, height: 0 });
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
    onActivePlaylistChange?.(activePlaylist);
  }, [activePlaylist, onActivePlaylistChange]);

  useEffect(() => {
    if (!canOrganize && isOrganizing) {
      setDraggedPlaylistId('');
      setDraggedItemId('');
      setDropTargetId('');
      setDragPreview(null);
      setIsOrganizing(false);
    }
  }, [canOrganize, isOrganizing]);

  useEffect(() => {
    if (activeLegacyKey && !activeLegacyGroup) {
      setNavigationDirection('back');
      setActiveLegacyKey('');
    }
  }, [activeLegacyGroup, activeLegacyKey]);

  useEffect(() => {
    if (!activePlaylist) {
      setFolderPathFixed(false);
      setFolderPathFrame({ top: 0, left: 0, width: 0, height: 0 });
      return undefined;
    }

    let frameRequest = 0;
    const getStickyTop = () => {
      const path = folderPathRef.current;
      if (!path) return 70;
      const parsedTop = Number.parseFloat(window.getComputedStyle(path).top);
      return Number.isFinite(parsedTop) ? parsedTop : 70;
    };
    const updateFolderPathPosition = () => {
      frameRequest = 0;
      const anchor = folderPathAnchorRef.current;
      const path = folderPathRef.current;
      if (!anchor || !path) {
        setFolderPathFixed(false);
        return;
      }

      const top = getStickyTop();
      const anchorRect = anchor.getBoundingClientRect();
      const pathRect = path.getBoundingClientRect();
      const detailRect = anchor.closest('.media-playlist-detail')?.getBoundingClientRect();
      const height = pathRect.height || anchorRect.height;
      const shouldFix = anchorRect.top <= top && (!detailRect || detailRect.bottom > top + height + 12);

      setFolderPathFrame((prev) => {
        const next = {
          top,
          left: anchorRect.left,
          width: anchorRect.width,
          height,
        };
        if (
          Math.abs(prev.top - next.top) < 0.5 &&
          Math.abs(prev.left - next.left) < 0.5 &&
          Math.abs(prev.width - next.width) < 0.5 &&
          Math.abs(prev.height - next.height) < 0.5
        ) {
          return prev;
        }
        return next;
      });
      setFolderPathFixed((prev) => (prev === shouldFix ? prev : shouldFix));
    };
    const scheduleUpdate = () => {
      if (frameRequest) return;
      frameRequest = window.requestAnimationFrame(updateFolderPathPosition);
    };

    updateFolderPathPosition();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('orientationchange', scheduleUpdate);
    document.addEventListener('scroll', scheduleUpdate, { passive: true, capture: true });
    document.addEventListener('touchmove', scheduleUpdate, { passive: true });
    document.addEventListener('wheel', scheduleUpdate, { passive: true });
    const fallbackTimer = window.setInterval(scheduleUpdate, 120);
    return () => {
      if (frameRequest) window.cancelAnimationFrame(frameRequest);
      window.clearInterval(fallbackTimer);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('orientationchange', scheduleUpdate);
      document.removeEventListener('scroll', scheduleUpdate, true);
      document.removeEventListener('touchmove', scheduleUpdate);
      document.removeEventListener('wheel', scheduleUpdate);
    };
  }, [activePlaylist]);

  useEffect(() => {
    if (!searchQueryInitializedRef.current) {
      searchQueryInitializedRef.current = true;
      return;
    }
    setNavigationDirection('neutral');
    setActivePlaylistId('');
    setActiveLegacyKey('');
    setIsOrganizing(false);
    setDraggedPlaylistId('');
    setDraggedItemId('');
    setDropTargetId('');
    archiveHistoryStackRef.current = [];
  }, [searchQuery]);

  useEffect(() => () => {
    if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
    if (dragClickSuppressTimerRef.current) window.clearTimeout(dragClickSuppressTimerRef.current);
    if (pointerDragRef.current?.cleanup) pointerDragRef.current.cleanup();
  }, []);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const view = getMediaArchiveHistoryView(event.state);
      setNavigationDirection('back');
      setIsOrganizing(false);
      setDraggedPlaylistId('');
      setDraggedItemId('');
      setDropTargetId('');
      setDragPreview(null);

      if (!view) {
        archiveHistoryStackRef.current = [];
        setActivePlaylistId('');
        setActiveLegacyKey('');
        return;
      }

      const viewKey = getMediaArchiveHistoryViewKey(view);
      const targetIndex = archiveHistoryStackRef.current.lastIndexOf(viewKey);
      archiveHistoryStackRef.current = targetIndex >= 0
        ? archiveHistoryStackRef.current.slice(0, targetIndex + 1)
        : [...archiveHistoryStackRef.current, viewKey];

      if (view.kind === 'playlist') {
        setActiveLegacyKey('');
        setActivePlaylistId(view.id);
        return;
      }

      setActivePlaylistId('');
      setActiveLegacyKey(view.id);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
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

  const applyArchiveView = (view: MediaArchiveHistoryView | null, direction: MediaArchiveNavigationDirection) => {
    setNavigationDirection(direction);
    setIsOrganizing(false);
    setDraggedPlaylistId('');
    setDropTargetId('');
    setDragPreview(null);

    if (!view) {
      setActivePlaylistId('');
      setActiveLegacyKey('');
      return;
    }

    if (view.kind === 'playlist') {
      setActiveLegacyKey('');
      setActivePlaylistId(view.id);
      return;
    }

    setActivePlaylistId('');
    setActiveLegacyKey(view.id);
  };

  const pushArchiveView = (view: MediaArchiveHistoryView) => {
    const viewKey = getMediaArchiveHistoryViewKey(view);
    const stack = archiveHistoryStackRef.current;
    if (stack[stack.length - 1] === viewKey) return;
    pushMediaArchiveHistoryView(view);
    archiveHistoryStackRef.current = [...archiveHistoryStackRef.current, viewKey];
  };

  const pushArchiveViews = (views: MediaArchiveHistoryView[]) => {
    views.forEach((view) => pushArchiveView(view));
  };

  const goBackToArchiveView = (view: MediaArchiveHistoryView | null) => {
    const stack = archiveHistoryStackRef.current;
    let steps = stack.length;
    if (view) {
      const targetIndex = stack.lastIndexOf(getMediaArchiveHistoryViewKey(view));
      if (targetIndex < 0) return false;
      steps = stack.length - 1 - targetIndex;
    }

    if (steps <= 0 || steps > stack.length) return false;
    window.history.go(-steps);
    return true;
  };

  const navigateToPlaylist = (playlistId: string, direction: MediaArchiveNavigationDirection = 'forward') => {
    const view = playlistId ? { kind: 'playlist' as const, id: playlistId } : null;
    if (direction === 'forward' && view) {
      pushArchiveViews(getPlaylistHistoryLineage(playlistId, playlists));
      applyArchiveView(view, direction);
      return;
    }
    if (direction === 'back' && goBackToArchiveView(view)) return;
    applyArchiveView(view, direction);
  };

  const navigateToRoot = () => {
    if (goBackToArchiveView(null)) return;
    applyArchiveView(null, 'back');
  };

  const navigateToLegacyGroup = (groupKey: string) => {
    const view = { kind: 'legacy' as const, id: groupKey };
    pushArchiveView(view);
    applyArchiveView(view, 'forward');
  };

  useEffect(() => {
    if (!initialView) return;
    const viewKey = getMediaArchiveHistoryViewKey(initialView);
    if (appliedInitialViewRef.current === viewKey) return;
    appliedInitialViewRef.current = viewKey;
    archiveHistoryStackRef.current = initialView.kind === 'playlist'
      ? getPlaylistHistoryLineage(initialView.id, playlists).map(getMediaArchiveHistoryViewKey)
      : [viewKey];
    applyArchiveView(initialView, 'forward');
    onInitialViewApplied?.();
  }, [initialView, onInitialViewApplied, playlists]);

  const getLegacyGroupDisplayTitle = (group: LegacyArchiveGroup) => (
    group.title === '컬렉션 미지정' ? '미분류' : group.title
  );

  const clearPlaylistDragState = () => {
    setDraggedPlaylistId('');
    setDraggedItemId('');
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

  const getDraggedItem = () => (
    draggedItemId ? items.find((item) => item.id === draggedItemId) || null : null
  );

  const canMovePlaylistInto = (source: SnsMediaPlaylist, target: SnsMediaPlaylist) => {
    if (!canOrganize) return false;
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
    if (!canOrganize) return false;
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

  const canMoveItemToPlaylist = (source: SnsMediaItem, targetPlaylistId: string) => {
    if (!canOrganize) return false;
    if (!canMoveItem(source)) return false;
    const nextPlaylistId = compactText(targetPlaylistId);
    if (compactText(source.playlist_id) === nextPlaylistId) return false;
    if (!nextPlaylistId) return true;
    const target = playlists.find((playlist) => playlist.id === nextPlaylistId);
    if (!target) return false;
    if (isShortcutPlaylist(target)) return false;
    return true;
  };

  const canDropItemInto = (target: SnsMediaPlaylist) => {
    const source = getDraggedItem();
    if (!source) return false;
    return canMoveItemToPlaylist(source, target.id);
  };

  const canDropItemToParent = (parentId: string) => {
    const source = getDraggedItem();
    if (!source) return false;
    return canMoveItemToPlaylist(source, parentId);
  };

  const canDropIntoPlaylistTarget = (target: SnsMediaPlaylist) => (
    draggedItemId ? canDropItemInto(target) : canDropPlaylistInto(target)
  );

  const canDropToParentTarget = (parentId: string) => (
    draggedItemId ? canDropItemToParent(parentId) : canDropPlaylistToParent(parentId)
  );

  const getDropTargetClassName = (targetKey: string, canDrop: boolean) => {
    if (dropTargetId !== targetKey) return '';
    return canDrop ? ' is-drop-target' : ' is-drop-blocked';
  };

  const getPointerDropCandidate = (source: MediaPointerDragSource, x: number, y: number) => {
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
          canDrop: source.kind === 'playlist'
            ? canMovePlaylistInto(source.playlist, target)
            : canMoveItemToPlaylist(source.item, target.id),
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
        canDrop: source.kind === 'playlist'
          ? canMovePlaylistToParent(source.playlist, parentId)
          : canMoveItemToPlaylist(source.item, parentId),
      };
    }

    return null;
  };

  const handlePlaylistDragStart = (event: React.DragEvent<HTMLElement>, playlist: SnsMediaPlaylist) => {
    event.stopPropagation();
    if (!canOrganize || !isOrganizing || !canManagePlaylist(playlist)) {
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
    if (!canOrganize || !isOrganizing || !canManagePlaylist(playlist)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('.media-folder-inline-action, .media-folder-source-button')) return;

    event.preventDefault();
    event.stopPropagation();

    if (pointerDragRef.current?.cleanup) pointerDragRef.current.cleanup();

    const dragSession: MediaPointerDragSession = {
      kind: 'playlist',
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
        ? getPointerDropCandidate(session, upEvent.clientX, upEvent.clientY)
        : null;

      if (session.cleanup) session.cleanup();
      document.body.style.userSelect = session.previousUserSelect;
      pointerDragRef.current = null;
      keepPlaylistOpenSuppressed();
      clearPlaylistDragState();

      if (!candidate?.canDrop) return;
      if (session.kind !== 'playlist') return;
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
      const candidate = getPointerDropCandidate(dragSession, moveEvent.clientX, moveEvent.clientY);
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

  const handleItemPointerDown = (event: React.PointerEvent<HTMLElement>, item: SnsMediaItem) => {
    if (!canOrganize || !isOrganizing || !canMoveItem(item)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest('.media-mini-edit-button, .media-mini-action-button, .media-custom-player, .media-mini-player, a, input, textarea, select')) return;

    event.preventDefault();
    event.stopPropagation();

    if (pointerDragRef.current?.cleanup) pointerDragRef.current.cleanup();

    const dragSession: MediaPointerDragSession = {
      kind: 'item',
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      previousUserSelect: document.body.style.userSelect,
      dragging: false,
      cleanup: null,
    };

    const finishPointerDrag = (upEvent?: PointerEvent, cancelled = false) => {
      const session = pointerDragRef.current;
      if (!session || session.pointerId !== dragSession.pointerId) return;

      const wasDragging = session.dragging;
      const candidate = !cancelled && upEvent && wasDragging
        ? getPointerDropCandidate(session, upEvent.clientX, upEvent.clientY)
        : null;

      if (session.cleanup) session.cleanup();
      document.body.style.userSelect = session.previousUserSelect;
      pointerDragRef.current = null;
      keepPlaylistOpenSuppressed();
      clearPlaylistDragState();

      if (!candidate?.canDrop || session.kind !== 'item') return;
      if (candidate.type === 'playlist') {
        void onMoveItem(session.item, candidate.target.id);
        return;
      }
      void onMoveItem(session.item, candidate.parentId);
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
        setDraggedItemId(item.id);
      }

      moveEvent.preventDefault();
      const candidate = getPointerDropCandidate(dragSession, moveEvent.clientX, moveEvent.clientY);
      setDropTargetId(candidate?.targetKey || '');
      setDragPreview({
        id: item.id,
        label: item.title || '제목 없음',
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
    if (!canOrganize || !isOrganizing || !draggedPlaylistId) return;
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
    if (!canOrganize || !isOrganizing || !draggedPlaylistId) return;
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
    if (!canOrganize || !isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const canDrop = canDropPlaylistToParent(parentId);
    event.dataTransfer.dropEffect = canDrop ? 'move' : 'none';
    setDropTargetId(targetKey);
  };

  const handlePlaylistParentDrop = async (event: React.DragEvent<HTMLElement>, parentId: string, targetKey: string) => {
    if (!canOrganize || !isOrganizing || !draggedPlaylistId) return;
    event.preventDefault();
    event.stopPropagation();
    const source = getDraggedPlaylist();
    const canDrop = canDropPlaylistToParent(parentId);
    keepPlaylistOpenSuppressed();
    clearPlaylistDragState();
    if (!source || !canDrop) return;
    await onMovePlaylist(source, targetKey === 'path:root' ? '' : parentId);
  };

  const renderOrganizeButton = () => {
    if (!canOrganize) return null;
    return (
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
  };

  const renderOrganizeHint = () => (
    isOrganizing ? (
      <div className="media-folder-organize-hint">
        <i className="ri-drag-move-line" />
        재생목록이나 영상 카드를 잡고 다른 재생목록 위에 놓으면 그 안으로, 상단 경로에 놓으면 그 위치로 이동합니다.
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
    const canDrop = isDropTarget && canDropIntoPlaylistTarget(playlist);
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
        const canDrop = canDropToParentTarget(crumb.id);
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
        <MediaMiniCard
          item={item}
          canManage={canManageItem(item)}
          onEdit={onEditItem}
          playingItemId={playingItemId}
          onPlayItem={onPlayItem}
        />
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
    const canDropToUpTarget = canDropToParentTarget(parentId);
    const folderPathAnchorStyle = folderPathFixed
      ? { height: `${folderPathFrame.height}px` }
      : undefined;
    const folderPathStyle = folderPathFixed
      ? {
          top: `${folderPathFrame.top}px`,
          left: `${folderPathFrame.left}px`,
          width: `${folderPathFrame.width}px`,
        }
      : undefined;

    return (
      <section key={activePlaylist.id} className={`media-playlist-detail media-folder-room ${stackClassName}`}>
        <div
          ref={folderPathAnchorRef}
          className={`media-folder-path-anchor${folderPathFixed ? ' is-fixed' : ''}`}
          style={folderPathAnchorStyle}
        >
          <nav
            ref={folderPathRef}
            className={`media-folder-path${folderPathFixed ? ' is-fixed' : ''}`}
            aria-label="재생목록 경로"
            style={folderPathStyle}
          >
            <button
              type="button"
              className={`media-folder-up-button${getDropTargetClassName(upDropTargetKey, canDropToUpTarget)}`}
              aria-label={`${parentPlaylist ? parentPlaylist.name : '최상위'}로 이동`}
              title={`${parentPlaylist ? parentPlaylist.name : '최상위'}로 이동`}
              data-media-parent-drop-id={parentId}
              data-media-parent-drop-key={upDropTargetKey}
              onClick={() => navigateToPlaylist(parentId, 'back')}
              onDragOver={(event) => handlePlaylistParentDragOver(event, parentId, upDropTargetKey)}
              onDragLeave={(event) => handlePlaylistDropTargetLeave(event, upDropTargetKey)}
              onDrop={(event) => handlePlaylistParentDrop(event, parentId, upDropTargetKey)}
            >
              <i className="ri-arrow-left-line" />
            </button>
            {renderPathTrail()}
          </nav>
        </div>
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
                  canMove={canMoveItem(item)}
                  isDragging={draggedItemId === item.id}
                  isOrganizing={isOrganizing}
                  onEdit={onEditItem}
                  onMovePointerDown={handleItemPointerDown}
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

const MediaTrashModal: React.FC<{
  items: SnsMediaItem[];
  playlists: SnsMediaPlaylist[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onRestoreItem: (item: SnsMediaItem) => void;
  onPermanentDeleteItem: (item: SnsMediaItem) => void;
  onRestorePlaylist: (playlist: SnsMediaPlaylist) => void;
  onPermanentDeletePlaylist: (playlist: SnsMediaPlaylist) => void;
}> = ({
  items,
  playlists,
  loading,
  onClose,
  onRefresh,
  onRestoreItem,
  onPermanentDeleteItem,
  onRestorePlaylist,
  onPermanentDeletePlaylist,
}) => {
  const totalCount = items.length + playlists.length;

  return (
    <MediaModalFrame label="SNS 아카이브 휴지통" onClose={onClose}>
      <section className="media-trash-panel media-modal-panel">
        <header className="media-edit-header">
          <div>
            <p className="media-eyebrow">Trash</p>
            <h2>휴지통</h2>
            <span>삭제 후 7일 안에 복구할 수 있습니다.</span>
          </div>
          <button type="button" className="media-icon-button" onClick={onClose} aria-label="휴지통 닫기">
            <i className="ri-close-line" />
          </button>
        </header>

        <div className="media-trash-toolbar">
          <span>{loading ? '불러오는 중...' : `${totalCount}개 항목`}</span>
          <button type="button" className="media-ghost-button" onClick={onRefresh} disabled={loading}>
            <i className="ri-refresh-line" />
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="media-state">휴지통을 불러오는 중...</div>
        ) : totalCount === 0 ? (
          <div className="media-state media-state--empty">
            <i className="ri-delete-bin-6-line" />
            <strong>휴지통이 비었습니다</strong>
            <span>삭제한 카드와 재생목록은 7일 동안 여기에 표시됩니다.</span>
          </div>
        ) : (
          <div className="media-trash-list">
            {!!playlists.length && (
              <section className="media-trash-section">
                <h3>재생목록</h3>
                {playlists.map((playlist) => {
                  const expired = isTrashExpired(playlist.delete_expires_at);
                  return (
                    <article key={playlist.id} className={`media-trash-row ${expired ? 'is-expired' : ''}`}>
                      <i className="ri-folder-3-line" />
                      <span className="media-trash-copy">
                        <strong>{playlist.name || '이름 없음'}</strong>
                        <small>
                          카드 {playlist.deleted_branch_item_count ?? 0}개 · 하위 포함 {Math.max(Number(playlist.deleted_branch_playlist_count || 1) - 1, 0)}개 · 만료 {formatTrashDate(playlist.delete_expires_at)}
                        </small>
                      </span>
                      <span className="media-trash-actions">
                        <button type="button" onClick={() => onRestorePlaylist(playlist)} disabled={expired}>
                          <i className="ri-arrow-go-back-line" />
                          복구
                        </button>
                        <button type="button" className="danger" onClick={() => onPermanentDeletePlaylist(playlist)}>
                          <i className="ri-delete-bin-line" />
                          영구 삭제
                        </button>
                      </span>
                    </article>
                  );
                })}
              </section>
            )}

            {!!items.length && (
              <section className="media-trash-section">
                <h3>카드</h3>
                {items.map((item) => {
                  const expired = isTrashExpired(item.delete_expires_at);
                  return (
                    <article key={item.id} className={`media-trash-row ${expired ? 'is-expired' : ''}`}>
                      <i className={item.platform === 'youtube' ? 'ri-youtube-line' : item.platform === 'instagram' ? 'ri-instagram-line' : 'ri-links-line'} />
                      <span className="media-trash-copy">
                        <strong>{item.title || '제목 없음'}</strong>
                        <small>{platformLabel(item.platform)} · 만료 {formatTrashDate(item.delete_expires_at)}</small>
                      </span>
                      <span className="media-trash-actions">
                        <button type="button" onClick={() => onRestoreItem(item)} disabled={expired}>
                          <i className="ri-arrow-go-back-line" />
                          복구
                        </button>
                        <button type="button" className="danger" onClick={() => onPermanentDeleteItem(item)}>
                          <i className="ri-delete-bin-line" />
                          영구 삭제
                        </button>
                      </span>
                    </article>
                  );
                })}
              </section>
            )}
          </div>
        )}
      </section>
    </MediaModalFrame>
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
  const playerItemId = getMediaPlayerQueryId(location.search);
  const playerLocationState = location.state as MediaArchivePlayerLocationState | null;
  const playerOpenedFromArchive = Boolean(playerLocationState?.mediaArchivePlayer);
  const [standalonePlayerItem, setStandalonePlayerItem] = useState<SnsMediaItem | null>(null);
  const [standalonePlayerLoading, setStandalonePlayerLoading] = useState(Boolean(playerItemId));
  const [standalonePlayerError, setStandalonePlayerError] = useState('');
  const [showAddChoice, setShowAddChoice] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showPlaylistForm, setShowPlaylistForm] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
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
  const [trashItems, setTrashItems] = useState<SnsMediaItem[]>([]);
  const [trashPlaylists, setTrashPlaylists] = useState<SnsMediaPlaylist[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [archiveInitialView, setArchiveInitialView] = useState<MediaArchiveHistoryView | null>(() => (
    typeof window === 'undefined' ? null : getMediaArchiveHistoryView(window.history.state)
  ));
  const [archiveViewVersion, setArchiveViewVersion] = useState(0);
  const [pendingArchiveFocusView, setPendingArchiveFocusView] = useState<MediaArchiveHistoryView | null | undefined>(undefined);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const playlistCoverFileInputRef = useRef<HTMLInputElement | null>(null);
  const clipperImportKeyRef = useRef('');
  const metadataFetchKeyRef = useRef('');
  const playlistMetadataFetchKeyRef = useRef('');
  const restoredDraftRef = useRef(false);
  const previousPlayerItemIdRef = useRef(playerItemId);
  const playerReturnViewRef = useRef<MediaArchiveHistoryView | null>(null);
  const [activePlaylistContext, setActivePlaylistContext] = useState<MediaPlaylistContext | null>(() => readMediaPlaylistContext());
  const activePlaylistContextRef = useRef<MediaPlaylistContext | null>(activePlaylistContext);

  useEffect(() => {
    document.documentElement.classList.add('media-archive-page-active');
    return () => document.documentElement.classList.remove('media-archive-page-active');
  }, []);

  useEffect(() => {
    if (!playerItemId) {
      document.documentElement.classList.remove('media-archive-player-active');
      return undefined;
    }

    document.documentElement.classList.add('media-archive-player-active');
    return () => document.documentElement.classList.remove('media-archive-player-active');
  }, [playerItemId]);

  useEffect(() => {
    const previousPlayerItemId = previousPlayerItemIdRef.current;
    previousPlayerItemIdRef.current = playerItemId;
    if (!previousPlayerItemId || playerItemId || typeof window === 'undefined') return;

    setArchiveInitialView(getMediaArchiveHistoryView(window.history.state) || playerReturnViewRef.current);
    setArchiveViewVersion((version) => version + 1);
  }, [playerItemId]);

  const canCreate = Boolean(user);
  useEffect(() => {
    activePlaylistContextRef.current = activePlaylistContext;
  }, [activePlaylistContext]);

  const getDefaultPlaylistContext = useCallback(() => (
    activePlaylistContextRef.current || readMediaPlaylistContext()
  ), []);

  const applyCurrentPlaylistToForm = useCallback((sourceForm: MediaArchiveForm) => {
    const context = activePlaylistContextRef.current;
    if (!context?.playlistId) return normalizeMediaArchiveForm(sourceForm);
    return normalizeMediaArchiveForm({
      ...sourceForm,
      playlistId: context.playlistId,
      newPlaylistName: '',
      newPlaylistParentId: '',
      collectionName: context.name || sourceForm.collectionName,
    });
  }, []);

  const handleActivePlaylistChange = useCallback((playlist: SnsMediaPlaylist | null) => {
    if (!playlist) {
      activePlaylistContextRef.current = null;
      setActivePlaylistContext(null);
      return;
    }

    const context: MediaPlaylistContext = {
      playlistId: playlist.id,
      name: compactText(playlist.name),
      savedAt: Date.now(),
    };
    activePlaylistContextRef.current = context;
    setActivePlaylistContext(context);
    saveMediaPlaylistContext(playlist);
  }, []);

  const focusArchiveLocation = useCallback((view: MediaArchiveHistoryView | null) => {
    setQuery('');
    setSubmittedQuery('');
    setSearchFocused(false);
    setHighlightedSearchSuggestionIndex(-1);
    setArchiveInitialView(view);
    setArchiveViewVersion((version) => version + 1);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        replaceMediaArchiveHistoryView(view);
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }, []);

  const clearArchiveInitialView = useCallback(() => {
    setArchiveInitialView(null);
  }, []);

  const queueArchiveLocationFocus = useCallback((view: MediaArchiveHistoryView | null) => {
    setPendingArchiveFocusView(view);
  }, []);

  const searchSuggestions = useMemo(
    () => getMediaArchiveSearchSuggestions(query, suggestionItems.length ? suggestionItems : items, playlists),
    [items, playlists, query, suggestionItems],
  );
  const showSearchSuggestions = searchFocused && Boolean(compactText(query)) && searchSuggestions.length > 0;
  const activeStandalonePlayerItem = useMemo(() => {
    if (!playerItemId) return null;
    return items.find((item) => item.id === playerItemId)
      || suggestionItems.find((item) => item.id === playerItemId)
      || standalonePlayerItem;
  }, [items, playerItemId, standalonePlayerItem, suggestionItems]);
  const handlePlayItem = useCallback((itemId: string) => {
    if (!itemId) {
      setPlayingItemId('');
      return;
    }

    setPlayingItemId('');
    if (typeof window !== 'undefined') {
      playerReturnViewRef.current = getMediaArchiveHistoryView(window.history.state);
    }
    navigate({
      pathname: '/forum/media',
      search: setMediaPlayerQueryId(location.search, itemId),
      hash: location.hash,
    }, {
      state: { mediaArchivePlayer: true } satisfies MediaArchivePlayerLocationState,
    });
  }, [location.hash, location.search, navigate]);

  const handleCloseStandalonePlayer = useCallback(() => {
    setPlayingItemId('');
    if (playerOpenedFromArchive && typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate({
      pathname: '/forum/media',
      search: clearMediaPlayerQueryId(location.search),
      hash: location.hash,
    }, { replace: true });
  }, [location.hash, location.search, navigate, playerOpenedFromArchive]);

  const availableGenres = useMemo(() => {
    const fromItems = items.map((item) => item.dance_genre).filter(Boolean) as string[];
    const fromPlaylists = playlists.map((playlist) => playlist.dance_genre).filter(Boolean) as string[];
    return Array.from(new Set([...GENRE_PRESETS, ...fromItems, ...fromPlaylists])).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [items, playlists]);

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
      const remoteDescription = cleanImportedMediaDescription(data.description);
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

  const fetchItems = useCallback(async (nextPage = 0, append = false, queryOverride?: string) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const effectiveQuery = queryOverride ?? submittedQuery;
      let request = cafe24
        .from('sns_media_items')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1);

      const orFilter = buildOrFilter(effectiveQuery);
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
        .is('deleted_at', null)
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
        .is('deleted_at', null)
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
    if (pendingArchiveFocusView === undefined) return;
    if (
      pendingArchiveFocusView?.kind === 'playlist' &&
      !playlists.some((playlist) => playlist.id === pendingArchiveFocusView.id)
    ) {
      return;
    }

    const nextView = pendingArchiveFocusView;
    setPendingArchiveFocusView(undefined);
    focusArchiveLocation(nextView);
  }, [focusArchiveLocation, pendingArchiveFocusView, playlists]);

  const fetchTrash = useCallback(async () => {
    if (!user) {
      setTrashItems([]);
      setTrashPlaylists([]);
      return;
    }

    setTrashLoading(true);
    try {
      const [playlistResult, itemResult] = await Promise.all([
        cafe24
          .from('sns_media_playlists')
          .select('*')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
        cafe24
          .from('sns_media_items')
          .select('*')
          .not('deleted_at', 'is', null)
          .order('deleted_at', { ascending: false }),
      ]);
      if (playlistResult.error) throw playlistResult.error;
      if (itemResult.error) throw itemResult.error;

      const deletedPlaylists = (playlistResult.data || []) as SnsMediaPlaylist[];
      const deletedItems = (itemResult.data || []) as SnsMediaItem[];
      const rootPlaylists = deletedPlaylists.filter((playlist) => {
        const rootId = compactText(playlist.deleted_branch_root_id);
        return !rootId || rootId === playlist.id;
      });
      const expiredRootPlaylists = rootPlaylists.filter((playlist) => isTrashExpired(playlist.delete_expires_at));
      const expiredRootIds = new Set(expiredRootPlaylists.map((playlist) => playlist.id));
      const directItems = deletedItems.filter((item) => !compactText(item.deleted_branch_root_id));
      const expiredDirectItems = directItems.filter((item) => isTrashExpired(item.delete_expires_at));

      if (expiredRootPlaylists.length || expiredDirectItems.length) {
        for (const playlist of expiredRootPlaylists) {
          const rootId = playlist.id;
          const playlistIds = deletedPlaylists
            .filter((entry) => compactText(entry.deleted_branch_root_id) === rootId || entry.id === rootId)
            .map((entry) => entry.id);
          const itemIds = deletedItems
            .filter((entry) => compactText(entry.deleted_branch_root_id) === rootId)
            .map((entry) => entry.id);

          if (itemIds.length) {
            const itemDeleteResult = await cafe24
              .from('sns_media_items')
              .delete()
              .in('id', itemIds)
              .not('deleted_at', 'is', null);
            if (itemDeleteResult.error) throw itemDeleteResult.error;
          }
          if (playlistIds.length) {
            const playlistDeleteResult = await cafe24
              .from('sns_media_playlists')
              .delete()
              .in('id', playlistIds)
              .not('deleted_at', 'is', null);
            if (playlistDeleteResult.error) throw playlistDeleteResult.error;
            try {
              await removePlaylistCoverFolders(playlistIds);
            } catch (error) {
              console.warn('[MediaArchive] expired playlist cover cleanup failed:', error);
            }
          }
        }

        const expiredItemIds = expiredDirectItems.map((item) => item.id);
        if (expiredItemIds.length) {
          const itemDeleteResult = await cafe24
            .from('sns_media_items')
            .delete()
            .in('id', expiredItemIds)
            .not('deleted_at', 'is', null);
          if (itemDeleteResult.error) throw itemDeleteResult.error;
        }
      }

      setTrashPlaylists(rootPlaylists.filter((playlist) => !expiredRootIds.has(playlist.id)));
      const expiredDirectItemIds = new Set(expiredDirectItems.map((item) => item.id));
      setTrashItems(directItems.filter((item) => !expiredDirectItemIds.has(item.id)));
    } catch (error) {
      console.error('[MediaArchive] trash fetch failed:', error);
      setTrashItems([]);
      setTrashPlaylists([]);
    } finally {
      setTrashLoading(false);
    }
  }, [user]);

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
    if (!playerItemId) {
      setStandalonePlayerItem(null);
      setStandalonePlayerError('');
      setStandalonePlayerLoading(false);
      return undefined;
    }

    const localItem = items.find((item) => item.id === playerItemId)
      || suggestionItems.find((item) => item.id === playerItemId);
    if (localItem) {
      setStandalonePlayerItem(localItem);
      setStandalonePlayerError('');
      setStandalonePlayerLoading(false);
      return undefined;
    }

    let cancelled = false;
    setStandalonePlayerItem(null);
    setStandalonePlayerError('');
    setStandalonePlayerLoading(true);

    (async () => {
      try {
        const { data, error } = await cafe24
          .from('sns_media_items')
          .select('*')
          .eq('id', playerItemId)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) throw error;
        if (cancelled) return;
        if (data) {
          setStandalonePlayerItem(data as SnsMediaItem);
        } else {
          setStandalonePlayerError('재생할 영상을 찾을 수 없습니다.');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('[MediaArchive] player item fetch failed:', error);
        setStandalonePlayerError('영상을 불러오는 중 오류가 발생했습니다.');
      } finally {
        if (!cancelled) setStandalonePlayerLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [items, playerItemId, suggestionItems]);

  useEffect(() => {
    if (showTrash) void fetchTrash();
  }, [fetchTrash, showTrash]);

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
          const remoteDescription = cleanImportedMediaDescription(data.description);
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
          const nextForm = buildImportedForm(prev, params, addUrl, true, getDefaultPlaylistContext());
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
      const nextForm = buildImportedForm(prev, params, addUrl, isShareTarget, getDefaultPlaylistContext());
      savePendingMediaDraft(nextForm, isShareTarget ? 'mobile-share' : 'desktop-share');
      return nextForm;
    });

    navigate('/forum/media', { replace: true });
    return () => {
      cancelled = true;
    };
  }, [getDefaultPlaylistContext, location.hash, location.pathname, location.search, navigate]);

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

  const resetForm = (nextForm: MediaArchiveForm = emptyForm) => {
    setForm(nextForm);
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
    setShowTrash(false);
    setShowPlaylistForm(false);
    resetPlaylistForm();
    resetForm(applyCurrentPlaylistToForm(emptyForm));
    setShowForm(true);
  };

  const resetPlaylistForm = (nextForm: MediaPlaylistForm = emptyPlaylistForm) => {
    setPlaylistForm(nextForm);
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
    setShowTrash(false);
    if (showForm) closeMediaForm();
    resetPlaylistForm({
      ...emptyPlaylistForm,
      parentId: compactText(activePlaylistContextRef.current?.playlistId),
    });
    setShowPlaylistForm(true);
  };

  const openAddChoice = () => {
    if (showForm) closeMediaForm();
    if (showPlaylistForm) closePlaylistForm();
    setShowTrash(false);
    setEditingItem(null);
    setEditForm(emptyForm);
    setShowAddChoice(true);
  };

  const closeAddChoice = () => {
    setShowAddChoice(false);
  };

  const openTrash = async () => {
    if (!user) {
      await signInWithKakao();
      return;
    }
    if (showForm) closeMediaForm();
    if (showPlaylistForm) closePlaylistForm();
    setShowAddChoice(false);
    setEditingItem(null);
    setEditForm(emptyForm);
    setShowTrash(true);
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
      const folderPath = getPlaylistCoverStorageFolderPath(playlistId);
      if (!folderPath) throw new Error('Invalid playlist cover storage path');
      const path = `${folderPath}/cover-${name}.${extension}`;
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

  const canMoveItem = useCallback((item: SnsMediaItem) => {
    if (canManageItem(item)) return true;
    const sourcePlaylistId = compactText(item.playlist_id);
    if (!sourcePlaylistId) return false;
    const sourcePlaylist = playlists.find((playlist) => playlist.id === sourcePlaylistId);
    return Boolean(sourcePlaylist && canManagePlaylist(sourcePlaylist));
  }, [canManageItem, canManagePlaylist, playlists]);

  const savePlaylistFromForm = async (
    sourceForm: MediaPlaylistForm,
    existing?: SnsMediaPlaylist | null,
    coverFile?: File | null,
  ) => {
    if (!user) {
      await signInWithKakao();
      return null;
    }

    if (existing && !canManagePlaylist(existing)) {
      alert('이 재생목록을 수정할 권한이 없습니다.');
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
    const shouldRemoveExistingCoverFolder = Boolean(
      existing &&
      !coverFile &&
      isPlaylistOwnedCoverUrl(existing.cover_url, existing.id) &&
      !isPlaylistOwnedCoverUrl(coverUrl, existing.id),
    );
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

    if (shouldRemoveExistingCoverFolder && existing) {
      try {
        await removePlaylistCoverFolders([existing.id]);
      } catch (error) {
        console.warn('[MediaArchive] playlist cover cleanup failed:', error);
      }
    }

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
      const wasEditingPlaylist = Boolean(editingPlaylist);
      const saved = await savePlaylistFromForm(playlistForm, editingPlaylist, playlistCoverFile);
      if (!saved) return;
      const parentId = getPlaylistParentId(saved);
      setShowPlaylistForm(false);
      resetPlaylistForm();
      await fetchPlaylists();
      await fetchItems(0, false, wasEditingPlaylist ? undefined : '');
      await fetchSuggestionItems();
      if (!wasEditingPlaylist) {
        queueArchiveLocationFocus(parentId ? { kind: 'playlist', id: parentId } : null);
      }
    } catch (error) {
      console.error('[MediaArchive] playlist save failed:', error);
      alert('재생목록 저장 중 오류가 발생했습니다.');
    }
  };

  const handleEditPlaylist = (playlist: SnsMediaPlaylist) => {
    if (!canManagePlaylist(playlist)) {
      alert('이 재생목록을 수정할 권한이 없습니다.');
      return;
    }
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

    if (!isAdmin) {
      alert('이동 편집은 관리자만 사용할 수 있습니다.');
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
  }, [canManagePlaylist, fetchPlaylists, fetchSuggestionItems, isAdmin, playlists, signInWithKakao, user]);

  const handleMoveItem = useCallback(async (item: SnsMediaItem, playlistId: string) => {
    if (!user) {
      await signInWithKakao();
      return false;
    }

    if (!isAdmin) {
      alert('이동 편집은 관리자만 사용할 수 있습니다.');
      return false;
    }

    if (!canMoveItem(item)) {
      alert('이 카드를 이동할 권한이 없습니다.');
      return false;
    }

    const nextPlaylistId = compactText(playlistId);
    const targetPlaylist = nextPlaylistId
      ? playlists.find((playlist) => playlist.id === nextPlaylistId) || null
      : null;
    if (nextPlaylistId && !targetPlaylist) {
      alert('이동할 재생목록을 찾을 수 없습니다.');
      return false;
    }
    if (targetPlaylist && isShortcutPlaylist(targetPlaylist)) {
      alert('바로가기형 재생목록에는 영상 카드를 넣을 수 없습니다.');
      return false;
    }
    if (compactText(item.playlist_id) === nextPlaylistId) return false;

    const now = new Date().toISOString();
    const nextItem: SnsMediaItem = {
      ...item,
      playlist_id: nextPlaylistId || null,
      collection_name: targetPlaylist ? compactText(targetPlaylist.name) || null : null,
      updated_at: now,
    };
    const payload: Partial<SnsMediaItem> = {
      playlist_id: nextItem.playlist_id,
      collection_name: nextItem.collection_name,
      updated_at: now,
      search_text: buildSearchText(nextItem).slice(0, 2000),
    };
    const applyLocalMove = (entry: SnsMediaItem) => (
      entry.id === item.id ? { ...entry, ...payload } : entry
    );

    setItems((prev) => prev.map(applyLocalMove));
    setSuggestionItems((prev) => prev.map(applyLocalMove));

    const { error } = await cafe24
      .from('sns_media_items')
      .update(payload)
      .eq('id', item.id);

    if (error) {
      console.error('[MediaArchive] media item move failed:', error);
      alert('카드 이동 중 오류가 발생했습니다.');
      await fetchItems(0, false);
      await fetchSuggestionItems();
      return false;
    }

    await fetchPlaylists();
    await fetchItems(0, false);
    await fetchSuggestionItems();
    return true;
  }, [canMoveItem, fetchItems, fetchPlaylists, fetchSuggestionItems, isAdmin, playlists, signInWithKakao, user]);

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
    if (!canManageItem(item)) {
      alert('이 카드를 수정할 권한이 없습니다.');
      return;
    }
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

    if (!canManageItem(editingItem)) {
      alert('이 카드를 수정할 권한이 없습니다.');
      return;
    }

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
      const savedItem = payload as SnsMediaItem;
      const destinationView = getMediaItemArchiveView(savedItem);

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
      await fetchItems(0, false, '');
      await fetchSuggestionItems();
      queueArchiveLocationFocus(destinationView);
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
    if (!user) {
      await signInWithKakao();
      return;
    }

    if (!canManageItem(item)) {
      alert('이 카드를 삭제할 권한이 없습니다.');
      return;
    }

    const title = truncateText(item.title, 80) || item.id;
    if (!confirm(`"${title}" 카드를 휴지통으로 이동할까요?\n\n삭제 대상 ID: ${item.id}\n7일 안에 휴지통에서 복구할 수 있습니다.`)) return;

    const deletedAt = new Date().toISOString();
    const { error } = await cafe24
      .from('sns_media_items')
      .update({
        deleted_at: deletedAt,
        delete_expires_at: createTrashExpiry(deletedAt),
        deleted_by: user.id,
        deleted_branch_root_id: null,
        updated_at: deletedAt,
      })
      .eq('id', item.id)
      .is('deleted_at', null);
    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
      return;
    }

    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setSuggestionItems((prev) => prev.filter((entry) => entry.id !== item.id));
    if (playingItemId === item.id) setPlayingItemId('');
    if (editingItem?.id === item.id) {
      setEditingItem(null);
      setEditForm(emptyForm);
    }

    await fetchPlaylists();
    await fetchItems(0, false);
    await fetchSuggestionItems();
    if (showTrash) await fetchTrash();
  };

  const handleDeletePlaylist = async (playlist: SnsMediaPlaylist) => {
    if (!user) {
      await signInWithKakao();
      return;
    }

    if (!canManagePlaylist(playlist)) {
      alert('이 재생목록을 삭제할 권한이 없습니다.');
      return;
    }

    try {
      const latestPlaylistsResult = await cafe24
        .from('sns_media_playlists')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (latestPlaylistsResult.error) throw latestPlaylistsResult.error;

      const latestPlaylists = (latestPlaylistsResult.data || []) as SnsMediaPlaylist[];
      const latestPlaylist = latestPlaylists.find((entry) => entry.id === playlist.id);
      if (!latestPlaylist) {
        alert('삭제할 재생목록을 찾을 수 없습니다. 목록을 새로고침합니다.');
        await fetchPlaylists();
        return;
      }

      const branchIds = Array.from(getPlaylistBranchIds(latestPlaylist.id, latestPlaylists));
      const branchIdSet = new Set(branchIds);
      const branchPlaylists = latestPlaylists.filter((entry) => branchIdSet.has(entry.id));
      const unmanagedPlaylists = branchPlaylists.filter((entry) => !canManagePlaylist(entry));
      if (unmanagedPlaylists.length) {
        alert('권한이 없는 하위 재생목록이 포함되어 있어 삭제할 수 없습니다.');
        return;
      }

      const branchItemsResult = await cafe24
        .from('sns_media_items')
        .select('*')
        .in('playlist_id', branchIds)
        .is('deleted_at', null);
      if (branchItemsResult.error) throw branchItemsResult.error;
      const branchItems = (branchItemsResult.data || []) as SnsMediaItem[];
      const unmanagedItems = isAdmin ? [] : branchItems.filter((entry) => !canManageItem(entry));
      if (unmanagedItems.length) {
        alert('다른 사용자가 등록한 카드가 포함되어 있어 삭제할 수 없습니다.');
        return;
      }

      const childCount = Math.max(branchPlaylists.length - 1, 0);
      const title = truncateText(latestPlaylist.name, 80) || latestPlaylist.id;
      const confirmation = [
        `"${title}" 재생목록을 휴지통으로 이동할까요?`,
        '',
        `삭제 대상 ID: ${latestPlaylist.id}`,
        `하위 재생목록: ${childCount}개`,
        `포함 카드: ${branchItems.length}개`,
        '7일 안에 휴지통에서 전체 복구할 수 있습니다.',
      ].join('\n');
      if (!confirm(confirmation)) return;

      const deletedAt = new Date().toISOString();
      const deleteExpiresAt = createTrashExpiry(deletedAt);
      const itemTrashResult = await cafe24
        .from('sns_media_items')
        .update({
          deleted_at: deletedAt,
          delete_expires_at: deleteExpiresAt,
          deleted_by: user.id,
          deleted_branch_root_id: latestPlaylist.id,
          updated_at: deletedAt,
        })
        .in('playlist_id', branchIds)
        .is('deleted_at', null);
      if (itemTrashResult.error) throw itemTrashResult.error;

      const playlistTrashResult = await cafe24
        .from('sns_media_playlists')
        .update({
          deleted_at: deletedAt,
          delete_expires_at: deleteExpiresAt,
          deleted_by: user.id,
          deleted_branch_root_id: latestPlaylist.id,
          deleted_branch_item_count: branchItems.length,
          deleted_branch_playlist_count: branchPlaylists.length,
          updated_at: deletedAt,
        })
        .in('id', branchIds)
        .is('deleted_at', null);
      if (playlistTrashResult.error) throw playlistTrashResult.error;

      setPlaylists((prev) => prev.filter((entry) => !branchIdSet.has(entry.id)));
      setItems((prev) => prev.filter((entry) => !entry.playlist_id || !branchIdSet.has(entry.playlist_id)));
      setSuggestionItems((prev) => prev.filter((entry) => !entry.playlist_id || !branchIdSet.has(entry.playlist_id)));
      if (editingPlaylist && branchIdSet.has(editingPlaylist.id)) {
        setShowPlaylistForm(false);
        resetPlaylistForm();
      }
      if (editingItem?.playlist_id && branchIdSet.has(editingItem.playlist_id)) {
        setEditingItem(null);
        setEditForm(emptyForm);
      }
      if (playingItemId && branchItems.some((entry) => entry.id === playingItemId)) {
        setPlayingItemId('');
      }
      if (activePlaylistContextRef.current?.playlistId && branchIdSet.has(activePlaylistContextRef.current.playlistId)) {
        clearMediaPlaylistContext();
        activePlaylistContextRef.current = null;
        setActivePlaylistContext(null);
      }

      await fetchPlaylists();
      await fetchItems(0, false);
      await fetchSuggestionItems();
      if (showTrash) await fetchTrash();
    } catch (error) {
      console.error('[MediaArchive] playlist delete failed:', error);
      alert('재생목록 삭제 중 오류가 발생했습니다.');
      await fetchPlaylists();
      await fetchItems(0, false);
      await fetchSuggestionItems();
      if (showTrash) await fetchTrash();
    }
  };

  const refreshArchiveAfterTrashChange = async () => {
    await fetchPlaylists();
    await fetchItems(0, false);
    await fetchSuggestionItems();
    await fetchTrash();
  };

  const loadDeletedPlaylistBranch = async (playlist: SnsMediaPlaylist) => {
    const rootId = compactText(playlist.deleted_branch_root_id) || playlist.id;
    const [playlistResult, itemResult] = await Promise.all([
      cafe24
        .from('sns_media_playlists')
        .select('*')
        .not('deleted_at', 'is', null)
        .eq('deleted_branch_root_id', rootId),
      cafe24
        .from('sns_media_items')
        .select('*')
        .not('deleted_at', 'is', null)
        .eq('deleted_branch_root_id', rootId),
    ]);
    if (playlistResult.error) throw playlistResult.error;
    if (itemResult.error) throw itemResult.error;
    return {
      rootId,
      playlists: (playlistResult.data || []) as SnsMediaPlaylist[],
      items: (itemResult.data || []) as SnsMediaItem[],
    };
  };

  const handleRestoreItem = async (item: SnsMediaItem) => {
    if (!user) {
      await signInWithKakao();
      return;
    }
    if (!canManageItem(item)) {
      alert('이 카드를 복구할 권한이 없습니다.');
      return;
    }
    if (isTrashExpired(item.delete_expires_at)) {
      alert('복구 가능 기간이 지나 영구 삭제만 가능합니다.');
      return;
    }

    const { error } = await cafe24
      .from('sns_media_items')
      .update(getTrashClearFields())
      .eq('id', item.id)
      .not('deleted_at', 'is', null);
    if (error) {
      alert('복구 중 오류가 발생했습니다.');
      return;
    }
    await refreshArchiveAfterTrashChange();
  };

  const handlePermanentDeleteItem = async (item: SnsMediaItem) => {
    if (!user) {
      await signInWithKakao();
      return;
    }
    if (!canManageItem(item)) {
      alert('이 카드를 영구 삭제할 권한이 없습니다.');
      return;
    }
    if (!confirm(`"${getTrashLabel(item)}" 카드를 영구 삭제할까요?\n\n이 작업은 되돌릴 수 없습니다.`)) return;

    const { error } = await cafe24
      .from('sns_media_items')
      .delete()
      .eq('id', item.id)
      .not('deleted_at', 'is', null);
    if (error) {
      alert('영구 삭제 중 오류가 발생했습니다.');
      return;
    }
    await refreshArchiveAfterTrashChange();
  };

  const handleRestorePlaylist = async (playlist: SnsMediaPlaylist) => {
    if (!user) {
      await signInWithKakao();
      return;
    }
    if (!canManagePlaylist(playlist)) {
      alert('이 재생목록을 복구할 권한이 없습니다.');
      return;
    }
    if (isTrashExpired(playlist.delete_expires_at)) {
      alert('복구 가능 기간이 지나 영구 삭제만 가능합니다.');
      return;
    }

    try {
      const branch = await loadDeletedPlaylistBranch(playlist);
      const branchPlaylists = branch.playlists.length ? branch.playlists : [playlist];
      if (branchPlaylists.some((entry) => !canManagePlaylist(entry))) {
        alert('권한이 없는 하위 재생목록이 포함되어 있어 복구할 수 없습니다.');
        return;
      }
      if (!isAdmin && branch.items.some((entry) => !canManageItem(entry))) {
        alert('다른 사용자가 등록한 카드가 포함되어 있어 복구할 수 없습니다.');
        return;
      }

      const now = new Date().toISOString();
      const playlistIds = branchPlaylists.map((entry) => entry.id);
      const itemIds = branch.items.map((entry) => entry.id);
      const playlistResult = await cafe24
        .from('sns_media_playlists')
        .update(getPlaylistTrashClearFields(now))
        .in('id', playlistIds)
        .not('deleted_at', 'is', null);
      if (playlistResult.error) throw playlistResult.error;

      if (itemIds.length) {
        const itemResult = await cafe24
          .from('sns_media_items')
          .update(getTrashClearFields(now))
          .in('id', itemIds)
          .not('deleted_at', 'is', null);
        if (itemResult.error) throw itemResult.error;
      }

      await refreshArchiveAfterTrashChange();
    } catch (error) {
      console.error('[MediaArchive] playlist restore failed:', error);
      alert('재생목록 복구 중 오류가 발생했습니다.');
    }
  };

  const handlePermanentDeletePlaylist = async (playlist: SnsMediaPlaylist) => {
    if (!user) {
      await signInWithKakao();
      return;
    }
    if (!canManagePlaylist(playlist)) {
      alert('이 재생목록을 영구 삭제할 권한이 없습니다.');
      return;
    }
    if (!confirm(`"${getTrashLabel(playlist)}" 재생목록을 영구 삭제할까요?\n\n하위 재생목록과 포함 카드, 업로드 커버 폴더가 함께 삭제되며 되돌릴 수 없습니다.`)) return;

    try {
      const branch = await loadDeletedPlaylistBranch(playlist);
      const branchPlaylists = branch.playlists.length ? branch.playlists : [playlist];
      if (branchPlaylists.some((entry) => !canManagePlaylist(entry))) {
        alert('권한이 없는 하위 재생목록이 포함되어 있어 영구 삭제할 수 없습니다.');
        return;
      }
      if (!isAdmin && branch.items.some((entry) => !canManageItem(entry))) {
        alert('다른 사용자가 등록한 카드가 포함되어 있어 영구 삭제할 수 없습니다.');
        return;
      }

      const itemIds = branch.items.map((entry) => entry.id);
      const playlistIds = branchPlaylists.map((entry) => entry.id);
      if (itemIds.length) {
        const itemResult = await cafe24
          .from('sns_media_items')
          .delete()
          .in('id', itemIds)
          .not('deleted_at', 'is', null);
        if (itemResult.error) throw itemResult.error;
      }

      const playlistResult = await cafe24
        .from('sns_media_playlists')
        .delete()
        .in('id', playlistIds)
        .not('deleted_at', 'is', null);
      if (playlistResult.error) throw playlistResult.error;

      try {
        await removePlaylistCoverFolders(playlistIds);
      } catch (error) {
        console.warn('[MediaArchive] playlist cover cleanup failed:', error);
        alert('영구 삭제는 완료됐지만 일부 커버 파일 정리에 실패했습니다.');
      }

      await refreshArchiveAfterTrashChange();
    } catch (error) {
      console.error('[MediaArchive] playlist permanent delete failed:', error);
      alert('재생목록 영구 삭제 중 오류가 발생했습니다.');
    }
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
    const currentHistoryView = typeof window === 'undefined' || playerItemId
      ? null
      : getMediaArchiveHistoryView(window.history.state);
    const initialArchiveView = archiveInitialView || currentHistoryView || playerReturnViewRef.current;
    const archiveViewKey = initialArchiveView
      ? `${archiveViewVersion}:${getMediaArchiveHistoryViewKey(initialArchiveView)}`
      : `${archiveViewVersion}:root`;

    return (
      <CollectionArchiveView
        key={archiveViewKey}
        items={items}
        playlists={playlists}
        searchQuery={activeSearchQuery}
        initialView={initialArchiveView}
        onInitialViewApplied={clearArchiveInitialView}
        canOrganize={Boolean(isAdmin)}
        canManageItem={canManageItem}
        canMoveItem={canMoveItem}
        canManagePlaylist={canManagePlaylist}
        onEditItem={handleEditItem}
        onEditPlaylist={handleEditPlaylist}
        onMoveItem={handleMoveItem}
        onMovePlaylist={handleMovePlaylist}
        onActivePlaylistChange={handleActivePlaylistChange}
        playingItemId={playingItemId}
        onPlayItem={handlePlayItem}
      />
    );
  };

  if (playerItemId) {
    if (activeStandalonePlayerItem) {
      return (
        <MediaStandalonePlayerPage
          item={activeStandalonePlayerItem}
          onBack={handleCloseStandalonePlayer}
          canManage={canManageItem(activeStandalonePlayerItem)}
          onEdit={(item) => {
            navigate({
              pathname: '/forum/media',
              search: clearMediaPlayerQueryId(location.search),
              hash: location.hash,
            }, { replace: true });
            handleEditItem(item);
          }}
        />
      );
    }

    return (
      <main className="media-archive-player-page" onDragStartCapture={preventMediaArchiveDrag}>
        <button
          type="button"
          className="media-player-back-button"
          draggable={false}
          onDragStart={preventMediaArchiveDrag}
          onClick={handleCloseStandalonePlayer}
          aria-label="아카이브로 돌아가기"
        >
          <i className="ri-arrow-left-line" />
          <span>돌아가기</span>
        </button>
        <div className="media-player-state">
          <i className={standalonePlayerLoading ? 'ri-loader-4-line ri-spin' : 'ri-error-warning-line'} />
          <strong>{standalonePlayerLoading ? '로딩 중...' : '영상을 열 수 없습니다'}</strong>
          {standalonePlayerError && <span>{standalonePlayerError}</span>}
        </div>
      </main>
    );
  }

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
          <button className="media-add-button media-add-button--secondary" type="button" onClick={() => void openTrash()}>
            <i className="ri-delete-bin-6-line" />
            <span>휴지통</span>
          </button>
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

      {showTrash && (
        <MediaTrashModal
          items={trashItems}
          playlists={trashPlaylists}
          loading={trashLoading}
          onClose={() => setShowTrash(false)}
          onRefresh={() => void fetchTrash()}
          onRestoreItem={(item) => void handleRestoreItem(item)}
          onPermanentDeleteItem={(item) => void handlePermanentDeleteItem(item)}
          onRestorePlaylist={(playlist) => void handleRestorePlaylist(playlist)}
          onPermanentDeletePlaylist={(playlist) => void handlePermanentDeletePlaylist(playlist)}
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
              <PlaylistTreePicker
                label="상위 위치"
                playlists={playlists}
                value={playlistForm.parentId}
                onChange={(playlistId) => setPlaylistForm((prev) => ({ ...prev, parentId: playlistId }))}
                excludedId={editingPlaylist?.id || ''}
              />
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
              {editingPlaylist && canManagePlaylist(editingPlaylist) && (
                <button
                  type="button"
                  className="media-danger-button media-edit-delete-button"
                  onClick={() => void handleDeletePlaylist(editingPlaylist)}
                >
                  <i className="ri-delete-bin-line" />
                  재생목록 삭제
                </button>
              )}
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
              <MediaPlaylistDestinationPicker
                playlists={playlists}
                playlistId={form.playlistId}
                newPlaylistName={form.newPlaylistName}
                newPlaylistParentId={form.newPlaylistParentId}
                onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              />
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
          onDelete={handleDelete}
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
