import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import type { SocialGroup } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

export function useSocialGroups() {
    const [groups, setGroups] = useState<SocialGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const { user, isAdmin } = useAuth();

    const fetchGroups = useCallback(async () => {
        setLoading(true);
        try {
            const selectQuery = isAdmin
                ? '*, board_users(nickname), social_group_favorites!left(user_id)'
                : '*, social_group_favorites!left(user_id)';

            const { data, error } = await supabase
                .from('social_groups')
                .select(selectQuery)
                .order('created_at', { ascending: true });

            if (error) throw error;

            const formattedGroups = data.map((group: any) => ({
                ...group,
                is_favorite: group.social_group_favorites?.some((f: any) => f.user_id === user?.id)
            }));

            // 정렬 로직 적용:
            // 1순위: 신규 모집 공고(recruit_content)가 있는 그룹 (updated_at 내림차순 - 최신순)
            // 2순위: 그 외 그룹 (created_at 오름차순 - 기존 순서 유지)
            formattedGroups.sort((a: SocialGroup, b: SocialGroup) => {
                const hasRecruitA = !!a.recruit_content;
                const hasRecruitB = !!b.recruit_content;

                if (hasRecruitA && !hasRecruitB) return -1; // A가 위로
                if (!hasRecruitA && hasRecruitB) return 1;  // B가 위로

                if (hasRecruitA && hasRecruitB) {
                    // 둘 다 모집 공고가 있으면 최신 업데이트 순
                    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
                }

                // 둘 다 없으면 생성일 순 (오래된 순 - 기존 유지)
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });

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
