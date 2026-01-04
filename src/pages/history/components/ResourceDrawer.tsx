import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './ResourceDrawer.css';

interface ResourceItem {
    id: string;
    title: string;
    year: number;
    type: 'playlist' | 'document';
    category_id?: string;
    description?: string;
    youtube_url?: string;
    content?: string;
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

    useEffect(() => {
        if (isOpen) {
            fetchResources();
        }
    }, [isOpen]);

    const fetchResources = async () => {
        try {
            setLoading(true);

            // Fetch Playlists with year (relaxed filter for debugging)
            const { data: playlists, error: pError } = await supabase
                .from('learning_playlists')
                .select('*')
                .not('year', 'is', null);

            if (pError) throw pError;

            // Fetch Documents with year (relaxed filter for debugging)
            const { data: documents, error: dError } = await supabase
                .from('learning_documents')
                .select('*')
                .not('year', 'is', null);

            if (dError) throw dError;

            const combined: ResourceItem[] = [
                ...(playlists || []).map(p => ({
                    id: p.id,
                    title: p.title,
                    year: p.year,
                    type: 'playlist' as const,
                    description: p.description,
                    youtube_url: p.youtube_playlist_id ? `https://www.youtube.com/playlist?list=${p.youtube_playlist_id}` : undefined
                })),
                ...(documents || []).map(d => ({
                    id: d.id,
                    title: d.title,
                    year: d.year,
                    type: 'document' as const,
                    content: d.content
                }))
            ];

            // Sort by year
            combined.sort((a, b) => a.year - b.year);
            setItems(combined);
        } catch (err) {
            console.error('Failed to fetch resources for drawer:', err);
        } finally {
            setLoading(false);
        }
    };

    // Group items by decade
    const groupedItems = items
        .filter(item => item.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .reduce((acc, item) => {
            const decade = Math.floor(item.year / 10) * 10;
            const key = `${decade}s`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {} as Record<string, ResourceItem[]>);

    const decades = Object.keys(groupedItems).sort();

    return (
        <div className={`resource-drawer ${isOpen ? 'open' : ''}`}>
            <div className="drawer-header">
                <h2>데이터 서랍</h2>
                <button className="close-btn" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>
            </div>

            <div className="drawer-search">
                <input
                    type="text"
                    placeholder="학습 자료 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="drawer-content">
                {loading ? (
                    <div className="drawer-loading">불러오는 중...</div>
                ) : decades.length > 0 ? (
                    decades.map(decade => (
                        <div key={decade} className="decade-section">
                            <h3 className="decade-title">{decade}</h3>
                            <div className="resource-list">
                                {groupedItems[decade].map(item => (
                                    <div
                                        key={item.id}
                                        className={`resource-item ${item.type}`}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, item)}
                                    >
                                        <span className="item-icon">
                                            {item.type === 'playlist' ? '💿' : '📄'}
                                        </span>
                                        <div className="item-info">
                                            <span className="item-title">{item.title}</span>
                                            <span className="item-year">{item.year}년</span>
                                        </div>
                                        <div className="drag-handle">
                                            <i className="ri-drag-move-fill"></i>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="drawer-empty">
                        {searchTerm ? '검색 결과가 없습니다.' : (
                            <div className="empty-guide">
                                <p>출력할 데이터가 없습니다.</p>
                                <p className="sub-guide">학습(Learning) 메뉴에서 자료에 <b>'연도'</b>를 등록해 주세요!</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="drawer-footer">
                <p>자료를 타임라인으로 드래그하여 배치하세요.</p>
            </div>
        </div>
    );
};
