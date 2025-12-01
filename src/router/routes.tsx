import { lazy } from 'react';
import type { RouteObject } from 'react-router-dom';
import { MobileShell } from '../layouts/MobileShell';

// Lazy loading pages
const HomePage = lazy(() => import('../pages/home/page'));
const SocialPage = lazy(() => import('../pages/social/page'));
const PracticePage = lazy(() => import('../pages/practice/page'));
const BoardPage = lazy(() => import('../pages/board/page'));
const GuidePage = lazy(() => import('../pages/guide/page'));
const ShoppingPage = lazy(() => import('../pages/shopping/page'));
const ShoppingRegisterPage = lazy(() => import('../pages/shopping/register/page'));
const BillboardPage = lazy(() => import('../pages/billboard/page'));

export const routes: RouteObject[] = [
    {
        element: <MobileShell />,
        children: [
            { path: '/', element: <HomePage /> },
            { path: '/social', element: <SocialPage /> },
            { path: '/social/:placeId', element: <SocialPage /> },
            { path: '/practice', element: <PracticePage /> },
            { path: '/board', element: <BoardPage /> },
            { path: '/guide', element: <GuidePage /> },
            { path: '/shopping', element: <ShoppingPage /> },
            { path: '/shopping/register', element: <ShoppingRegisterPage /> },
        ],
    },
    {
        path: '/billboard/:userId',
        element: <BillboardPage />,
    },
];
