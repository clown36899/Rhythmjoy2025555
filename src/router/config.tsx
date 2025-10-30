import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import BillboardPage from "../pages/billboard/page";
import PracticeRoomsPage from "../pages/practice/page";
import GuidePage from "../pages/guide/page";
import { MobileShell } from "../layouts/MobileShell";

const routes: RouteObject[] = [
  {
    path: "/billboard/:userId",
    element: <BillboardPage />,
  },
  {
    path: "/",
    element: <MobileShell />,
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        path: "practice",
        element: <PracticeRoomsPage />,
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
