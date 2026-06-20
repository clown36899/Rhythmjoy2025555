import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import {
  buildSearchText,
  mediaTypeLabel,
  normalizeTags,
  parseMediaUrl,
  platformLabel,
  type MediaPlatform,
  type MediaType,
  type SnsMediaItem,
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
const PLATFORM_FILTERS: Array<{ value: 'all' | MediaPlatform; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'other', label: 'Link' },
];

const GENRE_PRESETS = ['스윙', '린디합', '재즈', '발보아', '블루스', '탱고', '살사', '바차타'];
const ARCHIVE_BUCKETS = [
  { id: 'reference', label: '레퍼런스', icon: 'ri-bookmark-3-line' },
  { id: 'class', label: '강습/루틴', icon: 'ri-graduation-cap-line' },
  { id: 'performance', label: '공연/잼', icon: 'ri-movie-2-line' },
  { id: 'social', label: '소셜 분위기', icon: 'ri-group-line' },
  { id: 'history', label: '역사/인물', icon: 'ri-time-line' },
  { id: 'music', label: '음악/밴드', icon: 'ri-music-2-line' },
] as const;
const ARCHIVE_VIEW_MODES = [
  { id: 'grid', label: '카드', icon: 'ri-layout-grid-line' },
  { id: 'buckets', label: '보관함', icon: 'ri-archive-drawer-line' },
  { id: 'collections', label: '컬렉션', icon: 'ri-folder-3-line' },
  { id: 'learning', label: '학습경로', icon: 'ri-route-line' },
  { id: 'timeline', label: '타임라인', icon: 'ri-timeline-view' },
  { id: 'compare', label: '비교', icon: 'ri-layout-column-line' },
] as const;
const LEARNING_STAGES = [
  {
    id: 'intro',
    label: '입문/기초',
    description: '처음 보는 사람도 따라갈 수 있는 기본기 자료',
    icon: 'ri-seedling-line',
    keywords: ['입문', '초급', '기초', 'basic', 'beginner', 'intro'],
  },
  {
    id: 'rhythm',
    label: '리듬/몸쓰기',
    description: '바운스, 펄스, 그루브처럼 춤의 질감을 잡는 자료',
    icon: 'ri-rhythm-line',
    keywords: ['리듬', '바운스', '펄스', 'groove', 'pulse', 'bounce', '몸쓰기'],
  },
  {
    id: 'technique',
    label: '기술/드릴',
    description: '스윙아웃, 풋워크, 에어리얼, 스타일링처럼 반복 연습할 자료',
    icon: 'ri-tools-line',
    keywords: ['스윙아웃', '풋워크', '에어리얼', '스타일링', '턴', '변형', 'swingout', 'footwork', 'aerial', 'turn', 'variation'],
  },
  {
    id: 'routine',
    label: '루틴/코레오',
    description: '안무, 루틴, 여러 버전을 묶어 비교하기 좋은 자료',
    icon: 'ri-repeat-2-line',
    keywords: ['루틴', '안무', '코레오', 'choreo', 'routine', 'shim sham', '버전'],
  },
  {
    id: 'context',
    label: '역사/맥락',
    description: '인물, 시대, 장소, 인터뷰, 다큐 자료',
    icon: 'ri-time-line',
    keywords: ['역사', '인물', '인터뷰', '다큐', 'history', 'frankie', 'norma', 'savoy', 'hellzapoppin'],
  },
] as const;

type ArchiveViewMode = typeof ARCHIVE_VIEW_MODES[number]['id'];

const getDisplayName = (user: ReturnType<typeof useAuth>['user'], fallback?: string | null) => (
  fallback ||
  user?.user_metadata?.name ||
  user?.user_metadata?.full_name ||
  user?.email?.split('@')[0] ||
  '사용자'
);

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
  archiveBucket: 'reference',
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

function getArchiveBucketMeta(value?: string | null) {
  return ARCHIVE_BUCKETS.find((item) => item.id === value) || ARCHIVE_BUCKETS[0];
}

