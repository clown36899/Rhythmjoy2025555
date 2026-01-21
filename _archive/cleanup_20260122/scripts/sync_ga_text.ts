import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const rawData = `
D&F 신년 라이브 파티	57
🥳신규 거점지 오픈 파티 안내🥳	37
2026 Street Lindy Fighter	36
DEEP DIVE	30
Supremes Night	30
[2026 New year SNL Jazz Live ]	21
조제&빠코의 드래그블루스 레벨1	21
Test	18
칼요의 솔로재즈 베이직 <초중급>	18
🗽 뉴욕 퍼포먼스 랩 – 네이선 & 메티	17
🐯 호링쌤의 호랑이기운이 솟아나는 스위블 워크샵	16
2025 BLW (BUSAN LINDY HOP WEEKEND)	15
KFC: 칼요의 팔로어 코어 < Basic >	15
부산스윙프렌즈 첫돌 파티	15
발보아랜드 정규강습(초급,초중급,퓨어발)	14
JAZZ HIT IT	13
블루스얼라이브 2026[2/27-3/2]	13
스윙하우스 발보아 패턴특강 3	13
NewBal팀원모집	12
드림발 49회 초급 초중급 중급 수강생 모집(개강 1.4)	12
슬로우잼_Slow Social	12
SEOUL lindyfest 2026	11
칼요의 솔로재즈 베이직 <초급>	11
🌀 도사 이날치 쌤의 도술같은 심샘	10
스윙키즈 1학기 초급/초중급 강습	9
안단테X유유 린디 루틴 프로젝트 <스윙투게더>	9
웨스트 코스트 스윙 - 새해맞이 무료강습	9
한보, 은댕_LindyLab Vol.2 "스윙아웃 피드백"	9
한보 & 은댕의 린디합 베이직	7
Jumpin’ at Istanbul	6
발보아 초급/초중급/중급 @사당	6
원포인트 팀원 모집합니다!	6
월요일 발보아 공부방	6
Busan Balboa Social	5
다이나믹 발보아 The Series 1월 (라디앙&소피아)	5
이화의 스위블 스타일링 1월 (1/23, 30_금)	5
한보의 JazzLab Vol.1 "리듬"	5
✨ B.B.D. (Busan Balboa Blues Day) ✨	4
스윙프렌즈 26년 1학기 강습 안내	4
이정 K-Pop Jazz 3종세트 : 여름안에서 / Supernatural / 청바지	4
조남매 리듬앤블루스 코레오 Vol.4	4
피에스타 목요일 소셜 / 7시부터	4
Solo Jazz Night 소셜 & 오픈클래스 '누구나 솔로재즈'	3
✨ 1월 31일 B.B.D. (Busan Balboa Blues Day) ✨	3
빅애플 놀금 파티 (소셜)	3
쉐그 초급 (드림발 49회)	3
에르난 & 단미 맞춤 워크샵	3
에어스텝 에이투지 2026년 1-2월 강습신청	3
테일&째의 All That Lindy 연습팀 신규 모집	3
한보 & 은댕의 린디합 베이직 : 린디랩 Vol.3 "풋웤 & 스타일링"	3
(토) BAT Social Time	2
경성밤마켓&쇼셜	2
다이니믹 발보아 - The Series - 2월 Fun Move	2
버니합 시즌12	2
스윙키즈 목요 정모	2
스윙키즈 일요정모	2
스윙프렌즈 부산 26년 1학기 강습 안내	2
일햅 DJ 시에나,달로	2
(토) BAT Social Time(DJ 뉴야)	1
(토) BAT Social Time(DJ 데미안)	1
11월 월간 빅애플 Live 3rd : 미리 크리스마스	1
1월 9일(금) Busan Balboa Social	1
Andy's K-Pop Jazz ('26.1~2월)	1
BG 4 Live Social party 경성홀	1
Baboa in Social Club	1
JOJE's Swivelossom - 12월 스위블 트레이닝	1
다이나믹 발보아 초급 - 라디앙&소피아	1
다이나믹 발보아 패턴&스타일링 (라디앙&소피아)	1
문탄+이화 Monthly Jazz 1월 (1/5_월 시작)	1
발보아 금요소셜	1
발보아 소셜 DJ 굿맨 드림발	1
발보아소셜 금요일엔드림발 DJ 투덜	1
부산 스윙프렌즈 26년 1학기 강습 안내	1
스윙스캔들 무료라인워크샵 <머스크랫 럼블>	1
안단테&조제 <Slow & Blues> 워크샵	1
이화의 Follower Training	1
일탐 DJ 든	1
조남매 의 리듬앤블루스 Vol.3	1
째의 솔로재즈 초중급	1
화경 DJ 스톰	1
`;

async function syncGAData() {
    const lines = rawData.trim().split('\n');
    const items = lines.map(line => {
        const parts = line.split('\t');
        return {
            title: parts[0].trim(),
            views: parseInt(parts[1]) || 0
        };
    });

    console.log(`📊 파싱 완료: ${items.length}개 항목\n`);

    for (const item of items) {
        if (!item.title || item.views === 0) continue;

        // 1. events 테이블에서 찾기
        const { data: eventData } = await supabase
            .from('events')
            .select('id, views')
            .eq('title', item.title);

        if (eventData && eventData.length > 0) {
            for (const ev of eventData) {
                if (item.views > (ev.views || 0)) {
                    await supabase.from('events').update({ views: item.views }).eq('id', ev.id);
                    console.log(`✅ [Events] '${item.title}' 업데이트: ${ev.views || 0} -> ${item.views}`);
                }
            }
            continue;
        }

        // 2. board_posts 테이블에서 찾기
        const { data: postData } = await supabase
            .from('board_posts')
            .select('id, views')
            .eq('title', item.title);

        if (postData && postData.length > 0) {
            for (const p of postData) {
                if (item.views > (p.views || 0)) {
                    await supabase.from('board_posts').update({ views: item.views }).eq('id', p.id);
                    console.log(`✅ [Posts] '${item.title}' 업데이트: ${p.views || 0} -> ${item.views}`);
                }
            }
            continue;
        }

        console.log(`⚠️  [Skip] '${item.title}' DB에서 찾을 수 없음`);
    }

    console.log('\n✨ 동기화 작업 완료');
}

syncGAData();
