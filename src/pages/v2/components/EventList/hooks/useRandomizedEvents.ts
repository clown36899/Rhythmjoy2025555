import { useMemo, useState, useEffect } from 'react';
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

    // 랜덤 시드 저장 (장르 변경 시에만 재생성)
    const [randomSeed, setRandomSeed] = useState(() => Math.random());

    // 장르가 변경될 때만 시드 재생성
    useEffect(() => {
        setRandomSeed(Math.random());
    }, [eventGenre, classGenre, clubGenre]);

    const randomizedFutureEvents = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'event' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random');
    }, [events, today, randomSeed]);

    const randomizedRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'class' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, today, randomSeed]);

    const randomizedClubLessons = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            !e.genre?.includes('정규강습') &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, today, randomSeed]);

    const randomizedClubRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            e.genre?.includes('정규강습')
        );
        return sortEvents(filtered, 'random', false, genreWeights, true);
    }, [events, genreWeights, randomSeed]);

    return {
        randomizedFutureEvents,
        randomizedRegularClasses,
        randomizedClubLessons,
        randomizedClubRegularClasses
    };
}
