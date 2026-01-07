import { useState, forwardRef, useCallback, useMemo } from 'react';
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
}

interface Playlist {
    id: string;
    title: string;
    category_id: string | null;
    is_unclassified: boolean;
    type?: string;
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
    onMovePlaylist?: (playlistId: string, targetCategoryId: string | null, isUnclassified: boolean) => void;
    onPlaylistClick?: (id: string, type: string) => void;
    dragSourceMode?: boolean;
}

export const CategoryManager = forwardRef<CategoryManagerHandle, Props>((props, _ref) => {
    const {
        // onCategoryChange, // Unused
        readOnly = false,
        selectedId,
        onSelect,
        resources: injectedResources = [], // 🔥 Single resources prop
        onMovePlaylist,
        onPlaylistClick,
        dragSourceMode = false
    } = props;

    // State for UI only (not data)
    const [dragDest, setDragDest] = useState<string | null>(null);
    const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

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
            orphansFixed: items.filter((i: any) => i.parent_id === null && injectedItems.find(x => x.id === i.id)?.category_id !== null).length
        });

        return items;
    }, [injectedCategories]);

    // 2. Normalize Playlists
    const playlists = useMemo(() => {
        const files = injectedPlaylists; // Playlists are files in this view if separated, but currently we use unified folder view?
        // Wait, injectedPlaylists usage depends on separate logic.
        // If we reverted separation, injectedPlaylists might be empty or contain non-general items.

        console.log('🔍 [CategoryManager] Normalizing playlists:', {
            injectedPlaylistsCount: injectedPlaylists.length
        });

        const result = injectedPlaylists.map((p: any) => ({
            ...p,
            category_id: p.category_id !== undefined ? p.category_id : (p.parent_id ?? null) // Apply same null fix here?
        }));

        console.log('✅ [CategoryManager] Normalized playlists:', {
            count: result.length,
            types: result.reduce((acc: any, curr: any) => {
                acc[curr.type] = (acc[curr.type] || 0) + 1;
                return acc;
            }, {})
        });

        return result;
    }, [injectedPlaylists]);

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

    const onDragStart = (e: React.DragEvent, item: any, type: 'CATEGORY' | 'PLAYLIST') => {
        if (readOnly && !dragSourceMode) return;
        e.stopPropagation();
        const payload = { type, id: item.id };
        e.dataTransfer.setData('application/json', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'move';
    };

    const onDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (dragDest !== id) setDragDest(id);
    };

    const onDrop = async (e: React.DragEvent, targetCategoryId: string | null, isUnclassified: boolean) => {
        e.preventDefault();
        e.stopPropagation();
        setDragDest(null);

        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            const draggedId = data.id;

            // 1. 자기 자신에게 드롭 방지
            if (draggedId === targetCategoryId) return;

            // 2. 서버 업데이트 요청 (부모의 Optimistic Update에 의존)
            // Local state update is removed to prevent conflict with Parent's prop update.
            onMovePlaylist?.(draggedId, targetCategoryId, isUnclassified);
        } catch (err) {
            console.error("Drop Error:", err);
        }
    };

    const renderPlaylistItem = (playlist: Playlist) => {
        const isSelected = selectedId === playlist.id;

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
                className={`treeItem playlistItem ${isSelected ? 'selected' : ''} ${dragDest === playlist.id ? 'dragOver-active' : ''}`}
                draggable
                onDragStart={(e) => onDragStart(e, playlist, 'PLAYLIST')}
                // 아이템 위에 아이템을 떨어뜨리면 해당 아이템과 같은 위치(폴더)로 이동하도록 지원
                onDragOver={(e) => onDragOver(e, playlist.id)}
                onDrop={(e) => onDrop(e, playlist.category_id, playlist.is_unclassified)}
                onClick={(e) => {
                    e.stopPropagation(); // 이벤트 전파 방지
                    onPlaylistClick?.(playlist.id, playlist.type || 'playlist');
                }}
            >
                <span className="folderIcon">{getIcon()}</span>
                <span className="categoryName">{playlist.title}</span>
            </div>
        );
    };

    const renderTreeItem = (category: Category) => {
        const isCollapsed = collapsedIds.has(category.id);

        // 🔥 FIX: Dynamic lookup for children (works for both classified and unclassified folders)
        const childFolders = normalizedCategories
            .filter((c: Category) => c.parent_id === category.id)
            .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));

        // 🔥 FIX: Include ALL playlists in this folder, regardless of unclassified flag
        const playlistsInFolder = playlists.filter((p: Playlist) => p.category_id === category.id);

        const isSelected = selectedId === category.id;
        const hasChildren = childFolders.length > 0 || playlistsInFolder.length > 0;

        return (
            <div key={category.id} className="treeBranch" onClick={(e) => e.stopPropagation()}>
                <div
                    className={`itemContent ${isSelected ? 'selected' : ''} ${dragDest === category.id ? 'dragOver-active' : ''}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, category, 'CATEGORY')}
                    onDragOver={(e) => onDragOver(e, category.id)}
                    onDrop={(e) => onDrop(e, category.id, false)}
                    onClick={(e) => {
                        e.stopPropagation(); // 매우 중요: 트리 전파 방지
                        onSelect?.(category.id);
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
                    onDragOver={(e) => onDragOver(e, 'ROOT')}
                    onDrop={(e) => onDrop(e, null, false)}
                    style={{
                        flex: 3, display: 'flex', gap: '15px', padding: '15px', borderRadius: '12px',
                        background: dragDest === 'ROOT' ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                        border: dragDest === 'ROOT' ? '2px dashed #3b82f6' : '1px solid #222',
                        flexWrap: 'wrap', alignContent: 'flex-start', alignItems: 'flex-start', overflowY: 'auto'
                    }}
                >
                    {isLoading ? <div>Loading...</div> : (
                        <>
                            {/* Unified Root Items: Folders First, then Files */}
                            {tree.map(renderTreeItem)}
                            {playlists
                                .filter((p: Playlist) => p.category_id === null && p.is_unclassified === false && p.type !== 'general')
                                .map(renderPlaylistItem)}
                        </>
                    )}
                </div>

                {/* [2. 미분류 보관함] */}
                <div
                    className={`unclassified-sidebar ${dragDest === 'UNCLASSIFIED' ? 'active' : ''}`}
                    onDragOver={(e) => onDragOver(e, 'UNCLASSIFIED')}
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
                            .filter((c: Category) => c.is_unclassified)
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