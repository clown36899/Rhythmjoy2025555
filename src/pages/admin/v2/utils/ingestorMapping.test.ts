import { describe, expect, it } from 'vitest';
import { mapIngestorEvent } from './ingestorMapping';
import { matchVenueRecord, normalizeVenueStructuredData } from '../../../../utils/venueNormalization';

describe('mapIngestorEvent graduation metadata', () => {
  it('maps a grounded cohort graduation performance to the social graduation lane', () => {
    const mapped = mapIngestorEvent({
      keyword: '올어바웃스윙 공식 인스타',
      source_url: 'https://www.instagram.com/allaboutswing_official/p/DcPjIKwTWir/',
      extracted_text: '98학기 SWING FESTIVAL 2026. 8. 22 마포구청 대강당 #졸업공연',
      structured_data: {
        title: '98학기 SWING FESTIVAL',
        event_type: '파티/행사',
        activity_type: 'event',
        category: 'event',
        genre: '기타',
        location: '마포구청 대강당',
      },
    }, []);

    expect(mapped).toMatchObject({
      category: 'social',
      genre: '졸공',
      activity_type: 'social',
      group_id: 2,
      djs: ['졸공 98회'],
      location: '마포구청 대강당',
    });
  });

  it('keeps a non-graduation festival in the ordinary event lane', () => {
    const mapped = mapIngestorEvent({
      extracted_text: 'SWING FESTIVAL 라이브 공연',
      structured_data: {
        title: 'SUMMER SWING FESTIVAL',
        event_type: '파티/행사',
        activity_type: 'event',
        category: 'event',
        genre: '기타',
        location: '마포구청 대강당',
      },
    }, []);

    expect(mapped).toMatchObject({
      category: 'event',
      activity_type: 'event',
      djs: [],
    });
  });

  it('does not turn a class start into a social because its schedule mentions a later graduation party', () => {
    const mapped = mapIngestorEvent({
      extracted_text: '강습기간 8/30~10/18 매주 일요일 / 10/25 졸업파티',
      structured_data: {
        title: '네오스윙 141기 린디합 입문',
        event_type: '강습',
        activity_type: 'class',
        category: 'class',
        genre: '린디합',
        location: '시옷쓰기 연습실',
      },
    }, []);

    expect(mapped).toMatchObject({
      category: 'class',
      activity_type: 'class',
      djs: [],
      location: '시옷쓰기 연습실',
    });
  });
});


describe('shared automatic venue matching', () => {
  const venues = [{ id: 'savoy', name: '사보이볼룸(사당)', address: '서울 관악구 남부순환로 2036',
    map_url: JSON.stringify({ kakao: '', naver: 'https://naver.me/verified', google: '' }), is_active: true }];

  it('links English extraction and manual mapping to the same registered venue', () => {
    const sd = { venue_name: 'SAVOY BALLROOM', location: 'SAVOY BALLROOM', description: '19:30 원문', time: 'legacy' };
    const normalized = normalizeVenueStructuredData(sd, venues, { strict: true });
    expect(normalized).toMatchObject({ venue_id: 'savoy', venue_name: '사보이볼룸', address: venues[0].address,
      location_link: 'https://naver.me/verified', description: sd.description, time: 'legacy' });
    expect(mapIngestorEvent({ structured_data: { ...sd, activity_type: 'social' } }, venues)).toMatchObject({
      venue_id: 'savoy', location_link: normalized.location_link,
    });
  });

  it('requires a unique active record for automatic matching and preserves unmatched input', () => {
    const input = { venue_name: '사보이볼룸', location_link: 'https://example.com/manual-map' };
    expect(normalizeVenueStructuredData(input, venues, { strict: true }).location_link).toBe(input.location_link);
    for (const rows of [[], [{ ...venues[0], is_active: false }], [...venues, { ...venues[0], id: 'other' }]]) {
      expect(normalizeVenueStructuredData(input, rows, { strict: true })).toEqual(input);
    }
    expect(matchVenueRecord({ venue_id: 'missing', venue_name: '사보이볼룸' }, venues, { strict: true })).toBeNull();
    expect(matchVenueRecord({ venue_name: '볼룸' }, venues, { strict: true })).toBeNull();
    expect(matchVenueRecord({ venue_name: '볼룸' }, venues)?.id).toBe('savoy'); // reviewed manual legacy fuzzy search
    expect(matchVenueRecord({ address: venues[0].address }, venues, { strict: true })?.id).toBe('savoy');
    expect(matchVenueRecord({ venue_name: '다른홀' }, venues, { strict: true })).toBeNull();
  });
});
