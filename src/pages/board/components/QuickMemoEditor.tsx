import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
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
    const [isExpanded, setIsExpanded] = useState(true);
    const [bannedWords, setBannedWords] = useState<string[]>([]);
    const [isNotice, setIsNotice] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Auth Check for Anonymous Board
    const { user, signOut } = useAuth(); // Import useAuth hook at top if not present, or pass as prop
    // Since useAuth is context, we should import it.

    // Effect early return for logged in users on mount/expand
    useEffect(() => {
        if (user && category === 'anonymous' && !isAdmin && !editData) {
            // Prevent editing/writing if logged in
            // Using setTimeout to avoid render loop issues or to let modal open first
            const timer = setTimeout(() => {
                const shouldLogout = window.confirm("로그인 상태에서는 글을 쓸 수 없습니다.\n익명 글을 작성하려면 로그아웃 해주세요.\n\n[확인]을 누르면 로그아웃 됩니다.");
                if (shouldLogout) {
                    signOut();
                } else {
                    onCancelEdit?.(); // Close modal or collapse
                    if (className.includes('modal-mode')) {
                        // If in modal, close it
                        const closeBtn = document.querySelector('.anonymous-modal-close') as HTMLElement;
                        if (closeBtn) closeBtn.click();
                    } else {
                        setIsExpanded(false);
                    }
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [user, category, isAdmin, editData]);

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

        if (category === 'anonymous' && !password.trim() && !isAdmin) {
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
                        resizeImage(fileUrl, 650, 0.75, fileName)
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
                if (isAdmin) {
                    // Admin update (Direct DB update, bypass RPC password check)
                    console.log('Updating anonymous post as Admin (Direct)');
                    const updates: any = {
                        title: title.trim(),
                        content: content.trim(),
                        author_name: nickname,
                        author_nickname: nickname,
                        is_notice: isNotice
                    };
                    if (imageUrls.image) {
                        updates.image = imageUrls.image;
                        updates.image_thumbnail = imageUrls.image_thumbnail;
                    }

                    const { error } = await supabase
                        .from('board_anonymous_posts')
                        .update(updates)
                        .eq('id', editData.id);

                    if (error) {
                        console.error('Admin Update Error:', error);
                        throw error;
                    }
                    alert('관리자 권한으로 메모가 수정되었습니다!');
                } else {
                    // User update: Use RPC to bypass RLS with password
                    const finalPassword = (providedPassword || password).trim();
                    const { data: success, error } = await supabase.rpc('update_anonymous_post_with_password', {
                        p_post_id: editData.id,
                        p_password: finalPassword,
                        p_title: title.trim(),
                        p_content: content.trim(),
                        p_nickname: nickname,
                        p_image: imageUrls.image,
                        p_image_thumbnail: imageUrls.image_thumbnail
                    });

                    if (error) {
                        console.error('Update Error:', error);
                        throw error;
                    }

                    if (!success) {
                        alert('비밀번호가 틀렸거나 수정에 실패했습니다.');
                        setIsSubmitting(false);
                        return;
                    }
                    alert('메모가 수정되었습니다!');
                }
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
            if (isAdmin) {
                // Admin delete (Direct DB delete)
                console.log('Deleting anonymous post as Admin');
                const { error } = await supabase
                    .from('board_anonymous_posts')
                    .delete()
                    .eq('id', editData.id);

                if (error) throw error;
                alert('관리자 권한으로 메모가 삭제되었습니다.');
            } else {
                // User delete (RPC)
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
            }
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
                <div className="memo-top-bar">
                    <div className="memo-author-info">
                        {isAdmin && !editData && (
                            <label className="memo-notice-check">
                                <input
                                    type="checkbox"
                                    checked={isNotice}
                                    onChange={handleNoticeChange}
                                />
                                <span>공지</span>
                            </label>
                        )}
                        <input
                            type="text"
                            placeholder="닉네임"
                            value={nickname}
                            onChange={(e) => setNickname(e.target.value)}
                            className="memo-input-compact"
                            readOnly={isNotice}
                        />
                        {!providedPassword && !isNotice && (
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="memo-input-compact"
                            />
                        )}
                    </div>
                </div>

                <div className="memo-main-input-area">
                    <input
                        type="text"
                        placeholder="제목 (선택사항)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="memo-title-input"
                    />
                    <textarea
                        placeholder={"익명으로 자유롭게 이야기해보세요...\n(신고 누적시 자동 숨김처리)"}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="memo-textarea"
                        autoFocus={!!editData}
                    />

                    {imagePreview && (
                        <div className="memo-preview-area">
                            <img src={imagePreview} alt="Preview" />
                            <button
                                type="button"
                                onClick={() => { setImageFile(null); setImagePreview(null); }}
                                className="remove-preview"
                            >
                                <i className="ri-close-line"></i>
                            </button>
                        </div>
                    )}
                </div>

                <div className="memo-action-bar">
                    <button
                        type="button"
                        className="memo-icon-btn"
                        onClick={() => fileInputRef.current?.click()}
                        title="이미지 첨부"
                    >
                        <i className="ri-image-add-line"></i>
                    </button>

                    <div className="memo-submit-group">
                        {editData && (
                            <button
                                type="button"
                                className="memo-text-btn delete"
                                onClick={handleDelete}
                                disabled={isSubmitting}
                            >
                                삭제
                            </button>
                        )}
                        {(isExpanded || editData) && (
                            <button
                                type="button"
                                className="memo-text-btn"
                                onClick={handleCancel}
                            >
                                취소
                            </button>
                        )}
                        <button
                            type="submit"
                            className="memo-submit-btn-compact"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? <i className="ri-loader-4-line spin"></i> : <i className="ri-send-plane-fill"></i>}
                            <span>{editData ? '수정' : '등록'}</span>
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
