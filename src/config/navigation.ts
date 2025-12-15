export interface NavigationItem {
    label: string;
    path: string;
    icon: string;
    activeColor: string;
    badge?: string;
    action?: string; // Optional action to trigger
}

export const NAVIGATION_ITEMS: NavigationItem[] = [

    {
        label: '이벤트',
        path: '/v2',
        icon: 'ri-ticket-line',
        activeColor: 'text-red-500',
    },
    {
        label: '전체달력',
        path: '/calendar',
        icon: 'ri-calendar-event-fill',
        activeColor: 'text-orange-500',
    },
    {
        label: '소셜',
        path: '/social',
        icon: 'ri-map-pin-line',
        activeColor: 'text-green-500',
    },
    {
        label: '연습실',
        path: '/practice',
        icon: 'ri-music-2-line',
        activeColor: 'text-blue-500',
    },
    {
        label: '쇼핑',
        path: '/shopping',
        icon: 'ri-shopping-bag-line',
        activeColor: 'text-yellow-500',
    },
    {
        label: '자유게시판',
        path: '/board',
        icon: 'ri-chat-3-line',
        activeColor: 'text-purple-500',
    },
    {
        label: '안내',
        path: '/guide',
        icon: 'ri-information-line',
        activeColor: 'text-blue-500',
    },
];
