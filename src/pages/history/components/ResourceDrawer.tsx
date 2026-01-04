import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './ResourceDrawer.css';

interface ResourceItem {
    id: string;
    title: string;
    year: number;
    type: 'playlist' | 'document' | 'video';
    category_id?: string;
    description?: string;
    youtube_url?: string;
    content?: string;
    hasYear?: boolean;
    created_at?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onDragStart: (e: React.DragEvent, item: ResourceItem) => void;
}

export const ResourceDrawer = ({ isOpen, onClose, onDragStart }: Props) => {
    const [items, setItems] = useState<ResourceItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState<'all' | 'year'>('all');

    useEffect(() => {
        if (isOpen) {
            fetchResources();
        }
    }, [isOpen]);

    const fetchResources = async () => {
        try {
            setLoading(true);

            // Fetch Playlists (fetch all, filter later)
            const { data: playlists, error: pError } = await supabase
                .from('learning_playlists')
                .select('*')
                .eq('is_public', true) // Basic visibility check, or removal if admin
                .order('created_at', { ascending: false });

            if (pError) throw pError;

            // Fetch Documents
            const { data: documents, error: dError } = await supabase
                .from('learning_documents')
                .select('*')
                .eq('is_public', true)
                .order('created_at', { ascending: false });

            if (dError) throw dError;

            // Fetch Standalone Videos
            const { data: videos, error: vError } = await supabase
                .from('learning_videos')
                .select('*')
                .is('playlist_id', null)
                .eq('is_public', true)
                .order('created_at', { ascending: false });

            if (vError) throw vError;

            const combined: ResourceItem[] = [
                ...(playlists || []).map(p => ({
                    id: p.id,
                    title: p.title,
                    year: p.year || 0, // 0 if null
                    hasYear: !!p.year,
                    type: 'playlist' as const,
                    description: p.description,
                    youtube_url: p.youtube_playlist_id ? `https://www.youtube.com/playlist?list=${p.youtube_playlist_id}` : undefined,
                    created_at: p.created_at
                })),
                ...(documents || []).map(d => ({
                    id: d.id,
                    title: d.title,
                    year: d.year || 0,
                    hasYear: !!d.year,
                    type: 'document' as const,
                    content: d.content,
                    created_at: d.created_at
                })),
                ...(videos || []).map(v => ({
                    id: v.id,
                    title: v.title,
                    year: v.year || 0,
                    hasYear: !!v.year,
                    type: 'video' as const,
                    description: v.description,
                    youtube_url: `https://www.youtube.com/watch?v=${v.youtube_video_id}`,
                    created_at: v.created_at
                }))
            ];

            // Sort logic handled in rendering
            setItems(combined);
        } catch (err) {
            console.error('Failed to fetch resources for drawer:', err);
        } finally {
            setLoading(false);
        }
    };

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

    return (
        <div className={`resource-drawer ${isOpen ? 'open' : ''}`}>
            <div className="drawer-header">
                <h2>데이터 서랍</h2>
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
                        전체
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
                {loading ? (
                    <div className="drawer-loading">불러오는 중...</div>
                ) : filterMode === 'year' ? (
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
                    // 'all' mode - flat list
                    filteredList.length > 0 ? (
                        <div className="resource-list flat">
                            {filteredList.map(renderItem)}
                        </div>
                    ) : (
                        <div className="drawer-empty">
                            {searchTerm ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                        </div>
                    )
                )}
            </div>

            <div className="drawer-footer">
                <p>자료를 타임라인으로 드래그하여 배치하세요.</p>
            </div>
        </div>
    );
};
