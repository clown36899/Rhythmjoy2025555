import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const functionUrl = process.env.SCRAPED_EVENTS_FUNCTION_URL
    || 'http://localhost:8888/api/scraped-events';
const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('VITE_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_KEY가 없습니다.');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const testIds = new Set();
const testEventIds = new Set();

function eventId(name) {
    const id = `dup_test_${name}`;
    testIds.add(id);
    return id;
}

function baseItem(id, structuredData, overrides = {}) {
    return {
        id,
        keyword: 'codex-duplicate-test',
        source_url: `https://example.test/${id}`,
        poster_url: `https://example.test/${id}.webp`,
        extracted_text: structuredData.title || id,
        is_collected: false,
        structured_data: {
            title: 'Codex Duplicate Test',
            date: '2027-12-01',
            location: 'Codex Test Hall',
            venue_name: 'Codex Test Hall',
            event_type: '소셜',
            ...structuredData,
        },
        ...overrides,
    };
}

async function post(item) {
    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
    });
    const text = await response.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        json = { raw: text };
    }
    if (!response.ok) {
        throw new Error(`POST ${item.id} failed: ${response.status} ${text}`);
    }
    return json;
}

async function cleanup() {
    const ids = [...testIds];
    if (ids.length > 0) {
        await fetch(functionUrl, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        }).catch(() => undefined);
        await supabase.from('scraped_events').delete().like('id', 'dup_test_%');
    }

    const eventIds = [...testEventIds];
    if (eventIds.length > 0) {
        await supabase.from('events').delete().in('id', eventIds);
    }
}

function expectNew(label, result) {
    if (result.count !== 1 || result.skipped?.length) {
        throw new Error(`${label}: NEW 기대, 실제=${JSON.stringify(result)}`);
    }
}

async function expectDuplicate(label, candidate, expectedReasonPart) {
    const result = await post(candidate);
    const skipped = result.skipped?.[0];
    if (result.count !== 0 || !skipped) {
        throw new Error(`${label}: DUPLICATE 기대, 실제=${JSON.stringify(result)}`);
    }
    if (expectedReasonPart && !String(skipped.reason || '').includes(expectedReasonPart)) {
        throw new Error(`${label}: 사유에 "${expectedReasonPart}" 없음: ${JSON.stringify(skipped)}`);
    }

    const { data } = await supabase
        .from('scraped_events')
        .select('id,status,structured_data')
        .eq('id', candidate.id)
        .maybeSingle();
    if (data?.status !== 'duplicate') {
        throw new Error(`${label}: 중복 탭 저장 실패: ${JSON.stringify(data)}`);
    }
    return skipped;
}

async function insertCalendarAnchor() {
    const { data, error } = await supabase
        .from('events')
        .insert({
            title: '코덱스 운영DB 기준 행사',
            date: '2028-01-20',
            start_date: '2028-01-20',
            end_date: '2028-01-22',
            event_dates: ['2028-01-20', '2028-01-21', '2028-01-22'],
            time: '19:00',
            location: '코덱스 테스트홀',
            venue_name: '코덱스 테스트홀',
            category: 'event',
            genre: 'swing',
            organizer: 'codex-test',
            link1: 'https://example.test/calendar-anchor',
        })
        .select('id')
        .single();
    if (error) throw error;
    testEventIds.add(data.id);
    return data.id;
}

