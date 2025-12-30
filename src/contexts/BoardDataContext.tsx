import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
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
    post_likes: number[];
    post_dislikes: number[];
    post_favorites: number[];
    event_favorites: number[];
    social_group_favorites: number[];
    practice_room_favorites: number[];
    shop_favorites: number[];
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

interface BoardDataContextType {
    data: BoardStaticData | null;
    interactions: UserInteractions | null;
    loading: boolean;
    error: string | null;
    refreshData: () => Promise<void>;
    refreshInteractions: (userId: string) => Promise<void>;
}

const BoardDataContext = createContext<BoardDataContextType | undefined>(undefined);

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
            // Fallback to empty
            setInteractions({
                post_likes: [], post_dislikes: [], post_favorites: [],
                event_favorites: [], social_group_favorites: [],
                practice_room_favorites: [], shop_favorites: []
            });
        }
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            const { data: rpcData, error: rpcError } = await supabase.rpc('get_board_static_data');

            if (rpcError) throw rpcError;

            // Ensure genre_weights has at least an empty object for safety
            const processedData = {
                ...rpcData,
                genre_weights: rpcData.genre_weights || {}
            };

            setData(processedData);
        } catch (err) {
            console.error('[BoardDataContext] Error:', err);
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const refreshData = async () => {
        await fetchData();
    };

    return (
        <BoardDataContext.Provider value={{
            data,
            interactions,
            loading,
            error,
            refreshData,
            refreshInteractions: fetchInteractions
        }}>
            {children}
        </BoardDataContext.Provider>
    );
};

export const useBoardData = () => {
    const context = useContext(BoardDataContext);
    if (context === undefined) {
        throw new Error('useBoardData must be used within a BoardDataProvider');
    }
    return context;
};
