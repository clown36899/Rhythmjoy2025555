import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import LocalLoading from '../../../components/LocalLoading';
import './WebzineEditor.css';

// Tiptap Imports
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { StatsNode } from './extensions/StatsNode';

// Stats Components
import MyImpactCard from '../../user/components/MyImpactCard';
import SwingSceneStats from '../../v2/components/SwingSceneStats';
import MonthlyWebzine from '../../v2/components/MonthlyBillboard/MonthlyWebzine';

interface WebzinePost {
    id: number;
    title: string;
    subtitle: string | null;
    content: any;
    cover_image: string | null;
    author_id: string;
    is_published: boolean;
    created_at: string;
    updated_at: string;
}

const MenuBar = ({ editor }: { editor: any }) => {
    if (!editor) return null;

    return (
        <div className="we-menu-bar">
            <button
                onClick={() => editor.chain().focus().toggleBold().run()}
                className={editor.isActive('bold') ? 'is-active' : ''}
                title="Bold"
            >
                <i className="ri-bold"></i>
            </button>
            <button
                onClick={() => editor.chain().focus().toggleItalic().run()}
                className={editor.isActive('italic') ? 'is-active' : ''}
                title="Italic"
            >
                <i className="ri-italic"></i>
            </button>
            <button
                onClick={() => editor.chain().focus().toggleUnderline().run()}
                className={editor.isActive('underline') ? 'is-active' : ''}
                title="Underline"
            >
                <i className="ri-underline"></i>
            </button>
            <span className="we-menu-divider"></span>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
                title="H1"
            >
                H1
            </button>
            <button
                onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                title="H2"
            >
                H2
            </button>
            <span className="we-menu-divider"></span>
            <button
                onClick={() => editor.chain().focus().toggleBulletList().run()}
                className={editor.isActive('bulletList') ? 'is-active' : ''}
                title="Bullet List"
            >
                <i className="ri-list-unordered"></i>
            </button>
            <button
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
                className={editor.isActive('orderedList') ? 'is-active' : ''}
                title="Ordered List"
            >
                <i className="ri-list-ordered"></i>
            </button>
            <span className="we-menu-divider"></span>
            <button
                onClick={() => {
                    const url = window.prompt('URL을 입력하세요');
                    if (url) editor.chain().focus().setLink({ href: url }).run();
                }}
                className={editor.isActive('link') ? 'is-active' : ''}
                title="Add Link"
            >
                <i className="ri-link"></i>
            </button>
            <button
                onClick={() => {
                    const url = window.prompt('이미지 URL을 입력하세요');
                    if (url) editor.chain().focus().setImage({ src: url }).run();
                }}
                title="Add Image URL"
            >
                <i className="ri-image-line"></i>
            </button>
        </div>
    );
};

