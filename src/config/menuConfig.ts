// 사이트 메뉴 구조 정의 (navigation.ts 기준)
export interface MenuItem {
    icon: string;
    title: string;
    desc: string;
    path: string;
    type: 'home' | 'social' | 'calendar' | 'practice' | 'shopping' | 'board' | 'library' | 'personal' | 'events' | 'forum' | 'places' | 'default';
}

export interface MenuSection {
    title: string;
    items: MenuItem[];
}

// 실제 네비게이션 구조 기반 메뉴 (navigation.ts 순서 그대로)
export const SITE_MENU_SECTIONS: MenuSection[] = [
    {
        title: "내 공간 (Personal)",
        items: [
            { icon: 'ri-heart-3-fill', title: '내 즐겨찾기', desc: '내가 찜한 행사/게시글 모아보기', path: '/?view=favorites', type: 'personal' },
            { icon: 'ri-history-line', title: '내 활동', desc: '내가 등록한 콘텐츠 관리', path: '/my-activities', type: 'personal' },
        ]
    },
    {
        title: "메인 서비스 (Service)",
        items: [
            { icon: 'ri-ticket-line', title: '홈', desc: '이벤트 및 강습 모아보기', path: '/', type: 'home' },
            { icon: 'ri-calendar-event-line', title: '전체달력', desc: '월별 전체 일정 달력', path: '/calendar', type: 'calendar' },
            { icon: 'ri-chat-3-line', title: '포럼', desc: '게시판 (공지/자유/익명 등)', path: '/board', type: 'board' },
            { icon: 'ri-map-pin-line', title: '소셜', desc: '소셜 파티 및 행사 정보', path: '/social', type: 'social' },
            { icon: 'ri-shopping-bag-line', title: '쇼핑', desc: '댄스 관련 상품 쇼핑', path: '/shopping', type: 'shopping' },
            { icon: 'ri-information-line', title: '안내', desc: '사이트 이용 방법', path: '/guide', type: 'default' },
        ]
    }
];

// 햄버거 드로어 전용 메뉴. /map 사이트맵 구조는 SITE_MENU_SECTIONS로 유지한다.
export const HAMBURGER_MENU_SECTIONS: MenuSection[] = [
    SITE_MENU_SECTIONS[0],
    {
        title: "메인 서비스 (Service)",
        items: [
            { icon: 'ri-ticket-line', title: '홈', desc: '오늘의 일정과 주요 콘텐츠', path: '/', type: 'home' },
            { icon: 'ri-calendar-event-line', title: '댄스이벤트 캘린더', desc: '월별 전체 일정 달력', path: '/calendar', type: 'calendar' },
            { icon: 'ri-book-open-line', title: '강습&행사', desc: '행사·외강·동호회 강습 모아보기', path: '/events', type: 'events' },
            { icon: 'ri-map-pin-line', title: '소셜', desc: '소셜 파티 및 정기 모임', path: '/social', type: 'social' },
            { icon: 'ri-map-pin-2-line', title: '장소 지도', desc: '연습실·스윙바·모임 장소', path: '/places', type: 'places' },
            { icon: 'ri-shopping-bag-line', title: '쇼핑', desc: '댄스 관련 상품 쇼핑', path: '/shopping', type: 'shopping' },
            { icon: 'ri-chat-3-line', title: '포럼', desc: '자료·링크·연습 도구 허브', path: '/forum', type: 'forum' },
            { icon: 'ri-discuss-line', title: '자유게시판', desc: '공지·자유·익명 게시판', path: '/board', type: 'board' },
            { icon: 'ri-information-line', title: '안내', desc: '사이트 이용 방법', path: '/guide', type: 'default' },
        ]
    }
];

// 영문 레이블 매핑
export const MENU_LABELS_EN: Record<string, string> = {
    '홈': 'Main',
    '전체달력': 'Calendar',
    '댄스이벤트 캘린더': 'Calendar',
    '강습&행사': 'Lessons & Events',
    '포럼': 'Forum',
    '자유게시판': 'Board',
    '소셜': 'Social',
    '장소 지도': 'Places',
    '쇼핑': 'Shop',
    '안내': 'Guide',
    '내 즐겨찾기': 'Favorites',
    '내 활동': 'My Activities',
};
