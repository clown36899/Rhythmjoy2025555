import { useState, useEffect } from 'react';
import { cafe24 } from '../../../../../lib/cafe24Client';

export interface NebFilterSettings {
    sort_by: 'created_at' | 'date';
    time_window_hours: number;
    max_items: number;
    use_fallback: boolean;
    include_genres: string[];
}

export const NEB_MAX_ITEMS = 7;

// 이벤트 등록 폼에서 선택 가능한 전체 장르 목록
export const ALL_NEB_GENRES = [
    '워크샵', '파티', '대회', '라이브밴드',
    '린디합', '솔로재즈', '발보아', '블루스',
    '정규강습', '팀원모집', '소셜', '기타',
];

export const DEFAULT_NEB_FILTER_SETTINGS: NebFilterSettings = {
    sort_by: 'created_at',
    time_window_hours: 72,
    max_items: NEB_MAX_ITEMS,
    use_fallback: true,
    include_genres: ['워크샵', '파티', '대회', '라이브밴드', '린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '소셜', '기타'],
};

export const clampNebMaxItems = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return DEFAULT_NEB_FILTER_SETTINGS.max_items;
    return Math.min(Math.max(numeric, 1), NEB_MAX_ITEMS);
};

export const normalizeNebFilterSettings = (value?: Partial<NebFilterSettings> | null): NebFilterSettings => ({
    ...DEFAULT_NEB_FILTER_SETTINGS,
    ...value,
    max_items: clampNebMaxItems(value?.max_items ?? DEFAULT_NEB_FILTER_SETTINGS.max_items),
});

export function useNebFilterSettings() {
    const [settings, setSettings] = useState<NebFilterSettings>(DEFAULT_NEB_FILTER_SETTINGS);

    useEffect(() => {
        cafe24
            .from('app_settings')
            .select('value')
            .eq('key', 'neb_filter_settings')
            .maybeSingle()
            .then(({ data }) => {
                if (data?.value) {
                    setSettings(normalizeNebFilterSettings(data.value));
                }
            });
    }, []);

    return settings;
}