const WebzineEditor = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // States
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [post, setPost] = useState<WebzinePost | null>(null);

    // Form States
    const [title, setTitle] = useState('');
    const [subtitle, setSubtitle] = useState('');
    const [coverImage, setCoverImage] = useState<string | null>(null);
    const [isPublished, setIsPublished] = useState(false);

    // Stats View State
    const [activeStatsTab, setActiveStatsTab] = useState<'my' | 'scene' | 'monthly'>('monthly');
    const [statsData, setStatsData] = useState<any>(null); // To hold data for MyImpactCard

    // Tiptap Editor
    const editor = useEditor({
        extensions: [
            StarterKit,
            Underline,
            Link.configure({ openOnClick: false }),
            Image,
            StatsNode,
            Placeholder.configure({
                placeholder: '이곳에 본문 내용을 작성하거나 통계를 삽입하세요...',
            }),
        ],
        content: '',
    });

    // 1. Initialize (Draft-First Strategy) & Load Stats Data
    useEffect(() => {
        const initEditor = async () => {
            if (!user) return;

            try {
                // Load User Data for MyImpactCard
                const [eventsRes, postsRes, userRes] = await Promise.all([
                    supabase.from('events').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                    supabase.from('board_posts').select('*, prefix:board_prefixes(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
                    supabase.from('board_users').select('profile_image, nickname').eq('user_id', user.id).maybeSingle()
                ]);

                if (postsRes.data) {
                    const profileImage = userRes.data?.profile_image || null;
                    const normalizedPosts = postsRes.data.map((post: any) => ({
                        ...post,
                        prefix: Array.isArray(post.prefix) ? post.prefix[0] : post.prefix,
                        author_profile_image: profileImage
                    }));
                    setStatsData({
                        events: eventsRes.data || [],
                        posts: normalizedPosts,
                        userProfile: userRes.data
                    });
                }

                // Editor Logic
                if (!id) {
                    console.log('[WebzineEditor] Creating new draft...');
                    const { data, error } = await supabase
                        .from('webzine_posts')
                        .insert({
                            title: '(제목 없음)',
                            author_id: user.id,
                            content: { type: 'doc', content: [] }, // Initial Tiptap JSON
                            is_published: false
                        })
                        .select()
                        .single();

                    if (error) throw error;
                    if (data) {
                        navigate(`/admin/webzine/edit/${data.id}`, { replace: true });
                    }
                    return;
                }

                console.log('[WebzineEditor] Fetching post:', id);
                const { data, error } = await supabase
                    .from('webzine_posts')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) throw error;

                if (data) {
                    setPost(data);
                    setTitle(data.title);
                    setSubtitle(data.subtitle || '');
                    setCoverImage(data.cover_image);
                    setIsPublished(data.is_published || false);

                    if (editor && data.content) {
                        editor.commands.setContent(data.content);
                    }
                }
            } catch (err) {
                console.error('[WebzineEditor] Error:', err);
                alert('데이터 로드 실패');
            } finally {
                setIsLoading(false);
            }
        };

        if (editor) {
            initEditor();
        }
    }, [id, user, navigate, editor]);

    // 2. Image Upload Handler
    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0 || !id) return;

        const file = e.target.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `cover_${Date.now()}.${fileExt}`;
        const filePath = `webzine/${id}/${fileName}`;

        try {
            setIsSaving(true);
            const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file);
            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
            setCoverImage(publicUrl);

            const { error: dbError } = await supabase
                .from('webzine_posts')
                .update({ cover_image: publicUrl, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (dbError) throw dbError;
        } catch (err) {
            console.error('[WebzineEditor] Image upload failed:', err);
            alert('이미지 업로드 실패');
        } finally {
            setIsSaving(false);
        }
    };

    // 3. Save Handler
    const handleSave = async (publishOverride?: boolean) => {
        if (!id || !editor) return;
        try {
            setIsSaving(true);
            const contentJson = editor.getJSON();

            const targetPublished = publishOverride !== undefined ? publishOverride : isPublished;
            const updates = {
                title,
                subtitle: subtitle || null,
                content: contentJson,
                is_published: targetPublished,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase.from('webzine_posts').update(updates).eq('id', id);
            if (error) throw error;

            if (publishOverride !== undefined) {
                setIsPublished(targetPublished);
            }
            console.log('[WebzineEditor] Saved successfully');
        } catch (err) {
            console.error('[WebzineEditor] Save failed:', err);
            alert('저장 실패');
        } finally {
            setIsSaving(false);
        }
    };

    // 4. Insert Stat Handler
    const handleInsertStat = (type: string, name: string, config: any) => {
        if (!editor) return;

        editor.chain().focus().insertContent({
            type: 'statsNode',
            attrs: {
                type,
                name,
                config
            }
        }).run();
    };

    // Render Stats Content
    const renderStatsContent = () => {
        switch (activeStatsTab) {
            case 'my':
                return statsData ? (
                    <MyImpactCard
                        user={{ id: user?.id, ...statsData.userProfile }}
                        posts={statsData.posts}
                        events={statsData.events}
                        initialExpanded={true}
                        onInsertItem={handleInsertStat}
                    />
                ) : <LocalLoading />;
            case 'scene':
                return <SwingSceneStats onInsertItem={handleInsertStat} />;
            case 'monthly':
                return <MonthlyWebzine onInsertItem={handleInsertStat} />;
            default:
                return null;
        }
    };

    if (isLoading) {
        return (
            <div className="we-loading-container">
                <LocalLoading message="에디터 로딩 중..." />
            </div>
        );
    }

    return (
        <div className="we-container">
            {/* Header */}
            <header className="we-header">
                <div className="we-header-left">
                    <button onClick={() => navigate(-1)} className="we-back-btn">
                        <i className="ri-arrow-left-line we-back-icon"></i>
                    </button>
                    <h1 className="we-title">
                        웹진 에디터
                        <span className={`we-status-badge ${isPublished ? 'we-status-published' : 'we-status-draft'}`}>
                            {isPublished ? 'PUBLISHED' : 'DRAFT'}
                        </span>
                    </h1>
                </div>

                <div className="we-header-actions">
                    <button onClick={() => window.open(`/webzine/${id}`, '_blank')} className="we-btn we-btn-secondary">
                        미리보기
                    </button>
                    <button onClick={() => handleSave()} disabled={isSaving} className="we-btn we-btn-primary">
                        {isSaving ? '저장 중...' : '저장'}
                    </button>
                    <button
                        onClick={() => handleSave(!isPublished)}
                        disabled={isSaving}
                        className={`we-btn ${isPublished ? 'we-btn-outline-red' : 'we-btn-outline-green'}`}
                    >
                        {isPublished ? '비공개 전환' : '발행하기'}
                    </button>
                </div>
            </header>

            <div className="we-main-layout">
                {/* Editor Column */}
                <main className="we-editor-column">
                    {/* 1. Cover Image */}
                    <section className="we-section">
                        <label className="we-label">커버 이미지</label>
                        <div className="we-cover-upload" onClick={() => fileInputRef.current?.click()}>
                            {coverImage ? (
                                <>
                                    <img src={coverImage} alt="Cover" className="we-cover-img" />
                                    <div className="we-cover-overlay">
                                        <span className="we-cover-overlay-text">이미지 변경</span>
                                    </div>
                                </>
                            ) : (
                                <div className="we-cover-placeholder">
                                    <i className="ri-image-add-line we-cover-placeholder-icon"></i>
                                    <span>커버 이미지 업로드 (클릭)</span>
                                </div>
                            )}
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="we-hidden"
                                accept="image/*"
                                onChange={handleImageUpload}
                            />
                        </div>
                    </section>

                    {/* 2. Titles */}
                    <section className="we-section">
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="제목을 입력하세요"
                            className="we-input-title"
                        />
                        <input
                            type="text"
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="부제를 입력하세요 (선택)"
                            className="we-input-subtitle"
                        />
                    </section>

                    <hr className="we-divider" />

                    {/* 3. Tiptap Content Area */}
                    <section className="we-section we-editor-section">
                        <label className="we-label">본문 작성</label>
                        <div className="we-editor-wrapper">
                            <MenuBar editor={editor} />
                            <EditorContent editor={editor} className="we-tiptap-content" />
                        </div>
                    </section>
                </main>

                {/* Stats Reference Column */}
                <aside className="we-stats-column">
                    <div className="we-stats-header">
                        <button
                            className={`we-stats-tab ${activeStatsTab === 'my' ? 'active' : ''}`}
                            onClick={() => setActiveStatsTab('my')}
                        >
                            내 통계
                        </button>
                        <button
                            className={`we-stats-tab ${activeStatsTab === 'scene' ? 'active' : ''}`}
                            onClick={() => setActiveStatsTab('scene')}
                        >
                            스윙씬
                        </button>
                        <button
                            className={`we-stats-tab ${activeStatsTab === 'monthly' ? 'active' : ''}`}
                            onClick={() => setActiveStatsTab('monthly')}
                        >
                            월간빌보드
                        </button>
                    </div>
                    {/* Portal Target for SwingSceneStats Controls */}
                    <div id="stats-header-portal-target" className="we-portal-target"></div>

                    <div className="we-stats-content">
                        {renderStatsContent()}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default WebzineEditor;
