import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import { useBoardData } from '../../../contexts/BoardDataContext';
import type { BoardPost } from '../hooks/useBoardPosts';
import type { BoardPrefix } from '../../../components/BoardPrefixManagementModal';
import { type BoardCategory } from './BoardTabBar';
// import { createResizedImages, resizeImage } from '../../../utils/imageResize';
import { resizeImage } from '../../../utils/imageResize'; // [UPDATED] Only resizeImage needed
// import { retryOperation } from '../../../utils/asyncUtils'; // [UPDATED] Unused
import { useModalHistory } from '../../../hooks/useModalHistory';
import { trackActivitySuccess } from '../../../utils/analyticsEvents';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';
import { parseBoardPrefixId, type BoardPrefixId } from '../../../utils/boardPrefixId';
import UniversalEditor from '../../../components/UniversalEditor/Core/UniversalEditor'; // [UPDATED] Import UniversalEditor
import './PostEditorModal.css';
import './UniversalPostEditor.css';

interface UniversalPostEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onPostCreated: () => void | Promise<void>;
    post?: BoardPost | null;
    userNickname?: string;
    category: BoardCategory;
    preset?: BoardEditorPreset | null;
}

export interface BoardEditorPreset {
    defaultPrefixNames?: string[];
    defaultIsHidden?: boolean;
    showHiddenOption?: boolean;
}

const findDefaultPrefixId = (prefixes: BoardPrefix[], prefixNames: string[] = []) => {
    if (prefixNames.length === 0) return null;

    const normalizedNames = prefixNames.map((name) => name.trim()).filter(Boolean);
    const exactMatch = prefixes.find((prefix) => normalizedNames.includes(prefix.name));
    if (exactMatch) return exactMatch.id;

    const partialMatch = prefixes.find((prefix) =>
        normalizedNames.some((name) => prefix.name.includes(name) || name.includes(prefix.name))
    );

    return partialMatch?.id ?? null;
};

