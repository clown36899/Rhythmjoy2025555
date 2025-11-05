import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialPlace } from '../page';

interface SocialEventModalProps {
  date: Date;
  onClose: () => void;
  onSaved: () => void;
}

export default function SocialEventModal({ date, onClose, onSaved }: SocialEventModalProps) {
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [selectedPlaceId, setSelectedPlaceId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPlaces();
  }, []);

  const loadPlaces = async () => {
    try {
      const { data, error } = await supabase
        .from('social_places')
        .select('*')
        .order('name');

      if (error) throw error;
      setPlaces(data || []);
      if (data && data.length > 0) {
        setSelectedPlaceId(data[0].id);
      }
    } catch (error) {
      console.error('장소 로딩 실패:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedPlaceId) {
      setError('장소를 선택해주세요');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const dateStr = date.toISOString().split('T')[0];

      const { error: insertError } = await supabase
        .from('social_schedules')
        .insert({
          place_id: selectedPlaceId,
          title,
          date: dateStr,
          start_time: startTime || null,
          end_time: endTime || null,
          description: description || null,
        });

      if (insertError) throw insertError;

      onSaved();
      onClose();
    } catch (err: any) {
      console.error('일정 등록 에러:', err);
      setError(err.message || '일정 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90svh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            일정 등록 - {date.getMonth() + 1}월 {date.getDate()}일
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 장소 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                장소 *
              </label>
              <select
                value={selectedPlaceId || ''}
                onChange={(e) => setSelectedPlaceId(Number(e.target.value))}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              >
                {places.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 일정 제목 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                일정 제목 *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="예: 정기 모임"
                required
              />
            </div>

            {/* 시작 시간 */}
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

            {/* 종료 시간 */}
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

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                설명
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                rows={3}
                placeholder="일정에 대한 추가 정보를 입력하세요"
              />
            </div>

            {error && (
              <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded">
                {error}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
