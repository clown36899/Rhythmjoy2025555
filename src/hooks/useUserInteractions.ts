import { useEffect } from 'react';
import { useBoardData } from '../contexts/BoardDataContext';

export const useUserInteractions = (userId: string | null) => {
    const { interactions, loading, error, refreshInteractions } = useBoardData();

    useEffect(() => {
        if (userId && !interactions && !loading) {
            refreshInteractions(userId);
        }
    }, [userId, interactions, loading, refreshInteractions]);

    return {
        interactions,
        loading,
        error,
        refreshInteractions: () => userId ? refreshInteractions(userId) : Promise.resolve()
    };
};
