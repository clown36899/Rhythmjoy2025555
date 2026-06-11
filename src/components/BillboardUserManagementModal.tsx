import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/cafe24Client';
import type { BillboardUser, BillboardUserSettings } from '../lib/cafe24Client';
import { hashPassword } from '../utils/passwordHash';
import "./BillboardUserManagementModal.css";

interface SimpleEvent {
  id: number;
  title: string;
  start_date: string | null;
  end_date?: string | null;
  date: string | null;
  image_full?: string | null;
  image?: string | null;
  video_url?: string | null;
}

interface BillboardUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getTodayKST = () => {
  const today = new Date();
  const koreaOffset = 9 * 60;
  const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
  return koreaTime.toISOString().split('T')[0];
};

export default function BillboardUserManagementModal({
  isOpen,
  onClose,
}: BillboardUserManagementModalProps) {
  const [billboardUsers, setBillboardUsers] = useState<BillboardUser[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<BillboardUser | null>(null);
  const [selectedSettings, setSelectedSettings] = useState<BillboardUserSettings | null>(null);
  const [events, setEvents] = useState<SimpleEvent[]>([]);

  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [excludedWeekdays, setExcludedWeekdays] = useState<number[]>([]);
  const [excludedEventIds, setExcludedEventIds] = useState<number[]>([]);
  const [autoSlideInterval, setAutoSlideInterval] = useState(5000);
  const [videoPlayDuration, setVideoPlayDuration] = useState(10000);
  const [playOrder, setPlayOrder] = useState<'sequential' | 'random'>('sequential');
  const [dateFilterStart, setDateFilterStart] = useState('');
  const [dateFilterEnd, setDateFilterEnd] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const todayKST = getTodayKST();

  useEffect(() => {
    if (isOpen) {
      loadBillboardUsers();
      loadEvents();
    }
  }, [isOpen]);

  useEffect(() => {
    if (showEditModal) {
      loadEvents();
    }
  }, [excludedWeekdays, dateFilterStart, dateFilterEnd, showEditModal]);

  const loadBillboardUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('billboard_users')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setBillboardUsers(data || []);
    } catch (error) {
      console.error('빌보드 사용자 로드 실패:', error);
    }
  };

  const loadEvents = async () => {
    try {
      const query = supabase
        .from('events')
        .select('id, title, start_date, end_date, date, image_full, image, video_url');

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) throw error;

      const today = new Date();
      const koreaOffset = 9 * 60;
      const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
      koreaTime.setHours(0, 0, 0, 0);

      const filteredEvents = (data || []).filter((event) => {
        if (!event?.image_full && !event?.image && !event?.video_url) return false;
        const eventDate = new Date(event.start_date || event.date || "");
        const weekday = eventDate.getDay();
        if (excludedWeekdays.includes(weekday)) return false;

        const eventStartDate = new Date(event.start_date || event.date || "");
        eventStartDate.setHours(0, 0, 0, 0);

        if (dateFilterStart) {
          const filterStart = new Date(dateFilterStart);
          filterStart.setHours(0, 0, 0, 0);
          if (eventStartDate < filterStart) return false;
        }
        if (dateFilterEnd) {
          const filterEnd = new Date(dateFilterEnd);
          filterEnd.setHours(0, 0, 0, 0);
          if (eventStartDate > filterEnd) return false;
        }

        if (!dateFilterStart && !dateFilterEnd) {
          if (eventStartDate < koreaTime) return false;
        }
        return true;
      });

      console.log('[제외목록] 필터링 완료:', {
        전체이벤트: data?.length || 0,
        필터링후: filteredEvents.length,
        날짜필터시작: dateFilterStart || 'null',
        날짜필터종료: dateFilterEnd || 'null',
        제외요일: excludedWeekdays
      });

      setEvents(filteredEvents);
    } catch (error) {
      console.error('이벤트 로드 실패:', error);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserName.trim() || !newUserPassword.trim()) {
      alert('이름과 비밀번호를 입력하세요.');
      return;
    }

    if (newUserPassword.length < 4) {
      alert('비밀번호는 최소 4자 이상이어야 합니다.');
      return;
    }

    try {
      const passwordHash = await hashPassword(newUserPassword);

      const { data: newUser, error: userError } = await supabase
        .from('billboard_users')
        .insert({
          name: newUserName,
          password_hash: passwordHash,
          is_active: true,
        })
        .select()
        .maybeSingle();

      if (userError) throw userError;
      if (!newUser) throw new Error('User creation failed');

      const { error: settingsError } = await supabase
        .from('billboard_user_settings')
        .insert({
          billboard_user_id: newUser.id,
          excluded_weekdays: excludedWeekdays,
          excluded_event_ids: [],
          auto_slide_interval: 5000,
          video_play_duration: 10000,
          transition_duration: 500,
          play_order: 'sequential',
          date_filter_start: null,
          date_filter_end: null,
        });

      if (settingsError) throw settingsError;

      alert('빌보드 사용자가 생성되었습니다.');
      setShowCreateModal(false);
      resetCreateForm();
      loadBillboardUsers();
    } catch (error) {
      console.error('사용자 생성 실패:', error);
      alert('사용자 생성에 실패했습니다.');
    }
  };

  const handleEditUser = async (user: BillboardUser) => {
    console.log('[빌보드 편집] 시작:', user.name);
    setSelectedUser(user);

    try {
      const { data, error } = await supabase
        .from('billboard_user_settings')
        .select('*')
        .eq('billboard_user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error("Settings not found");

      setSelectedSettings(data);
      setExcludedWeekdays(data.excluded_weekdays || []);
      setExcludedEventIds(data.excluded_event_ids || []);
      setAutoSlideInterval(data.auto_slide_interval);
      setVideoPlayDuration(data.video_play_duration || 10000);
      setPlayOrder(data.play_order);
      setDateFilterStart(data.date_filter_start || '');
      setDateFilterEnd(data.date_filter_end || '');

      console.log('[빌보드 편집] 로드 완료:', {
        excluded_event_ids: data.excluded_event_ids || [],
        count: (data.excluded_event_ids || []).length
      });

      setShowEditModal(true);
    } catch (error) {
      console.error('설정 로드 실패:', error);
      alert('설정을 불러오는데 실패했습니다.');
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedUser || !selectedSettings) return;

    console.log('[빌보드 설정 저장]', {
      excluded_event_ids: excludedEventIds,
      count: excludedEventIds.length
    });

    try {
      const { error } = await supabase
        .from('billboard_user_settings')
        .update({
          excluded_weekdays: excludedWeekdays,
          excluded_event_ids: excludedEventIds,
          auto_slide_interval: autoSlideInterval,
          video_play_duration: videoPlayDuration,
          play_order: playOrder,
          date_filter_start: dateFilterStart || null,
          date_filter_end: dateFilterEnd || null,
        })
        .eq('id', selectedSettings.id);

      if (error) throw error;

      alert('설정이 저장되었습니다.');
      setShowEditModal(false);
      resetEditForm();
    } catch (error) {
      console.error('설정 저장 실패:', error);
      alert('설정 저장에 실패했습니다.');
    }
  };

  const toggleWeekday = (day: number) => {
    setExcludedWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleEvent = (eventId: number) => {
    console.log('[이벤트 토글] 시작:', eventId);

    setExcludedEventIds((prev) => {
      const isCurrentlyExcluded = prev.includes(eventId);
      const newList = isCurrentlyExcluded
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId];

      console.log('[이벤트 토글] 완료:', {
        eventId,
        action: isCurrentlyExcluded ? '제거' : '추가',
        이전: prev,
        새로운: newList
      });

      return newList;
    });
  };

  const copyBillboardUrl = async (userId: string) => {
    const url = `${window.location.origin}/billboard/${userId}`;

    try {
      await navigator.clipboard.writeText(url);
      alert(`빌보드 URL이 복사되었습니다.\n\n${url}`);
    } catch (error) {
      console.error('클립보드 복사 실패:', error);

      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();

      try {
        document.execCommand('copy');
        alert(`빌보드 URL이 복사되었습니다.\n\n${url}`);
      } catch (fallbackError) {
        alert(`복사 실패. URL을 직접 복사하세요:\n\n${url}`);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const resetCreateForm = () => {
    setNewUserName('');
    setNewUserPassword('');
    setExcludedWeekdays([]);
  };

  const resetEditForm = () => {
    setSelectedUser(null);
    setSelectedSettings(null);
    setExcludedWeekdays([]);
    setExcludedEventIds([]);
    setAutoSlideInterval(5000);
    setPlayOrder('sequential');
    setDateFilterStart('');
    setDateFilterEnd('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleChangePassword = async () => {
    if (!selectedUser) return;

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

    if (!confirm(`'${selectedUser.name}' 사용자의 비밀번호를 변경하시겠습니까?`)) {
      return;
    }

    try {
      const passwordHash = await hashPassword(newPassword);

      const { error } = await supabase
        .from('billboard_users')
        .update({ password_hash: passwordHash })
        .eq('id', selectedUser.id);

      if (error) throw error;

      alert('비밀번호가 변경되었습니다.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('비밀번호 변경 실패:', error);
      alert('비밀번호 변경에 실패했습니다.');
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="bum-overlay">
      <div className="bum-container" translate="no">
        <div className="bum-header">
          <h3 className="bum-title">빌보드 사용자 관리</h3>
          <button onClick={onClose} className="bum-close-btn">
            <i className="bum-close-icon ri-close-line"></i>
          </button>
        </div>

        <button onClick={() => setShowCreateModal(true)} className="bum-create-btn">
          <i className="ri-add-line"></i>
          새 빌보드 사용자 생성
        </button>

        <div className="bum-user-list">
          {billboardUsers.length === 0 ? (
            <p className="bum-user-empty">등록된 빌보드 사용자가 없습니다.</p>
          ) : (
            billboardUsers.map((user) => (
              <div key={user.id} className="bum-user-card">
                <div className="bum-user-info">
                  <h4 className="bum-user-name">{user.name}</h4>
                  {user.email && (
                    <p className="bum-user-email">
                      <i className="bum-user-email-icon ri-mail-line"></i>
                      {user.email}
                    </p>
                  )}
                  <p className="bum-user-url">
                    URL: /billboard/{user.id.substring(0, 8)}...
                  </p>
                </div>
                <div className="bum-user-actions">
                  <button
                    onClick={() => copyBillboardUrl(user.id)}
                    className="bum-user-copy-btn"
                    title="URL 복사"
                  >
                    <i className="ri-file-copy-line"></i>
                  </button>
                  <button onClick={() => handleEditUser(user)} className="bum-user-edit-btn">
                    설정
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {showCreateModal && createPortal(
          <div className="bum-create-overlay">
            <div className="bum-create-container">
              <h4 className="bum-create-title">새 빌보드 사용자 생성</h4>

              <div className="bum-create-form">
                <div className="bum-form-group">
                  <label className="bum-form-label">이름</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="bum-form-input"
                    placeholder="예: 강남점 빌보드"
                  />
                </div>

                <div className="bum-form-group">
                  <label className="bum-form-label">비밀번호</label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="bum-form-input"
                    placeholder="관리 페이지 접속용"
                  />
                </div>

                <div className="bum-form-group">
                  <label className="bum-form-label">제외할 요일 (선택사항)</label>
                  <div className="bum-weekday-container">
                    {weekdayNames.map((day, index) => (
                      <button
                        key={index}
                        onClick={() => toggleWeekday(index)}
                        className={`bum-weekday-btn ${excludedWeekdays.includes(index)
                          ? 'bum-weekday-btn-excluded'
                          : 'bum-weekday-btn-normal'
                          }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bum-modal-footer">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCreateForm();
                    }}
                    className="bum-footer-btn-cancel"
                  >
                    취소
                  </button>
                  <button onClick={handleCreateUser} className="bum-footer-btn-submit">
                    생성
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {showEditModal && selectedUser && createPortal(
          <div className="bum-edit-overlay">
            <div className="bum-edit-container">
              <div className="bum-edit-header">
                <h4 className="bum-edit-title">{selectedUser.name} 설정</h4>
              </div>

              <div className="bum-edit-content">
                <div className="bum-edit-form">
                  <div className="bum-form-group">
                    <label className="bum-form-label">📅 제외할 요일</label>
                    <div className="bum-weekday-container">
                      {weekdayNames.map((day, index) => (
                        <button
                          key={index}
                          onClick={() => toggleWeekday(index)}
                          className={`bum-weekday-btn ${excludedWeekdays.includes(index)
                            ? 'bum-weekday-btn-excluded'
                            : 'bum-weekday-btn-normal'
                            }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="bum-exclude-section">
                    <div className="bum-exclude-header">
                      <label className="bum-exclude-label">🚫 제외할 이벤트</label>
                      <div className="bum-exclude-actions">
                        <button
                          type="button"
                          onClick={() => {
                            const validEventIds = events
                              .filter(event => !!(event?.image_full || event?.image || event?.video_url))
                              .map(event => event.id);
                            setExcludedEventIds(validEventIds);
                          }}
                          className="bum-exclude-btn-all"
                        >
                          전체 제외
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcludedEventIds([])}
                          className="bum-exclude-btn-clear"
                        >
                          전체 해제
                        </button>
                      </div>
                    </div>
                    <p className="bum-exclude-stats">
                      총 <span className="bum-exclude-stats-blue">{events.length}개</span> 이벤트 /
                      제외 <span className="bum-exclude-stats-red">{excludedEventIds.length}개</span>
                      (미디어 있는 이벤트만 표시)
                    </p>
                    <div className="bum-exclude-list">
                      <div className="bum-exclude-list-inner">
                        {events.length === 0 ? (
                          <p className="bum-exclude-empty">표시할 이벤트가 없습니다.</p>
                        ) : (
                          events.map((event) => {
                            const eventDate = new Date(event?.start_date || event?.date || '');
                            const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                            const weekday = weekdayNames[eventDate.getDay()];
                            const hasMedia = !!(event?.image_full || event?.image || event?.video_url);
                            const isExcluded = excludedEventIds.includes(event.id);

                            return (
                              <label
                                key={event.id}
                                className={`bum-exclude-item ${hasMedia
                                  ? (isExcluded
                                    ? 'bum-exclude-item-media bum-exclude-item-excluded'
                                    : 'bum-exclude-item-media')
                                  : 'bum-exclude-item-disabled'
                                  }`}
                              >
                                {hasMedia ? (
                                  <i className={`bum-exclude-icon ${isExcluded ? 'ri-close-circle-fill bum-exclude-icon-excluded' : 'ri-checkbox-circle-line bum-exclude-icon-normal'}`}></i>
                                ) : (
                                  <i className="bum-exclude-icon bum-exclude-icon-disabled ri-checkbox-blank-circle-line"></i>
                                )}
                                <input
                                  type="checkbox"
                                  checked={isExcluded}
                                  onChange={() => toggleEvent(event.id)}
                                  disabled={!hasMedia}
                                  className="bum-exclude-checkbox"
                                />
                                <span className={`bum-exclude-text ${hasMedia
                                  ? (isExcluded ? 'bum-exclude-text-excluded' : 'bum-exclude-text-media')
                                  : 'bum-exclude-text-disabled'
                                  }`}>
                                  {event.title}
                                  <span className="bum-exclude-date">
                                    ({event.start_date || event.date} {weekday})
                                  </span>
                                  {isExcluded && hasMedia && (
                                    <span className="bum-exclude-badge-excluded">[제외됨]</span>
                                  )}
                                  {!hasMedia && (
                                    <span className="bum-exclude-badge-no-media">[이미지 없음 - 댄스빌보드 미노출]</span>
                                  )}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bum-form-group">
                    <label className="bum-form-label">⚙️ 슬라이드 간격 (초) - 일반 이벤트</label>
                    <div className="bum-slide-control">
                      <span className="bum-slide-time">{autoSlideInterval / 1000}초</span>
                      <div className="bum-slide-buttons">
                        <button
                          type="button"
                          onClick={() => setAutoSlideInterval(Math.min(60000, autoSlideInterval + 1000))}
                          className="bum-slide-btn"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => setAutoSlideInterval(Math.max(1000, autoSlideInterval - 1000))}
                          className="bum-slide-btn"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bum-form-group">
                    <label className="bum-form-label">🎬 영상 재생 시간 (초) - 영상 이벤트</label>
                    <div className="bum-slide-control">
                      <span className="bum-slide-time">{videoPlayDuration / 1000}초</span>
                      <div className="bum-slide-buttons">
                        <button
                          type="button"
                          onClick={() => setVideoPlayDuration(Math.min(60000, videoPlayDuration + 1000))}
                          className="bum-slide-btn bum-slide-btn-video"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => setVideoPlayDuration(Math.max(5000, videoPlayDuration - 1000))}
                          className="bum-slide-btn bum-slide-btn-video"
                        >
                          ▼
                        </button>
                      </div>
                    </div>
                    <p className="bum-slide-desc">영상 로딩 완료 후 재생되는 시간입니다.</p>
                  </div>

                  <div className="bum-play-order-hidden">
                    <label className="bum-form-label">🔀 재생 순서</label>
                    <div className="bum-play-order-buttons">
                      <button
                        onClick={() => setPlayOrder('sequential')}
                        className={`bum-play-order-btn ${playOrder === 'sequential'
                          ? 'bum-play-order-btn-active'
                          : 'bum-play-order-btn-inactive'
                          }`}
                      >
                        순서대로
                      </button>
                      <button
                        onClick={() => setPlayOrder('random')}
                        className={`bum-play-order-btn ${playOrder === 'random'
                          ? 'bum-play-order-btn-active'
                          : 'bum-play-order-btn-inactive'
                          }`}
                      >
                        랜덤
                      </button>
                    </div>
                  </div>

                  <div className="bum-form-group">
                    <label className="bum-form-label">📆 날짜 범위 필터</label>
                    <div className="bum-date-filter-group">
                      <div className="bum-date-filter-row">
                        <input
                          type="date"
                          value={dateFilterStart}
                          min={todayKST}
                          onChange={(e) => setDateFilterStart(e.target.value)}
                          className="bum-date-input"
                          placeholder="지정 안함"
                        />
                        <button
                          onClick={() => setDateFilterStart('')}
                          className="bum-date-clear-btn"
                        >
                          지정 안 함
                        </button>
                      </div>
                      <div className="bum-date-filter-hint">
                        <div className="bum-date-filter-row">
                          <input
                            type="date"
                            value={dateFilterEnd}
                            onChange={(e) => setDateFilterEnd(e.target.value)}
                            className="bum-date-input"
                            placeholder="종료 날짜"
                          />
                          <button
                            onClick={() => setDateFilterEnd('')}
                            className="bum-date-clear-btn"
                            title="종료 날짜 제한 없음"
                          >
                            지정 안 함
                          </button>
                        </div>
                        {!dateFilterEnd && (
                          <p className="bum-date-filter-info">
                            <i className="bum-date-filter-info-icon ri-check-line"></i>
                            종료 날짜 제한 없음 - 모든 미래 일정 표시
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bum-password-section-hidden">
                    <label className="bum-form-label">🔑 비밀번호 변경</label>
                    <div className="bum-password-form">
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="새 비밀번호 (최소 4자)"
                        className="bum-form-input"
                      />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="비밀번호 확인"
                        className="bum-form-input"
                      />
                      <button onClick={handleChangePassword} className="bum-password-change-btn">
                        비밀번호 변경
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bum-edit-footer">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetEditForm();
                  }}
                  className="bum-footer-btn-cancel"
                >
                  취소
                </button>
                <button onClick={handleSaveSettings} className="bum-footer-btn-submit">
                  저장
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>,
    document.body
  );
}
