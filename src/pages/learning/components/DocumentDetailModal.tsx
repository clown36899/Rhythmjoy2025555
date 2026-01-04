import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import styles from './PlaylistImportModal.module.css'; // Re-using layout styles
import { useAuth } from '../../../contexts/AuthContext';
import { HistoryContextWidget } from './HistoryContextWidget';

interface Props {
    documentId: string;
    onClose: () => void;
    onUpdate?: () => void;
}

interface LearningDocument {
    id: string;
    title: string;
    content: string;
    year: number | null;
    category_id: string;
    is_public: boolean;
    author_id: string;
    created_at: string;
    is_on_timeline: boolean;
}

export const DocumentDetailModal = ({ documentId, onClose, onUpdate }: Props) => {
    const { user } = useAuth();
    const [doc, setDoc] = useState<LearningDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);

    // Edit Form States
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editYear, setEditYear] = useState<string>('');
    const [editIsPublic, setEditIsPublic] = useState(true);
    const [editIsOnTimeline, setEditIsOnTimeline] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = user?.email?.includes('admin') || user?.id === doc?.author_id;

    useEffect(() => {
        fetchDocument();
    }, [documentId]);

    const fetchDocument = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('learning_documents')
                .select('*')
                .eq('id', documentId)
                .single();

            if (error) throw error;
            setDoc(data);

            // Sync edit states
            setEditTitle(data.title);
            setEditContent(data.content || '');
            setEditYear(data.year?.toString() || '');
            setEditIsPublic(data.is_public);
            setEditIsOnTimeline(data.is_on_timeline);

        } catch (err) {
            console.error('Failed to fetch document:', err);
            setError('문서를 불러오지 못했습니다.');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        try {
            setIsSaving(true);
            setError(null);

            if (!editTitle.trim()) throw new Error('제목을 입력해주세요.');

            const { error: updateError } = await supabase
                .from('learning_documents')
                .update({
                    title: editTitle,
                    content: editContent,
                    year: editYear ? parseInt(editYear) : null,
                    is_public: editIsPublic,
                    is_on_timeline: editIsOnTimeline,
                    updated_at: new Date().toISOString()
                })
                .eq('id', documentId);

            if (updateError) throw updateError;

            setIsEditing(false);
            fetchDocument();
            if (onUpdate) onUpdate();
        } catch (err: any) {
            console.error(err);
            setError(err.message || '저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!window.confirm('정말 이 문서를 삭제하시겠습니까?')) return;

        try {
            setIsSaving(true);
            const { error: deleteError } = await supabase
                .from('learning_documents')
                .delete()
                .eq('id', documentId);

            if (deleteError) throw deleteError;

            onClose();
            if (onUpdate) onUpdate();
        } catch (err) {
            console.error(err);
            alert('삭제 실패');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <div className={styles.content}>로딩 중...</div>
                </div>
            </div>
        );
    }

    if (!doc) {
        return (
            <div className={styles.overlay}>
                <div className={styles.modal}>
                    <div className={styles.header}>
                        <h3>오류</h3>
                        <button onClick={onClose} className={styles.closeButton}>✕</button>
                    </div>
                    <div className={styles.content}>문서를 찾을 수 없습니다.</div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.modal} style={{ maxWidth: '800px', width: '90%' }}>
                <div className={styles.header}>
                    <h3 className={styles.title}>
                        {isEditing ? '이미지/문서 편집' : doc.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {isAdmin && !isEditing && (
                            <button className={styles.cancelButton} onClick={() => setIsEditing(true)}>편집</button>
                        )}
                        <button onClick={onClose} className={styles.closeButton}>✕</button>
                    </div>
                </div>

                <div className={styles.content}>
                    {isEditing ? (
                        <div className={styles.form}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>제목</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    className={styles.input}
                                />
                            </div>
                            <div className={styles.formGroup} style={{ display: 'flex', gap: '20px' }}>
                                <div style={{ flex: 1 }}>
                                    <label className={styles.label}>연도</label>
                                    <input
                                        type="number"
                                        value={editYear}
                                        onChange={e => setEditYear(e.target.value)}
                                        className={styles.input}
                                    />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={editIsPublic}
                                            onChange={e => setEditIsPublic(e.target.checked)}
                                        /> <span>공개</span>
                                    </label>
                                    <label className={styles.checkboxLabel}>
                                        <input
                                            type="checkbox"
                                            checked={editIsOnTimeline}
                                            onChange={e => setEditIsOnTimeline(e.target.checked)}
                                        /> <span>타임라인 표시</span>
                                    </label>
                                </div>
                            </div>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>내용</label>
                                <textarea
                                    value={editContent}
                                    onChange={e => setEditContent(e.target.value)}
                                    className={styles.input}
                                    style={{ minHeight: '300px', resize: 'vertical' }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="doc-view-body">
                            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                                {doc.year && <span className="itemYearBadge">#{doc.year}년</span>}
                                {!doc.is_public && <span className="adminBadge private">🔒 비공개</span>}
                                {doc.is_on_timeline && <span className="adminBadge ytLinked">🏛 타임라인</span>}
                            </div>
                            <div
                                className="markdown-content"
                                style={{
                                    whiteSpace: 'pre-wrap',
                                    fontSize: '1.1rem',
                                    lineHeight: '1.8',
                                    backgroundColor: 'rgba(255,255,255,0.03)',
                                    padding: '24px',
                                    borderRadius: '12px',
                                    color: '#e2e8f0'
                                }}
                            >
                                {doc.content || '내용이 없습니다.'}
                            </div>
                            <HistoryContextWidget year={doc.year || null} />
                        </div>
                    )}

                    {error && <div className={styles.error}>{error}</div>}
                </div>

                <div className={styles.footer}>
                    {isEditing ? (
                        <>
                            <button className={styles.deleteButton} onClick={handleDelete} style={{ marginRight: 'auto' }}>삭제</button>
                            <button className={styles.cancelButton} onClick={() => setIsEditing(false)}>취소</button>
                            <button
                                className={styles.importButton}
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? '저장 중...' : '변경사항 저장'}
                            </button>
                        </>
                    ) : (
                        <button className={styles.importButton} onClick={onClose}>닫기</button>
                    )}
                </div>
            </div>
        </div>
    );
};
