import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialPlace } from '../types';
import SocialEditModal from './SocialEditModal';
import ScheduleModal from './ScheduleModal';
import { useAuth } from '../../../contexts/AuthContext';

interface Schedule {
  id: number;
  place_id: number;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
}

interface PlaceCalendarProps {
  place: SocialPlace;
  onBack: () => void;
  onPlaceUpdate: () => void;
}

export default function PlaceCalendar({ place, onBack }: PlaceCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const { isAdmin } = useAuth();

  useEffect(() => {
    loadSchedules();
  }, [place.id, currentDate]);

  const loadSchedules = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('social_schedules')
        .select('*')
        .eq('place_id', place.id)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .order('date')
        .order('start_time');

      if (error) throw error;
      setSchedules(data || []);
    } catch (error) {
      console.error('일정 로딩 실패:', error);
    }
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const handleDateClick = (date: Date) => {
    if (isAdmin) {
      setSelectedDate(date);
      setShowScheduleModal(true);
    }
  };

  const getSchedulesForDate = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return schedules.filter(s => s.date === dateStr);
  };

  // 달력 렌더링
  const renderCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 빈 칸
    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`empty-${i}`} className="aspect-square"></div>);
    }

    // 날짜
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateSchedules = getSchedulesForDate(date);
      const isToday = date.getTime() === today.getTime();

      days.push(
        <div
          key={day}
          onClick={() => isAdmin && handleDateClick(date)}
          className={`aspect-square border border-gray-700 p-1 ${
            isAdmin ? 'cursor-pointer hover:bg-gray-700' : ''
          } ${isToday ? 'bg-blue-900/30' : 'bg-gray-800'}`}
        >
          <div className={`text-xs mb-1 ${isToday ? 'text-blue-400 font-bold' : 'text-gray-300'}`}>
            {day}
          </div>
          <div className="space-y-0.5">
            {dateSchedules.slice(0, 3).map((schedule) => (
              <div
                key={schedule.id}
                className="text-[10px] bg-green-600/80 text-white px-1 py-0.5 rounded truncate cursor-pointer hover:bg-green-500"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isAdmin) setEditingSchedule(schedule);
                }}
                title={schedule.title}
              >
                {schedule.start_time && (
                  <span className="mr-1">{schedule.start_time.substring(0, 5)}</span>
                )}
                {schedule.title}
              </div>
            ))}
            {dateSchedules.length > 3 && (
              <div className="text-[9px] text-gray-400">+{dateSchedules.length - 3}</div>
            )}
          </div>
        </div>
      );
    }

    return days;
  };

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 헤더 */}
      <div
        className="fixed top-0 left-0 right-0 z-10"
        style={{
          maxWidth: '650px',
          margin: '0 auto',
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <div className="flex items-center px-4 py-3">
          <button
            onClick={onBack}
            className="text-white hover:text-gray-300 mr-3"
          >
            <i className="ri-arrow-left-line text-xl"></i>
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">{place.name}</h1>
            <p className="text-xs text-gray-400">{place.address}</p>
          </div>
        </div>
      </div>

      {/* 달력 */}
      <div className="pt-16 px-4">
        {/* 월 네비게이션 */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={prevMonth}
            className="text-white hover:text-gray-300"
          >
            <i className="ri-arrow-left-s-line text-2xl"></i>
          </button>
          <h2 className="text-xl font-bold text-white">
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </h2>
          <button
            onClick={nextMonth}
            className="text-white hover:text-gray-300"
          >
            <i className="ri-arrow-right-s-line text-2xl"></i>
          </button>
        </div>

        {/* 요일 */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div
              key={day}
              className={`text-center text-sm font-medium py-2 ${
                i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* 날짜 */}
        <div className="grid grid-cols-7 gap-1">
          {renderCalendar()}
        </div>

        {/* 안내 문구 */}
        {isAdmin && (
          <div className="mt-4 text-center text-sm text-gray-400">
            날짜를 클릭하여 일정을 추가하세요
          </div>
        )}
      </div>

      {/* 일정 등록 모달 */}
      {showScheduleModal && selectedDate && (
        <ScheduleModal
          placeId={place.id}
          date={selectedDate}
          onClose={() => {
            setShowScheduleModal(false);
            setSelectedDate(null);
          }}
          onSuccess={() => {
            setShowScheduleModal(false);
            setSelectedDate(null);
            loadSchedules();
          }}
        />
      )}

      {/* 일정 수정 모달 */}
      {isAdmin && editingSchedule && (
        <SocialEditModal
          item={editingSchedule}
          itemType="schedule"
          onClose={() => setEditingSchedule(null)}
          onSuccess={() => {
            setEditingSchedule(null);
            loadSchedules();
          }}
        />
      )}
    </div>
  );
}
