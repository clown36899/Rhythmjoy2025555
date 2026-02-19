import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import LocalLoading from '../../../components/LocalLoading';
import './AdminWebzineList.css';

interface WebzinePost {
    id: number;
    title: string;
    is_published: boolean;
    created_at: string;
    views: number;
    author_id: string;
}

const AdminWebzineList = () => {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();
    const [posts, setPosts] = useState<WebzinePost[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('webzine_posts')
                .select('id, title, is_published, created_at, views, author_id')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPosts(data || []);
        } catch (err) {
            console.error('[AdminWebzineList] Failed to fetch posts:', err);
            alert('목록 로드 실패');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        navigate('/admin/webzine/new');
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('정말 삭제하시겠습니까? 복구할 수 없습니다.')) return;

        try {
            const { error } = await supabase
                .from('webzine_posts')
                .delete()
                .eq('id', id);

            if (error) throw error;
            fetchPosts(); // Reload
        } catch (err) {
            console.error('Delete failed:', err);
            alert('삭제 실패');
        }
    };

    if (!isAdmin) {
        return <div className="aw-access-denied">접근 권한이 없습니다.</div>;
    }

    if (loading) return <LocalLoading />;

    return (
        <div className="aw-container">
            <header className="aw-header">
                <div className="aw-title-group">
                    <h1 className="aw-title">웹진 관리</h1>
                    <p className="aw-subtitle">월간 빌보드 웹진 콘텐츠를 관리합니다.</p>
                </div>
                <button
                    onClick={handleCreateNew}
                    className="aw-btn-create"
                >
                    <i className="ri-edit-pen-line"></i>
                    <span>새 글 작성</span>
                </button>
            </header>

            <main className="aw-main">
                {posts.length === 0 ? (
                    <div className="aw-empty-state">
                        <p className="aw-empty-text">아직 작성된 웹진 글이 없습니다.</p>
                        <button onClick={handleCreateNew} className="aw-empty-link">
                            첫 글 작성하기
                        </button>
                    </div>
                ) : (
                    posts.map(post => (
                        <div key={post.id} className="aw-post-card">
                            <div className="aw-post-content">
                                <div className="aw-post-meta">
                                    {post.is_published ? (
                                        <span className="aw-badge aw-badge-published">Published</span>
                                    ) : (
                                        <span className="aw-badge aw-badge-draft">Draft</span>
                                    )}
                                    <span className="aw-post-id">#{post.id}</span>
                                </div>
                                <h3 className="aw-post-title" onClick={() => navigate(`/webzine/${post.id}`)}>
                                    {post.title || '(제목 없음)'}
                                </h3>

                                <div className="aw-post-info">
                                    <span>작성: {new Date(post.created_at).toLocaleString()}</span>
                                    <span>•</span>
                                    <span>조회수: {post.views}</span>
                                </div>
                            </div>

                            <div className="aw-actions">
                                <button
                                    onClick={() => window.open(`/webzine/${post.id}`, '_blank')}
                                    className="aw-action-btn aw-btn-view"
                                    title="미리보기"
                                >
                                    <i className="ri-external-link-line aw-icon-lg"></i>
                                </button>
                                <button
                                    onClick={() => navigate(`/admin/webzine/edit/${post.id}`)}
                                    className="aw-action-btn aw-btn-edit"
                                    title="수정"
                                >
                                    <i className="ri-pencil-line aw-icon-lg"></i>
                                </button>
                                <button
                                    onClick={() => handleDelete(post.id)}
                                    className="aw-action-btn aw-btn-delete"
                                    title="삭제"
                                >
                                    <i className="ri-delete-bin-line aw-icon-lg"></i>
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </main>
        </div>
    );
};

export default AdminWebzineList;
