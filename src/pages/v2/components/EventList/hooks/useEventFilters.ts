import { useMemo } from "react";
import { isEventMatchingFilter, sortEvents } from "../../../utils/eventListUtils";
import type { Event } from "../../../utils/eventListUtils";

interface UseEventFiltersProps {
    events: Event[];
    selectedDate: Date | null;
    currentMonth: Date | undefined;
    viewMode: 'month' | 'year';
    selectedCategory: string;
    selectedGenre: string | null;
    searchTerm: string;
    selectedWeekday: number | null;
    sortBy: 'random' | 'time' | 'title';
    isPartialUpdate?: boolean;
    seed?: number;
}

export function useEventFilters({
    events,
    selectedDate,
    currentMonth,
    viewMode,
    selectedCategory,
    selectedGenre,
    searchTerm,
    selectedWeekday,
    sortBy,
    isPartialUpdate = false,
    seed
}: UseEventFiltersProps) {

    // 1. Basic Filtering (Category, Genre, Search)
    const filteredEvents = useMemo(() => {
        return events.filter(event =>
            isEventMatchingFilter(event, {
                selectedCategory,
                selectedGenre,
                searchTerm,
                selectedDate: null, // Don't filter by date here if we want to sort them differently
                targetMonth: undefined,
                viewMode,
                selectedWeekday: null
            })
        );
    }, [events, selectedCategory, selectedGenre, searchTerm, viewMode]);

    // 2. Pre-sorted Events for the current context (Month or Search)
    const sortedCurrentEvents = useMemo(() => {
        const matchingEvents = events.filter(event =>
            isEventMatchingFilter(event, {
                selectedCategory,
                selectedGenre,
                searchTerm,
                selectedDate: null,
                targetMonth: currentMonth || new Date(),
                viewMode,
                selectedWeekday
            })
        );
        return sortEvents(matchingEvents, sortBy, viewMode === 'year', null, false, seed);
    }, [events, currentMonth, viewMode, selectedCategory, selectedGenre, searchTerm, selectedWeekday, sortBy, seed]);

    // 3. Final Sorted Events (Prioritizing selected date if applicable)
    const sortedEvents = useMemo(() => {
        if (!selectedDate) {
            return sortedCurrentEvents;
        }

        // Logic to separate events on selectedDate and others
        const year = selectedDate.getFullYear();
        const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
        const day = String(selectedDate.getDate()).padStart(2, "0");
        const selectedDateString = `${year}-${month}-${day}`;

        const eventsOnSelectedDate: Event[] = [];
        const eventsNotOnSelectedDate: Event[] = [];

        filteredEvents.forEach(event => {
            let isOnDate = false;
            if (event.event_dates && event.event_dates.length > 0) {
                if (event.event_dates.includes(selectedDateString)) isOnDate = true;
            } else {
                const startDate = event.start_date || event.date;
                const endDate = event.end_date || event.date;
                if (startDate && endDate && selectedDateString >= startDate && selectedDateString <= endDate) {
                    isOnDate = true;
                }
            }

            if (isOnDate) eventsOnSelectedDate.push(event);
            else eventsNotOnSelectedDate.push(event);
        });

        // Current Events logic (if it was from sortedCurrentEvents we use it to maintain order for others)
        return [
            ...sortEvents(eventsOnSelectedDate, 'time'),
            ...sortEvents(eventsNotOnSelectedDate, sortBy, viewMode === 'year', null, false, seed)
        ];
    }, [filteredEvents, sortedCurrentEvents, selectedDate, sortBy, viewMode, seed]);

    return {
        filteredEvents,
        sortedCurrentEvents,
        sortedEvents
    };
}
