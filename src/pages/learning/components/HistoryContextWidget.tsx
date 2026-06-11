import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/cafe24Client';
import './HistoryContextWidget.css';

interface HistoryNode {
    id: number;
    title: string;
    year: number;
    category: string;
    description: string;
}

interface Props {
    year: number | null;
}

export const HistoryContextWidget = ({ year }: Props) => {
    const navigate = useNavigate();
    const [nodes, setNodes] = useState<HistoryNode[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (year) {
            fetchRelatedNodes();
        }
    }, [year]);

    const fetchRelatedNodes = async () => {
        try {
            setLoading(true);
            // Fetch nodes from the same decade
            const decadeStart = Math.floor(year! / 10) * 10;
            const decadeEnd = decadeStart + 9;

            const { data, error } = await supabase
                .from('history_nodes')
                .select('*')
                .gte('year', decadeStart)
                .lte('year', decadeEnd)
                .order('year', { ascending: true })
                .limit(5);

            if (error) throw error;
            setNodes(data || []);
        } catch (err) {
            console.error('Failed to fetch historical context:', err);
        } finally {
            setLoading(false);
        }
    };

    if (!year) return null;

    return (
        <div className="history-context-widget">
            <div className="widget-header">
                <h3>🏛 역사적 맥락 ({Math.floor(year / 10) * 10}s)</h3>
                <button className="view-all-link" onClick={() => navigate('/history')}>
                    타임라인 보기 <i className="ri-arrow-right-line"></i>
                </button>
            </div>

            <div className="widget-content">
                {loading ? (
                    <div className="widget-loading">불러오는 중...</div>
                ) : nodes.length > 0 ? (
                    <div className="context-node-list">
                        {nodes.map(node => (
                            <div
                                key={node.id}
                                className={`context-node-card cat-${node.category || 'general'}`}
                                onClick={() => navigate('/history')} // TODO: maybe direct link later
                            >
                                <div className="context-node-year">{node.year}년</div>
                                <div className="context-node-info">
                                    <div className="context-node-title">{node.title}</div>
                                    <div className="context-node-desc">
                                        {node.description?.substring(0, 40)}
                                        {node.description?.length > 40 ? '...' : ''}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="widget-empty">
                        이 시대의 등록된 역사적 사건이 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
};
