import './BoardTabBar.css';
import { useEffect, useState, useRef } from 'react';
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

export default function BoardTabBar({ activeCategory, onCategoryChange }: BoardTabBarProps) {
    const [categories, setCategories] = useState<any[]>(DEFAULT_CATEGORIES);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

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

                // Add dev-log tab at the end (hardcoded, not from DB)
                mapped.push({
                    id: 'dev-log',
                    label: '개발일지',
                    icon: 'ri-code-box-line'
                });

                setCategories(mapped);
            } else {
                // Failsafe: If DB empty, show defaults + dev-log
                console.warn('DB categories empty, using defaults');
                setCategories([...DEFAULT_CATEGORIES, {
                    id: 'dev-log',
                    label: '개발일지',
                    icon: 'ri-code-box-line'
                }]);
            }
        } catch (error) {
            console.error('Failed to load board categories:', error);
            setCategories([...DEFAULT_CATEGORIES, {
                id: 'dev-log',
                label: '개발일지',
                icon: 'ri-code-box-line'
            }]); // Fallback on error
        }
    };

    const getIconForCategory = (code: string) => {
        switch (code) {
            case 'notice': return 'ri-megaphone-line';
            case 'market': return 'ri-store-2-line';
            case 'trade': return 'ri-exchange-line';
            case 'free': return 'ri-chat-1-line';
            case 'dev-log': return 'ri-code-box-line';
            default: return 'ri-chat-3-line';
        }
    };

    // Update indicator position when active category changes
    useEffect(() => {
        const activeIndex = categories.findIndex(cat => cat.id === activeCategory);
        if (activeIndex !== -1 && tabRefs.current[activeIndex] && scrollerRef.current) {
            const activeTab = tabRefs.current[activeIndex];
            const scroller = scrollerRef.current;
            const left = activeTab.offsetLeft;
            const width = activeTab.offsetWidth;
            setIndicatorStyle({ left, width });

            // Scroll active tab into view
            activeTab.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
        }
    }, [activeCategory, categories]);

    return (
        <div className="board-tab-bar">
            <div className="board-tab-scroller" ref={scrollerRef}>
                {categories.map((cat, index) => (
                    <button
                        key={cat.id}
                        ref={el => tabRefs.current[index] = el}
                        className={`board-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id as BoardCategory)}
                    >
                        <i className={`${cat.icon} board-tab-icon`}></i>
                        <span className="board-tab-label">{cat.label}</span>
                    </button>
                ))}
                <div
                    className="board-tab-indicator"
                    style={{
                        transform: `translateX(${indicatorStyle.left}px)`,
                        width: `${indicatorStyle.width}px`
                    }}
                />
            </div>
        </div>
    );
}
