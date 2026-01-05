import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

import { CategoryManager } from './components/CategoryManager';
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
    const [isLoading, setIsLoading] = useState(true);

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
            setIsLoading(true);

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
        } finally {
            setIsLoading(false);
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

        // Helper to get all descendant category IDs including self
        const getDescendantIds = (categoryId: string): string[] => {
            const result = [categoryId];
            const children = flatCategories.filter(c => c.parent_id === categoryId);
            children.forEach(child => {
                result.push(...getDescendantIds(child.id));
            });
            return result;
        };

        const targetIds = getDescendantIds(selectedCategoryId);
        return items.filter(p => p.category_id && targetIds.includes(p.category_id));
    }, [items, selectedCategoryId, flatCategories]);


    // Admin Actions
    const handleDelete = async (item: LearningItem) => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        const typeLabel = item.type === 'playlist' ? '재생목록' :
            item.type === 'standalone_video' ? '영상' : '문서';
        if (!confirm(`정말로 이 ${typeLabel}을(를) 삭제하시겠습니까?`)) return;

        try {
            const table = item.type === 'playlist' ? 'learning_playlists' :
                item.type === 'standalone_video' ? 'learning_videos' : 'learning_documents';
            const { error } = await supabase
                .from(table)
                .delete()
                .eq('id', item.id);

            if (error) throw error;
            fetchData();
        } catch (err) {
            console.error(err);
            alert('삭제 실패');
        }
    };

    const handleSync = async (playlist: Playlist) => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }

        if (!playlist.youtube_playlist_id) {
            alert('유튜브 연동 정보가 없는 재생목록입니다.');
            return;
        }

        if (!confirm('유튜브에서 최신 정보를 가져와 갱신하시겠습니까? \n기존 비디오 목록은 초기화됩니다.')) return;

        try {
            setIsSyncing(true);
            const videos = await fetchPlaylistVideos(playlist.youtube_playlist_id);

            if (videos.length === 0) {
                throw new Error('재생목록에 영상이 없습니다.');
            }

            // Transaction-like operations
            const { error: deleteError } = await supabase
                .from('learning_videos')
                .delete()
                .eq('playlist_id', playlist.id);

            if (deleteError) throw deleteError;

            const videoData = videos.map((video, index) => ({
                playlist_id: playlist.id,
                youtube_video_id: video.resourceId.videoId,
                title: video.title,
                order_index: index,
                memo: video.description?.slice(0, 100),
            }));

            const { error: insertError } = await supabase
                .from('learning_videos')
                .insert(videoData);

            if (insertError) throw insertError;

            await supabase
                .from('learning_playlists')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', playlist.id);

            alert('동기화 완료!');
            fetchData();

        } catch (err: any) {
            console.error(err);
            alert(`동기화 실패: ${err.message}`);
        } finally {
            setIsSyncing(false);
        }
    };

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

    const togglePublic = async (item: LearningItem, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        const typeLabel = item.type === 'playlist' ? '재생목록' :
            item.type === 'standalone_video' ? '영상' : '문서';
        if (!confirm(`${typeLabel}을(를) ${item.is_public ? '비공개' : '공개'}로 전환하시겠습니까?`)) return;

        try {
            const table = item.type === 'playlist' ? 'learning_playlists' :
                item.type === 'standalone_video' ? 'learning_videos' : 'learning_documents';
            const { error } = await supabase
                .from(table)
                .update({ is_public: !item.is_public })
                .eq('id', item.id);

            if (error) throw error;
            fetchData();
        } catch (err) {
            console.error(err);
            alert('상태 변경 실패');
        }
    };

    const handleMoveItem = async (itemId: string, targetCategoryId: string) => {
        if (!isAdmin) {
            alert('관리자 권한이 없습니다.');
            return;
        }
        try {
            const item = items.find(i => i.id === itemId);
            if (!item) return;

            const table = item.type === 'playlist' ? 'learning_playlists' :
                item.type === 'standalone_video' ? 'learning_videos' : 'learning_documents';

            const { error } = await supabase
                .from(table)
                .update({ category_id: targetCategoryId })
                .eq('id', itemId);

            if (error) throw error;

            // Optimistic update or fetch
            fetchData();
        } catch (err) {
            console.error('Failed to move item:', err);
            alert('이동 실패');
        }
    };

    // Handling Playlist Click (Modal on Desktop, Navigate on Mobile)
    const handlePlaylistClick = (itemId: string, itemType: string = 'playlist') => {
        if (itemType === 'document') {
            setViewingDocId(itemId);
            return;
        }

        // Handle Folder-as-Playlist
        if (itemType === 'playlist_folder') {
            const folderId = itemId.includes('category:') ? itemId.replace('category:', '') : itemId;
            // Use prefix to help DetailPage distinguish
            const targetId = `category:${folderId}`;

            const isDesktop = window.innerWidth > 768;
            if (isDesktop) {
                setViewingPlaylistId(targetId);
            } else {
                navigate(`/learning/${targetId}`);
            }
            return;
        }

        if (itemType === 'standalone_video') {
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
            setViewingPlaylistId(itemId);
        } else {
            navigate(`/learning/${itemId}`);
        }
    }; // Added semicolon

    // Drag Source Visuals
    const [draggedPlaylistSourceId, setDraggedPlaylistSourceId] = useState<string | null>(null);

    return (
        <div className="container">
            {/* Admin Floating Toolbar */}
            {isAdmin && (
                <div className="archive-floating-admin-toolbar">
                    <button
                        className={`admin-tool-btn toggle-btn ${adminMode ? 'active' : ''}`}
                        onClick={() => setAdminMode(!adminMode)}
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
                        onCategoryChange={fetchData}
                        readOnly={!adminMode}
                        selectedId={selectedCategoryId}
                        onSelect={setSelectedCategoryId}
                        categories={categories}
                        playlists={items as any}
                        onMovePlaylist={handleMoveItem}
                        onPlaylistClick={handlePlaylistClick}
                        highlightedSourceId={draggedPlaylistSourceId}
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
