import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export const useHistoricalGenres = () => {
    const [allHistoricalGenres, setAllHistoricalGenres] = useState<string[]>([]);
    useEffect(() => {
        const fetchGenres = async () => {
            const { data, error } = await supabase.from('events').select('genre');
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
