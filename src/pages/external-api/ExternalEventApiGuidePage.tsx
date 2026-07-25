import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModal } from '../../hooks/useModal';
import './ExternalEventApiGuidePage.css';

const singleEventExample = `{
  "external_id": "partner-event-20260801-1",
  "title": "토요일 린디합 강습",
  "event_dates": ["2026-08-01"],
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/events/1",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/1.webp"
}`;

const multipleDatesExample = `{
  "external_id": "partner-class-202608",
  "title": "8월 토요일 린디합 강습",
  "event_dates": [
    "2026-08-01",
    "2026-08-08",
    "2026-08-22"
  ],
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/classes/202608",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/class-202608.webp"
}`;

const curlExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/events' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '${singleEventExample.replace(/\n/g, '\n  ')}'`;

const addressApiExample = `const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;

async function normalizeDanceBillboardAddress(rawAddress) {
  const url = new URL(
    "https://swingenjoy.com/api/external/v1/addresses/validate"
  );
  url.searchParams.set("query", rawAddress);

  const response = await fetch(url, {
    headers: { Authorization: \`Bearer \${API_KEY}\` }
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "주소를 확인하지 못했습니다.");
  }
  return result.normalized_address;
}

// 일정 등록 전에 표준 주소를 받아 address에 넣습니다.
const address = await normalizeDanceBillboardAddress(
  "서울 강남구 테헤란로 123"
);`;

