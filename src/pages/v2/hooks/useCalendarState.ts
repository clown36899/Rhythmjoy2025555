
import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function useCalendarState() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Core State
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Derived Logic
    const isCurrentMonthVisible = useMemo(() => {
        const today = new Date();
        return currentMonth.getFullYear() === today.getFullYear() &&
            currentMonth.getMonth() === today.getMonth();
    }, [currentMonth]);

    // Navigation Helper
    const navigateWithCategory = useCallback((cat?: string) => {
        const currentCat = searchParams.get('category');
        // Only navigate if category is different to avoid redundant pushes
        const targetCat = (!cat || cat === "all") ? null : cat;

        if (targetCat) {
            if (currentCat !== targetCat) navigate(`/v2?category=${targetCat}`);
        } else {
            if (currentCat) navigate("/v2");
        }
    }, [navigate, searchParams]);

    // Handlers
    const handleHorizontalSwipe = useCallback((direction: 'next' | 'prev') => {
        setCurrentMonth((prev) => {
            const newM = new Date(prev);
            newM.setDate(1);
            // newM.setFullYear(prev.getFullYear() + (direction === 'next' ? 1 : -1)); // Year Logic (commented out in original)
            newM.setMonth(prev.getMonth() + (direction === 'next' ? 1 : -1));
            return newM;
        });
        setSelectedDate(null);
    }, []);

    const moveToToday = useCallback(() => {
        const today = new Date();
        setCurrentMonth(today);
        setSelectedDate(null);
        navigateWithCategory("all");
    }, [navigateWithCategory]);

    // Global Event Dispatchers (Sync state with Shell/others)
    useEffect(() => { window.dispatchEvent(new CustomEvent("monthChanged", { detail: { month: currentMonth.toISOString() } })); }, [currentMonth]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("isCurrentMonthVisibleChanged", { detail: isCurrentMonthVisible })); }, [isCurrentMonthVisible]);
    useEffect(() => { window.dispatchEvent(new CustomEvent("selectedDateChanged", { detail: selectedDate })); }, [selectedDate]);

    return {
        selectedDate,
        setSelectedDate,
        currentMonth,
        setCurrentMonth,
        isCurrentMonthVisible,
        navigateWithCategory,
        handleHorizontalSwipe,
        moveToToday
    };
}
