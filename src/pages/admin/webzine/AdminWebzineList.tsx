import React, { useEffect, useState, useMemo, startTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import LocalLoading from '../../../components/LocalLoading';
import WebzineRenderer from '../../webzine/components/WebzineRenderer';
import './AdminWebzineList.css';

interface WebzinePost {
    id: number;
    title: string;
    subtitle: string | null;
    content: any;
    cover_image: string | null;
    is_published: boolean;
    created_at: string;
    views: number;
    author_id: string;
    target_year?: number;
    target_month?: number;
}

const AdminWebzineList = () => {
    const navigate = useNavigate();
    const { isAdmin, user } = useAuth();

    const now = new Date();
    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

    const [post, setPost] = useState<WebzinePost | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        fetchPostByMonth(selectedYear, selectedMonth, active);
        return () => { active = false; };
    }, [selectedYear, selectedMonth]);

    const fetchPostByMonth = async (year: number, month: number, active: boolean) => {
        try {
            setLoading(true);
            // 한국 시간 기준 해당 월의 범위 계산
            const startDate = new Date(year, month - 1, 1, 0, 0, 0).toISOString();
            const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

            const { data, error } = await supabase
                .from('webzine_posts')
                .select('*')
                .gte('created_at', startDate)
                .lte('created_at', endDate)
                .order('created_at', { ascending: false })
                .limit(1);

            if (!active) return;
            if (error) throw error;
            setPost(data && data.length > 0 ? data[0] : null);
        } catch (err) {
            console.error('[AdminWebzineList] Failed to fetch post:', err);
        } finally {
            if (active) setLoading(false);
        }
    };

    const handlePrevMonth = () => {
        startTransition(() => {
            if (selectedMonth === 1) {
                setSelectedYear(prev => prev - 1);
                setSelectedMonth(12);
            } else {
                setSelectedMonth(prev => prev - 1);
            }
        });
    };

    const handleNextMonth = () => {
        startTransition(() => {
            if (selectedMonth === 12) {
                setSelectedYear(prev => prev + 1);
                setSelectedMonth(1);
            } else {
                setSelectedMonth(prev => prev + 1);
            }
        });
    };

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();
        const startYear = 2024;
        const range = [];
        for (let y = currentYear + 1; y >= startYear; y--) {
            range.push(y);
        }
        return range;
    }, []);

    const months = Array.from({ length: 12 }, (_, i) => i + 1);

    const handleCreateNew = () => {
        navigate('/admin/webzine/new');
    };

    const handleEdit = () => {
        if (post) navigate(`/admin/webzine/edit/${post.id}`);
    };

    return (
        <div className="aw-container" id="admin-webzine-portal">
            <header className="aw-header" id="aw-main-header">
                <div className="aw-header-left">
                    <button
                        id="aw-btn-back-home"
                        onClick={() => navigate('/v2')}
                        className="aw-back-btn"
                        aria-label="홈으로 돌아가기"
                    >
                        <i className="ri-arrow-left-line"></i>
                    </button>
                    <nav className="aw-nav-controls" aria-label="발행 호수 선택">
                        <button
                            id="aw-btn-nav-prev"
                            onClick={handlePrevMonth}
                            className="aw-nav-btn"
                            aria-label="이전 달 보기"
                        >
                            <i className="ri-arrow-left-s-line"></i>
                        </button>

                        <div className="aw-date-selector">
                            <select
                                id="aw-select-year"
                                value={selectedYear}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    startTransition(() => {
                                        setSelectedYear(val);
                                    });
                                }}
                                className="aw-select"
                                aria-label="연도 선택"
                            >
                                {years.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select
                                id="aw-select-month"
                                value={selectedMonth}
                                onChange={(e) => {
                                    const val = Number(e.target.value);
                                    startTransition(() => {
                                        setSelectedMonth(val);
                                    });
                                }}
                                className="aw-select"
                                aria-label="월 선택"
                            >
                                {months.map(m => <option key={m} value={m}>{m}월</option>)}
                            </select>
                        </div>

                        <button
                            id="aw-btn-nav-next"
                            onClick={handleNextMonth}
                            className="aw-nav-btn"
                            aria-label="다음 달 보기"
                        >
                            <i className="ri-arrow-right-s-line"></i>
                        </button>
                    </nav>
                </div>

                {isAdmin && (
                    <div className="aw-header-right">
                        {post ? (
                            <button
                                id="aw-btn-edit-current"
                                onClick={handleEdit}
                                className="aw-btn-admin aw-btn-edit"
                                title="현재 게시물 수정"
                            >
                                <i className="ri-pencil-line"></i>
                                <span>편집하기</span>
                            </button>
                        ) : (
                            <button
                                id="aw-btn-publish-new"
                                onClick={handleCreateNew}
                                className="aw-btn-admin aw-btn-create"
                                title="새 월간 빌보드 발행"
                            >
                                <i className="ri-add-line"></i>
                                <span>발행하기</span>
                            </button>
                        )}
                    </div>
                )}
            </header>

            <main className="aw-main-viewer" id="aw-content-root">
                {loading ? (
                    <LocalLoading />
                ) : post ? (
                    <article className="aw-content-body" id={`post-container-${post.id}`}>
                        <section className="aw-hero" id="aw-post-hero">
                            {post.cover_image ? (
                                <img
                                    src={post.cover_image}
                                    alt={post.title}
                                    className="aw-cover-img"
                                    loading="lazy"
                                />
                            ) : (
                                <div className="aw-cover-placeholder">
                                    <span>Billboard Monthly</span>
                                </div>
                            )}
                            <div className="aw-hero-overlay" />
                            <div className="aw-hero-content">
                                <h1 className="aw-title-large">{post.title}</h1>
                                {post.subtitle && <p className="aw-subtitle-large">{post.subtitle}</p>}
                                <div className="aw-post-meta">
                                    <time dateTime={post.created_at}>
                                        {new Date(post.created_at).toLocaleDateString('ko-KR', {
                                            year: 'numeric',
                                            month: 'long',
                                            day: 'numeric'
                                        })}
                                    </time>
                                    <span className="aw-meta-divider">|</span>
                                    <span>조회 {post.views.toLocaleString()}회</span>
                                    {!post.is_published && <span className="aw-draft-tag">임시저장</span>}
                                </div>
                            </div>
                        </section>

                        <section className="aw-renderer-wrapper" id="aw-post-content">
                            <WebzineRenderer content={post.content} />
                        </section>
                    </article>
                ) : (
                    <div className="aw-empty-viewer" id="aw-no-content">
                        <i className="ri-article-line aw-empty-icon" aria-hidden="true"></i>
                        <p>{selectedYear}년 {selectedMonth}월에 발행된 콘텐츠가 없습니다.</p>
                        {isAdmin && (
                            <button
                                id="aw-btn-create-empty"
                                onClick={handleCreateNew}
                                className="aw-btn-create-large"
                            >
                                새 월간 빌보드 아티클 작성
                            </button>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
};

export default AdminWebzineList;
