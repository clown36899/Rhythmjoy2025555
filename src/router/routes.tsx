import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { MobileShell } from '../layouts/MobileShell';

// Lazy loading pages
const HomePage = lazy(() => import('../pages/home/page'));
const HomePageV2 = lazy(() => import('../pages/v2/Page'));
const SocialPage = lazy(() => import('../pages/social/page'));
const PracticePage = lazy(() => import('../pages/practice/page'));
const PracticeDetailPage = lazy(() => import('../pages/practice/detail/page'));
const BoardPage = lazy(() => import('../pages/board/page'));
const GuidePage = lazy(() => import('../pages/guide/page'));
const ShoppingPage = lazy(() => import('../pages/shopping/page'));
const BillboardPage = lazy(() => import('../pages/billboard/page'));

export const routes: RouteObject[] = [
    {
        element: <MobileShell />,
        children: [
            { path: '/', element: <Navigate to="/v2" replace /> },
            { path: '/v2', element: <HomePageV2 /> },
            { path: '/v1', element: <HomePage /> },
            { path: '/social', element: <SocialPage /> },
            { path: '/social/:placeId', element: <SocialPage /> },
            { path: '/practice', element: <PracticePage /> },
            { path: '/practice/:id', element: <PracticeDetailPage /> },
            { path: '/board', element: <BoardPage /> },
            { path: '/guide', element: <GuidePage /> },
            { path: '/shopping', element: <ShoppingPage /> },
        ],
    },
    {
        path: '/billboard/:userId',
        element: <BillboardPage />,
    },
];
