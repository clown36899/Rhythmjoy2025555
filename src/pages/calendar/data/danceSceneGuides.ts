import type { CalendarGenreScope } from '../utils/calendarGenrePage';

interface SceneSource {
    name: string;
    area: string;
    kind: string;
    description: string;
    url: string;
    linkLabel?: string;
    note?: string;
}

interface SceneOverview {
    title: string;
    description: string;
}

export interface DanceSceneGuideContent {
    title: string;
    introduction: string;
    reviewedAt: string;
    places: SceneSource[];
    learning: SceneSource[];
    overview: SceneOverview[];
    discover: SceneSource[];
}

// Editorial content only. Event records and collection-source ownership remain
// in the existing event API and ingestion registry. Evidence and limitations:
// docs/salsa-scene-research-2026-09-10.md
export const danceSceneGuides: Partial<Record<CalendarGenreScope, DanceSceneGuideContent>> = {
    salsa: {
        title: '살사, 어디서 시작할까요?',
        introduction: '춤추는 공간부터 함께 배울 모임까지. 살사 씬을 둘러보고, 각 공간과 모임의 공지를 직접 확인해 보세요.',
        reviewedAt: '2026.09.10',
        places: [
            { name: '강남 라틴', area: '강남', kind: '라틴바', description: '소셜과 클래스, 파티가 열리는 공간. 홀마다 살사·바차타 음악 구성이 달라 공지를 확인하면 좋아요.', url: 'https://www.instagram.com/latin_gangnam/', note: '공식 프로필·최근 공지 확인' },
            { name: '보니따', area: '홍대', kind: '라틴클럽', description: '소셜, 라틴 클래스와 파티를 함께 안내하는 홍대의 라틴클럽.', url: 'https://www.instagram.com/jessica_latinclub_bonita/', note: '공식 프로필 확인' },
            { name: '턴', area: '강남', kind: '라틴클럽', description: '강남의 소셜 장소로 소개된 클럽. 방문할 날짜의 운영과 음악 구성은 연결된 공지에서 확인하세요.', url: 'https://www.instagram.com/turn_latinclub_no.1/', note: '서울 소셜 안내에서 연결 · 최신 공지 확인 필요' },
            { name: '홍턴', area: '홍대', kind: '라틴클럽', description: '홍대 소셜 장소로 소개된 클럽. 파티와 휴무 여부를 공지 채널에서 확인하세요.', url: 'https://www.instagram.com/latinsnl2040/', note: '서울 소셜 안내에서 연결 · 최신 공지 확인 필요' },
            { name: '부에나', area: '홍대', kind: '라틴바', description: '홍대의 소셜 공간. 살사·바차타와 수업 안내가 함께 있으니 프로그램을 확인해 보세요.', url: 'https://www.instagram.com/buenabar7/', note: '서울 소셜 안내에서 연결 · 최신 공지 확인 필요' },
        ],
        learning: [
            { name: 'JDC', area: '강남', kind: '스튜디오 · 강습', description: 'On1 살사와 바차타 강습, 수업 후 소셜을 함께 안내합니다. 영어로 진행하는 수업도 있어요.', url: 'https://www.meetup.com/ko-kr/seoul-latin-dance-salsa-bachata-jhonatan-jimenez/', linkLabel: '모임·강습 목록 보기' },
            { name: '에버라틴', area: '서울', kind: '동호회 · 학원', description: '동호회 활동과 학원 강습을 함께 운영합니다. 살사 입문 과정과 모집 공지를 살펴보세요.', url: 'https://everlatin.com/category/살사댄스/24/', linkLabel: '살사 강습 목록 보기', note: '현재 개강일은 모집 공지에서 확인' },
            { name: 'SA', area: '서울', kind: '동호회', description: '살사·바차타 커뮤니티. 공식 안내에서 동호회 카페와 모집 채널로 연결됩니다.', url: 'https://linktr.ee/sa.latin.official', linkLabel: '동호회 안내 보기', note: '현재 모집 여부는 원본에서 확인' },
        ],
        overview: [
            { title: '살사바 · 소셜', description: '음악에 맞춰 자유롭게 춤추는 공간이에요. 살사와 바차타가 함께 나오는 곳도 있고, 요일과 홀에 따라 음악 구성이 달라요.' },
            { title: '동호회 · 커뮤니티', description: '기수별 입문 강습, 연습과 정모가 연결됩니다. 같은 모임이 여러 바를 이용하기도 하므로 모임 이름과 장소를 함께 확인해요.' },
            { title: '학원 · 강사', description: '기초부터 스타일별 수업까지 배울 수 있어요. 동호회와 학원이 함께 운영되기도 하고, 수업 뒤 소셜로 이어지는 과정도 있습니다.' },
        ],
        discover: [
            { name: 'Latin in Seoul', area: '서울', kind: '소셜 안내', description: '서울의 바와 주간 소셜을 둘러보는 안내입니다. 업데이트가 늦을 수 있으니 게시 날짜를 확인하세요.', url: 'https://salsa.atoo.kr/', linkLabel: '서울 소셜 안내 보기' },
            { name: '전국 라틴 동호회', area: '전국', kind: '지역별 모임', description: '부산, 인천·경기, 대구, 대전, 광주, 원주, 제주 등 지역별 모임을 찾아보세요. 각 모임의 현재 운영 여부는 별도 확인이 필요해요.', url: 'https://latindance.kr/clubs', linkLabel: '지역별 동호회 찾기' },
            { name: '댄스인포', area: '전국', kind: '강습 · 행사 안내', description: '지역별 강습과 소셜을 모아볼 수 있어요. 여러 장르가 섞여 있으니 장르와 주최자의 원본 공지를 함께 확인하세요.', url: 'https://danceinfo.net/lessons', linkLabel: '강습·소셜 둘러보기' },
            { name: 'SIDF', area: '국내', kind: '살사 페스티벌', description: '워크숍, 공연과 소셜이 함께하는 페스티벌. 행사 연도별 일정과 프로그램은 공식 사이트에서 확인하세요.', url: 'https://sidf.kr/', linkLabel: '페스티벌 공식 사이트' },
        ],
    },
    swing: {
        title: '함께 춤추는 스윙 씬',
        introduction: '캘린더에서 일정을 보고, 소셜과 강습 게시판에서 원본 공지를 확인하세요.',
        reviewedAt: '2026.09.10',
        places: [
            { name: '사보이 · 스윙스캔들', area: '서울', kind: '소셜 공지', description: '사보이에서 열리는 소셜의 공지를 게시판에서 확인하세요.', url: 'https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I' },
            { name: '봉천살롱 · 스윙타운', area: '서울', kind: '소셜 공지', description: '스윙타운 화요일·토요일 소셜 DJ 공지를 확인하세요.', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/264?viewType=L' },
        ],
        learning: [{ name: '스윙타운 강습 게시판', area: '서울', kind: '강습 공지', description: '신규 강습 모집과 개강 안내를 원본 게시판에서 확인하세요.', url: 'https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L', linkLabel: '강습 게시판 보기' }],
        overview: [],
        discover: [],
    },
};
