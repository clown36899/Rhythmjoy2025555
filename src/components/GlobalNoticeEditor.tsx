import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { resizeImage } from '../utils/imageResize';
import '../pages/board/components/PostEditorModal.css'; // Reuse existing editor styles

interface GlobalNoticeEditorProps {
    isOpen: boolean;
    onClose: () => void;
    noticeId?: number | null;
    onSaved?: () => void;
}

export default function GlobalNoticeEditor({ isOpen, onClose, noticeId: propNoticeId, onSaved }: GlobalNoticeEditorProps) {
    const [currentNoticeId, setCurrentNoticeId] = useState<number | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isActive, setIsActive] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLatestOrCreate();
        }
    }, [isOpen, propNoticeId]);

    const fetchLatestOrCreate = async () => {
        setIsLoading(true);
        try {
            // 1. If propNoticeId exists, load that specific one
            // 2. Otherwise, load the most recent one (since it's usually a single main notice)
            let query = supabase.from('global_notices').select('*');

            if (propNoticeId) {
                query = query.eq('id', propNoticeId);
            } else {
                query = query.order('created_at', { ascending: false }).limit(1);
            }

            const { data, error } = await query.maybeSingle();

            if (error) throw error;

            if (data) {
                setCurrentNoticeId(data.id);
                setTitle(data.title);
                setContent(data.content);
                setPreviewUrl(data.image_url);
                setIsActive(data.is_active);
            } else {
                resetForm();
            }
        } catch (error) {
            console.error('Failed to load notice:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const resetForm = () => {
        setCurrentNoticeId(null);
        setTitle('');
        setContent('');
        setImageFile(null);
        setPreviewUrl(null);
        setIsActive(true);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const url = URL.createObjectURL(file);
            setPreviewUrl(url);
        }
    };

    const handleSave = async () => {
        if (!title.trim() || !content.trim()) {
            alert('제목과 내용을 모두 입력해주세요.');
            return;
        }

        setIsUploading(true);
        try {
            let uploadedImageUrl = previewUrl;

            if (imageFile) {
                // WebP로 변환하되, 원본 사이즈를 최대한 유지 (4000px까지 허용)
                const resized = await resizeImage(imageFile, 4000, 0.9, `notice_${Date.now()}.webp`);

                const filePath = `notices/${Date.now()}_${resized.name}`;
                const { error: uploadError } = await supabase.storage
                    .from('images')
                    .upload(filePath, resized);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('images')
                    .getPublicUrl(filePath);

                uploadedImageUrl = publicUrl;
            }

            const noticeData = {
                title,
                content,
                image_url: uploadedImageUrl,
                is_active: isActive,
            };

            console.log('[NoticeEditor] Saving data to DB:', noticeData);

            if (currentNoticeId) {
                const { error } = await supabase
                    .from('global_notices')
                    .update(noticeData)
                    .eq('id', currentNoticeId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('global_notices')
                    .insert([noticeData]);
                if (error) throw error;
            }

            alert('공지사항이 저장되었습니다.');
            if (onSaved) onSaved();
            onClose();
        } catch (error) {
            console.error('Failed to save notice:', error);
            alert('저장에 실패했습니다.');
        } finally {
            setIsUploading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="pem-modal-overlay" onClick={onClose} style={{ zIndex: 100001 }}>
            <div className="pem-modal-container" onClick={e => e.stopPropagation()}>
                <div className="pem-modal-header">
                    <h2 className="pem-modal-title">{currentNoticeId ? '기존 공지 수정' : '새 공지 작성'}</h2>
                    <button className="pem-close-btn" onClick={onClose}>
                        <i className="ri-close-line pem-close-icon"></i>
                    </button>
                </div>

                <div className="pem-form">
                    <div className="pem-form-content">
                        {isLoading ? (
                            <div className="loading-state" style={{ padding: '40px', textAlign: 'center', color: '#888' }}>불러오는 중...</div>
                        ) : (
                            <>
                                <div className="pem-form-group">
                                    <label className="pem-label">제목</label>
                                    <input
                                        type="text"
                                        className="pem-input"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                        placeholder="공지 제목을 입력하세요"
                                    />
                                </div>

                                <div className="pem-form-group">
                                    <label className="pem-label">내용</label>
                                    <textarea
                                        className="pem-textarea"
                                        value={content}
                                        onChange={e => setContent(e.target.value)}
                                        placeholder="공지 내용을 입력하세요"
                                        rows={10}
                                    />
                                </div>

                                <div className="pem-form-group">
                                    <label className="pem-label">이미지 (최대 300px로 자동 리사이징)</label>
                                    <div className="post-editor-image-upload">
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageChange}
                                            id="notice-image-input"
                                            hidden
                                        />
                                        <label htmlFor="notice-image-input" className="image-upload-btn" style={{ background: '#374151', color: '#fff', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                            <i className="ri-image-add-line"></i> 이미지 선택
                                        </label>
                                        {previewUrl && (
                                            <div className="image-preview" style={{ marginTop: '12px', position: 'relative', maxWidth: '300px' }}>
                                                <img src={previewUrl} alt="Preview" style={{ width: '100%', borderRadius: '8px' }} />
                                                <button
                                                    className="remove-image-btn"
                                                    style={{ position: 'absolute', top: '-10px', right: '-10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                    onClick={() => {
                                                        setImageFile(null);
                                                        setPreviewUrl(null);
                                                    }}
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="pem-notice-box">
                                    <label className="pem-notice-label">
                                        <input
                                            type="checkbox"
                                            className="pem-checkbox"
                                            checked={isActive}
                                            onChange={e => setIsActive(e.target.checked)}
                                        />
                                        <div className="pem-notice-content">
                                            <div className="pem-notice-title">사용자에게 노출</div>
                                            <div className="pem-notice-desc">체크 해제 시 모든 페이지 팝업에서 사라집니다.</div>
                                        </div>
                                    </label>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="pem-modal-footer">
                    <button className="pem-btn pem-btn-cancel" onClick={onClose}>취소</button>
                    <button
                        className="pem-btn pem-btn-submit"
                        onClick={handleSave}
                        disabled={isUploading}
                    >
                        {isUploading ? '저장 중...' : '저장하기'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
