import { useState, forwardRef, useCallback, useMemo, useRef } from 'react';
import './CategoryManager.css';
import './CategoryManager_gap.css';

interface Category {
    id: string;
    name: string;
    title?: string;
    parent_id: string | null;
    category_id?: string | null;
    is_unclassified: boolean;
    children?: Category[];
    order_index?: number;
    grid_row?: number;
    grid_column?: number;
}

interface Playlist {
    id: string;
    title: string;
    category_id: string | null;
    is_unclassified: boolean;
    type?: string;
    grid_row?: number;
    grid_column?: number;
    [key: string]: any;
}

export interface CategoryManagerHandle {
    saveChanges: () => Promise<void>;
}

interface Props {
    onCategoryChange: () => void;
    readOnly?: boolean;
    selectedId?: string | null;
    onSelect?: (id: string | null) => void;
    resources?: any[]; // 🔥 SIMPLIFIED: Single prop for all resources
    onMoveResource?: (playlistId: string, targetCategoryId: string | null, isUnclassified: boolean, gridRow?: number, gridColumn?: number) => void;
    onItemClick?: (item: any) => void;
    onEditItem?: (item: any) => void;
    onReorderResource?: (sourceId: string, targetId: string, position: 'before' | 'after', gridRow?: number, gridColumn?: number) => void;
    onDeleteResource?: (id: string, type: string) => void;
    onRenameResource?: (id: string, newName: string, type: string) => void;
    dragSourceMode?: boolean;
    refreshKey?: number;
    scale?: number;
    highlightedSourceId?: string | null;
}

