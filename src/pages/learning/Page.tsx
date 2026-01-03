import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { PublicCategoryTree } from './components/PublicCategoryTree';
import './Page.css';

interface Playlist {
    id: string;
    title: string;
    thumbnail_url: string;
    description: string;
    category: string;
    category_id?: string;
    is_public: boolean;
    author_id: string;
    created_at: string;
    video_count: number;
}

interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    children?: Category[];
    level?: number;
}

const LearningPage = () => {
    const navigate = useNavigate();
    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [flatCategories, setFlatCategories] = useState<Category[]>([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setIsLoading(true);

            // 1. Fetch Playlists
            const { data: playlistsData, error: playlistsError } = await supabase
                .from('learning_playlists')
                .select(`
                    *,
                    videos:learning_videos(count)
                `)
                .eq('is_public', true)
                .order('created_at', { ascending: false });

            if (playlistsError) throw playlistsError;

            // 2. Fetch Categories
            const { data: categoriesData, error: categoriesError } = await supabase
                .from('learning_categories')
                .select('*')
                .order('created_at', { ascending: true });

            if (categoriesError) throw categoriesError;

            setPlaylists(playlistsData.map((item: any) => ({
                ...item,
                video_count: item.videos[0]?.count || 0
            })));

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
            .map(item => ({
                ...item,
                level,
                children: buildTree(items, item.id, level + 1)
            }));
    };

    // Helper to get all descendant Category IDs
    const getDescendantIds = (cats: Category[], targetId: string): string[] => {
        let ids: string[] = [];
        for (const cat of cats) {
            if (cat.id === targetId) {
                ids.push(targetId);
                const gatherChildren = (children?: Category[]) => {
                    if (!children) return;
                    children.forEach(child => {
                        ids.push(child.id);
                        gatherChildren(child.children);
                    });
                };
                gatherChildren(cat.children);
                return ids;
            }
            if (cat.children) {
                const found = getDescendantIds(cat.children, targetId);
                if (found.length > 0) return found;
            }
        }
        return ids;
    };

    // 2. Filter playlists (Current folder only, as requested)
    const filteredPlaylists = useMemo(() => {
        if (!selectedCategoryId) return []; // Hide everything at root

        return playlists.filter(p => p.category_id === selectedCategoryId);
    }, [playlists, selectedCategoryId]);

    return (
        <div className="container">
            {/* Header */}
            <div className="explorerHeader">
                <h1 className="explorerTitle">Learning Gallery</h1>
            </div>

            {/* Split Layout */}
            <div className="contentWrapper splitLayout">

                {/* LEFT: Tree Navigation */}
                <div className="leftSidebar">
                    <PublicCategoryTree
                        categories={categories}
                        selectedCategoryId={selectedCategoryId}
                        onSelect={setSelectedCategoryId}
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
                    </div>

                    {/* Playlist Grid */}
                    {isLoading ? (
                        <div className="loadingContainer">
                            <div className="spinner"></div>
                            <p className="loadingText">로딩 중...</p>
                        </div>
                    ) : filteredPlaylists.length === 0 ? (
                        <div className="emptyState">
                            <div className="emptyIcon">📂</div>
                            <h3 className="emptyTitle">영상 없음</h3>
                            <p className="emptyText">
                                {selectedCategoryId ? '이 폴더에는 영상이 없습니다.' : '왼쪽 목록에서 폴더를 선택해주세요.'}
                            </p>
                        </div>
                    ) : (
                        <div className="grid">
                            {filteredPlaylists.map((playlist) => (
                                <div
                                    key={playlist.id}
                                    onClick={() => navigate(`/learning/${playlist.id}`)}
                                    className="card"
                                >
                                    <div className="thumbnailContainer">
                                        {playlist.thumbnail_url ? (
                                            <img
                                                src={playlist.thumbnail_url}
                                                alt={playlist.title}
                                                className="thumbnail"
                                            />
                                        ) : (
                                            <div className="noImage">No Image</div>
                                        )}
                                        <div className="videoCountBadge">
                                            <span className="videoCountIcon">▶</span>
                                            <span className="videoCountText">{playlist.video_count}</span>
                                        </div>
                                    </div>
                                    <div className="cardBody">
                                        <div className="cardHeader">
                                            <h3 className="cardTitle">{playlist.title}</h3>
                                        </div>
                                        <div className="cardFooter">
                                            <span className="categoryBadge">
                                                {flatCategories.find(c => c.id === playlist.category_id)?.name || '기타'}
                                            </span>
                                            <span>{new Date(playlist.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LearningPage;
