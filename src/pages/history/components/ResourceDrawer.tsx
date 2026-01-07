import { useState, useEffect, useMemo } from 'react';
import './ResourceDrawer.css';
import { CategoryManager } from '../../learning/components/CategoryManager';

interface ResourceItem {
    id: string;
    title: string;
    year: number;
    type: 'playlist' | 'document' | 'video' | 'general'; // Added 'general' for folders
    category_id?: string;
    description?: string;
    youtube_url?: string;
    content?: string;
    hasYear?: boolean;
    created_at?: string;
    items?: any[]; // Child items for local unpack
    is_unclassified?: boolean; // Added for proper tracking
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onDragStart: (e: React.DragEvent, item: any) => void;
    onItemClick?: (id: string, type: string, title: string) => void;
    refreshKey?: number;
    // Injected Data
    categories: any[];
    playlists: any[];
    videos: any[]; // These are ALL videos (for unpack)
    documents: any[];
    onMoveResource?: (id: string, targetCategoryId: string | null) => void;
    onCategoryChange?: () => void;
}

export const ResourceDrawer = ({ isOpen, onClose, onDragStart, onItemClick, refreshKey: _refreshKey, categories, playlists, videos, documents, onMoveResource, onCategoryChange }: Props) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'year'>('all');
    const [width, setWidth] = useState(360);
    const [isResizing, setIsResizing] = useState(false);

    // 🔍 DEBUG: Log received props
    useEffect(() => {
        console.log('🎯 [ResourceDrawer] Received props:', {
            categoriesCount: categories?.length || 0,
            categories: categories,
            playlistsCount: playlists?.length || 0,
            videosCount: videos?.length || 0,
            documentsCount: documents?.length || 0
        });
    }, [categories, playlists, videos, documents]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX;
            if (newWidth >= 300 && newWidth <= window.innerWidth * 0.9) {
                setWidth(newWidth);
            }
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'ew-resize';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [isResizing]);

    const isExpanded = width > 600;

    // Combine resources for the list view
    const items = useMemo(() => {
        // Include all videos for the tree view; CategoryManager will place them correctly
        const allVideos = videos || [];

        console.log('🔍 [ResourceDrawer] Building items:', {
            categoriesCount: categories?.length || 0,
            playlistsCount: playlists?.length || 0,
            documentsCount: documents?.length || 0,
            videosCount: videos?.length || 0
        });

        const result = [
            // 🔥 CRITICAL: Include categories (folders) first!
            ...(categories || []).map(c => ({
                id: c.id,
                title: c.title || c.name || '무제 폴더',
                year: c.year || 0,
                hasYear: !!c.year,
                // 🔥 FIX: Respect null (Root) if defined. Only fallback if undefined.
                category_id: c.category_id !== undefined ? c.category_id : (c.parent_id ?? null),
                is_unclassified: c.is_unclassified ?? false,
                type: 'general' as const, // Folders have type='general'
                created_at: c.created_at
            })),
            ...(playlists || []).map(p => ({
                id: p.id,
                title: p.title,
                year: p.year || 0,
                hasYear: !!p.year,
                category_id: p.category_id,
                is_unclassified: p.is_unclassified ?? false, // 🔥 CRITICAL: Pass is_unclassified
                type: 'playlist' as const,
                description: p.description,
                youtube_url: p.youtube_playlist_id ? `https://www.youtube.com/playlist?list=${p.youtube_playlist_id}` : undefined,
                created_at: p.created_at,
                items: videos?.filter(v => v.category_id === p.id) || []
            })),
            ...(documents || []).map(d => ({
                id: d.id,
                title: d.title,
                year: d.year || 0,
                hasYear: !!d.year,
                category_id: d.category_id,
                is_unclassified: d.is_unclassified ?? false, // 🔥 CRITICAL: Pass is_unclassified
                type: d.type, // DB의 type을 그대로 사용 (PERSON, DOCUMENT 등)
                content: d.content,
                created_at: d.created_at,
                image_url: d.image_url
            })),
            ...(allVideos || []).map(v => ({
                id: v.id,
                title: v.title,
                year: v.year || 0,
                hasYear: !!v.year,
                category_id: v.category_id,
                is_unclassified: v.is_unclassified ?? false, // 🔥 CRITICAL: Pass is_unclassified
                type: 'video' as const,
                description: v.description,
                youtube_url: `https://www.youtube.com/watch?v=${v.youtube_video_id}`,
                created_at: v.created_at
            }))
        ];

        console.log('✅ [ResourceDrawer] Items built:', {
            totalItems: result.length,
            folders: result.filter(i => i.type === 'general').length,
            playlists: result.filter(i => i.type === 'playlist').length,
            videos: result.filter(i => i.type === 'video').length,
            documents: result.filter(i => i.type !== 'general' && i.type !== 'playlist' && i.type !== 'video').length
        });

        return result;
    }, [
        // 🔥 CRITICAL: Use JSON.stringify to detect deep changes in data
        JSON.stringify(categories),
        JSON.stringify(playlists),
        JSON.stringify(documents),
        JSON.stringify(videos)
    ]);

    // Filter and Group Logic
    const filteredList = items.filter(item =>
        item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const groupedItems = filterMode === 'year'
        ? filteredList
            .filter(item => item.hasYear) // Only items with year
            .sort((a, b) => a.year - b.year)
            .reduce((acc, item) => {
                const decade = Math.floor(item.year / 10) * 10;
                const key = `${decade}s`;
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
            }, {} as Record<string, ResourceItem[]>)
        : {}; // Not used for 'all' mode

    const decades = Object.keys(groupedItems).sort();

    const renderItem = (item: ResourceItem) => (
        <div
            key={item.id}
            className={`resource-item ${item.type}`}
            draggable
            onDragStart={(e) => onDragStart(e, item)}
        >
            <span className="item-icon">
                {item.type === 'playlist' ? '💿' : item.type === 'video' ? '📹' : '📄'}
            </span>
            <div className="item-info">
                <span className="item-title">{item.title}</span>
                <span className="item-year">
                    {item.hasYear ? `${item.year}년` : '연도 미설정'}
                </span>
            </div>
            <div className="drag-handle">
                <i className="ri-drag-move-fill"></i>
            </div>
        </div>
    );

    const handleResourceClick = (id: string, type: string = 'playlist') => {
        const item = items.find(i => i.id === id);
        if (onItemClick) {
            onItemClick(id, type, item?.title || '제목 없음');
        }
    };

    return (
        <div
            className={`resource-drawer ${isOpen ? 'open' : ''} ${isExpanded ? 'expanded' : ''}`}
            style={{ width, right: isOpen ? 0 : -width }}
        >
            <div
                className={`resize-handle ${isResizing ? 'resizing' : ''}`}
                onMouseDown={() => setIsResizing(true)}
            />

            <div className="drawer-header">
                <h2 className="manual-label-wrapper">
                    <span className="translated-part">데이터 서랍</span>
                    <span className="fixed-part ko" translate="no">데이터 서랍</span>
                    <span className="fixed-part en" translate="no">Data</span>
                </h2>
                <button className="close-btn" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>
            </div>

            <div className="drawer-controls">
                <div className="drawer-search">
                    <input
                        type="text"
                        placeholder="학습 자료 검색..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="drawer-filters">
                    <button
                        className={`filter-btn ${filterMode === 'all' ? 'active' : ''}`}
                        onClick={() => setFilterMode('all')}
                    >
                        전체 (트리)
                    </button>
                    <button
                        className={`filter-btn ${filterMode === 'year' ? 'active' : ''}`}
                        onClick={() => setFilterMode('year')}
                    >
                        연도별
                    </button>
                </div>
            </div>

            <div className="drawer-content">
                {filterMode === 'year' ? (
                    decades.length > 0 ? (
                        decades.map(decade => (
                            <div key={decade} className="decade-section">
                                <h3 className="decade-title">{decade}</h3>
                                <div className="resource-list">
                                    {groupedItems[decade].map(renderItem)}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="drawer-empty">
                            {searchTerm ? '검색 결과가 없습니다.' : '연도별 데이터가 없습니다.'}
                        </div>
                    )
                ) : (
                    // 'all' mode - Category Tree
                    <div className="category-tree-wrapper">
                        <CategoryManager
                            onCategoryChange={onCategoryChange || (() => { })}
                            readOnly={!isExpanded}
                            resources={items} // 🔥 SIMPLIFIED: Pass all items as single prop
                            onSelect={() => { }}
                            dragSourceMode={true}
                            onPlaylistClick={handleResourceClick}
                            onMovePlaylist={onMoveResource}
                        />
                    </div>
                )}
            </div>

            <div className="drawer-footer">
                <p>자료를 타임라인으로 드래그하여 배치하세요.</p>
            </div>
        </div>
    );
};
