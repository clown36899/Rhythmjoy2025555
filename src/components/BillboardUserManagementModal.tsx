import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import type { BillboardUser, BillboardUserSettings } from '../lib/supabase';
import { hashPassword } from '../utils/passwordHash';

interface SimpleEvent {
  id: number;
  title: string;
  start_date: string | null;
  date: string | null;
}

interface BillboardUserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 날짜 필터 적용
      const startDate = dateFilterStart || todayStr;
      const endDate = dateFilterEnd;

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

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`'${userName}' 빌보드 사용자를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('billboard_users')
        .delete()
        .eq('id', userId);

      if (error) throw error;

      alert('빌보드 사용자가 삭제되었습니다.');
      loadBillboardUsers();
    } catch (error) {
      console.error('사용자 삭제 실패:', error);
      alert('사용자 삭제에 실패했습니다.');
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

      // 날짜 초기값 계산
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      // 마지막 이벤트 날짜 조회
      const { data: lastEvent } = await supabase
        .from('events')
        .select('start_date')
        .order('start_date', { ascending: false })
        .limit(1)
        .single();

      // defaultEndDate 계산 (현재 사용하지 않음)

      setSelectedSettings(data);
      setExcludedWeekdays(data.excluded_weekdays || []);
      setExcludedEventIds(data.excluded_event_ids || []);
      setAutoSlideInterval(data.auto_slide_interval);
      setVideoPlayDuration(data.video_play_duration || 10000);
      setPlayOrder(data.play_order);
      setDateFilterStart(data.date_filter_start || todayStr);
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

  const copyBillboardUrl = (userId: string) => {
    const url = `${window.location.origin}/billboard/${userId}`;
    navigator.clipboard.writeText(url);
    alert('빌보드 URL이 복사되었습니다.');
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
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
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
                  <p className="text-gray-400 text-sm mt-1">
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
                  <button
                    onClick={() => handleDeleteUser(user.id, user.name)}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm transition-colors"
                  >
                    삭제
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
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
              <h4 className="text-xl font-bold text-white mb-4">{selectedUser.name} 설정</h4>
              
              <div className="space-y-6">
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
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    🚫 제외할 이벤트
                  </label>
                  <p className="text-xs text-gray-400 mb-2">당일 포함 이후 이벤트만 표시됩니다</p>
                  <div className="max-h-40 overflow-y-auto bg-gray-700 rounded-lg p-3 space-y-2">
                    {events.length === 0 ? (
                      <p className="text-gray-400 text-sm">표시할 이벤트가 없습니다.</p>
                    ) : (
                      events.map((event) => {
                        const eventDate = new Date(event.start_date || event.date || '');
                        const weekdayNames = ['일', '월', '화', '수', '목', '금', '토'];
                        const weekday = weekdayNames[eventDate.getDay()];
                        const hasMedia = !!(event.image_full || event.image || event.video_url);
                        
                        return (
                          <label
                            key={event.id}
                            className={`flex items-center gap-2 p-2 rounded ${
                              hasMedia ? 'cursor-pointer hover:bg-gray-600' : 'cursor-not-allowed opacity-60'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={excludedEventIds.includes(event.id)}
                              onChange={() => toggleEvent(event.id)}
                              disabled={!hasMedia}
                              className="w-4 h-4"
                            />
                            <span className={`text-sm flex-1 ${hasMedia ? 'text-white' : 'text-gray-500'}`}>
                              {event.title}
                              <span className="text-gray-400 text-xs ml-2">
                                ({event.start_date || event.date} {weekday})
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

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    ⚙️ 슬라이드 간격 (초) - 일반 이벤트
                  </label>
                  <input
                    type="number"
                    value={autoSlideInterval / 1000}
                    onChange={(e) => setAutoSlideInterval(Number(e.target.value) * 1000)}
                    min="1"
                    max="60"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-2">
                    🎬 영상 재생 시간 (초) - 영상 이벤트
                  </label>
                  <input
                    type="number"
                    value={videoPlayDuration / 1000}
                    onChange={(e) => setVideoPlayDuration(Number(e.target.value) * 1000)}
                    min="5"
                    max="60"
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-gray-400 text-xs mt-1">
                    영상 로딩 완료 후 재생되는 시간입니다.
                  </p>
                </div>

                <div>
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
                    <input
                      type="date"
                      value={dateFilterStart}
                      onChange={(e) => setDateFilterStart(e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="시작 날짜"
                    />
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
                <div className="border-t border-gray-700 pt-4">
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

                <div className="flex gap-3 pt-4">
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
            </div>
          </div>,
          document.body
        )}
      </div>
    </div>,
    document.body
  );
}
