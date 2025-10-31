import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCodeModal from "../../../components/QRCodeModal";
import BillboardUserManagementModal from "../../../components/BillboardUserManagementModal";
import DefaultThumbnailSettingsModal from "../../../components/DefaultThumbnailSettingsModal";
import InvitationManagementModal from "../../../components/InvitationManagementModal";
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
  const [billboardUserId, setBillboardUserId] = useState<string | null>(null);
  const [billboardUserName, setBillboardUserName] = useState<string>("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSuccessType, setLoginSuccessType] = useState("");
  
  const { isAdmin, signOut, signInWithKakao } = useAuth();
  const [showQRModal, setShowQRModal] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showBillboardUserManagement, setShowBillboardUserManagement] =
    useState(false);
  const [showDefaultThumbnailSettings, setShowDefaultThumbnailSettings] =
    useState(false);
  const [showInvitationManagement, setShowInvitationManagement] =
    useState(false);
  const [showLoginSuccessModal, setShowLoginSuccessModal] = useState(false);
  const [loginSuccessName, setLoginSuccessName] = useState("");
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

  const handleKakaoLogin = async () => {
    setLoginLoading(true);
    try {
      const result = await signInWithKakao();
      
      // 서버 응답에 따라 자동으로 권한 설정
      let loginTypeText = '';
      if (result.isAdmin) {
        // 슈퍼 관리자
        onAdminModeToggle?.(true, "super", null, "");
        loginTypeText = '전체 관리자 모드';
      } else if (result.isBillboardUser && result.billboardUserId && result.billboardUserName) {
        // 서브 관리자 (빌보드 사용자)
        setBillboardUserId(result.billboardUserId);
        setBillboardUserName(result.billboardUserName);
        onAdminModeToggle?.(true, "sub", result.billboardUserId, result.billboardUserName);
        loginTypeText = '개인빌보드 관리자 모드';
      } else {
        // 권한 없음
        await signOut();
        alert("관리자 권한이 없습니다. 초대를 요청하세요.");
        return;
      }
      
      setLoginSuccessName(result.name);
      setLoginSuccessType(loginTypeText);
      setShowSettingsModal(false);
      setShowLoginSuccessModal(true);
    } catch (error: any) {
      alert('❌ ' + (error.message || '카카오 로그인에 실패했습니다'));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    console.log('[로그아웃] 시작');
    
    // 로컬 상태 먼저 초기화
    setBillboardUserId(null);
    setBillboardUserName("");
    onAdminModeToggle?.(false, null, null, "");
    
    try {
      // Supabase 로그아웃 - 모든 세션 제거
      console.log('[로그아웃] Supabase signOut 호출');
      await signOut();
      console.log('[로그아웃] Supabase signOut 완료');
    } catch (error) {
      console.error('[로그아웃] signOut 에러:', error);
    }
    
    // localStorage 강제 정리
    console.log('[로그아웃] localStorage 정리');
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.includes('supabase') || key.includes('auth')) {
        localStorage.removeItem(key);
        console.log('[로그아웃] 제거:', key);
      }
    });
    
    // 페이지 새로고침
    console.log('[로그아웃] 페이지 새로고침');
    window.location.reload();
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

  // 초기 색상 불러오기 및 이벤트 리스너
  useEffect(() => {
    loadThemeColors();

    // 서브 관리자가 빌보드 설정 창을 닫으면 설정 모달 다시 열기
    const handleReopenSettings = () => {
      if (billboardUserId !== null) {
        setShowSettingsModal(true);
      }
    };

    // MobileShell에서 트리거되는 이벤트 리스너
    const handleOpenBillboardSettings = () => {
      onBillboardSettingsOpen?.();
    };

    const handleOpenBillboardUserManagement = () => {
      setShowBillboardUserManagement(true);
    };

    const handleOpenDefaultThumbnailSettings = () => {
      setShowDefaultThumbnailSettings(true);
    };

    const handleOpenColorSettings = () => {
      setShowColorPanel(true);
    };

    const handleOpenSettings = () => {
      setShowSettingsModal(true);
    };

    window.addEventListener("reopenAdminSettings", handleReopenSettings);
    window.addEventListener("openBillboardSettings", handleOpenBillboardSettings);
    window.addEventListener("openBillboardUserManagement", handleOpenBillboardUserManagement);
    window.addEventListener("openDefaultThumbnailSettings", handleOpenDefaultThumbnailSettings);
    window.addEventListener("openColorSettings", handleOpenColorSettings);
    window.addEventListener("openSettings", handleOpenSettings);

    return () => {
      window.removeEventListener("reopenAdminSettings", handleReopenSettings);
      window.removeEventListener("openBillboardSettings", handleOpenBillboardSettings);
      window.removeEventListener("openBillboardUserManagement", handleOpenBillboardUserManagement);
      window.removeEventListener("openDefaultThumbnailSettings", handleOpenDefaultThumbnailSettings);
      window.removeEventListener("openColorSettings", handleOpenColorSettings);
      window.removeEventListener("openSettings", handleOpenSettings);
    };
  }, [billboardUserId, onBillboardSettingsOpen]);

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
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999] p-2 pt-12 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg p-4 w-full max-w-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">설정</h3>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              {!isAdmin && billboardUserId === null ? (
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white mb-2">
                    관리자 로그인
                  </h4>
                  <p className="text-gray-400 text-sm mb-6">
                    카카오톡 계정으로 로그인하세요
                  </p>
                  
                  <button
                    onClick={handleKakaoLogin}
                    disabled={loginLoading}
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-gray-900 py-3 px-4 rounded-lg text-base font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loginLoading ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-gray-900 border-t-transparent"></div>
                        로그인 중...
                      </>
                    ) : (
                      <>
                        <i className="ri-kakao-talk-fill text-xl"></i>
                        카카오로 로그인
                      </>
                    )}
                  </button>
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
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        onBillboardSettingsOpen?.();
                      }}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <i className="ri-image-2-line text-base"></i>
                      광고판 설정
                    </button>
                    {billboardUserId !== null && (
                      <button
                        onClick={() => {
                          const billboardUrl = `${window.location.origin}/billboard/${billboardUserId}`;
                          navigator.clipboard.writeText(billboardUrl);
                          alert("빌보드 주소가 복사되었습니다!");
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <i className="ri-link text-base"></i>
                        빌보드 주소 복사
                      </button>
                    )}
                    {isAdmin && billboardUserId === null && (
                      <>
                        <button
                          onClick={() => {
                            setShowBillboardUserManagement(true);
                          }}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-user-settings-line text-base"></i>
                          빌보드 사용자 관리
                        </button>
                        <button
                          onClick={() => {
                            setShowInvitationManagement(true);
                            setShowSettingsModal(false);
                          }}
                          className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-mail-send-line text-base"></i>
                          초대 관리
                        </button>
                        <button
                          onClick={() => {
                            setShowDefaultThumbnailSettings(true);
                          }}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-image-2-line text-base"></i>
                          기본 썸네일 설정
                        </button>
                        <button
                          onClick={() => setShowColorPanel(!showColorPanel)}
                          className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-palette-line text-base"></i>
                          색상 설정
                        </button>
                      </>
                    )}
                    <button
                      onClick={handleAdminLogout}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
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

      {/* Invitation Management Modal */}
      <InvitationManagementModal
        isOpen={showInvitationManagement}
        onClose={() => setShowInvitationManagement(false)}
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

      {/* 로그인 성공 모달 */}
      {showLoginSuccessModal &&
        createPortal(
          <div
            className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[99999] p-4"
            onClick={() => setShowLoginSuccessModal(false)}
          >
            <div
              className="bg-gray-800 rounded-lg p-6 max-w-sm w-full animate-[scale-in_0.3s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center">
                    <i className="ri-shield-check-line text-3xl text-white"></i>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {loginSuccessName}님, 환영해요
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  {loginSuccessType}로 로그인되었습니다
                </p>
                <button
                  onClick={() => setShowLoginSuccessModal(false)}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 px-4 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition-colors cursor-pointer"
                >
                  시작하기
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
