import './BoardTabBar.css';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { useBoardData } from '../../../contexts/BoardDataContext';

export type BoardCategory = string; // Relaxed type for dynamic categories

interface BoardTabBarProps {
    activeCategory: BoardCategory;
    onCategoryChange: (category: BoardCategory) => void;
}

// Fallback categories in case DB fetch fails
const DEFAULT_CATEGORIES = [
    { id: 'free', label: '포럼', icon: 'ri-chat-1-line' },
    { id: 'anonymous', label: '익명 게시판', icon: 'ri-user-secret-line' },
    { id: 'trade', label: '양도/양수', icon: 'ri-exchange-line' },
    { id: 'notice', label: '건의/공지', icon: 'ri-megaphone-line' },
    { id: 'market', label: '벼룩시장', icon: 'ri-store-2-line' },
    { id: 'dev-log', label: '개발일지', icon: 'ri-code-box-line' },
];

export default function BoardTabBar({ activeCategory, onCategoryChange }: BoardTabBarProps) {
    const { data } = useBoardData();
    const [categories, setCategories] = useState<any[]>(DEFAULT_CATEGORIES);
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });

    useEffect(() => {
        loadCategories();

        // Listen for category refresh events from admin panel
        const handleRefresh = () => {
            loadCategories();
        };

        window.addEventListener('refreshBoardCategories', handleRefresh);
        return () => window.removeEventListener('refreshBoardCategories', handleRefresh);
    }, [data]);

    const loadCategories = () => {
        try {
            const dbCategories = data?.categories;
            if (dbCategories && dbCategories.length > 0) {
                // Map DB data to UI format
                const mapped: any[] = dbCategories.map((item: any) => {
                    let label = item.name;

                    // Translation optimization: ambiguous terms mapping
                    if (label === '자유게시판') label = '포럼';
                    if (label === '익명게시판') label = '익명 게시판'; // anonymity -> Anonymous Board
                    if (label === '제작중') label = '준비중'; // In production -> Preparing/Coming Soon

                    return {
                        id: item.code,
                        label: label,
                        icon: getIconForCategory(item.code)
                    };
                });


                // Add dev-log tab at the end if not already present
                if (!mapped.some(c => c.id === 'dev-log')) {
                    mapped.push({
                        id: 'dev-log',
                        label: '개발일지',
                        icon: 'ri-code-box-line'
                    });
                }

                setCategories(mapped);
            } else {
                // Failsafe: If DB empty, show defaults
                // console.warn('DB categories empty, using defaults');
                setCategories(DEFAULT_CATEGORIES);
            }

            // Transition logic removed for simplicity

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
            case 'dev-log': return 'ri-code-box-line';
            case 'anonymous': return 'ri-user-secret-line';
            case 'history': return 'ri-youtube-line';
            default: return 'ri-chat-3-line';
        }
    };

    // Use useLayoutEffect to ensure positioning happens correctly
    // Use useLayoutEffect to ensure positioning happens correctly
    useLayoutEffect(() => {
        const activeTab = tabRefs.current[activeCategory];

        if (activeTab && scrollerRef.current) {
            const labelSpan = activeTab.querySelector('.board-tab-label') as HTMLElement;

            let left = activeTab.offsetLeft;
            let width = activeTab.offsetWidth;

            if (labelSpan) {
                // Width matches the text label
                width = labelSpan.offsetWidth;
                // Left matches the button position + label offset within button
                left += labelSpan.offsetLeft;
            }

            if (width > 0) {
                setIndicatorStyle({ left, width, opacity: 1 });
                activeTab.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        }
    }, [activeCategory, categories]);

    return (
        <div className="board-tab-outer">
            <div className="board-tab-bar">
                <div className="board-tab-scroller" ref={scrollerRef} role="tablist">
                    {categories.map((cat, index) => (
                        <div key={cat.id} style={{ display: 'flex', alignItems: 'center' }}>
                            {index > 0 && (
                                <span className="board-tab-separator">|</span>
                            )}
                            <button
                                ref={el => { tabRefs.current[cat.id] = el; }}
                                className={`board-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                                onClick={() => onCategoryChange(cat.id as BoardCategory)}
                                role="tab"
                                aria-selected={activeCategory === cat.id}
                            >
                                <span className="board-tab-label">{cat.label}</span>
                                {cat.isWip && <span className="tab-wip-badge">준비중</span>}
                            </button>
                        </div>
                    ))}
                    <div
                        className="board-tab-indicator"
                        style={{
                            transform: `translateX(${indicatorStyle.left}px)`,
                            width: `${indicatorStyle.width}px`,
                            opacity: indicatorStyle.width > 0 ? 1 : 0,
                            visibility: indicatorStyle.width > 0 ? 'visible' : 'hidden',
                            transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                        }}
                    />
                </div>
            </div>
        </div>
    );
}
