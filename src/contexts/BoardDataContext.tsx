import { createContext, useContext, useEffect, useState, useCallback, useMemo, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface BoardCategory {
    id: number;
    code: string;
    name: string;
    description: string | null;
    is_active: boolean;
    display_order: number;
    created_at: string;
    updated_at: string;
}

interface BoardPrefix {
    id: number;
    name: string;
    color: string;
    admin_only: boolean;
    board_category_code: string;
    display_order: number;
    created_at: string;
}

interface ThemeSettings {
    id: number;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    header_bg_color?: string; // Added
    calendar_bg_color?: string; // Added
    event_list_bg_color?: string; // Added
    event_list_outer_bg_color?: string; // Added
    page_bg_color?: string; // Added
    created_at: string;
    updated_at: string;
}

interface BillboardSettings {
    id: number;
    enabled: boolean;
    dateRangeStart: string | null;
    dateRangeEnd: string | null;
    excludedWeekdays: number[] | null;
    excludedEventIds: number[] | null;
    inactivityTimeout: number;
    showControls: boolean;
    autoOpenOnLoad: boolean;
    default_thumbnail_class: string | null;
    default_thumbnail_event: string | null;
}

interface PracticeRoom {
    id: string; // venues.id is usually uuid or int, logic uses string in banner
    name: string;
    address: string;
    images: (string | any)[] | null;
    category: string;
    display_order: number;
    is_active: boolean;
}

interface Shop {
    id: number; // Changed from string to number to match ShoppingPage
    name: string;
    description: string | null;
    logo_url: string | null;
    website_url: string; // Added
    is_active: boolean;
    created_at: string;
    featured_items?: any[]; // Added to satisfy compatibility, though maybe empty from static data
}

export interface UserInteractions {
    post_likes: (number | string)[];
    post_dislikes: (number | string)[];
    post_favorites: (number | string)[];
    anonymous_post_likes: number[];
    anonymous_post_dislikes: number[];
    comment_likes: string[];
    comment_dislikes: string[];
    anonymous_comment_likes: number[];
    anonymous_comment_dislikes: number[];
    event_favorites: (number | string)[];
    social_group_favorites: (number | string)[];
    practice_room_favorites: (number | string)[];
    shop_favorites: (number | string)[];
}

interface BoardStaticData {
    categories: BoardCategory[];
    prefixes: Record<string, BoardPrefix[]>;
    theme_settings: ThemeSettings;
    billboard_settings: BillboardSettings;
    practice_rooms: PracticeRoom[];
    shops: Shop[];
    genre_weights?: Record<string, number>; // Added
}


// --- 1. Static Configuration Context ---
interface BoardStaticContextType {
    data: BoardStaticData | null;
    loading: boolean;
    error: string | null;
    refreshData: () => Promise<void>;
}

const BoardStaticContext = createContext<BoardStaticContextType | undefined>(undefined);

// --- 2. User Interactions Context ---
interface UserInteractionsContextType {
    interactions: UserInteractions | null;
    refreshInteractions: (userId: string) => Promise<void>;
    toggleEventFavorite: (userId: string, eventId: number | string) => Promise<void>;
}

const UserInteractionsContext = createContext<UserInteractionsContextType | undefined>(undefined);

// --- Hooks ---
export const useBoardStaticData = () => {
    const context = useContext(BoardStaticContext);
    if (context === undefined) {
        throw new Error('useBoardStaticData must be used within a BoardStaticProvider');
    }
    return context;
};

export const useUserInteractionsContext = () => {
    const context = useContext(UserInteractionsContext);
    if (context === undefined) {
        throw new Error('useUserInteractionsContext must be used within a UserInteractionsProvider');
    }
    return context;
};

// Compatibility Hook (combines both)
export const useBoardData = () => {
    const staticData = useBoardStaticData();
    const interactions = useUserInteractionsContext();

    return useMemo(() => ({
        ...staticData,
        ...interactions
    }), [staticData, interactions]);
};

// --- Providers ---
export const BoardDataProvider = ({ children }: { children: ReactNode }) => {
    const [data, setData] = useState<BoardStaticData | null>(null);
    const [interactions, setInteractions] = useState<UserInteractions | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchInteractions = useCallback(async (userId: string) => {
        try {
            const { data: interactionData, error: interactionError } = await supabase.rpc('get_user_interactions', {
                p_user_id: userId
            });
            if (interactionError) throw interactionError;
            setInteractions(interactionData);
        } catch (err) {
            console.error('[BoardDataContext] Interactions Error:', err);
            setInteractions({
                post_likes: [], post_dislikes: [], post_favorites: [],
                anonymous_post_likes: [], anonymous_post_dislikes: [],
                comment_likes: [], comment_dislikes: [],
                anonymous_comment_likes: [], anonymous_comment_dislikes: [],
                event_favorites: [], social_group_favorites: [],
                practice_room_favorites: [], shop_favorites: []
            });
        }
    }, []);

    const toggleEventFavorite = useCallback(async (userId: string, eventId: number | string) => {
        const numericId = typeof eventId === 'number' ? eventId : Number(eventId);
        if (isNaN(numericId)) return;

        // Save current state for rollback
        const currentInteractions = interactions;
        const currentFavorites = (interactions?.event_favorites || []).map(id => Number(id));
        const isCurrentlyFavorite = currentFavorites.includes(numericId);

        // 1. Optimistic Update: UI responds immediately
        const nextFavorites = isCurrentlyFavorite
            ? currentFavorites.filter(id => id !== numericId)
            : [...currentFavorites, numericId];

        setInteractions(prev => {
            const base = prev || {
                post_likes: [], post_dislikes: [], post_favorites: [],
                anonymous_post_likes: [], anonymous_post_dislikes: [],
                comment_likes: [], comment_dislikes: [],
                anonymous_comment_likes: [], anonymous_comment_dislikes: [],
                event_favorites: [], social_group_favorites: [],
                practice_room_favorites: [], shop_favorites: []
            };
            return {
                ...base,
                event_favorites: nextFavorites
            };
        });

        try {
            if (isCurrentlyFavorite) {
                const { error } = await supabase
                    .from('event_favorites')
                    .delete()
                    .eq('user_id', userId)
                    .eq('event_id', numericId);

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('event_favorites')
                    .insert({ user_id: userId, event_id: numericId });

                // If 409 Conflict (Duplicate key), it's already favorited.
                // We treat this as a success since the end state (is favorited) is correct.
                if (error && error.code !== '23505') throw error;
            }

            // 2. Background Sync: Ensure state is purely identical to DB
            await fetchInteractions(userId);
        } catch (err) {
            console.error('[BoardDataContext] toggleEventFavorite Error:', err);
            // Rollback optimistic update on actual error
            setInteractions(currentInteractions);
            throw err;
        }
    }, [interactions, fetchInteractions]);

    const fetchData = useCallback(async () => {
        const controller = new AbortController();
        const signal = controller.signal;

        try {
            setLoading(true);
            setError(null);

            const { data: rpcData, error: rpcError } = await supabase.rpc('get_board_static_data');

            if (signal.aborted) return;
            if (rpcError) throw rpcError;

            const processedData = {
                ...rpcData,
                genre_weights: rpcData.genre_weights || {}
            };

            setData(processedData);
        } catch (err) {
            if (signal.aborted) return;
            console.error('[BoardDataContext] Error:', err);
            setError((err as Error).message);
        } finally {
            if (!signal.aborted) {
                setLoading(false);
            }
        }

        return () => controller.abort();
    }, []);

    useEffect(() => {
        const cleanup = fetchData();
        return () => {
            cleanup.then(abort => abort && abort());
        };
    }, [fetchData]);

    const refreshData = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    // Separate Values for Better Granularity
    const staticValue = useMemo(() => ({
        data,
        loading,
        error,
        refreshData
    }), [data, loading, error, refreshData]);

    const interactionValue = useMemo(() => ({
        interactions,
        refreshInteractions: fetchInteractions,
        toggleEventFavorite
    }), [interactions, fetchInteractions, toggleEventFavorite]);

    return (
        <BoardStaticContext.Provider value={staticValue}>
            <UserInteractionsContext.Provider value={interactionValue}>
                {children}
            </UserInteractionsContext.Provider>
        </BoardStaticContext.Provider>
    );
};
