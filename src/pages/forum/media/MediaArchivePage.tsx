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

function getArchiveBucketMeta(value?: string | null) {
  return ARCHIVE_BUCKETS.find((item) => item.id === value) || ARCHIVE_BUCKETS[0];
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
              <img src={item.thumbnail_url} alt="" loading="lazy" />
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
            <img src={item.thumbnail_url} alt="" />
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

const MediaArchivePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin, userProfile, signInWithKakao } = useAuth();
  const canUseArchiveBeta = import.meta.env.DEV || isAdmin;
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
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [parsed, setParsed] = useState(() => parseMediaUrl(''));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const clipperImportKeyRef = useRef('');

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
    const searchParams = new URLSearchParams(location.search);
    const hashValue = location.hash.startsWith('#clipper?')
      ? location.hash.slice('#clipper?'.length)
      : location.hash.startsWith('#?')
        ? location.hash.slice(2)
        : '';
    const hashParams = new URLSearchParams(hashValue);
    const params = searchParams.get('add') || searchParams.get('url') ? searchParams : hashParams;
    const addUrl = params.get('add') || params.get('url');
    if (!addUrl) return;

    const importKey = `${addUrl}:${params.get('title') || ''}:${params.get('thumbnail') || ''}`;
    if (clipperImportKeyRef.current === importKey) return;
    clipperImportKeyRef.current = importKey;

    setShowForm(true);
    setForm((prev) => ({
      ...prev,
      url: addUrl,
      title: params.get('title') || prev.title,
      description: params.get('description') || prev.description,
      authorName: params.get('author') || prev.authorName,
      thumbnailUrl: safeImageUrl(params.get('thumbnail')) || prev.thumbnailUrl,
      archiveBucket: params.get('bucket') || prev.archiveBucket,
      collectionName: params.get('collection') || prev.collectionName,
      tags: params.get('tags') || prev.tags,
      danceGenre: params.get('genre') || prev.danceGenre,
      publishedAt: safeInputDate(params.get('published')) || prev.publishedAt,
      sourceContext: params.get('source') || prev.sourceContext || 'Chrome 클리퍼',
    }));

    navigate('/forum/media', { replace: true });
  }, [location.hash, location.search, navigate]);

  const resetForm = () => {
    setForm(emptyForm);
    setParsed(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) {
      await signInWithKakao();
      return;
    }

    const media = parseMediaUrl(form.url);
    if (!media) {
      alert('유튜브나 인스타그램 URL을 확인해주세요.');
      return;
    }

    const title = form.title.trim() || `${platformLabel(media.platform)} ${mediaTypeLabel(media.media_type)}`;
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

  if (!canUseArchiveBeta) {
    return (
      <main className="media-archive-page">
        <section className="media-access-state">
          <i className="ri-lock-2-line" />
          <h1>SNS 아카이브 테스트 중</h1>
          <p>지금은 관리자 테스트 계정에서만 열립니다.</p>
          <div className="media-access-actions">
            <button type="button" onClick={() => navigate('/forum')}>
              <i className="ri-arrow-left-line" />
              포럼으로
            </button>
            {!user && (
              <button type="button" onClick={() => signInWithKakao()}>
                <i className="ri-kakao-talk-fill" />
                로그인
              </button>
            )}
          </div>
        </section>
      </main>
    );
  }

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
        <button className="media-add-button" type="button" onClick={() => setShowForm((value) => !value)}>
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
          </section>

          <section className="media-compose-fields" aria-label="아카이브 정보">
            <div className="media-compose-section-title">
              <i className="ri-archive-drawer-line" />
              <span>아카이브 정보</span>
            </div>

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
                    <input value={form.sourceContext} onChange={(event) => setForm((prev) => ({ ...prev, sourceContext: event.target.value }))} placeholder="예: Chrome 클리퍼, 서울 스윙씬, 수업 참고" />
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
      )}

      <div ref={sentinelRef} className="media-sentinel">
        {loadingMore && <span>더 불러오는 중...</span>}
        {!hasMore && items.length > 0 && <span>마지막입니다</span>}
      </div>
    </main>
  );
};

export default MediaArchivePage;