async function run() {
    await cleanup();

    const results = [];
    const record = async (label, fn) => {
        await fn();
        results.push(`PASS ${label}`);
    };

    await record('동일 source_url+날짜는 제목이 달라도 중복', async () => {
        const anchor = baseItem(eventId('same_source_anchor'), {
            title: 'Original Source Event',
            date: '2027-12-10',
        }, { source_url: 'https://example.test/same-source-post' });
        expectNew('same source anchor', await post(anchor));
        await expectDuplicate('same source duplicate', baseItem(eventId('same_source_candidate'), {
            title: 'Changed Caption Title',
            date: '2027-12-10',
        }, { source_url: 'https://example.test/same-source-post' }), '동일 소스URL+날짜');
    });

    await record('소셜 날짜+DJ가 같으면 URL/제목이 달라도 중복', async () => {
        expectNew('dj anchor', await post(baseItem(eventId('dj_anchor'), {
            title: 'DJ Alpha Social',
            date: '2027-12-11',
            event_type: '소셜',
            djs: ['DJ Alpha'],
        })));
        await expectDuplicate('dj duplicate', baseItem(eventId('dj_candidate'), {
            title: 'Guest Night',
            date: '2027-12-11',
            event_type: '소셜',
            djs: ['DJ Alpha'],
        }), '날짜+DJ');
    });

    await record('동일 날짜+제목은 다른 URL이어도 중복', async () => {
        expectNew('title anchor', await post(baseItem(eventId('title_anchor'), {
            title: 'Exact Title Match Event',
            date: '2027-12-12',
        })));
        await expectDuplicate('title duplicate', baseItem(eventId('title_candidate'), {
            title: 'Exact Title Match Event',
            date: '2027-12-12',
        }), '날짜+제목');
    });

    await record('한글/영문 번역 유사 제목은 중복', async () => {
        expectNew('translated anchor', await post(baseItem(eventId('translated_anchor'), {
            title: '국제 스윙 댄스 페스티벌',
            date: '2027-12-13',
            location: '서울',
            event_type: '페스티벌',
        })));
        await expectDuplicate('translated duplicate', baseItem(eventId('translated_candidate'), {
            title: 'International Swing Dance Festival',
            date: '2027-12-13',
            location: 'Seoul',
            event_type: 'festival',
        }), '수집DB 동일 기간+제목');
    });

    await record('다일 행사는 제목이 달라도 동일 기간+장소면 검토 중복', async () => {
        expectNew('range venue anchor', await post(baseItem(eventId('range_venue_anchor'), {
            title: 'Korean Swing Weekend',
            date: '2027-12-14',
            end_date: '2027-12-16',
            location: '서귀포월드컵리조트',
            event_type: '페스티벌',
        })));
        await expectDuplicate('range venue duplicate', baseItem(eventId('range_venue_candidate'), {
            title: 'Ocean Dance Camp 2027',
            date: '2027-12-14',
            end_date: '2027-12-16',
            location: '서귀포 월드컵리조트 / 러디스 카페',
            event_type: 'festival',
        }), '다일행사 검토');
    });

    await record('같은 소스의 반복 소셜은 날짜가 다르면 신규로 통과', async () => {
        const sourceUrl = 'https://example.test/weekly-social-post';
        expectNew('recurring anchor', await post(baseItem(eventId('recurring_anchor'), {
            title: 'Weekly Social',
            date: '2027-12-17',
        }, { source_url: sourceUrl })));
        expectNew('recurring candidate', await post(baseItem(eventId('recurring_candidate'), {
            title: 'Weekly Social',
            date: '2027-12-24',
        }, { source_url: sourceUrl })));
    });

    await record('같은 날짜라도 제목/장소가 다르면 신규로 통과', async () => {
        expectNew('different event', await post(baseItem(eventId('different_event'), {
            title: 'Completely Different Event',
            date: '2027-12-12',
            location: 'Another Test Venue',
            event_type: '워크숍',
        })));
    });

    await record('완료 처리된 같은 ID는 덮어쓰지 않음', async () => {
        const id = eventId('already_collected');
        expectNew('collected anchor', await post(baseItem(id, {
            title: 'Already Collected Test',
            date: '2027-12-18',
        })));
        await supabase.from('scraped_events').update({ is_collected: true }).eq('id', id);
        const result = await post(baseItem(id, {
            title: 'Already Collected Test Updated',
            date: '2027-12-18',
        }));
        if (result.count !== 0 || !String(result.skipped?.[0]?.reason || '').includes('이미 완료 처리됨')) {
            throw new Error(`already collected 보호 실패: ${JSON.stringify(result)}`);
        }
    });

    await record('중복 탭에 저장된 과거 중복도 다음 비교 기준으로 사용', async () => {
        expectNew('duplicate archive anchor', await post(baseItem(eventId('duplicate_archive_anchor'), {
            title: 'Archive Duplicate Anchor',
            date: '2027-12-19',
            location: 'Archive Test Hall',
        }, { status: 'duplicate' })));
        await expectDuplicate('duplicate archive candidate', baseItem(eventId('duplicate_archive_candidate'), {
            title: 'Archive Duplicate Anchor',
            date: '2027-12-19',
            location: 'Archive Test Hall',
        }), '날짜+제목');
    });

    await record('운영 events DB와 동일 기간+장소면 제목이 달라도 중복', async () => {
        const eventDbId = await insertCalendarAnchor();
        const skipped = await expectDuplicate('calendar duplicate', baseItem(eventId('calendar_candidate'), {
            title: 'Completely Renamed Multi Day Party',
            date: '2028-01-20',
            end_date: '2028-01-22',
            location: '코덱스 테스트홀',
            event_type: '페스티벌',
        }), '운영DB 동일 기간+장소+다일행사 검토');
        if (String(skipped.existingId) !== String(eventDbId)) {
            throw new Error(`운영DB 기준 id 불일치: expected=${eventDbId}, actual=${skipped.existingId}`);
        }
    });

    await record('실제 바다제류: 영문/한글 제목이 안 맞아도 기간+장소로 중복', async () => {
        await expectDuplicate('badaje dynamic duplicate', baseItem(eventId('real_badaje_candidate'), {
            title: 'Ocean Swing Weekend 2026',
            date: '2026-05-22',
            end_date: '2026-05-24',
            location: '서귀포 월드컵리조트 / 러디스 카페',
            event_type: 'festival',
        }), '다일행사 검토');
    });

    await record('실제 PULSE류: 영문 제목/장소 근거로 중복', async () => {
        await expectDuplicate('pulse dynamic duplicate', baseItem(eventId('real_pulse_candidate'), {
            title: 'PULSE IN SEOUL 2026',
            date: '2026-06-05',
            end_date: '2026-06-07',
            location: 'Happy Hall 해피홀 신촌',
            event_type: 'festival',
        }), '중복');
    });

    await cleanup();

    const { data: leftovers, error } = await supabase
        .from('scraped_events')
        .select('id')
        .like('id', 'dup_test_%');
    if (error) throw error;
    if (leftovers?.length) throw new Error(`테스트 데이터 잔존: ${leftovers.map(row => row.id).join(', ')}`);

    console.log(results.join('\n'));
    console.log(`PASS cleanup 잔존 테스트 row 0건`);
}

run().catch(async (error) => {
    console.error(error);
    await cleanup();
    process.exit(1);
});
