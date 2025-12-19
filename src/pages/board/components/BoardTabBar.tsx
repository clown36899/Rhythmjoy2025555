import './BoardTabBar.css';
import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabase';

export type BoardCategory = string; // Relaxed type for dynamic categories

interface BoardTabBarProps {
    activeCategory: BoardCategory;
    onCategoryChange: (category: BoardCategory) => void;
}

// Fallback categories in case DB fetch fails
const DEFAULT_CATEGORIES = [
    { id: 'free', label: '자유게시판', icon: 'ri-chat-1-line' },
    { id: 'trade', label: '양도/양수', icon: 'ri-exchange-line' },
    { id: 'notice', label: '건의/공지', icon: 'ri-megaphone-line' },
    { id: 'market', label: '벼룩시장', icon: 'ri-store-2-line' },
];

interface BoardCategoryItem {
    code: string;
    name: string;
    display_order: number;
    is_active: boolean;
}

export default function BoardTabBar({ activeCategory, onCategoryChange }: BoardTabBarProps) {
    const [categories, setCategories] = useState<any[]>(DEFAULT_CATEGORIES);

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            const { data, error } = await supabase
                .from('board_categories')
                .select('*')
                .eq('is_active', true) // Only show active boards
                .order('display_order', { ascending: true });

            if (error) throw error;

            if (data && data.length > 0) {
                // Map DB data to UI format
                const mapped = data.map((item: any) => ({
                    id: item.code,
                    label: item.name,
                    icon: getIconForCategory(item.code)
                }));
                setCategories(mapped);
            } else {
                // Failsafe: If DB empty, show defaults
                console.warn('DB categories empty, using defaults');
                setCategories(DEFAULT_CATEGORIES);
            }
        } catch (error) {
            console.error('Failed to load board categories:', error);
            setCategories(DEFAULT_CATEGORIES); // Fallback on error
        }
    };

    const getIconForCategory = (code: string) => {
        switch (code) {
            case 'notice': return 'ri-megaphone-line';
            case 'market': return 'ri-store-2-line';
            case 'trade': return 'ri-exchange-line';
            case 'free': return 'ri-chat-1-line';
            default: return 'ri-chat-3-line';
        }
    };

    return (
        <div className="board-tab-bar">
            <div className="board-tab-scroller">
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        className={`board-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id as BoardCategory)}
                    >
                        <i className={`${cat.icon} board-tab-icon`}></i>
                        <span className="board-tab-label">{cat.label}</span>
                        {activeCategory === cat.id && <div className="board-tab-indicator" />}
                    </button>
                ))}
            </div>
        </div>
    );
}
