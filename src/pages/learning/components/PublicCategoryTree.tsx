import { useState, useEffect } from 'react';
import './PublicCategoryTree.css';

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

interface Props {
    categories: Category[]; // The hierarchical tree
    selectedCategoryId: string | null;
    onSelect: (categoryId: string | null) => void;
}

export const PublicCategoryTree = ({ categories, selectedCategoryId, onSelect }: Props) => {
    // Determine which nodes should be expanded.
    // By default, we might want to expand all, or just the path to the selected one.
    // Let's implement auto-expand logic + manual toggle.
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Effect to expand path to selected category
    useEffect(() => {
        if (selectedCategoryId) {
            // Find path? 
            // Since we receive the tree, finding path bottom-up is tricky without parent map.
            // But we can just search top-down and if a child is selected, expand parent.
            const idsToExpand = new Set<string>();

            const findAndMark = (items: Category[]): boolean => {
                let foundChild = false;
                for (const item of items) {
                    if (item.id === selectedCategoryId) {
                        foundChild = true;
                    } else if (item.children && findAndMark(item.children)) {
                        idsToExpand.add(item.id);
                        foundChild = true;
                    }
                }
                return foundChild;
            };

            findAndMark(categories);

            // Merge with existing expanded
            setExpandedIds(prev => {
                const next = new Set(prev);
                idsToExpand.forEach(id => next.add(id));
                return next;
            });
        }
    }, [selectedCategoryId, categories]);

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const renderTreeItem = (category: Category) => {
        const hasChildren = category.children && category.children.length > 0;
        const isExpanded = expandedIds.has(category.id);
        const isSelected = selectedCategoryId === category.id;

        return (
            <div key={category.id} className="treeItem" style={{ marginLeft: '12px' }}>
                <div
                    className={`treeItemContent ${isSelected ? 'selected' : ''}`}
                    onClick={() => onSelect(category.id)}
                >
                    <span
                        className={`expandIcon ${hasChildren ? '' : 'invisible'}`}
                        onClick={(e) => hasChildren && toggleExpand(category.id, e)}
                    >
                        {isExpanded ? '▼' : '▶'}
                    </span>
                    <span className="folderIcon">{isExpanded ? '📂' : '📁'}</span>
                    <span className="categoryName">{category.name}</span>
                </div>

                {hasChildren && isExpanded && (
                    <div className="childrenContainer">
                        {category.children!.map(renderTreeItem)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="categoryTreeContainer">
            {/* Root / All Button */}
            <div
                className={`treeItemContent rootItem ${selectedCategoryId === null ? 'selected' : ''}`}
                onClick={() => onSelect(null)}
            >
                <span className="expandIcon invisible">▶</span>
                <span className="folderIcon">🏠</span>
                <span className="categoryName">전체 (Root)</span>
            </div>

            <div className="treeDivider" />

            {categories.map(renderTreeItem)}
        </div>
    );
};
