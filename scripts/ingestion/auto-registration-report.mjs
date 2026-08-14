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
