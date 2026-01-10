import './VenueTabBar.css';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

export type VenueCategory = string;

interface VenueTabBarProps {
    activeCategory: VenueCategory;
    onCategoryChange: (category: VenueCategory) => void;
}

interface VenueCategoryData {
    id: string;
    label: string;
    icon: string;
}

export default function VenueTabBar({ activeCategory, onCategoryChange }: VenueTabBarProps) {
    const [categories, setCategories] = useState<VenueCategoryData[]>([]);
    const [loading, setLoading] = useState(true);
    const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

    useEffect(() => {
        loadCategories();
    }, []);

    const loadCategories = async () => {
        try {
            // Get unique categories from venues table
            const { data, error } = await supabase
                .from('venues')
                .select('category')
                .eq('is_active', true)
                .order('display_order', { ascending: true });

            if (error) throw error;

            if (data) {
                // Get unique categories from DB
                const dbCategories = Array.from(new Set(data.map(v => v.category)));

                // Ensure '연습실' and '스윙바' are always included
                const defaultCategories = ['연습실', '스윙바'];
                const mergedCategories = Array.from(new Set([...defaultCategories, ...dbCategories]));

                // Map to UI format
                const mapped = mergedCategories.map((category) => ({
                    id: category,
                    label: category,
                    icon: getIconForCategory(category)
                }));

                setCategories(mapped);
            } else {
                // Fallback: default categories
                console.warn('No venues found, using default categories');
                setCategories([
                    { id: '연습실', label: '연습실', icon: 'ri-music-2-line' },
                    { id: '스윙바', label: '스윙바', icon: 'ri-goblet-line' }
                ]);
            }
        } catch (error) {
            console.error('Failed to load venue categories:', error);
            // Fallback on error
            setCategories([
                { id: '연습실', label: '연습실', icon: 'ri-music-2-line' },
                { id: '스윙바', label: '스윙바', icon: 'ri-goblet-line' }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const getIconForCategory = (category: string) => {
        switch (category) {
            case '연습실': return 'ri-music-2-line';
            case '스윙바': return 'ri-goblet-line';
            default: return 'ri-map-pin-line';
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

            // Scroll functionality removed to prevent screen jumping
            /*
            activeTab.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center'
            });
            */
        }
    }, [activeCategory, categories]);

    if (loading) {
        return (
            <div className="venue-tab-bar">
                <div className="venue-tab-scroller">
                    <div className="venue-tab-loading">로딩 중...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="venue-tab-bar">
            <div className="venue-tab-scroller" ref={scrollerRef}>
                {categories.map((cat, index) => (
                    <button
                        key={cat.id}
                        ref={el => tabRefs.current[index] = el}
                        className={`venue-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id as VenueCategory)}
                    >
                        <i className={`${cat.icon} venue-tab-icon`}></i>
                        <span className="venue-tab-label">{cat.label}</span>
                    </button>
                ))}
                <div
                    className="venue-tab-indicator"
                    style={{
                        transform: `translateX(${indicatorStyle.left}px)`,
                        width: `${indicatorStyle.width}px`
                    }}
                />
            </div>
        </div>
    );
}
