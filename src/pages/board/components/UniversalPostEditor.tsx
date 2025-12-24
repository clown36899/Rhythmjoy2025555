import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardPost } from '../page';
import type { BoardPrefix } from '../../../components/BoardPrefixManagementModal';
import { type BoardCategory } from './BoardTabBar';
import { createResizedImages } from '../../../utils/imageResize';
import { retryOperation } from '../../../utils/asyncUtils';
import './PostEditorModal.css'; // Reusing existing styles for consistency
import './UniversalPostEditor.css'; // New styles for image area

interface UniversalPostEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onPostCreated: () => void;
    post?: BoardPost | null;
    userNickname?: string;
    category: BoardCategory; // Current category context
}

export default function UniversalPostEditor({
    isOpen,
    onClose,
    onPostCreated,
    post,
    userNickname,
    category
}: UniversalPostEditorProps) {
    const { isAdmin, user, signInWithKakao } = useAuth();
    const handleLogin = () => signInWithKakao();

    // Login Overlay Component
    const LoginOverlay = () => (
        <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(30, 41, 59, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            textAlign: 'center',
            borderRadius: 'inherit' // Inherit border radius from container
        }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>로그인 필요</h2>
            <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                글쓰기를 위해 로그인이 필요합니다.<br />
                간편하게 로그인하고 계속하세요!
            </p>
            <button
                onClick={handleLogin}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '1rem',
                    background: '#FEE500',
                    color: '#000000',
                    border: 'none',
                    borderRadius: '0.5rem',
                    fontSize: '1rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    marginBottom: '1rem'
                }}
            >
                <i className="ri-kakao-talk-fill" style={{ fontSize: '1.5rem' }}></i>
                카카오로 로그인
            </button>
            <button
                onClick={onClose}
                style={{
                    width: '100%',
                    maxWidth: '300px',
                    padding: '0.75rem',
                    background: 'transparent',
                    color: '#9ca3af',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '0.5rem',
                    cursor: 'pointer'
                }}
            >
                취소
            </button>
        </div>
    );

    // Form State
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        author_name: '',
        is_notice: false,
        prefix_id: null as number | null,
        // Add category field, default to current category context but can be changed if needed (though usually fixed per tab)
        category: category
    });

    // Image State (For Market)
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isImageDeleted, setIsImageDeleted] = useState(false); // Track if image was actively removed
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [bannedWords, setBannedWords] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            loadPrefixes();
            loadBannedWords();

            if (post) {
                // Edit Mode
                setFormData({
                    title: post.title,
                    content: post.content,
                    author_name: post.author_name,
                    is_notice: post.is_notice || false,
                    prefix_id: post.prefix_id || null,
                    category: (post as any).category || 'free'
                });
                // Load existing image if any
                if ((post as any).image_thumbnail) {
                    setImagePreview((post as any).image_thumbnail);
                    setIsImageDeleted(false);
                } else {
                    setImagePreview(null);
                    setIsImageDeleted(false);
                }
            } else {
                // New Mode
                setFormData({
                    title: '',
                    content: '',
                    author_name: user?.user_metadata?.name || user?.email?.split('@')[0] || '',
                    is_notice: false,
                    prefix_id: null,
                    category: category
                });
                setImageFile(null);
                setImagePreview(null);
                setIsImageDeleted(false);
            }
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen, post, user, category]);

    const loadPrefixes = async () => {
        try {
            // Filter by board_category_code matching the current post's category
            // We use formData.category since that's what controls the current post
            let query = supabase
                .from('board_prefixes')
                .select('*')
                .order('display_order', { ascending: true });

            if (formData.category) {
                query = query.eq('board_category_code', formData.category);
            }

            const { data, error } = await query;

            if (error) throw error;
            setPrefixes(data || []);
        } catch (error) {
            console.error('머릿말 로드 실패:', error);
        }
    };

    const loadBannedWords = async () => {
        try {
            const { data } = await supabase.from('board_banned_words').select('word');
            if (data) setBannedWords(data.map(w => w.word));
        } catch (error) {
            console.error('금지어 로드 실패:', error);
        }
    };

    // Reload prefixes when category changes
    useEffect(() => {
        if (formData.category) {
            loadPrefixes();
        }
    }, [formData.category]);

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Image Handlers
    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);

            // Create local preview using Object URL for better performance/memory
            const objectUrl = URL.createObjectURL(file);
            setImagePreview(objectUrl);
            setIsImageDeleted(false);
        }
    };

    // Cleanup object URL
    useEffect(() => {
        return () => {
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const checkBannedWords = (text: string) => {
        for (const word of bannedWords) {
            if (text.includes(word)) return word;
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim()) { alert('제목을 입력해주세요.'); return; }
        if (!formData.content.trim()) { alert('내용을 입력해주세요.'); return; }

        // Banned words check
        const bannedTitle = checkBannedWords(formData.title);
        const bannedContent = checkBannedWords(formData.content);
        if (bannedTitle || bannedContent) {
            alert(`금지어("${bannedTitle || bannedContent}")가 포함되어 있습니다.`);
            return;
        }

        if (!user) { alert('로그인이 필요합니다.'); return; }

        // Edit permission check
        if (post && !isAdmin && post.user_id !== user?.id) {
            // Standard posts must be edited by owner or admin
            if (!post.user_id) {
                // This shouldn't happen for standard posts, but just in case
                alert('수정 권한이 없습니다.');
                return;
            }
            if (post.user_id !== user.id) {
                alert('본인이 작성한 글만 수정할 수 있습니다.');
                return;
            }
        }

        setIsSubmitting(true);
        setLoadingMessage("저장 중...");

        try {
            let imageUrls = {
                image: null as string | null,
                image_thumbnail: null as string | null,
            };

            // 1. Image Upload (only if file selected)
            if (imageFile) {
                setLoadingMessage("이미지 업로드 중...");
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 15);
                const basePath = `board-images`;

                try {
                    const resizedImages = await createResizedImages(imageFile);
                    const fileName = `${timestamp}_${randomString}.webp`;

                    const uploadImage = async (path: string, file: Blob) => {
                        const { error } = await supabase.storage.from("images").upload(path, file);
                        if (error) throw error;
                        return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
                    };

                    // Upload thumbnail and medium (used as main)
                    const [thumbUrl, mainUrl] = await Promise.all([
                        retryOperation(() => uploadImage(`${basePath}/thumbnails/${fileName}`, resizedImages.thumbnail)),
                        retryOperation(() => uploadImage(`${basePath}/medium/${fileName}`, resizedImages.medium))
                    ]);

                    imageUrls.image = mainUrl;
                    imageUrls.image_thumbnail = thumbUrl;

                } catch (imgError) {
                    console.error("Image upload failed", imgError);
                    alert("이미지 업로드 실패. 텍스트만 저장됩니다.");
                }
            }

            // 2. Save Post
            setLoadingMessage("글 저장 중...");

            if (post) {
                // Update
                const updates: any = {
                    title: formData.title,
                    content: formData.content,
                    is_notice: formData.is_notice,
                    prefix_id: formData.prefix_id,
                    category: formData.category, // Save category
                    updated_at: new Date().toISOString()
                };

                if (imageUrls.image) {
                    updates.image = imageUrls.image;
                    updates.image_thumbnail = imageUrls.image_thumbnail;
                } else if (isImageDeleted) {
                    // Explicitly remove image if deleted and not replaced
                    updates.image = null;
                    updates.image_thumbnail = null;
                }

                const { error } = await supabase
                    .from('board_posts')
                    .update(updates)
                    .eq('id', post.id);

                if (error) throw error;
                alert('게시글이 수정되었습니다!');

            } else {
                // Create
                let currentNickname = userNickname;
                if (!currentNickname && user?.id) {
                    const { data: ud } = await supabase.from('board_users').select('nickname').eq('user_id', user.id).maybeSingle();
                    currentNickname = ud?.nickname;
                }

                const newPost = {
                    title: formData.title,
                    content: formData.content,
                    author_name: formData.author_name || user?.user_metadata?.name || "사용자",
                    author_nickname: currentNickname || formData.author_name || "사용자",
                    user_id: user?.id,
                    is_notice: formData.is_notice,
                    prefix_id: formData.prefix_id,
                    category: formData.category,
                    image: imageUrls.image,
                    image_thumbnail: imageUrls.image_thumbnail,
                    views: 0
                };

                const { error } = await supabase
                    .from('board_posts')
                    .insert([newPost]);

                if (error) throw error;
                alert('게시글이 등록되었습니다!');
            }

            onPostCreated();
            onClose();

        } catch (error) {
            console.error('게시글 저장 실패:', error);
            alert('게시글 저장 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const modalContent = (
        <div className="pem-modal-overlay">
            <div className="pem-modal-container universal-editor-container" style={{ position: 'relative' }}>
                {/* Login Requirement Overlay */}
                {!user && <LoginOverlay />}

                {/* Header */}
                <div className="pem-modal-header">
                    <h2 className="pem-modal-title">
                        {formData.category === 'market' ? '벼룩시장 글쓰기' : '글쓰기'}
                    </h2>
                    <button onClick={onClose} className="pem-close-btn">
                        <i className="ri-close-line pem-close-icon"></i>
                    </button>
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="pem-form">
                    <div className="pem-form-content">

                        {/* Image Upload for All Categories */}
                        <div className="pem-form-group">
                            <label className="pem-label">대표 이미지 (선택)</label>
                            <div className="image-upload-area" onClick={() => fileInputRef.current?.click()}>
                                {imagePreview ? (
                                    <div className="image-preview-wrapper">
                                        <img src={imagePreview} alt="Preview" className="image-preview" />
                                        <button
                                            type="button"
                                            className="image-remove-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setImageFile(null);
                                                setImagePreview(null);
                                                setIsImageDeleted(true); // Mark as deleted
                                            }}
                                        >
                                            <i className="ri-close-circle-fill"></i>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="image-placeholder">
                                        <i className="ri-camera-add-line"></i>
                                        <span>이미지 추가</span>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    hidden
                                    ref={fileInputRef}
                                    accept="image/*"
                                    onChange={handleImageSelect}
                                />
                            </div>
                        </div>

                        {/* Title & Content */}
                        <div className="pem-form-group">
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                required
                                className="pem-input"
                                placeholder="제목"
                            />
                        </div>

                        {/* Prefix & Author Row */}
                        <div className="form-row">
                            {!post && (
                                <input
                                    type="text"
                                    name="author_name"
                                    value={formData.author_name}
                                    onChange={handleInputChange}
                                    required
                                    className="pem-input half-width"
                                    placeholder="작성자 이름"
                                />
                            )}
                            <select
                                value={formData.prefix_id || ''}
                                name="prefix_id"
                                onChange={(e) => setFormData(prev => ({ ...prev, prefix_id: e.target.value ? Number(e.target.value) : null }))}
                                className="pem-select half-width"
                            >
                                <option value="">머릿말 선택</option>
                                {prefixes.filter((p: any) => !p.admin_only).map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="pem-form-group">
                            <textarea
                                name="content"
                                value={formData.content}
                                onChange={handleInputChange}
                                required
                                rows={10}
                                className="pem-textarea"
                                placeholder="내용을 입력하세요"
                            />
                        </div>

                        {/* Notice Checkbox (Admin Only) */}
                        {isAdmin && (
                            <label className="pem-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.is_notice}
                                    onChange={(e) => setFormData(prev => ({ ...prev, is_notice: e.target.checked }))}
                                />
                                <span>공지사항으로 등록</span>
                            </label>
                        )}

                    </div>

                    {/* Footer */}
                    <div className="pem-modal-footer">
                        <button type="button" onClick={onClose} className="pem-btn pem-btn-cancel">취소</button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="pem-btn pem-btn-submit"
                        >
                            {isSubmitting ? (loadingMessage || '저장 중...') : '등록하기'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
