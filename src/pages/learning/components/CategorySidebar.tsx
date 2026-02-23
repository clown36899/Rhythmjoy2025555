import { useState, useEffect } from 'react';
import styles from './CategorySidebar.module.css';

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

interface Props {
    categories: Category[];
    selectedCategoryId: string | null;
    onSelect: (categoryId: string | null) => void;
}

export const CategorySidebar = ({ categories, selectedCategoryId, onSelect }: Props) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Auto-expand path to selected category (optional, requires parent mapping)
    // For now, simpler manual toggle

    const toggleExpand = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setExpandedIds(newSet);
    };

    const renderTreeItem = (category: Category) => {
        const hasChildren = category.children && category.children.length > 0;
        const isExpanded = expandedIds.has(category.id);
        const isSelected = selectedCategoryId === category.id;

        return (
            <div key={category.id} className={styles.treeItem}>
                <div
                    className={`${styles.itemContent} ${isSelected ? styles.selected : ''}`}
                    onClick={() => onSelect(category.id)}
                    style={{ paddingLeft: `${(category.level || 0) * 12 + 12}px` }}
                >
                    <span
                        className={`${styles.toggleIcon} ${hasChildren ? '' : styles.invisible}`}
                        onClick={(e) => hasChildren && toggleExpand(category.id, e)}
                    >
                        {isExpanded ? '▼' : '▶'}
                    </span>
                    <span className={styles.folderIcon}>{isExpanded ? '📂' : '📁'}</span>
                    <span className={styles.name}>{category.name}</span>
                </div>

                {hasChildren && isExpanded && (
                    <div className={styles.children}>
                        {category.children!.map(renderTreeItem)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.container}>
            <div
                className={`${styles.itemContent} ${selectedCategoryId === null ? styles.selected : ''}`}
                onClick={() => onSelect(null)}
                style={{ paddingLeft: '12px' }}
            >
                <span className={`${styles.toggleIcon} ${styles.invisible}`}>▶</span>
                <span className={styles.folderIcon}>🏠</span>
                <span className={styles.name}>전체 보기</span>
            </div>
            <div className={styles.divider} />
            {categories.map(renderTreeItem)}
        </div>
    );
};
