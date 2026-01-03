import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import './CategoryManager.css';
import './CategoryManager_gap.css';

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
    order_index?: number;
}

interface Props {
    onCategoryChange: () => void;
    // New props for unification
    readOnly?: boolean;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    categories?: Category[]; // Optional injection
    onMovePlaylist?: (playlistId: string, targetCategoryId: string) => void;
    highlightedSourceId?: string | null;
}

export const CategoryManager = ({ onCategoryChange, readOnly = false, selectedId, onSelect, categories: injectedCategories, onMovePlaylist, highlightedSourceId }: Props) => {
    // Initialize state with injected categories or empty
    const [localCategories, setLocalCategories] = useState<Category[]>(injectedCategories || []);
    const [isLoading, setIsLoading] = useState(!injectedCategories);
    const [newItemName, setNewItemName] = useState('');

    // Use external selection if provided, else local (though we should prefer external now)
    const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
    const effectiveSelectedId = selectedId !== undefined ? selectedId : localSelectedId;

    const handleSelect = (id: string | null) => {
        if (onSelect) {
            onSelect(id);
        } else {
            setLocalSelectedId(id);
        }
    };

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // --- Manual Save State ---
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- Drag and Drop State ---
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draggedIsRoot, setDraggedIsRoot] = useState<boolean>(false);
    const [dragDest, setDragDest] = useState<{ id: string, mode: 'reorder-top' | 'reparent' } | null>(null);

    // --- Collapse State ---
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

    const toggleCollapse = (id: string) => {
        setCollapsedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    // Use localCategories for rendering to allow immediate DnD feedback
    const categoriesToUse = localCategories;

    useEffect(() => {
        if (injectedCategories) {
            setLocalCategories(injectedCategories);
            setIsLoading(false);
        } else {
            fetchCategories();
        }
    }, [injectedCategories]);

    // ... (fetchCategories and buildTree remain same) ...

    // --- Save Order Logic ---
    const handleSaveOrder = async () => {
        if (!hasChanges) return;
        setIsSaving(true);
        try {
            const updates: any[] = [];
            const timestamp = new Date().toISOString();

            // Recursively flatten tree to generate updates
            const flatten = (items: Category[], parentId: string | null) => {
                items.forEach((item, index) => {
                    updates.push({
                        id: item.id,
                        name: item.name,
                        parent_id: parentId,
                        order_index: index,
                        updated_at: timestamp
                    });
                    if (item.children) {
                        flatten(item.children, item.id);
                    }
                });
            };

            flatten(categoriesToUse, null);

            // Bulk Upsert to update structure
            const { error } = await supabase
                .from('learning_categories')
                .upsert(updates);

            if (error) throw error;

            setHasChanges(false);
            alert('변경사항이 저장되었습니다.');
            onCategoryChange(); // Notify parent

        } catch (err) {
            console.error('Save failed:', err);
            alert('저장 중 오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const fetchCategories = async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('learning_categories')
                .select('*')
                .order('order_index', { ascending: true }) // Primary sort
                .order('created_at', { ascending: true }); // Secondary sort

            if (error) throw error;

            const builtTree = buildTree(data || []);
            setLocalCategories(builtTree);
        } catch (err) {
            console.error('Error fetching categories:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const buildTree = (items: any[], parentId: string | null = null, level: number = 0): Category[] => {
        return items
            .filter(item => item.parent_id === parentId)
            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0)) // Client-side sort assurance
            .map(item => ({
                ...item,
                level,
                children: buildTree(items, item.id, level + 1)
            }));
    };

    const handleCreate = async () => {
        if (readOnly) return;
        if (!newItemName.trim()) return;
        try {
            const { error } = await supabase
                .from('learning_categories')
                .insert({
                    name: newItemName.trim(),
                    parent_id: effectiveSelectedId
                });

            if (error) throw error;

            setNewItemName('');
            if (!injectedCategories) fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error('Error creating category:', err);
            alert('생성 실패');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (readOnly) return;
        if (!confirm(`'${name}' 폴더를 삭제하시겠습니까?\n하위 폴더가 있다면 함께 삭제될 수 있습니다.`)) return;
        try {
            const { error } = await supabase
                .from('learning_categories')
                .delete()
                .eq('id', id);

            if (error) throw error;
            if (!injectedCategories) fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error('Error deleting category:', err);
            alert('삭제 실패');
        }
    };

    const handleUpdate = async (id: string) => {
        if (readOnly) return;
        if (!editName.trim()) return;
        try {
            const { error } = await supabase
                .from('learning_categories')
                .update({ name: editName.trim() })
                .eq('id', id);

            if (error) throw error;
            setEditingId(null);
            if (!injectedCategories) fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error(err);
            alert('수정 실패');
        }
    };

    // --- DnD Handlers ---
    const handleDragStart = (e: React.DragEvent, category: Category) => {
        if (readOnly) return;
        setDraggedId(category.id);
        setDraggedIsRoot(category.parent_id === null); // Check if root
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Custom Drag Image
    };

    // Throttled DragOver with Rect Calculation
    const lastDragUpdate = useRef<number>(0);

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (readOnly) return;

        // Check if dragging a playlist (external drag)
        if (!draggedId && e.dataTransfer.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'move';
            // Only allow reparenting (dropping INTO a folder), not reordering
            const mode = 'reparent';
            if (dragDest?.id !== id || dragDest?.mode !== mode) {
                setDragDest({ id, mode });
            }
            return;
        }

        if (draggedId === id) return;

        const now = Date.now();
        if (now - lastDragUpdate.current < 20) return;
        lastDragUpdate.current = now;

        const target = e.target as HTMLElement;
        const currentTarget = e.currentTarget as HTMLElement;

        let mode: 'reparent' | 'reorder-top' = 'reparent';

        // If target is the treeItem itself (gap/padding area), show insert line
        // If target is itemContent or its children, reparent mode
        if (target === currentTarget || target.classList.contains('treeItem')) {
            mode = 'reorder-top';
        } else {
            mode = 'reparent';
        }

        if (dragDest?.id !== id || dragDest?.mode !== mode) {
            setDragDest({ id, mode });
        }
    };

    // Separate handler for Root Vertical Columns (Horizontal Reorder)
    const handleRootDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;

        // Check if dragging a playlist (external drag)
        if (!draggedId && e.dataTransfer.types.includes('application/json')) {
            e.dataTransfer.dropEffect = 'move';
            // Root columns can accept playlists as children
            const mode = 'reparent';
            if (dragDest?.id !== id || dragDest?.mode !== mode) {
                setDragDest({ id, mode });
            }
            return;
        }

        if (draggedId === id) return;

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const width = rect.width;

        let mode: 'reorder-top' | 'reparent';

        // Horizontal: Left 30% -> Insert Before. Rest -> Reparent.
        if (offsetX < width * 0.3) mode = 'reorder-top'; // Left
        else mode = 'reparent';

        if (dragDest?.id !== id || dragDest?.mode !== mode) {
            setDragDest({ id, mode });
        }
    };

    const handleDrop = async (e: React.DragEvent, targetId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (readOnly) return;

        const currentDest = dragDest;
        setDragDest(null); // Clear highlight immediately

        // Handle External Playlist Drop
        if (!draggedId && e.dataTransfer.types.includes('application/json')) {
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.type === 'PLAYLIST_MOVE' && data.playlistId && targetId && onMovePlaylist) {
                    onMovePlaylist(data.playlistId, targetId);
                }
            } catch (err) {
                console.error('Failed to parse dropped data', err);
            }
            return;
        }

        if (!draggedId) return;
        if (targetId && draggedId === targetId) {
            setDraggedId(null); return;
        }

        // 1. Snapshot State
        const newCategories = JSON.parse(JSON.stringify(categoriesToUse));

        // Find Helpers
        const findContext = (tree: Category[], id: string, parent: Category | null = null): { node: Category, parent: Category | null, list: Category[], index: number } | null => {
            for (let i = 0; i < tree.length; i++) {
                if (tree[i].id === id) {
                    return { node: tree[i], parent, list: tree, index: i };
                }
                if (tree[i].children && tree[i].children!.length > 0) {
                    const res = findContext(tree[i].children!, id, tree[i]);
                    if (res) return res;
                }
            }
            return null;
        };

        // 2. Remove Old
        const draggedCtx = findContext(newCategories, draggedId);
        if (!draggedCtx) return;
        draggedCtx.list.splice(draggedCtx.index, 1);
        const movedNode = draggedCtx.node;

        // 3. Insert New
        if (!targetId) {
            // Container Drop -> Append to Root
            newCategories.push(movedNode);
            movedNode.parent_id = null;
        } else {
            const targetCtx = findContext(newCategories, targetId);
            if (targetCtx) {
                const mode = currentDest?.mode || 'reparent';

                if (mode === 'reparent') {
                    if (!targetCtx.node.children) targetCtx.node.children = [];
                    targetCtx.node.children.push(movedNode);
                    // Parent ID updated on save
                } else if (mode === 'reorder-top') {
                    // Insert Before Target
                    targetCtx.list.splice(targetCtx.index, 0, movedNode);
                }
            }
        }

        setLocalCategories(newCategories);
        setDraggedId(null);
        setHasChanges(true);
    };

    const renderTreeItem = (category: Category) => {
        const isEditing = editingId === category.id;
        const isSelected = effectiveSelectedId === category.id;
        const isDragging = draggedId === category.id;
        const activeMode = (dragDest?.id === category.id) ? dragDest.mode : null;

        return (
            <div
                key={category.id}
                className={`treeItem ${isDragging ? 'dragging' : ''}`}
                draggable={!readOnly}
                onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, category); }}
            >
                {/* Gap before this item - for insertion */}
                <div
                    className={`itemGap ${!readOnly && activeMode === 'reorder-top' ? 'dragOver-active' : ''}`}
                    onDragOver={!readOnly ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (draggedId && draggedId !== category.id) {
                            setDragDest({ id: category.id, mode: 'reorder-top' });
                        }
                    } : undefined}
                    onDrop={!readOnly ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(e, category.id);
                    } : undefined}
                    onDragLeave={!readOnly ? () => {
                        if (dragDest?.id === category.id && dragDest?.mode === 'reorder-top') {
                            setDragDest(null);
                        }
                    } : undefined}
                />

                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} ${activeMode === 'reparent' ? 'dragOver-reparent' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Use unified handler which supports external playlist dragging (draggedId is null)
                        handleDragOver(e, category.id);
                    }}
                    onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDrop(e, category.id);
                    }}
                    onClick={() => !isEditing && handleSelect(isSelected ? null : category.id)}
                    style={{ cursor: 'pointer' }}
                >
                    {/* Collapse toggle for folders with children */}
                    {category.children && category.children.length > 0 && (
                        <span
                            className="collapseToggle"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleCollapse(category.id);
                            }}
                        >
                            {collapsedIds.has(category.id) ? '▶' : '▼'}
                        </span>
                    )}

                    <span className="folderIcon">
                        {isSelected ? '📂' : '📁'}
                    </span>

                    {isEditing ? (
                        <div className="editForm" onClick={(e) => e.stopPropagation()}>
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="editInput"
                                autoFocus
                            />
                            <button onClick={() => handleUpdate(category.id)} className="saveBtn">V</button>
                            <button onClick={() => setEditingId(null)} className="cancelBtn">X</button>
                        </div>
                    ) : (
                        <span className="categoryName" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {category.name}
                            {highlightedSourceId === category.id && (
                                <span className="source-dot" title="이동할 항목의 원래 위치">●</span>
                            )}
                        </span>
                    )}

                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                        {!readOnly && !isEditing && (
                            <>
                                <button
                                    onClick={() => {
                                        setEditingId(category.id);
                                        setEditName(category.name);
                                    }}
                                    className="actionBtn"
                                    title="이름 변경"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={() => handleDelete(category.id, category.name)}
                                    className="actionBtn deleteBtn"
                                    title="삭제"
                                >
                                    🗑
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {/* Children */}
                <div
                    className="treeChildren"
                    onDragOver={(e) => { e.preventDefault(); }}
                    style={{ display: collapsedIds.has(category.id) ? 'none' : 'flex' }}
                >
                    {category.children && category.children.map(renderTreeItem)}
                </div>
            </div>
        );
    };

    const renderRootColumn = (category: Category) => {
        const isEditing = editingId === category.id;
        const isSelected = effectiveSelectedId === category.id;
        const isDragging = draggedId === category.id;
        const activeMode = (dragDest?.id === category.id) ? dragDest.mode : null;
        const isCollapsed = collapsedIds.has(category.id);

        return (
            <div
                key={category.id}
                className={`treeColumn ${isDragging ? 'dragging' : ''} ${activeMode === 'reorder-top' ? 'dragOver-reorder-top' : ''}`}
                draggable={!readOnly}
                onDragStart={(e) => handleDragStart(e, category)}
                onDragOver={(e) => handleRootDragOver(e, category.id)}
                onDrop={(e) => handleDrop(e, category.id)}
                onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    // setDragDest(null); // Optional: keep selection stable
                }}
            >
                {/* Column Header */}
                <div
                    className={`columnHeader ${isSelected ? 'selected' : ''} ${activeMode === 'reparent' ? 'dragOver-reparent' : ''}`}
                    onClick={() => !isEditing && handleSelect(isSelected ? null : category.id)}
                    style={{ cursor: 'pointer' }}
                >
                    {isEditing ? (
                        <div className="editForm" onClick={(e) => e.stopPropagation()}>
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="editInput"
                                autoFocus
                            />
                            <button onClick={() => handleUpdate(category.id)} className="saveBtn">V</button>
                            <button onClick={() => setEditingId(null)} className="cancelBtn">X</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
                            {category.children && category.children.length > 0 && (
                                <span
                                    className="collapseToggle"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleCollapse(category.id);
                                    }}
                                    style={{ padding: '4px', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    {isCollapsed ? '▶' : '▼'}
                                </span>
                            )}
                            <span style={{ fontSize: '20px' }}>📦</span>
                            <span style={{ fontWeight: 'bold' }}>{category.name}</span>
                            {highlightedSourceId === category.id && (
                                <span className="source-dot" title="이동할 항목의 원래 위치">●</span>
                            )}
                        </div>
                    )}
                    <div className="actions" onClick={(e) => e.stopPropagation()}>
                        {!readOnly && !isEditing && (
                            <>
                                <button
                                    onClick={() => {
                                        setEditingId(category.id);
                                        setEditName(category.name);
                                    }}
                                    className="actionBtn"
                                    title="이름 변경"
                                >
                                    ✏️
                                </button>
                                <button
                                    onClick={() => handleDelete(category.id, category.name)}
                                    className="actionBtn deleteBtn"
                                    title="삭제"
                                >
                                    🗑
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Children of Root */}
                {/* Root children container: allows dropping to append at end of list */}
                <div
                    className="treeChildren"
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    style={{
                        display: isCollapsed ? 'none' : 'flex'
                    }}
                // Empty space in column after children
                >
                    {category.children && category.children.map(renderTreeItem)}
                    {/* Drop Zone for Appending to Root Column */}
                    {!readOnly && draggedId && category.children && !isCollapsed && (
                        <div
                            style={{ height: '20px', flex: 1 }}
                            onDragOver={(e) => {
                                e.preventDefault(); e.stopPropagation();
                            }}
                        />
                    )}
                </div>
            </div>
        );
    };

    // Placeholder for addRootCategory, assuming it's defined elsewhere or needs to be added
    const addRootCategory = () => {
        // ... handled elsewhere or triggers logic ...
    };

    // Invisible Drop Zone Handlers for Root
    const handleContainerDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // allow drop
    };

    const handleContainerDrop = (e: React.DragEvent) => {
        // Only trigger if directly on container (or bubbling from empty space)
        if (!draggedId) return;

        // Call local handleDrop with no targetId -> treated as Move to Root
        handleDrop(e);
    };

    // ... logic ...

    // Fix JSX Structure and Render
    return (
        <div className="categoryManager">
            {!readOnly && (
                <div className="headerActions">
                    {/* addRootCategory should be implemented or simplified. Let's just use the form below for now or enable this if needed */}
                    {/* <button onClick={addRootCategory} className="addBtn">+ 대분류 추가</button> */}

                    {hasChanges && (
                        <button
                            onClick={handleSaveOrder}
                            disabled={isSaving}
                            className="saveChangesBtn"
                            style={{
                                backgroundColor: '#10b981',
                                color: 'white',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                marginLeft: '8px',
                                fontWeight: 'bold',
                                opacity: isSaving ? 0.7 : 1,
                                border: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {isSaving ? '저장 중...' : '💾 변경사항 저장'}
                        </button>
                    )}
                </div>
            )}

            {!readOnly && (
                <div className="createForm">
                    <div className="inputGroup">
                        <input
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="새 폴더 이름"
                            className="createInput"
                        />
                        <button onClick={handleCreate} className="createBtn" disabled={!newItemName}>
                            추가
                        </button>
                    </div>
                </div>
            )}

            <div
                className="treeContainer"
                onDragOver={handleContainerDragOver}
                onDrop={handleContainerDrop}
            >
                {/* Ensure Columns wrap properly */}
                {isLoading ? <div className="loading">로딩 중...</div> : categoriesToUse.length > 0 ? (
                    categoriesToUse.map((category) => renderRootColumn(category))
                ) : (
                    <div className="empty">폴더가 없습니다.</div>
                )}

            </div>
        </div>
    );
};
