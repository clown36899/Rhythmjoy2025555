import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/cafe24Client';
import './DocumentDetailModal.css';
import { useAuth } from '../../../contexts/AuthContext';
import { HistoryContextWidget } from './HistoryContextWidget';
import { renderTextWithLinksAndResources } from '../utils/linkRenderer';
import { ResourceLinkModal } from './ResourceLinkModal';
import { ResourceAutocomplete } from './ResourceAutocomplete';
import { PlaylistModal } from './PlaylistModal';

interface Props {
    documentId: string;
    onClose: () => void;
    onUpdate?: () => void;
    isEditMode?: boolean;
    onEditNode?: () => void;
    autoEdit?: boolean;
}

interface LearningDocument {
    id: string;
    title: string;
    content: string; // Mapped from description
    year?: number | null; // Optional in learning_resources
    category_id: string | null;
    is_public: boolean;
    is_on_timeline?: boolean; // Added for TS check
    author_id: string; // Mapped from user_id
    created_at: string;
    image_url?: string;
    metadata?: any;
    author?: {
        email: string;
        user_metadata: {
            full_name?: string;
            avatar_url?: string;
        }
    }
}
export const DocumentDetailModal = ({ documentId, onClose, onUpdate, isEditMode, onEditNode, autoEdit }: Props) => {
    const { user } = useAuth();
    const [doc, setDoc] = useState<LearningDocument | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(autoEdit || false);

    // Edit Form States
    const [editTitle, setEditTitle] = useState('');
    const [editContent, setEditContent] = useState('');
    const [editYear, setEditYear] = useState<string>('');
    const [editCategory, setEditCategory] = useState(''); // New state for category
    const [editIsPublic, setEditIsPublic] = useState(true);
    const [editIsOnTimeline, setEditIsOnTimeline] = useState(false); // This will likely move to metadata
    const [imageUrl, setImageUrl] = useState(''); // New state for image_url

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Resource Link Modal States
    const [showResourceModal, setShowResourceModal] = useState(false);
    const [selectedKeyword, setSelectedKeyword] = useState('');
    const [viewingPlaylistId, setViewingPlaylistId] = useState<string | null>(null);
    const [viewingDocId, setViewingDocId] = useState<string | null>(null);

    // Autocomplete States
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [autocompleteQuery, setAutocompleteQuery] = useState('');
    const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
    const [hashStartPos, setHashStartPos] = useState<number | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isAdmin = user?.email?.includes('admin') || user?.id === doc?.author_id;
    // Combine edit permissions
    const canEdit = isAdmin && (isEditMode ?? false);

    useEffect(() => {
        fetchDocument();
    }, [documentId]);

    const fetchDocument = async () => {
        try {
            setLoading(true);
            // 1. Fetch Document (from learning_resources)
            const { data, error } = await supabase
                .from('learning_resources')
                .select('*')
                .eq('id', documentId)
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('문서를 찾을 수 없습니다.');

            // Map learning_resources fields to Document interface
            // description -> content
            // user_id -> author_id
            const mappedDoc: LearningDocument = {
                ...data,
                content: data.description || '', // Content is stored in description
                author_id: data.user_id,
                year: data.year || data.metadata?.year || null, // Try to get year if exists
                is_public: data.is_public ?? data.metadata?.is_public ?? true, // Default true if undefined
                is_on_timeline: data.metadata?.is_on_timeline ?? false // Assume is_on_timeline is in metadata
            };

            setDoc(mappedDoc);

            // Edit states
            setEditTitle(mappedDoc.title);
            setEditContent(mappedDoc.content);
            setEditYear(mappedDoc.year?.toString() || '');
            setEditCategory(mappedDoc.category_id || '');
            setEditIsPublic(mappedDoc.is_public ?? true); // default true if undefined
            setEditIsOnTimeline(mappedDoc.is_on_timeline ?? false); // Assume is_on_timeline is in metadata
            setImageUrl(mappedDoc.image_url || '');

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

            const { data: updatedData, error: updateError } = await supabase
                .from('learning_resources')
                .update({
                    title: editTitle,
                    description: editContent, // Map content back to description
                    category_id: editCategory || null, // Convert empty string to null for UUID column
                    image_url: imageUrl,
                    updated_at: new Date().toISOString(),
                    metadata: {
                        ...(doc?.metadata || {}),
                        year: editYear ? parseInt(editYear) : null, // Store year in metadata to be safe
                        is_on_timeline: editIsOnTimeline, // Store is_on_timeline in metadata
                        is_public: editIsPublic // Store is_public in metadata as it's not a column
                    }
                })
                .eq('id', documentId)
                .select(); // 업데이트된 데이터 반환 요청

            if (updateError) throw updateError;

            // Verify update actually happened
            if (!updatedData || updatedData.length === 0) {
                throw new Error('내용이 저장되지 않았습니다. 수정 권한이 없거나 이미 삭제된 문서일 수 있습니다.');
            }

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
                .from('learning_resources')
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

    // Autocomplete Handlers
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setEditContent(newValue);

        const cursorPos = e.target.selectionStart;
        const textBeforeCursor = newValue.substring(0, cursorPos);

        // Find the last # before cursor
        const lastHashIndex = textBeforeCursor.lastIndexOf('#');

        if (lastHashIndex !== -1) {
            const textAfterHash = textBeforeCursor.substring(lastHashIndex + 1);

            // Check if there's a space after # (which would end the autocomplete)
            if (!textAfterHash.includes(' ') && !textAfterHash.includes('\n')) {
                setHashStartPos(lastHashIndex);
                setAutocompleteQuery(textAfterHash);
                setShowAutocomplete(true);

                // Calculate dropdown position
                if (textareaRef.current) {
                    const rect = textareaRef.current.getBoundingClientRect();
                    setAutocompletePosition({
                        top: rect.top + 30,
                        left: rect.left + 20
                    });
                }
            } else {
                setShowAutocomplete(false);
            }
        } else {
            setShowAutocomplete(false);
        }
    };

    const handleAutocompleteSelect = (title: string) => {
        if (hashStartPos !== null && textareaRef.current) {
            const cursorPos = textareaRef.current.selectionStart;
            const beforeHash = editContent.substring(0, hashStartPos);
            const afterCursor = editContent.substring(cursorPos);

            const newContent = `${beforeHash}#${title}${afterCursor}`;
            setEditContent(newContent);

            // Set cursor position after the inserted text
            setTimeout(() => {
                if (textareaRef.current) {
                    const newCursorPos = hashStartPos + title.length + 1;
                    textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
                    textareaRef.current.focus();
                }
            }, 0);
        }

        setShowAutocomplete(false);
        setHashStartPos(null);
    };


    if (loading) {
        return (
            <div className="ddm-overlay">
                <div className="ddm-modal">
                    <div className="ddm-content">로딩 중...</div>
                </div>
            </div>
        );
    }

    if (!doc) {
        return (
            <div className="ddm-overlay">
                <div className="ddm-modal">
                    <div className="ddm-header">
                        <h3>오류</h3>
                        <button onClick={onClose} className="ddm-closeButton">✕</button>
                    </div>
                    <div className="ddm-content">문서를 찾을 수 없습니다.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="ddm-overlay">
            <div className="ddm-modal" style={{ maxWidth: '800px', width: '90%' }}>
                <div className="ddm-header">
                    <h3 className="ddm-title">
                        {isEditing ? '이미지/문서 편집' : doc.title}
                    </h3>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {canEdit && (
                            <button className="ddm-cancelButton" onClick={() => {
                                if (onEditNode) onEditNode();
                                else setIsEditing(true);
                            }}>편집</button>
                        )}
                        <button onClick={onClose} className="ddm-closeButton">✕</button>
                    </div>
                </div>

                <div className="ddm-content">
                    {isEditing ? (
                        <div className="ddm-form">
                            <div className="ddm-formGroup">
                                <label className="ddm-label">제목</label>
                                <input
                                    type="text"
                                    value={editTitle}
                                    onChange={e => setEditTitle(e.target.value)}
                                    className="ddm-input"
                                />
                            </div>
                            <div className="ddm-formGroup" style={{ display: 'flex', gap: '20px' }}>
                                <div style={{ flex: 1 }}>
                                    <label className="ddm-label">연도</label>
                                    <input
                                        type="number"
                                        value={editYear}
                                        onChange={e => setEditYear(e.target.value)}
                                        className="ddm-input"
                                    />
                                </div>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <label className="ddm-checkboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={editIsPublic}
                                            onChange={e => setEditIsPublic(e.target.checked)}
                                        /> <span>공개</span>
                                    </label>
                                    <label className="ddm-checkboxLabel">
                                        <input
                                            type="checkbox"
                                            checked={editIsOnTimeline}
                                            onChange={e => setEditIsOnTimeline(e.target.checked)}
                                        /> <span>타임라인 표시</span>
                                    </label>
                                </div>
                            </div>
                            <div className="ddm-formGroup">
                                <label className="ddm-label">내용</label>
                                <textarea
                                    ref={textareaRef}
                                    value={editContent}
                                    onChange={handleContentChange}
                                    className="ddm-input"
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

                            {/* Image Gallery */}
                            {(() => {
                                const images = (doc.metadata?.images as any[])?.map(img => img.full || img.medium || img.thumbnail)
                                    || (doc.image_url ? [doc.image_url] : [])
                                    || (doc.metadata?.image_medium ? [doc.metadata.image_medium] : []);

                                if (images.length === 0) return null;

                                return (
                                    <div className="doc-image-gallery" style={{
                                        display: 'flex',
                                        gap: '12px',
                                        marginBottom: '24px',
                                        overflowX: 'auto',
                                        paddingBottom: '12px',
                                        scrollSnapType: 'x mandatory',
                                        WebkitOverflowScrolling: 'touch'
                                    }}>
                                        {images.map((imgSrc: string, idx: number) => (
                                            <div key={idx} style={{
                                                flex: '0 0 auto',
                                                width: images.length > 1 ? 'min(80%, 400px)' : '100%',
                                                aspectRatio: 'auto',
                                                scrollSnapAlign: 'center',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                                background: 'rgba(0,0,0,0.2)'
                                            }}>
                                                <img
                                                    src={imgSrc}
                                                    alt={`Document Image ${idx + 1}`}
                                                    style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        objectFit: 'contain',
                                                        display: 'block'
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
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
                                {renderTextWithLinksAndResources(
                                    doc.content || '내용이 없습니다.',
                                    (keyword) => {
                                        setSelectedKeyword(keyword);
                                        setShowResourceModal(true);
                                    }
                                )}
                            </div>
                            <HistoryContextWidget year={doc.year || null} />
                        </div>
                    )}

                    {error && <div className="ddm-error">{error}</div>}
                </div>

                <div className="ddm-footer">
                    {isEditing ? (
                        <>
                            <button className="ddm-deleteButton" onClick={handleDelete} style={{ marginRight: 'auto' }}>삭제</button>
                            <button className="ddm-cancelButton" onClick={() => setIsEditing(false)}>취소</button>
                            <button
                                className="ddm-importButton"
                                onClick={handleSave}
                                disabled={isSaving}
                            >
                                {isSaving ? '저장 중...' : '변경사항 저장'}
                            </button>
                        </>
                    ) : (
                        <button className="ddm-importButton" onClick={onClose}>닫기</button>
                    )}
                </div>
            </div>

            {/* Resource Link Modal */}
            {showResourceModal && (
                <ResourceLinkModal
                    keyword={selectedKeyword}
                    onClose={() => setShowResourceModal(false)}
                    onSelectPlaylist={(playlistId) => {
                        setViewingPlaylistId(playlistId);
                    }}
                    onSelectDocument={(docId) => {
                        setViewingDocId(docId);
                    }}
                />
            )}

            {/* Nested Playlist Modal */}
            {viewingPlaylistId && (
                <PlaylistModal
                    playlistId={viewingPlaylistId}
                    onClose={() => setViewingPlaylistId(null)}
                />
            )}

            {/* Nested Document Modal */}
            {viewingDocId && viewingDocId !== documentId && (
                <DocumentDetailModal
                    documentId={viewingDocId}
                    onClose={() => setViewingDocId(null)}
                    onUpdate={onUpdate}
                />
            )}

            {/* Autocomplete Dropdown */}
            {showAutocomplete && isEditing && (
                <ResourceAutocomplete
                    query={autocompleteQuery}
                    position={autocompletePosition}
                    onSelect={handleAutocompleteSelect}
                    onClose={() => setShowAutocomplete(false)}
                />
            )}
        </div>
    );
};
