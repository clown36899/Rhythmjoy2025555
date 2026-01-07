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
    onReorderResource?: (sourceId: string, targetId: string, position: 'before' | 'after', gridRow?: number, gridColumn?: number) => void;
    dragSourceMode?: boolean;
    refreshKey?: number;
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
        onReorderResource,
        dragSourceMode = false
    } = props;

    // State for UI only (not data)
    const [dragDest, setDragDest] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
    const [dropIndicator, setDropIndicator] = useState<{ targetId: string, position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right' } | null>(null);
    const dropIndicatorRef = useRef<{ targetId: string, position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right' } | null>(null);



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


    const onDragStart = (e: React.DragEvent, item: any, type: string) => {
        if (readOnly && !dragSourceMode) return;
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

    const onDragOver = (e: React.DragEvent, id: string, isFolder: boolean = false) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;

        // Extended position types for specific visual feedback
        let position: 'before' | 'after' | 'inside' | 'top' | 'bottom' | 'left' | 'right' = 'inside';

        if (isFolder) {
            // Folders: Very intentional 'inside' zone (center 20% in Y, center 40% in X)
            // Smaller 'inside' area prevents accidental moves into folders.
            if (y > 0.4 && y < 0.6 && x > 0.3 && x < 0.7) {
                position = 'inside';
            } else if (y < 0.4) {
                position = 'top';
            } else if (y > 0.6) {
                position = 'bottom';
            } else if (x < 0.5) {
                position = 'left';
            } else {
                position = 'right';
            }
        } else {
            // Files/Playlists: 40% top/bottom, 10% sides (approx)
            if (y < 0.4) position = 'top';
            else if (y > 0.6) position = 'bottom';
            else if (x < 0.5) position = 'left';
            else position = 'right';
        }

        if (dropIndicator?.targetId !== id || dropIndicator?.position !== position) {
            const newIndicator = { targetId: id, position };
            dropIndicatorRef.current = newIndicator; // Sync Ref
            setDropIndicator(newIndicator);

            // Also update dragDest for visual highlight if 'inside'
            if (position === 'inside') {
                if (dragDest !== id) setDragDest(id);
            } else {
                if (dragDest) setDragDest(null);
            }
        } else {
            // Even if state didn't change, keep ref fresh
            dropIndicatorRef.current = { targetId: id, position };
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
                // Move INTO this folder (grid coords not needed for nested items)
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

        if (playlist.category_id === null && !playlist.is_unclassified) {
            console.log(`🎨 [CategoryManager] Render PlaylistItem (${playlist.title}) Row: ${playlist.grid_row ?? 'none'}, Col: ${playlist.grid_column ?? 'none'}`);
        }

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
                className={`treeItem playlistItem ${isSelected ? 'selected' : ''} ${dragDest === playlist.id ? 'dragOver-active' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, playlist, 'PLAYLIST')}
                // Reorder Logic: Check position
                onDragOver={(e) => onDragOver(e, playlist.id, false)}
                onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setDropIndicator(null);
                }}
                // On drop, logic handled above
                onDrop={(e) => onDrop(e, playlist.category_id, playlist.is_unclassified)}
                onClick={(e) => {
                    e.stopPropagation(); // 이벤트 전파 방지
                    onItemClick?.(playlist);
                }}
                style={{
                    // Only use absolute positioning for ROOT-level items
                    ...(playlist.category_id === null && !playlist.is_unclassified ? {
                        position: 'absolute',
                        left: `${((playlist.grid_column ?? Math.floor((playlist.order_index || 0) / 100) % 4)) * 215}px`,
                        top: `${((playlist.grid_row ?? Math.floor((playlist.order_index || 0) / 100 / 4))) * 165}px`,
                        width: '200px',
                        height: '150px',
                    } : {
                        // Nested items use relative positioning
                        position: 'relative',
                        width: '100%',
                        minHeight: '40px',
                    }),
                    boxShadow: dropIndicator?.targetId === playlist.id ? (
                        (dropIndicator?.position === 'top' || dropIndicator?.position === 'before') ? 'inset 0 4px 0 0 #3b82f6' :
                            (dropIndicator?.position === 'bottom' || dropIndicator?.position === 'after') ? 'inset 0 -4px 0 0 #3b82f6' :
                                dropIndicator?.position === 'left' ? 'inset 4px 0 0 0 #3b82f6' :
                                    dropIndicator?.position === 'right' ? 'inset -4px 0 0 0 #3b82f6' :
                                        dropIndicator?.position === 'inside' ? 'inset 0 0 0 2px #3b82f6' : 'none'
                    ) : 'none',
                    opacity: dropIndicator?.targetId === playlist.id && dropIndicator?.position === 'inside' ? 0.5 : 1
                }}
            >
                <span className="folderIcon">{getIcon()}</span>
                <span className="categoryName">{playlist.title}</span>
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

        if (category.parent_id === null && !category.is_unclassified) {
            console.log(`🎨 [CategoryManager] Rendering FolderItem (${category.name}) at Row: ${category.grid_row}, Col: ${category.grid_column}`);
        }

        return (
            <div
                key={category.id}
                data-id={category.id}
                className={`treeItem treeBranch ${isCollapsed ? 'collapsed' : 'expanded'} ${isSelected ? 'selected' : ''} ${dragDest === category.id ? 'dragOver-active' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, category, 'CATEGORY')}
                style={{
                    // Only use absolute positioning for ROOT-level folders
                    ...(category.parent_id === null && !category.is_unclassified ? {
                        position: 'absolute',
                        left: `${((category.grid_column ?? Math.floor((category.order_index || 0) / 100) % 4)) * 215}px`,
                        top: `${((category.grid_row ?? Math.floor((category.order_index || 0) / 100 / 4))) * 165}px`,
                        width: '200px',
                        minHeight: '150px',
                    } : {
                        // Nested folders use relative positioning
                        position: 'relative',
                        width: '100%',
                        minHeight: '40px',
                    }),
                    boxShadow: dropIndicator?.targetId === category.id ? (
                        (dropIndicator?.position === 'top' || dropIndicator?.position === 'before') ? 'inset 0 4px 0 0 #3b82f6' :
                            (dropIndicator?.position === 'bottom' || dropIndicator?.position === 'after') ? 'inset 0 -4px 0 0 #3b82f6' :
                                dropIndicator?.position === 'left' ? 'inset 4px 0 0 0 #3b82f6' :
                                    dropIndicator?.position === 'right' ? 'inset -4px 0 0 0 #3b82f6' :
                                        'none'
                    ) : 'none',
                    // Inside highlight handled by class
                }}
            >
                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} ${dragDest === category.id ? 'dragOver-active' : ''}`}
                    onDragOver={(e) => onDragOver(e, category.id, true)}
                    onDragLeave={(e) => {
                        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                        setDropIndicator(null);
                    }}
                    onDrop={(e) => onDrop(e, category.id, category.is_unclassified)}
                    onClick={(e) => {
                        e.stopPropagation(); // 매우 중요: 트리 전파 방지
                        onSelect?.(category.id);
                        onItemClick?.(category);
                    }}
                >
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
                    <span className="categoryName">{category.name}</span>
                </div>
                {!isCollapsed && hasChildren && (
                    <div className="treeChildren" style={{ marginLeft: '16px', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {childFolders.map(renderTreeItem)}
                        {playlistsInFolder.map(renderPlaylistItem)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="categoryManager">
            <div className="treeContainer" style={{ display: 'flex', gap: '20px', minHeight: '500px', padding: '20px' }}>

                {/* [1. 트리/ROOT 구역] */}
                <div
                    className={`root-main-zone ${dragDest === 'ROOT' ? 'active' : ''}`}
                    onDragOver={(e) => {
                        e.preventDefault();
                        if (dragDest !== 'ROOT') setDragDest('ROOT');

                        // 🔥 VISUAL-COORDINATE-BASED Proximity Logic (Responsive Grid Safe)
                        const container = e.currentTarget;
                        const children = Array.from(container.querySelectorAll('.treeItem[data-id]'));

                        if (children.length === 0) {
                            setDropIndicator(null);
                            dropIndicatorRef.current = null;
                            return;
                        }

                        const mx = e.clientX;
                        const my = e.clientY;

                        // Step 1: Build visual map with coordinates
                        const visualItems = children.map(child => {
                            const rect = child.getBoundingClientRect();
                            return {
                                element: child,
                                id: child.getAttribute('data-id')!,
                                rect,
                                centerX: rect.left + rect.width / 2,
                                centerY: rect.top + rect.height / 2,
                                top: rect.top,
                                left: rect.left
                            };
                        });

                        // Step 2: Sort by VISUAL position (top-to-bottom, left-to-right)
                        // This ensures correct ordering in responsive grids
                        visualItems.sort((a, b) => {
                            const rowThreshold = 20; // Items within 20px vertically are considered same row
                            if (Math.abs(a.top - b.top) < rowThreshold) {
                                return a.left - b.left; // Same row: sort by X
                            }
                            return a.top - b.top; // Different rows: sort by Y
                        });

                        // Step 3: Find nearest item by distance
                        let minDist = Infinity;
                        let nearestItem = visualItems[0];

                        visualItems.forEach(item => {
                            const dist = Math.hypot(mx - item.centerX, my - item.centerY);
                            if (dist < minDist) {
                                minDist = dist;
                                nearestItem = item;
                            }
                        });

                        // 🔥 PROXIMITY THRESHOLD: If too far from any item, don't set a reorder indicator.
                        // This allows dropping in empty space to create new rows/cols.
                        if (minDist > 80) {
                            if (dropIndicator) setDropIndicator(null);
                            dropIndicatorRef.current = null;
                            return;
                        }

                        // Step 4: Determine position relative to nearest item
                        const rect = nearestItem.rect;
                        const x = (mx - rect.left) / rect.width;
                        const y = (my - rect.top) / rect.height;

                        let position: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

                        // Prioritize vertical placement for natural grid flow
                        if (y < 0.3) position = 'top';
                        else if (y > 0.7) position = 'bottom';
                        else if (x < 0.5) position = 'left';
                        else position = 'right';

                        // Step 5: Convert visual position to logical before/after based on VISUAL order
                        let logicalPosition: 'before' | 'after' = 'after';

                        if (position === 'top' || position === 'left') {
                            logicalPosition = 'before';
                        } else {
                            logicalPosition = 'after';
                        }

                        // Apply indicator
                        const proxIndicator = {
                            targetId: nearestItem.id,
                            position,
                            logicalPosition,
                            isProximity: true
                        } as any;

                        dropIndicatorRef.current = proxIndicator;

                        if (dropIndicator?.targetId !== nearestItem.id || dropIndicator?.position !== position) {
                            setDropIndicator(proxIndicator);
                        } else {
                            dropIndicatorRef.current = proxIndicator;
                        }
                    }}
                    onDrop={(e) => onDrop(e, null, false)}
                    id="root-main-zone"
                    style={{
                        flex: 3,
                        position: 'relative',
                        padding: '15px',
                        borderRadius: '12px',
                        background: dragDest === 'ROOT' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                        border: dragDest === 'ROOT' ? '2px dashed #3b82f6' : '1px solid #222',
                        overflow: 'auto',
                        minHeight: Math.max(600, (Math.max(0, ...[...tree, ...playlists.filter((p: Playlist) => p.category_id === null && p.is_unclassified === false && p.type !== 'general')].map(i => i.grid_row ?? 0)) + 2) * 165),
                        minWidth: Math.max(800, (Math.max(0, ...[...tree, ...playlists.filter((p: Playlist) => p.category_id === null && p.is_unclassified === false && p.type !== 'general')].map(i => i.grid_column ?? 0)) + 2) * 215)
                    }}
                >
                    {isLoading ? <div>Loading...</div> : (
                        <>
                            {/* Unified Root Items: Folders First, then Files */}
                            {tree.map(renderTreeItem)}
                            {playlists
                                .filter((p: Playlist) => p.category_id === null && p.is_unclassified === false && p.type !== 'general')
                                .map((p: Playlist) => {
                                    if (p.grid_row !== undefined) {
                                        console.log(`🎨 [CategoryManager] Rendering PlaylistItem (${p.title}) at Row: ${p.grid_row}, Col: ${p.grid_column}`);
                                    }
                                    return renderPlaylistItem(p);
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