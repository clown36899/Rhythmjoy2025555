import type { BillboardSettings } from "../../../hooks/useBillboardSettings";

interface AdminBillboardPanelProps {
  settings: BillboardSettings;
  onUpdateSettings: (updates: Partial<BillboardSettings>) => void;
  onResetSettings: () => void;
}

export default function AdminBillboardPanel({
  settings,
  onUpdateSettings,
  onResetSettings,
}: AdminBillboardPanelProps) {
  const formatTime = (ms: number): string => {
    if (ms === 0) return "비활성";
    const seconds = ms / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;

    if (hours >= 1) return `${hours}시간`;
    if (minutes >= 1) return `${minutes}분`;
    return `${seconds}초`;
  };

  return (
    <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg p-6 mb-6 border border-purple-500/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <i className="ri-image-2-line"></i>
          광고판 설정
        </h3>
        <button
          onClick={onResetSettings}
          className="text-sm text-purple-300 hover:text-purple-100 transition-colors"
        >
          <i className="ri-refresh-line mr-1"></i>
          기본값으로 초기화
        </button>
      </div>

      <div className="space-y-4">
        {/* 광고판 활성화/비활성화 */}
        <div className="flex items-center justify-between p-4 bg-black/30 rounded-lg">
          <div>
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

        {/* 자동 슬라이드 시간 */}
        <div className="p-4 bg-black/30 rounded-lg">
          <label className="text-white font-medium block mb-2">
            자동 슬라이드 시간
          </label>
          <p className="text-sm text-gray-400 mb-3">
            광고판 이미지가 자동으로 넘어가는 시간 간격
          </p>
          <div className="flex gap-2">
            {[3000, 5000, 10000, 15000].map((interval) => (
              <button
                key={interval}
                onClick={() => onUpdateSettings({ autoSlideInterval: interval })}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  settings.autoSlideInterval === interval
                    ? "bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {formatTime(interval)}
              </button>
            ))}
          </div>
        </div>

        {/* 비활동 타이머 */}
        <div className="p-4 bg-black/30 rounded-lg">
          <label className="text-white font-medium block mb-2">
            비활동 후 자동 표시
          </label>
          <p className="text-sm text-gray-400 mb-3">
            사용자 활동이 없을 때 광고판을 자동으로 표시하는 시간
          </p>
          <div className="flex gap-2 flex-wrap">
            {[0, 300000, 600000, 1800000, 3600000].map((timeout) => (
              <button
                key={timeout}
                onClick={() => onUpdateSettings({ inactivityTimeout: timeout })}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  settings.inactivityTimeout === timeout
                    ? "bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {formatTime(timeout)}
              </button>
            ))}
          </div>
        </div>

        {/* 첫 방문 시 자동 표시 */}
        <div className="flex items-center justify-between p-4 bg-black/30 rounded-lg">
          <div>
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

        {/* 전환 효과 속도 */}
        <div className="p-4 bg-black/30 rounded-lg">
          <label className="text-white font-medium block mb-2">
            전환 효과 속도
          </label>
          <p className="text-sm text-gray-400 mb-3">
            이미지가 전환될 때 페이드 인/아웃 효과의 속도
          </p>
          <div className="flex gap-2">
            {[150, 300, 500, 800].map((duration) => (
              <button
                key={duration}
                onClick={() =>
                  onUpdateSettings({ transitionDuration: duration })
                }
                className={`px-4 py-2 rounded-lg transition-colors ${
                  settings.transitionDuration === duration
                    ? "bg-purple-500 text-white"
                    : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                }`}
              >
                {formatTime(duration)}
              </button>
            ))}
          </div>
        </div>

        {/* 현재 설정 요약 */}
        <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <h4 className="text-white font-medium mb-2">현재 설정</h4>
          <div className="text-sm text-gray-300 space-y-1">
            <p>
              • 광고판: <span className={settings.enabled ? "text-green-400" : "text-red-400"}>{settings.enabled ? "활성화" : "비활성화"}</span>
            </p>
            <p>• 슬라이드 간격: {formatTime(settings.autoSlideInterval)}</p>
            <p>• 비활동 타이머: {formatTime(settings.inactivityTimeout)}</p>
            <p>• 자동 표시: {settings.autoOpenOnLoad ? "켜짐" : "꺼짐"}</p>
            <p>• 전환 속도: {formatTime(settings.transitionDuration)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
