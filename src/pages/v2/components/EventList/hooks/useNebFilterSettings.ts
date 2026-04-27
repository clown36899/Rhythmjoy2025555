import { useState, useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';

export interface NebFilterSettings {
    sort_by: 'created_at' | 'date';
    time_window_hours: number;
    max_items: number;
    use_fallback: boolean;
    include_genres: string[];
}

// 이벤트 등록 폼에서 선택 가능한 전체 장르 목록
export const ALL_NEB_GENRES = [
    '워크샵', '파티', '대회', '라이브밴드',
    '린디합', '솔로재즈', '발보아', '블루스',
    '정규강습', '팀원모집', '소셜', '기타',
];

export const DEFAULT_NEB_FILTER_SETTINGS: NebFilterSettings = {
    sort_by: 'created_at',
    time_window_hours: 72,
    max_items: 6,
    use_fallback: true,
    include_genres: ['워크샵', '파티', '대회', '라이브밴드', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '소셜', '기타'],
};

export function useNebFilterSettings() {
    const [settings, setSettings] = useState<NebFilterSettings>(DEFAULT_NEB_FILTER_SETTINGS);

    useEffect(() => {
        supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'neb_filter_settings')
            .maybeSingle()
            .then(({ data }) => {
                if (data?.value) {
                    setSettings({ ...DEFAULT_NEB_FILTER_SETTINGS, ...data.value });
                }
            });
    }, []);

    return settings;
}
