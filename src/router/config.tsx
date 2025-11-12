import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import BillboardPage from "../pages/billboard/page";
import PracticeRoomsPage from "../pages/practice/page";
import GuidePage from "../pages/guide/page";
import ClubsPage from "../pages/social/clubs/page";
import SwingBarsPage from "../pages/social/swing-bars/page";
import SocialCalendarPage from "../pages/social/calendar/page";
import BoardPage from "../pages/board/page";
import InvitePage from "../pages/invite/page";
import { MobileShell } from "../layouts/MobileShell";
import { AuthProvider } from "../contexts/AuthContext";

const routes: RouteObject[] = [
  {
    path: "/billboard/:userId",
    element: <BillboardPage />,
  },
  {
    path: "/invite/:token",
    element: <InvitePage />,
  },
  {
    path: "/",
    element: (
      <AuthProvider>
        <MobileShell />
      </AuthProvider>
    ),
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "social",
        element: <Navigate to="/social/calendar" replace />,
      },
      {
        path: "social/clubs",
        element: <ClubsPage />,
      },
      {
        path: "social/swing-bars",
        element: <SwingBarsPage />,
      },
      {
        path: "social/calendar",
        element: <SocialCalendarPage />,
      },
      {
        path: "practice",
        element: <PracticeRoomsPage />,
      },
      {
        path: "board",
        element: <BoardPage />,
      },
      {
        path: "guide",
        element: <GuidePage />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
