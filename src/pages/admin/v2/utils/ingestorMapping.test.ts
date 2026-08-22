import { describe, expect, it } from 'vitest';
import { mapIngestorEvent } from './ingestorMapping';

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
});
