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
          <button type="button" className="EAG-shareButton" onClick={shareGuide}>
            <i className="ri-share-line" aria-hidden="true" />
            {shareResult || '공유'}
          </button>
        </div>
      </header>

      <section className="EAG-hero">
        <div className="EAG-heroContent">
          <span className="EAG-eyebrow">EXTERNAL EVENT API · v1</span>
          <h1>외부 사이트의 일정을<br />Dance Billboard에 연동하세요</h1>
          <p>등록·수정·삭제, 이미지 저장, 주소 확인까지 파트너 서버에서 안전하게 연결하는 방법을 안내합니다.</p>
          <div className="EAG-heroActions">
            <a href="#quick-start" className="EAG-primaryLink">빠른 시작</a>
            <a href="#request-example" className="EAG-secondaryLink">요청 예시 보기</a>
            <button type="button" className="EAG-secondaryLink EAG-heroShare" onClick={shareGuide}>
              <i className="ri-share-line" aria-hidden="true" /> {shareResult || '페이지 공유'}
            </button>
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
          <a href="#quick-start">1. 연동 시작</a>
          <a href="#request-example">2. 일정 요청 예시</a>
          <a href="#dates">3. 날짜 입력</a>
          <a href="#categories">4. 분류와 장르</a>
          <a href="#images">5. 이미지 등록</a>
          <a href="#address">6. 주소 확인</a>
          <a href="#fields">7. 필드 정리</a>
          <a href="#sync">8. 수정·삭제</a>
          <a href="#limits">9. 한도·오류</a>
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
            <p>모든 파트너가 표의 모든 조합을 사용할 수 있습니다. 임의의 분류는 추가할 수 없습니다. 관리자에게 생략 시 기본값을 안내받았더라도 요청에 다른 허용 조합을 보내면 해당 분류로 등록됩니다.</p>
            <div className="EAG-ruleCards">
              <div><strong>event · class · club</strong><p>이미지가 반드시 필요합니다.</p></div>
              <div><strong>social</strong><p>이미지를 생략할 수 있습니다. 이때 확인된 정확한 주소가 반드시 필요합니다.</p></div>
            </div>
          </section>

          <section id="images" className="EAG-section">
            <span className="EAG-sectionNo">05</span>
            <h2>이미지 등록 방식</h2>
            <div className="EAG-choiceGrid">
              <div>
                <span className="EAG-choiceIcon"><i className="ri-upload-cloud-2-line" /></span>
                <h3>파일 업로드</h3>
                <code>POST /images</code>
                <p>파트너 서버가 가진 이미지 파일을 먼저 업로드하고 반환된 <code>image_url</code>을 일정 요청에 사용합니다.</p>
              </div>
              <div>
                <span className="EAG-choiceIcon"><i className="ri-links-line" /></span>
                <h3>공개 URL 전달</h3>
                <code>image_mode: "url"</code>
                <p>로그인 없이 열리는 공개 HTTPS 이미지 주소를 일정 JSON에 바로 넣습니다.</p>
              </div>
            </div>
            <div className="EAG-flow">
              <span>원본 확인</span><i className="ri-arrow-right-line" />
              <span>실제 이미지 검사</span><i className="ri-arrow-right-line" />
              <span>WebP 4종 변환</span><i className="ri-arrow-right-line" />
              <span>Dance Billboard 저장</span>
            </div>
            <p>두 방식 모두 일정 등록 시 서버가 자동 처리합니다. 저장 후에는 원본 사이트에서 이미지가 삭제되어도 Dance Billboard의 이미지는 유지됩니다. Base64 이미지를 일정 JSON에 직접 넣는 방식은 지원하지 않습니다.</p>
          </section>

          <section id="address" className="EAG-section">
            <span className="EAG-sectionNo">06</span>
            <h2>카카오맵 주소 확인</h2>
            <p className="EAG-lead">이미지 없는 social 일정은 사용자가 직접 입력한 문장을 그대로 보내지 말고 주소 후보를 먼저 확인하세요.</p>
            <div className="EAG-endpoint">
              <span className="EAG-method EAG-methodGet">GET</span>
              <code>/addresses/validate?query=서울특별시+강남구+테헤란로+123</code>
            </div>
            <ol className="EAG-numberList">
              <li>파트너 등록 화면에서 사용자가 주소를 입력합니다.</li>
              <li>파트너 서버가 주소 확인 API를 호출합니다.</li>
              <li>사용자가 반환된 도로명주소 또는 지번주소 후보를 선택합니다.</li>
              <li>선택된 정확한 <code>address</code>를 일정 등록 요청에 넣습니다.</li>
            </ol>
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
            <p><code>external_id</code>는 파트너 시스템 안에서 바뀌지 않는 고유값이어야 합니다. 다른 파트너 키로 등록한 일정은 수정하거나 삭제할 수 없습니다.</p>
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
