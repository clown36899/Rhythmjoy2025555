import { useState, useEffect } from 'react';
import { supabase } from '../../../../../lib/supabase';

export interface HomeSectionVisibility {
    show_new_events_banner: boolean;
    show_favorites: boolean;
    show_upcoming_events: boolean;
    show_classes: boolean;
    show_club_lessons: boolean;
    show_club_regular_classes: boolean;
}

export const DEFAULT_HOME_SECTION_VISIBILITY: HomeSectionVisibility = {
    show_new_events_banner: true,
    show_favorites: true,
    show_upcoming_events: true,
    show_classes: true,
    show_club_lessons: true,
    show_club_regular_classes: true,
};

export function useHomeSectionVisibility() {
    const [visibility, setVisibility] = useState<HomeSectionVisibility>(DEFAULT_HOME_SECTION_VISIBILITY);

    useEffect(() => {
        supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'home_section_visibility')
            .maybeSingle()
            .then(({ data }) => {
                if (data?.value) {
                    setVisibility({ ...DEFAULT_HOME_SECTION_VISIBILITY, ...data.value });
                }
            });
    }, []);

    return visibility;
}
