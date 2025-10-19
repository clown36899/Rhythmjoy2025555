import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import type { BillboardSettings } from "../../../hooks/useBillboardSettings";

interface AdminBillboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BillboardSettings;
  onUpdateSettings: (updates: Partial<BillboardSettings>) => void;
  onResetSettings: () => void;
  adminType: "super" | "sub" | null;
  billboardUserId: string | null;
  billboardUserName?: string;
}

interface BillboardUserSettings {
  id: string;
  billboard_user_id: string;
  excluded_weekdays: number[];
  excluded_event_ids: number[];
  date_filter_start: string | null;
  date_filter_end: string | null;
  auto_slide_interval: number;
  play_order: 'sequential' | 'random';
}

export default function AdminBillboardModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
  adminType,
  billboardUserId,
  billboardUserName = "",
}: AdminBillboardModalProps) {
  const [userSettings, setUserSettings] = useState<BillboardUserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // 서브 관리자의 설정 불러오기
  useEffect(() => {
    if (isOpen && adminType === "sub" && billboardUserId) {
      loadUserSettings();
    }
  }, [isOpen, adminType, billboardUserId]);

  const loadUserSettings = async () => {
    if (!billboardUserId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("billboard_user_settings")
        .select("*")
        .eq("billboard_user_id", billboardUserId)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      setUserSettings(data || {
        id: billboardUserId,
        billboard_user_id: billboardUserId,
        excluded_weekdays: [],
        excluded_event_ids: [],
        date_filter_start: null,
        date_filter_end: null,
        auto_slide_interval: 5000,
        play_order: 'sequential',
      });
    } catch (error) {
      console.error("설정 불러오기 오류:", error);
      alert("설정을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // 로컬 state만 변경 (DB 저장 안함)
  const updateLocalSettings = (updates: Partial<BillboardUserSettings>) => {
    if (!userSettings) return;
    const newSettings = { ...userSettings, ...updates };
    setUserSettings(newSettings);
  };

  // DB에 저장
  const saveUserSettings = async () => {
    if (!billboardUserId || !userSettings) return;

    try {
      const { error } = await supabase
        .from("billboard_user_settings")
        .upsert(
          {
            billboard_user_id: billboardUserId,
            excluded_weekdays: userSettings.excluded_weekdays,
            excluded_event_ids: userSettings.excluded_event_ids,
            date_filter_start: userSettings.date_filter_start,
            date_filter_end: userSettings.date_filter_end,
            auto_slide_interval: userSettings.auto_slide_interval,
            play_order: userSettings.play_order,
          },
          {
            onConflict: 'billboard_user_id'
          }
        );

      if (error) throw error;
      
      alert("설정이 저장되었습니다.");
    } catch (error) {
      console.error("설정 저장 오류:", error);
      alert("설정 저장 중 오류가 발생했습니다.");
    }
  };

  const handleChangePassword = async () => {
    if (!billboardUserId) return;

    if (!currentPassword.trim()) {
      alert('현재 비밀번호를 입력하세요.');
      return;
    }

    if (!newPassword.trim()) {
      alert('새 비밀번호를 입력하세요.');
      return;
    }

    if (newPassword.length < 4) {
      alert('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    try {
      // 현재 비밀번호 확인
      const { data: user, error: fetchError } = await supabase
        .from('billboard_users')
        .select('password_hash')
        .eq('id', billboardUserId)
        .single();

      if (fetchError) throw fetchError;

      const { verifyPassword, hashPassword } = await import('../../../utils/passwordHash');
      const isValid = await verifyPassword(currentPassword, user.password_hash);

      if (!isValid) {
        alert('현재 비밀번호가 올바르지 않습니다.');
        return;
      }

      // 새 비밀번호로 업데이트
      const newPasswordHash = await hashPassword(newPassword);
      const { error: updateError } = await supabase
        .from('billboard_users')
        .update({ password_hash: newPasswordHash })
        .eq('id', billboardUserId);

      if (updateError) throw updateError;

      alert('비밀번호가 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('비밀번호 변경 오류:', error);
      alert('비밀번호 변경 중 오류가 발생했습니다.');
    }
  };
  // 재생 순서 변경 핸들러
  const handlePlayOrderChange = (newOrder: 'sequential' | 'random') => {
    onUpdateSettings({ playOrder: newOrder });
    // 빌보드에 변경 알림
    window.dispatchEvent(new Event('billboardOrderChange'));
  };

  if (!isOpen) return null;

  const formatTime = (ms: number): string => {
    if (ms === 0) return "비활성";
    const seconds = ms / 1000;
    const minutes = seconds / 60;

    if (minutes >= 1) {
      const mins = Math.floor(minutes);
      const secs = Math.floor(seconds % 60);
      if (secs > 0) return `${mins}분 ${secs}초`;
      return `${mins}분`;
    }
    return `${seconds.toFixed(1)}초`;
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // 서브 관리자용 UI 렌더링
  if (adminType === "sub") {
    if (loading) {
      return createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-white text-xl">로딩 중...</div>
        </div>,
        document.body
      );
    }

    if (!userSettings) return null;

    const weekDays = [
      { value: 0, label: "일요일" },
      { value: 1, label: "월요일" },
      { value: 2, label: "화요일" },
      { value: 3, label: "수요일" },
      { value: 4, label: "목요일" },
      { value: 5, label: "금요일" },
      { value: 6, label: "토요일" },
    ];

    return createPortal(
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <i className="ri-settings-3-line"></i>
              {billboardUserName} 빌보드 설정
            </h2>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* 제외 요일 */}
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <label className="text-white font-medium block mb-3">제외 요일</label>
              <p className="text-sm text-gray-400 mb-3">선택한 요일의 이벤트는 표시되지 않습니다</p>
              <div className="grid grid-cols-7 gap-2">
                {weekDays.map((day) => (
                  <button
                    key={day.value}
                    onClick={() => {
                      const excluded = userSettings.excluded_weekdays || [];
                      const newExcluded = excluded.includes(day.value)
                        ? excluded.filter((d) => d !== day.value)
                        : [...excluded, day.value];
                      updateLocalSettings({ excluded_weekdays: newExcluded });
                    }}
                    className={`py-2 px-1 text-xs rounded-lg font-medium transition-colors ${
                      (userSettings.excluded_weekdays || []).includes(day.value)
                        ? "bg-red-500 text-white"
                        : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                    }`}
                  >
                    {day.label.substring(0, 1)}
                  </button>
                ))}
              </div>
            </div>

            {/* 자동 슬라이드 시간 */}
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="text-white font-medium">자동 슬라이드 시간</label>
                <span className="text-blue-400 font-bold">
                  {formatTime(userSettings.auto_slide_interval)}
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="30000"
                step="500"
                value={userSettings.auto_slide_interval}
                onChange={(e) =>
                  updateLocalSettings({ auto_slide_interval: parseInt(e.target.value) })
                }
                className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* 재생 순서 */}
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <label className="text-white font-medium block mb-3">재생 순서</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => updateLocalSettings({ play_order: 'sequential' })}
                  className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                    userSettings.play_order === 'sequential'
                      ? "bg-blue-500 text-white"
                      : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                  }`}
                >
                  순차 재생
                </button>
                <button
                  onClick={() => updateLocalSettings({ play_order: 'random' })}
                  className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                    userSettings.play_order === 'random'
                      ? "bg-blue-500 text-white"
                      : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                  }`}
                >
                  랜덤 재생
                </button>
              </div>
            </div>

            {/* 날짜 범위 필터 */}
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <label className="text-white font-medium block mb-3">날짜 범위 필터</label>
              <p className="text-sm text-gray-400 mb-3">특정 기간의 이벤트만 표시합니다</p>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-gray-400 block mb-1">시작 날짜</label>
                  <input
                    type="date"
                    value={userSettings.date_filter_start || ""}
                    onChange={(e) =>
                      updateLocalSettings({ date_filter_start: e.target.value || null })
                    }
                    className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">종료 날짜</label>
                  <input
                    type="date"
                    value={userSettings.date_filter_end || ""}
                    onChange={(e) =>
                      updateLocalSettings({ date_filter_end: e.target.value || null })
                    }
                    className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                  />
                </div>
                {(userSettings.date_filter_start || userSettings.date_filter_end) && (
                  <button
                    onClick={() =>
                      updateLocalSettings({ date_filter_start: null, date_filter_end: null })
                    }
                    className="text-sm text-red-400 hover:text-red-300"
                  >
                    날짜 범위 초기화
                  </button>
                )}
              </div>
            </div>

            {/* 비밀번호 변경 */}
            <div className="p-4 bg-gray-700/50 rounded-lg border-t border-gray-600 pt-6 mt-6">
              <label className="text-white font-medium block mb-3">비밀번호 변경</label>
              <p className="text-sm text-gray-400 mb-3">현재 비밀번호를 알고 있어야 변경 가능합니다</p>
              <div className="space-y-3">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="새 비밀번호 (최소 4자)"
                  className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호 확인"
                  className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                />
                <button
                  onClick={handleChangePassword}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                >
                  비밀번호 변경
                </button>
              </div>
            </div>

            {/* 저장 및 취소 버튼 */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={onClose}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  saveUserSettings();
                  onClose();
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  // 메인 관리자용 UI (기존 코드)
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <i className="ri-image-2-line"></i>
            메인 광고판 설정
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* 광고판 활성화/비활성화 */}
          <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
            <div className="flex-1">
              <label className="text-white font-medium block">광고판 활성화</label>
              <p className="text-sm text-gray-400 mt-1">
                광고판 기능을 전체적으로 켜거나 끕니다
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                settings.enabled ? "bg-purple-500" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  settings.enabled ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 자동 슬라이드 시간 (슬라이더) */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-medium">자동 슬라이드 시간</label>
              <span className="text-purple-400 font-bold">
                {formatTime(settings.autoSlideInterval)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              광고판 이미지가 자동으로 넘어가는 시간 간격 (1초 ~ 30초)
            </p>
            <input
              type="range"
              min="1000"
              max="30000"
              step="500"
              value={settings.autoSlideInterval}
              onChange={(e) =>
                onUpdateSettings({ autoSlideInterval: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-purple"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>1초</span>
              <span>15초</span>
              <span>30초</span>
            </div>
          </div>

          {/* 비활동 타이머 (슬라이더) */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-medium">비활동 후 자동 표시</label>
              <span className="text-purple-400 font-bold">
                {formatTime(settings.inactivityTimeout)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              사용자 활동이 없을 때 광고판을 자동으로 표시하는 시간 (0분 = 비활성 ~ 60분)
            </p>
            <input
              type="range"
              min="0"
              max="3600000"
              step="60000"
              value={settings.inactivityTimeout}
              onChange={(e) =>
                onUpdateSettings({ inactivityTimeout: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-purple"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>비활성</span>
              <span>30분</span>
              <span>60분</span>
            </div>
          </div>

          {/* 첫 방문 시 자동 표시 */}
          <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg">
            <div className="flex-1">
              <label className="text-white font-medium block">첫 방문 시 자동 표시</label>
              <p className="text-sm text-gray-400 mt-1">
                페이지를 처음 열 때 광고판을 자동으로 표시합니다
              </p>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({ autoOpenOnLoad: !settings.autoOpenOnLoad })
              }
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                settings.autoOpenOnLoad ? "bg-purple-500" : "bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  settings.autoOpenOnLoad ? "translate-x-7" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* 전환 효과 속도 (슬라이더) */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <label className="text-white font-medium">전환 효과 속도</label>
              <span className="text-purple-400 font-bold">
                {formatTime(settings.transitionDuration)}
              </span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              이미지가 전환될 때 페이드 인/아웃 효과의 속도 (0.1초 ~ 2초)
            </p>
            <input
              type="range"
              min="100"
              max="2000"
              step="50"
              value={settings.transitionDuration}
              onChange={(e) =>
                onUpdateSettings({ transitionDuration: parseInt(e.target.value) })
              }
              className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider-purple"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>0.1초</span>
              <span>1초</span>
              <span>2초</span>
            </div>
          </div>

          {/* 재생 순서 */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <label className="text-white font-medium block mb-3">재생 순서</label>
            <p className="text-sm text-gray-400 mb-4">
              광고판 이미지를 표시하는 순서를 설정합니다
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handlePlayOrderChange('sequential')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  settings.playOrder === 'sequential'
                    ? 'border-purple-500 bg-purple-500/20 text-white'
                    : 'border-gray-600 bg-gray-700/30 text-gray-300 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <i className="ri-sort-asc text-xl"></i>
                  <span className="font-medium">순차</span>
                </div>
                <p className="text-xs text-gray-400">등록 순서대로</p>
              </button>
              <button
                onClick={() => handlePlayOrderChange('random')}
                className={`p-3 rounded-lg border-2 transition-all ${
                  settings.playOrder === 'random'
                    ? 'border-purple-500 bg-purple-500/20 text-white'
                    : 'border-gray-600 bg-gray-700/30 text-gray-300 hover:border-gray-500'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <i className="ri-shuffle-line text-xl"></i>
                  <span className="font-medium">랜덤</span>
                </div>
                <p className="text-xs text-gray-400">무작위 순서</p>
              </button>
            </div>
          </div>

          {/* 날짜 범위 필터 */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <label className="text-white font-medium block mb-3">일정 날짜 범위</label>
            <p className="text-sm text-gray-400 mb-4">
              특정 기간의 일정만 광고판에 표시합니다 (미설정 시 전체 표시)
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">시작 날짜</label>
                <input
                  type="date"
                  value={settings.dateRangeStart || ''}
                  onChange={(e) => onUpdateSettings({ dateRangeStart: e.target.value || null })}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">종료 날짜</label>
                <input
                  type="date"
                  value={settings.dateRangeEnd || ''}
                  onChange={(e) => onUpdateSettings({ dateRangeEnd: e.target.value || null })}
                  className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:border-purple-500 focus:outline-none"
                />
              </div>
            </div>
            
            {/* 날짜 범위 표시 여부 */}
            <div className="flex items-center justify-between p-3 bg-gray-600/50 rounded-lg">
              <div className="flex-1">
                <label className="text-white font-medium block">날짜 범위 표시</label>
                <p className="text-sm text-gray-400 mt-1">
                  광고판에 날짜 범위를 표시합니다
                </p>
              </div>
              <button
                onClick={() =>
                  onUpdateSettings({ showDateRange: !settings.showDateRange })
                }
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  settings.showDateRange ? "bg-purple-500" : "bg-gray-600"
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                    settings.showDateRange ? "translate-x-7" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 현재 설정 요약 */}
          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <h4 className="text-white font-medium mb-3 flex items-center gap-2">
              <i className="ri-information-line"></i>
              현재 설정
            </h4>
            <div className="text-sm text-gray-300 space-y-2">
              <div className="flex justify-between">
                <span>광고판:</span>
                <span className={settings.enabled ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                  {settings.enabled ? "활성화" : "비활성화"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>슬라이드 간격:</span>
                <span className="text-purple-300 font-medium">{formatTime(settings.autoSlideInterval)}</span>
              </div>
              <div className="flex justify-between">
                <span>비활동 타이머:</span>
                <span className="text-purple-300 font-medium">{formatTime(settings.inactivityTimeout)}</span>
              </div>
              <div className="flex justify-between">
                <span>자동 표시:</span>
                <span className={settings.autoOpenOnLoad ? "text-green-400 font-medium" : "text-gray-400 font-medium"}>
                  {settings.autoOpenOnLoad ? "켜짐" : "꺼짐"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>전환 속도:</span>
                <span className="text-purple-300 font-medium">{formatTime(settings.transitionDuration)}</span>
              </div>
              <div className="flex justify-between">
                <span>재생 순서:</span>
                <span className="text-purple-300 font-medium">
                  {settings.playOrder === 'random' ? '랜덤' : '순차'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>날짜 범위:</span>
                <span className="text-purple-300 font-medium">
                  {settings.dateRangeStart && settings.dateRangeEnd
                    ? `${settings.dateRangeStart} ~ ${settings.dateRangeEnd}`
                    : '전체'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>날짜 표시:</span>
                <span className={settings.showDateRange ? "text-green-400 font-medium" : "text-gray-400 font-medium"}>
                  {settings.showDateRange ? "켜짐" : "꺼짐"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-800 border-t border-gray-700 px-6 py-4 flex items-center justify-between gap-4">
          <button
            onClick={onResetSettings}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <i className="ri-refresh-line"></i>
            기본값으로 초기화
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
          >
            완료
          </button>
        </div>
      </div>

      <style>{`
        .slider-purple::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          background: #a855f7;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
        }
        .slider-purple::-webkit-slider-thumb:hover {
          background: #9333ea;
          transform: scale(1.1);
        }
        .slider-purple::-moz-range-thumb {
          width: 20px;
          height: 20px;
          background: #a855f7;
          border-radius: 50%;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .slider-purple::-moz-range-thumb:hover {
          background: #9333ea;
          transform: scale(1.1);
        }
      `}</style>
    </div>,
    document.body
  );
}
