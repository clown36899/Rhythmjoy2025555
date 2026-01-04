import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';

import { CategoryManager } from './components/CategoryManager';
import { PlaylistImportModal } from './components/PlaylistImportModal';
import { DocumentCreateModal } from './components/DocumentCreateModal'; // 추가
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

type LearningItem = Playlist | LearningDocument;

const LearningPage = () => {
    const navigate = useNavigate();
    const [items, setItems] = useState<LearningItem[]>([]); // 통합 아이템 리스트
    const [categories, setCategories] = useState<Category[]>([]);
    const [flatCategories, setFlatCategories] = useState<Category[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Admin State
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminMode, setAdminMode] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showDocumentModal, setShowDocumentModal] = useState(false); // 문서 모달 상태 추가
    const [moveModal, setMoveModal] = useState<{ isOpen: boolean; playlistId: string; categoryId: string | null }>({
        isOpen: false,
        playlistId: '',
        categoryId: null
    });
    const [isSyncing, setIsSyncing] = useState(false);

    // Modal State
    const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);


    useEffect(() => {
        checkAdmin();
        fetchData();
    }, [adminMode]); // Re-fetch when admin mode toggles (to show/hide private)

    const checkAdmin = async () => {
        // Simplified admin check - checking for specific user ID or role
        // For now, we will assume true for testing if session exists, 
        // or strictly check specific email/ID as requested "관리자빼고는 수정못하게"
        const { data: { session } } = await supabase.auth.getSession();
        console.log('🔍 Admin Check - Session:', session ? 'EXISTS' : 'NULL');
        if (session) {
            // TODO: Replace with real admin permission check (e.g. from profiles or custom claims)
            // For now, allow any logged in user to see the button (but acting as admin should probably be restricted)
            // Or better, check specific email if known or just set true for dev
            setIsAdmin(true);
            console.log('✅ Admin status set to TRUE');
        } else {
            console.log('❌ No session - Admin status remains FALSE');
        }
    };

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

            // 3. Fetch Categories
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('learning_categories')
                .select('*')
                .order('order_index', { ascending: true })
                .order('created_at', { ascending: true });

            if (categoriesError) throw categoriesError;

            // Combine items
            const combinedItems: LearningItem[] = [
                ...(playlistsData || []).map((item: any) => ({
                    ...item,
                    type: 'playlist' as const,
                    video_count: item.videos[0]?.count || 0
                })),
                ...(documentsData || []).map((item: any) => ({
                    ...item,
                    type: 'document' as const
                }))
            ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

            setItems(combinedItems);
            setFlatCategories(categoriesData || []);
            setCategories(buildTree(categoriesData || []));

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
        const typeLabel = item.type === 'playlist' ? '재생목록' : '문서';
        if (!confirm(`정말로 이 ${typeLabel}을(를) 삭제하시겠습니까?`)) return;

        try {
            const table = item.type === 'playlist' ? 'learning_playlists' : 'learning_documents';
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
        const typeLabel = item.type === 'playlist' ? '재생목록' : '문서';
        if (!confirm(`${typeLabel}을(를) ${item.is_public ? '비공개' : '공개'}로 전환하시겠습니까?`)) return;

        try {
            const table = item.type === 'playlist' ? 'learning_playlists' : 'learning_documents';
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
        try {
            const item = items.find(i => i.id === itemId);
            if (!item) return;

            const table = item.type === 'playlist' ? 'learning_playlists' : 'learning_documents';

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
    const handlePlaylistClick = (playlistId: string) => {
        const isDesktop = window.innerWidth > 768; // Simple check, match CSS media query
        if (isDesktop) {
            setViewingPlaylistId(playlistId);
        } else {
            navigate(`/learning/${playlistId}`);
        }
    }; // Added semicolon

    // Drag Source Visuals
    const [draggedPlaylistSourceId, setDraggedPlaylistSourceId] = useState<string | null>(null);

    return (
        <div className="container">
            {/* Header */}
            <div className="explorerHeader">
                <div className="headerLeft">
                    <h1 className="explorerTitle">Learning Gallery</h1>
                </div>

                <div className="headerRight">
                    {isAdmin && (
                        <>
                            <button
                                className={`adminToggleBtn ${adminMode ? 'active' : ''}`}
                                onClick={() => setAdminMode(!adminMode)}
                            >
                                {adminMode ? '관리자 모드 종료' : '⚙️ 관리자 모드'}
                            </button>
                            {adminMode && (
                                <>
                                    <button
                                        onClick={handleSyncAll}
                                        className="syncAllButton"
                                        disabled={isSyncing}
                                    >
                                        <span>🔄</span> 전체 동기화
                                    </button>
                                    <button
                                        onClick={() => setShowImportModal(true)}
                                        className="importButton"
                                    >
                                        <span>📺</span> 영상 가져오기
                                    </button>
                                    <button
                                        onClick={() => setShowDocumentModal(true)}
                                        className="importButton"
                                        style={{ backgroundColor: '#059669' }}
                                    >
                                        <span>📄</span> 문서 등록
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Playlist Modal */}
            {viewingPlaylistId && (
                <PlaylistModal
                    playlistId={viewingPlaylistId}
                    onClose={() => setViewingPlaylistId(null)}
                />
            )}

            {/* Content Wrapper */}
            <div className="contentWrapper">
                {/* Split Layout */}

                {/* LEFT: Tree Navigation */}
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

                {/* RIGHT: Content Grid */}
                <div className="rightContent">
                    {/* Path title */}
                    <div className="currentPath">
                        {selectedCategoryId ? (
                            <span className="pathText">
                                {flatCategories.find(c => c.id === selectedCategoryId)?.name}
                            </span>
                        ) : (
                            <span className="pathText">📂 폴더를 선택하세요</span>
                        )}
                        {/* Show count of items in this folder */}
                        {selectedCategoryId && (
                            <span className="countBadge" style={{ marginLeft: '8px', fontSize: '0.8em', color: '#888' }}>
                                ({filteredItems.length})
                            </span>
                        )}
                    </div>

                    {/* Items Grid */}
                    {isLoading ? (
                        <div className="loadingContainer">
                            <div className="spinner"></div>
                            <p className="loadingText">로딩 중...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="emptyState">
                            <div className="emptyIcon">📂</div>
                            <h3 className="emptyTitle">데이터 없음</h3>
                            <p className="emptyText">
                                {selectedCategoryId ? '이 폴더에는 데이터가 없습니다.' : '왼쪽 목록에서 폴더를 선택해주세요.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid">
                            {filteredItems.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => {
                                        if (item.type === 'playlist') {
                                            handlePlaylistClick(item.id);
                                        } else {
                                            // TODO: Document View Modal or Page
                                            alert(`문서 보기: ${item.title}\n(기능 준비 중)`);
                                        }
                                    }}
                                    className={`card ${item.type}`}
                                    draggable={adminMode}
                                    onDragStart={(e) => {
                                        if (!adminMode) return;
                                        setDraggedPlaylistSourceId(item.category_id || null);
                                        e.dataTransfer.setData('application/json', JSON.stringify({
                                            type: 'PLAYLIST_MOVE', // Keep same type for compatibility or rename to ITEM_MOVE
                                            playlistId: item.id
                                        }));
                                        e.dataTransfer.effectAllowed = 'move';
                                    }}
                                    onDragEnd={() => {
                                        setDraggedPlaylistSourceId(null);
                                    }}
                                >
                                    <div className="thumbnailContainer">
                                        {item.type === 'playlist' ? (
                                            item.thumbnail_url ? (
                                                <img
                                                    src={item.thumbnail_url}
                                                    alt={item.title}
                                                    className="thumbnail"
                                                />
                                            ) : (
                                                <div className="noImage">No Image</div>
                                            )
                                        ) : (
                                            <div className="docImage">
                                                <span className="docIcon">📄</span>
                                                <span className="docTypeLabel">DOCUMENT</span>
                                            </div>
                                        )}

                                        {item.type === 'playlist' && (
                                            <div className="videoCountBadge">
                                                <span className="videoCountIcon">▶</span>
                                                <span className="videoCountText">{item.video_count}</span>
                                            </div>
                                        )}

                                        {adminMode && item.type === 'playlist' && item.youtube_playlist_id && (
                                            <div className="adminBadge ytLinked">YT Linked</div>
                                        )}
                                        {adminMode && !item.is_public && (
                                            <div className="adminBadge private">Private</div>
                                        )}
                                        {item.year && (
                                            <div className="itemYearBadge">#{item.year}년</div>
                                        )}
                                    </div>

                                    <div className="cardBody">
                                        <div className="cardHeader">
                                            <h3 className="cardTitle">{item.title}</h3>
                                        </div>
                                        {(item.type === 'playlist' && item.description) && (
                                            <p className="cardDescription">{item.description}</p>
                                        )}
                                        {(item.type === 'document' && item.content) && (
                                            <p className="cardDescription">{item.content.substring(0, 50)}...</p>
                                        )}
                                        <div className="cardFooter">
                                            <span className="categoryBadge">
                                                {flatCategories.find(c => c.id === item.category_id)?.name || '기타'}
                                            </span>
                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                        </div>

                                        {/* Admin Actions Overlay within Card */}
                                        <div className="adminActions">
                                            <button
                                                onClick={(e) => togglePublic(item, e)}
                                                className={`miniBtn ${item.is_public ? 'public' : 'private'}`}
                                                title={item.is_public ? '공개됨 (클릭하여 비공개)' : '비공개 (클릭하여 공개)'}
                                            >
                                                {item.is_public ? '👀' : '🔒'}
                                            </button>
                                            <button
                                                className="miniBtn move"
                                                title="이동"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setMoveModal({
                                                        isOpen: true,
                                                        playlistId: item.id,
                                                        categoryId: item.category_id || null
                                                    });
                                                }}
                                            >
                                                📂
                                            </button>
                                            {item.type === 'playlist' && (
                                                <button
                                                    className="miniBtn sync"
                                                    title="동기화"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSync(item as Playlist);
                                                    }}
                                                    disabled={!item.youtube_playlist_id}
                                                >
                                                    🔄
                                                </button>
                                            )}
                                            <button
                                                className="miniBtn delete"
                                                title="삭제"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDelete(item);
                                                }}
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
                    onClose={() => setMoveModal({ ...moveModal, isOpen: false })}
                    onSuccess={fetchData}
                />
            )}
        </div>
    );
};

export default LearningPage;
