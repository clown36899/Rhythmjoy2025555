import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { BoardComment } from '../../../lib/supabase';
import './comment.css';

interface CommentFormProps {
    postId: number;
    category: string;
    onCommentAdded: () => void;
    editingComment?: BoardComment | null;
    onCancelEdit?: () => void;
}

export default function CommentForm({ postId, category, onCommentAdded, editingComment, onCancelEdit }: CommentFormProps) {
    const { user } = useAuth();
    const [content, setContent] = useState(editingComment?.content || '');
    const [authorName, setAuthorName] = useState('');
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
        } else {
            setContent('');
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

        if (isAnonymousRoom && !password.trim()) {
            alert('비밀번호를 입력해주세요.');
            return;
        }

        if (!isAnonymousRoom && !user) {
            alert('로그인이 필요합니다.');
            return;
        }

        try {
            setIsSubmitting(true);


            if (editingComment) {
                // Update existing comment
                const { error } = await supabase
                    .from('board_comments')
                    .update({
                        content: content.trim(),
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', editingComment.id);

                if (error) throw error;
            } else {
                // Create new comment
                const { error } = await supabase
                    .from('board_comments')
                    .insert({
                        post_id: postId,
                        content: content.trim(),
                        author_name: category === 'anonymous' ? authorName : user?.user_metadata?.nickname || user?.email,
                        user_id: category === 'anonymous' ? null : user?.id,
                        password: category === 'anonymous' ? password.trim() || null : null,
                    })
                    .select();

                if (error) throw error;
            }

            setContent('');
            if (category === 'anonymous') {
                setAuthorName('');
                setPassword('');
            }
            onCommentAdded();
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
                    <input
                        type="text"
                        placeholder="닉네임"
                        value={authorName}
                        onChange={(e) => setAuthorName(e.target.value)}
                        className="comment-author-input"
                        required
                    />
                    <input
                        type="password"
                        placeholder="비밀번호"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="comment-password-input"
                        required
                    />
                </div>
            )}
            <textarea
                className="comment-form-textarea"
                placeholder="댓글을 입력하세요..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={isSubmitting}
                rows={3}
            />
            <div className="comment-form-actions">
                {editingComment && onCancelEdit && (
                    <button
                        type="button"
                        onClick={onCancelEdit}
                        className="comment-form-btn comment-form-btn-cancel"
                        disabled={isSubmitting}
                    >
                        취소
                    </button>
                )}
                <button
                    type="submit"
                    className="comment-form-btn comment-form-btn-submit"
                    disabled={isSubmitting || !content.trim()}
                >
                    {isSubmitting ? '작성 중...' : editingComment ? '수정' : '댓글 작성'}
                </button>
            </div>
        </form>
    );
}

