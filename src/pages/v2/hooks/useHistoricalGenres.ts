import { useState, useEffect } from 'react';
import { cafe24 } from '../../../lib/cafe24Client';
import { fetchCafe24Events, isCafe24EventsBackendEnabled } from '../../../lib/cafe24EventsApi';

export const useHistoricalGenres = () => {
    const [allHistoricalGenres, setAllHistoricalGenres] = useState<string[]>([]);
    useEffect(() => {
        const fetchGenres = async () => {
            if (isCafe24EventsBackendEnabled) {
                const events = await fetchCafe24Events({ limit: 3000 });
                const atomicGenres = events
                    .map(d => d.genre)
                    .filter((g): g is string => !!g)
                    .flatMap(g => g.split(',').map(s => s.trim()));
                setAllHistoricalGenres(Array.from(new Set(atomicGenres)).sort());
                return;
            }

            const { data, error } = await cafe24.from('events').select('genre');
            if (!error && data) {
                const atomicGenres = data
                    .map(d => d.genre)
                    .filter((g): g is string => !!g)
                    .flatMap(g => g.split(',').map(s => s.trim()));
                setAllHistoricalGenres(Array.from(new Set(atomicGenres)).sort());
            }
        };
        fetchGenres();
    }, []);
    return allHistoricalGenres;
};
