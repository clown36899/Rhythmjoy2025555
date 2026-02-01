import { useMemo, useState } from 'react';
import { sortEvents, getLocalDateString, type Event } from '../../../utils/eventListUtils';

interface UseRandomizedEventsProps {
    events: Event[];
    genreWeights: Record<string, number> | null;
}

export function useRandomizedEvents({
    events,
    genreWeights
}: UseRandomizedEventsProps) {
    const today = getLocalDateString();

    // [Fix] 랜덤 시드 고정 - 사이트 진입/새로고침 시에만 한 번 생성되도록 변경
    // 기존의 useEffect(setRandomSeed, [genres]) 로직을 삭제하여 필터 변경 시 순서가 바뀌지 않게 함
    const [randomSeed] = useState(() => Math.random() * 1000000);

    const randomizedFutureEvents = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'event' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, null, false, randomSeed);
    }, [events, today, randomSeed]);

    const randomizedRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'class' &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true, randomSeed);
    }, [events, genreWeights, today, randomSeed]);

    const randomizedClubLessons = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            !e.genre?.includes('정규강습') &&
            (e.end_date || e.date || "") >= today
        );
        return sortEvents(filtered, 'random', false, genreWeights, true, randomSeed);
    }, [events, genreWeights, today, randomSeed]);

    const randomizedClubRegularClasses = useMemo(() => {
        const filtered = events.filter(e =>
            e.category === 'club' &&
            e.genre?.includes('정규강습')
        );
        return sortEvents(filtered, 'random', false, genreWeights, true, randomSeed);
    }, [events, genreWeights, randomSeed]);

    return {
        randomizedFutureEvents,
        randomizedRegularClasses,
        randomizedClubLessons,
        randomizedClubRegularClasses
    };
}
