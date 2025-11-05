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

interface SimpleEvent {
  id: number;
  title: string;
  start_date: string;
  date: string;
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
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [mainBillboardEvents, setMainBillboardEvents] = useState<SimpleEvent[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // 서브 관리자의 설정 불러오기
  useEffect(() => {
    if (isOpen && adminType === "sub" && billboardUserId) {
      loadUserSettings();
    }
  }, [isOpen, adminType, billboardUserId]);

  // userSettings가 로드되면 이벤트 목록 불러오기
  useEffect(() => {
    if (userSettings && adminType === "sub") {
      loadEvents();
    }
  }, [userSettings, adminType]);

  // 메인 빌보드 이벤트 목록 불러오기
  useEffect(() => {
    if (isOpen && adminType === "super") {
      loadMainBillboardEvents();
      initializeDateDefaults();
    }
  }, [isOpen, adminType, settings.excludedWeekdays, settings.dateRangeStart, settings.dateRangeEnd]);

  // 날짜 기본값 초기화 (시작: 오늘)
  const initializeDateDefaults = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 시작 날짜가 없으면 오늘로 설정
      if (!settings.dateRangeStart) {
        onUpdateSettings({ dateRangeStart: todayStr });
      }
      // 종료 날짜는 선택 사항 (미설정 시 모든 이벤트 표시)
    } catch (error) {
      console.error('날짜 기본값 초기화 실패:', error);
    }
  };

  // 메인 빌보드용 이벤트 목록 불러오기 (설정 필터 적용 후 재생될 이벤트만)
  const loadMainBillboardEvents = async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 날짜 필터 적용
      const startDate = settings.dateRangeStart || todayStr;
      const endDate = settings.dateRangeEnd;

      let query = supabase
        .from('events')
        .select('id, title, start_date, date, image_full, image, video_url')
        .gte('start_date', startDate);

      if (endDate) {
        query = query.lte('start_date', endDate);
      }

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) throw error;

      // 제외 요일 필터 적용
      const excludedWeekdays = settings.excludedWeekdays || [];
      const filteredEvents = (data || []).filter(event => {
        const eventDate = new Date(event.start_date);
        const dayOfWeek = eventDate.getDay();
        return !excludedWeekdays.includes(dayOfWeek);
      });

      setMainBillboardEvents(filteredEvents);
    } catch (error) {
      console.error('이벤트 로드 실패:', error);
    }
  };

  // 이벤트 목록 불러오기 (설정 필터 적용 후 재생될 이벤트만)
  const loadEvents = async () => {
    if (!userSettings) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 날짜 필터 적용
      const startDate = userSettings.date_filter_start || todayStr;
      const endDate = userSettings.date_filter_end;

      let query = supabase
        .from('events')
        .select('id, title, start_date, date, image_full, image, video_url')
        .gte('start_date', startDate);

      if (endDate) {
        query = query.lte('start_date', endDate);
      }

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) throw error;

      // 제외 요일 필터 적용
      const excludedWeekdays = userSettings.excluded_weekdays || [];
      const filteredEvents = (data || []).filter(event => {
        const eventDate = new Date(event.start_date);
        const dayOfWeek = eventDate.getDay();
        return !excludedWeekdays.includes(dayOfWeek);
      });

      setEvents(filteredEvents);
    } catch (error) {
      console.error('이벤트 로드 실패:', error);
    }
  };

  const loadUserSettings = async () => {
    if (!billboardUserId) return;
    
    console.log('[서브관리자 설정] 로드 시작:', billboardUserId);
    
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

      // 초기 날짜 설정값 계산
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const settings = data || {
        id: billboardUserId,
        billboard_user_id: billboardUserId,
        excluded_weekdays: [],
        excluded_event_ids: [],
        date_filter_start: todayStr,
        date_filter_end: null, // 종료 날짜는 선택 사항
        auto_slide_interval: 5000,
        play_order: 'sequential',
      };
      
      console.log('[서브관리자 설정] 로드 완료:', {
        excluded_event_ids: settings.excluded_event_ids || [],
        count: (settings.excluded_event_ids || []).length
      });
      
      setUserSettings(settings);
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
    
    // 요일/날짜 필터가 변경되면 이벤트 목록 다시 로드
    if (updates.excluded_weekdays !== undefined || 
        updates.date_filter_start !== undefined || 
        updates.date_filter_end !== undefined) {
      // 다음 렌더링에서 useEffect가 실행되도록 하기 위해
      // 여기서는 아무것도 하지 않음 (useEffect가 처리)
    }
  };

  // 특정 이벤트 제외 토글
  const toggleEventExclusion = (eventId: number) => {
    if (!userSettings) return;
    
    console.log('[서브 이벤트 토글] 시작:', eventId);
    
    const currentExcluded = userSettings.excluded_event_ids || [];
    const isCurrentlyExcluded = currentExcluded.includes(eventId);
    const newExcluded = isCurrentlyExcluded
      ? currentExcluded.filter(id => id !== eventId)
      : [...currentExcluded, eventId];
    
    console.log('[서브 이벤트 토글] 완료:', {
      eventId,
      action: isCurrentlyExcluded ? '제거' : '추가',
      이전: currentExcluded,
      새로운: newExcluded
    });
    
    updateLocalSettings({ excluded_event_ids: newExcluded });
  };

  // DB에 저장 후 모달 닫기
  const saveUserSettings = async () => {
    if (!billboardUserId || !userSettings) return;

    console.log('[서브 설정 저장]', {
      excluded_event_ids: userSettings.excluded_event_ids,
      count: (userSettings.excluded_event_ids || []).length
    });

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
      
      setSuccessMessage("설정이 저장되었습니다.");
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
        // 모달을 닫지 않음 - 계속 설정 편집 가능
      }, 1500);
    } catch (error) {
      console.error("설정 저장 오류:", error);
      setSuccessMessage("설정 저장 중 오류가 발생했습니다.");
      setShowSuccessModal(true);
      setTimeout(() => {
        setShowSuccessModal(false);
      }, 2000);
    }
  };

  // 닫기 버튼 클릭 시 변경사항 무시
  const handleClose = () => {
    loadUserSettings(); // 원래 설정으로 복원
    onClose();
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
        <div className="fixed inset-0 z-[99999999] bg-black/60 backdrop-blur-sm flex items-center justify-center">
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
        className="fixed inset-0 z-[99999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
          {/* Header - 상단 고정 */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <i className="ri-settings-3-line"></i>
              {billboardUserName} 빌보드 설정
            </h2>
          </div>

          {/* Content - 스크롤 가능 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
              <label className="text-white font-medium block mb-3">자동 슬라이드 시간</label>
              <div className="flex items-center gap-3 bg-gray-600 rounded-lg px-4 py-3">
                <span className="text-white text-2xl font-bold flex-1 text-center">
                  {formatTime(userSettings.auto_slide_interval)}
                </span>
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.min(30000, userSettings.auto_slide_interval + 500) })}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.max(1000, userSettings.auto_slide_interval - 500) })}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* 재생 순서 */}
            <div className="hidden p-4 bg-gray-700/50 rounded-lg">
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
                  <div className="text-sm font-semibold">순차 재생</div>
                  <div className="text-xs text-gray-300 mt-1">등록 순서대로</div>
                </button>
                <button
                  onClick={() => updateLocalSettings({ play_order: 'random' })}
                  className={`py-3 px-4 rounded-lg font-medium transition-colors ${
                    userSettings.play_order === 'random'
                      ? "bg-blue-500 text-white"
                      : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                  }`}
                >
                  <div className="text-sm font-semibold">30분 랜덤</div>
                  <div className="text-xs text-gray-300 mt-1">30분마다 재배열</div>
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
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="date"
                        value={userSettings.date_filter_start || ""}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_start: e.target.value || null })
                        }
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                        style={!userSettings.date_filter_start ? { color: 'transparent' } : {}}
                      />
                      {!userSettings.date_filter_start && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_start: null })}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        !userSettings.date_filter_start
                          ? 'bg-orange-700 text-white'
                          : 'bg-orange-600 hover:bg-orange-700 text-white'
                      }`}
                      title="시작 날짜 제한 없음"
                    >
                      지정 안 함
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-sm text-gray-400 block mb-1">종료 날짜</label>
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <input
                        type="date"
                        value={userSettings.date_filter_end || ""}
                        min={userSettings.date_filter_start || undefined}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_end: e.target.value || null })
                        }
                        className="w-full bg-gray-600 text-white rounded-lg px-3 py-2"
                        style={!userSettings.date_filter_end ? { color: 'transparent' } : {}}
                      />
                      {!userSettings.date_filter_end && (
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_end: null })}
                      className={`px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                        !userSettings.date_filter_end
                          ? 'bg-orange-700 text-white'
                          : 'bg-orange-600 hover:bg-orange-700 text-white'
                      }`}
                      title="종료 날짜 제한 없음"
                    >
                      지정 안 함
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 특정 이벤트 제외 */}
            <div className="p-4 bg-gray-700/50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <label className="text-white font-medium">
                  🚫 제외할 이벤트
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const mediaEvents = events.filter(e => !!(e?.image_full || e?.image || e?.video_url));
                      const allIds = mediaEvents.map(e => e.id);
                      updateLocalSettings({ excluded_event_ids: allIds });
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    전체 제외
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ excluded_event_ids: [] })}
                    className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-400 mb-3">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
              <div className="max-h-60 overflow-y-auto bg-gray-700 rounded-lg p-3 space-y-2">
                {events.length === 0 ? (
                  <p className="text-gray-400 text-sm">표시할 이벤트가 없습니다.</p>
                ) : (
                  events.map((event) => {
                    const eventDate = new Date(event?.start_date);
                    const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                    const weekday = weekdayNames[eventDate.getDay()];
                    const hasMedia = !!(event?.image_full || event?.image || event?.video_url);
                    const isExcluded = (userSettings.excluded_event_ids || []).includes(event.id);
                    
                    return (
                      <label
                        key={event.id}
                        className={`flex items-center gap-2 p-2 rounded transition-colors ${
                          hasMedia 
                            ? (isExcluded 
                              ? 'bg-red-900/30 border border-red-500/50 cursor-pointer hover:bg-red-900/50' 
                              : 'cursor-pointer hover:bg-gray-600')
                            : 'cursor-not-allowed opacity-60'
                        }`}
                      >
                        <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 ${
                          isExcluded 
                            ? 'bg-red-600 border-red-500' 
                            : 'bg-gray-600 border-gray-500'
                        }`}>
                          {isExcluded && (
                            <i className="ri-close-line text-white text-sm font-bold"></i>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={() => toggleEventExclusion(event.id)}
                          disabled={!hasMedia}
                          className="hidden"
                        />
                        <span className={`text-sm flex-1 ${
                          hasMedia 
                            ? (isExcluded ? 'text-red-300 line-through' : 'text-white')
                            : 'text-gray-500'
                        }`}>
                          {event.title}
                          <span className="text-gray-400 text-xs ml-2">
                            ({event.start_date} {weekday})
                          </span>
                          {isExcluded && hasMedia && (
                            <span className="text-red-400 text-xs ml-2 font-bold">
                              [제외됨]
                            </span>
                          )}
                          {!hasMedia && (
                            <span className="text-red-400 text-xs ml-2">
                              [이미지 없음 - 광고판 미노출]
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* 저장 및 닫기 버튼 - 하단 고정 */}
          <div className="flex gap-3 p-6 pt-4 bg-gray-800 border-t border-gray-700 flex-shrink-0">
            <button
              onClick={handleClose}
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              닫기
            </button>
            <button
              onClick={saveUserSettings}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors"
            >
              저장
            </button>
          </div>
        </div>

        {/* 성공 알림 모달 */}
        {showSuccessModal && (
          <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-2xl">
              <div className="text-center">
                <div className="mb-4 flex justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                    <i className="ri-check-line text-3xl text-white"></i>
                  </div>
                </div>
                <p className="text-white text-lg font-semibold">
                  {successMessage}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>,
      document.body
    );
  }

  // 메인 관리자용 UI (기존 코드)
  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99999999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={handleBackdropClick}
      >
        <div className="bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 px-6 py-4 flex items-center justify-between z-10">
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
                  <span className="font-medium">순차 재생</span>
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
                  <span className="font-medium">30분 랜덤</span>
                </div>
                <p className="text-xs text-gray-400">30분마다 재배열</p>
              </button>
            </div>
          </div>

          {/* 날짜 범위 필터 */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <label className="text-white font-medium block mb-3">일정 날짜 범위</label>
            <p className="text-sm text-gray-400 mb-4">
              특정 기간의 일정만 광고판에 표시합니다 (미설정 시 전체 표시)
            </p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">시작 날짜</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="date"
                      value={settings.dateRangeStart || ''}
                      onChange={(e) => onUpdateSettings({ dateRangeStart: e.target.value || null })}
                      className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:border-purple-500 focus:outline-none"
                      style={!settings.dateRangeStart ? { color: 'transparent' } : {}}
                    />
                    {!settings.dateRangeStart && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        지정안함
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ dateRangeStart: null })}
                    className={`px-3 py-2 rounded-lg transition-colors ${
                      !settings.dateRangeStart
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                    title="시작 날짜 초기화"
                  >
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">종료 날짜</label>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type="date"
                      value={settings.dateRangeEnd || ''}
                      min={settings.dateRangeStart || undefined}
                      onChange={(e) => onUpdateSettings({ dateRangeEnd: e.target.value || null })}
                      className="w-full px-3 py-2 bg-gray-600 text-white rounded-lg border border-gray-500 focus:border-purple-500 focus:outline-none"
                      style={!settings.dateRangeEnd ? { color: 'transparent' } : {}}
                    />
                    {!settings.dateRangeEnd && (
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                        지정안함
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ dateRangeEnd: null })}
                    className={`px-3 py-2 rounded-lg transition-colors ${
                      !settings.dateRangeEnd
                        ? 'bg-orange-600 text-white'
                        : 'bg-orange-500 hover:bg-orange-600 text-white'
                    }`}
                    title="종료 날짜 초기화"
                  >
                    <i className="ri-close-line text-lg"></i>
                  </button>
                </div>
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

          {/* 제외 요일 */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <label className="text-white font-medium block mb-3">제외 요일</label>
            <p className="text-sm text-gray-400 mb-3">선택한 요일의 이벤트는 표시되지 않습니다</p>
            <div className="grid grid-cols-7 gap-2">
              {[
                { value: 0, label: "일요일" },
                { value: 1, label: "월요일" },
                { value: 2, label: "화요일" },
                { value: 3, label: "수요일" },
                { value: 4, label: "목요일" },
                { value: 5, label: "금요일" },
                { value: 6, label: "토요일" },
              ].map((day) => (
                <button
                  key={day.value}
                  onClick={() => {
                    const excluded = settings.excludedWeekdays || [];
                    const newExcluded = excluded.includes(day.value)
                      ? excluded.filter((d) => d !== day.value)
                      : [...excluded, day.value];
                    onUpdateSettings({ excludedWeekdays: newExcluded });
                  }}
                  className={`py-2 px-1 text-xs rounded-lg font-medium transition-colors ${
                    (settings.excludedWeekdays || []).includes(day.value)
                      ? "bg-red-500 text-white"
                      : "bg-gray-600 text-gray-300 hover:bg-gray-500"
                  }`}
                >
                  {day.label.substring(0, 1)}
                </button>
              ))}
            </div>
          </div>

          {/* 특정 이벤트 제외 */}
          <div className="p-4 bg-gray-700/50 rounded-lg">
            <label className="text-white font-medium block mb-3">
              🚫 제외할 이벤트
            </label>
            <p className="text-sm text-gray-400 mb-3">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
            <div className="max-h-60 overflow-y-auto bg-gray-700 rounded-lg p-3 space-y-2">
              {mainBillboardEvents.length === 0 ? (
                <p className="text-gray-400 text-sm">표시할 이벤트가 없습니다.</p>
              ) : (
                mainBillboardEvents.map((event) => {
                  const eventDate = new Date(event?.start_date);
                  const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                  const weekday = weekdayNames[eventDate.getDay()];
                  const hasMedia = !!(event?.image_full || event?.image || event?.video_url);
                  
                  return (
                    <label
                      key={event.id}
                      className={`flex items-center gap-2 p-2 rounded ${
                        hasMedia ? 'cursor-pointer hover:bg-gray-600' : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={(settings.excludedEventIds || []).includes(event.id)}
                        onChange={() => {
                          const excluded = settings.excludedEventIds || [];
                          const newExcluded = excluded.includes(event.id)
                            ? excluded.filter(id => id !== event.id)
                            : [...excluded, event.id];
                          onUpdateSettings({ excludedEventIds: newExcluded });
                        }}
                        disabled={!hasMedia}
                        className="w-4 h-4"
                      />
                      <span className={`text-sm flex-1 ${hasMedia ? 'text-white' : 'text-gray-500'}`}>
                        {event.title}
                        <span className="text-gray-400 text-xs ml-2">
                          ({event.start_date} {weekday})
                        </span>
                        {!hasMedia && (
                          <span className="text-red-400 text-xs ml-2">
                            [이미지 없음 - 광고판 미노출]
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
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
      </div>
    </div>

      {/* 성공 알림 모달 */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-[999999999] flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-lg p-6 max-w-sm w-full shadow-2xl">
            <div className="text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-3xl text-white"></i>
                </div>
              </div>
              <p className="text-white text-lg font-semibold">
                {successMessage}
              </p>
            </div>
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
