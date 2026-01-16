import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";
import NotFound from "../pages/NotFound";
import BillboardPage from "../pages/billboard/page";
import InvitePage from "../pages/invite/page";
import { MobileShell } from "../layouts/MobileShell";
import { AuthProvider } from "../contexts/AuthContext";
import HomeV2 from "../pages/v2/Page";
import PracticeRoomsPage from "../pages/practice/page";
import GuidePage from "../pages/guide/page";
import SocialCalendarPage from "../pages/social/calendar/page";
import BoardPage from "../pages/board/page";
import MainV2TestPage from "../pages/test/MainV2TestPage";

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
        element: <HomeV2 />,
      },
      {
        path: "social",
        element: <Navigate to="/social/calendar" replace />,
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
      {
        path: "main-v2-test",
        element: <MainV2TestPage />,
      },
      {
        path: "test/main-v2",
        element: <MainV2TestPage />,
      },
    ],
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
