import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import type { BillboardSettings } from "../../../hooks/useBillboardSettings";
import { useBillboardSettings } from "../../../hooks/useBillboardSettings";
import "../../../styles/domains/events.css";

interface AdminBillboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings?: BillboardSettings;
  onUpdateSettings?: (updates: Partial<BillboardSettings>) => void;
  onResetSettings?: () => void;
  adminType?: "super" | "sub" | null;
  billboardUserId?: string | null;
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
  end_date?: string | null;
  date: string;
  image_full?: string | null;
  image?: string | null;
  video_url?: string | null;
}

export default function AdminBillboardModal({
  isOpen,
  onClose,
  settings: propSettings,
  onUpdateSettings: propOnUpdateSettings,
  onResetSettings: propOnResetSettings,
  adminType = "super",
  billboardUserId = null,
  billboardUserName = "",
}: AdminBillboardModalProps) {
  // Hook을 사용하여 설정 로드 (props가 없을 때)
  const hookResult = useBillboardSettings();

  // Props가 제공되면 사용, 아니면 hook 사용
  const settings = propSettings || hookResult.settings;
  const onUpdateSettings = propOnUpdateSettings || hookResult.updateSettings;
  const onResetSettings = propOnResetSettings || hookResult.resetSettings;

  const [userSettings, setUserSettings] = useState<BillboardUserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<SimpleEvent[]>([]);
  const [mainBillboardEvents, setMainBillboardEvents] = useState<SimpleEvent[]>([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // 한국 시간 기준 오늘 날짜 (KST = UTC+9)
  const getTodayKST = () => {
    const today = new Date();
    const koreaOffset = 9 * 60;
    const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
    return koreaTime.toISOString().split('T')[0];
  };
  const todayKST = getTodayKST();

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

      // end_date도 함께 가져오기 (종료일 기준 필터링을 위해)
      const { data, error } = await supabase
        .from('events')
        .select('id, title, start_date, end_date, date, image_full, image, video_url')
        .order('start_date', { ascending: true });

      if (error) throw error;

      // 날짜 필터 적용 (종료일 기준)
      let filteredByDate = data || [];
      if (startDate) {
        filteredByDate = filteredByDate.filter(event => {
          // 종료일이 있으면 종료일 기준, 없으면 시작일 기준
          const endDateStr = event.end_date || event.start_date;
          return endDateStr >= startDate;
        });
      }
      if (endDate) {
        filteredByDate = filteredByDate.filter(event => {
          // 시작일이 종료 날짜 이전이어야 함
          return event.start_date <= endDate;
        });
      }

      // 제외 요일 필터 적용
      const excludedWeekdays = userSettings.excluded_weekdays || [];
      const filteredEvents = filteredByDate.filter(event => {
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
        .eq("billboard_user_id", billboardUserId)
        .maybeSingle();

      if (error) throw error;

      // DB에서 로드 (null 유지, UI에서만 오늘 표시)
      const settings = data || {
        id: billboardUserId,
        billboard_user_id: billboardUserId,
        excluded_weekdays: [],
        excluded_event_ids: [],
        date_filter_start: null,
        date_filter_end: null,
        auto_slide_interval: 5000,
        play_order: 'sequential',
      };

      console.log('[서브관리자 설정] 로드 완료:', {
        excluded_event_ids: settings.excluded_event_ids || [],
        count: (settings.excluded_event_ids || []).length,
        date_filter_start: settings.date_filter_start
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
        <div className="AdminBillboardModal ABM-loading-overlay">
          <div className="ABM-loading-text">로딩 중...</div>
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
      <div className="AdminBillboardModal ABM-sub-overlay">
        <div className="ABM-sub-container">
          {/* Header - 상단 고정 */}
          <div className="ABM-sub-header">
            <h2 className="ABM-sub-title">
              <i className="ri-settings-3-line"></i>
              {billboardUserName} 빌보드 설정
            </h2>
          </div>

          {/* Content - 스크롤 가능 */}
          <div className="ABM-sub-content"><div className="ABM-sub-content-inner">
            {/* 제외 요일 */}
            <div className="ABM-section-box">
              <label className="ABM-section-label">제외 요일</label>
              <p className="ABM-section-desc">선택한 요일의 이벤트는 표시되지 않습니다</p>
              <div className="ABM-weekday-grid">
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
                    className={`ABM-weekday-btn ${(userSettings.excluded_weekdays || []).includes(day.value)
                      ? "ABM-weekday-btn-excluded"
                      : "ABM-weekday-btn-normal"
                      }`}
                  >
                    {day.label.substring(0, 1)}
                  </button>
                ))}
              </div>
            </div>

            {/* 자동 슬라이드 시간 */}
            <div className="ABM-section-box">
              <label className="ABM-section-label">자동 슬라이드 시간</label>
              <div className="ABM-slide-control">
                <span className="ABM-slide-time">
                  {formatTime(userSettings.auto_slide_interval)}
                </span>
                <div className="ABM-slide-buttons">
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.min(30000, userSettings.auto_slide_interval + 500) })}
                    className="ABM-slide-btn-up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.max(1000, userSettings.auto_slide_interval - 500) })}
                    className="ABM-slide-btn-down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* 재생 순서 */}
            <div className="ABM-play-order-hidden">
              <label className="ABM-section-label">재생 순서</label>
              <div className="ABM-play-order-grid">
                <button
                  onClick={() => updateLocalSettings({ play_order: 'sequential' })}
                  className={`ABM-play-order-btn ${userSettings.play_order === 'sequential'
                    ? "ABM-play-order-btn-active"
                    : "ABM-play-order-btn-inactive"
                    }`}
                >
                  <div className="ABM-play-order-title">순차 재생</div>
                  <div className="ABM-play-order-subtitle">등록 순서대로</div>
                </button>
                <button
                  onClick={() => updateLocalSettings({ play_order: 'random' })}
                  className={`ABM-play-order-btn ${userSettings.play_order === 'random'
                    ? "ABM-play-order-btn-active"
                    : "ABM-play-order-btn-inactive"
                    }`}
                >
                  <div className="ABM-play-order-title">30분 랜덤</div>
                  <div className="ABM-play-order-subtitle">30분마다 재배열</div>
                </button>
              </div>
            </div>

            {/* 날짜 범위 필터 */}
            <div className="ABM-section-box">
              <label className="ABM-section-label">날짜 범위 필터</label>
              <p className="ABM-section-desc">특정 기간의 이벤트만 표시합니다</p>
              <div className="ABM-date-filter-group">
                <div className="ABM-date-filter-group">
                  <label className="ABM-date-filter-label">시작 날짜</label>
                  <div className="ABM-date-filter-row">
                    <div className="ABM-date-input-wrapper">
                      <input
                        type="date"
                        value={userSettings.date_filter_start || todayKST}
                        min={todayKST}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_start: e.target.value || null })
                        }
                        className="ABM-date-input"
                      />
                      {!userSettings.date_filter_start && (
                        <span className="ABM-date-placeholder">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_start: null })}
                      className={`ABM-date-clear-btn ${!userSettings.date_filter_start
                        ? 'ABM-date-clear-btn-active'
                        : 'ABM-date-clear-btn-normal'
                        }`}
                      title="시작 날짜 제한 없음"
                    >
                      지정 안 함
                    </button>
                  </div>
                </div>
                <div className="ABM-date-filter-group">
                  <label className="ABM-date-filter-label">종료 날짜</label>
                  <div className="ABM-date-filter-row">
                    <div className="ABM-date-input-wrapper">
                      <input
                        type="date"
                        value={userSettings.date_filter_end || ""}
                        min={userSettings.date_filter_start || undefined}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_end: e.target.value || null })
                        }
                        className="ABM-date-input"
                        style={!userSettings.date_filter_end ? { color: 'transparent' } : {}}
                      />
                      {!userSettings.date_filter_end && (
                        <span className="ABM-date-placeholder">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_end: null })}
                      className={`ABM-date-clear-btn ${!userSettings.date_filter_end
                        ? 'ABM-date-clear-btn-active'
                        : 'ABM-date-clear-btn-normal'
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
            <div className="ABM-section-box">
              <div className="ABM-event-exclude-header">
                <label className="ABM-event-exclude-label">
                  🚫 제외할 이벤트
                </label>
                <div className="ABM-event-exclude-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const mediaEvents = events.filter(e => !!(e?.image_full || e?.image || e?.video_url));
                      const allIds = mediaEvents.map(e => e.id);
                      updateLocalSettings({ excluded_event_ids: allIds });
                    }}
                    className="ABM-event-exclude-btn-all"
                  >
                    전체 제외
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ excluded_event_ids: [] })}
                    className="ABM-event-exclude-btn-clear"
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <p className="ABM-section-desc">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
              <div className="ABM-event-list"><div className="ABM-event-list-inner">
                {events.length === 0 ? (
                  <p className="ABM-event-empty">표시할 이벤트가 없습니다.</p>
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
                        className={`ABM-event-item ${hasMedia
                          ? (isExcluded
                            ? 'ABM-event-item-excluded'
                            : 'ABM-event-item-media')
                          : 'ABM-event-item-no-media'
                          }`}
                      >
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={() => toggleEventExclusion(event.id)}
                          disabled={!hasMedia}
                          className="ABM-event-checkbox"
                        />
                        <span className={`ABM-event-text ${hasMedia
                          ? (isExcluded ? 'ABM-event-text-excluded' : 'ABM-event-text-media')
                          : 'ABM-event-text-no-media'
                          }`}>
                          {event.title}
                          <span className="ABM-event-date">
                            ({event.start_date} {weekday})
                          </span>
                          {isExcluded && hasMedia && (
                            <span className="ABM-event-excluded-badge">
                              [제외됨]
                            </span>
                          )}
                          {!hasMedia && (
                            <span className="ABM-event-no-media-badge">
                              [이미지 없음 - 댄스빌보드 미노출]
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div></div>
            </div>
          </div></div>

          {/* 저장 및 닫기 버튼 - 하단 고정 */}
          <div className="ABM-sub-footer">
            <button
              onClick={handleClose}
              className="ABM-sub-footer-btn-cancel"
            >
              닫기
            </button>
            <button
              onClick={saveUserSettings}
              className="ABM-sub-footer-btn-save"
            >
              저장
            </button>
          </div>
        </div>

        {/* 성공 알림 모달 */}
        {showSuccessModal && (
          <div className="AdminBillboardModal ABM-success-overlay">
            <div className="ABM-success-container">
              <div className="ABM-success-content">
                <div className="ABM-success-icon-wrapper">
                  <div className="ABM-success-icon">
                    <i className="ABM-success-icon-text ri-check-line"></i>
                  </div>
                </div>
                <p className="ABM-success-message">
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
        className="AdminBillboardModal ABM-super-overlay"
        onClick={handleBackdropClick}
      >
        <div className="ABM-super-container">
          {/* Header - 상단 고정 */}
          <div className="ABM-super-header">
            <h2 className="ABM-super-title">
              <i className="ri-image-2-line"></i>
              메인 댄스빌보드 설정
            </h2>
          </div>

          {/* Content - 스크롤 가능 */}
          <div className="ABM-super-content"><div className="ABM-super-content-inner">
            {/* 댄스빌보드 활성화/비활성화 */}
            <div className="ABM-toggle-container">
              <div className="ABM-toggle-content">
                <label className="ABM-toggle-label">댄스빌보드 활성화</label>
                <p className="ABM-toggle-desc">
                  댄스빌보드 기능을 전체적으로 켜거나 끕니다
                </p>
              </div>
              <button
                onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
                className={`ABM-toggle-switch ${settings.enabled ? "ABM-toggle-switch-on" : "ABM-toggle-switch-off"
                  }`}
              >
                <span
                  className={`ABM-toggle-thumb ${settings.enabled ? "ABM-toggle-thumb-on" : "ABM-toggle-thumb-off"
                    }`}
                />
              </button>
            </div>

            {/* 자동 슬라이드 시간 (슬라이더) */}
            <div className="ABM-slider-section">
              <div className="ABM-slider-header">
                <label className="ABM-slider-label">자동 슬라이드 시간</label>
                <span className="ABM-slider-value">
                  {formatTime(settings.autoSlideInterval)}
                </span>
              </div>
              <p className="ABM-slider-desc">
                댄스빌보드 이미지가 자동으로 넘어가는 시간 간격 (1초 ~ 30초)
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
                className="ABM-slider-input slider-purple"
              />
              <div className="ABM-slider-marks">
                <span>1초</span>
                <span>15초</span>
                <span>30초</span>
              </div>
            </div>

            {/* 비활동 타이머 (슬라이더) */}
            <div className="ABM-slider-section">
              <div className="ABM-slider-header">
                <label className="ABM-slider-label">비활동 후 자동 표시</label>
                <span className="ABM-slider-value">
                  {formatTime(settings.inactivityTimeout)}
                </span>
              </div>
              <p className="ABM-slider-desc">
                사용자 활동이 없을 때 댄스빌보드을 자동으로 표시하는 시간 (0분 = 비활성 ~ 60분)
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
                className="ABM-slider-input slider-purple"
              />
              <div className="ABM-slider-marks">
                <span>비활성</span>
                <span>30분</span>
                <span>60분</span>
              </div>
            </div>

            {/* 첫 방문 시 자동 표시 */}
            <div className="ABM-toggle-container">
              <div className="ABM-toggle-content">
                <label className="ABM-toggle-label">첫 방문 시 자동 표시</label>
                <p className="ABM-toggle-desc">
                  페이지를 처음 열 때 댄스빌보드을 자동으로 표시합니다
                </p>
              </div>
              <button
                onClick={() =>
                  onUpdateSettings({ autoOpenOnLoad: !settings.autoOpenOnLoad })
                }
                className={`ABM-toggle-switch ${settings.autoOpenOnLoad ? "ABM-toggle-switch-on" : "ABM-toggle-switch-off"
                  }`}
              >
                <span
                  className={`ABM-toggle-thumb ${settings.autoOpenOnLoad ? "ABM-toggle-thumb-on" : "ABM-toggle-thumb-off"
                    }`}
                />
              </button>
            </div>

            {/* 전환 효과 속도 (슬라이더) */}
            <div className="ABM-slider-section">
              <div className="ABM-slider-header">
                <label className="ABM-slider-label">전환 효과 속도</label>
                <span className="ABM-slider-value">
                  {formatTime(settings.transitionDuration)}
                </span>
              </div>
              <p className="ABM-slider-desc">
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
                className="ABM-slider-input slider-purple"
              />
              <div className="ABM-slider-marks">
                <span>0.1초</span>
                <span>1초</span>
                <span>2초</span>
              </div>
            </div>

            {/* 재생 순서 */}
            <div className="ABM-playorder-section">
              <label className="ABM-playorder-label">재생 순서</label>
              <p className="ABM-playorder-desc">
                댄스빌보드 이미지를 표시하는 순서를 설정합니다
              </p>
              <div className="ABM-playorder-grid">
                <button
                  onClick={() => handlePlayOrderChange('sequential')}
                  className={`ABM-playorder-btn ${settings.playOrder === 'sequential'
                    ? 'ABM-playorder-btn-active'
                    : 'ABM-playorder-btn-inactive'
                    }`}
                >
                  <div className="ABM-playorder-btn-content">
                    <i className="ABM-playorder-btn-icon ri-sort-asc"></i>
                    <span className="ABM-playorder-btn-title">순차 재생</span>
                  </div>
                  <p className="ABM-playorder-btn-subtitle">등록 순서대로</p>
                </button>
                <button
                  onClick={() => handlePlayOrderChange('random')}
                  className={`ABM-playorder-btn ${settings.playOrder === 'random'
                    ? 'ABM-playorder-btn-active'
                    : 'ABM-playorder-btn-inactive'
                    }`}
                >
                  <div className="ABM-playorder-btn-content">
                    <i className="ABM-playorder-btn-icon ri-shuffle-line"></i>
                    <span className="ABM-playorder-btn-title">30분 랜덤</span>
                  </div>
                  <p className="ABM-playorder-btn-subtitle">30분마다 재배열</p>
                </button>
              </div>
            </div>

            {/* 날짜 범위 필터 */}
            <div className="ABM-daterange-section">
              <label className="ABM-daterange-label">일정 날짜 범위</label>
              <p className="ABM-daterange-desc">
                특정 기간의 일정만 댄스빌보드에 표시합니다 (미설정 시 전체 표시)
              </p>
              <div className="ABM-daterange-inputs">
                <div className="ABM-daterange-input-group">
                  <label className="ABM-daterange-input-label">시작 날짜</label>
                  <div className="ABM-daterange-input-row">
                    <div className="ABM-daterange-input-wrapper">
                      <input
                        type="date"
                        value={settings.dateRangeStart || todayKST}
                        min={todayKST}
                        onChange={(e) => onUpdateSettings({ dateRangeStart: e.target.value || null })}
                        className="ABM-daterange-input"
                      />
                    </div>
                    <button
                      onClick={() => onUpdateSettings({ dateRangeStart: null })}
                      className={`ABM-daterange-clear-btn ${!settings.dateRangeStart
                        ? 'ABM-daterange-clear-btn-active'
                        : 'ABM-daterange-clear-btn-inactive'
                        }`}
                      title="시작 날짜 초기화"
                    >
                      <i className="ABM-daterange-clear-icon ri-close-line"></i>
                    </button>
                  </div>
                </div>
                <div className="ABM-daterange-input-group">
                  <label className="ABM-daterange-input-label">종료 날짜</label>
                  <div className="ABM-daterange-input-row">
                    <div className="ABM-daterange-input-wrapper">
                      <input
                        type="date"
                        value={settings.dateRangeEnd || ''}
                        min={settings.dateRangeStart || undefined}
                        onChange={(e) => onUpdateSettings({ dateRangeEnd: e.target.value || null })}
                        className="ABM-daterange-input"
                        style={!settings.dateRangeEnd ? { color: 'transparent' } : {}}
                      />
                      {!settings.dateRangeEnd && (
                        <span className="ABM-daterange-placeholder">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => onUpdateSettings({ dateRangeEnd: null })}
                      className={`ABM-daterange-clear-btn ${!settings.dateRangeEnd
                        ? 'ABM-daterange-clear-btn-active'
                        : 'ABM-daterange-clear-btn-inactive'
                        }`}
                      title="종료 날짜 초기화"
                    >
                      <i className="ABM-daterange-clear-icon ri-close-line"></i>
                    </button>
                  </div>
                </div>
              </div>

              {/* 날짜 범위 표시 여부 */}
              <div className="ABM-daterange-toggle-container">
                <div className="ABM-daterange-toggle-content">
                  <label className="ABM-daterange-toggle-label">날짜 범위 표시</label>
                  <p className="ABM-daterange-toggle-desc">
                    댄스빌보드에 날짜 범위를 표시합니다
                  </p>
                </div>
                <button
                  onClick={() =>
                    onUpdateSettings({ showDateRange: !settings.showDateRange })
                  }
                  className={`ABM-toggle-switch ${settings.showDateRange ? "ABM-toggle-switch-on" : "ABM-toggle-switch-off"
                    }`}
                >
                  <span
                    className={`ABM-toggle-thumb ${settings.showDateRange ? "ABM-toggle-thumb-on" : "ABM-toggle-thumb-off"
                      }`}
                  />
                </button>
              </div>
            </div>

            {/* 제외 요일 */}
            <div className="ABM-weekdays-section">
              <label className="ABM-weekdays-label">제외 요일</label>
              <p className="ABM-weekdays-desc">선택한 요일의 이벤트는 표시되지 않습니다</p>
              <div className="ABM-weekdays-grid">
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
                    className={`ABM-weekdays-btn ${(settings.excludedWeekdays || []).includes(day.value)
                      ? "ABM-weekdays-btn-excluded"
                      : "ABM-weekdays-btn-normal"
                      }`}
                  >
                    {day.label.substring(0, 1)}
                  </button>
                ))}
              </div>
            </div>

            {/* 특정 이벤트 제외 */}
            <div className="ABM-events-section">
              <label className="ABM-events-label">
                🚫 제외할 이벤트
              </label>
              <p className="ABM-events-desc">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
              <div className="ABM-events-list"><div className="ABM-events-list-inner">
                {mainBillboardEvents.length === 0 ? (
                  <p className="ABM-events-empty">표시할 이벤트가 없습니다.</p>
                ) : (
                  mainBillboardEvents.map((event) => {
                    const eventDate = new Date(event?.start_date);
                    const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                    const weekday = weekdayNames[eventDate.getDay()];
                    const hasMedia = !!(event?.image_full || event?.image || event?.video_url);

                    return (
                      <label
                        key={event.id}
                        className={`ABM-events-item ${hasMedia ? 'ABM-events-item-media' : 'ABM-events-item-no-media'
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
                          className="ABM-events-checkbox"
                        />
                        <span className={`ABM-events-text ${hasMedia ? 'ABM-events-text-white' : 'ABM-events-text-gray'}`}>
                          {event.title}
                          <span className="ABM-events-date">
                            ({event.start_date} {weekday})
                          </span>
                          {!hasMedia && (
                            <span className="ABM-events-badge">
                              [이미지 없음 - 댄스빌보드 미노출]
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })
                )}
              </div></div>
            </div>

            {/* 기본 썸네일 설정 */}
            <div className="ABM-section-box" style={{ marginTop: '20px', marginBottom: '20px' }}>
              <h4 className="ABM-summary-header">
                <i className="ri-image-edit-line"></i>
                기본 썸네일 설정
              </h4>
              <p className="ABM-section-desc">
                이미지가 없는 이벤트에 표시될 기본 이미지를 설정합니다. (자동 최적화 적용됨)
              </p>

              <DefaultThumbnailUploader
                label="강습(Class) 기본 썸네일"
                currentUrl={settings.defaultThumbnailClass}
                onUpload={async (file) => {
                  const { createResizedImages } = await import('../../../utils/imageResize');
                  const resized = await createResizedImages(file);
                  // 썸네일용(400px) 이미지만 사용하거나, 원본 대신 최적화된 full 이미지를 사용
                  // 여기서는 트래픽 절감을 위해 'thumbnail' 버전(400px)을 기본 이미지로 저장
                  const targetImage = resized.thumbnail || resized.medium || resized.full;

                  if (!targetImage) throw new Error("Image resizing failed");

                  // Storage 업로드
                  const fileName = `default-thumbnail-class-${Date.now()}.webp`;
                  const { error } = await supabase.storage
                    .from('images')
                    .upload(`default-thumbnails/${fileName}`, targetImage, {
                      contentType: 'image/webp',
                      upsert: true
                    });

                  if (error) throw error;

                  // Public URL 가져오기
                  const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(`default-thumbnails/${fileName}`);

                  onUpdateSettings({ defaultThumbnailClass: publicUrl });
                }}
              />

              <div style={{ height: '16px' }} />

              <DefaultThumbnailUploader
                label="행사(Event) 기본 썸네일"
                currentUrl={settings.defaultThumbnailEvent}
                onUpload={async (file) => {
                  const { createResizedImages } = await import('../../../utils/imageResize');
                  const resized = await createResizedImages(file);
                  const targetImage = resized.thumbnail || resized.medium || resized.full;

                  if (!targetImage) throw new Error("Image resizing failed");

                  const fileName = `default-thumbnail-event-${Date.now()}.webp`;
                  const { error } = await supabase.storage
                    .from('images')
                    .upload(`default-thumbnails/${fileName}`, targetImage, {
                      contentType: 'image/webp',
                      upsert: true
                    });

                  if (error) throw error;

                  const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(`default-thumbnails/${fileName}`);

                  onUpdateSettings({ defaultThumbnailEvent: publicUrl });
                }}
              />
            </div>

            {/* 현재 설정 요약 */}
            <div className="ABM-summary-section">
              <h4 className="ABM-summary-header">
                <i className="ri-information-line"></i>
                현재 설정
              </h4>
              <div className="ABM-summary-list">
                <div className="ABM-summary-row">
                  <span>댄스빌보드:</span>
                  <span className={settings.enabled ? "ABM-summary-value-green" : "ABM-summary-value-red"}>
                    {settings.enabled ? "활성화" : "비활성화"}
                  </span>
                </div>
                <div className="ABM-summary-row">
                  <span>슬라이드 간격:</span>
                  <span className="ABM-summary-value-purple">{formatTime(settings.autoSlideInterval)}</span>
                </div>
                <div className="ABM-summary-row">
                  <span>비활동 타이머:</span>
                  <span className="ABM-summary-value-purple">{formatTime(settings.inactivityTimeout)}</span>
                </div>
                <div className="ABM-summary-row">
                  <span>자동 표시:</span>
                  <span className={settings.autoOpenOnLoad ? "ABM-summary-value-green" : "ABM-summary-value-gray"}>
                    {settings.autoOpenOnLoad ? "켜짐" : "꺼짐"}
                  </span>
                </div>
                <div className="ABM-summary-row">
                  <span>전환 속도:</span>
                  <span className="ABM-summary-value-purple">{formatTime(settings.transitionDuration)}</span>
                </div>
                <div className="ABM-summary-row">
                  <span>재생 순서:</span>
                  <span className="ABM-summary-value-purple">
                    {settings.playOrder === 'random' ? '랜덤' : '순차'}
                  </span>
                </div>
                <div className="ABM-summary-row">
                  <span>날짜 범위:</span>
                  <span className="ABM-summary-value-purple">
                    {settings.dateRangeStart && settings.dateRangeEnd
                      ? `${settings.dateRangeStart} ~ ${settings.dateRangeEnd}`
                      : '전체'}
                  </span>
                </div>
                <div className="ABM-summary-row">
                  <span>날짜 표시:</span>
                  <span className={settings.showDateRange ? "ABM-summary-value-green" : "ABM-summary-value-gray"}>
                    {settings.showDateRange ? "켜짐" : "꺼짐"}
                  </span>
                </div>
              </div>
            </div>
          </div></div>

          {/* Footer - 하단 고정 */}
          <div className="ABM-super-footer">
            <button
              onClick={onResetSettings}
              className="ABM-super-reset-btn"
            >
              <i className="ri-refresh-line"></i>
              기본값으로 초기화
            </button>
            <button
              onClick={onClose}
              className="ABM-super-close-btn"
            >
              완료
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

// ----------------------------------------------------------------------
// Helper Component: Default Thumbnail Uploader
// ----------------------------------------------------------------------
function DefaultThumbnailUploader({
  label,
  currentUrl,
  onUpload,
}: {
  label: string;
  currentUrl?: string;
  onUpload: (file: File) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    try {
      setUploading(true);
      await onUpload(file);
      alert('기본 썸네일이 변경되었습니다.');
    } catch (error) {
      console.error('Upload failed:', error);
      alert('업로드에 실패했습니다.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="ABM-thumbnail-uploader">
      <label className="ABM-thumbnail-label">{label}</label>
      <div className="ABM-thumbnail-preview-area">
        {currentUrl ? (
          <img src={currentUrl} alt={label} className="ABM-thumbnail-preview" />
        ) : (
          <div className="ABM-thumbnail-placeholder">이미지 없음</div>
        )}
        <div className="ABM-thumbnail-actions">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="ABM-thumbnail-upload-btn"
          >
            {uploading ? '업로드 중...' : '변경하기'}
          </button>
          <p className="ABM-thumbnail-desc">
            * 업로드 시 자동으로 20KB 내외로 최적화됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
