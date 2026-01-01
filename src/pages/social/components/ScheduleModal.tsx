import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './ScheduleModal.css';

interface Schedule {
  id: number;
  place_id: number;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}

interface ScheduleModalProps {
  placeId: number;
  date: Date;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ScheduleModal({ placeId, date, onClose, onSuccess }: ScheduleModalProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isAddMode, setIsAddMode] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(false);

  // 폼 상태
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState(''); // 비밀번호 상태 추가

  const dateStr = date.toISOString().split('T')[0];
  const formattedDate = `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;

  useEffect(() => {
    loadSchedules();
  }, []);

  const loadSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('social_schedules')
        .select('*')
        .eq('place_id', placeId)
        .eq('date', dateStr)
        .order('start_time');

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('일정 로딩 실패:', error);
    }
  };

  const handleAdd = () => {
    setIsAddMode(true);
    setTitle('');
    setStartTime('');
    setEndTime('');
    setDescription('');
    setPassword(''); // 추가 모드 시 비밀번호 필드 초기화
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setTitle(schedule.title);
    setStartTime(schedule.start_time || '');
    setEndTime(schedule.end_time || '');
    setDescription(schedule.description || '');
  };

  const handleDelete = async (scheduleId: number) => {
    if (!confirm('이 일정을 삭제하시겠습니까? 관련 이미지도 모두 삭제됩니다.')) return;

    setLoading(true);
    console.log('[ScheduleModal] Starting delete process for schedule:', scheduleId);

    try {
      // Get session for token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      console.log('[ScheduleModal] Auth token obtained:', !!token);

      const requestBody = {
        type: 'schedule',
        id: scheduleId
      };
      console.log('[ScheduleModal] Sending delete request:', requestBody);

      const response = await fetch('/.netlify/functions/delete-social-item', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[ScheduleModal] Response status:', response.status, response.statusText);

      if (!response.ok) {
        const errData = await response.json();
        console.error('[ScheduleModal] ❌ Delete failed:', errData);
        throw new Error(errData.error || '삭제 요청 실패');
      }

      const result = await response.json();
      console.log('[ScheduleModal] Delete success:', result);

      alert('일정이 삭제되었습니다.');
      loadSchedules();
    } catch (error: any) {
      console.error('[ScheduleModal] 💥 Error deleting schedule:', error);
      alert(`삭제 도중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchedule && !password) {
      alert('새 일정 등록 시에는 비밀번호가 필수입니다.');
      return;
    }

    setLoading(true);

    try {
      // 현재 로그인한 사용자 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('로그인이 필요합니다.');
      }

      const scheduleData = {
        place_id: placeId,
        user_id: user.id, // user_id 추가
        title,
        password, // 비밀번호 추가
        date: dateStr,
        start_time: startTime || null,
        end_time: endTime || null,
        description: description || null,
      };

      if (editingSchedule) {
        // 수정
        const inputPassword = prompt('수정을 위해 비밀번호를 입력하세요:');
        if (inputPassword === null) { setLoading(false); return; }

        const { data: originalSchedule } = await supabase.from('social_schedules').select('password').eq('id', editingSchedule.id).single();
        if (inputPassword !== originalSchedule?.password) {
          alert('비밀번호가 올바르지 않습니다.');
          setLoading(false);
          return;
        }
        const { error } = await supabase
          .from('social_schedules')
          .update({ ...scheduleData, password: password || originalSchedule.password }) // 비밀번호 필드가 비어있으면 기존 비밀번호 유지
          .eq('id', editingSchedule.id);

        if (error) throw error;
      } else {
        // 추가
        const { error } = await supabase
          .from('social_schedules')
          .insert(scheduleData);

        if (error) throw error;
      }

      setIsAddMode(false);
      setEditingSchedule(null);
      await loadSchedules();
      onSuccess();
    } catch (error) {
      console.error('일정 저장 실패:', error);
      alert('일정 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsAddMode(false);
    setEditingSchedule(null);
  };

  return (
    <div className="schm-modal-overlay">
      <div className="schm-modal-container">
        <div className="schm-modal-body">
          <div className="schm-header">
            <div>
              <h2 className="schm-header-title">일정 관리</h2>
              <p className="schm-header-date">{formattedDate}</p>
            </div>
            <button
              onClick={onClose}
              className="schm-close-btn"
            >
              <i className="ri-close-line schm-close-icon"></i>
            </button>
          </div>

          {/* 일정 추가/수정 폼 */}
          {(isAddMode || editingSchedule) ? (
            <form onSubmit={handleSubmit} className="schm-form">
              <div className="schm-form-group">
                <label className="schm-form-label">
                  일정 제목 *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="schm-form-input"
                  required
                />
              </div>

              <div className="schm-form-group">
                <label className="schm-form-label">
                  비밀번호 {editingSchedule ? '(변경 시에만 입력)' : '*'}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="schm-form-input"
                  required={!editingSchedule}
                  placeholder={editingSchedule ? '새 비밀번호' : '수정/삭제 시 필요'}
                />
              </div>

              <div className="schm-time-grid">
                <div className="schm-form-group">
                  <label className="schm-form-label">
                    시작 시간
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="schm-form-input"
                  />
                </div>
                <div className="schm-form-group">
                  <label className="schm-form-label">
                    종료 시간
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="schm-form-input"
                  />
                </div>
              </div>

              <div className="schm-form-group">
                <label className="schm-form-label">
                  설명
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="schm-form-textarea"
                />
              </div>

              <div className="schm-button-group">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="schm-cancel-button"
                  disabled={loading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="schm-submit-button"
                  disabled={loading}
                >
                  {loading ? '저장 중...' : editingSchedule ? '수정' : '추가'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={handleAdd}
              className="schm-add-button"
            >
              <i className="ri-add-line schm-add-icon"></i>
              일정 추가
            </button>
          )}

          {/* 일정 목록 */}
          <div className="schm-schedule-list">
            {schedules.length === 0 ? (
              <div className="schm-empty-state">
                등록된 일정이 없습니다
              </div>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="schm-schedule-item"
                >
                  <div className="schm-schedule-content">
                    <div className="schm-schedule-info">
                      <h3 className="schm-schedule-title">{schedule.title}</h3>
                      {(schedule.start_time || schedule.end_time) && (
                        <p className="schm-schedule-time">
                          {schedule.start_time?.substring(0, 5)}
                          {schedule.end_time && ` - ${schedule.end_time.substring(0, 5)}`}
                        </p>
                      )}
                      {schedule.description && (
                        <p className="schm-schedule-description">{schedule.description}</p>
                      )}
                    </div>
                    <div className="schm-schedule-actions">
                      <button
                        onClick={() => handleEdit(schedule)}
                        className="schm-edit-button"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="schm-delete-button"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
