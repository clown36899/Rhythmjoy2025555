import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import type { BillboardUser, BillboardUserSettings } from '../lib/supabase';
import { hashPassword } from '../utils/passwordHash';

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

// 한국 시간 기준 오늘 날짜 (KST = UTC+9)
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

  // 필터 설정이 변경되면 이벤트 목록 다시 로드
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
      let query = supabase
        .from('events')
        .select('id, title, start_date, end_date, date, image_full, image, video_url');

      const { data, error } = await query.order('start_date', { ascending: true });

      if (error) throw error;

      // 빌보드와 완전히 동일한 필터링 로직 (billboard/page.tsx 658-686줄)
      // 한국 시간 기준 오늘 날짜 (KST = UTC+9)
      const today = new Date();
      const koreaOffset = 9 * 60;
      const koreaTime = new Date(today.getTime() + (koreaOffset + today.getTimezoneOffset()) * 60000);
      koreaTime.setHours(0, 0, 0, 0);
      
      const filteredEvents = (data || []).filter((event) => {
        if (!event?.image_full && !event?.image && !event?.video_url) return false;
        const eventDate = new Date(event.start_date || event.date || "");
        const weekday = eventDate.getDay();
        if (excludedWeekdays.includes(weekday)) return false;
        
        // 시작날짜 기준으로 필터링 (지난 이벤트 제외)
        const eventStartDate = new Date(event.start_date || event.date || "");
        eventStartDate.setHours(0, 0, 0, 0);
        
        // 관리자 설정 날짜 범위 필터
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
        
        // 기본 필터: 시작일이 오늘 이전이면 제외 (시작일 >= 오늘만 노출)
        if (!dateFilterStart && !dateFilterEnd) {
          if (eventStartDate < koreaTime) return false;
        }
        return true;
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
        .single();

      if (userError) throw userError;

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
        .single();

      if (error) throw error;

      setSelectedSettings(data);
      setExcludedWeekdays(data.excluded_weekdays || []);
      setExcludedEventIds(data.excluded_event_ids || []);
      setAutoSlideInterval(data.auto_slide_interval);
      setVideoPlayDuration(data.video_play_duration || 10000);
      setPlayOrder(data.play_order);
      setDateFilterStart(data.date_filter_start || '');
      // null이면 빈 문자열로 설정 (종료 날짜 제한 없음)
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
      
      // Fallback: 수동 복사
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
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[99999999] p-4 pt-10 overflow-y-auto">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90svh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">빌보드 사용자 관리</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors mb-4 flex items-center justify-center gap-2"
        >
          <i className="ri-add-line"></i>
          새 빌보드 사용자 생성
        </button>

        <div className="space-y-3">
          {billboardUsers.length === 0 ? (
            <p className="text-gray-400 text-center py-8">등록된 빌보드 사용자가 없습니다.</p>
          ) : (
            billboardUsers.map((user) => (
              <div
                key={user.id}
                className="bg-gray-700 rounded-lg p-4 flex items-center justify-between"
              >
                <div className="flex-1">
                  <h4 className="text-white font-semibold">{user.name}</h4>
                  {user.email && (
                    <p className="text-gray-300 text-sm mt-0.5">
                      <i className="ri-mail-line mr-1"></i>
                      {user.email}
                    </p>
                  )}
                  <p className="text-gray-400 text-xs mt-1">
                    URL: /billboard/{user.id.substring(0, 8)}...
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyBillboardUrl(user.id)}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm transition-colors"
                    title="URL 복사"
                  >
                    <i className="ri-file-copy-line"></i>
                  </button>
                  <button
                    onClick={() => handleEditUser(user)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm transition-colors"
                  >
                    설정
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {showCreateModal && createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[999999999] p-4">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h4 className="text-xl font-bold text-white mb-4">새 빌보드 사용자 생성</h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 강남점 빌보드"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="관리 페이지 접속용"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    제외할 요일 (선택사항)
                  </label>
                  <div className="flex gap-2">
                    {weekdayNames.map((day, index) => (
                      <button
                        key={index}
                        onClick={() => toggleWeekday(index)}
                        className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                          excludedWeekdays.includes(index)
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      resetCreateForm();
                    }}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleCreateUser}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
                  >
                    생성
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

        {showEditModal && selectedUser && createPortal(
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-start justify-center z-[999999999] p-4 pt-10 overflow-y-auto">
            <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90svh] flex flex-col overflow-hidden">
              {/* Header - 상단 고정 */}
              <div className="px-6 py-4 border-b border-gray-700 flex-shrink-0">
                <h4 className="text-xl font-bold text-white">{selectedUser.name} 설정</h4>
              </div>
              
              {/* Content - 스크롤 가능 */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    📅 제외할 요일
                  </label>
                  <div className="flex gap-2">
                    {weekdayNames.map((day, index) => (
                      <button
                        key={index}
                        onClick={() => toggleWeekday(index)}
                        className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                          excludedWeekdays.includes(index)
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-gray-300 text-sm font-medium">
                      🚫 제외할 이벤트
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          // 미디어 있는 이벤트만 전체 제외
                          const validEventIds = events
                            .filter(event => !!(event?.image_full || event?.image || event?.video_url))
                            .map(event => event.id);
                          setExcludedEventIds(validEventIds);
                        }}
                        className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors font-medium"
                      >
                        전체 제외
                      </button>
                      <button
                        type="button"
                        onClick={() => setExcludedEventIds([])}
                        className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors font-medium"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">
                    총 <span className="font-bold text-blue-400">{events.length}개</span> 이벤트 (미디어 있는 이벤트만 표시)
                  </p>
                  <div className="max-h-40 overflow-y-auto bg-gray-700 rounded-lg p-3 space-y-2">
                    {events.length === 0 ? (
                      <p className="text-gray-400 text-sm">표시할 이벤트가 없습니다.</p>
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
                            className={`flex items-center gap-2 p-2 rounded ${
                              hasMedia 
                                ? (isExcluded 
                                    ? 'cursor-pointer bg-red-600/30 hover:bg-red-600/40 border border-red-500/50' 
                                    : 'cursor-pointer hover:bg-gray-600')
                                : 'cursor-not-allowed opacity-60'
                            }`}
                          >
                            {hasMedia ? (
                              <i className={`text-sm ${isExcluded ? 'ri-close-circle-fill text-red-400' : 'ri-checkbox-circle-line text-blue-400'}`}></i>
                            ) : (
                              <i className="ri-checkbox-blank-circle-line text-sm text-gray-500"></i>
                            )}
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              onChange={() => toggleEvent(event.id)}
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
                                ({event.start_date || event.date} {weekday})
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

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    ⚙️ 슬라이드 간격 (초) - 일반 이벤트
                  </label>
                  <div className="flex items-center gap-3 bg-gray-700 rounded-lg px-4 py-3">
                    <span className="text-white text-2xl font-bold flex-1 text-center">
                      {autoSlideInterval / 1000}초
                    </span>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setAutoSlideInterval(Math.min(60000, autoSlideInterval + 1000))}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => setAutoSlideInterval(Math.max(1000, autoSlideInterval - 1000))}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    🎬 영상 재생 시간 (초) - 영상 이벤트
                  </label>
                  <div className="flex items-center gap-3 bg-gray-700 rounded-lg px-4 py-3">
                    <span className="text-white text-2xl font-bold flex-1 text-center">
                      {videoPlayDuration / 1000}초
                    </span>
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => setVideoPlayDuration(Math.min(60000, videoPlayDuration + 1000))}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => setVideoPlayDuration(Math.max(5000, videoPlayDuration - 1000))}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors font-bold text-lg"
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs mt-1">
                    영상 로딩 완료 후 재생되는 시간입니다.
                  </p>
                </div>

                <div className="hidden">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    🔀 재생 순서
                  </label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setPlayOrder('sequential')}
                      className={`flex-1 py-2 rounded font-medium transition-colors ${
                        playOrder === 'sequential'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      순서대로
                    </button>
                    <button
                      onClick={() => setPlayOrder('random')}
                      className={`flex-1 py-2 rounded font-medium transition-colors ${
                        playOrder === 'random'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      랜덤
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    📆 날짜 범위 필터
                  </label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={dateFilterStart}
                        min={todayKST}
                        onChange={(e) => setDateFilterStart(e.target.value)}
                        className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="지정 안함"
                      />
                      <button
                        onClick={() => setDateFilterStart('')}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        지정 안 함
                      </button>
                    </div>
                    <div className="space-y-1">
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={dateFilterEnd}
                          onChange={(e) => setDateFilterEnd(e.target.value)}
                          className="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="종료 날짜"
                        />
                        <button
                          onClick={() => setDateFilterEnd('')}
                          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium transition-colors whitespace-nowrap"
                          title="종료 날짜 제한 없음"
                        >
                          지정 안 함
                        </button>
                      </div>
                      {!dateFilterEnd && (
                        <p className="text-xs text-green-400">
                          <i className="ri-check-line mr-1"></i>
                          종료 날짜 제한 없음 - 모든 미래 일정 표시
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 비밀번호 변경 섹션 */}
                <div className="hidden border-t border-gray-700 pt-4">
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    🔑 비밀번호 변경
                  </label>
                  <div className="space-y-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="새 비밀번호 (최소 4자)"
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="비밀번호 확인"
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleChangePassword}
                      className="w-full bg-orange-600 hover:bg-orange-700 text-white py-2 rounded-lg font-medium transition-colors"
                    >
                      비밀번호 변경
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer - 하단 고정 */}
              <div className="px-6 py-4 border-t border-gray-700 flex gap-3 flex-shrink-0">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    resetEditForm();
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveSettings}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-semibold transition-colors"
                >
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
