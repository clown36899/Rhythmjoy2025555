import assert from 'node:assert/strict';
import test from 'node:test';
import {
  eventMatchesExpectedAutomaticSocial,
  formatAutoRegistrationTelegramLine,
  toAutoRegistrationReportEntry,
} from './auto-registration-report.mjs';

test('does not treat a DJ-less recurring placeholder as a verified official social', () => {
  const expectation = {
    date: '2026-08-28',
    candidate: {
      title: '스윙프렌즈 해피홀 게시판 금요 소셜',
      venue: '해피홀',
      djs: ['쓴귤'],
    },
  };
  assert.equal(eventMatchesExpectedAutomaticSocial({
    id: 'regular-social:neo-fri:2026-08-28',
    start_date: '2026-08-28',
    title: '네오스윙 금요 소셜',
    location: '해피홀',
    genre: '소셜',
  }, expectation), false);
  assert.equal(eventMatchesExpectedAutomaticSocial({
    id: 'registered-happyhall-social',
    start_date: '2026-08-28',
    title: 'DJ 쓴귤 | 스윙프렌즈 해피홀 게시판 금요 소셜',
    location: '해피홀',
    genre: '소셜',
  }, expectation), true);
});

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
