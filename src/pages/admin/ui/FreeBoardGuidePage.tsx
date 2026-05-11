import { useMemo, useState, type KeyboardEvent } from 'react';
import './FreeBoardGuidePage.css';

type PreviewMode = 'desktop' | 'mobile' | 'compare';

interface PreviewPost {
  id: number;
  prefix: string;
  prefixTone: 'green' | 'blue' | 'violet' | 'slate';
  title: string;
  author: string;
  authorRole: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  body: string;
  hasImage?: boolean;
  notice?: boolean;
}

const samplePosts: PreviewPost[] = [
  {
    id: 1,
    prefix: '공지',
    prefixTone: 'slate',
    title: '자유게시판 이용 안내와 글 작성 기준',
    author: '관리자',
    authorRole: '운영',
    date: '2026. 05. 11.',
    views: 128,
    likes: 4,
    comments: 2,
    body: '서로가 필요한 정보를 빠르게 찾을 수 있도록 제목은 구체적으로 적고, 행사 홍보나 외부 링크는 관련 말머리를 함께 사용합니다. 반복 홍보와 무관한 광고는 운영 기준에 따라 정리됩니다.',
    notice: true,
  },
  {
    id: 2,
    prefix: '잡담',
    prefixTone: 'green',
    title: 'ai를 활용한 수집 방식, 실제로 어디까지 자동화할 수 있을까?',
    author: 'TC',
    authorRole: '회원',
    date: '2026. 05. 09.',
    views: 34,
    likes: 1,
    comments: 0,
    body: '카페와 인스타그램을 한 번에 훑는 방식은 가능하지만, 마지막 검수 단계는 아직 사람이 보는 편이 안전해 보입니다. 특히 날짜가 여러 개인 행사나 장소가 바뀌는 강습은 예외 처리가 필요합니다.',
  },
  {
    id: 3,
    prefix: '질문',
    prefixTone: 'blue',
    title: '이번 주말 초보가 들을 만한 소셜이나 연습 모임 있을까요?',
    author: '바다',
    authorRole: '신규',
    date: '2026. 05. 08.',
    views: 56,
    likes: 3,
    comments: 5,
    body: '입문반을 끝낸 지 얼마 안 됐고 아직 플로어가 낯섭니다. 토요일 저녁이나 일요일 오후에 초보도 편하게 갈 수 있는 소셜, 연습 모임이 있으면 추천 부탁드립니다.',
    hasImage: true,
  },
  {
    id: 4,
    prefix: '후기',
    prefixTone: 'violet',
    title: '처음 가본 해피홀 소셜 후기: 동선, 분위기, 음악 모두 좋았어요',
    author: 'swingcat',
    authorRole: '활동 회원',
    date: '2026. 05. 07.',
    views: 91,
    likes: 8,
    comments: 4,
    body: '입장 동선이 명확하고 초보자도 눈치 보지 않고 들어갈 수 있는 분위기였습니다. 중간 템포 곡이 충분해서 무리 없이 오래 출 수 있었고, 쉬는 공간도 잘 분리되어 있었습니다.',
    hasImage: true,
  },
  {
    id: 5,
    prefix: '건의',
    prefixTone: 'blue',
    title: '캘린더에서 장소별 필터가 조금 더 빠르게 보이면 좋겠습니다',
    author: '로컬댄서',
    authorRole: '회원',
    date: '2026. 05. 06.',
    views: 22,
    likes: 0,
    comments: 1,
    body: '장소를 기준으로 일정을 고르는 일이 많아서, 리스트 상단이나 지도 모드 진입 직후에 장소 필터가 바로 보이면 좋겠습니다. 자주 가는 장소를 저장하는 방식도 괜찮아 보입니다.',
  },
];

const getInitialPreviewMode = (): PreviewMode => {
  if (typeof window !== 'undefined' && window.innerWidth <= 720) return 'mobile';
  return 'compare';
};

function PrefixBadge({ post }: { post: PreviewPost }) {
  return <span className={`fbg-prefix fbg-prefix--${post.prefixTone}`}>{post.prefix}</span>;
}

function Thumb({ index }: { index: number }) {
  return (
    <div className={`fbg-thumb fbg-thumb--${index % 3}`}>
      <i className="ri-image-line" />
    </div>
  );
}

