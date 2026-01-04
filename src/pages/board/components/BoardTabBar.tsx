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
    { id: 'history', label: '스윙피디아', icon: 'ri-book-read-line', isWip: true },
    { id: 'market', label: '벼룩시장', icon: 'ri-store-2-line' },
];

export default function BoardTabBar({ activeCategory, onCategoryChange }: BoardTabBarProps) {
    const { data } = useBoardData();
    const [categories, setCategories] = useState<any[]>([]);
    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const scrollerRef = useRef<HTMLDivElement | null>(null);
    const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0, opacity: 0 });
    const isInitialLoad = useRef(true);
    const [showTransition, setShowTransition] = useState(false);
    const [isReady, setIsReady] = useState(false);

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
            // Temporarily disable transition during category update to prevent flicker
            const wasReady = isReady;
            if (wasReady) {
                setShowTransition(false);
            }

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

                // Add history tab
                mapped.push({
                    id: 'history',
                    label: '스윙피디아',
                    icon: 'ri-book-read-line',
                    isWip: true
                });

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

            // Re-enable transition after a brief delay
            if (wasReady) {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setShowTransition(true);
                    });
                });
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
            case 'anonymous': return 'ri-user-secret-line';
            case 'history': return 'ri-book-read-line';
            default: return 'ri-chat-3-line';
        }
    };

    // Use useLayoutEffect to ensure positioning happens BEFORE browser paint
    useLayoutEffect(() => {
        const activeTab = tabRefs.current[activeCategory];

        if (activeTab && scrollerRef.current) {
            const left = activeTab.offsetLeft;
            const width = activeTab.offsetWidth;

            if (width > 0) {
                if (isInitialLoad.current) {
                    // Lock-in first position without animation or flicker
                    setIndicatorStyle({ left, width, opacity: 1 });

                    activeTab.scrollIntoView({
                        behavior: 'auto', // Instant scroll
                        block: 'nearest',
                        inline: 'center'
                    });

                    isInitialLoad.current = false;
                    setIsReady(true);
                    // Enable transition after the first paint is settled
                    requestAnimationFrame(() => {
                        setShowTransition(true);
                    });
                } else {
                    // Subsequent switches use smooth movement
                    setIndicatorStyle({ left, width, opacity: 1 });

                    activeTab.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                        inline: 'center'
                    });
                }
            }
        }
    }, [activeCategory, categories]);

    return (
        <div className="board-tab-bar">
            <div className="board-tab-scroller" ref={scrollerRef}>
                {categories.map((cat) => (
                    <button
                        key={cat.id}
                        ref={el => { tabRefs.current[cat.id] = el; }}
                        className={`board-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id as BoardCategory)}
                    >
                        <i className={`${cat.icon} board-tab-icon`}></i>
                        <span className="board-tab-label">{cat.label}</span>
                        {cat.isWip && <span className="tab-wip-badge">준비중</span>}
                    </button>
                ))}
                <div
                    className="board-tab-indicator"
                    style={{
                        transform: `translateX(${indicatorStyle.left}px)`,
                        width: `${indicatorStyle.width}px`,
                        opacity: isReady ? 1 : 0,
                        visibility: isReady ? 'visible' : 'hidden',
                        transition: showTransition
                            ? 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease'
                            : 'none'
                    }}
                />
            </div>
        </div>
    );
}
