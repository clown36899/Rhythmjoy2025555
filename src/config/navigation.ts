export interface NavigationItem {
    label: string;
    labelEn: string;
    path: string;
    icon: string;
    iconFilled: string; // Filled version for active state
    activeColor: string;
    badge?: string;
    action?: string; // Optional action to trigger
}

export const NAVIGATION_ITEMS: NavigationItem[] = [

    {
        label: '홈',
        labelEn: 'Main',
        path: '/v2',
        icon: 'ri-ticket-line',
        iconFilled: 'ri-ticket-fill',
        activeColor: 'text-red-500',
    },
    {
        label: '전체달력',
        labelEn: 'Calendar',
        path: '/calendar',
        icon: 'ri-calendar-event-line',
        iconFilled: 'ri-calendar-event-fill',
        activeColor: 'text-orange-500',
    },
    {
        label: '포럼',
        labelEn: 'Forum',
        path: '/board',
        icon: 'ri-chat-3-line',
        iconFilled: 'ri-chat-3-fill',
        activeColor: 'text-purple-500',
    },
    {
        label: '소셜 /동호회',
        labelEn: 'Social',
        path: '/social',
        icon: 'ri-map-pin-line',
        iconFilled: 'ri-map-pin-fill',
        activeColor: 'text-green-500',
    },

    {
        label: '쇼핑',
        labelEn: 'Shop',
        path: '/shopping',
        icon: 'ri-shopping-bag-line',
        iconFilled: 'ri-shopping-bag-fill',
        activeColor: 'text-yellow-500',
    },
    {
        label: '안내',
        labelEn: 'Guide',
        path: '/guide',
        icon: 'ri-information-line',
        iconFilled: 'ri-information-fill',
        activeColor: 'text-blue-500',
    },
];
