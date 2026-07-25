import { describe, expect, it } from 'vitest';
import {
  normalizeExternalEventPayload,
  normalizeExternalImage,
  normalizeExternalUrl,
  parseExternalApiKey,
  createImageVariants,
  isPublicAddress,
  isRoadAddress,
  SITE_GENRES_BY_CATEGORY,
  createPartnerApiKey,
  normalizePartnerClassification,
  normalizePartnerContact,
  normalizeAllowedClassifications,
} from './external-events-api.js';
import sharp from 'sharp';

const partner = {
  id: 'partner-a',
  name: '테스트 파트너',
  default_category: 'class',
  default_genre: '린디합',
};

describe('external event API validation', () => {
  it('requires both a valid partner contact email and phone number', () => {
    expect(normalizePartnerContact({
      contact_email: 'Developer@Example.com',
      contact_phone: '010-1234-5678',
    })).toEqual({
      email: 'developer@example.com',
      phone: '010-1234-5678',
      stored: '이메일: developer@example.com / 전화번호: 010-1234-5678',
    });
    expect(() => normalizePartnerContact({
      contact_email: '',
      contact_phone: '010-1234-5678',
    })).toThrow('contact_email 값이 필요합니다');
    expect(() => normalizePartnerContact({
      contact_email: 'developer@example.com',
      contact_phone: '1234',
    })).toThrow('올바른 전화번호');
  });

  it('uses only the site genre values', () => {
    expect(SITE_GENRES_BY_CATEGORY).toEqual({
      social: ['소셜', '졸공'],
      event: ['워크샵', '파티', '대회', '라이브밴드', '기타'],
      class: ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
      club: ['정규강습', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'],
    });
  });

  it('allows multiple approved genres and treats an empty selection as all genres', () => {
    expect(normalizeAllowedClassifications([])).toBeNull();
    expect(normalizeAllowedClassifications([
      { category: 'social', genre: '소셜' },
      { category: 'event', genre: '파티' },
      { category: 'event', genre: '파티' },
    ])).toEqual([
      { category: 'social', genre: '소셜' },
      { category: 'event', genre: '파티' },
    ]);
  });

  it('rejects a valid site genre when it is outside the partner allowlist', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-disallowed',
      title: '허용되지 않은 파티',
      event_dates: ['2026-08-01'],
      category: 'event',
      genre: '파티',
      image_mode: 'url',
      image_url: 'https://partner.example.com/images/party.webp',
    }, {
      ...partner,
      allowed_classifications: JSON.stringify([{ category: 'class', genre: '린디합' }]),
    })).toThrow('이 API Key에 허용되지 않은 분류와 장르입니다.');
  });

  it('matches the site rule: only event allows multiple genres', () => {
    const normalized = normalizeExternalEventPayload({
      external_id: 'partner-event-multiple-genres',
      title: '라이브 워크샵',
      event_dates: ['2026-08-01'],
      category: 'event',
      genre: '워크샵,라이브밴드',
      source_url: 'https://partner.example.com/events/multiple',
      image_mode: 'url',
      image_url: 'https://partner.example.com/images/multiple.webp',
    }, {
      ...partner,
      allowed_category: 'event',
      allowed_classifications: JSON.stringify([
        { category: 'event', genre: '워크샵' },
        { category: 'event', genre: '라이브밴드' },
      ]),
    });
    expect(normalized.event.genre).toBe('워크샵,라이브밴드');

    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-class-multiple-genres',
      title: '복수 강습',
      event_dates: ['2026-08-01'],
      category: 'class',
      genre: '린디합,솔로재즈',
    }, partner)).toThrow('소셜, 강습, 동호회 일정은 genre를 1개만');
  });

  it('matches the site event exclusions for party, competition, and other', () => {
    const eventPartner = { ...partner, allowed_category: 'event' };
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-party-competition',
      title: '잘못된 행사 조합',
      event_dates: ['2026-08-01'],
      category: 'event',
      genre: '파티,대회',
    }, eventPartner)).toThrow('파티와 대회는 동시에');
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-other-mixed',
      title: '잘못된 기타 조합',
      event_dates: ['2026-08-01'],
      category: 'event',
      genre: '워크샵,기타',
    }, eventPartner)).toThrow('기타는 다른 장르와 동시에');
  });

  it('restricts every requested event genre to the partner allowlist', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-partially-disallowed',
      title: '부분 미허용 행사',
      event_dates: ['2026-08-01'],
      category: 'event',
      genre: '워크샵,라이브밴드',
    }, {
      ...partner,
      allowed_category: 'event',
      allowed_classifications: JSON.stringify([{ category: 'event', genre: '워크샵' }]),
    })).toThrow('이 API Key에 허용되지 않은 분류와 장르입니다.');
  });

  it('applies partner defaults and maps them to the existing event metadata', () => {
    const normalized = normalizeExternalEventPayload({
      external_id: 'partner-event-1',
      title: '토요일 린디합 강습',
      event_dates: ['2026-08-01'],
      location: '서울',
      source_url: 'https://partner.example.com/events/1',
      image_mode: 'url',
      image_url: 'https://partner.example.com/images/1.webp',
    }, partner);

    expect(normalized.event).toMatchObject({
      category: 'class',
      genre: '린디합',
      dance_scope: 'swing',
      dance_genre: 'lindyhop',
      activity_type: 'class',
      scope: 'domestic',
      organizer: '익명',
      show_title_on_billboard: true,
      image_micro: 'https://partner.example.com/images/1.webp',
      image_thumbnail: 'https://partner.example.com/images/1.webp',
      image_medium: 'https://partner.example.com/images/1.webp',
      image_full: 'https://partner.example.com/images/1.webp',
    });
  });

  it('uses selected individual dates and derives the visible date range like the site form', () => {
    const normalized = normalizeExternalEventPayload({
      external_id: 'partner-event-individual-dates',
      title: '주말 선택 강습',
      event_dates: ['2026-08-22', '2026-08-01', '2026-08-08', '2026-08-08'],
      source_url: 'https://partner.example.com/events/2',
      image_mode: 'url',
      image_url: 'https://partner.example.com/images/2.webp',
    }, partner);

    expect(normalized.event).toMatchObject({
      date: '2026-08-01',
      start_date: '2026-08-01',
      end_date: '2026-08-22',
      event_dates: ['2026-08-01', '2026-08-08', '2026-08-22'],
    });
  });

  it('requires at least one event_dates value for every event', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-no-dates',
      title: '날짜 없음',
    }, partner)).toThrow('event_dates에 날짜를 하나 이상');
  });

  it('rejects a genre that is not available for the selected site category', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-2',
      title: '잘못된 일정',
      event_dates: ['2026-08-01'],
      category: 'social',
      genre: '린디합',
    }, partner)).toThrow('social에서 사용할 수 있는 genre는 소셜, 졸공입니다.');
  });

  it('rejects internal or unknown fields instead of silently accepting them', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-protected',
      title: '보호 필드 포함',
      event_dates: ['2026-08-01'],
      user_id: 'forced-user',
    }, partner)).toThrow('허용되지 않은 필드입니다: user_id');
  });

  it('rejects invalid dates and the unsupported end_date field', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-3',
      title: '잘못된 날짜',
      event_dates: ['2026-02-30'],
    }, partner)).toThrow('올바른 날짜');

    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-4',
      title: '연속 날짜',
      start_date: '2026-08-01',
      end_date: '2026-08-02',
    }, partner)).toThrow('start_date와 end_date는 지원하지 않습니다');
  });

  it('does not expose legacy date fields even when event_dates is supplied', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-event-mixed-dates',
      title: '혼합 날짜',
      start_date: '2026-08-01',
      event_dates: ['2026-08-01', '2026-08-08'],
    }, partner)).toThrow('start_date와 end_date는 지원하지 않습니다');
  });

  it('accepts public HTTPS images and rejects internal or executable-looking URLs', () => {
    expect(normalizeExternalUrl(
      'https://images.example.com/poster.webp',
      'image_url',
      { image: true },
    )).toBe('https://images.example.com/poster.webp');

    expect(() => normalizeExternalUrl('http://images.example.com/poster.jpg', 'image_url', { image: true }))
      .toThrow('HTTPS');
    expect(() => normalizeExternalUrl('https://127.0.0.1/poster.jpg', 'image_url', { image: true }))
      .toThrow('내부');
    expect(() => normalizeExternalUrl('https://[::1]/poster.jpg', 'image_url', { image: true }))
      .toThrow('내부');
    expect(() => normalizeExternalUrl('https://images.example.com/poster.svg', 'image_url', { image: true }))
      .toThrow('AVIF, JPEG, PNG, WebP');
  });

  it('blocks reserved, documentation and IPv4-mapped private network addresses', () => {
    [
      '100.64.0.1',
      '192.0.2.1',
      '198.18.0.1',
      '198.51.100.1',
      '203.0.113.1',
      '::ffff:127.0.0.1',
      '::ffff:192.168.0.1',
      'ff02::1',
    ].forEach((address) => expect(isPublicAddress(address)).toBe(false));
    expect(isPublicAddress('8.8.8.8')).toBe(true);
    expect(isPublicAddress('2606:4700:4700::1111')).toBe(true);
  });

  it('supports explicit external URL and uploaded image modes', () => {
    const externalUrl = normalizeExternalEventPayload({
      external_id: 'partner-image-url',
      title: '외부 URL 이미지',
      event_dates: ['2026-08-01'],
      image_mode: 'url',
      image_url: 'https://images.example.com/poster.jpg',
      source_url: 'https://partner.example.com/events/image-url',
    }, partner);
    expect(externalUrl.event.external_source.image_mode).toBe('url');

    const uploaded = normalizeExternalEventPayload({
      external_id: 'partner-image-upload',
      title: '업로드 이미지',
      event_dates: ['2026-08-01'],
      image_mode: 'upload',
      image_url: 'https://swingenjoy.com/uploads/external-events/c9cd539e9284e15e/2026/08/asset/full.webp',
      source_url: 'https://partner.example.com/events/image-upload',
    }, partner);
    expect(uploaded.event.external_source.image_mode).toBe('upload');

    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-invalid-upload-image',
      title: '잘못된 업로드 URL',
      event_dates: ['2026-08-01'],
      image_mode: 'upload',
      image_url: 'https://images.example.com/poster.jpg',
      source_url: 'https://partner.example.com/events/invalid-upload',
    }, partner)).toThrow('업로드 API가 반환한 image_url');
  });

  it('matches the site requirement for an image and a related link', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-no-image',
      title: '이미지 없음',
      event_dates: ['2026-08-01'],
      source_url: 'https://partner.example.com/events/no-image',
    }, partner)).toThrow('image_mode과 image_url이 필요합니다');

    expect(() => normalizeExternalEventPayload({
      external_id: 'partner-no-link',
      title: '링크 없음',
      event_dates: ['2026-08-01'],
      image_mode: 'url',
      image_url: 'https://images.example.com/poster.jpg',
    }, partner)).toThrow('source_url 값이 필요합니다');
  });

  it('keeps a social address optional and records verified road-address metadata', () => {
    const social = normalizeExternalEventPayload({
      external_id: 'social-with-map',
      title: '이미지 없는 소셜',
      event_dates: ['2026-08-01'],
      category: 'social',
      genre: '소셜',
      location: '스윙홀',
      address: '서울특별시 강남구 테헤란로 1',
      postal_code: '06123',
      address_source: 'daum_postcode',
      address_detail: '3층',
      source_url: 'https://partner.example.com/socials/1',
    }, partner);

    expect(social.event).toMatchObject({
      category: 'social',
      image: '',
      image_thumbnail: '',
      address: '서울특별시 강남구 테헤란로 1',
    });

    const withoutAddress = normalizeExternalEventPayload({
      external_id: 'social-without-map',
      title: '주소도 없는 소셜',
      event_dates: ['2026-08-01'],
      category: 'social',
      genre: '소셜',
      source_url: 'https://partner.example.com/socials/2',
    }, partner);
    expect(withoutAddress.event.address).toBe('');

    const vagueAddress = normalizeExternalEventPayload({
      external_id: 'social-vague-address',
      title: '모호한 장소',
      event_dates: ['2026-08-01'],
      category: 'social',
      genre: '소셜',
      address: '강남역 근처 스윙홀',
      source_url: 'https://partner.example.com/socials/3',
    }, partner);
    expect(vagueAddress.event.address).toBe('강남역 근처 스윙홀');
    const googleAddress = normalizeExternalEventPayload({
      external_id: 'social-google-road-address',
      title: '구글에서 확인한 도로명주소',
      event_dates: ['2026-08-01'],
      category: 'social',
      genre: '소셜',
      address: '서울특별시 강남구 테헤란로 123',
      address_source: 'google_map',
      source_url: 'https://partner.example.com/socials/4',
    }, partner);
    expect(googleAddress.event.external_source.address_source).toBe('google_map');
    expect(isRoadAddress('서울특별시 강남구 테헤란로 123')).toBe(true);
    expect(isRoadAddress('서울특별시 강남구 역삼동 123-45')).toBe(false);
  });

  it('does not accept another origin or partner upload folder', () => {
    expect(() => normalizeExternalEventPayload({
      external_id: 'cross-origin-upload',
      title: '위조 업로드',
      event_dates: ['2026-08-01'],
      image_mode: 'upload',
      image_url: 'https://attacker.example/uploads/external-events/c9cd539e9284e15e/2026/08/asset/full.webp',
      source_url: 'https://partner.example.com/events/cross-origin',
    }, partner)).toThrow('업로드 API가 반환한 image_url');
    expect(() => normalizeExternalEventPayload({
      external_id: 'cross-partner-upload',
      title: '다른 파트너 이미지',
      event_dates: ['2026-08-01'],
      image_mode: 'upload',
      image_url: 'https://swingenjoy.com/uploads/external-events/0000000000000000/2026/08/asset/full.webp',
      source_url: 'https://partner.example.com/events/cross-partner',
    }, partner)).toThrow('업로드 API가 반환한 image_url');
  });

  it('parses only the issued key format', () => {
    const parsed = parseExternalApiKey('Bearer rj_live_ab12_secret-value');
    expect(parsed.prefix).toBe('ab12');
    expect(parsed.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(() => parseExternalApiKey('Bearer random-key')).toThrow('Bearer API Key');
  });

  it('issues unique one-time keys whose stored hash matches authentication', () => {
    const first = createPartnerApiKey();
    const second = createPartnerApiKey();
    const parsed = parseExternalApiKey(`Bearer ${first.apiKey}`);

    expect(first.apiKey).toMatch(/^rj_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(first.apiKey).not.toBe(second.apiKey);
    expect(parsed.prefix).toBe(first.prefix);
    expect(parsed.hash).toBe(first.keyHash);
  });

  it('allows only a complete site classification pair for partner defaults', () => {
    expect(normalizePartnerClassification('', '')).toEqual({ category: null, genre: null });
    expect(normalizePartnerClassification('event', '워크샵')).toEqual({
      category: 'event',
      genre: '워크샵',
    });
    expect(() => normalizePartnerClassification('event', '')).toThrow('함께 선택');
    expect(() => normalizePartnerClassification('event', '린디합')).toThrow('올바른 최상위·하위 분류');
  });

  it('decodes and rewrites uploaded images as a safe WebP file', async () => {
    const png = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 4,
        background: '#ff0000',
      },
    }).png().toBuffer();
    const result = await normalizeExternalImage(png);
    const metadata = await sharp(result).metadata();
    expect(metadata.format).toBe('webp');
    expect(metadata.width).toBe(10);
    expect(metadata.height).toBe(10);
  });

  it('creates the four site image sizes as WebP', async () => {
    const png = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 3,
        background: '#336699',
      },
    }).png().toBuffer();
    const variants = await createImageVariants(png);
    expect(Object.keys(variants).sort()).toEqual(['full', 'medium', 'micro', 'thumbnail']);
    const widths = {};
    for (const [name, buffer] of Object.entries(variants)) {
      const metadata = await sharp(buffer).metadata();
      expect(metadata.format).toBe('webp');
      widths[name] = metadata.width;
    }
    expect(widths).toEqual({ micro: 100, thumbnail: 300, medium: 650, full: 1300 });
  });

  it('rejects non-image upload bodies', async () => {
    await expect(normalizeExternalImage(Buffer.from('<script>alert(1)</script>')))
      .rejects.toThrow('지원하지 않는 이미지');
  });
});
