import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useModalNavigation } from './useModalNavigation';

export function useVenueNavigation() {
    const { openModal } = useModalNavigation();

    const handleVenueClick = useCallback(async (venueId: string, category?: string) => {
        // 1. Fast Path: Trust explicit category if known
        const lowerCat = category?.toLowerCase();
        if (lowerCat === 'social' || lowerCat === 'party' || lowerCat === 'regular') {
            openModal({ placeId: venueId, venueId: null });
            return;
        }

        // 2. Robust Path: Check DB for venue type
        try {
            const { data } = await supabase
                .from('social_places')
                .select('id')
                .eq('id', venueId)
                .maybeSingle();

            if (data) {
                // It is a Social Place
                openModal({ placeId: venueId, venueId: null });
            } else {
                // Fallback: It is likely a Practice/Class Venue
                openModal({ venueId: venueId, placeId: null });
            }
        } catch (err) {
            console.error('Error verifying venue type:', err);
            // Default Fallback
            openModal({ venueId: venueId, placeId: null });
        }
    }, [openModal]);

    return { handleVenueClick };
}
