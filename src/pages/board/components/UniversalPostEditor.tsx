import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardData } from '../../../contexts/BoardDataContext';
import type { BoardPost } from '../hooks/useBoardPosts';
import type { BoardPrefix } from '../../../components/BoardPrefixManagementModal';
import { type BoardCategory } from './BoardTabBar';
import { createResizedImages, resizeImage } from '../../../utils/imageResize'; // [UPDATED] Import resizeImage
import { retryOperation } from '../../../utils/asyncUtils';
import { useModalHistory } from '../../../hooks/useModalHistory';
import UniversalEditor from '../../../components/UniversalEditor/Core/UniversalEditor'; // [UPDATED] Import UniversalEditor
import './PostEditorModal.css';
import './UniversalPostEditor.css';

interface UniversalPostEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onPostCreated: () => void;
    post?: BoardPost | null;
    userNickname?: string;
    category: BoardCategory;
}

export default function UniversalPostEditor({
    isOpen,
    onClose,
    onPostCreated,
    post,
    userNickname,
    category
}: UniversalPostEditorProps) {
    useModalHistory(isOpen, onClose);

    const { isAdmin, user } = useAuth();
    const { data: boardData } = useBoardData();

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        author_name: '',
        is_notice: false,
        prefix_id: null as number | null,
        category: category
    });

    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isImageDeleted, setIsImageDeleted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [bannedWords, setBannedWords] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            loadBannedWords();

            if (post) {
                setFormData({
                    title: post.title,
                    content: post.content,
                    author_name: post.author_name,
                    is_notice: post.is_notice || false,
                    prefix_id: post.prefix_id || null,
                    category: (post as any).category || 'free'
                });
                if ((post as any).image_thumbnail) {
                    setImagePreview((post as any).image_thumbnail);
                    setIsImageDeleted(false);
                } else {
                    setImagePreview(null);
                    setIsImageDeleted(false);
                }
            } else {
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

    const loadBannedWords = async () => {
        try {
            const { data } = await supabase.from('board_banned_words').select('word');
            if (data) setBannedWords(data.map(w => w.word));
        } catch (error) {
            console.error('금지어 로드 실패:', error);
        }
    };

    useEffect(() => {
        if (formData.category && boardData?.prefixes) {
            const categoryPrefixes = (boardData.prefixes[formData.category] || []) as BoardPrefix[];
            setPrefixes(categoryPrefixes);
        }
    }, [formData.category, boardData]);

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const objectUrl = URL.createObjectURL(file);
            setImagePreview(objectUrl);
            setIsImageDeleted(false);
        }
    };

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

    // [NEW] Inline Image Upload Handler for Universal Editor
    const handleInlineImageUpload = async (file: File): Promise<string> => {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.webp`;
        const fileUrl = URL.createObjectURL(file);

        try {
            // Resize for optimize (using medium size for content)
            const medium = await resizeImage(fileUrl, 800, 0.8, fileName);

            const { error } = await supabase.storage.from("images").upload(`board-images/content/${fileName}`, medium);
            if (error) throw error;

            const publicUrl = supabase.storage.from("images").getPublicUrl(`board-images/content/${fileName}`).data.publicUrl;
            return publicUrl;
        } catch (error) {
            console.error('Content image upload failed:', error);
            throw error;
        } finally {
            URL.revokeObjectURL(fileUrl);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.title.trim()) { alert('제목을 입력해주세요.'); return; }
        if (!formData.content.trim()) { alert('내용을 입력해주세요.'); return; }

        const bannedTitle = checkBannedWords(formData.title);
        const bannedContent = checkBannedWords(formData.content);
        if (bannedTitle || bannedContent) {
            alert(`금지어("${bannedTitle || bannedContent}")가 포함되어 있습니다.`);
            return;
        }

        if (!user) {
            window.dispatchEvent(new CustomEvent('openLoginModal', {
                detail: { message: '글쓰기는 로그인 후 이용 가능합니다.' }
            }));
            return;
        }

        if (post && !isAdmin && post.user_id !== user?.id) {
            if (!post.user_id) {
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

            setLoadingMessage("글 저장 중...");

            if (post) {
                const updates: any = {
                    title: formData.title,
                    content: formData.content,
                    is_notice: formData.is_notice,
                    prefix_id: formData.prefix_id,
                    category: formData.category,
                    updated_at: new Date().toISOString()
                };

                if (imageUrls.image) {
                    updates.image = imageUrls.image;
                    updates.image_thumbnail = imageUrls.image_thumbnail;
                } else if (isImageDeleted) {
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
                <div className="pem-modal-header">
                    <h2 className="pem-modal-title">
                        {formData.category === 'market' ? '벼룩시장 글쓰기' : '글쓰기'}
                    </h2>
                    <button onClick={onClose} className="pem-close-btn">
                        <i className="ri-arrow-left-line pem-close-icon"></i>
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="pem-form">
                    <div className="pem-form-content">

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

                        {/* [UPDATED] UniversalEditor Replaced Textarea */}
                        <div className="pem-form-group" style={{ flex: 1, minHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                            <UniversalEditor
                                content={formData.content}
                                onChange={(html) => setFormData(prev => ({ ...prev, content: html }))}
                                placeholder="내용을 입력하세요..."
                                onImageUpload={handleInlineImageUpload}
                            />
                        </div>

                        <div className="form-row">
                            <select
                                value={formData.prefix_id || ''}
                                name="prefix_id"
                                onChange={(e) => setFormData(prev => ({ ...prev, prefix_id: e.target.value ? Number(e.target.value) : null }))}
                                className="pem-select half-width lang-ko-only"
                                disabled={formData.is_notice}
                            >
                                <option value="">머릿말 선택</option>
                                {prefixes.filter((p: any) => !p.admin_only).map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <select
                                value={formData.prefix_id || ''}
                                name="prefix_id"
                                onChange={(e) => setFormData(prev => ({ ...prev, prefix_id: e.target.value ? Number(e.target.value) : null }))}
                                className="pem-select half-width lang-en-only"
                                disabled={formData.is_notice}
                            >
                                <option value="">Select a heading</option>
                                {prefixes.filter((p: any) => !p.admin_only).map((p: any) => (
                                    <option key={p.id} value={p.id}>
                                        {p.name === '강습' ? 'Class' :
                                            p.name === '건의/신청' ? 'Requests' :
                                                p.name === '잡담' ? 'General' :
                                                    p.name === '행사' ? 'Event' :
                                                        p.name === '후기' ? 'Review' :
                                                            p.name === '토론' ? 'Discussion' :
                                                                p.name === '구인' ? 'Jobs' :
                                                                    p.name}
                                    </option>
                                ))}
                            </select>
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
                        </div>

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
                                                setIsImageDeleted(true);
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

                        {isAdmin && (
                            <label className="pem-checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.is_notice}
                                    onChange={(e) => setFormData(prev => ({
                                        ...prev,
                                        is_notice: e.target.checked,
                                        prefix_id: e.target.checked ? 1 : prev.prefix_id
                                    }))}
                                />
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">Register as Notice</span>
                                    <span className="fixed-part ko" translate="no">공지사항으로 등록</span>
                                    <span className="fixed-part en" translate="no">Register as Notice</span>
                                </span>
                            </label>
                        )}

                    </div>

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
