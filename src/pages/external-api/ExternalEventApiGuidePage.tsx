import { useEffect, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../hooks/useModal';
import {
  curlExample,
  multipleDatesExample,
  serverExamples,
  singleEventExample,
} from './externalEventApiGuideExamples';
import './ExternalEventApiGuidePage.css';

const guideSearchItems = [
  { id: 'quick-start', title: '연동 신청과 API Key', summary: '로그인, 신청, 승인, 인증, 보안', keywords: '파트너 신청 계정 이메일 전화번호 키 발급 bearer secret env' },
  { id: 'request-example', title: '일정 등록 요청과 서버 코드', summary: 'cURL, Node.js, PHP, Python, Java 등록 예시', keywords: 'post json fetch curl requests httpclient 서버리스 코드 예제' },
  { id: 'dates', title: '날짜 입력', summary: '단일 일정, 개별 날짜 여러 개, 연속 기간 미지원', keywords: 'event_dates start_date end_date 단일 개별 일정 날짜 배열' },
  { id: 'categories', title: '최상위 분류와 하위 장르', summary: 'category와 genre 허용 조합 및 중복 규칙', keywords: 'social event class club 소셜 행사 강습 동호회 워크샵 파티 린디합 장르 분류' },
  { id: 'images', title: '이미지 등록', summary: '직접 업로드, 공개 URL, WebP 4종 변환', keywords: 'image upload url avif jpeg png webp 32mb 포스터 수정 삭제' },
  { id: 'address', title: '카카오맵 주소 확인', summary: '도로명주소, 다음 우편번호, 지도 호환 안내', keywords: 'address postal_code daum kakao naver google map 장소 주소 검색' },
  { id: 'fields', title: '요청 필드 정리', summary: '필수값, 선택값, 데이터 형식', keywords: 'external_id title source_url time location description field 필드' },
  { id: 'sync', title: '일정 수정과 삭제', summary: 'PUT, DELETE, external_id와 이미지 교체', keywords: 'crud update delete 동기화 자동 반영 소유권 같은 키' },
  { id: 'regular-socials', title: '정규 소셜 반복 규칙과 예외', summary: '반복 일정, DJ 미정, 휴무, 포스터 있는 회차 대체', keywords: 'regular social 반복 정규 소셜 dj 미정 closure override 휴무 졸공 포스터 우선순위 중복' },
  { id: 'limits', title: '요청 한도와 오류 대응', summary: '테스트·운영 한도, 429와 오류 코드', keywords: 'rate limit 도배 테스트 상향 400 401 403 404 409 422 429' },
] as const;

const normalizeGuideSearchText = (value: string) => (
  value
    .normalize('NFKC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s\-_/·.,()[\]{}]+/g, '')
);

const getGuideSearchTokens = (value: string) => {
  const normalized = value.normalize('NFKC').toLocaleLowerCase('ko-KR');
  const separated = normalized
    .replace(/([가-힣ㄱ-ㅎㅏ-ㅣ])([a-z0-9])/g, '$1 $2')
    .replace(/([a-z0-9])([가-힣ㄱ-ㅎㅏ-ㅣ])/g, '$1 $2');
  return separated
    .split(/[\s\-_/·.,()[\]{}]+/)
    .map(normalizeGuideSearchText)
    .filter(Boolean);
};

const addressApiExample = `<script src="//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js"></script>
<script>
function selectRoadAddress() {
  new daum.Postcode({
    oncomplete(data) {
      if (!data.roadAddress) {
        alert("도로명주소를 선택해 주세요.");
        return;
      }

      // 일정 API 요청에 그대로 넣을 값입니다.
      eventPayload.address = data.roadAddress;
      eventPayload.postal_code = data.zonecode;
      eventPayload.address_source = "daum_postcode";
    }
  }).open();
}
</script>
<button type="button" onclick="selectRoadAddress()">도로명주소 검색</button>`;

const updateEventExample = `const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
const externalId = "partner-event-20260801-1"; // 등록 때 사용한 값

const event = {
  external_id: externalId,
  title: "토요일 린디합 강습 (시간 변경)",
  event_dates: ["2026-08-01"],
  time: "19:30",
  category: "class",
  genre: "린디합",
  benefit_kind: "free_event",
  source_url: "https://partner.example.com/events/1",
  image_mode: "url",
  image_url: "https://partner.example.com/images/1-updated.webp"
};

const response = await fetch(
  \`https://swingenjoy.com/api/external/v1/events/\${encodeURIComponent(externalId)}\`,
  {
    method: "PUT",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  }
);
const result = await response.json();
if (!response.ok) throw new Error(result.message || "일정 수정 실패");`;

const deleteEventExample = `const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
const externalId = "partner-event-20260801-1"; // 등록 때 사용한 값

const response = await fetch(
  \`https://swingenjoy.com/api/external/v1/events/\${encodeURIComponent(externalId)}\`,
  {
    method: "DELETE",
    headers: { Authorization: \`Bearer \${API_KEY}\` }
  }
);
const result = await response.json();
if (!response.ok) throw new Error(result.message || "일정 삭제 실패");`;

const regularSocialRuleExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/regular-socials' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "external_id": "friday-social",
    "title": "금요 소셜",
    "weekday": 5,
    "time": "20:00",
    "location": "샘플홀",
    "source_url": "https://partner.example.com/socials/friday",
    "valid_from": "2026-08-01",
    "active": true
  }'`;

const regularSocialDjOverrideExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/regular-socials/friday-social/exceptions' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "external_id": "friday-social-20260807-dj",
    "date": "2026-08-07",
    "type": "override",
    "dj_name": "메이저",
    "source_url": "https://partner.example.com/socials/20260807"
  }'`;

const regularSocialClosureExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/regular-socials/friday-social/exceptions' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "external_id": "friday-social-20260814-closed",
    "date": "2026-08-14",
    "type": "closure",
    "source_url": "https://partner.example.com/notices/20260814"
  }'`;

const datedSocialWithPosterExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/events' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "external_id": "friday-social-20260821",
    "title": "금요 소셜 · DJ 메이저",
    "event_dates": ["2026-08-21"],
    "time": "20:00",
    "location": "샘플홀",
    "address": "서울 마포구 샘플로 1",
    "category": "social",
    "genre": "소셜",
    "description": "DJ 메이저",
    "source_url": "https://partner.example.com/socials/20260821",
    "image_mode": "url",
    "image_url": "https://partner.example.com/images/20260821.webp"
  }'`;

const updateRegularSocialRuleExample = `curl -X PUT 'https://swingenjoy.com/api/external/v1/regular-socials/friday-social' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '{
    "external_id": "friday-social",
    "title": "금요 소셜",
    "weekday": 5,
    "time": "20:30",
    "location": "샘플홀",
    "source_url": "https://partner.example.com/socials/friday",
    "active": true
  }'`;

const deleteRegularSocialExceptionExample = `curl -X DELETE \\
  'https://swingenjoy.com/api/external/v1/regular-socials/friday-social/exceptions/friday-social-20260814-closed' \\
  -H 'Authorization: Bearer 발급받은_API_KEY'`;

const imageUploadExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/images' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: image/jpeg' \\
  --data-binary '@poster.jpg'`;

const uploadedImageEventExample = `{
  "image_mode": "upload",
  "image_url": "이미지 업로드 응답의 image_url"
}`;

const remoteImageEventExample = `{
  "image_mode": "url",
  "image_url": "https://partner.example.com/poster.jpg"
}`;

const categoryRows = [
  { label: '소셜', category: 'social', genres: ['소셜', '졸공'] },
  { label: '행사', category: 'event', genres: ['워크샵', '파티', '대회', '라이브밴드', '기타'] },
  { label: '강습', category: 'class', genres: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'] },
  { label: '동호회', category: 'club', genres: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'] },
];

const fieldRows = [
  ['external_id', '필수', '파트너 시스템에서 사용하는 일정 고유번호'],
  ['title', '필수', '일정 제목'],
  ['event_dates', '필수', '실제로 선택한 날짜 배열, YYYY-MM-DD'],
  ['category / genre', '필수*', '표에 있는 최상위·하위 분류 조합'],
  ['source_url', '필수', '파트너 사이트의 공개 HTTPS 상세 주소'],
  ['time', '선택', '일정 시간'],
  ['location', '선택', '장소명'],
  ['address', '선택', '지도 연동이 필요할 때 보내는 확인된 행정안전부 도로명주소'],
  ['address_detail', '선택', '층·호수 등 상세 위치. 지도 검색 주소와 분리'],
  ['postal_code', '선택', '주소 확인 서비스가 반환한 5자리 우편번호'],
  ['address_source', '선택', '주소를 확인한 서비스 기록'],
  ['description', '선택', '상세 설명'],
  ['benefit_kind', '선택', '무료는 free_event, 할인 이벤트는 discount_event, 일반 일정은 생략 또는 null'],
  ['image_mode / image_url', '조건부', 'social 이외의 분류에서 필수'],
];

const requestValueRows = [
  ['external_id', '자유롭게 정함', '최대 160자. 파트너 시스템의 일정 ID를 사용하세요. 등록 후에는 같은 일정의 수정·삭제에 동일한 값을 계속 사용합니다.'],
  ['title', '자유로운 문자열', '실제 일정 제목으로 바꿉니다. 최대 255자입니다.'],
  ['event_dates', '정해진 날짜 형식', 'YYYY-MM-DD 배열입니다. 단일 일정은 1개, 개별 날짜 일정은 선택한 날짜를 여러 개 넣습니다.'],
  ['category / genre', '허용 코드만 가능', '관리자가 승인한 최상위 분류와 이 페이지의 장르표에 있는 값만 사용합니다.'],
  ['source_url', '공개 HTTPS URL', '상대 사이트의 실제 일정 상세 페이지 주소로 바꿉니다.'],
  ['time / location', '자유로운 문자열', '표시할 시간과 장소명입니다. 필요 없으면 생략할 수 있습니다.'],
  ['benefit_kind', '허용 코드만 가능', '무료는 free_event, 할인 이벤트는 discount_event입니다. 일반 일정은 생략하거나 null을 보냅니다.'],
  ['image_mode', 'upload 또는 url', '이미지 전달 방식에 맞춰 둘 중 하나만 사용합니다.'],
  ['image_url', '이미지 URL', '업로드 API 응답 URL 또는 로그인 없이 열리는 공개 HTTPS 이미지 URL입니다.'],
];

const errorRows = [
  ['400', 'invalid_request', '입력값을 수정한 뒤 다시 요청해 주세요.'],
  ['401', 'invalid_api_key', '키를 확인하고 자동 재시도를 중단해 주세요.'],
  ['404', 'not_found', 'external_id와 사용한 키를 확인해 주세요.'],
  ['413', 'payload_too_large', 'JSON 또는 이미지 크기를 줄여 주세요.'],
  ['415', 'unsupported_media_type', 'AVIF, JPEG, PNG, WebP를 사용해 주세요.'],
  ['429', 'rate_limit_exceeded', '자동 재시도를 멈추고 잠시 후 다시 요청해 주세요.'],
];

function CodeBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="EAG-code">
      <div className="EAG-codeHeader">
        <span>{label}</span>
        <button type="button" onClick={copy}>
          <i className={copied ? 'ri-check-line' : 'ri-file-copy-line'} aria-hidden="true" />
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}

export default function ExternalEventApiGuidePage() {
  const { isAdmin, user, userProfile, signInWithKakao } = useAuth();
  const partnerManagementModal = useModal('externalApiPartnerManagement');
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [shareResult, setShareResult] = useState('');
  const [application, setApplication] = useState({
    partner_name: '',
    contact_email: '',
    contact_phone: '',
    note: '',
  });
  const [useLoginEmail, setUseLoginEmail] = useState(false);
  const [applicationResult, setApplicationResult] = useState('');
  const [serverExampleId, setServerExampleId] = useState<(typeof serverExamples)[number]['id']>('node');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSectionOpen, setIsSectionOpen] = useState(false);
  const [searchViewport, setSearchViewport] = useState({ height: 0, top: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
  const [activeSectionId, setActiveSectionId] = useState('quick-start');
  const [isTocFollowing, setIsTocFollowing] = useState(false);
  const [myPartners, setMyPartners] = useState<Array<{
    id: string; name: string; environment: 'test' | 'live'; per_minute_limit: number; daily_limit: number;
  }>>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [limitResult, setLimitResult] = useState('');
  const loginEmailIsUsable = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user?.email?.trim() || '');
  const contactEmailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(application.contact_email.trim());
  const contactPhoneDigits = application.contact_phone.replace(/\D/g, '');
  const contactPhoneIsValid = /^\+?[0-9()\-\s]{8,24}$/.test(application.contact_phone.trim())
    && contactPhoneDigits.length >= 9
    && contactPhoneDigits.length <= 15;
  const normalizedSearchQuery = normalizeGuideSearchText(searchQuery);
  const searchTokens = getGuideSearchTokens(searchQuery);
  const searchResults = guideSearchItems.filter((item) => (
    !normalizedSearchQuery || (() => {
      const searchableText = normalizeGuideSearchText(`${item.title} ${item.summary} ${item.keywords}`);
      return searchableText.includes(normalizedSearchQuery)
        || (searchTokens.length > 1 && searchTokens.every((token) => searchableText.includes(token)));
    })()
  ));

  useEffect(() => {
    if (!user) return;
    fetch('/api/external/my-partners', { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || '파트너 정보를 불러오지 못했습니다.');
        setMyPartners(body.partners || []);
        setSelectedPartnerId((current) => current || body.partners?.find((partner: { environment: string }) => partner.environment === 'test')?.id || '');
      })
      .catch((error) => setLimitResult(error instanceof Error ? error.message : '파트너 정보를 불러오지 못했습니다.'));
  }, [user]);

  useEffect(() => {
    const loginEmail = user?.email?.trim() || '';
    const canUseLoginEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(loginEmail);
    if (!canUseLoginEmail) {
      setUseLoginEmail(false);
      return;
    }
    setUseLoginEmail(true);
    setApplication((current) => ({ ...current, contact_email: loginEmail }));
  }, [user?.email]);

  useEffect(() => {
    if (!isSearchOpen && !isSectionOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchOpen(false);
        setIsSectionOpen(false);
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isSearchOpen, isSectionOpen]);

  useEffect(() => {
    setActiveSearchIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    if (!isSearchOpen) return;

    let animationFrame = 0;
    let animationDeadline = 0;
    const viewport = window.visualViewport;
    const updateViewport = () => {
      const candidates = [
        viewport?.height,
        window.innerHeight,
        document.documentElement.clientHeight,
      ].filter((value): value is number => typeof value === 'number' && value > 0);
      const height = Math.round(Math.min(...candidates));
      const top = Math.max(0, Math.round(viewport?.offsetTop || 0));
      setSearchViewport((current) => (
        Math.abs(current.height - height) > 1 || Math.abs(current.top - top) > 1
          ? { height, top }
          : current
      ));
    };
    const followKeyboardAnimation = () => {
      window.cancelAnimationFrame(animationFrame);
      animationDeadline = performance.now() + 800;
      const tick = () => {
        updateViewport();
        if (performance.now() < animationDeadline) {
          animationFrame = window.requestAnimationFrame(tick);
        }
      };
      tick();
    };

    updateViewport();
    followKeyboardAnimation();
    window.addEventListener('resize', followKeyboardAnimation);
    window.addEventListener('orientationchange', followKeyboardAnimation);
    window.addEventListener('focusin', followKeyboardAnimation);
    window.addEventListener('focusout', followKeyboardAnimation);
    viewport?.addEventListener('resize', followKeyboardAnimation);
    viewport?.addEventListener('scroll', updateViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', followKeyboardAnimation);
      window.removeEventListener('orientationchange', followKeyboardAnimation);
      window.removeEventListener('focusin', followKeyboardAnimation);
      window.removeEventListener('focusout', followKeyboardAnimation);
      viewport?.removeEventListener('resize', followKeyboardAnimation);
      viewport?.removeEventListener('scroll', updateViewport);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (activeSearchIndex < 0) return;
    document.getElementById(`external-api-search-option-${activeSearchIndex}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeSearchIndex]);

  useEffect(() => {
    let frame = 0;
    const sectionIds = guideSearchItems.map((item) => item.id);
    const updateActiveSection = () => {
      frame = 0;
      const activationLine = Math.min(220, window.innerHeight * 0.32);
      const tocFollowTop = Math.max(88, (window.innerHeight * 0.5) - 210);
      const layout = document.querySelector<HTMLElement>('.EAG-layout');
      const toc = document.querySelector<HTMLElement>('.EAG-toc');
      const layoutRect = layout?.getBoundingClientRect();
      const tocHeight = toc?.offsetHeight || 0;
      const shouldFollow = Boolean(
        layoutRect
        && layoutRect.top <= tocFollowTop
        && layoutRect.bottom > tocFollowTop + tocHeight,
      );
      let current = sectionIds[0];
      for (const id of sectionIds) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= activationLine) current = id;
      }
      setIsTocFollowing((previous) => (previous === shouldFollow ? previous : shouldFollow));
      setActiveSectionId((previous) => (previous === current ? previous : current));
    };
    const requestUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(updateActiveSection);
    };
    updateActiveSection();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);
    };
  }, []);

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!searchResults.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current + 1) % searchResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveSearchIndex((current) => (current <= 0 ? searchResults.length - 1 : current - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveSearchIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveSearchIndex(searchResults.length - 1);
    } else if (event.key === 'Enter' && activeSearchIndex >= 0) {
      event.preventDefault();
      moveToGuideSection(searchResults[activeSearchIndex].id);
    }
  };

  const moveToGuideSection = (id: string) => {
    setIsSearchOpen(false);
    setIsSectionOpen(false);
    setSearchQuery('');
    window.history.replaceState(null, '', `/external-event-api#${id}`);
    window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const shareGuide = async () => {
    const shareData = {
      title: 'Dance Billboard 외부 일정 연동 API',
      text: '외부 사이트의 일정을 Dance Billboard에 연동하는 방법입니다.',
      url: 'https://swingenjoy.com/external-event-api',
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareResult('공유했습니다');
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setShareResult('링크를 복사했습니다');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      setShareResult('공유하지 못했습니다');
    }
    window.setTimeout(() => setShareResult(''), 1800);
  };

  const submitApplication = async () => {
    setApplicationResult('신청 중...');
    try {
      const response = await fetch('/api/external/partner-requests', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(application),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || '신청하지 못했습니다.');
      setApplicationResult('신청이 접수되었습니다. 관리자가 검토한 뒤 테스트 API Key를 안내해 드립니다.');
      setApplication({
        partner_name: '',
        contact_email: useLoginEmail ? (user?.email || '') : '',
        contact_phone: '',
        note: '',
      });
    } catch (error) {
      setApplicationResult(error instanceof Error ? error.message : '신청하지 못했습니다.');
    }
  };

  const requestAutomaticTestLimit = async () => {
    if (!selectedPartnerId) return;
    setLimitResult('자동 승인 처리 중...');
    try {
      const response = await fetch(`/api/external/my-partners/${encodeURIComponent(selectedPartnerId)}/auto-test-limit`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || '한도를 변경하지 못했습니다.');
      setLimitResult(`즉시 승인되었습니다. 분당 ${body.per_minute_limit}회 · 24시간 ${body.daily_limit}회`);
      setMyPartners((partners) => partners.map((partner) => (
        partner.id === selectedPartnerId
          ? { ...partner, per_minute_limit: body.per_minute_limit, daily_limit: body.daily_limit }
          : partner
      )));
    } catch (error) {
      setLimitResult(error instanceof Error ? error.message : '한도를 변경하지 못했습니다.');
    }
  };

  return (
    <main className="EAG-page">
      <header className="EAG-topbar">
        <Link to="/" className="EAG-brand" aria-label="Dance Billboard 홈">
          <span className="EAG-brandMark">DB</span>
          <span>Dance Billboard</span>
        </Link>
        <div className="EAG-topbarActions">
          <button type="button" className="EAG-searchButton" onClick={() => setIsSearchOpen(true)}>
            <i className="ri-search-line" aria-hidden="true" />
            검색
          </button>
          <button type="button" className="EAG-sectionButton" onClick={() => setIsSectionOpen(true)}>
            <i className="ri-list-check-2" aria-hidden="true" />
            섹션
          </button>
          {isAdmin && (
            <button type="button" onClick={() => partnerManagementModal.open()}>
              <i className="ri-settings-3-line" aria-hidden="true" />
              <span className="EAG-wideLabel">파트너 관리</span><span className="EAG-shortLabel">관리</span>
            </button>
          )}
          {isAdmin && (
            <button type="button" className="EAG-shareButton" onClick={shareGuide}>
              <i className="ri-share-line" aria-hidden="true" />
              {shareResult || '공유'}
            </button>
          )}
        </div>
      </header>

      <section className="EAG-hero">
        <div className="EAG-heroContent">
          <span className="EAG-eyebrow">EXTERNAL EVENT API · v1</span>
          <h1>외부 사이트의 일정을<br />Dance Billboard에 연동하세요</h1>
          <p>등록·수정·삭제, 이미지 저장, 정확한 장소 주소 입력까지 파트너 서버에서 안전하게 연결하는 방법을 안내합니다.</p>
          <div className="EAG-heroActions">
            <a href="/external-event-api#quick-start" className="EAG-primaryLink">빠른 시작</a>
            <a href="/external-event-api#request-example" className="EAG-secondaryLink">요청 예시 보기</a>
            {isAdmin && (
              <button type="button" className="EAG-secondaryLink EAG-heroShare" onClick={shareGuide}>
                <i className="ri-share-line" aria-hidden="true" /> {shareResult || '페이지 공유'}
              </button>
            )}
          </div>
        </div>
        <div className="EAG-statusCard">
          <span>BASE URL</span>
          <code>https://swingenjoy.com/api/external/v1</code>
          <dl>
            <div><dt>인증</dt><dd>Bearer API Key</dd></div>
            <div><dt>데이터</dt><dd>JSON / UTF-8</dd></div>
            <div><dt>이미지</dt><dd>AVIF · JPEG · PNG · WebP</dd></div>
          </dl>
        </div>
      </section>

      <div className="EAG-layout">
        <aside className={`EAG-toc${isTocFollowing ? ' is-following' : ''}`} aria-label="문서 목차">
          <strong>이 페이지에서</strong>
          {guideSearchItems.map((item, index) => (
            <a
              key={item.id}
              href={`/external-event-api#${item.id}`}
              className={activeSectionId === item.id ? 'is-active' : undefined}
              aria-current={activeSectionId === item.id ? 'location' : undefined}
              draggable={false}
            >
              {index + 1}. {item.title}
            </a>
          ))}
        </aside>

        <article className="EAG-content">
          <section id="quick-start" className="EAG-section">
            <span className="EAG-sectionNo">01</span>
            <h2>연동 시작</h2>
            <p className="EAG-lead">관리자에게 아래 세 가지만 전달해 API Key를 발급받으세요.</p>
            <div className="EAG-stepGrid">
              <div><b>1</b><strong>파트너 또는 사이트 이름</strong></div>
              <div><b>2</b><strong>연결할 Dance Billboard 로그인 아이디</strong></div>
              <div><b>3</b><strong>기술 담당자 이메일·전화번호</strong></div>
            </div>
            <div className="EAG-application">
              <div>
                <span className="EAG-kicker">연동 신청</span>
                <h3>매뉴얼을 확인한 뒤 관리자 승인을 요청하세요</h3>
                <p>처음에는 실제 일정에 노출되지 않는 테스트 키가 발급됩니다. 테스트가 끝나면 관리자가 운영 모드로 전환합니다.</p>
              </div>
              {!user ? (
                <div className="EAG-loginRequired">
                  <p><strong>로그인한 본인 계정으로만 신청할 수 있습니다.</strong> 승인된 API Key와 등록 일정은 이 계정에 연결됩니다.</p>
                  <p>표시 예시: <code>홍길동 · user@example.com</code></p>
                  <button type="button" className="EAG-primaryLink" onClick={() => setIsLoginOpen(true)}>로그인하고 신청하기</button>
                </div>
              ) : (
                <div className="EAG-applicationForm">
                  <label className="is-wide EAG-accountField">연결될 본인 로그인 계정
                    <input
                      value={`${userProfile?.nickname || user.email?.split('@')[0] || '회원'} · ${user.email || user.id}`}
                      readOnly
                      aria-readonly="true"
                    />
                    <small>현재 로그인한 계정으로 고정되며 수정할 수 없습니다. 승인된 API Key와 등록 일정의 소유 계정이 됩니다.</small>
                  </label>
                  <label>파트너 또는 사이트 이름<input value={application.partner_name} onChange={(event) => setApplication({ ...application, partner_name: event.target.value })} /></label>
                  <label>기술 담당자 이메일
                    <input
                      type="email"
                      value={application.contact_email}
                      readOnly={useLoginEmail}
                      onChange={(event) => setApplication({ ...application, contact_email: event.target.value })}
                      placeholder="developer@example.com"
                    />
                    <span className="EAG-contactChoice">
                      <input
                        type="checkbox"
                        checked={useLoginEmail}
                        disabled={!loginEmailIsUsable}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setUseLoginEmail(checked);
                          setApplication({
                            ...application,
                            contact_email: checked ? (user.email || '') : '',
                          });
                        }}
                      />
                      로그인 계정 이메일 사용
                    </span>
                    {!loginEmailIsUsable && <small>로그인 제공자가 이메일을 전달하지 않아 직접 입력해야 합니다.</small>}
                  </label>
                  <label>기술 담당자 전화번호
                    <input
                      type="tel"
                      value={application.contact_phone}
                      onChange={(event) => setApplication({ ...application, contact_phone: event.target.value })}
                      placeholder="010-1234-5678"
                    />
                  </label>
                  <label className="is-wide">전달 사항<textarea value={application.note} onChange={(event) => setApplication({ ...application, note: event.target.value })} placeholder="연동 사이트 주소 등 필요한 내용만 적어 주세요." /></label>
                  <button type="button" className="EAG-primaryLink" disabled={
                    !application.partner_name.trim()
                    || !contactEmailIsValid
                    || !contactPhoneIsValid
                  } onClick={submitApplication}>관리자 승인 요청</button>
                  {applicationResult && <p className="EAG-applicationResult" role="status">{applicationResult}</p>}
                </div>
              )}
            </div>
            <div className="EAG-callout">
              <i className="ri-shield-keyhole-line" aria-hidden="true" />
              <div>
                <strong>API Key가 사이트 방문자에게 보이면 안 됩니다.</strong>
                <p>키를 HTML, 브라우저 JavaScript, 공개 앱 번들 또는 공개 Git 저장소에 넣지 마세요. 서버 환경변수(<code>.env</code>), 호스팅 서비스의 비밀변수, Secret Manager, 암호화된 서버 설정 등 파트너 환경에 맞는 비밀 저장 방식을 사용하세요. 중요한 기준은 <b>서버만 키를 읽고 방문자는 키를 볼 수 없어야 한다</b>는 것입니다.</p>
              </div>
            </div>
            <CodeBlock
              label="인증 헤더"
              code="Authorization: Bearer {발급받은_API_KEY}"
            />
          </section>

          <section id="request-example" className="EAG-section">
            <span className="EAG-sectionNo">02</span>
            <h2>일정 등록 요청</h2>
            <div className="EAG-registrationDecision">
              <div className="EAG-registrationDecisionLabel">
                <i className="ri-git-branch-line" aria-hidden="true" />
                <strong>일정 등록 방식 선택</strong>
              </div>
              <nav className="EAG-registrationMenu" aria-label="일정 등록 방식 선택">
                <a href="/external-event-api#individual-event-request" draggable={false}>
                  <span>모든 장르</span>
                  <strong>날짜가 정해진 개별 일정</strong>
                  <small>소셜 · 행사 · 강습 · 동호회</small>
                  <code>POST /events</code>
                  <i className="EAG-registrationArrow" aria-hidden="true">&gt;</i>
                </a>
                <a href="/external-event-api#regular-socials" draggable={false}>
                  <span>소셜만</span>
                  <strong>매주 반복하는 정규 소셜</strong>
                  <small>기본 규칙 · DJ 변경 · 휴무</small>
                  <code>POST /regular-socials</code>
                  <i className="EAG-registrationArrow" aria-hidden="true">&gt;</i>
                </a>
              </nav>
            </div>
            <div className="EAG-callout">
              <i className="ri-route-line" aria-hidden="true" />
              <div>
                <strong>소셜이라고 모두 반복 API를 쓰는 것은 아닙니다.</strong>
                <p>날짜가 확정된 소셜·졸공·포스터가 있는 한 회차는 다른 장르와 똑같이 <code>/events</code>로 등록합니다. <b>매주 같은 요일에 계속 열리는 정규 소셜의 기본 일정만</b> <code>/regular-socials</code>를 사용합니다.</p>
              </div>
            </div>
            <p id="individual-event-request" className="EAG-lead EAG-inlineAnchor">먼저 실제로 동작하는 전체 요청 형태를 확인하세요.</p>
            <div className="EAG-callout">
              <i className="ri-terminal-box-line" aria-hidden="true" />
              <div>
                <strong>cURL은 터미널에서 API를 시험하는 예시입니다.</strong>
                <p>파트너 사이트에 이 명령문을 그대로 넣어야 하는 것은 아닙니다. 실제 개발 코드는 Node.js, PHP, Java, Python, 서버리스 등 사용하는 서버 플랫폼에 따라 달라집니다. 어떤 플랫폼을 사용해도 <b>POST 요청 주소, Authorization 헤더, Content-Type과 JSON 필드 구조</b>는 아래 예시와 동일하게 맞춰야 합니다.</p>
              </div>
            </div>
            <CodeBlock label="cURL · 단일 일정 등록" code={curlExample} />
            <h3 className="EAG-subheading">사용 중인 서버 환경의 등록 예시</h3>
            <p>아래 코드는 파트너의 <b>서버</b>에 넣는 예시입니다. 프론트엔드가 React·Vue·일반 HTML이어도 API Key를 브라우저에 넣지 말고, 해당 사이트의 서버 또는 서버리스 함수에서 호출하세요.</p>
            <div className="EAG-codeTabs" role="tablist" aria-label="서버 환경별 일정 등록 코드">
              {serverExamples.map((example) => (
                <button
                  key={example.id}
                  type="button"
                  role="tab"
                  aria-selected={serverExampleId === example.id}
                  className={serverExampleId === example.id ? 'is-active' : ''}
                  onClick={() => setServerExampleId(example.id)}
                >
                  {example.label}
                </button>
              ))}
            </div>
            {serverExamples.filter((example) => example.id === serverExampleId).map((example) => (
              <div key={example.id} role="tabpanel">
                <p className="EAG-footnote">{example.note} 예시입니다. 비밀변수 이름은 파트너 환경에 맞게 바꿀 수 있습니다.</p>
                <CodeBlock label={`${example.label} 서버 · 단일 일정 등록`} code={example.code} />
              </div>
            ))}
            <div className="EAG-endpoint">
              <span className="EAG-method">POST</span>
              <code>/events</code>
              <span>새 일정 등록</span>
            </div>
            <div className="EAG-callout">
              <i className="ri-edit-line" aria-hidden="true" />
              <div>
                <strong>예시값은 실제 파트너 일정에 맞게 바꾸시면 됩니다.</strong>
                <p>요청 주소, HTTP 메서드, 인증 헤더와 JSON 필드명은 그대로 사용하세요. 아래에서 “자유로운 문자열”로 표시한 값은 글 형식에 제한이 없으며 최대 길이만 지키면 됩니다. 날짜·분류·URL·이미지 방식은 정해진 형식을 지켜야 합니다.</p>
              </div>
            </div>
            <p className="EAG-footnote">뒤의 JavaScript 예제에 나오는 <code>process.env.DANCE_BILLBOARD_API_KEY</code>는 Node.js 서버에서 비밀변수를 읽는 예시입니다. 다른 서버 기술에서는 해당 플랫폼의 비밀변수 또는 보안 저장 기능으로 바꿔 사용하세요.</p>
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>예시 필드</th><th>바꿀 수 있는 범위</th><th>작성 방법</th></tr></thead>
                <tbody>{requestValueRows.map(([field, range, description]) => (
                  <tr key={field}><td><code>{field}</code></td><td><strong>{range}</strong></td><td>{description}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <section id="dates" className="EAG-section">
            <span className="EAG-sectionNo">03</span>
            <h2>날짜는 event_dates로 통일합니다</h2>
            <div className="EAG-exampleGrid">
              <div>
                <h3>단일 일정</h3>
                <CodeBlock label="날짜 1개" code={singleEventExample} />
              </div>
              <div>
                <h3>서로 떨어진 개별 날짜</h3>
                <CodeBlock label="선택한 날짜 여러 개" code={multipleDatesExample} />
              </div>
            </div>
            <div className="EAG-warning">
              <strong>연속 기간 방식은 지원하지 않습니다.</strong>
              <p><code>start_date</code>와 <code>end_date</code>를 보내면 400 오류가 발생합니다. 실제로 선택한 날짜만 <code>event_dates</code>에 넣으세요.</p>
            </div>
          </section>

          <section id="categories" className="EAG-section">
            <span className="EAG-sectionNo">04</span>
            <h2>최상위 분류와 하위 분류</h2>
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>최상위 분류 <code>category</code></th><th>입력 가능한 하위 분류 <code>genre</code></th></tr></thead>
                <tbody>
                  {categoryRows.map((row) => (
                    <tr key={row.category}>
                      <td><strong>{row.label}</strong><code>{row.category}</code></td>
                      <td><div className="EAG-tags">{row.genres.map((genre) => <code key={genre}>{genre}</code>)}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CodeBlock label="예시 · 워크샵" code={'{\n  "category": "event",\n  "genre": "워크샵"\n}'} />
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>최상위 분류</th><th>한 일정의 하위 장르 선택</th></tr></thead>
                <tbody>
                  <tr><td><strong>행사</strong> <code>event</code></td><td><strong>복수 선택 가능</strong> · 쉼표로 구분합니다. 단, <code>파티 + 대회</code>는 동시 선택 불가, <code>기타</code>는 단독만 가능합니다.</td></tr>
                  <tr><td><strong>소셜</strong> <code>social</code></td><td><strong>1개만 선택</strong></td></tr>
                  <tr><td><strong>강습</strong> <code>class</code></td><td><strong>1개만 선택</strong></td></tr>
                  <tr><td><strong>동호회</strong> <code>club</code></td><td><strong>1개만 선택</strong></td></tr>
                </tbody>
              </table>
            </div>
            <CodeBlock label="행사 복수 장르 예시" code={'{\n  "category": "event",\n  "genre": "워크샵,라이브밴드"\n}'} />
            <div className="EAG-warning EAG-categoryRule">
              <strong>사이트와 같은 선택 규칙을 사용합니다.</strong>
              <p>관리자가 연동을 승인할 때 최상위 분류는 반드시 1개만 선택합니다. 하위 장르는 그 분류 안에서 여러 개를 허용할 수 있습니다.</p>
              <ul>
                <li><b>최상위 분류:</b> <code>social</code>, <code>event</code>, <code>class</code>, <code>club</code> 중 1개만 허용됩니다.</li>
                <li><b>관리자 권한 설정:</b> 선택한 최상위 분류 안에서 파트너가 사용할 수 있는 하위 장르를 여러 개 체크할 수 있습니다.</li>
                <li><b>하위 장르 미선택:</b> 선택한 최상위 분류 안의 모든 하위 장르를 허용합니다.</li>
                <li><b>다른 최상위 분류:</b> 같은 이름의 장르가 있어도 이 API Key로는 사용할 수 없습니다.</li>
              </ul>
            </div>
            <p>관리자 화면의 복수 체크는 파트너가 <b>여러 일정에서 사용할 수 있는 장르 범위</b>입니다. 한 일정에 장르를 동시에 넣을 수 있는지는 바로 위 표의 규칙을 따릅니다. 임의의 분류나 장르는 추가할 수 없습니다.</p>
            <div className="EAG-ruleCards">
              <div><strong>event · class · club</strong><p>이미지가 반드시 필요합니다.</p></div>
              <div><strong>social</strong><p>이미지를 생략할 수 있습니다. 주소도 선택값이지만, 입력하면 카카오맵 위치 표시에 사용되므로 정확한 주소를 권장합니다.</p></div>
            </div>
          </section>

          <section id="images" className="EAG-section">
            <span className="EAG-sectionNo">05</span>
            <h2>이미지 등록 방식</h2>
            <p className="EAG-lead">두 방식의 차이는 <b>원본 이미지 파일을 누가 Dance Billboard 서버로 전달하느냐</b>입니다. 어느 방식을 사용해도 최종 결과는 동일하게 Dance Billboard 내부 이미지로 저장됩니다.</p>
            <div className="EAG-warning">
              <strong>이미지 파일은 분리 저장하고, 일정은 계속 연결됩니다.</strong>
              <p>연결 고리는 발급받은 API Key의 파트너 계정과 <code>external_id</code>입니다. 같은 값으로 수정하면 새 이미지로 교체하고 이전 이미지를 정리하며, 삭제하면 일정과 연결 이미지도 함께 삭제합니다.</p>
            </div>
            <div className="EAG-choiceGrid">
              <div>
                <span className="EAG-choiceIcon"><i className="ri-upload-cloud-2-line" /></span>
                <h3>파일 업로드 <code>upload</code></h3>
                <code>POST /images</code>
                <p>파트너 서버가 이미지 파일을 직접 가지고 있거나, 원본 URL이 로그인·만료·핫링크 차단 때문에 외부에서 열리지 않을 때 사용합니다.</p>
              </div>
              <div>
                <span className="EAG-choiceIcon"><i className="ri-links-line" /></span>
                <h3>공개 URL 전달 <code>url</code></h3>
                <code>image_mode: "url"</code>
                <p>이미지가 공개 HTTPS 주소에 있고 Dance Billboard 서버가 로그인 없이 즉시 내려받을 수 있을 때 사용합니다. 별도 이미지 업로드 요청을 생략할 수 있습니다.</p>
              </div>
            </div>
            <h3 className="EAG-subheading">방법 1 · 파일을 직접 업로드하는 경우</h3>
            <CodeBlock label="1. 파트너 서버 → 이미지 업로드" code={imageUploadExample} />
            <p>응답으로 받은 <code>image_url</code>을 보관한 뒤 일정 JSON에 다음처럼 넣습니다.</p>
            <CodeBlock label="2. 일정 등록 JSON에 업로드 결과 사용" code={uploadedImageEventExample} />
            <h3 className="EAG-subheading">방법 2 · 공개 이미지 URL을 보내는 경우</h3>
            <CodeBlock label="일정 등록 JSON에 공개 URL 사용" code={remoteImageEventExample} />
            <p>일정 등록 요청을 받는 순간 Dance Billboard 서버가 해당 URL을 직접 내려받습니다. 브라우저가 원본 사이트의 이미지를 계속 불러오는 방식이 아닙니다.</p>
            <h3 className="EAG-subheading">일정 등록 시 서버에서 자동으로 처리하는 작업</h3>
            <div className="EAG-flow">
              <span>API Key·한도 확인</span><i className="ri-arrow-right-line" />
              <span>파일 수신 또는 URL 다운로드</span><i className="ri-arrow-right-line" />
              <span>실제 이미지 검사</span><i className="ri-arrow-right-line" />
              <span>WebP 4종 생성</span><i className="ri-arrow-right-line" />
              <span>내부 저장 주소로 교체</span>
            </div>
            <ol className="EAG-numberList">
              <li>파트너 키와 분당·24시간 요청 한도를 확인합니다.</li>
              <li><code>upload</code>와 <code>url</code> 모두 최대 32MB 원본을 받습니다. 변환이 끝나면 원본 파일은 보관하지 않고 WebP 4종만 저장합니다.</li>
              <li>확장자만 믿지 않고 실제 파일을 해석해 AVIF·JPEG·PNG·WebP인지, 손상·애니메이션·과도한 픽셀 수가 없는지 검사합니다.</li>
              <li>화면 용도에 맞춰 폭 100·300·650·1300px의 WebP 이미지 4종을 자동 생성합니다.</li>
              <li>생성된 파일을 Dance Billboard 저장소에 보관하고 일정에는 외부 URL 대신 내부 이미지 주소를 연결합니다.</li>
              <li>이미지 처리에 실패하면 일정 등록도 실패 응답을 반환하므로 이미지 없는 불완전한 일정이 새로 등록되지 않습니다.</li>
            </ol>
            <div className="EAG-callout">
              <i className="ri-image-2-line" aria-hidden="true" />
              <div>
                <strong>등록이 끝난 뒤에는 원본 사이트와 분리됩니다.</strong>
                <p>원본 사이트가 이미지를 삭제하거나 URL을 변경해도 이미 저장된 Dance Billboard 이미지는 유지됩니다. 단, 최초 등록 순간에는 URL이 공개 상태여야 합니다.</p>
              </div>
            </div>
            <p className="EAG-footnote">Base64 문자열을 일정 JSON 안에 넣는 방식은 지원하지 않습니다. 내부망·로컬 주소, 사설 IP로 연결되는 도메인, 인증이 필요한 URL, 실행 가능한 파일과 32MB 초과 파일은 차단합니다. 압축 해제 후 4천만 픽셀을 넘는 이미지도 서버 보호를 위해 거절합니다.</p>
          </section>

          <section id="address" className="EAG-section">
            <span className="EAG-sectionNo">06</span>
            <h2>지도에 사용할 주소 선택</h2>
            <p className="EAG-lead">Dance Billboard 상세 화면은 카카오맵으로 장소를 표시합니다. 주소는 필수가 아니며 이미지 유무와도 관계없지만, 주소를 보내면 카카오맵 검색에 그대로 사용됩니다. 부정확한 주소나 장소명만 보내면 카카오맵 검색 결과의 첫 번째 주소가 사용되어 실제 장소와 다른 위치가 표시될 수 있으므로, 가능한 한 확인된 도로명주소를 보내 주세요.</p>
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>주소 확인 방법</th><th><code>address_source</code></th><th>사용 방법</th></tr></thead>
                <tbody>
                  <tr><td>다음 우편번호</td><td><code>daum_postcode</code></td><td>무료 검색창에서 사용자가 도로명주소 선택</td></tr>
                  <tr><td>카카오맵 API</td><td><code>kakao_map</code></td><td>파트너가 보유한 API에서 도로명주소 확인</td></tr>
                  <tr><td>네이버지도 API</td><td><code>naver_map</code></td><td>파트너가 보유한 API에서 도로명주소 확인</td></tr>
                  <tr><td>Google Maps API</td><td><code>google_map</code></td><td>대한민국 도로명주소로 정리한 결과만 사용</td></tr>
                  <tr><td>도로명주소 API</td><td><code>road_address_api</code></td><td>공공 도로명주소 검색 결과 사용</td></tr>
                </tbody>
              </table>
            </div>
            <div className="EAG-callout">
              <i className="ri-map-pin-line" aria-hidden="true" />
              <div>
                <strong>카카오맵 API 사용은 파트너가 선택합니다.</strong>
                <p>파트너가 카카오 Local API를 이미 사용하고 있다면 주소 검색 결과에서 도로명주소를 확인한 뒤 보낼 수 있습니다. 사용을 강제하지 않으며, 카카오 개발자 앱·REST API Key·쿼터 관리는 파트너가 직접 담당합니다. <a href="https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord" target="_blank" rel="noreferrer">카카오 주소 검색 API 공식 안내</a></p>
              </div>
            </div>
            <div className="EAG-callout">
              <i className="ri-alert-line" aria-hidden="true" />
              <div>
                <strong>Google Maps 주소 문자열은 그대로 호환되지 않을 수 있습니다.</strong>
                <p>Google의 <code>formatted_address</code>, 영문 주소, Plus Code, 장소명은 카카오 주소검색 형식과 결과 순서가 다를 수 있습니다. Google을 사용한다면 검색 결과에서 대한민국 도로명주소를 별도로 확보해 <code>address</code>에 보내 주세요. Google 좌표만 보내는 방식은 현재 일정 API에서 지원하지 않습니다. <a href="https://developers.google.com/maps/documentation/geocoding/geocoding" target="_blank" rel="noreferrer">Google Geocoding 공식 안내</a></p>
              </div>
            </div>
            <CodeBlock label="파트너 등록 화면 · 무료 다음 우편번호 검색 적용 예시" code={addressApiExample} />
            <ol className="EAG-numberList">
              <li>위 방법 중 파트너 환경에 맞는 주소 확인 수단을 하나 선택합니다. 별도 지도 API가 없다면 무료 다음 우편번호 검색을 사용할 수 있습니다.</li>
              <li>사용자가 실제 장소와 일치하는 도로명주소를 직접 선택하게 합니다.</li>
              <li><code>roadAddress</code>는 <code>address</code>, <code>zonecode</code>는 <code>postal_code</code>에 넣고 <code>address_source</code>는 <code>daum_postcode</code>로 보냅니다.</li>
              <li>층·호수는 <code>address_detail</code>에 따로 보냅니다. 지도 검색에는 기본 도로명주소만 사용하므로 상세주소 때문에 위치가 틀어지지 않습니다.</li>
            </ol>
            <p className="EAG-footnote">주소를 생략해도 일정은 등록됩니다. <code>address_source</code>도 선택값입니다. 주소가 정확하지 않을 때 상세 지도 기능이 검색된 첫 번째 주소를 표시할 수 있다는 점을 반드시 고려해 주세요.</p>
          </section>

          <section id="fields" className="EAG-section">
            <span className="EAG-sectionNo">07</span>
            <h2>요청 필드</h2>
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>필드</th><th>필수 여부</th><th>설명</th></tr></thead>
                <tbody>{fieldRows.map(([field, required, description]) => (
                  <tr key={field}><td><code>{field}</code></td><td>{required}</td><td>{description}</td></tr>
                ))}</tbody>
              </table>
            </div>
            <p className="EAG-footnote">* 관리자가 생략 시 기본 분류를 설정한 파트너만 <code>category</code>와 <code>genre</code>를 생략할 수 있습니다.</p>
          </section>

          <section id="sync" className="EAG-section">
            <span className="EAG-sectionNo">08</span>
            <h2>수정과 삭제도 자동 반영합니다</h2>
            <div className="EAG-endpointList">
              <div><span className="EAG-method EAG-methodPut">PUT</span><code>{'/events/{external_id}'}</code><p>같은 키로 등록한 일정 전체 수정</p></div>
              <div><span className="EAG-method EAG-methodDelete">DELETE</span><code>{'/events/{external_id}'}</code><p>같은 키로 등록한 일정 삭제</p></div>
            </div>
            <p><code>external_id</code>는 파트너 시스템 안에서 바뀌지 않는 고유값이어야 합니다. 수정은 일부 필드만 보내는 방식이 아니라 현재 일정 전체를 다시 보내는 방식입니다.</p>
            <div className="EAG-warning">
              <strong>등록·수정·삭제는 같은 API Key와 같은 external_id로 연결됩니다.</strong>
              <p>등록 예시에서 정한 <code>external_id</code>를 수정 URL, 수정 본문, 삭제 URL에 똑같이 사용하세요. 제목·날짜·시간·장소·설명·이미지는 수정할 수 있지만 <code>external_id</code>를 새 값으로 바꾸면 기존 일정을 찾지 못합니다. 새 값으로 <code>POST</code>하면 별도 일정 등록으로 처리됩니다.</p>
            </div>
            <CodeBlock label="파트너 서버 JavaScript · 일정 전체 수정" code={updateEventExample} />
            <p>수정 본문의 값과 형식은 위 등록 요청 표와 같습니다. 바꾸지 않는 값도 포함해 현재 일정 전체를 보내야 합니다. 새 이미지를 보내면 WebP 4종을 다시 만들고 일정 이미지를 교체한 뒤 이전 파일을 정리합니다.</p>
            <CodeBlock label="파트너 서버 JavaScript · 일정 삭제" code={deleteEventExample} />
            <p>삭제는 JSON 본문이 필요하지 않습니다. 등록에 사용한 API Key와 <code>external_id</code>만 URL에 넣습니다. 삭제가 성공하면 Dance Billboard의 일정과 연결 이미지도 함께 삭제됩니다. 다른 파트너 키로 등록한 일정은 수정하거나 삭제할 수 없습니다.</p>
          </section>

          <section id="regular-socials" className="EAG-section">
            <span className="EAG-sectionNo">09</span>
            <h2>정규 소셜 반복 규칙과 날짜별 예외</h2>
            <p className="EAG-lead">매주 같은 요일에 열리는 소셜은 기본 규칙을 한 번 등록하고, 이후에는 DJ·휴무·특별 회차처럼 달라진 날짜만 전송합니다. 이 API는 <code>social</code> 권한을 가진 파트너 키에서만 사용할 수 있습니다.</p>

            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>등록하려는 내용</th><th>사용할 API</th><th>결과</th></tr></thead>
                <tbody>
                  <tr><td>모든 장르의 날짜가 정해진 일정</td><td><code>POST /events</code></td><td>해당 날짜의 개별 일정 등록</td></tr>
                  <tr><td>매주 반복하는 정규 소셜의 기본 일정</td><td><code>POST /regular-socials</code></td><td>앞으로 90일의 기본 일정 생성</td></tr>
                  <tr><td>특정 날짜의 DJ·시간·장소 변경</td><td><code>POST /regular-socials/{'{규칙 ID}'}/exceptions</code></td><td>해당 날짜만 <code>override</code></td></tr>
                  <tr><td>특정 날짜 휴무·취소</td><td><code>POST /regular-socials/{'{규칙 ID}'}/exceptions</code></td><td>해당 날짜를 <code>closure</code>로 숨김</td></tr>
                  <tr><td>포스터가 있는 한 회차·졸공·특별 소셜</td><td><code>POST /events</code></td><td>기본 일정 대신 공식 개별 일정 노출</td></tr>
                </tbody>
              </table>
            </div>

            <div className="EAG-warning">
              <strong>확인되지 않은 DJ와 포스터는 기본 일정에 넣지 않습니다.</strong>
              <p>반복 규칙만 등록된 회차는 <b>DJ 미정 · 포스터 없음 · 장소 카카오맵</b>으로 표시됩니다. 과거 포스터를 재사용하지 않습니다. 해당 날짜의 포스터가 확정되면 <code>/events</code>로 그 회차를 개별 등록하세요.</p>
            </div>

            <h3 className="EAG-subheading">1단계 · 반복 규칙을 한 번 등록</h3>
            <CodeBlock label="cURL · 매주 금요일 정규 소셜 등록" code={regularSocialRuleExample} />
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>필드</th><th>필수</th><th>작성 방법</th></tr></thead>
                <tbody>
                  <tr><td><code>external_id</code></td><td>필수</td><td>파트너 시스템에서 바뀌지 않는 반복 규칙 ID, 최대 160자</td></tr>
                  <tr><td><code>title</code></td><td>필수</td><td>기본 일정 제목</td></tr>
                  <tr><td><code>weekday</code></td><td>필수</td><td>일 0 · 월 1 · 화 2 · 수 3 · 목 4 · 금 5 · 토 6</td></tr>
                  <tr><td><code>location</code></td><td>필수</td><td>카카오맵에서 찾을 수 있는 정확한 장소명</td></tr>
                  <tr><td><code>source_url</code></td><td>필수</td><td>정규 소셜을 확인할 수 있는 공개 HTTPS 주소</td></tr>
                  <tr><td><code>time</code>, <code>venue_name</code></td><td>선택</td><td>기본 시간과 표시할 장소명</td></tr>
                  <tr><td><code>valid_from</code>, <code>valid_until</code></td><td>선택</td><td>규칙 적용 기간, <code>YYYY-MM-DD</code></td></tr>
                  <tr><td><code>active</code></td><td>선택</td><td><code>true</code>가 기본값. 잠시 중단할 때 <code>false</code></td></tr>
                </tbody>
              </table>
            </div>
            <p className="EAG-footnote"><code>image_mode</code>, <code>image_url</code>, <code>dj_name</code>은 반복 규칙 필드가 아닙니다. 반복 규칙 요청에 보내면 <code>400 invalid_request</code>가 발생합니다.</p>

            <h3 className="EAG-subheading">2단계 · DJ만 확정되면 해당 날짜를 override</h3>
            <CodeBlock label="cURL · 8월 7일 DJ 확정" code={regularSocialDjOverrideExample} />
            <p>규칙 ID <code>friday-social</code>은 URL에, 예외 자체의 고유 ID <code>friday-social-20260807-dj</code>는 본문의 <code>external_id</code>에 넣습니다. 같은 예외 ID로 다시 보내면 해당 날짜의 내용을 갱신합니다.</p>
            <div className="EAG-callout">
              <i className="ri-image-line" aria-hidden="true" />
              <div>
                <strong>DJ override에는 포스터를 첨부할 수 없습니다.</strong>
                <p>DJ 이름만 확인된 경우 위 예시처럼 예외를 보냅니다. DJ와 해당 날짜의 포스터가 모두 확인됐다면 아래처럼 기존 <code>/events</code> API로 개별 일정을 등록해야 합니다.</p>
              </div>
            </div>

            <h3 className="EAG-subheading">3단계 · 휴무는 해당 날짜를 closure</h3>
            <CodeBlock label="cURL · 8월 14일 휴무" code={regularSocialClosureExample} />
            <p><code>date</code>에는 실제 반복 일정이 열릴 날짜를 넣습니다. <code>closure</code>가 등록되면 그 날짜의 기본 일정만 숨기고 다음 주 일정은 유지합니다.</p>

            <h3 className="EAG-subheading">4단계 · 포스터가 있는 회차는 기존 /events로 대체</h3>
            <CodeBlock label="cURL · DJ와 포스터가 확정된 한 회차" code={datedSocialWithPosterExample} />
            <p>같은 날짜와 같은 장소의 공식 개별 일정이 등록되면 반복 규칙이 만든 기본 일정은 노출되지 않습니다. 졸공이면 위 JSON의 <code>genre</code>를 <code>졸공</code>으로 바꾸고 실제 제목·설명·포스터를 보내세요.</p>

            <h3 className="EAG-subheading">규칙과 예외 수정·삭제</h3>
            <div className="EAG-endpointList">
              <div><span className="EAG-method EAG-methodPut">PUT</span><code>{'/regular-socials/{규칙 external_id}'}</code><p>규칙 전체 수정</p></div>
              <div><span className="EAG-method EAG-methodDelete">DELETE</span><code>{'/regular-socials/{규칙 external_id}'}</code><p>규칙과 연결 예외 삭제</p></div>
              <div><span className="EAG-method EAG-methodPut">PUT</span><code>{'/regular-socials/{규칙 ID}/exceptions/{예외 ID}'}</code><p>예외 전체 수정</p></div>
              <div><span className="EAG-method EAG-methodDelete">DELETE</span><code>{'/regular-socials/{규칙 ID}/exceptions/{예외 ID}'}</code><p>예외 삭제</p></div>
            </div>
            <CodeBlock label="cURL · 반복 규칙 전체 수정" code={updateRegularSocialRuleExample} />
            <CodeBlock label="cURL · 휴무 예외 삭제" code={deleteRegularSocialExceptionExample} />
            <p>예외를 삭제하면 그 날짜는 다시 기본 반복 일정으로 돌아갑니다. 규칙을 삭제하거나 <code>active: false</code>로 수정하면 그 규칙이 만든 미래 기본 일정이 제거됩니다.</p>

            <h3 className="EAG-subheading">우선순위와 중복 판정</h3>
            <ol className="EAG-numberList">
              <li><b>공식 API 개별 일정:</b> <code>/events</code>로 등록된 해당 날짜 일정</li>
              <li><b>공식 날짜별 예외:</b> DJ·시간·장소 override 또는 closure</li>
              <li><b>확인된 수집 일정:</b> 해당 날짜의 실제 공지와 포스터</li>
              <li><b>공식 반복 규칙:</b> 파트너가 등록한 정규 소셜 기본값</li>
              <li><b>내부 기본 규칙:</b> 다른 정보가 없을 때만 사용하는 기본값</li>
            </ol>
            <p>소셜은 <b>날짜와 정규화된 장소가 같으면</b> DJ 이름이나 제목 표현이 달라도 같은 일정으로 판정합니다. 공식 API 개별 일정이 있으면 수집본보다 공식 일정만 노출합니다. 행사·강습은 같은 장소에서 같은 날 여러 일정이 가능하므로 날짜·장소와 제목 유사도까지 함께 확인합니다.</p>

            <div className="EAG-callout">
              <i className="ri-flask-line" aria-hidden="true" />
              <div>
                <strong>테스트 키는 같은 요청을 검증하지만 실제 일정은 만들지 않습니다.</strong>
                <p>응답의 <code>test_mode: true</code>, <code>persisted: false</code>를 확인한 뒤 관리자에게 운영 전환을 요청하세요. 운영 키에서는 최초 등록이 일반적으로 <code>201</code>, 동일 ID 갱신은 <code>200</code>입니다.</p>
              </div>
            </div>
          </section>

          <section id="limits" className="EAG-section">
            <span className="EAG-sectionNo">10</span>
            <h2>도배 방지 한도와 오류 대응</h2>
            <div className="EAG-limitBanner">
              <div><strong>30회</strong><span>테스트 권장 분당 한도</span></div>
              <div><strong>1,000회</strong><span>테스트 권장 24시간 한도</span></div>
              <div><strong>10회</strong><span>운영 권장 분당 한도</span></div>
              <div><strong>200회</strong><span>운영 권장 24시간 한도</span></div>
              <p>파트너 키별로 적용되며 관리자가 실제 사용량에 맞게 조정할 수 있습니다. 잘못된 반복 요청과 이미지 업로드도 횟수에 포함됩니다.</p>
            </div>
            <div className="EAG-callout">
              <i className="ri-customer-service-2-line" aria-hidden="true" />
              <div>
                <strong>개발 테스트 한도는 로그인 후 즉시 상향할 수 있습니다.</strong>
                <p>본인 계정에 연결된 활성 테스트 파트너만 분당 60회·24시간 3,000회까지 자동 승인됩니다. 파트너별 24시간에 한 번만 가능하며 운영 키에는 적용되지 않습니다.</p>
                {user ? (
                  <div className="EAG-limitRequest">
                    <select value={selectedPartnerId} onChange={(event) => setSelectedPartnerId(event.target.value)} aria-label="테스트 한도를 늘릴 파트너">
                      <option value="">테스트 파트너 선택</option>
                      {myPartners.filter((partner) => partner.environment === 'test').map((partner) => (
                        <option key={partner.id} value={partner.id}>{partner.name} · 현재 {partner.per_minute_limit}/{partner.daily_limit}회</option>
                      ))}
                    </select>
                    <button type="button" className="EAG-primaryLink" disabled={!selectedPartnerId} onClick={requestAutomaticTestLimit}>테스트 한도 즉시 상향</button>
                  </div>
                ) : (
                  <button type="button" className="EAG-primaryLink" onClick={() => setIsLoginOpen(true)}>로그인하고 한도 요청</button>
                )}
                {limitResult && <p role="status">{limitResult}</p>}
              </div>
            </div>
            <div className="EAG-tableWrap">
              <table>
                <thead><tr><th>HTTP</th><th>code</th><th>처리 방법</th></tr></thead>
                <tbody>{errorRows.map(([status, code, action]) => (
                  <tr key={status}><td><strong>{status}</strong></td><td><code>{code}</code></td><td>{action}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </section>

          <footer className="EAG-footer">
            <strong>연동 준비가 되셨나요?</strong>
            <p>위 안내에 맞춰 로그인 계정으로 연동을 신청해 주세요.</p>
            <a href="/external-event-api#quick-start">연동 신청 폼으로 이동</a>
          </footer>
        </article>
      </div>
      {isSearchOpen && (
        <div
          className={`EAG-searchBackdrop${searchViewport.height > 0 && searchViewport.height < 560 ? ' is-keyboard-open' : ''}`}
          role="presentation"
          style={{
            '--eag-search-viewport-height': searchViewport.height ? `${searchViewport.height}px` : undefined,
            '--eag-search-viewport-top': `${searchViewport.top}px`,
          } as CSSProperties}
          onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsSearchOpen(false);
          }}
        >
          <section className="EAG-searchDialog" role="dialog" aria-modal="true" aria-labelledby="external-api-search-title">
            <div className="EAG-searchHeader">
              <div>
                <span className="EAG-kicker">GUIDE SEARCH</span>
                <h2 id="external-api-search-title">API 안내에서 찾기</h2>
              </div>
              <button type="button" className="EAG-searchClose" aria-label="검색 닫기" onClick={() => setIsSearchOpen(false)}>×</button>
            </div>
            <label className="EAG-searchInput">
              <i className="ri-search-line" aria-hidden="true" />
              <input
                autoFocus
                type="search"
                role="combobox"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="예: 이미지 업로드, 장르, 수정, Node.js"
                aria-controls="external-api-search-results"
                aria-expanded="true"
                aria-autocomplete="list"
                aria-activedescendant={activeSearchIndex >= 0 ? `external-api-search-option-${activeSearchIndex}` : undefined}
              />
            </label>
            <p className="EAG-searchHint">입력하는 즉시 이 페이지의 제목과 핵심 키워드를 찾아드립니다.</p>
            <div className="EAG-searchResultsPanel">
              <div className="EAG-searchResultsHeader" aria-live="polite" aria-atomic="true">
                <strong><i className="ri-list-check-2" aria-hidden="true" /> 검색 결과 {searchResults.length}개</strong>
                <span>자동완성</span>
              </div>
              <div id="external-api-search-results" className="EAG-searchResults" role="listbox" aria-label="검색 자동완성 결과">
                {searchResults.map((item, index) => (
                  <div
                    id={`external-api-search-option-${index}`}
                    key={item.id}
                    role="option"
                    aria-selected={activeSearchIndex === index}
                    className={activeSearchIndex === index ? 'is-active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => moveToGuideSection(item.id)}
                  >
                    <b className="EAG-searchResultNo">{String(index + 1).padStart(2, '0')}</b>
                    <span><strong>{item.title}</strong><small>{item.summary}</small></span>
                    <i className="ri-arrow-right-line" aria-hidden="true" />
                  </div>
                ))}
                {searchResults.length === 0 && (
                  <p className="EAG-searchEmpty">일치하는 항목이 없습니다. 날짜, 이미지, 장르, 수정처럼 짧은 단어로 다시 검색해 주세요.</p>
                )}
              </div>
              <small className="EAG-searchScrollHint">
                <i className="ri-mouse-line" aria-hidden="true" />
                {searchResults.length > 1 ? ' 결과 목록을 위아래로 스크롤할 수 있습니다.' : ' 검색 결과 영역'}
              </small>
            </div>
          </section>
        </div>
      )}
      {isSectionOpen && (
        <div className="EAG-searchBackdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsSectionOpen(false);
        }}>
          <section className="EAG-sectionDialog" role="dialog" aria-modal="true" aria-labelledby="external-api-section-title">
            <div className="EAG-searchHeader">
              <div>
                <span className="EAG-kicker">GUIDE SECTIONS</span>
                <h2 id="external-api-section-title">API 안내 섹션</h2>
              </div>
              <button type="button" className="EAG-searchClose" aria-label="섹션 닫기" onClick={() => setIsSectionOpen(false)}>×</button>
            </div>
            <p className="EAG-sectionDialogLead">확인할 섹션의 이름을 선택하세요.</p>
            <nav className="EAG-sectionList" aria-label="API 안내 섹션 목록">
              {guideSearchItems.map((item, index) => (
                <button key={item.id} type="button" onClick={() => moveToGuideSection(item.id)}>
                  <b>{String(index + 1).padStart(2, '0')}</b>
                  <span><strong>{item.title}</strong><small>{item.summary}</small></span>
                  <i className="ri-arrow-right-line" aria-hidden="true" />
                </button>
              ))}
            </nav>
          </section>
        </div>
      )}
      {isLoginOpen && !user && (
        <div className="EAG-loginBackdrop" role="dialog" aria-modal="true" aria-labelledby="external-api-login-title">
          <div className="EAG-loginDialog">
            <button type="button" className="EAG-loginClose" aria-label="닫기" onClick={() => setIsLoginOpen(false)}>×</button>
            <span className="EAG-kicker">Dance Billboard 로그인</span>
            <h2 id="external-api-login-title">로그인 후 연동을 신청해 주세요</h2>
            <p>API 신청 계정과 발급되는 파트너 키가 연결됩니다. 안내 문서는 닫은 뒤 계속 확인할 수 있습니다.</p>
            <button type="button" className="EAG-kakaoLogin" onClick={signInWithKakao}>카카오로 로그인</button>
          </div>
        </div>
      )}
    </main>
  );
}
