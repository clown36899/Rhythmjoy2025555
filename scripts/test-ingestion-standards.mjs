import assert from 'node:assert/strict';
import {
  buildNetlifyPayload,
  hasBadPosterUrl,
  makeDeterministicId,
  prepareCandidate,
  textSimilarity,
  validateCandidate,
} from './ingestion/candidate-utils.mjs';
import { getAutomationSourceList, getCollectionSources, getExcludedSourceReason } from './ingestion/collection-registry.mjs';

const TODAY = '2026-05-23';

function baseCandidate(overrides = {}) {
  return {
    keyword: 'test',
    source_url: 'https://www.instagram.com/swingtimebar/p/ABC123/',
    poster_url: 'https://mkoryudscamnopvxdelk.supabase.co/storage/v1/object/public/scraped/test.webp',
    extracted_text: '스윙타임 금요 소셜 DJ Alpha 2026.06.05 20:00',
    structured_data: {
      title: '스윙타임 금요 소셜',
      date: '2026-06-05',
      location: '스윙타임',
      event_type: '소셜',
      djs: ['DJ Alpha'],
    },
    ...overrides,
  };
}

const id1 = makeDeterministicId('https://example.com/post?utm_source=x#top', '2026-06-01');
const id2 = makeDeterministicId('https://example.com/post', '2026-06-01');
assert.equal(id1, id2, 'utm/hash normalized deterministic ID');
assert.notEqual(id1, makeDeterministicId('https://example.com/post', '2026-06-02'), 'date changes deterministic ID');

const preparedSwing = prepareCandidate(baseCandidate(), { today: TODAY });
assert.equal(preparedSwing.validation.ok, true);
assert.equal(preparedSwing.candidate.id, makeDeterministicId(baseCandidate().source_url, '2026-06-05'));
assert.equal(preparedSwing.candidate.structured_data.dance_scope, 'swing');
assert.equal(preparedSwing.candidate.structured_data.activity_type, 'social');

const venueNormalized = prepareCandidate(baseCandidate({
  structured_data: {
    title: '경성홀 화요 소셜',
    date: '2026-06-09',
    location: '경성홀(신촌)',
    venue_name: '경성홀 (신촌)',
    event_type: '소셜',
  },
}), { today: TODAY });
assert.equal(venueNormalized.candidate.structured_data.location, '경성홀');
assert.equal(venueNormalized.candidate.structured_data.venue_name, '경성홀');

const salsa = prepareCandidate(baseCandidate({
  source_url: 'https://www.instagram.com/turn_latin_bar/p/SALSA1/',
  extracted_text: '홍턴 살사 소셜 DJ Mambo 2026.06.10',
  structured_data: { title: '홍턴 살사 소셜', date: '2026-06-10', location: '홍턴', djs: ['DJ Mambo'] },
}), { today: TODAY });
assert.equal(salsa.validation.ok, true);
assert.equal(salsa.candidate.structured_data.dance_scope, 'salsa');

const bachata = prepareCandidate(baseCandidate({
  source_url: 'https://bsbachata.com/events/2026-bachata',
  extracted_text: '사당 바차타 소셜 2026.06.12 DJ Luis',
  structured_data: { title: '사당 바차타 소셜', date: '2026-06-12', location: '비엔바', djs: ['DJ Luis'] },
}), { today: TODAY });
assert.equal(bachata.validation.ok, true);
assert.equal(bachata.candidate.structured_data.dance_scope, 'bachata');

const street = prepareCandidate(baseCandidate({
  source_url: 'https://www.dancecode.kr/dance/view/259',
  extracted_text: '힙합 배틀 참가자 모집 2026.06.20',
  structured_data: { title: 'Beat On Street 참가자 모집', date: '2026-06-20', location: '가산' },
}), { today: TODAY });
assert.equal(street.validation.ok, true);
assert.equal(street.candidate.structured_data.dance_scope, 'street');
assert.equal(street.candidate.structured_data.activity_type, 'recruit');
assert.ok(street.candidate.structured_data.tags.includes('participant'));

const tango = buildNetlifyPayload(baseCandidate({
  source_url: 'https://tangocalendar.kr/events/milonga-test',
  extracted_text: '서울 탱고 밀롱가 DJ Una 2026.06.21',
  structured_data: { title: '서울 탱고 밀롱가', date: '2026-06-21', location: '서울', djs: ['DJ Una'] },
}), { today: TODAY });
assert.equal(tango.structured_data.dance_scope, 'tango');

assert.equal(getExcludedSourceReason('https://www.meroniswing.com/social-dance'), '사용자 지정 제외 소스: meroniswing.com');
assert.equal(validateCandidate(baseCandidate({ source_url: 'https://www.meroniswing.com/social-dance' }), { today: TODAY }).ok, false);
assert.equal(getExcludedSourceReason('https://batswing.co.kr/'), '사용자 지정 제외 소스: BAT SWING');
assert.equal(validateCandidate(baseCandidate({ source_url: 'https://batswing.co.kr/' }), { today: TODAY }).ok, false);

assert.equal(hasBadPosterUrl('https://cdn.example.com/post/p240x240/photo.jpg'), true);
assert.equal(validateCandidate(baseCandidate({ poster_url: 'https://cdn.example.com/post/p240x240/photo.jpg' }), { today: TODAY }).ok, false);

assert.equal(validateCandidate(baseCandidate({ structured_data: { title: '과거 이벤트', date: '2026-05-01' } }), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({ poster_url: '' }), { today: TODAY }).ok, false);
assert.equal(validateCandidate(baseCandidate({
  extracted_text: 'K-pop cover dance audition 2026.06.01',
  structured_data: { title: 'K-pop cover audition', date: '2026-06-01' },
}), { today: TODAY }).ok, false);

assert.ok(textSimilarity('국제 스윙 댄스 페스티벌', '스윙댄스 국제 페스티벌') >= 0.4);
assert.ok(getCollectionSources('swing').length >= 20, 'swing sources should remain broad');
assert.ok(getCollectionSources('swing').some((source) => source.id === 'swingfamily-lessons'), 'swing lesson cafe should be in stable registry');
assert.ok(getCollectionSources('swing').some((source) => source.id === 'sweetyswing-lessons'), 'sweetyswing mobile cafe should be in stable registry');
assert.equal(getCollectionSources('swing').some((source) => source.id === 'batswing'), false, 'BAT SWING should not be an active collection source');
assert.ok(getCollectionSources('street').length >= 5, 'street sources should be expanded');
assert.ok(getCollectionSources('salsa').length >= 5, 'salsa sources should be expanded');
assert.ok(getCollectionSources('tango').length >= 4, 'tango sources should be expanded');
assert.ok(getCollectionSources('bachata').length >= 1, 'bachata sources should be present');
assert.ok(getAutomationSourceList().every((source) => source.scope === 'swing'), 'daily automation should only run stable swing sources');
assert.ok(getAutomationSourceList().every((source) => source.id), 'automation sources should expose stable source ids for logs');
assert.ok(getAutomationSourceList('expanded-research').every((source) => source.scope !== 'swing' && source.saveEnabled === false), 'expanded research should not save candidates by default');
assert.ok(getAutomationSourceList('expanded-ingestion').some((source) => source.scope === 'salsa' && source.saveEnabled === true), 'expanded ingestion profile can save verified expanded candidates');

console.log('ingestion standards ok');
