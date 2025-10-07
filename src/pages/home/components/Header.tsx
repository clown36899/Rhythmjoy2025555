import { useState, useEffect } from "react";
import QRCodeModal from "../../../components/QRCodeModal";
import { supabase } from "../../../lib/supabase";

interface HeaderProps {
  currentMonth?: Date;
  onNavigateMonth?: (direction: "prev" | "next") => void;
  onDateChange?: (date: Date) => void;
  onAdminModeToggle?: (isAdmin: boolean) => void;
  onBillboardOpen?: () => void;
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
}: HeaderProps) {
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedYear, setSelectedYear] = useState(
    currentMonth?.getFullYear() || new Date().getFullYear(),
  );
  const [selectedMonth, setSelectedMonth] = useState(
    currentMonth?.getMonth() || new Date().getMonth(),
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [themeColors, setThemeColors] = useState({
    background_color: '#000000',
    calendar_bg_color: '#111827',
    event_list_bg_color: '#1f2937',
    event_list_outer_bg_color: '#111827'
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

  const handleAdminLogin = () => {
    // 관리자 비밀번호: admin123
    if (adminPassword === "admin123") {
      setIsAdminMode(true);
      onAdminModeToggle?.(true);
      setShowSettingsModal(false);
      setAdminPassword("");
      alert("관리자 모드로 전환되었습니다.");
    } else {
      alert("비밀번호가 올바르지 않습니다.");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminMode(false);
    onAdminModeToggle?.(false);
    setShowSettingsModal(false);
    alert("일반 모드로 전환되었습니다.");
  };

  // 색상 설정 불러오기
  const loadThemeColors = async () => {
    try {
      const { data, error } = await supabase
        .from('theme_settings')
        .select('*')
        .eq('id', 1)
        .single();
      
      // 테이블이 없거나 데이터가 없으면 기본값 사용
      if (error) {
        console.log('테이블이 없어 기본 색상 사용');
        return;
      }
      
      if (data) {
        setThemeColors({
          background_color: data.background_color,
          calendar_bg_color: data.calendar_bg_color,
          event_list_bg_color: data.event_list_bg_color,
          event_list_outer_bg_color: data.event_list_outer_bg_color
        });
        
        // CSS 변수 업데이트
        document.documentElement.style.setProperty('--bg-color', data.background_color);
        document.documentElement.style.setProperty('--calendar-bg-color', data.calendar_bg_color);
        document.documentElement.style.setProperty('--event-list-bg-color', data.event_list_bg_color);
        document.documentElement.style.setProperty('--event-list-outer-bg-color', data.event_list_outer_bg_color);
      }
    } catch (err) {
      console.log('기본 색상 사용');
    }
  };

  // 색상 저장
  const saveThemeColor = async (colorType: string, color: string) => {
    try {
      const { error } = await supabase
        .from('theme_settings')
        .update({ 
          [colorType]: color,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);
      
      if (error) {
        console.error('색상 저장 오류:', error);
        return;
      }
      
      // 로컬 상태 업데이트
      setThemeColors(prev => ({
        ...prev,
        [colorType]: color
      }));
      
      // CSS 변수 업데이트
      const cssVarMap: { [key: string]: string } = {
        'background_color': '--bg-color',
        'calendar_bg_color': '--calendar-bg-color',
        'event_list_bg_color': '--event-list-bg-color',
        'event_list_outer_bg_color': '--event-list-outer-bg-color'
      };
      
      document.documentElement.style.setProperty(cssVarMap[colorType], color);
    } catch (err) {
      console.error('색상 저장 실패:', err);
    }
  };

  // 초기 색상 불러오기
  useEffect(() => {
    loadThemeColors();
  }, []);

  return (
    <>
      <header className="bg-gray-800 border-b border-gray-700">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <button
                onClick={() => setShowQRModal(true)}
                className="flex items-center space-x-2 hover:opacity-80 transition-opacity cursor-pointer group"
                title="즐거찾기 QR 코드"
              >
                <div className="text-2xl">
                  <i className="ri-qr-code-line text-purple-400 group-hover:text-purple-300"></i>
                </div>
                <span className="text-sm font-bold text-gray-300 group-hover:text-white hidden sm:inline">
                  즐거찾기
                </span>
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
                >
                  {viewMode === "year" 
                    ? `${currentMonth.getFullYear()}년 전체`
                    : `${currentMonth.getFullYear()}년 ${monthNames[currentMonth.getMonth()]}`
                  }
                </button>
                <button
                  onClick={handleTodayClick}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap"
                >
                  오늘
                </button>
                {onViewModeChange && (
                  <button
                    onClick={() => onViewModeChange(viewMode === "month" ? "year" : "month")}
                    className={`text-xs px-2 py-1 rounded transition-colors cursor-pointer whitespace-nowrap ${
                      viewMode === "year"
                        ? "bg-blue-600 hover:bg-blue-700 text-white"
                        : "bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white"
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
              {isAdminMode && (
                <span className="bg-red-600 text-white px-2 py-1 rounded-full text-xs font-bold">
                  관리자
                </span>
              )}
              {onBillboardOpen && (
                <button
                  onClick={onBillboardOpen}
                  className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white p-2 rounded-lg transition-colors cursor-pointer"
                  title="광고판 보기"
                >
                  <i className="ri-image-line text-lg"></i>
                </button>
              )}
              <button
                onClick={handleSettingsClick}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white p-2 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-settings-3-line text-sm"></i>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Date Selection Modal */}
      {showDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-[9999] p-4 pt-20 overflow-y-auto">
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
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
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
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999] p-4 pt-20 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">설정</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {!isAdminMode ? (
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">
                  관리자 모드
                </h4>
                <p className="text-gray-300 text-sm mb-4">
                  관리자 모드에서는 모든 이벤트를 수정하고 삭제할 수 있습니다.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-2">
                      관리자 비밀번호
                    </label>
                    <input
                      type="password"
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="비밀번호를 입력하세요"
                    />
                  </div>
                  <button
                    onClick={handleAdminLogin}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    관리자 모드 활성화
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">
                  관리자 모드 활성화됨
                </h4>
                <p className="text-gray-300 text-sm mb-4">
                  현재 관리자 모드입니다. 모든 이벤트를 관리할 수 있습니다.
                </p>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowSettingsModal(false);
                      onBillboardSettingsOpen?.();
                    }}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    <i className="ri-image-2-line"></i>
                    광고판 설정
                  </button>
                  <button
                    onClick={() => setShowColorPanel(!showColorPanel)}
                    className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-2"
                  >
                    <i className="ri-palette-line"></i>
                    색상 설정
                  </button>
                  <button
                    onClick={handleAdminLogout}
                    className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    일반 모드로 전환
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 색상 설정 패널 */}
      {showColorPanel && isAdminMode && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999] p-4 pt-20 overflow-y-auto">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">색상 설정</h3>
              <button
                onClick={() => setShowColorPanel(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="space-y-6">
              {/* 배경색 (650px 밖) */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  배경색 (650px 밖)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={themeColors.background_color}
                    onChange={(e) => saveThemeColor('background_color', e.target.value)}
                    className="w-16 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeColors.background_color}
                    onChange={(e) => saveThemeColor('background_color', e.target.value)}
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
                    onChange={(e) => saveThemeColor('calendar_bg_color', e.target.value)}
                    className="w-16 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeColors.calendar_bg_color}
                    onChange={(e) => saveThemeColor('calendar_bg_color', e.target.value)}
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
                    onChange={(e) => saveThemeColor('event_list_bg_color', e.target.value)}
                    className="w-16 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeColors.event_list_bg_color}
                    onChange={(e) => saveThemeColor('event_list_bg_color', e.target.value)}
                    className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 이벤트 리스트 뒷쪽 배경색 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  이벤트 리스트 뒷쪽 배경색
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={themeColors.event_list_outer_bg_color}
                    onChange={(e) => saveThemeColor('event_list_outer_bg_color', e.target.value)}
                    className="w-16 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeColors.event_list_outer_bg_color}
                    onChange={(e) => saveThemeColor('event_list_outer_bg_color', e.target.value)}
                    className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <p className="text-gray-400 text-xs mt-4">
                * 변경사항은 즉시 저장되어 모든 사용자에게 적용됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={showQRModal}
        onClose={() => setShowQRModal(false)}
      />
    </>
  );
}
