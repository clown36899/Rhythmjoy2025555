import React, { useState, useEffect, useMemo } from 'react';
import { cafe24 } from '../../lib/cafe24Client';
import { useAuth } from '../../contexts/AuthContext';
import { LinkRegistrationModal } from './components/LinkRegistrationModal';
import {
    getDisplayDomain,
    getLinkTypeLabel,
    getPlatformIcon,
    getPlatformLabel,
    type AccountPlatform,
    type LinkType,
} from './linkUtils';
import './links.css';

export interface SiteLink {
    id: number;
    title: string;
    url: string;
    normalized_url?: string;
    description: string;
    image_url?: string;
    category: string;
    link_type?: LinkType;
    account_platform?: AccountPlatform;
    account_handle?: string;
    created_by: string;
    is_approved: boolean;
    created_at: string;
}

type TypeFilter = 'all' | LinkType;

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string; icon: string }> = [
    { value: 'all', label: '전체', icon: 'ri-stack-line' },
    { value: 'person_account', label: '인물 계정', icon: 'ri-user-follow-line' },
    { value: 'site', label: '사이트', icon: 'ri-global-line' },
];

const getResolvedLinkType = (link: SiteLink): LinkType => (
    link.link_type === 'person_account' ? 'person_account' : 'site'
);

