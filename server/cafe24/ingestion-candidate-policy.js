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
  if (isVenueRentalAvailabilityNotice(candidate)) {
    return 'non-event venue rental availability notice';
  }
  return null;
}
