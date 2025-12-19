import './BoardTabBar.css';

export type BoardCategory = 'free' | 'trade' | 'notice' | 'market';

interface BoardTabBarProps {
    activeCategory: BoardCategory;
    onCategoryChange: (category: BoardCategory) => void;
}

const CATEGORIES: { id: BoardCategory; label: string; icon: string }[] = [
    { id: 'free', label: '자유게시판', icon: 'ri-chat-1-line' },
    { id: 'trade', label: '양도/양수', icon: 'ri-exchange-line' },
    { id: 'notice', label: '건의/공지', icon: 'ri-megaphone-line' },
    { id: 'market', label: '벼룩시장', icon: 'ri-store-2-line' },
];

export default function BoardTabBar({ activeCategory, onCategoryChange }: BoardTabBarProps) {
    return (
        <div className="board-tab-bar">
            <div className="board-tab-scroller">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        className={`board-tab-item ${activeCategory === cat.id ? 'active' : ''}`}
                        onClick={() => onCategoryChange(cat.id)}
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
