import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import './ResourceAutocomplete.css';

interface ResourceItem {
    id: string;
    title: string;
    type: 'playlist' | 'document';
}

interface Props {
    query: string;
    position: { top: number; left: number };
    onSelect: (title: string) => void;
    onClose: () => void;
}

export const ResourceAutocomplete = ({ query, position, onSelect, onClose }: Props) => {
    const [resources, setResources] = useState<ResourceItem[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        searchResources();
    }, [query]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, resources.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && resources.length > 0) {
                e.preventDefault();
                onSelect(resources[selectedIndex].title);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [resources, selectedIndex, onSelect, onClose]);

    const searchResources = async () => {
        try {
            setLoading(true);

            // 재생목록 검색
            const { data: playlists } = await supabase
                .from('learning_playlists')
                .select('id, title')
                .ilike('title', `%${query}%`)
                .limit(5);

            // 문서 검색
            const { data: documents } = await supabase
                .from('learning_documents')
                .select('id, title')
                .ilike('title', `%${query}%`)
                .limit(5);

            const combined: ResourceItem[] = [
                ...(playlists || []).map(p => ({
                    id: p.id,
                    title: p.title,
                    type: 'playlist' as const
                })),
                ...(documents || []).map(d => ({
                    id: d.id,
                    title: d.title,
                    type: 'document' as const
                }))
            ];

            setResources(combined);
            setSelectedIndex(0);
        } catch (error) {
            console.error('Failed to search resources:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div
                ref={containerRef}
                className="rac-container"
                style={{ top: position.top, left: position.left }}
            >
                <div className="rac-loading">검색 중...</div>
            </div>
        );
    }

    if (resources.length === 0) {
        return (
            <div
                ref={containerRef}
                className="rac-container"
                style={{ top: position.top, left: position.left }}
            >
                <div className="rac-empty">자료를 찾을 수 없습니다</div>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="rac-container"
            style={{ top: position.top, left: position.left }}
        >
            {resources.map((resource, index) => (
                <div
                    key={resource.id}
                    className={`rac-item ${index === selectedIndex ? 'selected' : ''}`}
                    onClick={() => onSelect(resource.title)}
                    onMouseEnter={() => setSelectedIndex(index)}
                >
                    <span className="rac-icon">
                        {resource.type === 'playlist' ? '📹' : '📄'}
                    </span>
                    <span className="rac-title">{resource.title}</span>
                </div>
            ))}
        </div>
    );
};
