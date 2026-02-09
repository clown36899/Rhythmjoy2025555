import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import '../styles/components/QuickNoticeInput.css';

export const QuickNoticeInput: React.FC = () => {
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const { user, userProfile } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!message.trim()) return;

        if (!user) {
            alert('로그인이 필요합니다.');
            return;
        }

        setSubmitting(true);
        try {
            // 1. '전광판' 말머리 ID 조회
            let prefixId = null;
            const { data: prefixData } = await supabase
                .from('board_prefixes')
                .select('id')
                .eq('board_category_code', 'free')
                .eq('name', '전광판')
                .single();

            if (prefixData) {
                prefixId = prefixData.id;
            }
            console.log('[QuickNotice] Found Prefix ID:', prefixId); // 디버깅 로그

            // 2. 게시글 등록
            // 전광판은 '자유게시판(free)' 데이터를 사용하므로 여기에 insert 합니다.
            // 제목(title)은 닉네임, 내용(content)은 입력한 메시지로 합니다.
            const { error } = await supabase
                .from('board_posts')
                .insert({
                    category: 'free',
                    title: userProfile?.nickname || user.email?.split('@')[0] || '익명',
                    content: message,
                    user_id: user.id,
                    author_name: userProfile?.nickname || user.email?.split('@')[0] || '익명',
                    is_hidden: false,
                    prefix_id: prefixId // 조회된 말머리 ID 적용
                });

            if (error) throw error;

            setMessage('');
            // 성공 시 별도 알림 없이 인풋창만 비움 (전광판에 즉시 뜨는 것을 보면 됨)
        } catch (err) {
            console.error('Failed to post quick notice:', err);
            alert('등록에 실패했습니다.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form className="quick-notice-form" onSubmit={handleSubmit}>
            <input
                type="text"
                className="quick-notice-input"
                placeholder="전광판에 띄울 한마디를 입력하세요 (로그인 필요)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={50} // 전광판용이므로 너무 길지 않게
                disabled={submitting}
            />
            <button
                type="submit"
                className="quick-notice-btn"
                disabled={submitting || !message.trim()}
            >
                {submitting ? '등록중' : '등록'}
            </button>
        </form>
    );
};
