import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatAutoRegistrationTelegramLine,
  toAutoRegistrationReportEntry,
} from './auto-registration-report.mjs';

test('reports the final automatic registration classification to Telegram', () => {
  const entry = toAutoRegistrationReportEntry({
    id: 'champions-cup',
    title: '챔피언스컵',
    date: '2026-08-17',
    category: 'event',
    genre: '대회',
  });

  assert.deepEqual(entry, {
    id: 'champions-cup',
    title: '챔피언스컵',
    date: '2026-08-17',
    category: 'event',
    genre: '대회',
    action: 'registered',
  });
  assert.equal(
    formatAutoRegistrationTelegramLine([entry]),
    '1건 | 2026-08-17 챔피언스컵 [행사/대회]',
  );
});

test('marks repaired registrations and bounds long Telegram summaries', () => {
  const entries = Array.from({ length: 3 }, (_, index) => toAutoRegistrationReportEntry({
    title: `일정 ${index + 1}`,
    date: `2026-08-${String(index + 17).padStart(2, '0')}`,
    category: 'social',
    genre: '소셜',
  }, { repaired: index === 0 }));

  assert.equal(
    formatAutoRegistrationTelegramLine(entries, 2),
    '3건 | 2026-08-17 일정 1 [소셜/소셜 · 기존보정] / 2026-08-18 일정 2 [소셜/소셜] / 외 1건',
  );
});
