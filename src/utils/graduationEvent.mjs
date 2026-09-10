const GRADUATION_EVENT_PATTERN = /(?:졸\s*공|졸업\s*(?:공연|파티)|graduation\s*(?:show|party|performance))/i;
const DIRECT_CLASS_HEADLINE_PATTERN = /(?:강습|수업|레슨|클래스|워크샵|워크숍|특강|원\s*데이|원데이|open\s*class|one\s*day|workshop|lesson|class)/i;
const DANCE_LEVEL_CLASS_HEADLINE_PATTERN = /(?:린디\s*합|지터벅|발보아|블루스|스윙|탱고|살사|바차타|lindy\s*hop|jitterbug|balboa|blues?|swing|tango|salsa|bachata)[^\n]{0,18}(?:입문|초보|초급|초중급|중급|베이직|기초|beginner|basic|fundamentals?)/i;

export function isClassLikeEventHeadline(value = '') {
  const headline = String(value || '').normalize('NFKC').trim();
  return DIRECT_CLASS_HEADLINE_PATTERN.test(headline)
    || DANCE_LEVEL_CLASS_HEADLINE_PATTERN.test(headline);
}

function graduationEvidenceText(input = {}) {
  const structured = input?.structured_data || {};
  return [
    structured.title,
    structured.event_type,
    structured.category,
    structured.genre,
    input?.title,
    input?.event_type,
    input?.category,
    input?.genre,
    input?.extracted_text,
  ].filter(Boolean).join('\n').normalize('NFKC');
}

function primaryGraduationEvidenceText(input = {}) {
  const structured = input?.structured_data || {};
  return [
    structured.title,
    structured.event_type,
    structured.category,
    structured.genre,
    input?.title,
    input?.event_type,
    input?.category,
    input?.genre,
  ].filter(Boolean).join('\n').normalize('NFKC');
}

function hasClassLikePrimaryClassification(input = {}) {
  const structured = input?.structured_data || {};
  const classifications = [
    structured.activity_type,
    structured.event_type,
    structured.category,
    input?.activity_type,
    input?.event_type,
    input?.category,
  ].map((value) => String(value || '').normalize('NFKC').trim().toLowerCase());
  if (classifications.some((value) => /^(?:class|club|recruit|sale|강습|수업|모집|판매(?:이벤트)?)$/.test(value))) {
    return true;
  }
  return isClassLikeEventHeadline(structured.title || input?.title || '');
}

export function getGraduationRound(input = {}) {
  const text = graduationEvidenceText(input);
  if (!GRADUATION_EVENT_PATTERN.test(text)) return null;

  const nearbyPatterns = [
    /(?:졸\s*공|졸업\s*(?:공연|파티)|graduation\s*(?:show|party|performance))[^\d\n]{0,24}(\d{1,3})\s*(?:학기|기|회)(?!\d)/i,
    /(?<!\d)(\d{1,3})\s*(?:학기|기|회)(?!\d)[^\n]{0,36}(?:졸\s*공|졸업\s*(?:공연|파티)|graduation\s*(?:show|party|performance))/i,
    /(?<!\d)(\d{1,3})\s*(?:학기|기|회)(?!\d)/,
  ];
  for (const pattern of nearbyPatterns) {
    const round = Number(text.match(pattern)?.[1] || 0);
    if (round >= 1 && round <= 999) return round;
  }
  return null;
}

export function getGraduationEventMetadata(input = {}) {
  const text = graduationEvidenceText(input);
  if (!GRADUATION_EVENT_PATTERN.test(text)) return null;

  // 강습·모집 후보의 본문에는 마지막 회차의 졸업파티가 함께 적히는 경우가 많다.
  // 후보 자체 제목/분류에 졸공 근거가 없다면 그 후속 일정을 현재 후보의 종류로 승격하지 않는다.
  const primaryText = primaryGraduationEvidenceText(input);
  if (!GRADUATION_EVENT_PATTERN.test(primaryText) && hasClassLikePrimaryClassification(input)) return null;

  const round = getGraduationRound(input);
  return {
    round,
    displayDj: round ? `졸공 ${round}회` : '졸공',
    category: 'social',
    genre: '졸공',
    activity_type: 'social',
    event_type: '소셜',
    group_id: 2,
  };
}
