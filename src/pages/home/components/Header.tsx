import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import QRCodeModal from "../../../components/QRCodeModal";
import BillboardUserManagementModal from "../../../components/BillboardUserManagementModal";
import DefaultThumbnailSettingsModal from "../../../components/DefaultThumbnailSettingsModal";
import InvitationManagementModal from "../../../components/InvitationManagementModal";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../../contexts/AuthContext";
import "../../../styles/components/Header.css";

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
  onBillboardOpen: _onBillboardOpen,
  onBillboardSettingsOpen,
  viewMode = "month",
  onViewModeChange,
  billboardEnabled: _billboardEnabled = true,
}: HeaderProps) {
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    currentMonth?.getFullYear() || new Date().getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    currentMonth?.getMonth() || new Date().getMonth(),
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSuccessType, setLoginSuccessType] = useState("");
  const [showCopySuccessModal, setShowCopySuccessModal] = useState(false);
  const [isDevAdmin, setIsDevAdmin] = useState(() => {
    // localStorage에서 개발자 프리패스 상태 복원
    return localStorage.getItem('isDevAdmin') === 'true';
  });

  const { isAdmin, billboardUserId, billboardUserName, setBillboardUser, signOut, signInWithKakao, signInAsDevAdmin } = useAuth();

  // isDevAdmin 상태 변경 시 localStorage 동기화
  useEffect(() => {
    if (isDevAdmin) {
      localStorage.setItem('isDevAdmin', 'true');
    } else {
      localStorage.removeItem('isDevAdmin');
    }
  }, [isDevAdmin]);

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


  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleKakaoLogin = async () => {
    setLoginLoading(true);
    try {
      const result = await signInWithKakao();

      // 서버 응답에 따라 자동으로 권한 설정
      let loginTypeText = '';
      let isBillboardAdmin = false;

      if (result.isAdmin) {
        // 슈퍼 관리자
        onAdminModeToggle?.(true, "super", null, "");
        loginTypeText = '전체 관리자 모드';
      } else if (result.isBillboardUser && result.billboardUserId && result.billboardUserName) {
        // 서브 관리자 (빌보드 사용자)
        setBillboardUser(result.billboardUserId, result.billboardUserName);
        onAdminModeToggle?.(true, "sub", result.billboardUserId, result.billboardUserName);
        loginTypeText = '개인빌보드 관리자 모드';
        isBillboardAdmin = true;
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

      if (isBillboardAdmin) {
        // 서브 관리자는 성공 모달 없이 바로 관리 패널 유지
        // 설정 모달이 닫혔다가 다시 열리면서 관리 패널이 표시됨
        setShowSettingsModal(false);
        setTimeout(() => {
          setShowSettingsModal(true);
        }, 100);
      } else {
        // 슈퍼 관리자는 성공 모달 표시
        setShowSettingsModal(false);
        setShowLoginSuccessModal(true);
      }
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

    // 로그아웃 플래그 설정 (AuthContext 세션 체크 스킵용)
    localStorage.setItem('isLoggingOut', 'true');

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
    setIsDevAdmin(false); // 개발자 프리패스 상태 초기화 (localStorage도 자동 삭제)
    onAdminModeToggle?.(false, null, null, "");
    // Billboard 사용자 정보는 AuthContext의 signOut에서 초기화됨

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
        className="header-container"
        style={{
          backgroundColor: "var(--header-bg-color)",
          height: "50px",
          overflow: "hidden",
          whiteSpace: "nowrap",
          display: "flex",
          alignItems: "center"
        }}
      >
        <div className="header-inner">
          <div className="header-content">
            <div className="header-left">
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
                className="header-logo-btn"
              >
                <img
                  src="/dangong-logo.png"
                  alt="DANGONG Logo"
                  className="header-logo-img"
                />
              </button>
            </div>

            {/* Calendar Controls - Center */}
            {currentMonth && onNavigateMonth && (
              <div className="header-center">
                <button
                  onClick={() => handleNavigateMonth("prev")}
                  className="header-nav-btn"
                >
                  <i className="ri-arrow-left-s-line header-nav-icon"></i>
                </button>
                <button
                  onClick={handleDateModalOpen}
                  className="header-date-btn"
                  style={{ fontSize: "1.4rem" }}
                >
                  {viewMode === "year"
                    ? `${currentMonth.getFullYear().toString().slice(-2)}년 전체`
                    : monthNames[currentMonth.getMonth()]}
                </button>
                {onViewModeChange && (
                  <button
                    onClick={() =>
                      onViewModeChange(viewMode === "month" ? "year" : "month")
                    }
                    className={viewMode === "year" ? "header-view-mode-btn header-view-mode-btn-year" : "header-view-mode-btn header-view-mode-btn-month"}
                  >
                    {viewMode === "month" ? "년" : "월"}
                  </button>
                )}
                <button
                  onClick={() => handleNavigateMonth("next")}
                  className="header-nav-btn"
                >
                  <i className="ri-arrow-right-s-line header-nav-icon"></i>
                </button>
              </div>
            )}

            {/* Right: Login Status & Settings Button */}
            <div className="header-right">
              {/* 로그인 상태 표시 */}
              {(isEffectiveAdmin || billboardUserId !== null) && (
                <div className="header-login-status">
                  <i className={`header-login-icon ${isDevAdmin
                    ? 'ri-code-s-slash-line header-login-icon-dev'
                    : billboardUserId !== null
                      ? 'ri-user-line header-login-icon-billboard'
                      : 'ri-kakao-talk-fill header-login-icon-admin'
                    }`}></i>
                  <span className="header-login-text">
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
                className="header-settings-btn"
              >
                <i className="ri-settings-3-line header-settings-icon"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettingsModal &&
        createPortal(
          <div className="header-modal-overlay">
            <div className="header-modal">
              <div className="header-modal-header">
                <h3 className="header-modal-title">설정</h3>
              </div>

              {!isEffectiveAdmin && billboardUserId === null ? (
                <div className="header-modal-text-center">
                  <h4 className="header-modal-subtitle">
                    관리자 로그인
                  </h4>
                  <p className="header-modal-text-sm">
                    관리자만 로그인 가능합니다.
                  </p>

                  <div className="header-btn-group-vertical">
                    <button
                      onClick={handleKakaoLogin}
                      disabled={loginLoading}
                      className="header-btn-base header-btn-yellow header-btn-icon"
                    >
                      {loginLoading ? (
                        <>
                          <div className="header-icon-spinner"></div>
                          로그인 중...
                        </>
                      ) : (
                        <>
                          <i className="ri-kakao-talk-fill header-icon-xl"></i>
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
                        className="header-btn-sm header-btn-red header-btn-icon"
                      >
                        <i className="ri-shield-keyhole-line header-icon-base"></i>
                        개발자 프리패스 🔓
                      </button>
                    )}

                    <button
                      onClick={() => setShowSettingsModal(false)}
                      className="header-btn-sm header-btn-gray header-mt-4"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h4 className="header-modal-subtitle">
                    {isEffectiveAdmin && billboardUserId === null
                      ? (isDevAdmin ? "슈퍼 관리자 모드 (개발)" : "슈퍼 관리자 모드")
                      : `${billboardUserName} 빌보드 관리자`}
                  </h4>
                  <p className="header-modal-text">
                    {isEffectiveAdmin && billboardUserId === null
                      ? "모든 콘텐츠를 관리할 수 있습니다."
                      : "자신의 빌보드 설정을 관리할 수 있습니다."}
                  </p>

                  {/* 서브 관리자 전용 레이아웃 */}
                  {billboardUserId !== null ? (
                    <div className="header-btn-group-vertical">
                      {/* 광고판 설정 + 주소/공유 섹션 */}
                      <div className="header-billboard-section header-btn-group-vertical">
                        {/* 광고판 설정 - 넓게 */}
                        <button
                          onClick={() => {
                            onBillboardSettingsOpen?.();
                          }}
                          className="header-btn-base header-btn-purple header-btn-icon"
                        >
                          <i className="ri-image-2-line header-icon-lg"></i>
                          광고판 설정
                        </button>

                        {/* 주소 복사 (2/3) + 공유 (1/3) */}
                        <div className="header-billboard-row">
                          <button
                            onClick={() => {
                              const billboardUrl = `${window.location.origin}/billboard/${billboardUserId}`;
                              navigator.clipboard.writeText(billboardUrl);
                              setShowCopySuccessModal(true);
                              setTimeout(() => setShowCopySuccessModal(false), 1500);
                            }}
                            className="header-billboard-col-2-3 header-billboard-btn-sm header-billboard-btn-green"
                          >
                            <i className="ri-link header-icon-base"></i>
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
                            className="header-billboard-col-1-3 header-billboard-btn-sm header-billboard-btn-share"
                          >
                            <i className="ri-share-line header-icon-base"></i>
                            공유
                          </button>
                        </div>
                      </div>

                      {/* 닫기 + 로그아웃 - 컨테이너 하단에 붙임 */}
                      <div className="header-grid-2 header-gap-2">
                        <button
                          onClick={() => setShowSettingsModal(false)}
                          className="header-btn-sm header-btn-gray"
                        >
                          닫기
                        </button>
                        <button
                          onClick={handleAdminLogout}
                          className="header-btn-sm header-btn-red"
                        >
                          로그아웃
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 슈퍼 관리자 레이아웃 */
                    <div className="header-btn-group-vertical">
                      <button
                        onClick={() => {
                          onBillboardSettingsOpen?.();
                        }}
                        className="header-btn-admin header-btn-purple"
                      >
                        <i className="ri-image-2-line header-icon-base"></i>
                        광고판 설정
                      </button>
                      {isEffectiveAdmin && billboardUserId === null && (
                        <>
                          <button
                            onClick={() => {
                              setShowBillboardUserManagement(true);
                            }}
                            className="header-btn-admin header-btn-orange"
                          >
                            <i className="ri-user-settings-line header-icon-base"></i>
                            빌보드 사용자 관리
                          </button>
                          <button
                            onClick={() => {
                              setShowInvitationManagement(true);
                              setShowSettingsModal(false);
                            }}
                            className="header-btn-admin header-btn-yellow-bg"
                          >
                            <i className="ri-mail-send-line header-icon-base"></i>
                            초대 관리
                          </button>
                          <button
                            onClick={() => {
                              setShowDefaultThumbnailSettings(true);
                            }}
                            className="header-btn-admin header-btn-purple"
                          >
                            <i className="ri-image-2-line header-icon-base"></i>
                            기본 썸네일 설정
                          </button>
                          <button
                            onClick={() => setShowColorPanel(!showColorPanel)}
                            className="header-btn-admin header-btn-green"
                          >
                            <i className="ri-palette-line header-icon-base"></i>
                            색상 설정
                          </button>
                        </>
                      )}

                      {/* 개발자 모드 섹션 */}
                      {isDevAdmin && (
                        <>
                          <div className="header-admin-section">
                            <p className="header-admin-label">🔧 개발자 모드</p>
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
                              className="header-btn-admin header-btn-orange"
                            >
                              <i className="ri-user-settings-line header-icon-base"></i>
                              서브관리자로그인테스트
                            </button>
                          </div>
                        </>
                      )}

                      {/* 닫기 + 로그아웃 - 컨테이너 하단에 붙임 */}
                      <div className="header-section-divider header-mt-3">
                        <div className="header-grid-2 header-gap-2">
                          <button
                            onClick={() => setShowSettingsModal(false)}
                            className="header-btn-sm header-btn-gray"
                          >
                            닫기
                          </button>
                          <button
                            onClick={handleAdminLogout}
                            className="header-btn-sm header-btn-red"
                          >
                            로그아웃
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
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
          <div className="header-color-panel-overlay">
            <div className="header-color-panel">
              <div className="header-color-panel-header">
                <h3 className="header-color-panel-title">색상 설정</h3>
                <button
                  onClick={() => {
                    setShowColorPanel(false);
                    // 설정 모달로 돌아가기 (이미 showSettingsModal이 true이므로 자동으로 보임)
                  }}
                  className="header-color-panel-close"
                >
                  <i className="ri-close-line header-icon-xl"></i>
                </button>
              </div>

              <div className="header-btn-group-vertical header-gap-3 header-mb-6">
                {/* 헤더 배경색 */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    헤더 배경색
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.header_bg_color}
                      onChange={(e) =>
                        saveThemeColor("header_bg_color", e.target.value)
                      }
                      className="header-color-picker"
                    />
                    <input
                      type="text"
                      value={themeColors.header_bg_color}
                      onChange={(e) =>
                        saveThemeColor("header_bg_color", e.target.value)
                      }
                      className="header-color-text"
                    />
                  </div>
                </div>

                {/* 배경색 (650px 밖) */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    배경색 (650px 밖)
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.background_color}
                      onChange={(e) =>
                        saveThemeColor("background_color", e.target.value)
                      }
                      className="header-color-picker"
                    />
                    <input
                      type="text"
                      value={themeColors.background_color}
                      onChange={(e) =>
                        saveThemeColor("background_color", e.target.value)
                      }
                      className="header-color-text"
                    />
                  </div>
                </div>

                {/* 달력 배경색 */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    달력 배경색
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.calendar_bg_color}
                      onChange={(e) =>
                        saveThemeColor("calendar_bg_color", e.target.value)
                      }
                      className="header-color-picker"
                    />
                    <input
                      type="text"
                      value={themeColors.calendar_bg_color}
                      onChange={(e) =>
                        saveThemeColor("calendar_bg_color", e.target.value)
                      }
                      className="header-color-text"
                    />
                  </div>
                </div>

                {/* 이벤트 리스트 배경색 */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    이벤트 리스트 배경색
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.event_list_bg_color}
                      onChange={(e) =>
                        saveThemeColor("event_list_bg_color", e.target.value)
                      }
                      className="header-color-picker"
                    />
                    <input
                      type="text"
                      value={themeColors.event_list_bg_color}
                      onChange={(e) =>
                        saveThemeColor("event_list_bg_color", e.target.value)
                      }
                      className="header-color-text"
                    />
                  </div>
                </div>

                {/* 이벤트 리스트 컨테이너 배경색 */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    이벤트 리스트 컨테이너 배경색
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.event_list_outer_bg_color}
                      onChange={(e) =>
                        saveThemeColor(
                          "event_list_outer_bg_color",
                          e.target.value,
                        )
                      }
                      className="header-color-picker"
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
                      className="header-color-text"
                    />
                  </div>
                </div>

                {/* 페이지 배경색 */}
                <div className="header-color-section">
                  <label className="header-color-label">
                    이벤트리스트판 뒷배경
                  </label>
                  <div className="header-color-input-group">
                    <input
                      type="color"
                      value={themeColors.page_bg_color}
                      onChange={(e) =>
                        saveThemeColor("page_bg_color", e.target.value)
                      }
                      className="header-color-picker"
                    />
                    <input
                      type="text"
                      value={themeColors.page_bg_color}
                      onChange={(e) =>
                        saveThemeColor("page_bg_color", e.target.value)
                      }
                      className="header-color-text"
                    />
                  </div>
                </div>

                <p className="header-color-note">
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
          <div className="header-modal-overlay-date">
            <div className="header-modal-md">
              <h3 className="header-modal-title-xl">
                날짜 선택
              </h3>

              {/* Year Selection */}
              <div className="header-form-group">
                <label className="header-form-label">
                  년도
                </label>
                <div className="header-grid-5">
                  {years.map((year) => (
                    <button
                      key={year}
                      onClick={() => setSelectedYear(year)}
                      className={selectedYear === year ? "header-year-btn header-year-btn-active" : "header-year-btn header-year-btn-inactive"}
                    >
                      {year}
                    </button>
                  ))}
                </div>
              </div>

              {/* Month Selection */}
              <div className="header-form-group">
                <label className="header-form-label">
                  월
                </label>
                <div className="header-grid-4">
                  {monthNames.map((month, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedMonth(index)}
                      className={selectedMonth === index ? "header-year-btn header-year-btn-active" : "header-year-btn header-year-btn-inactive"}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="header-btn-group header-gap-3">
                <button
                  onClick={handleDateCancel}
                  className="header-btn-sm header-btn-gray-dark header-flex-1"
                >
                  취소
                </button>
                <button
                  onClick={handleDateConfirm}
                  className="header-btn-sm header-btn-blue header-flex-1"
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
            className="header-modal-overlay-center"
            onClick={() => setShowLoginSuccessModal(false)}
          >
            <div
              className="header-modal header-modal-animated"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="header-success-container">
                <div className="header-success-icon-wrapper">
                  <div className={`header-success-icon-circle ${loginSuccessType.includes('프리패스')
                    ? 'header-success-icon-red'
                    : 'header-success-icon-purple'
                    }`}>
                    <i className={`header-icon-3xl ${loginSuccessType.includes('프리패스')
                      ? 'ri-shield-keyhole-line'
                      : 'ri-shield-check-line'
                      }`} style={{ color: 'white' }}></i>
                  </div>
                </div>
                <h3 className="header-success-title">
                  {loginSuccessName}님, 환영해요
                </h3>
                <p className="header-success-text">
                  {loginSuccessType}로 로그인되었습니다
                </p>
                {loginSuccessType.includes('프리패스') && (
                  <div className="header-warning-box">
                    <p className="header-warning-text">
                      🚨 개발 환경 전용 모드입니다
                    </p>
                  </div>
                )}
                <button
                  onClick={() => {
                    setShowLoginSuccessModal(false);
                  }}
                  className={`header-btn-base ${loginSuccessType.includes('프리패스')
                    ? 'header-btn-gradient-red'
                    : 'header-btn-gradient-purple'
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
          className="header-modal-overlay-ultra"
          onClick={() => setShowSubAdminSelector(false)}
        >
          <div
            className="header-modal-md"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="header-modal-title-xl">서브 관리자 선택</h3>
            <p className="header-modal-text header-modal-text-center">테스트할 서브 관리자를 선택하세요</p>

            <div className="header-user-list">
              {billboardUsers.length === 0 ? (
                <p className="header-empty-state">등록된 서브 관리자가 없습니다.</p>
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

                      console.log('[개발 모드] setBillboardUser:', user.id, user.name);
                      setBillboardUser(user.id, user.name);

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

                      // 서브 관리자는 성공 모달 없이 바로 관리 패널 표시
                      setTimeout(() => {
                        setShowSettingsModal(true);
                      }, 100);

                      console.log('[개발 모드] ========== 서브 관리자 전환 완료 ==========');
                    }}
                    className="header-user-item"
                  >
                    <div className="header-user-content">
                      <i className="ri-user-line header-login-icon-billboard"></i>
                      <span className="header-user-name">{user.name}</span>
                      <span className="header-user-id">ID: {user.id.substring(0, 8)}...</span>
                    </div>
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setShowSubAdminSelector(false)}
              className="header-btn-sm header-btn-gray header-mt-4"
            >
              취소
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* 빌보드 주소 복사 성공 모달 */}
      {showCopySuccessModal && createPortal(
        <div className="header-modal-overlay-super">
          <div className="header-modal header-modal-shadow">
            <div className="header-success-container">
              <div className="header-success-icon-wrapper">
                <div className="header-success-icon-circle header-success-icon-green">
                  <i className="ri-check-line header-icon-3xl" style={{ color: 'white' }}></i>
                </div>
              </div>
              <p className="header-success-text-lg">
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
