import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate, useParams } from 'react-router-dom';
import { MobileShell } from '../layouts/MobileShell';

// Lazy loading pages
export const prefetchHomePageV2 = () => import('../pages/v2/Page');
const HomePageV2 = lazy(prefetchHomePageV2);

export const prefetchSocialPage = () => import('../pages/social/page');
const SocialPage = lazy(prefetchSocialPage);

export const prefetchPracticePage = () => import('../pages/practice/page');
const PracticePage = lazy(prefetchPracticePage);

const PracticeRedirect = () => {
    const { id } = useParams();
    return <Navigate to={`/practice?id=${id}`} replace />;
};

export const prefetchBoardPage = () => import('../pages/board/BoardMainContainer');
const BoardPage = lazy(prefetchBoardPage);

export const prefetchBoardDetailPage = () => import('../pages/board/detail/page');
const BoardDetailPage = lazy(prefetchBoardDetailPage);

export const prefetchGuidePage = () => import('../pages/guide/page');
const GuidePage = lazy(prefetchGuidePage);

export const prefetchShoppingPage = () => import('../pages/shopping/page');
const ShoppingPage = lazy(prefetchShoppingPage);

export const prefetchBillboardPage = () => import('../pages/billboard/page');
const BillboardPage = lazy(prefetchBillboardPage);

export const prefetchPrivacyPage = () => import('../pages/privacy/page');
const PrivacyPage = lazy(prefetchPrivacyPage);

export const prefetchCalendarPage = () => import('../pages/calendar/page');
const CalendarPage = lazy(prefetchCalendarPage);

const SecureMembersPage = lazy(() => import("../pages/admin/secure-members/page"));
const AdminFavoritesPage = lazy(() => import("../pages/admin/favorites/page"));
const KakaoCallbackPage = lazy(() => import("../pages/auth/kakao-callback/page"));
const EventPhotoFinderPage = lazy(() => import("../pages/event-photo-finder/page"));
const MyActivitiesPage = lazy(() => import('../pages/user/MyActivitiesPage'));
const DebugLogPage = lazy(() => import('../pages/DebugLogPage'));

export const prefetchHistoryTimelinePage = () => import('../pages/history/HistoryTimelinePage');
const HistoryTimelinePage = lazy(prefetchHistoryTimelinePage);

const PushNotificationTestPage = lazy(() => import('../pages/PushNotificationTestPage'));
const TestDeletePage = lazy(() => import('../pages/TestDeletePage'));



export const prefetchLearningPage = () => import('../pages/learning/Page');
const LearningPage = lazy(prefetchLearningPage);
const LearningDetailPage = lazy(() => import('../pages/learning/detail/Page'));
const LearningLayout = lazy(() => import('../layouts/LearningLayout'));


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
            { path: '/history', element: <HistoryTimelinePage /> },
            { path: '/push-test', element: <PushNotificationTestPage /> },
            { path: '/test-delete', element: <TestDeletePage /> },
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
    {
        element: <LearningLayout />,
        children: [
            {
                path: '/learning',
                element: <LearningPage />,
            },
            {
                path: '/learning/:listId',
                element: <LearningDetailPage />,
            },
        ]
    }

];