export default function LinksPage() {
    const { user, isAdmin } = useAuth();
    const [links, setLinks] = useState<SiteLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<SiteLink | null>(null);
    const [filterType, setFilterType] = useState<TypeFilter>('all');
    const [filterCategory, setFilterCategory] = useState<string>('전체');

    const fetchLinks = async () => {
        setLoading(true);
        try {
            const query = cafe24.from('site_links').select('*').order('created_at', { ascending: false });

            // RLS 정책에 의해 일반 유저는 승인된 항목과 자신이 쓴 승인대기 항목만 보이고,
            // 관리자는 모든 항목이 보이므로 프론트엔드쪽 쿼리 필터 제거 

            const { data, error } = await query;
            if (error) throw error;
            setLinks(data || []);
        } catch (error) {
            console.error('Error fetching links:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLinks();
    }, [isAdmin]);

    const typeFilteredLinks = useMemo(() => (
        filterType === 'all'
            ? links
            : links.filter(link => getResolvedLinkType(link) === filterType)
    ), [filterType, links]);

    // 동적으로 존재하는 카테고리 추출
    const allCategories = useMemo(() => (
        Array.from(new Set(typeFilteredLinks.map(link => link.category))).filter(Boolean).sort()
    ), [typeFilteredLinks]);

    // 필터링된 배열 계산
    const filteredLinks = useMemo(() => (
        filterCategory === '전체'
            ? typeFilteredLinks
            : typeFilteredLinks.filter(link => link.category === filterCategory)
    ), [filterCategory, typeFilteredLinks]);

    useEffect(() => {
        if (filterCategory !== '전체' && !allCategories.includes(filterCategory)) {
            setFilterCategory('전체');
        }
    }, [allCategories, filterCategory]);

    const handleApprove = async (id: number) => {
        if (!isAdmin) return;
        try {
            const { error } = await cafe24.from('site_links').update({ is_approved: true }).eq('id', id);
            if (error) throw error;
            fetchLinks();
        } catch (error) {
            alert('승인 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await cafe24.from('site_links').delete().eq('id', id);
            if (error) throw error;
            fetchLinks();
        } catch (error) {
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    return (
        <div className="links-page-glass-container">
            <header className="links-hero-header">
                <div className="links-hero-content">
                    <p className="subtitle-glass">댄스씬의 사이트와 인물 계정을 모아봅니다.</p>
                </div>
                <button className="links-action-btn glass-btn-primary" onClick={() => { setEditTarget(null); setIsModalOpen(true); }}>
                    <i className="ri-add-line"></i>
                    <span>사이트·계정 등록</span>
                </button>
            </header>

            <div className="links-glass-filter-wrapper">
                <div className="links-type-filter" aria-label="링크 유형 필터">
                    {TYPE_FILTERS.map(item => {
                        const count = item.value === 'all'
                            ? links.length
                            : links.filter(link => getResolvedLinkType(link) === item.value).length;
                        return (
                            <button
                                key={item.value}
                                className={`link-type-chip ${filterType === item.value ? 'active' : ''}`}
                                onClick={() => setFilterType(item.value)}
                            >
                                <i className={item.icon}></i>
                                <span>{item.label}</span>
                                <b>{count}</b>
                            </button>
                        );
                    })}
                </div>
                <div className="links-category-filter">
                    <button
                        className={`glass-pill ${filterCategory === '전체' ? 'active' : ''}`}
                        onClick={() => setFilterCategory('전체')}
                    >
                        <span className="category-text">전체</span>
                        <span className="category-count">{typeFilteredLinks.length}</span>
                    </button>
                    {allCategories.map(cat => {
                        const count = typeFilteredLinks.filter(l => l.category === cat).length;
                        return (
                            <button
                                key={cat}
                                className={`glass-pill ${filterCategory === cat ? 'active' : ''}`}
                                onClick={() => setFilterCategory(cat)}
                            >
                                <span className="category-text">{cat}</span>
                                <span className="category-count">{count}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading ? (
                <div className="links-glass-loading">
                    <div className="spinner-glow"></div>
                    <p>데이터를 불러오는 중입니다...</p>
                </div>
            ) : filteredLinks.length === 0 ? (
                <div className="links-glass-empty">
                    <div className="empty-icon-glow"><i className="ri-folder-open-line"></i></div>
                    <h3>등록된 링크가 없습니다</h3>
                    <p>가장 먼저 유용한 사이트나 계정을 공유해보세요.</p>
                </div>
            ) : (
                <div className="links-glass-grid">
                    {filteredLinks.map((link) => {
                        const resolvedType = getResolvedLinkType(link);
                        const accountHandle = link.account_handle?.trim();
                        const targetUrl = link.normalized_url || link.url;
                        return (
                        <div key={link.id} className={`glass-card link-item ${resolvedType === 'person_account' ? 'account-card' : ''} ${!link.is_approved ? 'pending' : ''}`}
                            onClick={() => window.open(targetUrl, '_blank', 'noopener noreferrer')}>

                            {!link.is_approved && (
                                <div className="glass-badge-pending">
                                    <i className="ri-time-line"></i> 승인 대기중
                                </div>
                            )}

                            <div className="link-card-body">
                                <div className="link-neon-icon">
                                    {link.image_url ? (
                                        <img src={link.image_url} alt={link.title} loading="lazy" referrerPolicy="no-referrer" />
                                    ) : (
                                        <div className={`icon-placeholder ${resolvedType === 'person_account' ? 'account-placeholder' : ''}`}>
                                            {resolvedType === 'person_account'
                                                ? <i className={getPlatformIcon(link.account_platform)}></i>
                                                : link.title.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                    {resolvedType === 'person_account' && (
                                        <span className={`link-platform-float ${link.account_platform || 'other'}`}>
                                            <i className={getPlatformIcon(link.account_platform)}></i>
                                        </span>
                                    )}
                                </div>
                                <div className="link-content">
                                    <div className="link-meta">
                                        <span className="glass-tag">{link.category || getLinkTypeLabel(resolvedType)}</span>
                                        <span className={`glass-tag link-type-tag ${resolvedType}`}>{getLinkTypeLabel(resolvedType)}</span>
                                        <span className="link-domain">
                                            {resolvedType === 'person_account'
                                                ? `${getPlatformLabel(link.account_platform)}${accountHandle ? ` · @${accountHandle}` : ''}`
                                                : getDisplayDomain(targetUrl)}
                                        </span>
                                    </div>
                                    <h3 className="link-title" title={link.title}>{link.title}</h3>
                                    <p className="link-desc" title={link.description || link.url}>{link.description || link.url}</p>
                                </div>
                                <div className="link-hover-arrow">
                                    <i className="ri-arrow-right-up-line"></i>
                                </div>
                            </div>

                            {(isAdmin || (user && user.id === link.created_by)) && (
                                <div className="link-glass-actions" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => { setEditTarget(link); setIsModalOpen(true); }} className="glass-action-btn edit">
                                        <i className="ri-pencil-line"></i> 수정
                                    </button>
                                    {isAdmin && !link.is_approved && (
                                        <button onClick={() => handleApprove(link.id)} className="glass-action-btn approve">
                                            <i className="ri-check-line"></i> 승인
                                        </button>
                                    )}
                                    <button onClick={() => handleDelete(link.id)} className="glass-action-btn delete">
                                        <i className="ri-delete-bin-line"></i> 삭제
                                    </button>
                                </div>
                            )}
                        </div>
                        );
                    })}
                </div>
            )}

            {isModalOpen && (
                <LinkRegistrationModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setEditTarget(null); }}
                    onSuccess={fetchLinks}
                    categories={allCategories}
                    editLink={editTarget}
                />
            )}
        </div>
    );
}
