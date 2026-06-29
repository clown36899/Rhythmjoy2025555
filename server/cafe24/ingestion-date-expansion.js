function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

export function normalizeDateExpansionUrl(value = '') {
  try {
    const parsed = new URL(String(value || '').trim());
    parsed.hash = '';
    ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'igsh', 'igshid'].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
  } catch {
    return String(value || '').trim();
  }
}

export function normalizeDateExpansionText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/seoul/g, '서울')
    .replace(/dj\s*/gi, '')
    .replace(/[^\p{L}\p{N}가-힣]/gu, '');
}

export function dateExpansionRowDate(row = {}) {
  return dateOnly(row.event_date || row.structured_data?.date || row.date || row.start_date || row.date_value);
}

export function dateExpansionRowTitle(row = {}) {
  return String(row.title || row.structured_data?.title || '').trim();
}

export function dateExpansionRowSourceUrl(row = {}) {
  return normalizeDateExpansionUrl(row.normalized_source_url || row.source_url || row.link1 || '');
}

export function dateExpansionKey(row = {}) {
  const sourceUrl = dateExpansionRowSourceUrl(row);
  const title = normalizeDateExpansionText(dateExpansionRowTitle(row));
  if (!sourceUrl || title.length < 6) return '';
  return `${sourceUrl}|${title}`;
}

export function compareDateExpansionRows(a = {}, b = {}) {
  const leftDate = dateExpansionRowDate(a);
  const rightDate = dateExpansionRowDate(b);
  if (leftDate !== rightDate) {
    if (!leftDate) return 1;
    if (!rightDate) return -1;
    return leftDate.localeCompare(rightDate);
  }

  return String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}

export function sortDateExpansionInputs(values = []) {
  return [...(Array.isArray(values) ? values : [])].sort((a, b) => (
    dateExpansionKey(a).localeCompare(dateExpansionKey(b))
    || compareDateExpansionRows(a, b)
  ));
}

export function findDateExpansionPrimaryRow(candidate = {}, rows = []) {
  const key = dateExpansionKey(candidate);
  const date = dateExpansionRowDate(candidate);
  if (!key || !date) return null;

  return rows
    .filter((row) => {
      if (String(row?.id || '') && String(row?.id || '') === String(candidate?.id || '')) return false;
      const rowDate = dateExpansionRowDate(row);
      return rowDate && rowDate !== date && dateExpansionKey(row) === key;
    })
    .sort(compareDateExpansionRows)[0] || null;
}

export function shouldSkipDateExpansionCandidate(candidate = {}, rows = []) {
  const primary = findDateExpansionPrimaryRow(candidate, rows);
  if (!primary) return { skip: false, primary: null };
  return {
    skip: compareDateExpansionRows(primary, candidate) <= 0,
    primary,
  };
}

export function collapseDateExpansionRows(rows = []) {
  const grouped = new Map();
  const passthrough = [];

  for (const row of rows) {
    const key = dateExpansionKey(row);
    if (!key) {
      passthrough.push(row);
      continue;
    }

    const current = grouped.get(key);
    if (!current || compareDateExpansionRows(row, current) < 0) grouped.set(key, row);
  }

  return [...passthrough, ...grouped.values()];
}

export function dateExpansionSkipReason(primary = {}) {
  const primaryDate = dateExpansionRowDate(primary) || '첫 날짜';
  return `같은 원본/제목의 다중 날짜 후보는 첫 날짜만 수집: ${primaryDate}`;
}