function normalizeMediaArchiveForm(value?: Partial<MediaArchiveForm> | null): MediaArchiveForm {
  const archiveBucket = String(value?.archiveBucket || emptyForm.archiveBucket);

  return {
    url: compactText(value?.url),
    title: compactText(value?.title),
    description: trimText(value?.description),
    authorName: compactText(value?.authorName),
    thumbnailUrl: compactText(value?.thumbnailUrl),
    archiveBucket: ARCHIVE_BUCKETS.some((item) => item.id === archiveBucket) ? archiveBucket : emptyForm.archiveBucket,
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

function truncateText(value?: string | null, maxLength = 64) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}…`;
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
  return normalizeMediaArchiveForm({
    ...prev,
    url: addUrl,
    title: deriveArchiveTitle(params, addUrl) || prev.title,
    description: sharedDescription || prev.description,
    authorName: params.get('author') || prev.authorName,
    thumbnailUrl: safeImageUrl(params.get('thumbnail')) || prev.thumbnailUrl,
    archiveBucket: params.get('bucket') || prev.archiveBucket,
    collectionName: params.get('collection') || prev.collectionName,
    tags: params.get('tags') || prev.tags,
    danceGenre: params.get('genre') || prev.danceGenre,
    publishedAt: safeInputDate(params.get('published')) || prev.publishedAt,
    sourceContext: getImportSourceContext(params, isShareTarget, prev.sourceContext),
  });
}

function getItemText(item: SnsMediaItem) {
  return compactText([
    item.title,
    item.description,
    item.author_name,
    item.collection_name,
    item.dance_genre,
    item.archive_bucket,
    ...(item.tags || []),
  ].filter(Boolean).join(' ')).toLowerCase();
}

function itemHasKeyword(item: SnsMediaItem, keywords: readonly string[]) {
  const text = getItemText(item);
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function getItemYear(item: SnsMediaItem) {
  const value = item.published_at || item.created_at;
  if (!value) return '날짜 미정';
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : '날짜 미정';
}

function groupByKey(items: SnsMediaItem[], getKey: (item: SnsMediaItem) => string) {
  const groups = new Map<string, SnsMediaItem[]>();
  items.forEach((item) => {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return Array.from(groups.entries()).map(([key, groupItems]) => ({ key, items: groupItems }));
}

function getLearningStageId(item: SnsMediaItem) {
  if (item.archive_bucket === 'history') return 'context';
  const matched = LEARNING_STAGES.find((stage) => itemHasKeyword(item, stage.keywords));
  if (matched) return matched.id;
  if (item.archive_bucket === 'class') return 'technique';
  return 'reference';
}

function createMediaArchiveId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `media-${Date.now()}-${Math.random().toString(36).slice(2)}`;
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

const MediaEmbed: React.FC<{ item: SnsMediaItem }> = ({ item }) => {
  useEffect(() => {
    if (item.platform === 'instagram') {
      window.setTimeout(loadInstagramScript, 50);
    }
  }, [item.platform, item.id]);

  if (item.platform === 'youtube' && item.embed_url) {
    return (
      <iframe
        className="media-embed-frame"
        src={item.embed_url}
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
          <a href={item.normalized_url} target="_blank" rel="noreferrer">
            Instagram에서 보기
          </a>
        </blockquote>
      </div>
    );
  }

  return (
    <a className="media-link-fallback" href={item.normalized_url || item.url} target="_blank" rel="noreferrer">
      <i className="ri-external-link-line" />
      원본 열기
    </a>
  );
};

const MediaCard: React.FC<{
  item: SnsMediaItem;
  canManage: boolean;
  onApprove: (item: SnsMediaItem) => void;
  onDelete: (item: SnsMediaItem) => void;
}> = ({ item, canManage, onApprove, onDelete }) => {
  const [expanded, setExpanded] = useState(false);
  const dateLabel = item.published_at || item.created_at;
  const originalUrl = item.normalized_url || item.url;
  const handlePreviewClick = () => {
    if (item.platform === 'instagram' || item.platform === 'other') {
      window.open(originalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setExpanded(true);
  };

  return (
    <article className={`media-card media-card--${item.platform} ${!item.is_approved ? 'is-pending' : ''}`}>
      <div className="media-preview">
        {expanded ? (
          <MediaEmbed item={item} />
        ) : (
          <button className="media-preview-button" type="button" onClick={handlePreviewClick}>
            {item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt="" loading="lazy" draggable={false} />
            ) : (
              <span className="media-preview-placeholder">
                <i className={item.platform === 'instagram' ? 'ri-instagram-line' : 'ri-play-circle-line'} />
              </span>
            )}
            <span className="media-play">
              <i className={item.platform === 'instagram' || item.platform === 'other' ? 'ri-external-link-line' : 'ri-play-fill'} />
            </span>
          </button>
        )}
      </div>

      <div className="media-card-body">
        <div className="media-card-meta">
          {item.archive_bucket && (
            <span><i className={getArchiveBucketMeta(item.archive_bucket).icon} />{getArchiveBucketMeta(item.archive_bucket).label}</span>
          )}
          {item.collection_name && <span><i className="ri-folder-3-line" />{item.collection_name}</span>}
          <span>{platformLabel(item.platform)}</span>
          <span>{mediaTypeLabel(item.media_type)}</span>
          {!item.is_approved && <span className="media-pending-badge">대기</span>}
        </div>
        <h2>{item.title || '제목 없음'}</h2>
        {item.description && <p>{item.description}</p>}
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
        <a href={originalUrl} target="_blank" rel="noreferrer">
          <i className="ri-external-link-line" />
          원본
        </a>
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
  const bucket = getArchiveBucketMeta(item.archive_bucket);

  return (
    <article className={`media-card media-card--preview media-card--${item.platform}`}>
      <div className="media-preview">
        <div className="media-preview-button media-preview-button--static">
          {item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt="" draggable={false} />
          ) : (
            <span className="media-preview-placeholder">
              <i className={item.platform === 'instagram' ? 'ri-instagram-line' : item.platform === 'youtube' ? 'ri-youtube-line' : 'ri-link'} />
            </span>
          )}
          <span className="media-play">
            <i className={item.platform === 'youtube' ? 'ri-play-fill' : 'ri-external-link-line'} />
          </span>
        </div>
      </div>

      <div className="media-card-body">
        <div className="media-card-meta">
          <span><i className={bucket.icon} />{bucket.label}</span>
          {item.collection_name && <span><i className="ri-folder-3-line" />{item.collection_name}</span>}
          <span>{platformLabel(item.platform)}</span>
          <span>{mediaTypeLabel(item.media_type)}</span>
        </div>
        <h2>{item.title || '제목 없음'}</h2>
        {item.description && <p>{item.description}</p>}
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

const MediaMiniCard: React.FC<{ item: SnsMediaItem }> = ({ item }) => {
  const originalUrl = item.normalized_url || item.url;
  return (
    <a className="media-mini-card" href={originalUrl} target="_blank" rel="noreferrer">
      <span className="media-mini-thumb">
        {item.thumbnail_url ? (
          <img src={item.thumbnail_url} alt="" loading="lazy" draggable={false} />
        ) : (
          <i className={item.platform === 'instagram' ? 'ri-instagram-line' : item.platform === 'youtube' ? 'ri-youtube-line' : 'ri-link'} />
        )}
      </span>
      <span className="media-mini-copy">
        <strong>{item.title || '제목 없음'}</strong>
        <small>
          {[
            item.author_name,
            item.dance_genre,
            item.collection_name,
            platformLabel(item.platform),
          ].filter(Boolean).join(' · ')}
        </small>
      </span>
    </a>
  );
};

const ArchivePlacementPreview: React.FC<{ item: SnsMediaItem }> = ({ item }) => {
  const bucket = getArchiveBucketMeta(item.archive_bucket);
  const chips = [
    { key: 'bucket', icon: bucket.icon, label: bucket.label },
    item.dance_genre ? { key: 'genre', icon: 'ri-disc-line', label: item.dance_genre } : null,
    item.collection_name ? { key: 'collection', icon: 'ri-folder-3-line', label: item.collection_name } : null,
    ...(item.tags || []).slice(0, 4).map((tag) => ({ key: `tag-${tag}`, icon: 'ri-price-tag-3-line', label: tag })),
  ].filter(Boolean) as Array<{ key: string; icon: string; label: string }>;

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

const BucketArchiveView: React.FC<{ items: SnsMediaItem[] }> = ({ items }) => {
  const groups = ARCHIVE_BUCKETS
    .map((bucket) => ({
      bucket,
      items: items.filter((item) => (item.archive_bucket || 'reference') === bucket.id),
    }))
    .filter((group) => group.items.length > 0);

  if (!groups.length) {
    return <ModeEmptyState icon="ri-archive-drawer-line" title="보관함에 걸린 영상이 없습니다" detail="저장할 때 보관함을 고르면 여기에 모입니다." />;
  }

  return (
    <section className="media-board">
      {groups.map((group) => (
        <article key={group.bucket.id} className="media-board-section">
          <header>
            <span className="media-board-icon"><i className={group.bucket.icon} /></span>
            <div>
              <h2>{group.bucket.label}</h2>
              <p>{group.items.length}개</p>
            </div>
          </header>
          <div className="media-mini-grid">
            {group.items.map((item) => <MediaMiniCard key={item.id} item={item} />)}
          </div>
        </article>
      ))}
    </section>
  );
};

const CollectionArchiveView: React.FC<{ items: SnsMediaItem[] }> = ({ items }) => {
  const groups = groupByKey(items, (item) => compactText(item.collection_name) || '컬렉션 미지정')
    .sort((a, b) => {
      if (a.key === '컬렉션 미지정') return 1;
      if (b.key === '컬렉션 미지정') return -1;
      return b.items.length - a.items.length || a.key.localeCompare(b.key, 'ko');
    });

  if (!groups.length) {
    return <ModeEmptyState icon="ri-folder-3-line" title="컬렉션이 없습니다" detail="같은 안무, 인물, 강습 시리즈를 한 이름으로 묶을 수 있습니다." />;
  }

  return (
    <section className="media-collection-grid">
      {groups.map((group) => {
        const covers = group.items.filter((item) => item.thumbnail_url).slice(0, 3);
        return (
          <article key={group.key} className="media-collection-card">
            <div className="media-cover-stack">
              {covers.length ? covers.map((item) => <img key={item.id} src={item.thumbnail_url || ''} alt="" loading="lazy" draggable={false} />) : <i className="ri-folder-video-line" />}
            </div>
            <header>
              <h2>{group.key}</h2>
              <span>{group.items.length}개</span>
            </header>
            <div className="media-mini-list">
              {group.items.slice(0, 5).map((item) => <MediaMiniCard key={item.id} item={item} />)}
            </div>
          </article>
        );
      })}
    </section>
  );
};

const LearningArchiveView: React.FC<{ items: SnsMediaItem[] }> = ({ items }) => {
  const referenceItems = items.filter((item) => getLearningStageId(item) === 'reference');
  const groups = [
    ...LEARNING_STAGES.map((stage) => ({
      id: stage.id,
      label: stage.label,
      description: stage.description,
      icon: stage.icon,
      items: items.filter((item) => getLearningStageId(item) === stage.id),
    })),
    {
      id: 'reference',
      label: '레퍼런스 보류함',
      description: '아직 학습 단계가 정해지지 않은 참고 자료',
      icon: 'ri-bookmark-3-line',
      items: referenceItems,
    },
  ].filter((group) => group.items.length > 0);

  if (!groups.length) {
    return <ModeEmptyState icon="ri-route-line" title="학습 경로에 놓을 영상이 없습니다" detail="강습, 루틴, 기술 태그가 쌓이면 경로처럼 보입니다." />;
  }

  return (
    <section className="media-pathway">
      {groups.map((group, index) => (
        <article key={group.id} className="media-path-stage">
          <header>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i className={group.icon} />
            <div>
              <h2>{group.label}</h2>
              <p>{group.description}</p>
            </div>
          </header>
          <div className="media-mini-list">
            {group.items.map((item) => <MediaMiniCard key={item.id} item={item} />)}
          </div>
        </article>
      ))}
    </section>
  );
};

const TimelineArchiveView: React.FC<{ items: SnsMediaItem[] }> = ({ items }) => {
  const groups = groupByKey(items, getItemYear)
    .sort((a, b) => {
      if (a.key === '날짜 미정') return 1;
      if (b.key === '날짜 미정') return -1;
      return Number(b.key) - Number(a.key);
    });

  if (!groups.length) {
    return <ModeEmptyState icon="ri-timeline-view" title="타임라인에 놓을 영상이 없습니다" detail="날짜가 있는 자료는 연도별로 정렬됩니다." />;
  }

  return (
    <section className="media-timeline">
      {groups.map((group) => (
        <article key={group.key} className="media-timeline-row">
          <header>
            <span>{group.key}</span>
            <small>{group.items.length}개</small>
          </header>
          <div className="media-mini-grid">
            {group.items.map((item) => <MediaMiniCard key={item.id} item={item} />)}
          </div>
        </article>
      ))}
    </section>
  );
};

const CompareArchiveView: React.FC<{ items: SnsMediaItem[] }> = ({ items }) => {
  const groups = groupByKey(items.filter((item) => compactText(item.collection_name)), (item) => compactText(item.collection_name))
    .filter((group) => group.items.length >= 2)
    .sort((a, b) => b.items.length - a.items.length || a.key.localeCompare(b.key, 'ko'));

  if (!groups.length) {
    return <ModeEmptyState icon="ri-layout-column-line" title="비교할 묶음이 아직 없습니다" detail="같은 컬렉션 이름으로 2개 이상 저장하면 나란히 비교됩니다." />;
  }

  return (
    <section className="media-compare">
      {groups.map((group) => (
        <article key={group.key} className="media-compare-section">
          <header>
            <h2>{group.key}</h2>
            <span>{group.items.length}개 버전</span>
          </header>
          <div className="media-compare-grid">
            {group.items.map((item) => <MediaMiniCard key={item.id} item={item} />)}
          </div>
        </article>
      ))}
    </section>
  );
};

const MediaArchivePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, userProfile, signInWithKakao } = useAuth();
  const [items, setItems] = useState<SnsMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [platform, setPlatform] = useState<'all' | MediaPlatform>('all');
  const [genre, setGenre] = useState('all');
  const [archiveBucketFilter, setArchiveBucketFilter] = useState('all');
  const [viewMode, setViewMode] = useState<ArchiveViewMode>('grid');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [draftNotice, setDraftNotice] = useState('');
  const [parsed, setParsed] = useState(() => parseMediaUrl(''));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const clipperImportKeyRef = useRef('');
  const restoredDraftRef = useRef(false);

  const canCreate = Boolean(user);

  const availableGenres = useMemo(() => {
    const fromItems = items.map((item) => item.dance_genre).filter(Boolean) as string[];
    return Array.from(new Set([...GENRE_PRESETS, ...fromItems])).sort((a, b) => a.localeCompare(b, 'ko'));
  }, [items]);

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
      collection_name: form.collectionName.trim() || null,
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
  }, [form, parsed]);

  const fetchItems = useCallback(async (nextPage = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      let request = cafe24
        .from('sns_media_items')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(nextPage * PAGE_SIZE, nextPage * PAGE_SIZE + PAGE_SIZE - 1);

      if (platform !== 'all') request = request.eq('platform', platform);
      if (genre !== 'all') request = request.eq('dance_genre', genre);
      if (archiveBucketFilter !== 'all') request = request.eq('archive_bucket', archiveBucketFilter);
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
  }, [archiveBucketFilter, genre, platform, submittedQuery]);

  useEffect(() => {
    fetchItems(0, false);
  }, [fetchItems]);

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
    ].join(':');
    if (clipperImportKeyRef.current === importKey) return;
    clipperImportKeyRef.current = importKey;

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
    clearPendingMediaDraft();
  };

  const handleToggleForm = () => {
    if (showForm) {
      setShowForm(false);
      resetForm();
      return;
    }
    setShowForm(true);
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
      collection_name: form.collectionName.trim() || null,
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

    try {
      const { error } = await cafe24
        .from('sns_media_items')
        .insert(payload);
      if (error) throw error;
      resetForm();
      setShowForm(false);
      await fetchItems(0, false);
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
  };

  const handleDelete = async (item: SnsMediaItem) => {
    if (!confirm('이 영상을 아카이브에서 삭제할까요?')) return;
    const { error } = await cafe24.from('sns_media_items').delete().eq('id', item.id);
    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
      return;
    }
    fetchItems(0, false);
  };

  const renderArchiveView = () => {
    if (viewMode === 'buckets') return <BucketArchiveView items={items} />;
    if (viewMode === 'collections') return <CollectionArchiveView items={items} />;
    if (viewMode === 'learning') return <LearningArchiveView items={items} />;
    if (viewMode === 'timeline') return <TimelineArchiveView items={items} />;
    if (viewMode === 'compare') return <CompareArchiveView items={items} />;
    return (
      <section className="media-grid">
        {items.map((item) => (
          <MediaCard
            key={item.id}
            item={item}
            canManage={isAdmin || item.created_by === user?.id}
            onApprove={handleApprove}
            onDelete={handleDelete}
          />
        ))}
      </section>
    );
  };

  return (
    <main className="media-archive-page">
      <header className="media-archive-header">
        <button className="media-back-button" type="button" onClick={() => navigate('/forum')}>
          <i className="ri-arrow-left-line" />
        </button>
        <div>
          <p className="media-eyebrow">SNS Archive</p>
          <h1>SNS 영상 아카이브</h1>
          <p>유튜브, 인스타그램 Reels와 게시물을 모아 검색합니다.</p>
        </div>
        <button className="media-add-button" type="button" onClick={handleToggleForm}>
          <i className={showForm ? 'ri-close-line' : 'ri-add-line'} />
          <span>{showForm ? '닫기' : '영상 추가'}</span>
        </button>
      </header>

      {showForm && (
        <form className="media-submit-panel media-submit-panel--composer" onSubmit={handleSubmit}>
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

            <div className="media-bucket-picker" aria-label="보관함 선택">
              {ARCHIVE_BUCKETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={form.archiveBucket === item.id ? 'active' : ''}
                  onClick={() => setForm((prev) => ({ ...prev, archiveBucket: item.id }))}
                >
                  <i className={item.icon} />
                  {item.label}
                </button>
              ))}
            </div>

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
              <label className="media-field media-field--wide">
                <span>컬렉션</span>
                <input
                  value={form.collectionName}
                  onChange={(event) => setForm((prev) => ({ ...prev, collectionName: event.target.value }))}
                  placeholder="예: Shim Sham 버전 모음, 에어리얼 입문, Frankie Manning 히스토리"
                />
              </label>
              <label className="media-field media-field--wide">
                <span>검색 태그</span>
                <input value={form.tags} onChange={(event) => setForm((prev) => ({ ...prev, tags: event.target.value }))} placeholder="예: 스윙아웃, 공연, 팔로워, 영감" />
              </label>
              <label className="media-field media-field--wide">
                <span>원본 설명 / 메모</span>
                <textarea value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} rows={3} placeholder="원본 설명이 있으면 자동 입력됩니다. 나중에 찾을 포인트를 덧붙여도 됩니다." />
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
      )}

      <section className="media-controls">
        <form className="media-search" onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query.trim());
        }}>
          <i className="ri-search-line" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제목, 작성자, 컬렉션, 태그 검색" />
          <button type="submit">검색</button>
        </form>
        <div className="media-view-switch" aria-label="보기 모드">
          {ARCHIVE_VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={viewMode === mode.id ? 'active' : ''}
              onClick={() => setViewMode(mode.id)}
            >
              <i className={mode.icon} />
              {mode.label}
            </button>
          ))}
        </div>
        <div className="media-filter-row" aria-label="플랫폼 필터">
          {PLATFORM_FILTERS.map((item) => (
            <button key={item.value} type="button" className={platform === item.value ? 'active' : ''} onClick={() => setPlatform(item.value)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="media-filter-row media-filter-row--scroll" aria-label="보관함 필터">
          <button type="button" className={archiveBucketFilter === 'all' ? 'active' : ''} onClick={() => setArchiveBucketFilter('all')}>전체 보관함</button>
          {ARCHIVE_BUCKETS.map((item) => (
            <button key={item.id} type="button" className={archiveBucketFilter === item.id ? 'active' : ''} onClick={() => setArchiveBucketFilter(item.id)}>
              <i className={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="media-filter-row media-filter-row--scroll" aria-label="장르 필터">
          <button type="button" className={genre === 'all' ? 'active' : ''} onClick={() => setGenre('all')}>전체 장르</button>
          {availableGenres.map((item) => (
            <button key={item} type="button" className={genre === item ? 'active' : ''} onClick={() => setGenre(item)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <div className="media-state">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="media-state media-state--empty">
          <i className="ri-film-line" />
          <strong>아직 저장된 영상이 없습니다</strong>
          <span>좋은 영상 링크를 첫 번째로 모아보세요.</span>
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