export default function UniversalPostEditor({
    isOpen,
    onClose,
    onPostCreated,
    post,
    userNickname,
    category,
    preset = null
}: UniversalPostEditorProps) {
    useModalHistory(isOpen, onClose);

    const { isAdmin, user } = useAuth();
    const { data: boardData } = useBoardData();

    const [formData, setFormData] = useState({
        title: '',
        content: '',
        author_name: '',
        is_notice: false,
        prefix_id: null as BoardPrefixId | null,
        is_hidden: false,
        is_anonymous: false,
        category: category
    });



    // [NEW] Registry for deferred uploads
    const pendingUploads = useRef<Map<string, File>>(new Map());

    const [prefixes, setPrefixes] = useState<BoardPrefix[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState("");
    const [bannedWords, setBannedWords] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            loadBannedWords();
            pendingUploads.current.clear(); // Reset pending uploads

            if (post) {
                // Edit Mode
                const isAnonymousPost = 'is_anonymous' in post && Boolean(post.is_anonymous);
                setFormData({
                    title: post.title,
                    content: post.content || '',
                    author_name: isAdmin && !isAnonymousPost ? "관리자" : post.author_name,
                    is_notice: post.is_notice || false,
                    prefix_id: (post as any).prefix_id || null, // [FIX] Cast to any
                    is_hidden: (post as any).is_hidden || false,
                    is_anonymous: isAnonymousPost,
                    category: (post as any).category || 'free'
                });

            } else {
                // New Mode
                setFormData({
                    title: '',
                    content: '',
                    author_name: isAdmin ? "관리자" : (user?.user_metadata?.name || user?.email?.split('@')[0] || ''), // [UPDATED] Force admin name
                    is_notice: false,
                    prefix_id: null,
                    is_hidden: preset?.defaultIsHidden || false,
                    is_anonymous: false,
                    category: category
                });

            }
        } else {
            document.body.style.overflow = '';
        }

        return () => {
            document.body.style.overflow = '';
            // Cleanup pending object URLs on unmount/close
            pendingUploads.current.forEach((_, key) => URL.revokeObjectURL(key));
            pendingUploads.current.clear();
        };
    }, [isOpen, post, user, isAdmin, category, preset?.defaultIsHidden]);

    const loadBannedWords = async () => {
        try {
            const { data } = await cafe24.from('board_banned_words').select('word');
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

    useEffect(() => {
        if (!isOpen || post || formData.prefix_id || !preset?.defaultPrefixNames?.length || prefixes.length === 0) return;

        const defaultPrefixId = findDefaultPrefixId(prefixes, preset.defaultPrefixNames);
        if (!defaultPrefixId) return;

        setFormData(prev => ({
            ...prev,
            prefix_id: prev.prefix_id || defaultPrefixId
        }));
    }, [isOpen, post, formData.prefix_id, prefixes, preset]);

    const handleInputChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };



    const checkBannedWords = (text: string) => {
        for (const word of bannedWords) {
            if (text.includes(word)) return word;
        }
        return null;
    };

    // [UPDATED] Deferred Inline Image Upload Handler
    const handleInlineImageUpload = async (file: File): Promise<string> => {
        console.log('[UniversalPostEditor] Image added to queue (deferred upload). File:', file.name);
        const objectUrl = URL.createObjectURL(file);
        pendingUploads.current.set(objectUrl, file);
        return objectUrl;
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

        // Edit permission check
        // [FIX] Checking user_id needs casting because AnonymousBoardPost doesn't have it (logic relies on it being undefined for anon)
        if (post && !isAdmin && (post as any).user_id !== user?.id) {
            // Standard posts must be edited by owner or admin
            if (!(post as any).user_id) {
                // This shouldn't happen for standard posts, but just in case
                alert('수정 권한이 없습니다.');
                return;
            }
            if ((post as any).user_id !== user.id) {
                alert('본인이 작성한 글만 수정할 수 있습니다.');
                return;
            }
        }

        setIsSubmitting(true);
        setLoadingMessage("저장 중...");

        try {
            // 0. Process Content Images (Deferred Upload)
            let finalContent = formData.content;

            // Check if content contains any blob URLs from our pending list
            const pendingMap = pendingUploads.current;
            if (pendingMap.size > 0) {
                // Convert map entries to array for async iteration
                const entries = Array.from(pendingMap.entries());

                for (const [blobUrl, file] of entries) {
                    // Check if this blobUrl is actually used in the current content
                    if (finalContent.includes(blobUrl)) {
                        setLoadingMessage(`이미지 업로드 중... (${file.name})`);

                        const timestamp = Date.now();
                        const randomString = Math.random().toString(36).substring(2, 10);
                        const fileName = `${timestamp}_${randomString}.webp`;

                        // Create temp ObjectURL for resizing (needs to be fresh or reuse existing)
                        // We can reuse the blobUrl since it points to the file
                        const resizeResult = await resizeImage(blobUrl, 800, 0.8, fileName);

                        const { error } = await cafe24.storage.from("images").upload(`board-images/content/${fileName}`, resizeResult);
                        if (error) {
                            console.error('Failed to upload inline image:', file.name, error);
                            throw error;
                        }

                        const publicUrl = cafe24.storage.from("images").getPublicUrl(`board-images/content/${fileName}`).data.publicUrl;

                        // Replace all occurrences of the blob URL with the real public URL
                        finalContent = finalContent.replaceAll(blobUrl, publicUrl);
                    }
                }
            }
            finalContent = sanitizeHtml(finalContent);

            const imageUrls = {
                image: null as string | null,
                image_thumbnail: null as string | null,
            };

            // [UPDATED] Auto-extract thumbnail from content instead of manual upload
            if (finalContent) {
                // Simple regex to find the first image src
                const imgMatch = finalContent.match(/<img[^>]+src="([^">]+)"/);
                if (imgMatch && imgMatch[1]) {
                    imageUrls.image = imgMatch[1];
                    imageUrls.image_thumbnail = imgMatch[1]; // Use same image for thumbnail (content images are already resized ~800px)
                }
            }

            // Remove legacy imageFile logic
            setLoadingMessage("글 저장 중...");

            if (post) {
                const updates: any = {
                    title: formData.title,
                    content: finalContent, // Use processed content
                    is_notice: formData.is_notice,
                    prefix_id: formData.prefix_id,
                    is_hidden: formData.is_hidden,
                    is_anonymous: formData.is_anonymous,
                    category: formData.category,
                    updated_at: new Date().toISOString()
                };

                // Preserve the stored writer when an admin edits an anonymous or formerly anonymous post.
                const wasAnonymous = 'is_anonymous' in post && Boolean(post.is_anonymous);
                if (isAdmin && !wasAnonymous && !formData.is_anonymous) {
                    updates.author_name = "관리자";
                    updates.author_nickname = "관리자";
                }

                // [UPDATED] Auto-sync thumbnail with content
                updates.image = imageUrls.image;
                updates.image_thumbnail = imageUrls.image_thumbnail;

                const { error } = await cafe24
                    .from('board_posts')
                    .update(updates)
                    .eq('id', post.id);

                if (error) throw error;
                trackActivitySuccess({
                    id: post.id,
                    type: 'board_post_update',
                    title: formData.title,
                    section: 'board',
                    category: formData.category,
                    userId: user?.id,
                    isAdmin,
                });
                alert('게시글이 수정되었습니다!');

            } else {
                let currentNickname = userNickname;
                if (!currentNickname && user?.id) {
                    const { data: ud } = await cafe24.from('board_users').select('nickname').eq('user_id', user.id).maybeSingle();
                    currentNickname = ud?.nickname;
                }

                // [UPDATED] Force "관리자" for admin posts
                const finalAuthorName = isAdmin ? "관리자" : (formData.author_name || user?.user_metadata?.name || "사용자");
                const finalNickname = isAdmin ? "관리자" : (currentNickname || formData.author_name || "사용자");

                const newPost = {
                    title: formData.title,
                    content: finalContent, // Use processed content
                    author_name: finalAuthorName,
                    author_nickname: finalNickname,
                    user_id: user?.id,
                    is_notice: formData.is_notice,
                    prefix_id: formData.prefix_id,
                    category: formData.category,
                    is_hidden: formData.is_hidden,
                    is_anonymous: formData.is_anonymous,
                    image: imageUrls.image,
                    image_thumbnail: imageUrls.image_thumbnail,
                    views: 0
                };

                const { data: insertedPost, error } = await cafe24
                    .from('board_posts')
                    .insert([newPost])
                    .select('id')
                    .maybeSingle();

                if (error) throw error;
                trackActivitySuccess({
                    id: insertedPost?.id || 'new',
                    type: 'board_post_create',
                    title: formData.title,
                    section: 'board',
                    category: formData.category,
                    userId: user?.id,
                    isAdmin,
                });


                alert('게시글이 등록되었습니다!');
            }

            await onPostCreated();
            onClose();

        } catch (error) {
            console.error('게시글 저장 실패:', error);
            alert('게시글 저장 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const showAnonymousOption = formData.category === 'free' || Boolean(post && formData.is_anonymous);
    const showHiddenOption = formData.category === 'free' || Boolean(preset?.showHiddenOption) || Boolean(post && formData.is_hidden);
    const showPostOptions = isAdmin || showAnonymousOption || showHiddenOption;

    const modalContent = (
        <div className="pem-modal-overlay">
            <div className="pem-modal-container universal-editor-container">
                <div className="pem-modal-header">
                    <button type="button" onClick={onClose} className="pem-close-btn" aria-label="글쓰기 닫기">
                        <i className="ri-arrow-left-line pem-close-icon"></i>
                    </button>
                    <div className="pem-modal-heading">
                        <h2 className="pem-modal-title">
                            {post
                                ? '게시글 수정'
                                : formData.category === 'market'
                                    ? '벼룩시장 글쓰기'
                                    : '자유게시판 글쓰기'}
                        </h2>
                        <p className="pem-modal-subtitle">제목과 내용을 작성한 뒤 게시 옵션을 확인해주세요.</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="pem-form">
                    <div className="pem-form-content">
                        <div className="pem-form-group">
                            <label className="pem-label" htmlFor="board-post-title">제목</label>
                            <input
                                id="board-post-title"
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                required
                                className="pem-input"
                                placeholder="제목을 입력하세요"
                            />
                        </div>

                        <div className="pem-form-row">
                            <div className="pem-form-group">
                                <label className="pem-label" htmlFor="board-post-prefix">머릿말</label>
                                <select
                                    id="board-post-prefix"
                                    value={formData.prefix_id || ''}
                                    name="prefix_id"
                                    onChange={(e) => setFormData(prev => ({ ...prev, prefix_id: parseBoardPrefixId(e.target.value) }))}
                                    className="pem-select lang-ko-only"
                                    disabled={formData.is_notice}
                                >
                                    <option value="">머릿말 없음</option>
                                    {prefixes.filter((p: any) => !p.admin_only).map((p: any) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <select
                                    aria-label="Heading"
                                    value={formData.prefix_id || ''}
                                    name="prefix_id"
                                    onChange={(e) => setFormData(prev => ({ ...prev, prefix_id: parseBoardPrefixId(e.target.value) }))}
                                    className="pem-select lang-en-only"
                                    disabled={formData.is_notice}
                                >
                                    <option value="">No heading</option>
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
                            </div>
                            {!post && (
                                <div className="pem-form-group">
                                    <label className="pem-label" htmlFor="board-post-author">작성자</label>
                                    <input
                                        id="board-post-author"
                                        type="text"
                                        name="author_name"
                                        value={formData.author_name}
                                        onChange={handleInputChange}
                                        required
                                        className="pem-input"
                                        placeholder="작성자 이름"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="pem-form-group pem-editor-group">
                            <label className="pem-label">내용</label>
                            <UniversalEditor
                                content={formData.content}
                                onChange={(html) => setFormData(prev => ({ ...prev, content: html }))}
                                placeholder="내용을 입력하세요..."
                                onImageUpload={handleInlineImageUpload}
                            />
                        </div>

                        {showPostOptions && (
                            <fieldset className="pem-options-group">
                                <legend className="pem-options-title">게시 옵션</legend>
                                <div className="pem-options-list">
                                    {showAnonymousOption && (
                                        <label className={`pem-option-card ${formData.is_anonymous ? 'is-selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={formData.is_anonymous}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    is_anonymous: e.target.checked
                                                }))}
                                            />
                                            <span className="pem-option-icon" aria-hidden="true">
                                                <i className="ri-spy-line"></i>
                                            </span>
                                            <span className="pem-option-copy">
                                                <span className="pem-option-name">익명으로 등록</span>
                                                <span className="pem-option-description">글은 모두 볼 수 있고, 작성자 정보는 관리자만 확인할 수 있습니다.</span>
                                            </span>
                                            <span className="pem-option-check" aria-hidden="true">
                                                <i className={formData.is_anonymous ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}></i>
                                            </span>
                                        </label>
                                    )}

                                    {showHiddenOption && (
                                        <label className={`pem-option-card ${formData.is_hidden ? 'is-selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={formData.is_hidden}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    is_hidden: e.target.checked
                                                }))}
                                            />
                                            <span className="pem-option-icon" aria-hidden="true">
                                                <i className="ri-lock-line"></i>
                                            </span>
                                            <span className="pem-option-copy">
                                                <span className="pem-option-name">비공개로 등록</span>
                                                <span className="pem-option-description">글 내용까지 작성자와 관리자만 볼 수 있습니다.</span>
                                            </span>
                                            <span className="pem-option-check" aria-hidden="true">
                                                <i className={formData.is_hidden ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}></i>
                                            </span>
                                        </label>
                                    )}

                                    {isAdmin && (
                                        <label className={`pem-option-card ${formData.is_notice ? 'is-selected' : ''}`}>
                                            <input
                                                type="checkbox"
                                                checked={formData.is_notice}
                                                onChange={(e) => setFormData(prev => ({
                                                    ...prev,
                                                    is_notice: e.target.checked,
                                                    prefix_id: e.target.checked ? 1 : prev.prefix_id
                                                }))}
                                            />
                                            <span className="pem-option-icon" aria-hidden="true">
                                                <i className="ri-megaphone-line"></i>
                                            </span>
                                            <span className="pem-option-copy">
                                                <span className="pem-option-name">공지사항으로 등록</span>
                                                <span className="pem-option-description">게시판 상단에 공지로 표시합니다.</span>
                                            </span>
                                            <span className="pem-option-check" aria-hidden="true">
                                                <i className={formData.is_notice ? 'ri-checkbox-circle-fill' : 'ri-checkbox-blank-circle-line'}></i>
                                            </span>
                                        </label>
                                    )}
                                </div>
                            </fieldset>
                        )}

                    </div>

                    <div className="pem-modal-footer">
                        <button type="button" onClick={onClose} className="pem-btn pem-btn-cancel">취소</button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="pem-btn pem-btn-submit"
                        >
                            {isSubmitting ? (loadingMessage || '저장 중...') : post ? '수정 완료' : '등록하기'}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
}
