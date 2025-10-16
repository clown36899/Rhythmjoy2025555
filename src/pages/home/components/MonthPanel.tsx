import { useMemo, memo } from "react";

interface Event {
  id: number;
  title: string;
  date: string | null;
  start_date: string | null;
  end_date: string | null;
  time: string | null;
  location: string | null;
  category: "class" | "event";
  image: string | null;
  image_thumbnail: string | null;
  image_medium: string | null;
  [key: string]: any;
}

interface MonthPanelProps {
  monthKey: string;
  events: Event[];
  isAnimating: boolean;
  highlightEvent: { id: number; nonce: number } | null;
  onEventClick: (event: Event) => void;
  onEventHover?: (eventId: number | null) => void;
  getEventColor: (eventId: number) => { bg: string };
  viewMode: "month" | "year";
  selectedCategory: string;
}

const MonthPanel = memo(({
  events,
  isAnimating,
  highlightEvent,
  onEventClick,
  onEventHover,
  getEventColor,
  viewMode,
  selectedCategory,
}: MonthPanelProps) => {
  
  const shouldShowGrid = useMemo(() => {
    return events.length > 0 || isAnimating;
  }, [events.length, isAnimating]);

  const emptyMessage = useMemo(() => {
    if (selectedCategory === "class") return "강습이 없습니다";
    if (selectedCategory === "event") return "행사가 없습니다";
    return "이벤트가 없습니다";
  }, [selectedCategory]);

  if (!shouldShowGrid) {
    return (
      <div className="text-center py-8">
        <i className="ri-calendar-line text-4xl text-gray-500 mb-4"></i>
        <p className="text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
      {events.map((event) => {
        const startDate = event.start_date || event.date || "";
        const endDate = event.end_date || event.date || "";
        const isMultiDay = startDate !== endDate;
        const eventColor = isMultiDay
          ? getEventColor(event.id)
          : { bg: "bg-gray-500" };

        const isHighlighted = highlightEvent?.id === event.id;
        const highlightBorderColor =
          event.category === "class" ? "#9333ea" : "#2563eb";

        return (
          <div
            key={event.id}
            data-event-id={event.id}
            onClick={() => onEventClick(event)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = highlightBorderColor;
              if (viewMode === "month" && onEventHover) onEventHover(event.id);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "var(--event-list-bg-color)";
              e.currentTarget.style.borderColor = "#000000";
              if (viewMode === "month" && onEventHover) onEventHover(null);
            }}
            className={`rounded-xl overflow-hidden transition-all cursor-pointer relative border-2 ${isHighlighted ? "" : "border-[#000000]"}`}
            style={{
              backgroundColor: "var(--event-list-bg-color)",
              borderColor: isHighlighted ? highlightBorderColor : undefined,
            }}
          >
            <div className={`absolute top-0 left-0 right-0 h-1 ${eventColor.bg}`}></div>
            <div className="relative">
              {event.image_thumbnail || event.image ? (
                <img
                  src={event.image_thumbnail || event.image || ""}
                  alt={event.title}
                  className="w-full aspect-[3/4] object-cover object-top"
                />
              ) : (
                <div className="w-full aspect-[3/4] bg-[#000000] flex items-center justify-center">
                  <span className="text-white/10 text-4xl font-bold relative">
                    {event.category === "class" ? "강습" : "행사"}
                  </span>
                </div>
              )}
              <div className={`absolute top-1 left-0 px-2 py-0.5 text-white text-[10px] font-bold ${event.category === "class" ? "bg-purple-600" : "bg-blue-600"}`}>
                {event.category === "class" ? "강습" : "행사"}
              </div>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2 pt-6">
                <h3 className="text-white text-xs font-bold leading-tight line-clamp-2">
                  {event.title}
                </h3>
              </div>
            </div>
            <div className="p-1">
              <p className="text-xs text-gray-300 text-center">
                {(() => {
                  const startDate = event.start_date || event.date;
                  const endDate = event.end_date || event.date;
                  if (!startDate) return "날짜 미정";
                  const formatDate = (dateStr: string) => {
                    const date = new Date(dateStr);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  };
                  if (startDate !== endDate) {
                    return `${formatDate(startDate)} ~ ${formatDate(endDate || startDate)}`;
                  }
                  return formatDate(startDate);
                })()}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
});

MonthPanel.displayName = "MonthPanel";

export default MonthPanel;
