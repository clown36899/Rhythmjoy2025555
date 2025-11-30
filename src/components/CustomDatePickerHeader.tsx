import type { ReactDatePickerCustomHeaderProps } from "react-datepicker";
import "./CustomDatePickerHeader.css";

interface CustomDatePickerHeaderProps extends ReactDatePickerCustomHeaderProps {
  onTodayClick?: () => void;
  selectedDate?: Date | null;
}

export default function CustomDatePickerHeader({
  date,
  changeMonth,
  changeYear,
  decreaseMonth,
  increaseMonth,
  prevMonthButtonDisabled,
  nextMonthButtonDisabled,
  onTodayClick,
  selectedDate,
}: CustomDatePickerHeaderProps) {
  const handleTodayClick = () => {
    const today = new Date();
    changeMonth(today.getMonth());
    changeYear(today.getFullYear());
    if (onTodayClick) {
      onTodayClick();
    }
  };

  return (
    <div className="cdp-header-container">
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          decreaseMonth();
        }}
        disabled={prevMonthButtonDisabled}
        type="button"
        className="cdp-nav-button"
      >
        <i className="ri-arrow-left-s-line cdp-nav-icon"></i>
      </button>
      <div className="cdp-center-area">
        <span className="cdp-month-text">
          {date.getMonth() + 1}월
          {selectedDate && (
            <span className="cdp-day-text">
              {selectedDate.getDate()}일
            </span>
          )}
        </span>
        {onTodayClick && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleTodayClick();
            }}
            type="button"
            className="cdp-today-button"
          >
            오늘
          </button>
        )}
      </div>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          increaseMonth();
        }}
        disabled={nextMonthButtonDisabled}
        type="button"
        className="cdp-nav-button"
      >
        <i className="ri-arrow-right-s-line cdp-nav-icon"></i>
      </button>
    </div>
  );
}
