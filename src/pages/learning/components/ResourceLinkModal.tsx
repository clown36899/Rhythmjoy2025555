import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/cafe24Client';
import './ResourceLinkModal.css';

interface ResourceItem {
    id: string;
    title: string;
    type: 'playlist' | 'document';
    description?: string;
}

interface Props {
    keyword: string;
    onClose: () => void;
    onSelectPlaylist: (playlistId: string) => void;
    onSelectDocument: (documentId: string) => void;
}

export const ResourceLinkModal = ({ keyword, onClose, onSelectPlaylist, onSelectDocument }: Props) => {
    const [resources, setResources] = useState<ResourceItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        searchResources();
    }, [keyword]);

    const searchResources = async () => {
        try {
            setLoading(true);

            // 재생목록 검색
            const { data: playlists } = await supabase
                .from('learning_playlists')
                .select('id, title, description')
                .ilike('title', `%${keyword}%`)
                .limit(10);

            // 문서 검색
            const { data: documents } = await supabase
                .from('learning_documents')
                .select('id, title, content')
                .ilike('title', `%${keyword}%`)
                .limit(10);

            const combined: ResourceItem[] = [
                ...(playlists || []).map(p => ({
                    id: p.id,
                    title: p.title,
                    type: 'playlist' as const,
                    description: p.description
                })),
                ...(documents || []).map(d => ({
                    id: d.id,
                    title: d.title,
                    type: 'document' as const,
                    description: d.content?.substring(0, 100)
                }))
            ];

            setResources(combined);
        } catch (error) {
            console.error('Failed to search resources:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = (resource: ResourceItem) => {
        if (resource.type === 'playlist') {
            onSelectPlaylist(resource.id);
        } else {
            onSelectDocument(resource.id);
        }
        onClose();
    };

    return (
        <div className="rlm-overlay" onClick={onClose}>
            <div className="rlm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="rlm-header">
                    <h3>"{keyword}" 관련 자료</h3>
                    <button className="rlm-close" onClick={onClose}>✕</button>
                </div>
                <div className="rlm-content">
                    {loading ? (
                        <div className="rlm-loading">검색 중...</div>
                    ) : resources.length === 0 ? (
                        <div className="rlm-empty">관련 자료를 찾을 수 없습니다.</div>
                    ) : (
                        <div className="rlm-list">
                            {resources.map((resource) => (
                                <div
                                    key={resource.id}
                                    className="rlm-item"
                                    onClick={() => handleSelect(resource)}
                                >
                                    <div className="rlm-item-icon">
                                        {resource.type === 'playlist' ? '📹' : '📄'}
                                    </div>
                                    <div className="rlm-item-info">
                                        <div className="rlm-item-title">{resource.title}</div>
                                        {resource.description && (
                                            <div className="rlm-item-desc">
                                                {resource.description}
                                            </div>
                                        )}
                                    </div>
                                    <div className="rlm-item-type">
                                        {resource.type === 'playlist' ? '재생목록' : '문서'}
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
