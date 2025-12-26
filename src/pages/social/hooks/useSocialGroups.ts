import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialGroup } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

export function useSocialGroups() {
    const [groups, setGroups] = useState<SocialGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const { user } = useAuth();

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('social_groups')
                .select(`
          *,
          social_group_favorites!left(user_id)
        `)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const formattedGroups = data.map((group: any) => ({
                ...group,
                is_favorite: group.social_group_favorites?.some((f: any) => f.user_id === user?.id)
            }));

            setGroups(formattedGroups);
        } catch (err) {
            console.error('Error fetching social groups:', err);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        fetchGroups();
    }, [fetchGroups]);

    return {
        groups,
        loading,
        refresh: fetchGroups
    };
}
