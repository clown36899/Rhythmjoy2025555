import { supabase } from '../lib/supabase';
import { useEffect, useState } from 'react';

interface UserInteractions {
    post_likes: number[];
    post_dislikes: number[];
    post_favorites: number[];
    event_favorites: number[];
    social_group_favorites: number[];
    practice_room_favorites: number[];
    shop_favorites: number[];
}

export const useUserInteractions = (userId: string | null) => {
    const [interactions, setInteractions] = useState<UserInteractions | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!userId) {
            setInteractions(null);
            return;
        }

        const fetchInteractions = async () => {
            setLoading(true);
            setError(null);

            try {
                const { data, error: rpcError } = await supabase.rpc('get_user_interactions', {
                    p_user_id: userId
                });

                if (rpcError) throw rpcError;

                setInteractions(data);
            } catch (err) {
                console.error('[useUserInteractions] Error:', err);
                setError((err as Error).message);
                // Fallback to empty arrays
                setInteractions({
                    post_likes: [],
                    post_dislikes: [],
                    post_favorites: [],
                    event_favorites: [],
                    social_group_favorites: [],
                    practice_room_favorites: [],
                    shop_favorites: []
                });
            } finally {
                setLoading(false);
            }
        };

        fetchInteractions();
    }, [userId]);

    return { interactions, loading, error };
};
