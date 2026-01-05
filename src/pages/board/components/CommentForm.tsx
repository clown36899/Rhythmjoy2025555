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
    const { user, isAdmin, signOut } = useAuth();
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

        if (isAnonymousRoom && !password.trim() && !providedPassword && !isAdmin) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        if (!isAnonymousRoom && !user) {
            alert('로그인이 필요합니다.');
            return;
        }

        const finalPassword = (providedPassword || password).trim();

        try {
            setIsSubmitting(true);
            const table = category === 'anonymous' ? 'board_anonymous_comments' : 'board_comments';
            let resultComment = null;

            if (editingComment) {
                // Update existing comment
                if (category === 'anonymous') {
                    if (isAdmin) {
                        const { data: adminData, error: adminError } = await supabase
                            .from(table)
                            .update({
                                content: content.trim(),
                                author_name: authorName
                            })
                            .eq('id', editingComment.id)
                            .select();
                        if (adminError) throw adminError;
                        resultComment = adminData ? adminData[0] : null;
                    } else {
                        // User update: Use RPC to bypass RLS with password
                        const { data: success, error: rpcError } = await supabase.rpc('update_anonymous_comment_with_password', {
                            p_comment_id: editingComment.id,
                            p_password: finalPassword,
                            p_content: content.trim(),
                            p_author_name: authorName
                        });

                        if (rpcError) throw rpcError;
                        if (!success) {
                            alert('비밀번호가 일치하지 않거나 수정 권한이 없습니다.');
                            setIsSubmitting(false);
                            return;
                        }

                        // Fetch updated comment for local UI update
                        const { data: updated } = await supabase
                            .from(table)
                            .select('*')
                            .eq('id', editingComment.id)
                            .maybeSingle();
                        resultComment = updated;
                    }
                } else {
                    const { data, error } = await supabase
                        .from(table)
                        .update({ content: content.trim() })
                        .eq('id', editingComment.id)
                        .select();

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
            if (resultComment) {
                onCommentAdded(resultComment);
            }
            if (onCancelEdit) onCancelEdit();
        } catch (error) {
            console.error('댓글 작성/수정 실패:', error);
            alert('댓글 작성/수정 중 오류가 발생했습니다.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLoginClick = (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        console.log('[CommentForm] Login clicked, category:', category);
        window.dispatchEvent(new CustomEvent('requestProtectedAction', {
            detail: {
                action: () => {
                    console.log('[CommentForm] Login/Registration successful');
                }
            }
        }));
    };

    // Anonymous room: Logged-in users cannot write comments (same pattern as QuickMemoEditor)
    if (user && isAnonymousRoom && !isAdmin) {
        const handleLogout = () => {
            const shouldLogout = window.confirm("로그인 상태에서는 댓글을 쓸 수 없습니다.\n익명 댓글을 작성하려면 로그아웃 해주세요.\n\n[확인]을 누르면 로그아웃 됩니다.");
            if (shouldLogout) {
                // Save current comment state before logout (already saved by toggleComments)
                signOut();
            }
        };

        return (
            <div className="comment-form-login-required">
                <div className="comment-login-content">
                    <i className="ri-user-forbid-line"></i>
                    <p>익명 댓글은 로그아웃 상태에서만 작성할 수 있습니다</p>
                </div>
                <button className="comment-login-btn" onClick={handleLogout}>
                    <i className="ri-logout-box-line"></i>
                    로그아웃
                </button>
            </div>
        );
    }

    // Standard room: Non-logged-in users need to login
    if (!user && !isAnonymousRoom) {
        return (
            <div className="comment-form-login-required" onClick={handleLoginClick} style={{ cursor: 'pointer' }}>
                <div className="comment-login-content">
                    <i className="ri-chat-3-line"></i>
                    <p>댓글을 작성하려면 로그인이 필요합니다</p>
                </div>
                <button className="comment-login-btn" onClick={handleLoginClick}>
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
                                required={!isAdmin}
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