const updateEventExample = `const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
const externalId = "partner-event-20260801-1"; // 등록 때 사용한 값

const event = {
  external_id: externalId,
  title: "토요일 린디합 강습 (시간 변경)",
  event_dates: ["2026-08-01"],
  time: "19:30",
  category: "class",
  genre: "린디합",
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
  ['address', '조건부', '이미지 없는 social 일정에서 필수'],
  ['description', '선택', '상세 설명'],
  ['image_mode / image_url', '조건부', 'social 이외의 분류에서 필수'],
];

const errorRows = [
  ['400', 'invalid_request', '입력값을 수정한 뒤 다시 요청해 주세요.'],
  ['401', 'invalid_api_key', '키를 확인하고 자동 재시도를 중단해 주세요.'],
  ['404', 'not_found', 'external_id와 사용한 키를 확인해 주세요.'],
  ['413', 'payload_too_large', 'JSON 또는 이미지 크기를 줄여 주세요.'],
  ['415', 'unsupported_media_type', 'AVIF, JPEG, PNG, WebP를 사용해 주세요.'],
  ['422', 'address_not_found', '주소 확인 API에서 후보를 다시 선택해 주세요.'],
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
  const { isAdmin, user, signInWithKakao } = useAuth();
  const partnerManagementModal = useModal('externalApiPartnerManagement');
  const [shareResult, setShareResult] = useState('');
  const [application, setApplication] = useState({ partner_name: '', contact: '', note: '' });
  const [applicationResult, setApplicationResult] = useState('');
  const [addressQuery, setAddressQuery] = useState('');
  const [addressCandidates, setAddressCandidates] = useState<Array<{
    address: string;
    road_address: string | null;
    jibun_address: string | null;
    building_name: string | null;
  }>>([]);
  const [addressResult, setAddressResult] = useState('');

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
      setApplication({ partner_name: '', contact: '', note: '' });
    } catch (error) {
      setApplicationResult(error instanceof Error ? error.message : '신청하지 못했습니다.');
    }
  };

  const normalizeAddress = async () => {
    setAddressResult('카카오맵에서 확인 중...');
    setAddressCandidates([]);
    try {
      const response = await fetch(`/api/external/address-tool?query=${encodeURIComponent(addressQuery)}`, {
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || '주소를 변환하지 못했습니다.');
      setAddressCandidates(body.candidates || []);
      setAddressResult(`자동 저장 주소: ${body.normalized_address}`);
    } catch (error) {
      setAddressResult(error instanceof Error ? error.message : '주소를 변환하지 못했습니다.');
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
          {isAdmin && (
            <button type="button" onClick={() => partnerManagementModal.open()}>
              <i className="ri-settings-3-line" aria-hidden="true" />
              파트너 관리
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
          <p>등록·수정·삭제, 이미지 저장, 주소 확인까지 파트너 서버에서 안전하게 연결하는 방법을 안내합니다.</p>
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
        <aside className="EAG-toc" aria-label="문서 목차">
          <strong>이 페이지에서</strong>
          <a href="/external-event-api#quick-start">1. 연동 시작</a>
          <a href="/external-event-api#request-example">2. 일정 요청 예시</a>
          <a href="/external-event-api#dates">3. 날짜 입력</a>
          <a href="/external-event-api#categories">4. 분류와 장르</a>
          <a href="/external-event-api#images">5. 이미지 등록</a>
          <a href="/external-event-api#address">6. 주소 확인</a>
          <a href="/external-event-api#fields">7. 필드 정리</a>
          <a href="/external-event-api#sync">8. 수정·삭제</a>
          <a href="/external-event-api#limits">9. 한도·오류</a>
        </aside>

        <article className="EAG-content">
          <section id="quick-start" className="EAG-section">
            <span className="EAG-sectionNo">01</span>
            <h2>연동 시작</h2>
            <p className="EAG-lead">관리자에게 아래 세 가지만 전달해 API Key를 발급받으세요.</p>
            <div className="EAG-stepGrid">
              <div><b>1</b><strong>파트너 또는 사이트 이름</strong></div>
              <div><b>2</b><strong>연결할 Dance Billboard 로그인 아이디</strong></div>
              <div><b>3</b><strong>기술 담당자 연락처</strong></div>
            </div>
            <div className="EAG-application">
              <div>
                <span className="EAG-kicker">연동 신청</span>
                <h3>매뉴얼을 확인한 뒤 관리자 승인을 요청하세요</h3>
                <p>처음에는 실제 일정에 노출되지 않는 테스트 키가 발급됩니다. 테스트가 끝나면 관리자가 운영 모드로 전환합니다.</p>
              </div>
              {!user ? (
                <button type="button" className="EAG-primaryLink" onClick={signInWithKakao}>로그인하고 신청하기</button>
              ) : (
                <div className="EAG-applicationForm">
                  <label>파트너 또는 사이트 이름<input value={application.partner_name} onChange={(event) => setApplication({ ...application, partner_name: event.target.value })} /></label>
                  <label>기술 담당자 연락처<input value={application.contact} onChange={(event) => setApplication({ ...application, contact: event.target.value })} placeholder="이메일 또는 전화번호" /></label>
                  <label className="is-wide">전달 사항<textarea value={application.note} onChange={(event) => setApplication({ ...application, note: event.target.value })} placeholder="연동 사이트 주소 등 필요한 내용만 적어 주세요." /></label>
                  <button type="button" className="EAG-primaryLink" disabled={!application.partner_name.trim() || !application.contact.trim()} onClick={submitApplication}>관리자 승인 요청</button>
                  {applicationResult && <p className="EAG-applicationResult" role="status">{applicationResult}</p>}
                </div>
              )}
            </div>
            <div className="EAG-callout">
              <i className="ri-shield-keyhole-line" aria-hidden="true" />
              <div>
                <strong>API Key는 파트너 서버에서만 사용하세요.</strong>
                <p>HTML이나 브라우저 JavaScript에 넣지 마세요. 웹 로그인 세션이나 회원 쿠키는 API 인증에 사용하지 않습니다.</p>
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
            <p className="EAG-lead">먼저 실제로 동작하는 전체 요청 형태를 확인하세요.</p>
            <CodeBlock label="cURL · 단일 일정 등록" code={curlExample} />
            <div className="EAG-endpoint">
              <span className="EAG-method">POST</span>
              <code>/events</code>
              <span>새 일정 등록</span>
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
              <div><strong>social</strong><p>이미지를 생략할 수 있습니다. 이때 확인된 정확한 주소가 반드시 필요합니다.</p></div>
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
              <li><code>upload</code>는 먼저 업로드된 내부 파일을 확인하고, <code>url</code>은 등록 시 원본 URL을 최대 8MB까지 내려받습니다.</li>
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
            <p className="EAG-footnote">Base64 문자열을 일정 JSON 안에 넣는 방식은 지원하지 않습니다. 내부망·로컬 주소, 사설 IP로 연결되는 도메인, 인증이 필요한 URL, 실행 가능한 파일과 8MB 초과 파일은 차단합니다.</p>
          </section>

          <section id="address" className="EAG-section">
            <span className="EAG-sectionNo">06</span>
            <h2>카카오맵 주소 자동 변환</h2>
            <p className="EAG-lead">이미지 없는 <code>social</code> 일정의 <code>address</code>는 등록할 때 서버가 카카오맵에서 자동 검색하고 첫 번째 표준 도로명·지번 주소로 변환해 저장합니다.</p>
            <div className="EAG-endpoint">
              <span className="EAG-method EAG-methodGet">GET</span>
              <code>/addresses/validate?query=서울특별시+강남구+테헤란로+123</code>
            </div>
            <CodeBlock label="파트너 서버 JavaScript · 주소 확인 API" code={addressApiExample} />
            <div className="EAG-addressTool">
              <div>
                <span className="EAG-kicker">주소 변환기</span>
                <h3>실제로 저장될 카카오맵 주소를 확인하세요</h3>
              </div>
              {!user ? (
                <button type="button" className="EAG-primaryLink" onClick={signInWithKakao}>로그인하고 주소 변환</button>
              ) : (
                <>
                  <div className="EAG-addressSearch">
                    <input value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} onKeyDown={(event) => {
                      if (event.key === 'Enter' && addressQuery.trim()) normalizeAddress();
                    }} placeholder="예: 서울특별시 강남구 테헤란로 123" aria-label="변환할 주소" />
                    <button type="button" className="EAG-primaryLink" disabled={!addressQuery.trim()} onClick={normalizeAddress}>카카오맵 주소로 변환</button>
                  </div>
                  {addressResult && <p className="EAG-addressResult" role="status">{addressResult}</p>}
                  {addressCandidates.length > 0 && (
                    <div className="EAG-addressCandidates">
                      {addressCandidates.map((candidate, index) => (
                        <div key={`${candidate.address}-${index}`}>
                          <b>{index === 0 ? '자동 저장' : `후보 ${index + 1}`}</b>
                          <strong>{candidate.address}</strong>
                          {candidate.building_name && <span>{candidate.building_name}</span>}
                          <button type="button" onClick={() => navigator.clipboard.writeText(candidate.address)}>주소 복사</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <ol className="EAG-numberList">
              <li>파트너 서버는 사용자가 입력한 주소를 일정 요청의 <code>address</code>에 넣습니다.</li>
              <li>Dance Billboard 서버가 등록 시 카카오 주소 검색을 자동 실행합니다.</li>
              <li>검색된 첫 번째 표준 주소를 일정에 저장하고 상세 화면의 카카오맵에 사용합니다.</li>
              <li>검색 결과가 없으면 일정을 저장하지 않고 <code>422 address_not_found</code>를 반환합니다.</li>
            </ol>
            <p className="EAG-footnote">파트너 등록 화면에서 후보를 미리 보여주고 싶다면 주소 확인 API 응답의 <code>normalized_address</code>를 바로 사용하세요. 후보 전체가 필요한 경우에만 <code>candidates</code>를 표시하면 됩니다.</p>
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
            <CodeBlock label="파트너 서버 JavaScript · 일정 전체 수정" code={updateEventExample} />
            <p>새 이미지를 보내면 WebP 4종을 다시 만들고 일정 이미지를 교체한 뒤 이전 파일을 정리합니다.</p>
            <CodeBlock label="파트너 서버 JavaScript · 일정 삭제" code={deleteEventExample} />
            <p>삭제가 성공하면 Dance Billboard의 일정과 연결 이미지도 함께 삭제됩니다. 다른 파트너 키로 등록한 일정은 수정하거나 삭제할 수 없습니다.</p>
          </section>

          <section id="limits" className="EAG-section">
            <span className="EAG-sectionNo">09</span>
            <h2>도배 방지 한도와 오류 대응</h2>
            <div className="EAG-limitBanner">
              <div><strong>30회</strong><span>테스트 권장 분당 한도</span></div>
              <div><strong>1,000회</strong><span>테스트 권장 24시간 한도</span></div>
              <div><strong>10회</strong><span>운영 권장 분당 한도</span></div>
              <div><strong>200회</strong><span>운영 권장 24시간 한도</span></div>
              <p>파트너 키별로 적용되며 관리자가 실제 사용량에 맞게 조정할 수 있습니다. 잘못된 반복 요청, 이미지 업로드, 주소 확인도 횟수에 포함됩니다.</p>
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
            <p>API Key 발급은 Dance Billboard 관리자에게 요청해 주세요.</p>
            <Link to="/">Dance Billboard 홈으로</Link>
          </footer>
        </article>
      </div>
    </main>
  );
}
