const GRADUATION_EVENT_PATTERN = /(?:졸\s*공|졸업\s*(?:공연|파티)|graduation\s*(?:show|party|performance))/i;

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
