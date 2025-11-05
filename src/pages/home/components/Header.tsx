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
  onBillboardSettingsOpen?: () => void;
  viewMode?: "month" | "year";
  onViewModeChange?: (mode: "month" | "year") => void;
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
  const [showCopySuccessModal, setShowCopySuccessModal] = useState(false);
  const [isDevAdmin, setIsDevAdmin] = useState(false); // 개발자 프리패스 상태
  
  const { isAdmin, signOut, signInWithKakao, signInAsDevAdmin } = useAuth();
  
  // 실제 관리자 또는 개발자 프리패스
  const isEffectiveAdmin = isAdmin || isDevAdmin;
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
  const [showSubAdminSelector, setShowSubAdminSelector] = useState(false);
  const [billboardUsers, setBillboardUsers] = useState<any[]>([]);
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
        setLoginLoading(false);
        setShowSettingsModal(false);
        // 에러 메시지는 표시하지 않고 조용히 닫기
        return;
      }
      
      setLoginSuccessName(result.name);
      setLoginSuccessType(loginTypeText);
      setShowSettingsModal(false);
      setShowLoginSuccessModal(true);
    } catch (error: any) {
      console.log('[카카오 로그인] 취소 또는 실패:', error.message);
      // 로그인 취소/실패 시 모달 닫기
      setShowSettingsModal(false);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    console.log('[로그아웃] 시작');
    
    // 모달 먼저 닫기
    setShowSettingsModal(false);
    
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
      if (key.includes('supabase') || key.includes('auth') || key.includes('kakao')) {
        localStorage.removeItem(key);
        console.log('[로그아웃] 제거:', key);
      }
    });
    
    // sessionStorage 정리 (PWA 대응)
    console.log('[로그아웃] sessionStorage 정리');
    try {
      sessionStorage.clear();
    } catch (e) {
      console.warn('[로그아웃] sessionStorage 정리 실패:', e);
    }
    
    // PWA 캐시 정리
    console.log('[로그아웃] PWA 캐시 정리');
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => {
            console.log('[로그아웃] 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          })
        );
      } catch (e) {
        console.warn('[로그아웃] 캐시 정리 실패:', e);
      }
    }
    
    // 로컬 상태 초기화
    setBillboardUserId(null);
    setBillboardUserName("");
    setIsDevAdmin(false); // 개발자 프리패스 상태 초기화
    onAdminModeToggle?.(false, null, null, "");
    
    // 강제 새로고침 (PWA 캐시 무시)
    console.log('[로그아웃] 강제 새로고침');
    window.location.replace('/');
    
    // 추가 안전장치: 0.5초 후 강제 리로드
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // 색상 설정 불러오기 (DB 최우선)
  const loadThemeColors = async () => {
    try {
      const { data, error } = await supabase
        .from("theme_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error || !data) {
        return;
      }

      // 로컬 상태 업데이트
      setThemeColors({
        background_color: data.background_color,
        header_bg_color: data.header_bg_color || "#1f2937",
        calendar_bg_color: data.calendar_bg_color,
        event_list_bg_color: data.event_list_bg_color,
        event_list_outer_bg_color: data.event_list_outer_bg_color,
        page_bg_color: data.page_bg_color || "#111827",
      });

      // CSS 변수 업데이트 (DB 색상이 최우선)
      document.documentElement.style.setProperty("--bg-color", data.background_color);
      document.documentElement.style.setProperty("--header-bg-color", data.header_bg_color || "#1f2937");
      document.documentElement.style.setProperty("--calendar-bg-color", data.calendar_bg_color);
      document.documentElement.style.setProperty("--event-list-bg-color", data.event_list_bg_color);
      document.documentElement.style.setProperty("--event-list-outer-bg-color", data.event_list_outer_bg_color);
      document.documentElement.style.setProperty("--page-bg-color", data.page_bg_color || "#111827");
    } catch (err) {
      // 기본 색상 사용 (index.css 폴백)
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
                  className="text-sm font-bold text-white whitespace-nowrap hover:text-blue-400 transition-colors cursor-pointer no-select"
                >
                  {viewMode === "year"
                    ? `${currentMonth.getFullYear().toString().slice(-2)}년 전체`
                    : `${currentMonth.getFullYear().toString().slice(-2)}년 ${monthNames[currentMonth.getMonth()]}`}
                </button>
                <button
                  onClick={handleTodayClick}
                  className={`text-xs px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap ${
                    currentMonth.getFullYear() === new Date().getFullYear() &&
                    currentMonth.getMonth() === new Date().getMonth()
                      ? "bg-blue-500 hover:bg-blue-600 text-white"
                      : "bg-[#242424] hover:bg-gray-600 text-gray-300 hover:text-white"
                  }`}
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

            {/* Right: Login Status & Settings Button */}
            <div className="flex items-center space-x-2">
              {/* 로그인 상태 표시 */}
              {(isEffectiveAdmin || billboardUserId !== null) && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30">
                  <i className={`text-xs ${
                    isDevAdmin 
                      ? 'ri-code-s-slash-line text-orange-400' 
                      : billboardUserId !== null
                        ? 'ri-user-line text-blue-400'
                        : 'ri-kakao-talk-fill text-yellow-400'
                  }`}></i>
                  <span className="text-xs text-white font-medium">
                    {isDevAdmin 
                      ? '개발자' 
                      : billboardUserId !== null
                        ? billboardUserName
                        : '관리자'
                    }
                  </span>
                </div>
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
              </div>

              {!isEffectiveAdmin && billboardUserId === null ? (
                <div className="text-center">
                  <h4 className="text-lg font-semibold text-white mb-2">
                    관리자 로그인
                  </h4>
                  <p className="text-gray-400 text-sm mb-6">
                    카카오톡 계정으로 로그인하세요
                  </p>
                  
                  <div className="space-y-3">
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
                    
                    {signInAsDevAdmin && (
                      <button
                        onClick={() => {
                          // 개발 환경 전용 - Supabase 우회하고 바로 관리자 모드 활성화
                          console.log('[개발 프리패스] 우회 로그인 시작');
                          setIsDevAdmin(true); // 개발자 관리자 상태 활성화
                          onAdminModeToggle?.(true, "super", null, "");
                          setLoginSuccessName("개발자 (프리패스)");
                          setLoginSuccessType("개발자 프리패스 - 전체 관리자");
                          setShowSettingsModal(false);
                          setShowLoginSuccessModal(true);
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-2 border-2 border-red-400"
                      >
                        <i className="ri-shield-keyhole-line text-base"></i>
                        개발자 프리패스 🔓
                      </button>
                    )}
                    
                    <button
                      onClick={() => setShowSettingsModal(false)}
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer mt-4"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-4">
                    {isEffectiveAdmin && billboardUserId === null
                      ? (isDevAdmin ? "슈퍼 관리자 모드 (개발)" : "슈퍼 관리자 모드")
                      : `${billboardUserName} 빌보드 관리자`}
                  </h4>
                  <p className="text-gray-300 text-sm mb-4">
                    {isEffectiveAdmin && billboardUserId === null
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
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            const billboardUrl = `${window.location.origin}/billboard/${billboardUserId}`;
                            navigator.clipboard.writeText(billboardUrl);
                            setShowCopySuccessModal(true);
                            setTimeout(() => setShowCopySuccessModal(false), 1500);
                          }}
                          className="bg-green-600 hover:bg-green-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-link text-base"></i>
                          빌보드 주소 복사
                        </button>
                        <button
                          onClick={async () => {
                            const billboardUrl = `${window.location.origin}/billboard/${billboardUserId}`;
                            
                            // Web Share API 지원 확인
                            if (navigator.share) {
                              try {
                                await navigator.share({
                                  title: `${billboardUserName} 빌보드`,
                                  text: `${billboardUserName}의 빌보드를 확인하세요!`,
                                  url: billboardUrl,
                                });
                              } catch (err) {
                                // 사용자가 공유를 취소한 경우 무시
                                if ((err as Error).name !== 'AbortError') {
                                  console.error('공유 실패:', err);
                                  // 공유 실패 시 복사로 대체
                                  navigator.clipboard.writeText(billboardUrl);
                                  setShowCopySuccessModal(true);
                                  setTimeout(() => setShowCopySuccessModal(false), 1500);
                                }
                              }
                            } else {
                              // Web Share API 미지원 시 복사로 대체
                              navigator.clipboard.writeText(billboardUrl);
                              setShowCopySuccessModal(true);
                              setTimeout(() => setShowCopySuccessModal(false), 1500);
                            }
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                        >
                          <i className="ri-share-line text-base"></i>
                          공유
                        </button>
                      </div>
                    )}
                    {isEffectiveAdmin && billboardUserId === null && (
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
                    
                    {/* 개발자 모드 섹션 */}
                    {isDevAdmin && (
                      <>
                        <div className="border-t border-red-500/30 pt-3 mt-3">
                          <p className="text-red-400 text-xs font-bold mb-2">🔧 개발자 모드</p>
                          <button
                            onClick={async () => {
                              // 서브 관리자 목록 가져오기
                              console.log('[개발 모드] 서브 관리자 목록 조회 시작');
                              const { data, error } = await supabase
                                .from('billboard_users')
                                .select('id, name, is_active')
                                .eq('is_active', true)
                                .order('created_at', { ascending: true });
                              
                              console.log('[개발 모드] 조회 결과:', { data, error });
                              
                              if (error) {
                                console.error('[개발 모드] 조회 에러:', error);
                                alert(`서브 관리자 목록을 불러올 수 없습니다.\n에러: ${error.message}`);
                                return;
                              }
                              
                              if (!data || data.length === 0) {
                                alert('등록된 서브 관리자가 없습니다.');
                                return;
                              }
                              
                              setBillboardUsers(data);
                              setShowSubAdminSelector(true);
                            }}
                            className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <i className="ri-user-settings-line text-base"></i>
                            서브관리자로그인테스트
                          </button>
                        </div>
                      </>
                    )}
                    
                    <button
                      onClick={handleAdminLogout}
                      className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                    >
                      로그아웃
                    </button>
                    {isEffectiveAdmin && billboardUserId === null && (
                      <button
                        onClick={() => setShowSettingsModal(false)}
                        className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                      >
                        모달 닫기
                      </button>
                    )}
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
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                    loginSuccessType.includes('프리패스')
                      ? 'bg-gradient-to-br from-red-500 to-orange-500'
                      : 'bg-gradient-to-br from-purple-500 to-blue-500'
                  }`}>
                    <i className={`text-3xl text-white ${
                      loginSuccessType.includes('프리패스')
                        ? 'ri-shield-keyhole-line'
                        : 'ri-shield-check-line'
                    }`}></i>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  {loginSuccessName}님, 환영해요
                </h3>
                <p className="text-gray-400 text-sm mb-6">
                  {loginSuccessType}로 로그인되었습니다
                </p>
                {loginSuccessType.includes('프리패스') && (
                  <div className="mb-4 p-2 bg-red-900/30 border border-red-500/50 rounded-lg">
                    <p className="text-red-300 text-xs">
                      🚨 개발 환경 전용 모드입니다
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowLoginSuccessModal(false);
                  }}
                  className={`w-full text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer ${
                    loginSuccessType.includes('프리패스')
                      ? 'bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700'
                      : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'
                  }`}
                >
                  시작하기
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* 서브 관리자 선택 모달 (개발자 모드) */}
      {showSubAdminSelector && isDevAdmin && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[9999999999] p-4"
          onClick={() => setShowSubAdminSelector(false)}
        >
          <div 
            className="bg-gray-800 rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">서브 관리자 선택</h3>
            <p className="text-gray-400 text-sm mb-4">테스트할 서브 관리자를 선택하세요</p>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {billboardUsers.length === 0 ? (
                <p className="text-gray-500 text-center py-4">등록된 서브 관리자가 없습니다.</p>
              ) : (
                billboardUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      // 서브 관리자로 로그인 상태 전환
                      console.log('[개발 모드] ========== 서브 관리자 전환 시작 ==========');
                      console.log('[개발 모드] 선택한 사용자:', user);
                      console.log('[개발 모드] 현재 상태:', {
                        isAdmin,
                        isDevAdmin,
                        billboardUserId,
                        billboardUserName
                      });
                      
                      console.log('[개발 모드] setBillboardUserId:', user.id);
                      setBillboardUserId(user.id);
                      
                      console.log('[개발 모드] setBillboardUserName:', user.name);
                      setBillboardUserName(user.name);
                      
                      console.log('[개발 모드] setIsDevAdmin(false) - 슈퍼 관리자 해제');
                      setIsDevAdmin(false);
                      
                      console.log('[개발 모드] onAdminModeToggle 호출:', {
                        isAdminMode: true,
                        type: "sub",
                        userId: user.id,
                        userName: user.name
                      });
                      onAdminModeToggle?.(true, "sub", user.id, user.name);
                      
                      console.log('[개발 모드] 모달 닫기');
                      setShowSubAdminSelector(false);
                      setShowSettingsModal(false);
                      
                      console.log('[개발 모드] 로그인 성공 모달 표시:', {
                        name: user.name,
                        type: '개인빌보드 관리자 모드'
                      });
                      setLoginSuccessName(user.name);
                      setLoginSuccessType('개인빌보드 관리자 모드');
                      setShowLoginSuccessModal(true);
                      
                      console.log('[개발 모드] ========== 서브 관리자 전환 완료 ==========');
                    }}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <i className="ri-user-line text-blue-400"></i>
                      <span className="font-medium">{user.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">ID: {user.id.substring(0, 8)}...</span>
                    </div>
                  </button>
                ))
              )}
            </div>
            
            <button
              onClick={() => setShowSubAdminSelector(false)}
              className="w-full mt-4 bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 빌보드 주소 복사 성공 모달 */}
      {showCopySuccessModal && createPortal(
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-3xl text-white"></i>
                </div>
              </div>
              <p className="text-white text-lg font-semibold">
                빌보드 주소가 복사되었습니다!
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
