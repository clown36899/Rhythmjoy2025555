import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import BillboardPage from "../pages/billboard/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/billboard/:userId",
    element: <BillboardPage />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;
