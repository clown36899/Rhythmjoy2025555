import { useState, useEffect } from 'react';
import { parseVideoUrl } from '../../../utils/videoEmbed';
import './NodeEditorModal.css';

interface NodeEditorModalProps {
    node: any | null;
    onSave: (data: any) => void;
    onDelete?: (id: number) => void;
    onClose: () => void;
}

export default function NodeEditorModal({ node, onSave, onDelete, onClose }: NodeEditorModalProps) {
    const [formData, setFormData] = useState({
        title: '',
        year: '',
        date: '',
        description: '',
        youtube_url: '',
        category: 'general',
        tags: '',
    });

    useEffect(() => {
        if (node) {
            setFormData({
                title: node.title || '',
                year: node.year?.toString() || '',
                date: node.date || '',
                description: node.description || '',
                youtube_url: node.youtube_url || '',
                category: node.category || 'general',
                tags: node.tags?.join(', ') || '',
            });
        }
    }, [node]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const data = {
            title: formData.title,
            year: formData.year ? parseInt(formData.year) : null,
            date: formData.date || null,
            description: formData.description,
            youtube_url: formData.youtube_url,
            category: formData.category,
            tags: formData.tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
        };

        onSave(data);
    };

    const handleDelete = () => {
        if (!node || !onDelete) return;

        if (window.confirm('정말로 이 노드를 삭제하시겠습니까? 연결된 모든 관계도 함께 삭제될 수 있습니다.')) {
            onDelete(node.id);
        }
    };

    const videoInfo = formData.youtube_url ? parseVideoUrl(formData.youtube_url) : null;

    return (
        <div className="node-editor-modal-overlay" onClick={onClose}>
            <div className="node-editor-modal" onClick={(e) => e.stopPropagation()}>
                <div className="node-editor-header">
                    <h2>{node ? '노드 수정' : '새 노드 추가'}</h2>
                    <button className="node-editor-close" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <form className="node-editor-form" onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>제목 *</label>
                        <input
                            type="text"
                            value={formData.title}
                            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                            placeholder="예: 린디합의 탄생"
                            required
                        />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label>연도</label>
                            <input
                                type="number"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                                placeholder="1920"
                            />
                        </div>

                        <div className="form-group">
                            <label>정확한 날짜</label>
                            <input
                                type="date"
                                value={formData.date}
                                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label>카테고리</label>
                        <select
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        >
                            <option value="general">일반</option>
                            <option value="genre">장르</option>
                            <option value="person">인물</option>
                            <option value="event">이벤트</option>
                            <option value="music">음악</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label>유튜브 URL</label>
                        <input
                            type="url"
                            value={formData.youtube_url}
                            onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                            placeholder="https://www.youtube.com/watch?v=..."
                        />
                        {videoInfo?.thumbnailUrl && (
                            <div className="video-preview">
                                <img src={videoInfo.thumbnailUrl} alt="Preview" />
                            </div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>설명</label>
                        <textarea
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="이 노드에 대한 설명을 입력하세요..."
                            rows={4}
                        />
                    </div>

                    <div className="form-group">
                        <label>태그 (쉼표로 구분)</label>
                        <input
                            type="text"
                            value={formData.tags}
                            onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                            placeholder="스윙, 린디합, 사보이볼룸"
                        />
                    </div>

                    <div className="form-actions">
                        {node && onDelete && (
                            <button type="button" className="btn-delete" onClick={handleDelete}>
                                삭제
                            </button>
                        )}
                        <div className="form-actions-right">
                            <button type="button" className="btn-cancel" onClick={onClose}>
                                취소
                            </button>
                            <button type="submit" className="btn-save">
                                {node ? '수정' : '생성'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
