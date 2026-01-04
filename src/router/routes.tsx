import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import { MobileShell } from '../layouts/MobileShell';

import {
    prefetchHomePageV2,
    prefetchSocialPage,
    prefetchPracticePage,
    prefetchBoardPage,
    prefetchBoardDetailPage,
    prefetchGuidePage,
    prefetchShoppingPage,
    prefetchBillboardPage,
    prefetchPrivacyPage,
    prefetchCalendarPage,
    prefetchHistoryTimelinePage
} from './prefetch';

// Lazy loading pages
// Prefetch functions moved to prefetch.ts
const HomePageV2 = lazy(prefetchHomePageV2);

const SocialPage = lazy(prefetchSocialPage);

const PracticePage = lazy(prefetchPracticePage);

const PracticeRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/practice?id=${id}`} replace />;
};

const BoardPage = lazy(prefetchBoardPage);

const BoardDetailPage = lazy(prefetchBoardDetailPage);

const GuidePage = lazy(prefetchGuidePage);

const ShoppingPage = lazy(prefetchShoppingPage);

const BillboardPage = lazy(prefetchBillboardPage);

const PrivacyPage = lazy(prefetchPrivacyPage);

const CalendarPage = lazy(prefetchCalendarPage);

const SecureMembersPage = lazy(() => import("../pages/admin/secure-members/page"));
const AdminFavoritesPage = lazy(() => import("../pages/admin/favorites/page"));
const KakaoCallbackPage = lazy(() => import("../pages/auth/kakao-callback/page"));
const EventPhotoFinderPage = lazy(() => import("../pages/event-photo-finder/page"));
const MyActivitiesPage = lazy(() => import('../pages/user/MyActivitiesPage'));
const DebugLogPage = lazy(() => import('../pages/DebugLogPage'));

const HistoryTimelinePage = lazy(prefetchHistoryTimelinePage);
const ArchiveLayout = lazy(() => import('../layouts/ArchiveLayout'));
const LearningPage = lazy(() => import('../pages/learning/Page'));
const LearningDetailPage = lazy(() => import('../pages/learning/detail/Page'));

const PushNotificationTestPage = lazy(() => import('../pages/PushNotificationTestPage'));
const TestDeletePage = lazy(() => import('../pages/TestDeletePage'));



// Prefetches removed from here as they are moved up


export const routes: RouteObject[] = [
    {
        element: <MobileShell />,
        children: [
            { path: "admin/secure-members", element: <SecureMembersPage />, },
            { path: "admin/favorites", element: <AdminFavoritesPage />, },
            { path: '/', element: <Navigate to="/v2" replace /> },
            { path: '/v2', element: <HomePageV2 /> },
            { path: '/social', element: <SocialPage /> },
            { path: '/social/:placeId', element: <SocialPage /> },
            { path: '/practice', element: <PracticePage /> },
            { path: '/practice/:id', element: <PracticeRedirect /> },
            { path: '/board', element: <BoardPage /> },
            { path: '/board/:id', element: <BoardDetailPage /> },
            { path: '/guide', element: <GuidePage /> },
            { path: '/shopping', element: <ShoppingPage /> },
            { path: '/privacy', element: <PrivacyPage /> },
            { path: '/calendar', element: <CalendarPage /> },
            { path: '/auth/kakao-callback', element: <KakaoCallbackPage /> },
            { path: '/my-activities', element: <MyActivitiesPage /> },
            { path: '/debug', element: <DebugLogPage /> },
            { path: '/push-test', element: <PushNotificationTestPage /> },
            { path: '/test-delete', element: <TestDeletePage /> },
            {
                element: <ArchiveLayout />,
                children: [
                    { path: '/learning', element: <LearningPage /> },
                    { path: '/learning/:listId', element: <LearningDetailPage /> },
                    { path: '/history', element: <HistoryTimelinePage /> },
                ]
            }
        ],
    },
    {
        path: '/billboard/:userId',
        element: <BillboardPage />,
    },
    {
        path: '/event-photo-finder',
        element: <EventPhotoFinderPage />,
    },
];
