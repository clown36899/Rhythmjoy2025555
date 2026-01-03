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

    // --- Drag and Drop State ---
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draggedIsRoot, setDraggedIsRoot] = useState<boolean>(false);
    const [dragDest, setDragDest] = useState<{ id: string, mode: 'reorder-top' | 'reorder-bottom' | 'reparent' } | null>(null);

    useEffect(() => {
        fetchCategories();
    }, []);

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

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to container

        // If we are over the Dragged Item itself, do nothing but consume event
        if (draggedId === id) return;

        // Explicitly clear Root Drop Target if we are over a valid item
        if (isRootDropTarget) setIsRootDropTarget(false);

        const now = Date.now();
        if (now - lastDragUpdate.current < 20) return; // Faster response 20ms
        lastDragUpdate.current = now;

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const height = rect.height;

        // Logic: Middle 50% -> Reparent, Top 25% -> Reorder Top, Bottom 25% -> Reorder Bottom
        let mode: 'reparent' | 'reorder-top' | 'reorder-bottom' = 'reparent';

        // Refined Zones:
        // Top 25% -> Insert Before
        // Bottom 25% -> Insert After
        // Middle 50% -> Reparent (Inside)

        if (offsetY < height * 0.25) {
            mode = 'reorder-top';
        } else if (offsetY > height * 0.75) {
            mode = 'reorder-bottom';
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
        if (draggedId === id) return;

        // Critical Fix: If dragging a Child Item, NEVER trigger Column Reorder (Vertical Lines)
        // Just treat hitting the column background as "Move Into This Column"
        if (!draggedIsRoot) {
            if (dragDest?.id !== id || dragDest?.mode !== 'reparent') {
                setDragDest({ id, mode: 'reparent' });
            }
            return;
        }

        // Horizontal Logic for Root Column Reordering
        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const width = rect.width;

        let mode: 'reorder-top' | 'reorder-bottom' | 'reparent';

        // Horizontal Zones: Top=Left, Bottom=Right
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

        const currentDest = dragDest; // Capture state before clearing
        setDragDest(null);

        if (!draggedId) return;
        if (targetId && draggedId === targetId) {
            setDraggedId(null); return;
        }

        try {
            const { data: allCategories, error } = await supabase
                .from('learning_categories')
                .select('*')
                .order('order_index', { ascending: true });

            if (error || !allCategories) throw error;

            const draggedItem = allCategories.find(c => c.id === draggedId);

            // Root Container Drop
            if (!targetId) {
                if (draggedItem?.parent_id === null) return;
                await supabase.from('learning_categories').update({ parent_id: null }).eq('id', draggedId);
                fetchCategories();
                onCategoryChange();
                return;
            }

            const targetItem = allCategories.find(c => c.id === targetId);

            if (draggedItem && targetItem) {
                // Circular Check
                // ... (same loop) ...
                let current = targetItem;
                let isCircle = false;
                while (current.parent_id) {
                    if (current.parent_id === draggedId) { isCircle = true; break; }
                    const parent = allCategories.find(c => c.id === current.parent_id);
                    if (!parent) break;
                    current = parent;
                }
                if (isCircle) {
                    alert("상위 폴더를 하위 폴더로 옮길 수 없습니다.");
                    return;
                }

                // Use calculated mode
                const mode = currentDest?.mode || 'reparent'; // Fallback

                if (mode === 'reparent') {
                    await supabase.from('learning_categories').update({ parent_id: targetId }).eq('id', draggedId);
                    fetchCategories();
                    onCategoryChange();
                    return;
                }

                // Reorder Logic
                if (mode.startsWith('reorder')) {
                    // We are inserting relative to targetItem.
                    // IMPORTANT: Target might NOT be sibling!
                    // If I drop "Above" a nested item, I become its sibling.

                    const newParentId = targetItem.parent_id;

                    // Get all siblings of the TARGET (where we are landing)
                    const siblings = allCategories.filter(c => c.parent_id === newParentId);

                    // Filter out draggedItem from siblings if it was already there (same parent reorder)
                    const filteredSiblings = siblings.filter(c => c.id !== draggedId);

                    // Find index of target in filtered list
                    const targetIndex = filteredSiblings.findIndex(c => c.id === targetId);

                    // Calculate insert index
                    // Top -> Insert at targetIndex
                    // Bottom -> Insert at targetIndex + 1
                    let insertIndex = targetIndex;
                    if (mode === 'reorder-bottom') insertIndex += 1;

                    // Insert draggedItem into filteredSiblings
                    const newOrderList = [...filteredSiblings];
                    newOrderList.splice(insertIndex, 0, draggedItem);

                    // Update DB
                    const updates = newOrderList.map((cat, index) => ({
                        id: cat.id,
                        order_index: index
                    }));

                    // Also ensure parent_id is updated if changed
                    if (draggedItem.parent_id !== newParentId) {
                        await supabase.from('learning_categories').update({ parent_id: newParentId }).eq('id', draggedId);
                    }

                    await Promise.all(updates.map(u =>
                        supabase.from('learning_categories').update({ order_index: u.order_index }).eq('id', u.id)
                    ));

                    fetchCategories();
                    onCategoryChange();
                }
            }
        } catch (err) {
            console.error('Drop error:', err);
        } finally {
            setDraggedId(null);
        }
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
                className={`treeItem ${isDragging ? 'dragging' : ''}`} // Removed wrapper Drag handlers
                style={{ marginLeft: `${12}px` }}
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
                {category.children && category.children.map(renderTreeItem)}
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
                onDragLeave={() => setDragDest(null)}
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {category.children && category.children.map(renderTreeItem)}
                </div>
            </div>
        );
    };

    // Add state for Root Drop Feedback
    const [isRootDropTarget, setIsRootDropTarget] = useState(false);

    // ... handleDragOver logic ...

    const handleContainerDragOver = (e: React.DragEvent) => {
        // Allow dropping on the empty background to move to Root
        e.preventDefault();

        // Only trigger if we are strictly on the container, or bubbling up from 'nothingness'
        // If we are over an item, handleDragOver catches it and calls stopPropagation.
        // So here we assume it's the background.
        if (!draggedId) return;

        if (!isRootDropTarget) {
            setIsRootDropTarget(true);
            setDragDest(null); // Clear specific item targets
        }
    };

    const handleContainerDragLeave = (e: React.DragEvent) => {
        // Use relatedTarget to check if we really left the container
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsRootDropTarget(false);
    };

    const handleContainerDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setIsRootDropTarget(false);
        if (!draggedId) return;

        // Move to Root
        await supabase.from('learning_categories').update({ parent_id: null }).eq('id', draggedId);
        fetchCategories();
        onCategoryChange();
        setDraggedId(null);
    };

    // Placeholder for addRootCategory, assuming it's defined elsewhere or needs to be added
    const addRootCategory = () => {
        console.log('Add root category clicked');
        // Implement logic to add a new root category
    };

    // ... logic ...

    // Fix JSX Structure and Render
    return (
        <div className="categoryManager">
            <div className="headerActions">
                <button onClick={addRootCategory} className="addBtn">+ 대분류 추가</button>
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
                className={`treeContainer ${isRootDropTarget ? 'dragOver-root' : ''}`}
                onDragOver={handleContainerDragOver}
                onDragLeave={handleContainerDragLeave}
                onDrop={handleContainerDrop}
            >
                {/* Ensure Columns wrap properly */}
                {isLoading ? <div className="loading">로딩 중...</div> : categories.length > 0 ? (
                    categories.map((category) => renderRootColumn(category))
                ) : (
                    <div className="empty">폴더가 없습니다.</div>
                )}

                {/* Empty State Instructions or drop zone cue */}
                {isRootDropTarget && (
                    <div className="root-drop-cue">
                        <span>📦 최상위로 이동</span>
                    </div>
                )}
            </div>
        </div>
    );
};
