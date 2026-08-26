const categoryLabels = {
  event: '행사',
  social: '소셜',
  class: '강습',
  club: '동호회',
};

const clean = (value, maxLength = 80) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const comparable = (value = '') => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/d\s*j/gi, '')
  .replace(/[^a-z0-9가-힣]/g, '');

export function eventMatchesExpectedAutomaticSocial(event = {}, expectation = {}) {
  if (expectation.eventId && String(event.id) === String(expectation.eventId)) return true;
  const candidate = expectation.candidate;
  const eventDate = String(event.start_date || event.date || '').slice(0, 10);
  if (!candidate || eventDate !== expectation.date) return false;
  const eventVenue = comparable(event.location || event.venue_name || '');
  const candidateVenue = comparable(candidate.venue || '');
  if (!candidateVenue || !eventVenue || eventVenue !== candidateVenue) return false;
  const candidateDjs = (candidate.djs || []).map(comparable).filter(Boolean);
  const eventEvidence = comparable([
    event.title,
    event.genre,
    ...(Array.isArray(event.djs) ? event.djs : []),
  ].filter(Boolean).join(' '));
  if (candidateDjs.length) return candidateDjs.every((dj) => eventEvidence.includes(dj));
  const eventTitle = comparable(event.title);
  const candidateTitle = comparable(candidate.title);
  return Boolean(eventTitle && candidateTitle)
    && (eventTitle.includes(candidateTitle) || candidateTitle.includes(eventTitle));
}

export function toAutoRegistrationReportEntry(event = {}, options = {}) {
  const category = clean(event.category || event.activity_type || 'event', 24).toLowerCase();
  return {
    id: event.id || null,
    title: clean(event.title || '제목 없음'),
    date: clean(event.start_date || event.date || '', 10),
    category,
    genre: clean(event.genre || '기타', 32),
    action: options.repaired === true ? 'repaired' : 'registered',
  };
}

export function formatAutoRegistrationTelegramLine(entries = [], limit = 15) {
  if (!entries.length) return '0건 (none)';

  const visible = entries.slice(0, Math.max(1, limit)).map((entry) => {
    const category = categoryLabels[entry.category] || entry.category || '행사';
    const classification = [category, entry.genre].filter(Boolean).join('/');
    const repaired = entry.action === 'repaired' ? ' · 기존보정' : '';
    return `${entry.date || '날짜없음'} ${entry.title} [${classification}${repaired}]`;
  });
  const omitted = entries.length - visible.length;
  return `${entries.length}건 | ${visible.join(' / ')}${omitted > 0 ? ` / 외 ${omitted}건` : ''}`;
}
