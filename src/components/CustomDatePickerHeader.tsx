import { ReactDatePickerCustomHeaderProps } from "react-datepicker";

interface CustomDatePickerHeaderProps extends ReactDatePickerCustomHeaderProps {
  onTodayClick?: () => void;
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
    <div className="flex items-center justify-between px-2 py-2">
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          decreaseMonth();
        }}
        disabled={prevMonthButtonDisabled}
        type="button"
        className="text-white hover:bg-gray-600 p-1 rounded disabled:opacity-50 transition-colors"
      >
        <i className="ri-arrow-left-s-line text-xl"></i>
      </button>
      <div className="flex items-center gap-2">
        <span className="text-white font-medium">
          {date.getMonth() + 1}월
        </span>
        {onTodayClick && (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleTodayClick();
            }}
            type="button"
            className="text-blue-400 hover:bg-blue-500/20 px-2 py-0.5 rounded text-sm font-medium transition-colors"
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
        className="text-white hover:bg-gray-600 p-1 rounded disabled:opacity-50 transition-colors"
      >
        <i className="ri-arrow-right-s-line text-xl"></i>
      </button>
    </div>
  );
}
