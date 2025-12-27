import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import './comment.css';

interface CommentFormProps {
    postId: number;
    category: string;
    onCommentAdded: (comment?: any) => void;
    editingComment?: BoardComment | null;
    onCancelEdit?: () => void;
    providedPassword?: string;
    disabled?: boolean;
}

export default function CommentForm({ postId, category, onCommentAdded, editingComment, onCancelEdit, providedPassword, disabled }: CommentFormProps) {
    const { user } = useAuth();
    const [content, setContent] = useState(editingComment?.content || '');
    const [authorName, setAuthorName] = useState(editingComment?.author_name || '');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bannedWords, setBannedWords] = useState<string[]>([]);

    const isAnonymousRoom = category === 'anonymous';

    // Load banned words
    useEffect(() => {
        const loadBannedWords = async () => {
            const { data } = await supabase.from('board_banned_words').select('word');
            if (data) setBannedWords(data.map(w => w.word));
        };
        loadBannedWords();
    }, []);

    // Sync state when editingComment changes
    useEffect(() => {
        if (editingComment) {
            setContent(editingComment.content);
            setAuthorName(editingComment.author_name || '');
        } else {
            setContent('');
            setAuthorName('');
        }
    }, [editingComment]);

    const checkBannedWords = (text: string) => {
        for (const word of bannedWords) {
            if (text.includes(word)) return word;
        }
        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!content.trim()) return;

        // Banned word check
        const banned = checkBannedWords(content);
        if (banned) {
            alert(`금지어("${banned}")가 포함되어 있습니다.`);
            return;
        }

        if (isAnonymousRoom && !authorName.trim()) {
            alert('닉네임을 입력해주세요.');
            return;
        }

        if (isAnonymousRoom && !password.trim() && !providedPassword) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        if (!isAnonymousRoom && !user) {
            alert('로그인이 필요합니다.');
            return;
        }

        try {
            setIsSubmitting(true);
            const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';
            let resultComment = null;

            if (editingComment) {
                // Update existing comment
                let data, error;
                if (category === 'anonymous') {
                    // Update via standard query with password filter
                    const result = await supabase
                        .from(table)
                        .update({
                            content: content.trim(),
                            author_name: authorName
                        })
                        .eq('id', editingComment.id)
                        .eq('password', providedPassword || password.trim())
                        .select();
                    data = result.data;
                    error = result.error;

                    if (error) throw error;
                    if (!data || data.length === 0) {
                        alert('비밀번호가 일치하지 않거나 수정 권한이 없습니다.');
                        return;
                    }
                    resultComment = data[0];
                } else {
                    const result = await supabase
                        .from(table)
                        .update({
                            content: content.trim()
                            // Skip updated_at if not sure it exists
                        })
                        .eq('id', editingComment.id)
                        .select(); // Ensure we select return data
                    data = result.data;
                    error = result.error;

                    if (error) throw error;
                    resultComment = data ? data[0] : null;
                }
            } else {
                // Create new comment
                const commentData: any = {
                    post_id: postId,
                    content: content.trim(),
                    author_name: category === 'anonymous' ? authorName : user?.user_metadata?.nickname || user?.email,
                };

                // Add optional fields conditionally
                if (category === 'anonymous') {
                    commentData.password = password.trim() || null;
                } else {
                    commentData.user_id = user?.id;
                    commentData.password = null;
                }

                const { data, error } = await supabase
                    .from(table)
                    .insert(commentData)
                    .select();

                if (error) throw error;
                resultComment = data ? data[0] : null;
            }

            setContent('');
            if (category === 'anonymous') {
                setAuthorName('');
                setPassword('');
            }
            onCommentAdded(resultComment);
            if (onCancelEdit) onCancelEdit();
        } catch (error) {
            console.error('댓글 작성/수정 실패:', error);
            alert('댓글 작성/수정 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLoginClick = () => {
        window.dispatchEvent(new CustomEvent('requestProtectedAction', {
            detail: {
                action: () => {
                    console.log('[CommentForm] Login/Registration successful');
                }
            }
        }));
    };

    if (!user && !isAnonymousRoom) {
        return (
            <div className="comment-form-login-required" onClick={handleLoginClick} style={{ cursor: 'pointer' }}>
                <div className="comment-login-content">
                    <i className="ri-chat-3-line"></i>
                    <p>댓글을 작성하려면 로그인이 필요합니다</p>
                </div>
                <button className="comment-login-btn">
                    <i className="ri-kakao-talk-fill"></i>
                    카카오 로그인
                </button>
            </div>
        );
    }

    return (
        <form className="comment-form" onSubmit={handleSubmit}>
            {isAnonymousRoom && (
                <div className="comment-anonymous-author">
                    <div className="comment-input-wrapper">
                        <i className="ri-user-line input-icon"></i>
                        <input
                            type="text"
                            placeholder="닉네임"
                            value={authorName}
                            onChange={(e) => setAuthorName(e.target.value)}
                            className="comment-author-input"
                            required
                            disabled={disabled}
                        />
                    </div>
                    {!providedPassword && (
                        <div className="comment-input-wrapper">
                            <i className="ri-lock-line input-icon"></i>
                            <input
                                type="password"
                                placeholder="비밀번호"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="comment-password-input"
                                required
                                disabled={disabled}
                            />
                        </div>
                    )}
                </div>
            )}
            <textarea
                className="comment-form-textarea"
                placeholder={disabled ? "수정 중입니다..." : "댓글을 입력하세요..."}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isSubmitting || disabled}
                rows={3}
            />
            <div className="comment-form-actions">
                {editingComment && onCancelEdit && (
                    <button
                        type="button"
                        onClick={onCancelEdit}
                        className="comment-form-btn comment-form-btn-cancel"
                        disabled={isSubmitting || disabled}
                    >
                        취소
                    </button>
                )}
                <button
                    type="submit"
                    className="comment-form-btn comment-form-btn-submit"
                    disabled={isSubmitting || !content.trim() || disabled}
                >
                    {isSubmitting ? '작성 중...' : editingComment ? '수정' : '댓글 작성'}
                </button>
            </div>
        </form>
    );
}
