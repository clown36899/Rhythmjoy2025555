import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { resizeImage } from '../../../utils/imageResize';
import { retryOperation } from '../../../utils/asyncUtils';
import './QuickMemoEditor.css';

interface QuickMemoEditorProps {
    category: string;
    onPostCreated?: () => void;
    editData?: any;
    providedPassword?: string;
    onCancelEdit?: () => void;
    className?: string;
    isAdmin?: boolean;
}

export default function QuickMemoEditor({
    category,
    onPostCreated,
    editData,
    providedPassword,
    onCancelEdit,
    className = "",
    isAdmin = false
}: QuickMemoEditorProps) {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [nickname, setNickname] = useState('');
    const [password, setPassword] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [bannedWords, setBannedWords] = useState<string[]>([]);
    const [isNotice, setIsNotice] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleNoticeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        setIsNotice(checked);
        if (checked) {
            setNickname('관리자');
            // Generate random password as admin doesn't need to remember it for this post
            setPassword(Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8));
        } else {
            setNickname('');
            setPassword('');
        }
    };

    useEffect(() => {
        loadBannedWords();
    }, []);

    // Sync form with editData
    useEffect(() => {
        if (editData) {
            setTitle(editData.title || '');
            setContent(editData.content || '');
            // Support both app-state 'nickname' and DB field 'author_nickname' or 'author_name'
            setNickname(editData.nickname || editData.author_nickname || editData.author_name || '');
            setPassword(providedPassword || editData.password || '');
            setIsNotice(editData.is_notice || false);
            setIsExpanded(true); // Auto-expand when editing
        } else {
            setTitle('');
            setContent('');
            setNickname('');
            setPassword('');
            setIsNotice(false);
        }
    }, [editData, providedPassword]);

    const loadBannedWords = async () => {
        try {
            const { data } = await supabase.from('board_banned_words').select('word');
            if (data) setBannedWords(data.map(w => w.word));
        } catch (error) {
            console.error('금지어 로드 실패:', error);
        }
    };

    const checkBannedWords = (text: string) => {
        for (const word of bannedWords) {
            if (text.includes(word)) return word;
        }
        return null;
    };

    const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setImageFile(file);
            const objectUrl = URL.createObjectURL(file);
            setImagePreview(objectUrl);
        }
    };

    // Cleanup object URL on unmount or change
    useEffect(() => {
        return () => {
            if (imagePreview && imagePreview.startsWith('blob:')) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!content.trim()) {
            alert('내용을 입력해주세요.');
            return;
        }

        if (category === 'anonymous' && !nickname.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        if (category === 'anonymous' && !password.trim()) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        const bannedContent = checkBannedWords(content);
        const bannedTitle = checkBannedWords(title);
        const bannedNickname = checkBannedWords(nickname);

        if (bannedContent || bannedTitle || bannedNickname) {
            alert(`금지어("${bannedContent || bannedTitle || bannedNickname}")가 포함되어 있습니다.`);
            return;
        }

        setIsSubmitting(true);

        try {
            let imageUrls = { image: null as string | null, image_thumbnail: null as string | null };

            if (imageFile) {
                const timestamp = Date.now();
                const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.webp`;

                const fileUrl = URL.createObjectURL(imageFile);
                try {
                    const [thumbnail, medium] = await Promise.all([
                        resizeImage(fileUrl, 300, 0.7, fileName),
                        resizeImage(fileUrl, 1080, 0.75, fileName)
                    ]);

                    const uploadImage = async (path: string, file: Blob) => {
                        const { error } = await supabase.storage.from("images").upload(path, file);
                        if (error) throw error;
                        return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
                    };

                    const [thumbUrl, mainUrl] = await Promise.all([
                        retryOperation(() => uploadImage(`board-images/thumbnails/${fileName}`, thumbnail)),
                        retryOperation(() => uploadImage(`board-images/medium/${fileName}`, medium))
                    ]);
                    imageUrls.image = mainUrl;
                    imageUrls.image_thumbnail = thumbUrl;
                } finally {
                    URL.revokeObjectURL(fileUrl);
                }
            }

            if (editData?.id) {
                // Update post
                console.log('Updating anonymous post via RPC');
                const { data: success, error } = await supabase.rpc('update_anonymous_post_with_password', {
                    p_post_id: editData.id,
                    p_password: (providedPassword || password).trim(),
                    p_title: title.trim(),
                    p_content: content.trim(),
                    p_author_name: nickname,
                    p_image: imageUrls.image,
                    p_image_thumbnail: imageUrls.image_thumbnail
                });

                if (error) {
                    console.error('RPC Error:', error);
                    throw error;
                }
                if (!success) {
                    alert('비밀번호가 틀렸거나 수정에 실패했습니다.');
                    setIsSubmitting(false);
                    return;
                }
                alert('메모가 수정되었습니다!');
            } else {
                // Create new post
                const { error } = await supabase.from('board_anonymous_posts').insert({
                    title: title.trim(),
                    content: content.trim(),
                    author_name: nickname,
                    author_nickname: nickname,
                    password: password.trim(),
                    image: imageUrls.image,
                    image_thumbnail: imageUrls.image_thumbnail,
                    views: 0,
                    likes: 0,
                    dislikes: 0,
                    is_notice: isNotice,
                    is_hidden: false
                });

                if (error) {
                    console.error('Insert Error:', error);
                    throw error;
                }
                alert('메모가 등록되었습니다!');
            }

            // Reset
            setTitle('');
            setContent('');
            setNickname('');
            setPassword('');
            setIsNotice(false);
            setImageFile(null);
            setImagePreview(null);
            onPostCreated?.();
        } catch (error) {
            console.error('메모 등록 실패:', error);
            alert('등록 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
            if (!editData) setIsExpanded(false);
        }
    };

    const handleDelete = async () => {
        if (!editData?.id) return;

        if (!window.confirm('정말로 이 메모를 삭제하시겠습니까?')) {
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: success, error } = await supabase.rpc('delete_anonymous_post_with_password', {
                p_post_id: editData.id,
                p_password: (providedPassword || password).trim()
            });

            if (error) throw error;

            if (!success) {
                alert('비밀번호가 틀렸거나 삭제에 실패했습니다.');
                return;
            }

            alert('메모가 삭제되었습니다.');
            onPostCreated?.();
        } catch (error) {
            console.error('삭제 실패:', error);
            alert('삭제 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        if (editData) {
            onCancelEdit?.();
        } else {
            setIsExpanded(false);
            setTitle('');
            setContent('');
            setImageFile(null);
            setImagePreview(null);
        }
    };

    return (
        <div className={`quick-memo-editor ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}>
            {!isExpanded && !editData && (
                <div
                    className="memo-trigger-bar"
                    onClick={() => setIsExpanded(true)}
                >
                    <span>글쓰기 +</span>
                </div>
            )}

            <form onSubmit={handleSubmit} className="memo-form">
                <div className="memo-header">
                    <div className="memo-header-top">
                        <div className="memo-left-actions">
                            {isAdmin && !editData && (
                                <label className="memo-notice-check" style={{ marginRight: '8px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#fbbf24' }}>
                                    <input
                                        type="checkbox"
                                        checked={isNotice}
                                        onChange={handleNoticeChange}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <span>공지</span>
                                </label>
                            )}
                            <input
                                type="text"
                                placeholder="작성자 닉네임"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="memo-nickname-input"
                                readOnly={isNotice}
                                style={isNotice ? { backgroundColor: '#333', color: '#fbbf24', fontWeight: 'bold' } : {}}
                            />
                            {/* {editData && (
                                <span className="memo-edit-badge">Editing Mode</span>
                            )} */}
                        </div>
                        <div className="memo-right-actions">
                            <button
                                type="button"
                                className="memo-image-btn"
                                title="이미지 첨부"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <i className="ri-image-add-fill"></i>
                            </button>
                        </div>
                    </div>

                    <input
                        type="text"
                        placeholder="메모 제목 (생략 가능)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="memo-title-input"
                    />

                    <textarea
                        placeholder={"무슨 생각을 하고 계신가요? 자유롭게 익명으로 남겨보세요...\n(자정작용을 위해 싫어요 2개가 넘으면 자동숨김됩니다)"}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="memo-textarea"
                        autoFocus={!!editData || isExpanded}
                    />

                    {imagePreview && (
                        <div className="memo-preview-area">
                            <img src={imagePreview} alt="Preview" />
                            <button
                                type="button"
                                onClick={() => { setImageFile(null); setImagePreview(null); }}
                                className="remove-preview"
                                title="이미지 제거"
                            >
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                    )}
                </div>

                <div className="memo-bottom-row">
                    <div className="memo-password-section">
                        {!providedPassword && (
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="memo-password-input"
                                required={!isNotice}
                                style={isNotice ? { display: 'none' } : {}}
                            />
                        )}
                    </div>

                    <div className="memo-submit-actions">
                        {editData && (
                            <button
                                type="button"
                                className="memo-delete-btn"
                                onClick={handleDelete}
                                disabled={isSubmitting}
                            >
                                삭제
                            </button>
                        )}
                        {(isExpanded || editData) && (
                            <button
                                type="button"
                                className="memo-cancel-btn"
                                onClick={handleCancel}
                            >
                                취소
                            </button>
                        )}
                        <button
                            type="submit"
                            className="memo-submit-btn"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <i className="ri-loader-4-line spin"></i>
                                    <span>처리 중...</span>
                                </>
                            ) : (
                                <>
                                    <i className={editData ? "ri-check-double-line" : "ri-quill-pen-line"}></i>
                                    <span>{editData ? '수정 완료' : '메모 남기기'}</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <input
                    type="file"
                    hidden
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageSelect}
                />
            </form>
        </div>
    );
}
