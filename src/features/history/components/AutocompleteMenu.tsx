import React, { useEffect, useRef } from 'react';

interface AutocompleteItem {
    id: string | number;
    title: string;
    type: 'video' | 'playlist' | 'person' | 'document' | 'general' | 'canvas' | 'node';
}

interface AutocompleteMenuProps {
    items: AutocompleteItem[];
    position: { top: number; left: number };
    selectedIndex: number;
    onSelect: (item: AutocompleteItem) => void;
    onClose: () => void;
}

export const AutocompleteMenu: React.FC<AutocompleteMenuProps> = ({
    items,
    position,
    selectedIndex,
    onSelect,
    onClose
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    if (items.length === 0) {
        return (
            <div
                ref={menuRef}
                style={{
                    position: 'fixed',
                    top: position.top,
                    left: position.left,
                    zIndex: 10000,
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    width: '250px',
                    padding: '8px',
                    color: '#9ca3af',
                    fontSize: '0.85rem',
                    textAlign: 'center'
                }}
            >
                연결할 요소가 없습니다
            </div>
        );
    }

    return (
        <div
            ref={menuRef}
            style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 10000,
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                width: '250px',
                maxHeight: '200px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <div style={{
                padding: '8px',
                fontSize: '0.75rem',
                color: '#9ca3af',
                borderBottom: '1px solid #374151',
                fontWeight: 600,
                backgroundColor: '#111827'
            }}>
                자료/노드 연결 (Enter로 선택)
            </div>
            <ul
                ref={listRef}
                style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    overflowY: 'auto',
                    flex: 1
                }}
            >
                {items.map((item, index) => (
                    <li
                        key={`${item.type}-${item.id}`}
                        onClick={() => onSelect(item)}
                        style={{
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            color: '#e5e7eb',
                            backgroundColor: index === selectedIndex ? '#3b82f6' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            borderBottom: '1px solid #374151'
                        }}
                        onMouseEnter={(e) => {
                            if (index !== selectedIndex) e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                            if (index !== selectedIndex) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                    >
                        <span style={{ fontSize: '1rem' }}>
                            {item.type === 'video' ? '📺' :
                                item.type === 'playlist' ? '📹' :
                                    item.type === 'person' ? '👤' :
                                        item.type === 'document' ? '📄' :
                                            item.type === 'canvas' ? '🗺️' :
                                                item.type === 'node' ? '🧩' : '📁'}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
