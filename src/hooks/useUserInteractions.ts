import { useEffect, useCallback } from 'react';
import { useBoardData } from '../contexts/BoardDataContext';

export const useUserInteractions = (userId: string | null) => {
    const { interactions, loading, error, refreshInteractions, toggleEventFavorite: baseToggle } = useBoardData();

    useEffect(() => {
        if (userId && !interactions && !loading) {
            refreshInteractions(userId);
        }
    }, [userId, interactions, loading, refreshInteractions]);

    const refreshInteractionsCallback = useCallback(() => {
        return userId ? refreshInteractions(userId) : Promise.resolve();
    }, [userId, refreshInteractions]);

    const toggleEventFavoriteCallback = useCallback((eventId: number | string) => {
        return userId ? baseToggle(userId, eventId) : Promise.resolve();
    }, [userId, baseToggle]);

    return {
        interactions,
        loading,
        error,
        refreshInteractions: refreshInteractionsCallback,
        toggleEventFavorite: toggleEventFavoriteCallback
    };
};
