import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
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
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    is_active: boolean;
    created_at: string;
}

interface BoardStaticData {
    categories: BoardCategory[];
    prefixes: Record<string, BoardPrefix[]>;
    theme_settings: ThemeSettings;
    billboard_settings: BillboardSettings;
    practice_rooms: PracticeRoom[];
    shops: Shop[];
}

interface BoardDataContextType {
    data: BoardStaticData | null;
    loading: boolean;
    error: string | null;
    refreshData: () => Promise<void>;
}

const BoardDataContext = createContext<BoardDataContextType | undefined>(undefined);

export const BoardDataProvider = ({ children }: { children: ReactNode }) => {
    const [data, setData] = useState<BoardStaticData | null>(null);
    const [loading, setLoading] = useState(false); // 초기 false로 변경하여 흰 화면 방지
    const [error, setError] = useState<string | null>(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            setError(null);

            const { data: rpcData, error: rpcError } = await supabase.rpc('get_board_static_data');

            if (rpcError) throw rpcError;

            setData(rpcData);
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
        <BoardDataContext.Provider value={{ data, loading, error, refreshData }}>
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
