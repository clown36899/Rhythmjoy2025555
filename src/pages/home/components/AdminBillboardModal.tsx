import { createPortal } from "react-dom";
import { useState } from "react";
import type { BillboardSettings } from "../../../hooks/useBillboardSettings";

interface AdminBillboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: BillboardSettings;
  onUpdateSettings: (updates: Partial<BillboardSettings>) => void;
  onResetSettings: () => void;
}

export default function AdminBillboardModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetSettings,
}: AdminBillboardModalProps) {
  // 재생 순서 설정 (localStorage에서 읽기)
  const [playOrder, setPlayOrder] = useState<'sequential' | 'random'>(() => {
    return (localStorage.getItem('billboardPlayOrder') as 'sequential' | 'random') || 'random';
  });

  // 재생 순서 변경 핸들러
  const handlePlayOrderChange = (newOrder: 'sequential' | 'random') => {
    setPlayOrder(newOrder);
    localStorage.setItem('billboardPlayOrder', newOrder);
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
            광고판 설정
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
                  playOrder === 'sequential'
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
                  playOrder === 'random'
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
                  {playOrder === 'random' ? '랜덤' : '순차'}
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
