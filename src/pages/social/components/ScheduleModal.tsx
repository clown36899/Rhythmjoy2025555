import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

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
  };

  const handleEdit = (schedule: Schedule) => {
    setEditingSchedule(schedule);
    setTitle(schedule.title);
    setStartTime(schedule.start_time || '');
    setEndTime(schedule.end_time || '');
    setDescription(schedule.description || '');
  };

  const handleDelete = async (scheduleId: number) => {
    if (!confirm('이 일정을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('social_schedules')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;
      loadSchedules();
    } catch (error) {
      console.error('일정 삭제 실패:', error);
      alert('일정 삭제에 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const scheduleData = {
        place_id: placeId,
        title,
        date: dateStr,
        start_time: startTime || null,
        end_time: endTime || null,
        description: description || null,
      };

      if (editingSchedule) {
        // 수정
        const { error } = await supabase
          .from('social_schedules')
          .update(scheduleData)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-white">일정 관리</h2>
              <p className="text-sm text-gray-400">{formattedDate}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>

          {/* 일정 추가/수정 폼 */}
          {(isAddMode || editingSchedule) ? (
            <form onSubmit={handleSubmit} className="space-y-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  일정 제목 *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    시작 시간
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    종료 시간
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  설명
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                  disabled={loading}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                  disabled={loading}
                >
                  {loading ? '저장 중...' : editingSchedule ? '수정' : '추가'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={handleAdd}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors mb-4"
            >
              <i className="ri-add-line mr-1"></i>
              일정 추가
            </button>
          )}

          {/* 일정 목록 */}
          <div className="space-y-2">
            {schedules.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">
                등록된 일정이 없습니다
              </div>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="bg-gray-700 rounded-lg p-3 border border-gray-600"
                >
                  <div className="flex items-start justify-between mb-1">
                    <div className="flex-1">
                      <h3 className="text-white font-medium">{schedule.title}</h3>
                      {(schedule.start_time || schedule.end_time) && (
                        <p className="text-sm text-gray-400">
                          {schedule.start_time?.substring(0, 5)}
                          {schedule.end_time && ` - ${schedule.end_time.substring(0, 5)}`}
                        </p>
                      )}
                      {schedule.description && (
                        <p className="text-sm text-gray-400 mt-1">{schedule.description}</p>
                      )}
                    </div>
                    <div className="flex gap-2 ml-2">
                      <button
                        onClick={() => handleEdit(schedule)}
                        className="text-blue-400 hover:text-blue-300"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => handleDelete(schedule.id)}
                        className="text-red-400 hover:text-red-300"
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
