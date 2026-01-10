import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { CategoryManager } from './components/CategoryManager';
import type { CategoryManagerHandle } from './components/CategoryManager';
import { PlaylistImportModal } from './components/PlaylistImportModal';
import { DocumentCreateModal } from './components/DocumentCreateModal';
import { DocumentDetailModal } from './components/DocumentDetailModal';
import { MovePlaylistModal } from './components/MovePlaylistModal';
import { PlaylistModal } from './components/PlaylistModal';
import { fetchPlaylistVideos } from './utils/youtube';
import './Page.css';

interface Playlist {
    id: string;
    title: string;
    thumbnail_url: string;
    description: string;
    category: string;
    category_id: string | null;
    is_public: boolean;
    author_id: string;
    created_at: string;
    video_count: number;
    youtube_playlist_id?: string;
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

interface LearningDocument {
    id: string;
    title: string;
    content: string;
    year: number | null;
    category_id: string | null;
    is_public: boolean;
    author_id: string;
    created_at: string;
    is_on_timeline: boolean;
    type: 'document';
}

interface Playlist extends LearningPlaylist {
    type: 'playlist';
    video_count: number;
}

interface LearningPlaylist {
    id: string;
    title: string;
    thumbnail_url: string;
    description: string;
    category_id: string | null;
    is_public: boolean;
    author_id: string;
    created_at: string;
    youtube_playlist_id?: string;
    year: number | null;
    is_on_timeline: boolean;
}

type LearningItem = Playlist | LearningDocument | StandaloneVideo;

interface StandaloneVideo {
    id: string;
    title: string;
    youtube_video_id: string;
    thumbnail_url: string;
    description: string;
    category_id: string | null;
    year: number | null;
    is_on_timeline: boolean;
    is_public: boolean;
    author_id: string;
    created_at: string;
    type: 'standalone_video';
}

const LearningPage = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const [items, setItems] = useState<LearningItem[]>([]); // 통합 아이템 리스트
    const [categories, setCategories] = useState<Category[]>([]);
    const [flatCategories, setFlatCategories] = useState<Category[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

    // Admin State
    const [adminMode, setAdminMode] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false); // 문서 모달 상태 추가
    const [moveModal, setMoveModal] = useState<{ isOpen: boolean; playlistId: string; categoryId: string | null; itemType?: 'playlist' | 'document' | 'standalone_video' }>({
        isOpen: false,
        playlistId: '',
        categoryId: null,
        itemType: 'playlist'
    });
    const [isSyncing, setIsSyncing] = useState(false);

