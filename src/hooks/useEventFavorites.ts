import React, { useState, useEffect, useCallback } from 'react';
import type { MouseEvent } from 'react';
import { supabase } from '../lib/supabase';

export function useEventFavorites(user: any, signInWithKakao: () => void) {
    const [favoriteEventIds, setFavoriteEventIds] = useState<Set<number>>(new Set());

    const fetchFavorites = useCallback(async () => {
        if (!user) {
            setFavoriteEventIds(new Set());
            return;
        }

        const { data, error } = await supabase
            .from('event_favorites')
            .select('event_id')
            .eq('user_id', user.id);

        if (error) {
            console.error('Error fetching favorites:', error);
            return;
        }

        if (data) {
            setFavoriteEventIds(new Set(data.map(item => item.event_id)));
        }
    }, [user]);

    useEffect(() => {
        fetchFavorites();
    }, [fetchFavorites]);

    const toggleFavorite = useCallback(async (eventId: number, e?: React.MouseEvent) => {
        e?.stopPropagation();

        if (!user) {
            if (confirm('즐겨찾기는 로그인 후 이용 가능합니다.\n확인을 눌러서 로그인을 진행해주세요')) {
                try {
                    await signInWithKakao();
                } catch (err) {
                    console.error(err);
                }
            }
            return;
        }

        const isFav = favoriteEventIds.has(eventId);

        // Optimistic Update
        setFavoriteEventIds(prev => {
            const next = new Set(prev);
            if (isFav) next.delete(eventId);
            else next.add(eventId);
            return next;
        });

        if (isFav) {
            // Remove
            const { error } = await supabase
                .from('event_favorites')
                .delete()
                .eq('user_id', user.id)
                .eq('event_id', eventId);

            if (error) {
                console.error('Error removing favorite:', error);
                // Rollback
                setFavoriteEventIds(prev => {
                    const next = new Set(prev);
                    next.add(eventId);
                    return next;
                });
            }
        } else {
            // Add
            const { error } = await supabase
                .from('event_favorites')
                .insert({ user_id: user.id, event_id: eventId });

            if (error) {
                console.error('Error adding favorite:', error);
                // Rollback
                setFavoriteEventIds(prev => {
                    const next = new Set(prev);
                    next.delete(eventId);
                    return next;
                });
            }
        }
    }, [user, favoriteEventIds, signInWithKakao]);

    return { favoriteEventIds, toggleFavorite, refreshFavorites: fetchFavorites };
}