function handlePreviewKeyDown(
  event: KeyboardEvent<HTMLElement>,
  post: PreviewPost,
  onSelect: (post: PreviewPost) => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect(post);
}

function DesktopPreview({
  selectedPostId,
  onSelect,
}: {
  selectedPostId: number;
  onSelect: (post: PreviewPost) => void;
}) {
  return (
    <section className="fbg-preview fbg-desktop-preview" aria-label="desktop preview">
      <div className="fbg-board-bar">
        <div>
          <strong>자유게시판</strong>
          <span>최근 대화</span>
        </div>
        <button type="button">
          <i className="ri-edit-line" />
          글쓰기
        </button>
      </div>

      <div className="fbg-filter-row">
        {['전체', '공지', '건의', '잡담', '후기'].map((item, index) => (
          <button key={item} type="button" className={index === 0 ? 'is-active' : ''}>
            {item}
          </button>
        ))}
      </div>

      <div className="fbg-desktop-list">
        {samplePosts.map((post, index) => (
          <article
            key={post.id}
            className={`fbg-desktop-row ${post.notice ? 'is-notice' : ''} ${post.id === selectedPostId ? 'is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={post.id === selectedPostId}
            onClick={() => onSelect(post)}
            onKeyDown={(event) => handlePreviewKeyDown(event, post, onSelect)}
          >
            <div className="fbg-row-accent" />
            <div className="fbg-row-prefix">
              <PrefixBadge post={post} />
            </div>
            <div className="fbg-row-main">
              <h3>{post.title}</h3>
              <div className="fbg-row-meta">
                <span>{post.author}</span>
                <span>{post.date}</span>
              </div>
            </div>
            <div className="fbg-row-stats">
              <span><i className="ri-eye-line" />{post.views}</span>
              <span><i className="ri-heart-line" />{post.likes}</span>
              <span><i className="ri-chat-3-line" />{post.comments}</span>
            </div>
            <div className="fbg-row-thumb">
              {post.hasImage ? <Thumb index={index} /> : <span className="fbg-no-thumb" />}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MobilePreview({
  selectedPostId,
  onSelect,
}: {
  selectedPostId: number;
  onSelect: (post: PreviewPost) => void;
}) {
  return (
    <section className="fbg-mobile-frame" aria-label="mobile preview">
      <div className="fbg-mobile-top">
        <strong>자유게시판</strong>
        <i className="ri-search-line" />
      </div>
      <div className="fbg-mobile-tabs">
        {['전체', '공지', '건의', '잡담', '후기'].map((item, index) => (
          <button key={item} type="button" className={index === 0 ? 'is-active' : ''}>
            {item}
          </button>
        ))}
      </div>
      <div className="fbg-mobile-list">
        {samplePosts.map((post, index) => (
          <article
            key={post.id}
            className={`fbg-mobile-row ${post.notice ? 'is-notice' : ''} ${post.id === selectedPostId ? 'is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={post.id === selectedPostId}
            onClick={() => onSelect(post)}
            onKeyDown={(event) => handlePreviewKeyDown(event, post, onSelect)}
          >
            <div className="fbg-mobile-content">
              <div className="fbg-mobile-titleline">
                <PrefixBadge post={post} />
                <h3>{post.title}</h3>
              </div>
              <div className="fbg-mobile-meta">
                <span>{post.author}</span>
                <span>{post.date}</span>
                <span><i className="ri-chat-3-line" />{post.comments}</span>
              </div>
            </div>
            {post.hasImage && <Thumb index={index} />}
          </article>
        ))}
      </div>
      <button type="button" className="fbg-mobile-write" aria-label="글쓰기">
        <i className="ri-edit-line" />
      </button>
    </section>
  );
}

function DetailPreview({ post }: { post: PreviewPost }) {
  return (
    <section className="fbg-detail-preview" aria-label="detail preview">
      <div className="fbg-detail-shell">
        <header className="fbg-detail-topbar">
          <button type="button" aria-label="뒤로가기">
            <i className="ri-arrow-left-line" />
          </button>
          <span>게시글 상세 샘플</span>
          <button type="button" aria-label="닫기">
            <i className="ri-close-line" />
          </button>
        </header>

        <article className="fbg-detail-article">
          <div className="fbg-detail-title-row">
            <PrefixBadge post={post} />
            <span className="fbg-detail-author-role">{post.authorRole}</span>
          </div>
          <h2>{post.title}</h2>
          <div className="fbg-detail-meta">
            <span><i className="ri-user-line" />{post.author}</span>
            <span><i className="ri-time-line" />{post.date}</span>
            <span><i className="ri-eye-line" />{post.views}</span>
          </div>

          {post.hasImage && (
            <div className="fbg-detail-image">
              <Thumb index={post.id} />
              <div>
                <strong>첨부 이미지 영역</strong>
                <span>본문보다 먼저 안정적인 비율로 노출</span>
              </div>
            </div>
          )}

          <p>{post.body}</p>

          <div className="fbg-detail-actions">
            <button type="button" className="is-active">
              <i className="ri-heart-fill" />
              {post.likes}
            </button>
            <button type="button">
              <i className="ri-chat-3-line" />
              댓글 {post.comments}
            </button>
            <button type="button">
              <i className="ri-share-line" />
              공유
            </button>
          </div>
        </article>

        <section className="fbg-comment-preview">
          <div className="fbg-comment-head">
            <strong>댓글</strong>
            <span>{post.comments}</span>
          </div>
          <div className="fbg-comment-item">
            <strong>민트</strong>
            <p>정보가 한눈에 보여서 모바일에서도 읽기 편합니다.</p>
          </div>
          <div className="fbg-comment-form">
            <span>댓글을 입력하세요</span>
            <button type="button">
              <i className="ri-send-plane-fill" />
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function FreeBoardGuidePage() {
  const [mode, setMode] = useState<PreviewMode>(getInitialPreviewMode);
  const [selectedPostId, setSelectedPostId] = useState(samplePosts[2].id);

  const layoutClass = useMemo(() => {
    if (mode === 'desktop') return 'is-desktop-only';
    if (mode === 'mobile') return 'is-mobile-only';
    return 'is-compare';
  }, [mode]);

  const selectedPost = useMemo(
    () => samplePosts.find((post) => post.id === selectedPostId) || samplePosts[0],
    [selectedPostId],
  );

  return (
    <main className="free-board-guide-page">
      <section className="fbg-hero">
        <div>
          <span className="fbg-kicker">Board UI guide</span>
          <h1>자유게시판 개선 샘플</h1>
          <p>운영 화면을 건드리지 않는 별도 프리뷰입니다. 데스크탑은 정보 밀도와 정렬, 모바일은 제목 가독성과 썸네일 안정성을 기준으로 나눴습니다.</p>
        </div>
        <div className="fbg-mode-switch" role="tablist" aria-label="preview mode">
          {[
            ['compare', '비교'],
            ['desktop', '데스크탑'],
            ['mobile', '모바일'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={mode === value ? 'is-active' : ''}
              onClick={() => setMode(value as PreviewMode)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className={`fbg-preview-grid ${layoutClass}`}>
        <div className="fbg-preview-column fbg-preview-column--desktop">
          <div className="fbg-section-label">
            <strong>Desktop</strong>
            <span>넓은 화면 전용 리스트 · 선택 상태 포함</span>
          </div>
          <DesktopPreview selectedPostId={selectedPost.id} onSelect={(post) => setSelectedPostId(post.id)} />
        </div>

        <div className="fbg-preview-column fbg-preview-column--mobile">
          <div className="fbg-section-label">
            <strong>Mobile</strong>
            <span>작은 화면 전용 리스트 · 썸네일 안정화</span>
          </div>
          <MobilePreview selectedPostId={selectedPost.id} onSelect={(post) => setSelectedPostId(post.id)} />
        </div>
      </section>

      <section className="fbg-detail-section">
        <div className="fbg-section-label">
          <strong>Detail</strong>
          <span>리스트에서 선택한 게시글 상세 화면</span>
        </div>
        <DetailPreview post={selectedPost} />
      </section>

      <section className="fbg-principles">
        <div>
          <strong>정렬</strong>
          <p>말머리, 제목, 작성자 시작선을 고정해서 행마다 시선이 흔들리지 않게 합니다.</p>
        </div>
        <div>
          <strong>색</strong>
          <p>배경은 3단계만 쓰고 말머리는 낮은 채도의 보조색으로 제한합니다.</p>
        </div>
        <div>
          <strong>분리</strong>
          <p>데스크탑과 모바일을 같은 반응형 규칙으로 억지로 맞추지 않습니다.</p>
        </div>
      </section>
    </main>
  );
}
