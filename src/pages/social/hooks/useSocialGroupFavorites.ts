import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

export function useSocialGroupFavorites() {
    const { user } = useAuth();
    const [favorites, setFavorites] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchFavorites = useCallback(async () => {
        if (!user) {
            setFavorites([]);
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('social_group_favorites')
                .select('group_id')
                .eq('user_id', user.id);

            if (error) throw error;
            setFavorites(data.map(item => item.group_id));
        } catch (error) {
            console.error('Error fetching social favorites:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    const toggleFavorite = async (groupId: number) => {
        if (!user) {
            alert('로그인이 필요한 기능입니다.');
            return;
        }

        const isFavorite = favorites.includes(groupId);

        // Optimistic Update
        if (isFavorite) {
            setFavorites(prev => prev.filter(id => id !== groupId));
        } else {
            setFavorites(prev => [...prev, groupId]);
        }

        try {
            if (isFavorite) {
                const { error } = await supabase
                    .from('social_group_favorites')
                    .delete()
                    .eq('user_id', user.id)
                    .eq('group_id', groupId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('social_group_favorites')
                    .insert([{ user_id: user.id, group_id: groupId }]);
                if (error) throw error;
            }
        } catch (error) {
            console.error('Error toggling social favorite:', error);
            // Rollback on error
            fetchFavorites();
        }
    };

    useEffect(() => {
        fetchFavorites();
    }, [fetchFavorites]);

    return {
        favorites,
        toggleFavorite,
        loading
    };
}
