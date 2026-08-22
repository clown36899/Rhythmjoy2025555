function candidateDate(candidate = {}) {
  const structuredData = candidate.structured_data || {};
  return String(
    structuredData.date
    || candidate.event_date
    || candidate.date
    || candidate.start_date
    || '',
  ).slice(0, 10);
}

function candidateText(candidate = {}) {
  const structuredData = candidate.structured_data || {};
  return [
    candidate.keyword,
    candidate.extracted_text,
    candidate.title,
    structuredData.title,
    structuredData.description,
    structuredData.note,
  ].filter(Boolean).join('\n').normalize('NFKC');
}

function normalizedPublicationDate(rawValue = '') {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';
  const explicit = raw.match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (explicit) {
    return `${explicit[1]}-${String(explicit[2]).padStart(2, '0')}-${String(explicit[3]).padStart(2, '0')}`;
  }
  const short = raw.match(/(?:^|\D)(\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})(?:\D|$)/);
  if (short) {
    return `20${short[1]}-${String(short[2]).padStart(2, '0')}-${String(short[3]).padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

export function publicationDate(candidate = {}) {
  const explicitField = normalizedPublicationDate(candidate.published_at || candidate.publishedAt || '');
  if (explicitField) return explicitField;

  const extractedText = String(candidate.extracted_text || '').normalize('NFKC');
  const labeled = extractedText.match(
    /(?:작성\s*시간|작성일|게시일|게시\s*시간|등록일|published(?:\s+at)?)\s*[:：|]?\s*((?:20)?\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2})/i,
  )?.[1];
  const labeledDate = normalizedPublicationDate(labeled);
  if (labeledDate) return labeledDate;

  const platformLabeled = extractedText.match(
    /(?:님의\s*게시물|게시물|posted\s+by).{0,240}?(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/is,
  );
  if (platformLabeled) {
    return normalizedPublicationDate(`${platformLabeled[1]}-${platformLabeled[2]}-${platformLabeled[3]}`);
  }

  // Facebook/Instagram text snapshots put the platform publication date in
  // the short account header before the post body. Restrict the fallback to
  // an early standalone line so event dates deeper in the body stay untouched.
  const header = extractedText.slice(0, 480);
  const platformHeaderDate = header.match(
    /(?:^|\n)\s*(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/m,
  );
  return platformHeaderDate
    ? normalizedPublicationDate(`${platformHeaderDate[1]}-${platformHeaderDate[2]}-${platformHeaderDate[3]}`)
    : '';
}

const rentalSubjectPattern = /(?:대관|공간\s*(?:대여|렌탈)|홀\s*(?:대여|렌탈)|연습실\s*(?:대여|렌탈)|스튜디오\s*(?:대여|렌탈))/i;
const rentalAvailabilityPattern = /(?:가능(?:한)?\s*(?:일|날짜|일정|시간|타임|스케줄)|예약\s*가능|빈\s*(?:날짜|시간|타임)|잔여\s*(?:일정|시간|타임)|(?:대관\s*)?(?:스케줄|캘린더))/i;

export function isVenueRentalAvailabilityNotice(candidate = {}) {
  const text = candidateText(candidate);
  if (!rentalSubjectPattern.test(text) || !rentalAvailabilityPattern.test(text)) return false;

  // 두 표현이 서로 다른 문단에 우연히 등장하는 경우를 줄이고,
  // 실제로 대관 가능일을 안내하는 문맥만 비이벤트 공지로 판정한다.
  return text.split(/\n+|[.!?。]+/).some((section) => (
    rentalSubjectPattern.test(section)
    && rentalAvailabilityPattern.test(section)
  )) || /(?:대관|공간\s*(?:대여|렌탈)|홀\s*(?:대여|렌탈)|연습실\s*(?:대여|렌탈)|스튜디오\s*(?:대여|렌탈)).{0,48}(?:가능(?:한)?\s*(?:일|날짜|일정|시간|타임|스케줄)|예약\s*가능|빈\s*(?:날짜|시간|타임)|잔여\s*(?:일정|시간|타임)|(?:스케줄|캘린더))/is.test(text);
}

export function getIngestionCandidateExclusionReason(candidate = {}, { today = '' } = {}) {
  const date = candidateDate(candidate);
  if (date && today && date < today) return `past event date: ${date} < ${today}`;
  const published = publicationDate(candidate);
  if (date && published) {
    const eventMs = Date.parse(`${date}T00:00:00+09:00`);
    const publishedMs = Date.parse(`${published}T00:00:00+09:00`);
    if (Number.isFinite(eventMs) && Number.isFinite(publishedMs) && eventMs - publishedMs > 400 * 86_400_000) {
      return `event date is implausibly far after source publication: ${published} -> ${date}`;
    }
  }
  if (
    published
    && today
    && String(candidate.discovery_source_type || '').toLowerCase() === 'benefit_search'
  ) {
    const todayMs = Date.parse(`${today}T00:00:00+09:00`);
    const publishedMs = Date.parse(`${published}T00:00:00+09:00`);
    if (Number.isFinite(todayMs) && Number.isFinite(publishedMs) && todayMs - publishedMs > 180 * 86_400_000) {
      return `stale benefit source post: ${published}`;
    }
  }
  if (isVenueRentalAvailabilityNotice(candidate)) {
    return 'non-event venue rental availability notice';
  }
  return null;
}
