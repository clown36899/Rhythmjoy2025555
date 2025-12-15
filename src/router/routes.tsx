import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { MobileShell } from '../layouts/MobileShell';

// Lazy loading pages
export const prefetchHomePageV2 = () => import('../pages/v2/Page');
const HomePageV2 = lazy(prefetchHomePageV2);

export const prefetchSocialPage = () => import('../pages/social/page');
const SocialPage = lazy(prefetchSocialPage);

export const prefetchPracticePage = () => import('../pages/practice/page');
const PracticePage = lazy(prefetchPracticePage);

export const prefetchPracticeDetailPage = () => import('../pages/practice/detail/page');
const PracticeDetailPage = lazy(prefetchPracticeDetailPage);

export const prefetchBoardPage = () => import('../pages/board/page');
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

export const routes: RouteObject[] = [
    {
        element: <MobileShell />,
        children: [
            { path: '/', element: <Navigate to="/v2" replace /> },
            { path: '/v2', element: <HomePageV2 /> },
            { path: '/social', element: <SocialPage /> },
            { path: '/social/:placeId', element: <SocialPage /> },
            { path: '/practice', element: <PracticePage /> },
            { path: '/practice/:id', element: <PracticeDetailPage /> },
            { path: '/board', element: <BoardPage /> },
            { path: '/board/:id', element: <BoardDetailPage /> },
            { path: '/guide', element: <GuidePage /> },
            { path: '/shopping', element: <ShoppingPage /> },
            { path: '/privacy', element: <PrivacyPage /> },
        ],
    },
    {
        path: '/billboard/:userId',
        element: <BillboardPage />,
    },
];