export const CategoryManager = forwardRef<CategoryManagerHandle, Props>((props, _ref) => {
    const {
        // onCategoryChange, // Unused
        readOnly = false,
        selectedId,
        onSelect,
        resources: injectedResources = [], // 🔥 Single resources prop
        onMoveResource,
        onItemClick,
        onEditItem,
        onReorderResource,
        onDeleteResource,
        onRenameResource,
        dragSourceMode = false,
        scale = 1,
        highlightedSourceId
    } = props;

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [tempName, setTempName] = useState('');

    const startEditing = (id: string, currentName: string) => {
        setEditingId(id);
        setTempName(currentName);
    };

    const cancelEditing = () => {
        setEditingId(null);
        setTempName('');
    };

    const saveEditing = (id: string, type: string) => {
        if (!tempName.trim()) return;
        onRenameResource?.(id, tempName, type);
        setEditingId(null);
    };

    // State for UI only (not data)
    const draggingIdRef = useRef<string | null>(null);
    const [dragDest, setDragDest] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [dropIndicator, setDropIndicator] = useState<{
        targetId: string,
        position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right',
        isTargetFolder?: boolean,
        isProximity?: boolean
    } | null>(null);

    // 🛡️ [Nuclear Logging] Indicator State Tracker
    useMemo(() => {
        if (dropIndicator) {
            console.log('🚨 [INDICATOR_UPDATE]', dropIndicator);
        } else {
            // console.log('🚨 [INDICATOR_CLEAR]');
        }
    }, [dropIndicator]);
    const dropIndicatorRef = useRef<{
        targetId: string,
        position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right',
        isTargetFolder?: boolean,
        isProximity?: boolean
    } | null>(null);



    // --- 📊 Data Derivation (Memoized) ---
    // 🔥 AUTO-CLASSIFY by type
    const injectedCategories = useMemo(() => {
        const folders = injectedResources.filter((r: any) => r.type === 'general');
        console.log('🔍 [CategoryManager] Auto-classified folders:', {
            totalResources: injectedResources.length,
            folders: folders.length,
            folderItems: folders.map((f: any) => ({ id: f.id, title: f.title, is_unclassified: f.is_unclassified }))
        });
        return folders;
    }, [injectedResources]);

    const injectedPlaylists = useMemo(() => {
        // 🔥 CRITICAL: Folders (type='general') must NEVER be in playlists
        const files = injectedResources.filter((r: any) => r.type !== 'general');
        console.log('🔍 [CategoryManager] Auto-classified files (EXCLUDING folders):', {
            totalResources: injectedResources.length,
            files: files.length,
            foldersExcluded: injectedResources.filter((r: any) => r.type === 'general').length,
            types: files.reduce((acc: any, f: any) => {
                acc[f.type || 'unknown'] = (acc[f.type || 'unknown'] || 0) + 1;
                return acc;
            }, {})
        });
        return files;
    }, [injectedResources]);

    // --- 📊 Data Derivation (Memoized) ---
    // 1. Normalize Categories
    const normalizedCategories = useMemo(() => {
        const injectedItems = injectedCategories.map(c => ({ id: c.id, name: c.name || c.title, category_id: c.category_id, parent_id: c.parent_id }));

        console.log('🔍 [CategoryManager] Normalizing categories:', {
            injectedCategoriesCount: injectedItems.length,
            sample: injectedItems.slice(0, 2)
        });

        // First pass: Map basic fields
        let items = injectedCategories.map((c: any) => ({
            id: c.id,
            name: c.name || c.title,
            // Respect proper null if defined, else fallback (legacy)
            parent_id: c.category_id !== undefined ? c.category_id : (c.parent_id ?? null),
            order_index: c.order_index,
            is_unclassified: c.is_unclassified,
            children: [],
            grid_row: c.grid_row,
            grid_column: c.grid_column
        }));

        // 🔥 FIX: Orphan Adoption logic
        // If an item refers to a parent that does NOT exist in the list, promote it to Root.
        // This handles DB data issues where Root items have invalid/stale parent_ids instead of null.
        const idSet = new Set(items.map((i: any) => i.id));

        items = items.map((item: any) => {
            if (item.parent_id !== null && !idSet.has(item.parent_id)) {
                console.warn(`⚠️ [CategoryManager] Orphan detected: ${item.name} (${item.id}) refers to missing parent ${item.parent_id}. Promoting to Root.`);
                return { ...item, parent_id: null };
            }
            return item;
        });

        console.log('✅ [CategoryManager] Normalized categories (with orphan fix):', {
            count: items.length,
            orphansFixed: items.filter((i: any) => i.parent_id === null && injectedItems.find(x => x.id === i.id)?.category_id !== null).length,
            gridDataSample: items.slice(0, 3).map(c => ({ name: c.name, row: c.grid_row, col: c.grid_column }))
        });

        return items;
    }, [injectedCategories]);

    // 2. Normalize Playlists
    const playlists = useMemo(() => {
        // Filter out non-general types for playlists (Video/Doc/Link)
        // Wait, injectedPlaylists usage depends on separate logic.
        // If we reverted separation, injectedPlaylists might be empty or contain non-general items.

        console.log('🔍 [CategoryManager] Normalizing playlists:', {
            injectedPlaylistsCount: injectedPlaylists.length
        });

        // Get Set of valid Category IDs for O(1) lookup
        const validCategoryIds = new Set(normalizedCategories.map(c => c.id));

        const result = injectedPlaylists.map((p: any) => {
            let catId = p.category_id !== undefined ? p.category_id : (p.parent_id ?? null);

            // 🔥 FIX: Orphan Adoption for Playlists
            // If category_id is set but does not exist in valid categories, promote to Root (or handle safety)
            if (catId !== null && !validCategoryIds.has(catId)) {
                console.warn(`⚠️ [CategoryManager] Orphan Playlist detected: ${p.title} (${p.id}) refers to missing category ${catId}. Promoting to Root.`);
                catId = null; // Reset to Root so it doesn't disappear
            }

            return {
                ...p,
                category_id: catId
            };
        });

        console.log('✅ [CategoryManager] Normalized playlists (with orphan fix):', {
            count: result.length,
            orphansFixed: result.filter((p: any) => p.category_id === null && injectedPlaylists.find(x => x.id === p.id)?.category_id !== null).length,
            types: result.reduce((acc: any, curr: any) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
            }, {}),
            gridDataSample: result.slice(0, 5).map((p: any) => ({
                id: p.id,
                title: p.title,
                grid_row: p.grid_row,
                grid_column: p.grid_column,
                order_index: p.order_index
            }))
        });

        return result;
    }, [injectedPlaylists, normalizedCategories]);

    // 3. Build Tree Structure
    const buildTree = useCallback((items: Category[], parentId: string | null = null) => {
        return items
            .filter((item: Category) => item.parent_id === parentId)
            .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
        // No recursive buildTree needed for normalized array, but we render recursively
        // Wait, we need children for rendering? My previous fix REMOVED .children usage in renderTreeItem!
        // So buildTree is now only used to identify ROOT nodes in the 'tree' memo. correct.
    }, []);

    const tree = useMemo(() => {
        const classifiedFolders = normalizedCategories.filter((c: Category) => !c.is_unclassified);
        console.log('🌳 [CategoryManager] Building tree:', {
            normalizedCategoriesCount: normalizedCategories.length,
            classifiedFoldersCount: classifiedFolders.length,
            classifiedFolders: classifiedFolders.map(c => ({ id: c.id, parent_id: c.parent_id }))
        });

        const result = buildTree(classifiedFolders, null); // Get Root Nodes

        console.log('✅ [CategoryManager] Tree built:', {
            rootNodesCount: result.length,
            rootNodes: result.map(n => ({ id: n.id, name: n.name }))
        });

        return result;
    }, [normalizedCategories, buildTree]);

    // Loading state is now derived from props presence (or handled by parent)
    // We assume data is ready if passed.
    const isLoading = false;


    // --- 🛡️ Safety Helpers ---
    const isDescendantOf = useCallback((targetId: string, searchId: string) => {
        if (!searchId || !targetId) return false;
        let currentItem = normalizedCategories.find(c => c.id === targetId);
        let depth = 0; // Guard against infinite loops
        while (currentItem && currentItem.parent_id && depth < 50) {
            if (currentItem.parent_id === searchId) return true;
            currentItem = normalizedCategories.find(c => c.id === currentItem!.parent_id);
            depth++;
        }
        return false;
    }, [normalizedCategories]);

    const onDragStart = (e: React.DragEvent, item: any, type: string) => {
        if (readOnly && !dragSourceMode) return;
        console.log('🚀 [DRAG_START]', { id: item.id, type });
        draggingIdRef.current = item.id;
        e.stopPropagation();
        const payload = {
            type: 'INTERNAL_MOVE', // Standardize type for internal moves
            internalType: type, // 'CATEGORY' or 'PLAYLIST'
            id: item.id,
            category_id: item.category_id || item.parent_id || null,
            is_unclassified: item.is_unclassified
        };
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragEnd = () => {
        console.log('🏁 [DRAG_END]', { lastId: draggingIdRef.current });
        draggingIdRef.current = null;
        setDragDest(null);
        setDropIndicator(null);
        dropIndicatorRef.current = null;
    };


    const onDragOver = (e: React.DragEvent, id: string, isFolder: boolean = false) => {
        const currentDraggingId = draggingIdRef.current;
        const rootContainer = document.getElementById('root-main-zone');

        // 🔥 Step 0: [At Home Check] 
        // If mouse is near original spot, block all indicators (even on neighbors)
        if (currentDraggingId && rootContainer) {
            const originEl = rootContainer.querySelector(`.treeItem[data-id="${currentDraggingId}"]`);
            if (originEl) {
                const rect = originEl.getBoundingClientRect();
                const buffer = 20;
                if (e.clientX >= rect.left - buffer && e.clientX <= rect.right + buffer &&
                    e.clientY >= rect.top - buffer && e.clientY <= rect.bottom + buffer) {
                    if (dropIndicator) {
                        console.log('🚫 [ITEM_OVER] Near Home Area - clearing indicator');
                        setDropIndicator(null);
                    }
                    dropIndicatorRef.current = null;
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
            }
        }

        // 🔥 RECURSION PREVENTION: Block self or descendant targets
        if (currentDraggingId && (id === currentDraggingId || isDescendantOf(id, currentDraggingId))) {
            if (dropIndicator) setDropIndicator(null);
            dropIndicatorRef.current = null;

            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Extended position types for specific visual feedback
        // 🔥 FIX: Default to 'after' instead of 'inside' to prevent accidental nesting in files
        let position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right' = 'after';

        if (isFolder) {
            // Folders: Very generous Inside zone (70% center area)
            // Reordering only happens at the very edges (15% margins)
            if (y < 0.15) position = 'top';
            else if (y > 0.85) position = 'bottom';
            else if (x < 0.15) position = 'left';
            else if (x > 0.85) position = 'right';
            else position = 'inside';
        } else {
            // Files/Playlists: 25% top/bottom thresholds for precise reordering
            if (y < 0.25) position = 'top';
            else if (y > 0.75) position = 'bottom';
            else if (x < 0.5) position = 'left';
            else position = 'right';
        }

        if (dropIndicator?.targetId !== id || dropIndicator?.position !== position) {
            const newIndicator = { targetId: id, position, isTargetFolder: isFolder };
            dropIndicatorRef.current = newIndicator; // Sync Ref
            if (newIndicator.targetId !== dropIndicator?.targetId || newIndicator.position !== dropIndicator?.position) {
                console.log('🔹 [ITEM_OVER] Setting indicator:', newIndicator);
                setDropIndicator(newIndicator);
            }

            // Also update dragDest for visual highlight if 'inside'
            if (position === 'inside' && isFolder) {
                if (dragDest !== id) setDragDest(id);
            } else {
                if (dragDest === id) setDragDest(null);
            }
        } else {
            // Even if state didn't change, keep ref fresh
            dropIndicatorRef.current = { targetId: id, position, isTargetFolder: isFolder };
        }
    };

    const onDrop = async (e: React.DragEvent, targetCategoryId: string | null, isUnclassified: boolean) => {
        // ... (existing onDrop logic is fine, it delegates based on indicator)
        e.preventDefault();
        e.stopPropagation();
        setDragDest(null);

        // 🔥 CRITICAL FIX: Use Ref for logic to avoid state race conditions (onDragLeave clearing state)
        const currentIndicator = dropIndicatorRef.current;

        setDropIndicator(null); // Clear UI
        dropIndicatorRef.current = null; // Clear Logic

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            const draggedId = data.id;

            // 🔥 FINAL RECURSION SAFETY: Block invalid drops that somehow bypassed onDragOver
            // (Target cannot be the dragged item itself OR any descendant of the dragged item)
            if (currentIndicator?.targetId && (currentIndicator.targetId === draggedId || isDescendantOf(currentIndicator.targetId, draggedId))) {
                console.warn('⚠️ [CategoryManager] Blocked illegal recursive move:', { draggedId, targetId: currentIndicator.targetId });
                return;
            }

            // 🔥 Calculate Grid Coordinates from mouse position (Snap-to-Grid)
            // Use the main container ID to ensure consistency when dropping on items
            const container = document.getElementById('root-main-zone');
            if (!container) return;

            const rect = container.getBoundingClientRect();
            const containerPadding = 15; // padding from container style

            // 🔥 CRITICAL: Add scroll position to account for scrolled container content
            const mouseX = e.clientX - rect.left + container.scrollLeft - containerPadding;
            const mouseY = e.clientY - rect.top + container.scrollTop - containerPadding;

            const cellWidth = 200 + 15; // item width + gap
            const cellHeight = 150 + 15; // item height + gap
            const gridColumn = Math.max(0, Math.floor(mouseX / cellWidth));
            const gridRow = Math.max(0, Math.floor(mouseY / cellHeight));

            console.log('🎯 Grid Drop (with Scroll):', { mouseX, mouseY, gridRow, gridColumn, scroll: { t: container.scrollTop, l: container.scrollLeft } });

            // 1. Check self validation (handled in reorder/move usually)
            if (draggedId === targetCategoryId && !currentIndicator) return;

            // 2. Handle Reorder
            if (currentIndicator && currentIndicator.position !== 'inside') {
                // Map visual position to logical (before/after)
                let reorderPos: 'before' | 'after' = 'after';
                if (currentIndicator.position === 'top' || currentIndicator.position === 'left' || currentIndicator.position === 'before') {
                    reorderPos = 'before';
                }

                // Call Reorder Handler with Grid Coordinates
                console.log('🔃 Reorder Action:', draggedId, reorderPos, currentIndicator.targetId, { gridRow, gridColumn });
                onReorderResource?.(draggedId, currentIndicator.targetId, reorderPos, gridRow, gridColumn);
                return;
            }

            // 3. Handle Move (Inside)
            // If `dropIndicator` was 'inside', the target IS `currentIndicator.targetId`.
            if (currentIndicator && currentIndicator.position === 'inside') {
                if (!currentIndicator.isTargetFolder) {
                    console.error("⛔ [onDrop] BLOCKED: Cannot move inside a non-folder resource!", currentIndicator);
                    return;
                }
                // Move INTO this folder (grid coords not needed for nested items)
                console.log(`📂 [onDrop] Moving INTO Folder: ${currentIndicator.targetId}`);
                onMoveResource?.(draggedId, currentIndicator.targetId, isUnclassified);
                return;
            }

            // Fallback (e.g. dropped on Root Zone background or Unclassified Zone background)
            if (targetCategoryId === null && !currentIndicator) {
                // If dropped in Unclassified Zone (isUnclassified=true)
                if (isUnclassified) {
                    onMoveResource?.(draggedId, null, true);
                    return;
                }

                // Root Zone Drop
                // Intent: "Move to End" of Root list
                // 1. Find last item in Root
                const rootPlaylists = playlists.filter(p => p.category_id === null && !p.is_unclassified && p.type !== 'general');
                const rootFolders = tree; // tree is implicitly root folders

                let lastId: string | null = null;
                if (rootPlaylists.length > 0) {
                    lastId = rootPlaylists[rootPlaylists.length - 1].id;
                } else if (rootFolders.length > 0) {
                    lastId = rootFolders[rootFolders.length - 1].id;
                }

                // 2. If valid last item found (and not self), reorder AFTER it (with grid coords)
                if (lastId && lastId !== draggedId) {
                    console.log('⬇️ Background Drop -> Move to End (After', lastId, ') (Grid:', { gridRow, gridColumn }, ')');
                    onReorderResource?.(draggedId, lastId, 'after', gridRow, gridColumn);
                    return;
                }

                // 3. Else (Empty root or moving self), just standard move (with grid coords)
                onMoveResource?.(draggedId, null, isUnclassified, gridRow, gridColumn);
                return;
            }

            // Normal move (unlikely to reach here if logic covers all)
            // 🔥 CRITICAL FIX: Disable implicit "Move Inside". 
            // Only move if explicitly indicated or targeting Root.
            // If we are here, targetCategoryId is NOT null (it's a folder), but we have NO indicator.
            // In this case, we should CANCEL, not default to inside.
            console.warn('⚠️ Drop ignored: No specific placement indicator.');
            return;
        } catch (err) {
            console.error("Drop Error:", err);
        }
    };

    const renderPlaylistItem = (playlist: Playlist) => {
        const isSelected = selectedId === playlist.id;

        // Render Logic

        // 🔥 FIX: Display correct icon based on type
        const getIcon = () => {
            if (playlist.type === 'general') return '📁'; // Folder
            if (playlist.type === 'video') return '📹'; // Video
            if (playlist.type === 'playlist') return '💿'; // Playlist
            return '📄'; // Document or other
        };

        return (
            <div
                key={playlist.id}
                data-id={playlist.id}
                className={`treeItem playlistItem ${isSelected ? 'selected' : ''}`}
                draggable={!editingId || editingId !== playlist.id}
                onDragStart={(e) => onDragStart(e, playlist, 'PLAYLIST')}
                onDragEnd={onDragEnd}
                // Reorder Logic: Check position
                onDragOver={(e) => onDragOver(e, playlist.id, false)}
                onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDropIndicator(null);
                    dropIndicatorRef.current = null; // 🔥 CRITICAL: Must clear logic ref to prevent disappearing items
                }}
                // On drop, logic handled above
                onDrop={(e) => onDrop(e, playlist.category_id, playlist.is_unclassified)}
                onClick={(e) => {
                    e.stopPropagation(); // 이벤트 전파 방지
                    if (editingId !== playlist.id) onItemClick?.(playlist);
                }}
                style={{
                    position: 'relative',
                    width: '100%',
                    minHeight: '10px',
                    ...(playlist.category_id === null && !playlist.is_unclassified ? {
                        marginBottom: '10px'
                    } : {}),
                    backgroundColor: 'transparent',
                    transition: 'all 0.1s ease',
                    opacity: dropIndicator?.targetId === playlist.id && dropIndicator?.position === 'inside' ? 0.5 : 1
                }}
            >
                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} 
                        ${dropIndicator?.targetId === playlist.id ? `reorder-${dropIndicator.position}` : ''}
                        ${dragDest === playlist.id ? 'dragOver-active' : ''}`}
                    style={{
                        backgroundColor: dropIndicator?.targetId === playlist.id && dropIndicator?.position === 'inside' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%'
                    }}
                >
                    {editingId === playlist.id ? (
                        <div className="editForm" onClick={e => e.stopPropagation()}>
                            <input
                                className="editInput"
                                value={tempName}
                                onChange={e => setTempName(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') saveEditing(playlist.id, playlist.type || 'playlist');
                                    if (e.key === 'Escape') cancelEditing();
                                }}
                                autoFocus
                            />
                            <button className="saveBtn" onClick={(e) => { e.stopPropagation(); saveEditing(playlist.id, playlist.type || 'playlist'); }}>V</button>
                            <button className="cancelBtn" onClick={(e) => { e.stopPropagation(); cancelEditing(); }}>X</button>
                        </div>
                    ) : (
                        <>
                            <span className="folderIcon">{getIcon()}</span>
                            <span className="categoryName" title={playlist.title}>{playlist.title}</span>
                            {!readOnly && (
                                <div className="actions">
                                    <button className="actionBtn" onClick={(e) => {
                                        e.stopPropagation();
                                        if (onEditItem) {
                                            onEditItem(playlist);
                                        } else {
                                            startEditing(playlist.id, playlist.title);
                                        }
                                    }}>✏️</button>
                                    <button className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); onDeleteResource?.(playlist.id, playlist.type || 'playlist'); }}>🗑️</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        );
    };

    const renderTreeItem = (category: Category) => {
        const isCollapsed = collapsedIds.has(category.id);
        const playlistsInFolder = playlists
            .filter(p => p.category_id === category.id)
            .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

        const childFolders = normalizedCategories
            .filter(c => c.parent_id === category.id && c.id !== category.id)
            .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

        const hasChildren = childFolders.length > 0 || playlistsInFolder.length > 0;
        const isSelected = selectedId === category.id;

        // Render Logic

        return (
            <div
                key={category.id}
                data-id={category.id}
                className={`treeItem treeBranch ${isCollapsed ? 'collapsed' : 'expanded'} ${isSelected ? 'selected' : ''}`}
                draggable={!editingId || editingId !== category.id}
                onDragStart={(e) => onDragStart(e, category, 'CATEGORY')}
                onDragEnd={onDragEnd}
                style={{
                    // Root-level folders no longer use absolute positioning
                    position: 'relative',
                    width: '100%',
                    minHeight: '40px',
                    ...(category.parent_id === null && !category.is_unclassified ? {
                        marginBottom: '10px'
                    } : {}),
                    backgroundColor: 'transparent',
                    transition: 'all 0.1s ease',
                    // All indicators moved to itemContent for better precision when expanded
                }}
            >
                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} 
                        ${dropIndicator?.targetId === category.id ? `reorder-${dropIndicator.position}` : ''}
                        ${dragDest === category.id ? 'dragOver-active' : ''}`}
                    style={{
                        backgroundColor: dropIndicator?.targetId === category.id && dropIndicator?.position === 'inside' ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                        borderRadius: '4px'
                    }}
                    onDragOver={(e) => onDragOver(e, category.id, true)}
                    onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setDropIndicator(null);
                        dropIndicatorRef.current = null; // 🔥 CRITICAL: Clear logic ref too
                    }}
                    onDrop={(e) => onDrop(e, category.id, category.is_unclassified)}
                    onClick={(e) => {
                        e.stopPropagation(); // 매우 중요: 트리 전파 방지
                        if (editingId !== category.id) {
                            onSelect?.(category.id);
                            onItemClick?.(category);
                        }
                    }}
                >
                    {editingId === category.id ? (
                        <div className="editForm" onClick={e => e.stopPropagation()}>
                            <input
                                className="editInput"
                                value={tempName}
                                onChange={e => setTempName(e.target.value)}
                                onClick={e => e.stopPropagation()}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') saveEditing(category.id, 'general');
                                    if (e.key === 'Escape') cancelEditing();
                                }}
                                autoFocus
                            />
                            <button className="saveBtn" onClick={(e) => { e.stopPropagation(); saveEditing(category.id, 'general'); }}>V</button>
                            <button className="cancelBtn" onClick={(e) => { e.stopPropagation(); cancelEditing(); }}>X</button>
                        </div>
                    ) : (
                        <>
                            <span
                                className="collapseToggle"
                                style={{ visibility: hasChildren ? 'visible' : 'hidden', cursor: 'pointer' }}
                                onClick={(e) => {
                                    e.stopPropagation(); // 토글 클릭 시 선택되지 않게 방지
                                    setCollapsedIds(prev => {
                                        const next = new Set(prev);
                                        next.has(category.id) ? next.delete(category.id) : next.add(category.id);
                                        return next;
                                    });
                                }}
                            >
                                {isCollapsed ? '▶' : '▼'}
                            </span>
                            <span className="folderIcon">{isSelected ? '📂' : '📁'}</span>
                            <span className="categoryName" title={category.name}>{category.name}</span>
                            {!readOnly && (
                                <div className="actions">
                                    <button className="actionBtn" onClick={(e) => {
                                        e.stopPropagation();
                                        if (onEditItem) {
                                            onEditItem(category);
                                        } else {
                                            startEditing(category.id, category.name);
                                        }
                                    }}>✏️</button>
                                    <button className="actionBtn deleteBtn" onClick={(e) => { e.stopPropagation(); onDeleteResource?.(category.id, 'general'); }}>🗑️</button>
                                </div>
                            )}
                        </>
                    )}
                </div>
                {
                    !isCollapsed && hasChildren && (
                        <div className="treeChildren" style={{ marginLeft: '16px', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            {childFolders.map(renderTreeItem)}
                            {playlistsInFolder.map(renderPlaylistItem)}
                        </div>
                    )
                }
            </div >
        );
    };

    return (
        <div className="categoryManager" style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: `${100 / scale}%`,
            minHeight: '100%',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div className="treeContainer" style={{ display: 'flex', gap: '20px', padding: '20px' }}>

                {/* [1. 트리/ROOT 구역] */}
                <div
                    className={`root-main-zone ${dragDest === 'ROOT' ? 'active' : ''}`}
                    onDragOver={(e) => {
                        const containerEl = e.currentTarget;
                        const mx = e.clientX;
                        const my = e.clientY;
                        const dragId = draggingIdRef.current;

                        // 🔥 Step 0: [At Home Check]
                        if (dragId) {
                            const originEl = containerEl.querySelector(`.treeItem[data-id="${dragId}"]`);
                            if (originEl) {
                                const rect = originEl.getBoundingClientRect();
                                const buffer = 20;
                                if (mx >= rect.left - buffer && mx <= rect.right + buffer &&
                                    my >= rect.top - buffer && my <= rect.bottom + buffer) {
                                    if (dropIndicator) {
                                        console.log('🚫 [ROOT_OVER] Inside Source Area - clearing indicator');
                                        setDropIndicator(null);
                                    }
                                    dropIndicatorRef.current = null;
                                    e.preventDefault();
                                    return;
                                }
                            }
                        }

                        e.preventDefault();
                        if (dragDest !== 'ROOT') setDragDest('ROOT');

                        // 🔥 FIX: Only consider root-level items in columns AND ignore the dragging item itself
                        const children = Array.from(containerEl.querySelectorAll('.grid-column > .treeItem[data-id]'))
                            .filter(child => child.getAttribute('data-id') !== dragId);

                        if (children.length === 0) {
                            if (dropIndicator) setDropIndicator(null);
                            dropIndicatorRef.current = null;
                            return;
                        }

                        // Step 1: Build visual map
                        const visualItems = children.map(child => {
                            const rectItem = child.querySelector('.itemContent') || child;
                            const r = rectItem.getBoundingClientRect();
                            return {
                                element: child,
                                id: child.getAttribute('data-id')!,
                                rect: r,
                                centerX: r.left + r.width / 2,
                                centerY: r.top + r.height / 2,
                                top: r.top,
                                left: r.left
                            };
                        });

                        // Step 2: Sort
                        visualItems.sort((a, b) => {
                            const rowThreshold = 20;
                            if (Math.abs(a.top - b.top) < rowThreshold) return a.left - b.left;
                            return a.top - b.top;
                        });

                        // Step 3: Find nearest
                        let minDist = Infinity;
                        let nearestItem = visualItems[0];
                        visualItems.forEach(item => {
                            const d = Math.hypot(mx - item.centerX, my - item.centerY);
                            if (d < minDist) {
                                minDist = d;
                                nearestItem = item;
                            }
                        });

                        // Proximity threshold
                        if (minDist > 80) {
                            if (dropIndicator) setDropIndicator(null);
                            dropIndicatorRef.current = null;
                            return;
                        }

                        // Step 4: Determine position
                        const r = nearestItem.rect;
                        const ix = (mx - r.left) / r.width;
                        const iy = (my - r.top) / r.height;

                        let pos: 'top' | 'bottom' | 'left' | 'right' = 'bottom';
                        if (iy < 0.3) pos = 'top';
                        else if (iy > 0.7) pos = 'bottom';
                        else if (ix < 0.5) pos = 'left';
                        else pos = 'right';

                        let lPos: 'before' | 'after' = (pos === 'top' || pos === 'left') ? 'before' : 'after';

                        const proxInd = { targetId: nearestItem.id, position: pos, logicalPosition: lPos, isProximity: true } as any;

                        if (dropIndicator?.targetId !== nearestItem.id || dropIndicator?.position !== pos) {
                            console.log('🎯 [ROOT_OVER] Setting proximity indicator:', proxInd);
                            setDropIndicator(proxInd);
                        }
                        dropIndicatorRef.current = proxInd;
                    }}
                    onDrop={(e) => onDrop(e, null, false)}
                    id="root-main-zone"
                    style={{
                        flex: 3,
                        display: 'flex',
                        flexDirection: 'row',
                        gap: '20px',
                        padding: '15px',
                        borderRadius: '12px',
                        background: dragDest === 'ROOT' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                        border: dragDest === 'ROOT' ? '2px dashed #3b82f6' : '1px solid #222',
                        overflowX: 'visible',
                        overflowY: 'visible'
                    }}
                >
                    {isLoading ? <div>Loading...</div> : (
                        <>
                            {/* NEW: Columnar Flow Layout */}
                            {Array.from({ length: Math.max(4, 1 + Math.max(0, ...[...tree, ...playlists.filter(p => !p.category_id && !p.is_unclassified)].map(i => i.grid_column ?? 0))) }).map((_, colIdx) => {
                                const colItems = [
                                    ...tree.filter(t => (t.grid_column ?? 0) === colIdx),
                                    ...playlists.filter(p => p.category_id === null && !p.is_unclassified && p.type !== 'general' && (p.grid_column ?? 0) === colIdx)
                                ].sort((a, b) => {
                                    // Primary: grid_row, Secondary: order_index
                                    if ((a.grid_row ?? 0) !== (b.grid_row ?? 0)) return (a.grid_row ?? 0) - (b.grid_row ?? 0);
                                    return (a.order_index || 0) - (b.order_index || 0);
                                });

                                if (colItems.length === 0) return null;

                                return (
                                    <div key={`col-${colIdx}`} className="grid-column" style={{
                                        width: '215px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '10px',
                                        alignItems: 'flex-start'
                                    }}>
                                        {colItems.map(item => (item.type === 'general' || !item.type) ? renderTreeItem(item as Category) : renderPlaylistItem(item as Playlist))}
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {/* [2. 미분류 보관함] */}
                <div
                    className={`unclassified-sidebar ${dragDest === 'UNCLASSIFIED' ? 'active' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Highlight the zone
                        if (dragDest !== 'UNCLASSIFIED') setDragDest('UNCLASSIFIED');
                        // IMPORTANT: Clear any item-level insertion/inside indicators
                        // so onDrop falls through to the "targetCategoryId === null && !currentIndicator" block
                        setDropIndicator(null);
                    }}
                    onDrop={(e) => onDrop(e, null, true)}
                    style={{
                        flex: 1, minWidth: '320px', padding: '20px', borderRadius: '12px',
                        background: '#111', border: dragDest === 'UNCLASSIFIED' ? '2px solid #10b981' : '1px solid #333'
                    }}
                >
                    <div className="unclassified-title" style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📥</span> 미분류 보관함
                    </div>
                    <div className="unclassified-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {/* 미분류 폴더 - 🔥 FIX: Use renderTreeItem for proper folder rendering with children */}
                        {normalizedCategories
                            .filter((c: Category) => c.is_unclassified && !c.parent_id)
                            .map(renderTreeItem)}

                        {/* 미분류 아이템 */}
                        {playlists
                            .filter((p: Playlist) => p.is_unclassified === true && !p.category_id && p.type !== 'general')
                            .map(renderPlaylistItem)}

                        {normalizedCategories.filter((c: Category) => c.is_unclassified).length === 0 &&
                            playlists.filter((p: Playlist) => p.is_unclassified === true).length === 0 && (
                                <div className="empty-msg" style={{ textAlign: 'center', padding: '40px', color: '#444', border: '1px dashed #222', borderRadius: '8px' }}>
                                    보관함이 비어있습니다.
                                </div>
                            )}
                    </div>
                </div>
            </div>
        </div>
    );
});