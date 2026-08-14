import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCandidate } from './candidate-utils.mjs';

const baseCandidate = (overrides = {}) => ({
  keyword: 'classification-test',
  source_id: 'kyungsunghall',
  source_url: 'https://www.instagram.com/kyungsunghall/p/classification-test/',
  poster_url: 'https://example.com/poster.jpg',
  extracted_text: '2026년 8월 17일 경성홀',
  structured_data: {
    title: '테스트 일정',
    date: '2026-08-17',
    venue_name: '경성홀',
    venue_provenance: 'source_registry',
    dance_scope: 'swing',
    dance_genre: 'swing',
    genre_family: 'partner',
    ...overrides.structured_data,
  },
  ...overrides,
});

test('keeps an explicit competition as an event even when a DJ is present', () => {
  const { candidate, validation } = prepareCandidate(baseCandidate({
    extracted_text: '챔피언스컵 코리아 2026 대회 정식부문, DJ 해림',
    structured_data: {
      title: '챔피언스컵 코리아 2026',
      date: '2026-08-17',
      activity_type: 'social',
      category: 'social',
      event_type: '대회',
      genre: '대회',
      djs: ['해림'],
      venue_name: '경성홀',
      venue_provenance: 'source_registry',
      dance_scope: 'swing',
      dance_genre: 'swing',
      genre_family: 'partner',
    },
  }), { today: '2026-08-14' });

  assert.equal(validation.taxonomy.activity_type, 'event');
  assert.equal(candidate.structured_data.activity_type, 'event');
  assert.equal(candidate.structured_data.category, 'event');
  assert.equal(candidate.structured_data.genre, '대회');
});

test('does not promote a genuine DJ social to an event', () => {
  const { candidate, validation } = prepareCandidate(baseCandidate({
    extracted_text: '8월 17일 경성홀 월요 소셜 DJ 해림',
    structured_data: {
      title: '경성홀 월요 소셜',
      date: '2026-08-17',
      activity_type: 'social',
      category: 'social',
      event_type: '소셜',
      genre: '소셜',
      djs: ['해림'],
      venue_name: '경성홀',
      venue_provenance: 'source_registry',
      dance_scope: 'swing',
      dance_genre: 'swing',
      genre_family: 'partner',
    },
  }), { today: '2026-08-14' });

  assert.equal(validation.taxonomy.activity_type, 'social');
  assert.equal(candidate.structured_data.activity_type, 'social');
  assert.equal(candidate.structured_data.category, 'social');
  assert.equal(candidate.structured_data.genre, '소셜');
});
