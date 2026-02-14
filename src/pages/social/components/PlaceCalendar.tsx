import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialGroup as SocialPlace } from '../types';
import EventRegistrationModal from '../../../components/EventRegistrationModal';
import './PlaceCalendar.css';

interface WeeklySchedule {
  id: number;
  group_id: number;
  day_of_week: number;
  title: string;
  time?: string;
  start_time?: string; // legacy support
  description?: string;
  inquiry_contact?: string;
  link_name?: string;
  link_url?: string;
  password?: string;
  user_id?: string;
}

interface PlaceCalendarProps {
  place: SocialPlace;
  onBack: () => void;
  onPlaceUpdate: () => void;
}

const WEEKDAYS = [
  { id: 0, name: '일요일', short: '일' },
  { id: 1, name: '월요일', short: '월' },
  { id: 2, name: '화요일', short: '화' },
  { id: 3, name: '수요일', short: '수' },
  { id: 4, name: '목요일', short: '목' },
  { id: 5, name: '금요일', short: '금' },
  { id: 6, name: '토요일', short: '토' },
];

export default function PlaceCalendar({ place, onBack }: PlaceCalendarProps) {
  const [weeklySchedules, setWeeklySchedules] = useState<WeeklySchedule[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDayOfWeek, setSelectedDayOfWeek] = useState<number | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<WeeklySchedule | null>(null);

  useEffect(() => {
    loadWeeklySchedules();
  }, [place.id]);

  const loadWeeklySchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('group_id', place.id)
        .not('day_of_week', 'is', null)
        .order('day_of_week')
        .order('time');

      if (error) throw error;
      setWeeklySchedules(data || []);
    } catch (error) {
      console.error('요일 스케줄 로딩 실패:', error);
    }
  };

  const getScheduleForDay = (dayOfWeek: number) => {
    return weeklySchedules.find(s => s.day_of_week === dayOfWeek);
  };

  const handleAddSchedule = (dayOfWeek: number) => {
    const existing = getScheduleForDay(dayOfWeek);
    if (existing) {
      alert('이미 이 요일에 스케줄이 등록되어 있습니다.');
      return;
    }
    setSelectedDayOfWeek(dayOfWeek);
    setShowAddModal(true);
  };

  const handleEditSchedule = (schedule: WeeklySchedule) => {
    setEditingSchedule(schedule);
  };

  const handleDeleteSchedule = async (schedule: WeeklySchedule) => {
    const password = prompt('삭제하려면 비밀번호를 입력하세요:');
    if (!password) return;

    try {
      const { data: scheduleData } = await supabase
        .from('events')
        .select('password')
        .eq('id', schedule.id)
        .maybeSingle();

      if (scheduleData?.password !== password) {
        alert('비밀번호가 올바르지 않습니다.');
        return;
      }

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', schedule.id);

      if (error) throw error;

      alert('스케줄이 삭제되었습니다.');
      loadWeeklySchedules();
    } catch (error) {
      console.error('스케줄 삭제 실패:', error);
      alert('스케줄 삭제에 실패했습니다.');
    }
  };

  return (
    <div className="pcal-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      {/* 헤더 */}
      <div
        className="pcal-header"
        style={{
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <div className="pcal-header-content">
          <button
            onClick={onBack}
            className="pcal-back-btn"
          >
            <i className="ri-arrow-left-line pcal-icon-large"></i>
          </button>
          <div className="flex-1">
            <h1 className="pcal-header-title">{place.name}</h1>
            <p className="pcal-place-address">{place.address}</p>
          </div>
        </div>
      </div>

      {/* 요일별 스케줄 */}
      <div className="pcal-weekly-area">
        <h2 className="pcal-section-title">요일별 스케줄</h2>

        <div className="pcal-weekly-grid">
          {WEEKDAYS.map((day) => {
            const schedule = getScheduleForDay(day.id);

            return (
              <div key={day.id} className="pcal-day-card">
                <div className={`pcal-day-header ${day.id === 0 ? 'pcal-day-sunday' : day.id === 6 ? 'pcal-day-saturday' : ''}`}>
                  {day.name}
                </div>

                {schedule ? (
                  <div className="pcal-schedule-content">
                    <h3 className="pcal-schedule-title">{schedule.title}</h3>
                    {schedule.time && (
                      <p className="pcal-schedule-time">
                        <i className="ri-time-line"></i> {schedule.time.substring(0, 5)}
                      </p>
                    )}
                    {schedule.description && (
                      <p className="pcal-schedule-desc">{schedule.description}</p>
                    )}
                    {schedule.inquiry_contact && (
                      <p className="pcal-schedule-contact">
                        <i className="ri-phone-line"></i> {schedule.inquiry_contact}
                      </p>
                    )}
                    {schedule.link_url && (
                      <a
                        href={schedule.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pcal-schedule-link"
                      >
                        <i className="ri-link"></i> {schedule.link_name || '링크'}
                      </a>
                    )}

                    <div className="pcal-schedule-actions">
                      <button
                        onClick={() => handleEditSchedule(schedule)}
                        className="pcal-action-btn pcal-action-edit"
                      >
                        <i className="ri-edit-line"></i> 수정
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(schedule)}
                        className="pcal-action-btn pcal-action-delete"
                      >
                        <i className="ri-delete-bin-line"></i> 삭제
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pcal-empty-content">
                    <p className="pcal-empty-text">등록된 스케줄이 없습니다</p>
                    <button
                      onClick={() => handleAddSchedule(day.id)}
                      className="pcal-add-btn"
                    >
                      <i className="ri-add-line"></i> 스케줄 추가
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 스케줄 추가 및 수정 통합 모달 */}
      {(showAddModal || editingSchedule) && (
        <EventRegistrationModal
          isOpen={showAddModal || !!editingSchedule}
          onClose={() => {
            setShowAddModal(false);
            setEditingSchedule(null);
            setSelectedDayOfWeek(null);
          }}
          selectedDate={new Date()}
          groupId={place.id}
          dayOfWeek={selectedDayOfWeek ?? undefined}
          editEventData={editingSchedule as any}
          onEventCreated={() => {
            setShowAddModal(false);
            setSelectedDayOfWeek(null);
            loadWeeklySchedules();
          }}
          onEventUpdated={() => {
            setEditingSchedule(null);
            loadWeeklySchedules();
          }}
        />
      )}
    </div>
  );
}
