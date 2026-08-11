import { describe, expect, it } from 'vitest';
import { buildTrustedSceneStats, sceneEventGenre, validSceneDate } from './scene-stats.js';

const NOW = '2026-08-12T03:00:00.000Z';

function event(overrides = {}) {
  return {
    id: overrides.id || crypto.randomUUID(),
    title: '테스트용 정상 이벤트',
    category: 'event',
    dance_scope: 'swing',
    start_date: '2026-08-10',
    event_dates: [],
    created_at: '2026-07-20T03:00:00.000Z',
    ...overrides,
  };
}

describe('trusted swing scene statistics', () => {
  it('uses explicit occurrence dates instead of expanding or counting the series start', () => {
    const stats = buildTrustedSceneStats([
      event({
        id: 'series',
        category: 'class',
        start_date: '2026-07-01',
        end_date: '2026-08-31',
        event_dates: ['2026-08-04', '2026-08-11', '2026-08-11'],
        dance_genre: 'lindyhop',
      }),
      event({ id: 'single', start_date: '2026-08-20', genre: '발보아' }),
    ], {}, { now: NOW });

    const august = stats.monthly.find((month) => month.month === '2026-08');
    expect(august.total).toBe(3);
    expect(august.classes).toBe(2);
    expect(august.events).toBe(1);
    expect(stats.summary.totalItems).toBe(3);
    expect(stats.dataQuality.explicitDateRecords).toBe(1);
    expect(stats.dataQuality.fallbackDateRecords).toBe(1);
  });

  it('fails closed on non-events and unavailable rows, then removes only exact occurrence duplicates', () => {
    const duplicateBase = {
      title: '동일 행사',
      category: 'event',
      start_date: '2026-08-22',
      time: '19:00',
      location: '합정홀',
    };
    const stats = buildTrustedSceneStats([
      event({ id: 'a', ...duplicateBase }),
      event({ id: 'b', ...duplicateBase }),
      event({ id: 'different-time', ...duplicateBase, time: '20:00' }),
      event({ id: 'sale', category: 'social', activity_type: 'sale' }),
      event({ id: 'other-dance', dance_scope: 'tango' }),
      event({ id: 'hidden', is_hidden: true }),
      event({ id: 'venue-row', category: 'swing-bar', start_date: null }),
      event({ id: 'missing', start_date: null }),
      event({ id: 'outside', start_date: '2026-09-01' }),
    ], {}, { now: NOW });

    expect(stats.summary.totalItems).toBe(2);
    expect(stats.summary.uniqueEvents).toBe(2);
    expect(stats.dataQuality.deduplicatedOccurrences).toBe(1);
    expect(stats.dataQuality.exclusions).toMatchObject({
      non_event_activity: 1,
      non_swing_scope: 1,
      unavailable_status: 1,
      unsupported_category: 1,
      missing_valid_date: 1,
      outside_window: 1,
    });
  });

  it('normalizes only supported dance genres and reports classification coverage', () => {
    const stats = buildTrustedSceneStats([
      event({ id: 'bal', title: '발보아 행사', dance_genre: 'balboa' }),
      event({ id: 'lindy', title: '린디합 행사', genre: '린디합' }),
      event({ id: 'descriptor', title: '장르 미입력 행사', genre: 'DJ,소셜' }),
    ], {}, { now: NOW });

    expect(sceneEventGenre({ dance_genre: 'solojazz' })).toBe('솔로재즈');
    expect(sceneEventGenre({ genre: 'DJ,소셜' })).toBe('장르 미분류');
    expect(stats.topGenresList).toEqual(['린디합', '발보아']);
    expect(stats.dataQuality.genreCoverageRate).toBeCloseTo(66.7, 1);
  });

  it('zero-fills exactly twelve calendar months and computes evidence-based lead-time counts', () => {
    const stats = buildTrustedSceneStats([
      event({ id: 'class-early', title: '얼리 강습', category: 'class', start_date: '2026-08-10', created_at: '2026-07-01' }),
      event({ id: 'event-mid', title: '중간 행사', category: 'event', start_date: '2026-08-10', created_at: '2026-07-20' }),
      event({ id: 'negative', title: '역전 행사', category: 'event', start_date: '2026-08-10', created_at: '2026-08-11' }),
    ], {}, { now: NOW });

    expect(stats.monthly).toHaveLength(12);
    expect(stats.monthly[0].month).toBe('2025-09');
    expect(stats.monthly.at(-1).month).toBe('2026-08');
    expect(stats.leadTimeAnalysis.classEarly).toBe(1);
    expect(stats.leadTimeAnalysis.eventMid).toBe(1);
    expect(stats.leadTimeAnalysis.excludedSamples).toBe(1);
  });

  it('rejects impossible dates', () => {
    expect(validSceneDate('2026-02-29')).toBe('');
    expect(validSceneDate({ date: '2026-08-12' })).toBe('2026-08-12');
    expect(validSceneDate(new Date('2026-08-11T15:00:00.000Z'))).toBe('2026-08-12');
    expect(validSceneDate('2026-08-11T15:00:00.000Z')).toBe('2026-08-12');
  });
});
