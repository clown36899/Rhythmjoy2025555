import { useMemo } from 'react';
import { sortEvents, getLocalDateString, type Event } from '../../../utils/eventListUtils';

interface UseRandomizedEventsProps {
    events: Event[];
    genreWeights: Record<string, number> | null;
    eventGenre: string | null;
    classGenre: string | null;
    clubGenre: string | null;
}

export function useRandomizedEvents({
    events,
    genreWeights,
    eventGenre,
    classGenre,
    clubGenre
}: UseRandomizedEventsProps) {
    const today = getLocalDateString();

    const randomizedFutureEvents = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'event' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random');
    }, [events, eventGenre, today]); // eventGenre included to trigger re-randomization on change

    const randomizedRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'class' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, classGenre, today]);

    const randomizedClubLessons = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            !e.genre?.includes('정규강습') &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, clubGenre, today]);

    const randomizedClubRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            e.genre?.includes('정규강습')
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, clubGenre]);

    return {
        randomizedFutureEvents,
        randomizedRegularClasses,
        randomizedClubLessons,
        randomizedClubRegularClasses
    };
}
