// 사이트 메뉴 구조 정의 (navigation.ts 기준)
export interface MenuItem {
    icon: string;
    title: string;
    desc: string;
    path: string;
    type: 'home' | 'social' | 'calendar' | 'practice' | 'shopping' | 'board' | 'library' | 'personal' | 'default';
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
            { icon: 'ri-ticket-line', title: '홈', desc: '이벤트 및 강습 모아보기', path: '/v2', type: 'home' },
            { icon: 'ri-calendar-event-line', title: '전체달력', desc: '월별 전체 일정 달력', path: '/calendar', type: 'calendar' },
            { icon: 'ri-chat-3-line', title: '포럼', desc: '게시판 (공지/자유/익명 등)', path: '/board', type: 'board' },
            { icon: 'ri-map-pin-line', title: '소셜', desc: '소셜 파티 및 행사 정보', path: '/social', type: 'social' },
            { icon: 'ri-shopping-bag-line', title: '쇼핑', desc: '댄스 관련 상품 쇼핑', path: '/shopping', type: 'shopping' },
            { icon: 'ri-information-line', title: '안내', desc: '사이트 이용 방법', path: '/guide', type: 'default' },
        ]
    }
];

// 영문 레이블 매핑
export const MENU_LABELS_EN: Record<string, string> = {
    '홈': 'Main',
    '전체달력': 'Calendar',
    '포럼': 'Forum',
    '소셜': 'Social',
    '쇼핑': 'Shop',
    '안내': 'Guide',
    '내 즐겨찾기': 'Favorites',
    '내 활동': 'My Activities',
};
