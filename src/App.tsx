import { Routes, Route } from "react-router-dom";
import { MobileShell } from "./layouts/MobileShell";
import HomePage from "./pages/home/page";
import SocialPage from "./pages/social/page";
import PracticePage from "./pages/practice/page";
import BoardPage from "./pages/board/page";
import GuidePage from "./pages/guide/page";
import ShoppingPage from "./pages/shopping/page"; // 1. 새로 만든 쇼핑 페이지를 임포트합니다.
import BillboardPage from "./pages/billboard/page";
import ShoppingRegisterPage from "./pages/shopping/register/page"; // 쇼핑몰 등록 페이지 임포트

function App() {
  return (
    <Routes>
      <Route element={<MobileShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/social" element={<SocialPage />} />
        <Route path="/social/:placeId" element={<SocialPage />} />
        <Route path="/practice" element={<PracticePage />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/guide" element={<GuidePage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/shopping/register" element={<ShoppingRegisterPage />} /> {/* 쇼핑몰 등록 페이지 경로 추가 */}
      </Route>
      <Route path="/billboard/:userId" element={<BillboardPage />} />
    </Routes>
  );
}

export default App;
