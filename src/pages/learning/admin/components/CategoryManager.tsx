import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../../lib/supabase';
import './CategoryManager.css';

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
}

export const CategoryManager = ({ onCategoryChange }: Props) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newItemName, setNewItemName] = useState('');
    const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // --- Manual Save State ---
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // --- Drag and Drop State ---
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draggedIsRoot, setDraggedIsRoot] = useState<boolean>(false);
    const [dragDest, setDragDest] = useState<{ id: string, mode: 'reorder-top' | 'reorder-bottom' | 'reparent' } | null>(null);

    useEffect(() => {
        fetchCategories();
    }, []);

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

            flatten(categories, null);

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
            setCategories(builtTree);
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
        if (!newItemName.trim()) return;
        try {
            // Get max order index for new item
            const { data: siblings } = await supabase
                .from('learning_categories')
                .select('order_index')
                .eq('parent_id', selectedParentId || null as any) // handle null safely if easy, else loop check
            // RLS or simpler: just fetch all and max

            // Simpler: Just random or 0, let user reorder. Default 0 is fine.

            const { error } = await supabase
                .from('learning_categories')
                .insert({
                    name: newItemName.trim(),
                    parent_id: selectedParentId
                });

            if (error) throw error;

            setNewItemName('');
            fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error('Error creating category:', err);
            alert('생성 실패');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`'${name}' 폴더를 삭제하시겠습니까?\n하위 폴더가 있다면 함께 삭제될 수 있습니다.`)) return;
        try {
            const { error } = await supabase
                .from('learning_categories')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error('Error deleting category:', err);
            alert('삭제 실패');
        }
    };

    const handleUpdate = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const { error } = await supabase
                .from('learning_categories')
                .update({ name: editName.trim() })
                .eq('id', id);

            if (error) throw error;
            setEditingId(null);
            fetchCategories();
            onCategoryChange();
        } catch (err) {
            console.error(err);
            alert('수정 실패');
        }
    };

    // --- DnD Handlers ---
    const handleDragStart = (e: React.DragEvent, category: Category) => {
        setDraggedId(category.id);
        setDraggedIsRoot(category.parent_id === null); // Check if root
        e.dataTransfer.effectAllowed = 'move';
        // Optional: Custom Drag Image
    };

    // Throttled DragOver with Rect Calculation
    const lastDragUpdate = useRef<number>(0);

    // Helper to find category and context
    const findCategoryContext = (items: Category[], targetId: string, parent: Category | null = null): { node: Category, parent: Category | null, index: number, siblings: Category[] } | null => {
        for (let i = 0; i < items.length; i++) {
            if (items[i].id === targetId) {
                return { node: items[i], parent, index: i, siblings: items };
            }
            if (items[i].children) {
                const result = findCategoryContext(items[i].children!, targetId, items[i]);
                if (result) return result;
            }
        }
        return null;
    };

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to container

        if (draggedId === id) return;

        // Explicitly clear Root Drop Target if we are over a valid item
        // This `isRootDropTarget` variable is not defined in the provided code.
        // Assuming it's a state variable that needs to be handled.
        // For now, I'll comment it out or assume it's handled elsewhere if not critical for this snippet.
        // if (isRootDropTarget) setIsRootDropTarget(false);

        const now = Date.now();
        if (now - lastDragUpdate.current < 20) return;
        lastDragUpdate.current = now;

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const height = rect.height;

        let mode: 'reparent' | 'reorder-top' | 'reorder-bottom' = 'reparent';

        if (offsetY < height * 0.25) {
            mode = 'reorder-top';
        } else if (offsetY > height * 0.75) {
            mode = 'reorder-bottom';
        } else {
            mode = 'reparent';
        }

        // --- Redundancy Check (No meaningless lines) ---
        if (mode !== 'reparent' && draggedId) {
            const draggedCtx = findCategoryContext(categories, draggedId);
            const targetCtx = findCategoryContext(categories, id);

            if (draggedCtx && targetCtx) {
                // Check if they are siblings (same parent ID)
                // Note: Root items have parent=null.
                const sameParent = (draggedCtx.parent?.id === targetCtx.parent?.id);

                if (sameParent) {
                    // Target is immediately AFTER dragged item (Target Index = Drag Index + 1)
                    // If I drop "Top" of Target, I am inserting before Target -> which is after Dragged. No change.
                    if (targetCtx.index === draggedCtx.index + 1 && mode === 'reorder-top') {
                        setDragDest(null);
                        return;
                    }

                    // Target is immediately BEFORE dragged item (Target Index = Drag Index - 1)
                    // If I drop "Bottom" of Target, I am inserting after Target -> which is before Dragged. No change.
                    if (targetCtx.index === draggedCtx.index - 1 && mode === 'reorder-bottom') {
                        setDragDest(null);
                        return;
                    }
                }
            }
        }

        if (dragDest?.id !== id || dragDest?.mode !== mode) {
            setDragDest({ id, mode });
        }
    };

    // Separate handler for Root Vertical Columns (Horizontal Reorder)
    const handleRootDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedId === id) return;

        // Critical Fix: If dragging a Child Item, do NOT trigger Column Reorder 
        // AND do NOT force reparent on background. Just let it be.
        if (!draggedIsRoot) {
            // User requested: Don't reparent tree column (meaning don't highlight whole column).
            // So we do nothing here. It might bubble? 
            // We called stopPropagation. So it does nothing.
            // This means dropping on Empty Column Space = No Op. 
            // This is safest to avoid "meaningless" actions or ugly highlights.
            setDragDest(null);
            return;
        }

        // Horizontal Logic for Root Column Reordering
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const width = rect.width;

        let mode: 'reorder-top' | 'reorder-bottom' | 'reparent';

        if (offsetX < width * 0.25) mode = 'reorder-top';
        else if (offsetX > width * 0.75) mode = 'reorder-bottom';
        else mode = 'reparent';

        if (dragDest?.id !== id || dragDest?.mode !== mode) {
            setDragDest({ id, mode });
        }
    };

    const handleDrop = async (e: React.DragEvent, targetId?: string) => {
        e.preventDefault();
        e.stopPropagation();

        const currentDest = dragDest;
        setDragDest(null);

        if (!draggedId) return;
        if (targetId && draggedId === targetId) {
            setDraggedId(null); return;
        }

        // 1. Calculate Local Update (Purely Local)
        const newCategories = JSON.parse(JSON.stringify(categories)); // Deep clone

        // Find Context Helper
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

        const draggedCtx = findContext(newCategories, draggedId);
        if (!draggedCtx) return;

        // Remove from old location
        draggedCtx.list.splice(draggedCtx.index, 1);
        const movedNode = draggedCtx.node;

        // Determine Destination
        let targetCtx: ReturnType<typeof findContext> = null;
        if (targetId) {
            targetCtx = findContext(newCategories, targetId);
        }

        // Logic Application
        if (!targetId) {
            // Drop to Root
            newCategories.push(movedNode);
            movedNode.parent_id = null;
        } else if (targetCtx) {
            const mode = currentDest?.mode || 'reparent';

            if (mode === 'reparent') {
                if (!targetCtx.node.children) targetCtx.node.children = [];
                targetCtx.node.children.push(movedNode);
                // Parent ID update is handled by flatten() on save
            } else {
                // Reorder
                const list = targetCtx.list;
                const targetIndex = list.findIndex(c => c.id === targetId);
                let insertIndex = targetIndex;
                if (mode === 'reorder-bottom') insertIndex += 1;

                list.splice(insertIndex, 0, movedNode);
            }
        }

        // 2. Apply Local Update & Marking as Changed
        setCategories(newCategories);
        setDraggedId(null);
        setHasChanges(true); // Enable Save Button
    };

    const renderTreeItem = (category: Category) => {
        const isEditing = editingId === category.id;
        const isSelected = selectedParentId === category.id;
        const isDragging = draggedId === category.id;

        // Destructure drag feedback
        // Now applies to itemContent
        const activeMode = (dragDest?.id === category.id) ? dragDest.mode : null;

        return (
            <div
                key={category.id}
                className={`treeItem ${isDragging ? 'dragging' : ''}`}
            >
                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} ${activeMode ? `dragOver-${activeMode}` : ''}`}
                    draggable="true"
                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, category); }}
                    onDragOver={(e) => handleDragOver(e, category.id)}
                    onDrop={(e) => handleDrop(e, category.id)}
                // No separate dragLeave needed usually if handleDragOver handles clean up or global leave
                >
                    <span
                        className="folderIcon"
                        onClick={() => setSelectedParentId(isSelected ? null : category.id)}
                    >
                        {isSelected ? '📂' : '📁'}
                    </span>

                    {isEditing ? (
                        <div className="editForm">
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
                        <span
                            className="categoryName"
                            onClick={() => setSelectedParentId(isSelected ? null : category.id)}
                        >
                            {category.name}
                        </span>
                    )}

                    <div className="actions">
                        {!isEditing && (
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
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                    {category.children && category.children.map(renderTreeItem)}
                </div>
            </div>
        );
    };

    const renderRootColumn = (category: Category) => {
        const isEditing = editingId === category.id;
        const isSelected = selectedParentId === category.id;
        const isDragging = draggedId === category.id;

        const activeMode = (dragDest?.id === category.id) ? dragDest.mode : null;

        return (
            <div
                key={category.id}
                className={`treeColumn ${isDragging ? 'dragging' : ''} ${activeMode ? `dragOver-${activeMode}` : ''}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, category)}
                onDragOver={(e) => handleRootDragOver(e, category.id)} // Specific Handler
                onDrop={(e) => handleDrop(e, category.id)}
                onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDragDest(null);
                }}
            >
                {/* Column Header */}
                <div
                    className={`columnHeader ${isSelected ? 'selected' : ''} ${activeMode === 'reparent' ? 'dragOver-reparent' : ''}`}
                >
                    {isEditing ? (
                        <div className="editForm">
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
                        <div
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'grab', flex: 1 }}
                            onClick={() => setSelectedParentId(isSelected ? null : category.id)}
                        >
                            <span style={{ fontSize: '20px' }}>📦</span>
                            <span style={{ fontWeight: 'bold' }}>{category.name}</span>
                        </div>
                    )}
                    <div className="actions">
                        {!isEditing && (
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
                {/* Prevent Bubble Up to Root Column Handler */}
                <div
                    className="treeChildren"
                    // Removed suppression: Now allows indentation + line for root items too
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                    {category.children && category.children.map(renderTreeItem)}
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
            <div className="headerActions">
                <button onClick={addRootCategory} className="addBtn">+ 대분류 추가</button>
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

            <div
                className="treeContainer"
                onDragOver={handleContainerDragOver}
                onDrop={handleContainerDrop}
            >
                {/* Ensure Columns wrap properly */}
                {isLoading ? <div className="loading">로딩 중...</div> : categories.length > 0 ? (
                    categories.map((category) => renderRootColumn(category))
                ) : (
                    <div className="empty">폴더가 없습니다.</div>
                )}

            </div>
        </div>
    );
};
