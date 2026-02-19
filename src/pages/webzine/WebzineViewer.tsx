import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import LocalLoading from '../../components/LocalLoading';
import MonthlyWebzine from '../v2/components/MonthlyBillboard/MonthlyWebzine';
import SwingSceneStats from '../v2/components/SwingSceneStats';
import MyImpactCard from '../user/components/MyImpactCard';
import './WebzineViewer.css';

interface WebzinePost {
    id: number;
    title: string;
    subtitle: string | null;
    content: any;
    cover_image: string | null;
    author_id: string;
    created_at: string;
    views: number;
    is_published: boolean;
}

const WebzineViewer = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, isAdmin } = useAuth();
    const [post, setPost] = useState<WebzinePost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPost = async () => {
            if (!id) return;

            try {
                // 1. Fetch Post
                const { data, error } = await supabase
                    .from('webzine_posts')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;

                // If not published and not admin/author, deny access
                if (data && !data.is_published && !isAdmin && user?.id !== data.author_id) {
                    alert('공개되지 않은 게시글입니다.');
                    navigate(-1);
                    return;
                }

                setPost(data);

                // 2. Increment Views (Simple implementation)
                await supabase.rpc('increment_webzine_view', { row_id: id });

            } catch (err) {
                console.error('[WebzineViewer] Failed to load post:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPost();
    }, [id, isAdmin, user, navigate]);

    // Simple Tiptap JSON Renderer
    const renderContent = (content: any) => {
        if (!content || !content.content) return null;

        return content.content.map((node: any, idx: number) => {
            const renderMarks = (textNode: any) => {
                let element = <span>{textNode.text}</span>;
                if (textNode.marks) {
                    textNode.marks.forEach((mark: any) => {
                        if (mark.type === 'bold') element = <strong>{element}</strong>;
                        if (mark.type === 'italic') element = <em>{element}</em>;
                        if (mark.type === 'underline') element = <u style={{ textDecoration: 'underline' }}>{element}</u>;
                        if (mark.type === 'link') element = <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer" className="wv-link">{element}</a>;
                    });
                }
                return <React.Fragment key={idx + '_' + Math.random()}>{element}</React.Fragment>;
            };

            const nodeContent = node.content?.map((child: any) => {
                if (child.type === 'text') return renderMarks(child);
                return null;
            });

            switch (node.type) {
                case 'heading':
                    const level = node.attrs?.level || 1;
                    const HeadingTag = `h${level}` as any;
                    return <HeadingTag key={idx} className={`wv-heading-${level}`}>{nodeContent}</HeadingTag>;
                case 'paragraph':
                    return <p key={idx} className="wv-paragraph">{nodeContent}</p>;
                case 'bulletList':
                    return (
                        <ul key={idx} className="wv-list">
                            {node.content?.map((li: any, lidx: number) => (
                                <li key={lidx}>{li.content?.[0]?.content?.map((c: any) => renderMarks(c))}</li>
                            ))}
                        </ul>
                    );
                case 'orderedList':
                    return (
                        <ol key={idx} className="wv-list">
                            {node.content?.map((li: any, lidx: number) => (
                                <li key={lidx}>{li.content?.[0]?.content?.map((c: any) => renderMarks(c))}</li>
                            ))}
                        </ol>
                    );
                case 'image':
                    return (
                        <div key={idx} className="wv-image-node">
                            <img src={node.attrs?.src} alt={node.attrs?.alt || ''} />
                            {node.attrs?.title && <p className="wv-image-caption">{node.attrs.title}</p>}
                        </div>
                    );
                case 'statsNode':
                    return (
                        <div key={idx} className="wv-stats-container">
                            {renderStatsItem(node.attrs)}
                        </div>
                    );
                default:
                    return null;
            }
        });
    };

    const renderStatsItem = (attrs: any) => {
        const { type, config } = attrs;

        // 1. Scene Stats
        if (type.startsWith('scene-')) {
            const section = type.replace('scene-', '') as any;
            return <SwingSceneStats section={section} />;
        }

        // 2. Monthly Billboard
        if (['lifecycle', 'hourly-pattern', 'lead-time', 'top-20'].includes(type)) {
            return <MonthlyWebzine section={type as any} />;
        }

        // 3. My Impact
        if (type.startsWith('my-')) {
            const section = type.replace('my-impact-', '').replace('my-', '') as any;
            // Note: MyImpactCard still needs actual data if we want to show it in the viewer
            // For now, we'll keep the placeholder or try to load contextually if it's the author's own view
            return (
                <div className="wv-stats-placeholder">
                    <i className="ri-user-heart-fill"></i>
                    <span>[{attrs.name}] - 작성자의 활동 데이터가 렌더링됩니다.</span>
                </div>
            );
        }

        return <div className="wv-stats-placeholder">Unknown Stats: {type}</div>;
    };

    if (loading) return <LocalLoading />;

    if (!post) {
        return (
            <div className="wv-container">
                <div style={{ textAlign: 'center', padding: '100px 20px' }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>게시글을 찾을 수 없습니다.</h2>
                    <button onClick={() => navigate(-1)} className="wv-btn-edit" style={{ margin: '0 auto' }}>
                        뒤로가기
                    </button>
                </div>
            </div>
        );
    }

    const canEdit = isAdmin || user?.id === post.author_id;

    return (
        <div className="wv-container">
            {/* Navigation & Controls */}
            <button className="wv-back-btn" onClick={() => navigate(-1)}>
                <i className="ri-arrow-left-line"></i>
            </button>

            {canEdit && (
                <div className="wv-admin-bar">
                    <button className="wv-btn-edit" onClick={() => navigate(`/admin/webzine/edit/${post.id}`)}>
                        <i className="ri-pencil-line"></i>
                        <span>편집하기</span>
                    </button>
                </div>
            )}

            {/* Hero Section */}
            <div className="wv-hero">
                {post.cover_image ? (
                    <img src={post.cover_image} alt={post.title} className="wv-cover-img" />
                ) : (
                    <div className="wv-cover-placeholder">
                        <span className="wv-placeholder-text">No Cover</span>
                    </div>
                )}
                <div className="wv-hero-overlay" />

                <div className="wv-hero-content">
                    <h1 className="wv-title">{post.title}</h1>
                    {post.subtitle && <p className="wv-subtitle">{post.subtitle}</p>}
                    <div className="wv-meta">
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>조회 {post.views}</span>
                        {!post.is_published && <span style={{ color: '#ef4444' }}>(DRAFT)</span>}
                    </div>
                </div>
            </div>

            {/* Content Body */}
            <article className="wv-body">
                {renderContent(post.content)}

                {/* Developer Debug (JSON) */}
                {(post.content && (!post.content.content || post.content.content.length === 0)) && (
                    <div className="wv-json-debug">
                        <h3 className="wv-debug-title">Content Data (Developer Preview)</h3>
                        <pre className="wv-json-blue">{JSON.stringify(post.content, null, 2)}</pre>
                    </div>
                )}

                <div style={{ marginTop: '4rem', textAlign: 'center', color: '#6b7280', fontSize: '0.875rem' }}>
                    * 렌더러 고도화 중입니다.
                </div>
            </article>
        </div>
    );
};

export default WebzineViewer;
