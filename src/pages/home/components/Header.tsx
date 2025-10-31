import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCodeModal from "../../../components/QRCodeModal";
import BillboardUserManagementModal from "../../../components/BillboardUserManagementModal";
import DefaultThumbnailSettingsModal from "../../../components/DefaultThumbnailSettingsModal";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";

interface HeaderProps {
  currentMonth?: Date;
  onNavigateMonth?: (direction: "prev" | "next") => void;
  onDateChange?: (date: Date) => void;
  onAdminModeToggle?: (
    isAdmin: boolean,
    type?: "super" | "sub" | null,
    userId?: string | null,
    userName?: string,
  ) => void;
  onBillboardOpen?: () => void;
  onBillboardSettingsOpen?: () => void;
  viewMode?: "month" | "year";
  onViewModeChange?: (mode: "month" | "year") => void;
  billboardEnabled?: boolean;
}

export default function Header({
  currentMonth,
  onNavigateMonth,
  onDateChange,
  onAdminModeToggle,
  onBillboardOpen,
  onBillboardSettingsOpen,
  viewMode = "month",
  onViewModeChange,
  billboardEnabled = true,
}: HeaderProps) {
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    currentMonth?.getFullYear() || new Date().getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    currentMonth?.getMonth() || new Date().getMonth(),
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [loginType, setLoginType] = useState<"super" | "sub">("super");
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  
  const { isAdmin, signIn, signOut } = useAuth();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showBillboardUserManagement, setShowBillboardUserManagement] =
    useState(false);
  const [showDefaultThumbnailSettings, setShowDefaultThumbnailSettings] =
    useState(false);
  const [themeColors, setThemeColors] = useState({
    background_color: "#000000",
    header_bg_color: "#1f2937",
    calendar_bg_color: "#111827",
    event_list_bg_color: "#1f2937",
    event_list_outer_bg_color: "#1f2937",
    page_bg_color: "#111827",
  });

  const monthNames = [
    "1월",
    "2월",
    "3월",
    "4월",
    "5월",
    "6월",
    "7월",
    "8월",
    "9월",
    "10월",
    "11월",
    "12월",
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  const handleDateModalOpen = () => {
    if (currentMonth) {
      setSelectedYear(currentMonth.getFullYear());
      setSelectedMonth(currentMonth.getMonth());
    }
    setShowDateModal(true);
  };

  const handleDateConfirm = () => {
    const newDate = new Date(selectedYear, selectedMonth, 1);
    onDateChange?.(newDate);
    setShowDateModal(false);
  };

  const handleDateCancel = () => {
    setShowDateModal(false);
  };

  const handleNavigateMonth = (direction: "prev" | "next") => {
    onNavigateMonth?.(direction);
  };

  const handleTodayClick = () => {
    const today = new Date();
    onDateChange?.(today);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleAdminLogin = async () => {
    if (loginType === "super") {
      // 슈퍼 관리자: Supabase Auth 이메일/비밀번호 로그인
      try {
        await signIn(adminEmail, adminPassword);
        onAdminModeToggle?.(true, "super", null, "");
        setShowSettingsModal(false);
        setAdminEmail("");
        setAdminPassword("");
        alert("슈퍼 관리자 로그인 성공!");
      } catch (error: any) {
        console.error("로그인 오류:", error);
        alert(error.message || "이메일 또는 비밀번호가 올바르지 않습니다.");
      }
    } else {
      // 서브 관리자(빌보드 사용자): 기존 방식 유지
      try {
        const { data: users, error } = await supabase
          .from("billboard_users")
          .select("*")
          .eq("is_active", true);

        if (error) throw error;

        for (const user of users || []) {
          const { verifyPassword } = await import("../../../utils/passwordHash");
          const isValid = await verifyPassword(adminPassword, user.password_hash);

          if (isValid) {
            setBillboardUserId(user.id);
            setBillboardUserName(user.name);
            onAdminModeToggle?.(true, "sub", user.id, user.name);
            setAdminPassword("");
            alert(`${user.name} 빌보드 관리자 로그인 성공!`);
            return;
          }
        }

        alert("비밀번호가 올바르지 않습니다.");
      } catch (error) {
        console.error("로그인 오류:", error);
        alert("로그인 중 오류가 발생했습니다.");
      }
    }
  };

  const handleAdminLogout = async () => {
    try {
      await signOut();
      setBillboardUserId(null);
      setBillboardUserName("");
      onAdminModeToggle?.(false, null, null, "");
      setShowSettingsModal(false);
      alert("로그아웃되었습니다.");
    } catch (error) {
      console.error("로그아웃 오류:", error);
    }
  };

  // 색상 설정 불러오기
  const loadThemeColors = async () => {
    try {
      const { data, error } = await supabase
        .from("theme_settings")
        .select("*")
        .eq("id", 1)
        .single();

      // 테이블이 없거나 데이터가 없으면 기본값 사용
      if (error) {
        return;
      }

      if (data) {
        setThemeColors({
          background_color: data.background_color,
          header_bg_color: data.header_bg_color || "#1f2937",
          calendar_bg_color: data.calendar_bg_color,
          event_list_bg_color: data.event_list_bg_color,
          event_list_outer_bg_color: data.event_list_outer_bg_color,
          page_bg_color: data.page_bg_color || "#111827",
        });

        // CSS 변수 업데이트
        document.documentElement.style.setProperty(
          "--bg-color",
          data.background_color,
        );
        document.documentElement.style.setProperty(
          "--header-bg-color",
          data.header_bg_color || "#1f2937",
        );
        document.documentElement.style.setProperty(
          "--calendar-bg-color",
          data.calendar_bg_color,
        );
        document.documentElement.style.setProperty(
          "--event-list-bg-color",
          data.event_list_bg_color,
        );
        document.documentElement.style.setProperty(
          "--event-list-outer-bg-color",
          data.event_list_outer_bg_color,
        );
        document.documentElement.style.setProperty(
          "--page-bg-color",
          data.page_bg_color || "#111827",
        );
      }
    } catch (err) {
      // 기본 색상 사용
    }
  };

  // 색상 저장
  const saveThemeColor = async (colorType: string, color: string) => {
    try {
      const { error } = await supabase
        .from("theme_settings")
        .update({
          [colorType]: color,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) {
        console.error("색상 저장 오류:", error);
        return;
      }

      // 로컬 상태 업데이트
      setThemeColors((prev) => ({
        ...prev,
        [colorType]: color,
      }));

      // CSS 변수 업데이트
      const cssVarMap: { [key: string]: string } = {
        background_color: "--bg-color",
        header_bg_color: "--header-bg-color",
        calendar_bg_color: "--calendar-bg-color",
        event_list_bg_color: "--event-list-bg-color",
        event_list_outer_bg_color: "--event-list-outer-bg-color",
        page_bg_color: "--page-bg-color",
      };

      document.documentElement.style.setProperty(cssVarMap[colorType], color);
    } catch (err) {
      console.error("색상 저장 실패:", err);
    }
  };

  // 초기 색상 불러오기
  useEffect(() => {
    loadThemeColors();

    // 서브 관리자가 빌보드 설정 창을 닫으면 설정 모달 다시 열기
    const handleReopenSettings = () => {
      if (billboardUserId !== null) {
        setShowSettingsModal(true);
      }
    };

    window.addEventListener("reopenAdminSettings", handleReopenSettings);

    return () => {
      window.removeEventListener("reopenAdminSettings", handleReopenSettings);
    };
  }, [billboardUserId]);

  return (
    <>
      <header
        className="border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-12">
            <div className="flex items-center space-x-8">
              <button
                onClick={() => {
                  const categoryPanel = document.querySelector(
                    "[data-category-panel]",
                  );
                  const footer = document.querySelector("footer");

                  if (categoryPanel && footer) {
                    const categoryPanelRect =
                      categoryPanel.getBoundingClientRect();
                    const footerRect = footer.getBoundingClientRect();
                    const currentScrollY = window.scrollY;

                    // 푸터 상단이 카테고리 패널 하단에 오도록 스크롤 위치 계산
                    const targetScrollY =
                      currentScrollY +
                      footerRect.top -
                      categoryPanelRect.bottom;

                    window.scrollTo({
                      top: targetScrollY,
                      behavior: "smooth",
                    });
                  }
                }}
                className="flex items-center justify-center cursor-pointer group"
              >
                <img 
                  src="/dangong-logo.png" 
                  alt="DANGONG Logo" 
                  className="h-12 w-12 transition-transform group-hover:scale-105"
                />
              </button>
            </div>

            {/* Calendar Controls - Center */}
            {currentMonth && onNavigateMonth && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleNavigateMonth("prev")}
                  className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-arrow-left-s-line text-lg"></i>
                </button>
                <button
                  onClick={handleDateModalOpen}
                  className="text-sm font-bold text-white whitespace-nowrap hover:text-blue-400 transition-colors cursor-pointer"
                  style={{ minWidth: '140px' }}
                >
                  {viewMode === "year"
                    ? `${currentMonth.getFullYear()}년 전체`
                    : `${currentMonth.getFullYear()}년 ${monthNames[currentMonth.getMonth()]}`}
                </button>
                <button
                  onClick={handleTodayClick}
                  className="text-xs bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  오늘
                </button>
                {onViewModeChange && (
                  <button
                    onClick={() =>
                      onViewModeChange(viewMode === "month" ? "year" : "month")
                    }
                    className={`text-xs px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === "year"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"
                    }`}
                  >
                    {viewMode === "month" ? "년" : "월"}
                  </button>
                )}
                <button
                  onClick={() => handleNavigateMonth("next")}
                  className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-arrow-right-s-line text-lg"></i>
                </button>
              </div>
            )}

            {/* Right: Billboard & Settings Button */}
            <div className="flex items-center space-x-2">
              {(isAdmin || billboardUserId !== null) && (
                <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                  관리자
                </span>
              )}
              {billboardEnabled && onBillboardOpen && (
                <button
                  onClick={onBillboardOpen}
                  className="bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white p-2 rounded-lg transition-colors cursor-pointer"
                  title="광고판 보기"
                >
                  <i className="ri-image-line text-sm"></i>
                </button>
              )}
              <button
                onClick={handleSettingsClick}
                className="bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white p-2 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-settings-3-line text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettingsModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999] p-4 pt-20 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">설정</h3>
                <button
                  onClick={() => {
                    setShowSettingsModal(false);
                    window.location.reload(); // 설정 모달 닫을 때 새로고침
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {!isAdmin && billboardUserId === null ? (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-4">
                    관리자 로그인
                  </h4>
                  
                  {/* 로그인 타입 선택 탭 */}
                  <div className="flex border-b border-gray-700 mb-4">
                    <button
                      onClick={() => setLoginType("super")}
                      className={`flex-1 py-2 text-center transition-colors ${
                        loginType === "super"
                          ? "text-blue-400 border-b-2 border-blue-400"
                          : "text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      슈퍼 관리자
                    </button>
                    <button
                      onClick={() => setLoginType("sub")}
                      className={`flex-1 py-2 text-center transition-colors ${
                        loginType === "sub"
                          ? "text-blue-400 border-b-2 border-blue-400"
                          : "text-gray-400 hover:text-gray-300"
                      }`}
                    >
                      빌보드 관리자
                    </button>
                  </div>

                  <div className="space-y-4">
                    {loginType === "super" && (
                      <div>
                        <label className="block text-gray-300 text-sm font-medium mb-2">
                          이메일
                        </label>
                        <input
                          type="email"
                          value={adminEmail}
                          onChange={(e) => setAdminEmail(e.target.value)}
                          className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="admin@example.com"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-gray-300 text-sm font-medium mb-2">
                        비밀번호
                      </label>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleAdminLogin();
                          }
                        }}
                        className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="비밀번호를 입력하세요"
                      />
                    </div>
                    <button
                      onClick={handleAdminLogin}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      로그인
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-4">
                    {isAdmin && billboardUserId === null
                      ? "슈퍼 관리자 모드"
                      : `${billboardUserName} 빌보드 관리자`}
                  </h4>
                  <p className="text-gray-300 text-sm mb-4">
                    {isAdmin && billboardUserId === null
                      ? "모든 콘텐츠를 관리할 수 있습니다."
                      : "자신의 빌보드 설정을 관리할 수 있습니다."}
                  </p>
                  <div className="space-y-3">
                    <button
                      onClick={() => {
                        onBillboardSettingsOpen?.();
                      }}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                    >
                      <i className="ri-image-2-line"></i>
                      광고판 설정
                    </button>
                    {billboardUserId !== null && (
                      <button
                        onClick={() => {
                          const billboardUrl = `${window.location.origin}/billboard/${billboardUserId}`;
                          navigator.clipboard.writeText(billboardUrl);
                          alert("빌보드 주소가 복사되었습니다!");
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                      >
                        <i className="ri-link"></i>
                        빌보드 주소 복사
                      </button>
                    )}
                    {isAdmin && billboardUserId === null && (
                      <>
                        <button
                          onClick={() => {
                            setShowBillboardUserManagement(true);
                          }}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                        >
                          <i className="ri-user-settings-line"></i>
                          빌보드 사용자 관리
                        </button>
                        <button
                          onClick={() => {
                            setShowDefaultThumbnailSettings(true);
                          }}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                        >
                          <i className="ri-image-2-line"></i>
                          기본 썸네일 설정
                        </button>
                        <button
                          onClick={() => setShowColorPanel(!showColorPanel)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                        >
                          <i className="ri-palette-line"></i>
                          색상 설정
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleAdminLogout}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      로그아웃
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* 색상 설정 패널 (슈퍼 관리자 전용) */}
      {showColorPanel &&
        isAdmin &&
        billboardUserId === null &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999] p-4 pt-20 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white">색상 설정</h3>
                <button
                  onClick={() => {
                    setShowColorPanel(false);
                    // 설정 모달로 돌아가기 (이미 showSettingsModal이 true이므로 자동으로 보임)
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-6">
                {/* 헤더 배경색 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    헤더 배경색
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.header_bg_color}
                      onChange={(e) =>
                        saveThemeColor("header_bg_color", e.target.value)
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.header_bg_color}
                      onChange={(e) =>
                        saveThemeColor("header_bg_color", e.target.value)
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 배경색 (650px 밖) */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    배경색 (650px 밖)
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.background_color}
                      onChange={(e) =>
                        saveThemeColor("background_color", e.target.value)
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.background_color}
                      onChange={(e) =>
                        saveThemeColor("background_color", e.target.value)
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 달력 배경색 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    달력 배경색
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.calendar_bg_color}
                      onChange={(e) =>
                        saveThemeColor("calendar_bg_color", e.target.value)
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.calendar_bg_color}
                      onChange={(e) =>
                        saveThemeColor("calendar_bg_color", e.target.value)
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 이벤트 리스트 배경색 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    이벤트 리스트 배경색
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.event_list_bg_color}
                      onChange={(e) =>
                        saveThemeColor("event_list_bg_color", e.target.value)
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.event_list_bg_color}
                      onChange={(e) =>
                        saveThemeColor("event_list_bg_color", e.target.value)
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 이벤트 리스트 컨테이너 배경색 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    이벤트 리스트 컨테이너 배경색
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.event_list_outer_bg_color}
                      onChange={(e) =>
                        saveThemeColor(
                          "event_list_outer_bg_color",
                          e.target.value,
                        )
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.event_list_outer_bg_color}
                      onChange={(e) =>
                        saveThemeColor(
                          "event_list_outer_bg_color",
                          e.target.value,
                        )
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* 페이지 배경색 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    이벤트리스트판 뒷배경
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={themeColors.page_bg_color}
                      onChange={(e) =>
                        saveThemeColor("page_bg_color", e.target.value)
                      }
                      className="w-16 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={themeColors.page_bg_color}
                      onChange={(e) =>
                        saveThemeColor("page_bg_color", e.target.value)
                      }
                      className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <p className="text-gray-400 text-xs mt-4">
                  * 변경사항은 즉시 저장되어 모든 사용자에게 적용됩니다.
                </p>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Billboard User Management Modal */}
      <BillboardUserManagementModal
        isOpen={showBillboardUserManagement}
        onClose={() => setShowBillboardUserManagement(false)}
      />

      {/* Default Thumbnail Settings Modal */}
      <DefaultThumbnailSettingsModal
        isOpen={showDefaultThumbnailSettings}
        onClose={() => setShowDefaultThumbnailSettings(false)}
      />

      {/* QR Code Modal */}
      <QRCodeModal isOpen={showQRModal} onClose={() => setShowQRModal(false)} />

      {/* Date Selection Modal */}
      {showDateModal &&
        createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[9999999] p-4 pt-20 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h3 className="text-xl font-bold text-white mb-6 text-center">
                날짜 선택
              </h3>

              {/* Year Selection */}
              <div className="mb-6">
                <label className="block text-gray-300 text-sm font-medium mb-3">
                  년도
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {years.map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        selectedYear === year
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Month Selection */}
              <div className="mb-6">
                <label className="block text-gray-300 text-sm font-medium mb-3">
                  월
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {monthNames.map((month, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedMonth(index)}
                      className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        selectedMonth === index
                          ? "bg-blue-600 text-white"
                          : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      }`}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3">
                <button
                  onClick={handleDateCancel}
                  className="flex-1 bg-[#242424] hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={handleDateConfirm}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
                >
                  확인
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
