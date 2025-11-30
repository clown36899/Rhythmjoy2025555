import { createPortal } from "react-dom";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import type { BillboardSettings } from "../../../hooks/useBillboardSettings";
import "./AdminBillboardModal.css";

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
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

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
        <div className="abm-loading-overlay">
          <div className="abm-loading-text">로딩 중...</div>
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
      <div className="abm-sub-overlay">
        <div className="abm-sub-container">
          {/* Header - 상단 고정 */}
          <div className="abm-sub-header">
            <h2 className="abm-sub-title">
              <i className="ri-settings-3-line"></i>
              {billboardUserName} 빌보드 설정
            </h2>
          </div>

          {/* Content - 스크롤 가능 */}
          <div className="abm-sub-content"><div className="abm-sub-content-inner">
            {/* 제외 요일 */}
            <div className="abm-section-box">
              <label className="abm-section-label">제외 요일</label>
              <p className="abm-section-desc">선택한 요일의 이벤트는 표시되지 않습니다</p>
              <div className="abm-weekday-grid">
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
                    className={`abm-weekday-btn ${
                      (userSettings.excluded_weekdays || []).includes(day.value)
                        ? "abm-weekday-btn-excluded"
                        : "abm-weekday-btn-normal"
                    }`}
                  >
                    {day.label.substring(0, 1)}
                  </button>
                ))}
              </div>
            </div>

            {/* 자동 슬라이드 시간 */}
            <div className="abm-section-box">
              <label className="abm-section-label">자동 슬라이드 시간</label>
              <div className="abm-slide-control">
                <span className="abm-slide-time">
                  {formatTime(userSettings.auto_slide_interval)}
                </span>
                <div className="abm-slide-buttons">
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.min(30000, userSettings.auto_slide_interval + 500) })}
                    className="abm-slide-btn-up"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ auto_slide_interval: Math.max(1000, userSettings.auto_slide_interval - 500) })}
                    className="abm-slide-btn-down"
                  >
                    ▼
                  </button>
                </div>
              </div>
            </div>

            {/* 재생 순서 */}
            <div className="abm-play-order-hidden">
              <label className="abm-section-label">재생 순서</label>
              <div className="abm-play-order-grid">
                <button
                  onClick={() => updateLocalSettings({ play_order: 'sequential' })}
                  className={`abm-play-order-btn ${
                    userSettings.play_order === 'sequential'
                      ? "abm-play-order-btn-active"
                      : "abm-play-order-btn-inactive"
                  }`}
                >
                  <div className="abm-play-order-title">순차 재생</div>
                  <div className="abm-play-order-subtitle">등록 순서대로</div>
                </button>
                <button
                  onClick={() => updateLocalSettings({ play_order: 'random' })}
                  className={`abm-play-order-btn ${
                    userSettings.play_order === 'random'
                      ? "abm-play-order-btn-active"
                      : "abm-play-order-btn-inactive"
                  }`}
                >
                  <div className="abm-play-order-title">30분 랜덤</div>
                  <div className="abm-play-order-subtitle">30분마다 재배열</div>
                </button>
              </div>
            </div>

            {/* 날짜 범위 필터 */}
            <div className="abm-section-box">
              <label className="abm-section-label">날짜 범위 필터</label>
              <p className="abm-section-desc">특정 기간의 이벤트만 표시합니다</p>
              <div className="abm-date-filter-group">
                <div className="abm-date-filter-group">
                  <label className="abm-date-filter-label">시작 날짜</label>
                  <div className="abm-date-filter-row">
                    <div className="abm-date-input-wrapper">
                      <input
                        type="date"
                        value={userSettings.date_filter_start || todayKST}
                        min={todayKST}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_start: e.target.value || null })
                        }
                        className="abm-date-input"
                      />
                      {!userSettings.date_filter_start && (
                        <span className="abm-date-placeholder">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_start: null })}
                      className={`abm-date-clear-btn ${
                        !userSettings.date_filter_start
                          ? 'abm-date-clear-btn-active'
                          : 'abm-date-clear-btn-normal'
                      }`}
                      title="시작 날짜 제한 없음"
                    >
                      지정 안 함
                    </button>
                  </div>
                </div>
                <div className="abm-date-filter-group">
                  <label className="abm-date-filter-label">종료 날짜</label>
                  <div className="abm-date-filter-row">
                    <div className="abm-date-input-wrapper">
                      <input
                        type="date"
                        value={userSettings.date_filter_end || ""}
                        min={userSettings.date_filter_start || undefined}
                        onChange={(e) =>
                          updateLocalSettings({ date_filter_end: e.target.value || null })
                        }
                        className="abm-date-input"
                        style={!userSettings.date_filter_end ? { color: 'transparent' } : {}}
                      />
                      {!userSettings.date_filter_end && (
                        <span className="abm-date-placeholder">
                          지정안함
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => updateLocalSettings({ date_filter_end: null })}
                      className={`abm-date-clear-btn ${
                        !userSettings.date_filter_end
                          ? 'abm-date-clear-btn-active'
                          : 'abm-date-clear-btn-normal'
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
            <div className="abm-section-box">
              <div className="abm-event-exclude-header">
                <label className="abm-event-exclude-label">
                  🚫 제외할 이벤트
                </label>
                <div className="abm-event-exclude-actions">
                  <button
                    type="button"
                    onClick={() => {
                      const mediaEvents = events.filter(e => !!(e?.image_full || e?.image || e?.video_url));
                      const allIds = mediaEvents.map(e => e.id);
                      updateLocalSettings({ excluded_event_ids: allIds });
                    }}
                    className="abm-event-exclude-btn-all"
                  >
                    전체 제외
                  </button>
                  <button
                    type="button"
                    onClick={() => updateLocalSettings({ excluded_event_ids: [] })}
                    className="abm-event-exclude-btn-clear"
                  >
                    전체 해제
                  </button>
                </div>
              </div>
              <p className="abm-section-desc">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
              <div className="abm-event-list"><div className="abm-event-list-inner">
                {events.length === 0 ? (
                  <p className="abm-event-empty">표시할 이벤트가 없습니다.</p>
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
                        className={`abm-event-item ${
                          hasMedia 
                            ? (isExcluded 
                              ? 'abm-event-item-excluded' 
                              : 'abm-event-item-media')
                            : 'abm-event-item-no-media'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isExcluded}
                          onChange={() => toggleEventExclusion(event.id)}
                          disabled={!hasMedia}
                          className="abm-event-checkbox"
                        />
                        <span className={`abm-event-text ${
                          hasMedia 
                            ? (isExcluded ? 'abm-event-text-excluded' : 'abm-event-text-media')
                            : 'abm-event-text-no-media'
                        }`}>
                          {event.title}
                          <span className="abm-event-date">
                            ({event.start_date} {weekday})
                          </span>
                          {isExcluded && hasMedia && (
                            <span className="abm-event-excluded-badge">
                              [제외됨]
                            </span>
                          )}
                          {!hasMedia && (
                            <span className="abm-event-no-media-badge">
                              [이미지 없음 - 광고판 미노출]
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
          <div className="abm-sub-footer">
            <button
              onClick={handleClose}
              className="abm-sub-footer-btn-cancel"
            >
              닫기
            </button>
            <button
              onClick={saveUserSettings}
              className="abm-sub-footer-btn-save"
            >
              저장
            </button>
          </div>
        </div>

        {/* 성공 알림 모달 */}
        {showSuccessModal && (
          <div className="abm-success-overlay">
            <div className="abm-success-container">
              <div className="abm-success-content">
                <div className="abm-success-icon-wrapper">
                  <div className="abm-success-icon">
                    <i className="abm-success-icon-text ri-check-line"></i>
                  </div>
                </div>
                <p className="abm-success-message">
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
        className="abm-super-overlay"
        onClick={handleBackdropClick}
      >
        <div className="abm-super-container">
        {/* Header - 상단 고정 */}
        <div className="abm-super-header">
          <h2 className="abm-super-title">
            <i className="ri-image-2-line"></i>
            메인 광고판 설정
          </h2>
        </div>

        {/* Content - 스크롤 가능 */}
        <div className="abm-super-content"><div className="abm-super-content-inner">
          {/* 광고판 활성화/비활성화 */}
          <div className="abm-toggle-container">
            <div className="abm-toggle-content">
              <label className="abm-toggle-label">광고판 활성화</label>
              <p className="abm-toggle-desc">
                광고판 기능을 전체적으로 켜거나 끕니다
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`abm-toggle-switch ${
                settings.enabled ? "abm-toggle-switch-on" : "abm-toggle-switch-off"
              }`}
            >
              <span
                className={`abm-toggle-thumb ${
                  settings.enabled ? "abm-toggle-thumb-on" : "abm-toggle-thumb-off"
                }`}
              />
            </button>
          </div>

          {/* 자동 슬라이드 시간 (슬라이더) */}
          <div className="abm-slider-section">
            <div className="abm-slider-header">
              <label className="abm-slider-label">자동 슬라이드 시간</label>
              <span className="abm-slider-value">
                {formatTime(settings.autoSlideInterval)}
              </span>
            </div>
            <p className="abm-slider-desc">
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
              className="abm-slider-input slider-purple"
            />
            <div className="abm-slider-marks">
              <span>1초</span>
              <span>15초</span>
              <span>30초</span>
            </div>
          </div>

          {/* 비활동 타이머 (슬라이더) */}
          <div className="abm-slider-section">
            <div className="abm-slider-header">
              <label className="abm-slider-label">비활동 후 자동 표시</label>
              <span className="abm-slider-value">
                {formatTime(settings.inactivityTimeout)}
              </span>
            </div>
            <p className="abm-slider-desc">
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
              className="abm-slider-input slider-purple"
            />
            <div className="abm-slider-marks">
              <span>비활성</span>
              <span>30분</span>
              <span>60분</span>
            </div>
          </div>

          {/* 첫 방문 시 자동 표시 */}
          <div className="abm-toggle-container">
            <div className="abm-toggle-content">
              <label className="abm-toggle-label">첫 방문 시 자동 표시</label>
              <p className="abm-toggle-desc">
                페이지를 처음 열 때 광고판을 자동으로 표시합니다
              </p>
            </div>
            <button
              onClick={() =>
                onUpdateSettings({ autoOpenOnLoad: !settings.autoOpenOnLoad })
              }
              className={`abm-toggle-switch ${
                settings.autoOpenOnLoad ? "abm-toggle-switch-on" : "abm-toggle-switch-off"
              }`}
            >
              <span
                className={`abm-toggle-thumb ${
                  settings.autoOpenOnLoad ? "abm-toggle-thumb-on" : "abm-toggle-thumb-off"
                }`}
              />
            </button>
          </div>

          {/* 전환 효과 속도 (슬라이더) */}
          <div className="abm-slider-section">
            <div className="abm-slider-header">
              <label className="abm-slider-label">전환 효과 속도</label>
              <span className="abm-slider-value">
                {formatTime(settings.transitionDuration)}
              </span>
            </div>
            <p className="abm-slider-desc">
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
              className="abm-slider-input slider-purple"
            />
            <div className="abm-slider-marks">
              <span>0.1초</span>
              <span>1초</span>
              <span>2초</span>
            </div>
          </div>

          {/* 재생 순서 */}
          <div className="abm-playorder-section">
            <label className="abm-playorder-label">재생 순서</label>
            <p className="abm-playorder-desc">
              광고판 이미지를 표시하는 순서를 설정합니다
            </p>
            <div className="abm-playorder-grid">
              <button
                onClick={() => handlePlayOrderChange('sequential')}
                className={`abm-playorder-btn ${
                  settings.playOrder === 'sequential'
                    ? 'abm-playorder-btn-active'
                    : 'abm-playorder-btn-inactive'
                }`}
              >
                <div className="abm-playorder-btn-content">
                  <i className="abm-playorder-btn-icon ri-sort-asc"></i>
                  <span className="abm-playorder-btn-title">순차 재생</span>
                </div>
                <p className="abm-playorder-btn-subtitle">등록 순서대로</p>
              </button>
              <button
                onClick={() => handlePlayOrderChange('random')}
                className={`abm-playorder-btn ${
                  settings.playOrder === 'random'
                    ? 'abm-playorder-btn-active'
                    : 'abm-playorder-btn-inactive'
                }`}
              >
                <div className="abm-playorder-btn-content">
                  <i className="abm-playorder-btn-icon ri-shuffle-line"></i>
                  <span className="abm-playorder-btn-title">30분 랜덤</span>
                </div>
                <p className="abm-playorder-btn-subtitle">30분마다 재배열</p>
              </button>
            </div>
          </div>

          {/* 날짜 범위 필터 */}
          <div className="abm-daterange-section">
            <label className="abm-daterange-label">일정 날짜 범위</label>
            <p className="abm-daterange-desc">
              특정 기간의 일정만 광고판에 표시합니다 (미설정 시 전체 표시)
            </p>
            <div className="abm-daterange-inputs">
              <div className="abm-daterange-input-group">
                <label className="abm-daterange-input-label">시작 날짜</label>
                <div className="abm-daterange-input-row">
                  <div className="abm-daterange-input-wrapper">
                    <input
                      type="date"
                      value={settings.dateRangeStart || todayKST}
                      min={todayKST}
                      onChange={(e) => onUpdateSettings({ dateRangeStart: e.target.value || null })}
                      className="abm-daterange-input"
                    />
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ dateRangeStart: null })}
                    className={`abm-daterange-clear-btn ${
                      !settings.dateRangeStart
                        ? 'abm-daterange-clear-btn-active'
                        : 'abm-daterange-clear-btn-inactive'
                    }`}
                    title="시작 날짜 초기화"
                  >
                    <i className="abm-daterange-clear-icon ri-close-line"></i>
                  </button>
                </div>
              </div>
              <div className="abm-daterange-input-group">
                <label className="abm-daterange-input-label">종료 날짜</label>
                <div className="abm-daterange-input-row">
                  <div className="abm-daterange-input-wrapper">
                    <input
                      type="date"
                      value={settings.dateRangeEnd || ''}
                      min={settings.dateRangeStart || undefined}
                      onChange={(e) => onUpdateSettings({ dateRangeEnd: e.target.value || null })}
                      className="abm-daterange-input"
                      style={!settings.dateRangeEnd ? { color: 'transparent' } : {}}
                    />
                    {!settings.dateRangeEnd && (
                      <span className="abm-daterange-placeholder">
                        지정안함
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => onUpdateSettings({ dateRangeEnd: null })}
                    className={`abm-daterange-clear-btn ${
                      !settings.dateRangeEnd
                        ? 'abm-daterange-clear-btn-active'
                        : 'abm-daterange-clear-btn-inactive'
                    }`}
                    title="종료 날짜 초기화"
                  >
                    <i className="abm-daterange-clear-icon ri-close-line"></i>
                  </button>
                </div>
              </div>
            </div>
            
            {/* 날짜 범위 표시 여부 */}
            <div className="abm-daterange-toggle-container">
              <div className="abm-daterange-toggle-content">
                <label className="abm-daterange-toggle-label">날짜 범위 표시</label>
                <p className="abm-daterange-toggle-desc">
                  광고판에 날짜 범위를 표시합니다
                </p>
              </div>
              <button
                onClick={() =>
                  onUpdateSettings({ showDateRange: !settings.showDateRange })
                }
                className={`abm-toggle-switch ${
                  settings.showDateRange ? "abm-toggle-switch-on" : "abm-toggle-switch-off"
                }`}
              >
                <span
                  className={`abm-toggle-thumb ${
                    settings.showDateRange ? "abm-toggle-thumb-on" : "abm-toggle-thumb-off"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 제외 요일 */}
          <div className="abm-weekdays-section">
            <label className="abm-weekdays-label">제외 요일</label>
            <p className="abm-weekdays-desc">선택한 요일의 이벤트는 표시되지 않습니다</p>
            <div className="abm-weekdays-grid">
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
                  className={`abm-weekdays-btn ${
                    (settings.excludedWeekdays || []).includes(day.value)
                      ? "abm-weekdays-btn-excluded"
                      : "abm-weekdays-btn-normal"
                  }`}
                >
                  {day.label.substring(0, 1)}
                </button>
              ))}
            </div>
          </div>

          {/* 특정 이벤트 제외 */}
          <div className="abm-events-section">
            <label className="abm-events-label">
              🚫 제외할 이벤트
            </label>
            <p className="abm-events-desc">선택한 이벤트는 빌보드에 표시되지 않습니다 (당일 포함 이후 이벤트만 표시)</p>
            <div className="abm-events-list"><div className="abm-events-list-inner">
              {mainBillboardEvents.length === 0 ? (
                <p className="abm-events-empty">표시할 이벤트가 없습니다.</p>
              ) : (
                mainBillboardEvents.map((event) => {
                  const eventDate = new Date(event?.start_date);
                  const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                  const weekday = weekdayNames[eventDate.getDay()];
                  const hasMedia = !!(event?.image_full || event?.image || event?.video_url);
                  
                  return (
                    <label
                      key={event.id}
                      className={`abm-events-item ${
                        hasMedia ? 'abm-events-item-media' : 'abm-events-item-no-media'
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
                        className="abm-events-checkbox"
                      />
                      <span className={`abm-events-text ${hasMedia ? 'abm-events-text-white' : 'abm-events-text-gray'}`}>
                        {event.title}
                        <span className="abm-events-date">
                          ({event.start_date} {weekday})
                        </span>
                        {!hasMedia && (
                          <span className="abm-events-badge">
                            [이미지 없음 - 광고판 미노출]
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div></div>
          </div>

          {/* 현재 설정 요약 */}
          <div className="abm-summary-section">
            <h4 className="abm-summary-header">
              <i className="ri-information-line"></i>
              현재 설정
            </h4>
            <div className="abm-summary-list">
              <div className="abm-summary-row">
                <span>광고판:</span>
                <span className={settings.enabled ? "abm-summary-value-green" : "abm-summary-value-red"}>
                  {settings.enabled ? "활성화" : "비활성화"}
                </span>
              </div>
              <div className="abm-summary-row">
                <span>슬라이드 간격:</span>
                <span className="abm-summary-value-purple">{formatTime(settings.autoSlideInterval)}</span>
              </div>
              <div className="abm-summary-row">
                <span>비활동 타이머:</span>
                <span className="abm-summary-value-purple">{formatTime(settings.inactivityTimeout)}</span>
              </div>
              <div className="abm-summary-row">
                <span>자동 표시:</span>
                <span className={settings.autoOpenOnLoad ? "abm-summary-value-green" : "abm-summary-value-gray"}>
                  {settings.autoOpenOnLoad ? "켜짐" : "꺼짐"}
                </span>
              </div>
              <div className="abm-summary-row">
                <span>전환 속도:</span>
                <span className="abm-summary-value-purple">{formatTime(settings.transitionDuration)}</span>
              </div>
              <div className="abm-summary-row">
                <span>재생 순서:</span>
                <span className="abm-summary-value-purple">
                  {settings.playOrder === 'random' ? '랜덤' : '순차'}
                </span>
              </div>
              <div className="abm-summary-row">
                <span>날짜 범위:</span>
                <span className="abm-summary-value-purple">
                  {settings.dateRangeStart && settings.dateRangeEnd
                    ? `${settings.dateRangeStart} ~ ${settings.dateRangeEnd}`
                    : '전체'}
                </span>
              </div>
              <div className="abm-summary-row">
                <span>날짜 표시:</span>
                <span className={settings.showDateRange ? "abm-summary-value-green" : "abm-summary-value-gray"}>
                  {settings.showDateRange ? "켜짐" : "꺼짐"}
                </span>
              </div>
            </div>
          </div>
        </div></div>

        {/* Footer - 하단 고정 */}
        <div className="abm-super-footer">
          <button
            onClick={onResetSettings}
            className="abm-super-reset-btn"
          >
            <i className="ri-refresh-line"></i>
            기본값으로 초기화
          </button>
          <button
            onClick={onClose}
            className="abm-super-close-btn"
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