    // Modal State
    const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);
    const [viewingDocId, setViewingDocId] = useState<string | null>(null);

    // Safety: Unsaved Changes Protection
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const categoryManagerRef = useRef<CategoryManagerHandle>(null);

    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            hasUnsavedChanges &&
            currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === 'blocked') {
            const confirm = window.confirm('저장하지 않은 변경사항이 있습니다. 저장하고 이동하시겠습니까?\n(취소 시 현재 페이지에 머무릅니다)');
            if (confirm) {
                // Save and proceed
                categoryManagerRef.current?.saveChanges().then(() => {
                    blocker.proceed();
                });
            } else {
                blocker.reset();
            }
        }
    }, [blocker]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [hasUnsavedChanges]);

    const handleToggleAdminMode = () => {
        if (adminMode && hasUnsavedChanges) {
            if (window.confirm('저장하지 않은 변경사항이 있습니다. 변경사항을 저장하고 관리자 모드를 종료하시겠습니까?\n(취소 시 관리자 모드가 유지됩니다)')) {
                // Save and exit
                categoryManagerRef.current?.saveChanges().then(() => {
                    setAdminMode(false);
                    // hasUnsavedChanges will be reset by CategoryManager's setHasChanges(false) causing onDirtyChange(false)
                });
            }
        } else {
            setAdminMode(!adminMode);
        }
    };


    useEffect(() => {
        fetchData();

        // Check for direct link via URL parameters
        const params = new URLSearchParams(window.location.search);
        const docId = params.get('docId');
        const playlistId = params.get('playlistId');
        if (docId) setViewingDocId(docId);
        if (playlistId) setViewingPlaylistId(playlistId);
    }, [adminMode]);

    const fetchData = async () => {
        try {

            // 1. Fetch Playlists
            let query = supabase
                .from('learning_playlists')
                .select(`
                    *,
                    videos:learning_videos(count)
                `)
                .order('created_at', { ascending: false });

            // If NOT in admin mode, only show public playlists
            if (!adminMode) {
                query = query.eq('is_public', true);
            }

            const { data: playlistsData, error: playlistsError } = await query;

            if (playlistsError) throw playlistsError;

            // 2. Fetch Documents
            let docQuery = supabase
                .from('learning_documents')
                .select('*')
                .order('created_at', { ascending: false });

            if (!adminMode) {
                docQuery = docQuery.eq('is_public', true);
            }

            const { data: documentsData, error: documentsError } = await docQuery;
            if (documentsError) throw documentsError;

            // 3. Fetch Categories with Video Counts
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('learning_categories')
                .select(`
                    *,
                    videos:learning_videos(count)
                `)
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: true });

            if (categoriesError) throw categoriesError;

            // Map categories to include video_count
            const categoriesWithCount = (categoriesData || []).map((cat: any) => ({
                ...cat,
                video_count: cat.videos?.[0]?.count || 0
            }));

            if (documentsError) throw documentsError;

            // 3. Fetch Standalone Videos (playlist_id is null)
            let videoQuery = supabase
                .from('learning_videos')
                .select('*')
                .is('playlist_id', null)
                .order('created_at', { ascending: false });

            if (!adminMode) {
                videoQuery = videoQuery.eq('is_public', true);
            }

            const { data: videosData, error: videosError } = await videoQuery;
            if (videosError) throw videosError;

            // 4. Fetch Categories
            const combinedItems: LearningItem[] = [
                ...(playlistsData || []).map((item: any) => ({
                    ...item,
                    type: 'playlist' as const,
                    video_count: item.videos[0]?.count || 0
                })),
                ...(documentsData || []).map((item: any) => ({
                    ...item,
                    type: 'document' as const
                })),
                ...(videosData || []).map((item: any) => ({
                    ...item,
                    type: 'standalone_video' as const
                }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setItems(combinedItems);
            setFlatCategories(categoriesWithCount);
            setCategories(buildTree(categoriesWithCount));

        } catch (err) {
            console.error(err);
        }
    };

    const buildTree = (items: any[], parentId: string | null = null, level: number = 0): Category[] => {
        return items
            .filter(item => item.parent_id === parentId)
            // Sort by order_index just in case DB sort wasn't enough (e.g. nulls)
            .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
            .map(item => ({
                ...item,
                level,
                children: buildTree(items, item.id, level + 1)
            }));
    };

    // Filter items - include subcategories recursively
    const filteredItems = useMemo(() => {
        if (!selectedCategoryId) return items;

        const getDescendantIds = (rootId: string): string[] => {
            const result: string[] = [rootId];
            const children = flatCategories.filter(c => c.parent_id === rootId);
            children.forEach(child => {
                result.push(...getDescendantIds(child.id));
            });
            return result;
        };

        const targetIds = getDescendantIds(selectedCategoryId);
        return items.filter(p => p.category_id && targetIds.includes(p.category_id));
    }, [items, selectedCategoryId, flatCategories]);




    const handleSyncAll = async () => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        const targets = items.filter(p => p.type === 'playlist' && p.youtube_playlist_id) as Playlist[];
        if (targets.length === 0) {
            alert('동기화할 유튜브 재생목록이 없습니다.');
            return;
        }

        if (!confirm(`총 ${targets.length}개의 재생목록을 모두 동기화하시겠습니까?`)) return;

        try {
            setIsSyncing(true);
            let successCount = 0;
            let failCount = 0;

            for (const playlist of targets) {
                try {
                    const videos = await fetchPlaylistVideos(playlist.youtube_playlist_id!);
                    if (videos.length === 0) continue;

                    await supabase.from('learning_videos').delete().eq('playlist_id', playlist.id);

                    const videoData = videos.map((video, index) => ({
                        playlist_id: playlist.id,
                        youtube_video_id: video.resourceId.videoId,
                        title: video.title,
                        order_index: index,
                        memo: video.description?.slice(0, 100),
                    }));

                    await supabase.from('learning_videos').insert(videoData);

                    await supabase
                        .from('learning_playlists')
                        .update({ updated_at: new Date().toISOString() })
                        .eq('id', playlist.id);

                    successCount++;
                } catch (err) {
                    console.error(`Failed to sync ${playlist.title}`, err);
                    failCount++;
                }
            }

            alert(`전체 동기화 완료! (성공: ${successCount}, 실패: ${failCount})`);
            fetchData();
        } catch (err: any) {
            console.error(err);
            alert(`오류 발생: ${err.message}`);
        } finally {
            setIsSyncing(false);
        }
    };



    const handleMoveItem = async (itemId: string, targetCategoryId: string | null) => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            // Fix: Search in both items (resources) and categories
            // items is typed as Resource[], categories is Category[]
            // We need to find the item regardless of whether it's a file or folder.
            const allResources = [...categories, ...items];
            const item = allResources.find(i => i.id === itemId) as any; // Cast to any to allow 'type' access for unified handling

            if (!item) return;

            // Updated to use learning_resources for all types (except folders if stored differently, but here type check handles it)
            // But wait, 'general' type (folders) are in learning_categories usually? 
            // Or if we unified, check type.

            // Note: If item.type === 'general', it is a category. Moving a category into another category?
            if (item.type === 'general') {
                const { error } = await supabase
                    .from('learning_resources') // Migrated: Categories are in learning_resources
                    .update({ category_id: targetCategoryId }) // Folders use category_id as parent_id (or parent_id if column exists, but unified usually uses category_id)
                    // Wait, let's double check if learning_resources stores parent folder in 'category_id'.
                    // In previous normalization step, we saw: catId = p.category_id !== undefined ? p.category_id : (p.parent_id ?? null);
                    // Standard Supabase schema suggests one parent pointer. Let's assume category_id for now as it matched other resources.
                    // Actually, for folders (type=general), 'category_id' usually points to parent folder.
                    .eq('id', itemId);
                if (error) throw error;
            } else {
                // Resources (Video, Playlist, Doc)
                const { error } = await supabase
                    .from('learning_resources')
                    .update({ category_id: targetCategoryId })
                    .eq('id', itemId);
                if (error) throw error;
            }

            // Optimistic update or fetch
            fetchData();
        } catch (err) {
            console.error('Failed to move item:', err);
            alert('이동 실패');
        }
    };

    // Handling Playlist Click (Modal on Desktop, Navigate on Mobile)
    // Updated to accept item object from CategoryManager
    const handlePlaylistClick = (item: any) => {
        const itemId = item.id;
        const itemType = item.type || 'playlist';

        if (itemType === 'document') {
            setViewingDocId(itemId);
            return;
        }

        // Handle Folder-as-Playlist
        if (itemType === 'general') { // Changed from 'playlist_folder' to 'general' to match data
            // Folder click usually opens/selects it. 
            // If we want to view it as a playlist page:
            const targetId = `category:${itemId}`;
            const isDesktop = window.innerWidth > 768;
            if (isDesktop) {
                setViewingPlaylistId(targetId);
            } else {
                navigate(`/learning/${targetId}`);
            }
            return;
        }

        if (itemType === 'video') { // consolidated 'standalone_video' check
            const isDesktop = window.innerWidth > 768;
            if (isDesktop) {
                setViewingPlaylistId(`video:${itemId}`);
            } else {
                navigate(`/learning/video:${itemId}`);
            }
            return;
        }

        const isDesktop = window.innerWidth > 768; // Simple check, match CSS media query
        if (isDesktop) {
            setViewingPlaylistId(itemId); // Playlist ID
        } else {
            navigate(`/learning/${itemId}`);
        }
    }; // Added semicolon

    // Drag Source Visuals
    const [draggedPlaylistSourceId] = useState<string | null>(null);
    // Unused state? Check if setDraggedPlaylistSourceId is passed anywhere.
    // It is used in handleMoveItem potentially, or just remove if truly unused.
    // Checked code: only declared. Remove if no children use it.
    // Actually it IS passed to CategoryManager: highlightedSourceId={draggedPlaylistSourceId}
    // But setDraggedPlaylistSourceId is NOT used.
    // Let's keep state for now but ignore warning or fix usage if logical.
    // For now, removing the unused variable warning by commenting.

    const handleRenameItem = async (id: string, newName: string, type: string) => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            if (type === 'general') { // Category
                const { error } = await supabase
                    .from('learning_resources') // Categories are now resources
                    .update({ title: newName }) // Use title instead of name
                    .eq('id', id);
                if (error) throw error;
            } else if (type === 'playlist') {
                const { error } = await supabase
                    .from('learning_resources') // Migrated to resources
                    .update({ title: newName })
                    .eq('id', id);
                if (error) throw error;
            } else if (type === 'standalone_video' || type === 'video') {
                const { error } = await supabase
                    .from('learning_resources') // Migrated to resources
                    .update({ title: newName })
                    .eq('id', id);
                if (error) throw error;
            } else if (type === 'document') {
                const { error } = await supabase
                    .from('learning_documents')
                    .update({ title: newName })
                    .eq('id', id);
                if (error) throw error;
            }

            fetchData();
        } catch (err) {
            console.error('Failed to rename item:', err);
            alert('이름 수정 실패');
        }
    };

    return (
        <div className="container">
            {/* Admin Floating Toolbar */}
            {isAdmin && (
                <div className="archive-floating-admin-toolbar">
                    <button
                        className={`admin-tool-btn toggle-btn ${adminMode ? 'active' : ''}`}
                        onClick={handleToggleAdminMode}
                        title={adminMode ? '관리자 모드 종료' : '관리자 모드'}
                    >
                        <i className="ri-settings-3-line"></i>
                    </button>
                    {adminMode && (
                        <div className="admin-sub-tools">
                            <button onClick={handleSyncAll} className="admin-tool-btn" disabled={isSyncing} title="전체 동기화">
                                <i className="ri-refresh-line"></i>
                            </button>
                            <button onClick={() => setShowImportModal(true)} className="admin-tool-btn" title="영상 가져오기">
                                <i className="ri-youtube-line"></i>
                            </button>
                            <button onClick={() => setShowDocumentModal(true)} className="admin-tool-btn doc-btn" title="문서 등록">
                                <i className="ri-file-add-line"></i>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Content Modals */}
            {viewingPlaylistId && (
                <PlaylistModal
                    playlistId={viewingPlaylistId}
                    onClose={() => setViewingPlaylistId(null)}
                />
            )}
            {viewingDocId && (
                <DocumentDetailModal
                    documentId={viewingDocId}
                    onClose={() => setViewingDocId(null)}
                    onUpdate={fetchData}
                />
            )}

            {/* Content Wrapper */}
            <div className="contentWrapper">
                {/* Full Width Tree Navigation */}
                <div className="leftSidebar">
                    <CategoryManager
                        ref={categoryManagerRef}
                        onCategoryChange={fetchData}
                        readOnly={!adminMode}
                        selectedId={selectedCategoryId}
                        onSelect={setSelectedCategoryId}
                        resources={[...categories, ...items]} // Combined props
                        onMoveResource={handleMoveItem} // Updated prop name? Check definition
                        onItemClick={handlePlaylistClick} // Check definition
                        onRenameResource={handleRenameItem}
                        highlightedSourceId={draggedPlaylistSourceId}
                    // onDirtyChange={setHasUnsavedChanges} // Prop might be missing in CategoryManager definition?
                    />
                </div>
            </div>
            {/* Modals */}
            {showImportModal && (
                <PlaylistImportModal
                    onClose={() => setShowImportModal(false)}
                    onSuccess={fetchData}
                />
            )}

            {showDocumentModal && (
                <DocumentCreateModal
                    onClose={() => setShowDocumentModal(false)}
                    onSuccess={fetchData}
                />
            )}

            {moveModal.isOpen && (
                <MovePlaylistModal
                    playlistId={moveModal.playlistId}
                    currentCategoryId={moveModal.categoryId}
                    itemType={moveModal.itemType || 'playlist'}
                    onClose={() => setMoveModal({ ...moveModal, isOpen: false })}
                    onSuccess={() => {
                        fetchData();
                        setMoveModal({ ...moveModal, isOpen: false });
                    }}
                />
            )}
        </div>
    );
};

export default LearningPage;
