import React, { memo } from 'react';
import type { SocialSchedule } from '../types';
import './TodaySocial.css';
import { useModalActions } from '../../../contexts/ModalContext';
import { HorizontalScrollNav } from '../../v2/components/HorizontalScrollNav';
import { useAuth } from '../../../contexts/AuthContext';
import { PWAInstallButton } from '../../../components/PWAInstallButton';

// 1. Props 인터페이스 수정
interface TodaySocialProps {
    schedules: SocialSchedule[];
    onViewAll?: () => void;
    onEventClick?: (event: any) => void;
    onRefresh?: () => void;
}

const TodaySocial: React.FC<TodaySocialProps> = memo(({ schedules, onViewAll, onEventClick, onRefresh }) => {
    const { openModal } = useModalActions();
    const { isAdmin, user } = useAuth();


    // Sort schedules: Domestic (Time) -> Overseas (Time)
    const sortedSchedules = React.useMemo(() => {
        const overseas = schedules.filter(s => s.scope === 'overseas');
        const domestic = schedules.filter(s => s.scope !== 'overseas');

        const sortByTime = (a: SocialSchedule, b: SocialSchedule) => {
            const timeA = a.start_time || '';
            const timeB = b.start_time || '';
            return timeA.localeCompare(timeB);
        };

        const sortByTypeAndTime = (a: SocialSchedule, b: SocialSchedule) => {
            // 1. Event check (group_id === -1 is Event) -> Higher priority
            const isEventA = a.group_id === -1;
            const isEventB = b.group_id === -1;
            if (isEventA !== isEventB) return isEventA ? -1 : 1;

            // 2. Time
            return sortByTime(a, b);
        };

        return [
            ...domestic.sort(sortByTypeAndTime),
            ...overseas.sort(sortByTime) // Overseas events likely don't need type priority, just time, but consistent scope separation is key
        ];
    }, [schedules]);

    // shuffledSchedules 대신 sortedSchedules 사용
    const displaySchedules = sortedSchedules;

    // 오늘 일정이 1개 이하일 때 숨김 (AllSocialSchedules에서 1개 이하일 때 이번주 일정에 포함시키기 때문)
    if (displaySchedules.length <= 1) return null;

    const getMediumImage = (item: SocialSchedule) => {
        if (item.image_thumbnail) return item.image_thumbnail;
        if (item.image_medium) return item.image_medium;
        if (item.image_micro) return item.image_micro;
        if (item.image_full) return item.image_full;
        if (item.image_url) return item.image_url;
        if (item.image_url) return item.image_url;
        return '';
    };

    // D-day 계산 함수 (TodaySocial용)
    // 오늘 일정 섹션에 들어왔다는 것은 이미 날짜 필터링(오늘)을 통과했다는 뜻이므로
    // 별도의 날짜 비교 없이 무조건 'D-Day'를 반환하여 배지 누락을 방지합니다.
    const calculateDDay = (): string | null => {
        return 'D-Day';
    };

    const handleScheduleClick = (e: React.MouseEvent, item: SocialSchedule) => {
        e.stopPropagation();

        // Check if this is a regular event (converted from Event type)
        if (item.group_id === -1) {
            // This is a regular event, use onEventClick callback
            if (onEventClick) {
                onEventClick(item as any);
            }
            return;
        }

        // Helper to open modal (can be called recursively)
        const openDetailModal = (scheduleItem: SocialSchedule) => {
            // This is a social schedule
            // 등록자 본인이거나 관리자인 경우 수정 가능
            const isOwner = user && scheduleItem.user_id === user.id;
            const canEdit = (isOwner || isAdmin);

            openModal('socialDetail', {
                schedule: scheduleItem,
                isAdmin: canEdit,
                showCopyButton: false,
                onEdit: (s: any) => openModal('socialSchedule', {
                    editSchedule: s,
                    groupId: s.group_id,
                    onSuccess: (data: any) => {
                        if (onRefresh) onRefresh();
                        // 수정 후 변경된 데이터로 상세 모달 다시 열기 (UI 즉시 반영)
                        if (data) {
                            openDetailModal(data);
                        }
                    }
                })
            });
        };

        openDetailModal(item);
    };

    return (
        <section className="today-social-container">
            <div className="section-title-area" style={{ display: 'flex', alignItems: 'center', width: '100%', minWidth: 0, overflow: 'hidden' }}>
                <i className="ri-fire-fill" style={{ color: '#ff4b2b', fontSize: 'min(4vw, 1.15rem)', flexShrink: 1 }}></i>
                <h2 className="section-title manual-label-wrapper" style={{ flexShrink: 1, minWidth: 0, overflow: 'hidden', justifyContent: 'flex-start' }}>
                    <span className="translated-part">Today Schedule ({new Date().toLocaleDateString('ko-KR', { weekday: 'short' })} {new Date().getDate()}일)</span>
                    <span className="fixed-part ko" translate="no">오늘 일정 ({new Date().toLocaleDateString('ko-KR', { weekday: 'short' })} {new Date().getDate()}일)</span>
                    <span className="fixed-part en" translate="no">Today ({new Date().toLocaleDateString('en-US', { weekday: 'short' })} {new Date().getDate()})</span>
                </h2>
                <span className="live-badge manual-label-wrapper">
                    <span className="translated-part">LIVE {schedules.length}</span>
                    <span className="fixed-part ko" translate="no">LIVE {schedules.length}</span>
                    <span className="fixed-part en" translate="no">LIVE {schedules.length}</span>
                </span>
                {onViewAll && (
                    <button className="evt-view-all-btn manual-label-wrapper" onClick={onViewAll}>
                        <span className="translated-part">View All</span>
                        <span className="fixed-part ko" translate="no">전체보기</span>
                        <span className="fixed-part en" translate="no">All</span>
                        <span style={{ marginLeft: 'min(0.5vw, 4px)' }}>❯</span>
                    </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                    <div style={{ transform: 'scale(0.85)', transformOrigin: 'right center' }}>
                        <PWAInstallButton />
                    </div>
                </div>
            </div>

            <HorizontalScrollNav>
                <div className="today-scroller">
                    {displaySchedules.map((item) => (
                        <div
                            key={item.id}
                            className="today-card"
                            data-analytics-id={typeof item.id === 'number' && item.id > 1000000 ? Math.floor(item.id / 10000) : item.id}
                            data-analytics-type={item.group_id === -1 ? 'event' : 'social_schedule'}
                            data-analytics-title={item.title}
                            data-analytics-section="today_social"
                            onClick={(e) => handleScheduleClick(e, item)}
                        >

                            <div className="today-card-image">
                                {getMediumImage(item) ? (
                                    <img src={getMediumImage(item)} alt={item.title} loading="lazy" />
                                ) : (
                                    <div className="today-placeholder">
                                        <i className="ri-calendar-event-line"></i>
                                    </div>
                                )}
                                {item.start_time && (
                                    <div className="today-card-overlay">
                                        <span className="today-time">{item.start_time.substring(0, 5)}</span>
                                    </div>
                                )}
                            </div>
                            {(() => {
                                const dDay = calculateDDay();
                                return dDay ? (
                                    <div className="all-social-dday-badge all-social-dday-today">
                                        {dDay}
                                    </div>
                                ) : null;
                            })()}
                            <div className="today-card-info">
                                <h3 className="today-card-title">{item.title}</h3>
                                <p className="today-card-place">
                                    <i className="ri-map-pin-line"></i>
                                    <span className="today-card-place-text">{item.place_name || '장소 미정'}</span>
                                </p>

                            </div>
                        </div>
                    ))}
                    {/* Spacer for last item padding */}
                    <div className="scroller-spacer"></div>
                </div>
            </HorizontalScrollNav>
        </section>
    );
});

export default TodaySocial;
