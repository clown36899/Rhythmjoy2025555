import './Breadcrumbs.css';

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
}

interface Props {
    categories: Category[]; // All categories flat list or map
    currentCategoryId: string | null;
    onNavigate: (categoryId: string | null) => void;
}

export const Breadcrumbs = ({ categories, currentCategoryId, onNavigate }: Props) => {
    // Build path from current back to root
    const getPath = (currentId: string | null): Category[] => {
        if (!currentId) return [];
        const current = categories.find(c => c.id === currentId);
        if (!current) return [];
        return [...getPath(current.parent_id), current];
    };

    const path = getPath(currentCategoryId);

    return (
        <div className="breadcrumbsContainer">
            <button
                className={`breadcrumbItem ${!currentCategoryId ? 'active' : ''}`}
                onClick={() => onNavigate(null)}
            >
                🏠 홈
            </button>

            {path.map((cat, index) => (
                <div key={cat.id} className="breadcrumbWrapper">
                    <span className="breadcrumbSeparator">›</span>
                    <button
                        className={`breadcrumbItem ${index === path.length - 1 ? 'active' : ''}`}
                        onClick={() => onNavigate(cat.id)}
                    >
                        {cat.name}
                    </button>
                </div>
            ))}
        </div>
    );
};
