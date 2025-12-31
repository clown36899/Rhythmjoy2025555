import Footer from "../../Footer";
import type { Event } from "../../../utils/eventListUtils";
import "../../../styles/EventHorizontalListView.css";

interface EventHorizontalListViewProps {
    events: Event[];
    onEventClick: (event: Event) => void;
    defaultThumbnailEvent: string;
}

export function EventHorizontalListView({
    events,
    onEventClick,
    defaultThumbnailEvent
}: EventHorizontalListViewProps) {
    // 년도/월별로 그룹화
    const groupedByYearMonth: { [key: string]: Event[] } = {};
    events.forEach(event => {
        const date = event.start_date || event.date;
        if (date) {
            const [year, month] = date.split('-');
            const key = `${year}-${month}`;
            if (!groupedByYearMonth[key]) {
                groupedByYearMonth[key] = [];
            }
            groupedByYearMonth[key].push(event);
        }
    });

    // 년도/월 키를 시간순으로 정렬
    const sortedKeys = Object.keys(groupedByYearMonth).sort();

    // 날짜 포맷팅 함수 (오리지널 스타일)
    const formatDate = (dateStr: string) => {
        if (!dateStr) return "";
        try {
            const date = new Date(dateStr + 'T00:00:00');
            return date.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="event-list-search-container evt-single-view-scroll evt-list-bg-container evt-single-view-container">
            {/* 년도/월별 그룹화된 가로 카드 레이아웃 - 사용자 제공 DOM 구조 기준 */}
            {sortedKeys.map(yearMonth => {
                const [year, month] = yearMonth.split('-');
                const monthEvents = groupedByYearMonth[yearMonth];

                return (
                    <div key={yearMonth} className="evt-year-month-group">
                        {/* 년도/월 헤더 */}
                        <div className="evt-year-month-header">
                            <span className="evt-year">{year}년</span>
                            <span className="evt-month">{parseInt(month)}월</span>
                        </div>

                        {/* 가로 카드 리스트 */}
                        <div className="evt-horizontal-card-list">
                            {monthEvents.map((event) => (
                                <div
                                    key={event.id}
                                    className="evt-horizontal-card"
                                    onClick={() => onEventClick(event)}
                                >
                                    {/* 왼쪽: 이미지 */}
                                    <div className="evt-horizontal-card-image">
                                        {event.image ? (
                                            <img src={event.image} alt={event.title} />
                                        ) : (
                                            <img src={defaultThumbnailEvent} alt={event.title} />
                                        )}
                                    </div>

                                    {/* 오른쪽: 정보 */}
                                    <div className="evt-horizontal-card-content">
                                        <h3 className="evt-horizontal-card-title">{event.title}</h3>
                                        <p className="evt-horizontal-card-date">
                                            {event.start_date === event.end_date || !event.end_date
                                                ? formatDate(event.start_date || event.date || "")
                                                : `${formatDate(event.start_date || "")} - ${formatDate(event.end_date || "")}`
                                            }
                                        </p>
                                        {event.location && (
                                            <p className="evt-horizontal-card-location">
                                                <i className="ri-map-pin-line"></i>
                                                {event.location}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            })}

            {events.length === 0 && (
                <div className="event-list-empty-container">
                    <p className="event-list-empty-text">해당 조건에 맞는 이벤트가 없습니다</p>
                </div>
            )}
            <Footer />
        </div>
    );
}
