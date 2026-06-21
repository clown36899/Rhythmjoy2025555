import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cafe24 } from '../../lib/cafe24Client';
import { useAuth } from '../../contexts/AuthContext';
import { LinkRegistrationModal, type LinkRegistrationDraft } from './components/LinkRegistrationModal';
import {
    getDisplayDomain,
    getLinkTypeLabel,
    getPlatformIcon,
    getPlatformLabel,
    isWeakAccountDescription,
    parseLinkTarget,
    type AccountPlatform,
    type LinkType,
} from './linkUtils';
import './links.css';

export interface SiteLink {
    id: number | string;
    title: string;
    url: string;
    normalized_url?: string;
    description: string;
    image_url?: string;
    category: string;
    link_type?: LinkType;
    account_platform?: AccountPlatform;
    account_handle?: string;
    person_group_id?: string | null;
    person_group_title?: string | null;
    person_group_description?: string | null;
    person_group_image_url?: string | null;
    person_group_category?: string | null;
    person_group_primary_link_id?: number | string | null;
    created_by: string;
    is_approved: boolean;
    created_at: string;
}

type TypeFilter = 'all' | LinkType;

type AccountCardItem = {
    kind: 'single' | 'group';
    key: string;
    links: SiteLink[];
    representative: SiteLink;
    groupId?: string;
};

type PersonMergeDraft = {
    groupId: string;
};

const TYPE_FILTERS: Array<{ value: TypeFilter; label: string; icon: string }> = [
    { value: 'all', label: '전체', icon: 'ri-stack-line' },
    { value: 'person_account', label: '인물 계정', icon: 'ri-user-follow-line' },
    { value: 'site', label: '사이트', icon: 'ri-global-line' },
];

const getResolvedLinkType = (link: SiteLink): LinkType => (
    link.link_type === 'person_account' ? 'person_account' : 'site'
);

const getLinkKey = (link: SiteLink) => String(link.id);

const isTruthy = (value: unknown) => (
    value === true ||
    value === 1 ||
    String(value || '').toLowerCase() === 'true' ||
    String(value || '') === '1'
);

const firstText = (values: Array<string | null | undefined>) => (
    values.map((value) => String(value || '').trim()).find(Boolean) || ''
);

const getPersonGroupId = (link: SiteLink) => String(link.person_group_id || '').trim();

const getTargetUrl = (link: SiteLink) => link.normalized_url || link.url;

const createPersonGroupId = () => `person-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const uniqueBy = <T,>(items: T[], keyFn: (item: T) => string) => {
    const seen = new Set<string>();
    return items.filter((item) => {
        const key = keyFn(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const getPrimaryLink = (links: SiteLink[]) => {
    const primaryId = firstText(links.map((link) => String(link.person_group_primary_link_id || '')));
    return links.find((link) => String(link.id) === primaryId) || links[0];
};

const getAccountTitle = (link: SiteLink) => (
    firstText([link.title, link.account_handle ? `@${link.account_handle}` : '']) || '이름 없는 계정'
);

const getAccountClusterTitle = (links: SiteLink[]) => {
    const titles = uniqueBy(
        links.map(getAccountTitle).filter(Boolean),
        (title) => title.toLowerCase()
    );

    if (titles.length === 0) return '인물 계정 묶음';
    if (titles.length === 1) return titles[0];
    if (titles.length === 2) return titles.join(' · ');
    return `${titles[0]} 외 ${titles.length - 1}개 계정`;
};

const getAccountClusterCategory = (links: SiteLink[]) => (
    firstText(links.map((link) => link.person_group_category)) || firstText(links.map((link) => link.category)) || '인물'
);

const getPlatforms = (links: SiteLink[]) => (
    uniqueBy(
        links
            .map((link) => link.account_platform || 'other')
            .filter((platform): platform is AccountPlatform => Boolean(platform)),
        (platform) => platform
    )
);

const getHandleSummary = (links: SiteLink[]) => (
    uniqueBy(
        links
            .map((link) => String(link.account_handle || '').trim())
            .filter(Boolean),
        (handle) => handle.toLowerCase()
    )
        .map((handle) => `@${handle}`)
        .join(' · ')
);

const getCategoryForFilter = (link: SiteLink) => (
    link.person_group_category || link.category
);

export default function LinksPage() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAdmin } = useAuth();
    const [links, setLinks] = useState<SiteLink[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editTarget, setEditTarget] = useState<SiteLink | null>(null);
    const [initialDraft, setInitialDraft] = useState<LinkRegistrationDraft | null>(null);
    const [filterType, setFilterType] = useState<TypeFilter>('all');
    const [filterCategory, setFilterCategory] = useState<string>('전체');
    const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(() => new Set());
    const [mergeLinks, setMergeLinks] = useState<SiteLink[] | null>(null);
    const [bridgeLinks, setBridgeLinks] = useState<SiteLink[] | null>(null);
    const importedDraftKeyRef = useRef('');

    const fetchLinks = async () => {
        setLoading(true);
        try {
            const query = cafe24.from('site_links').select('*').order('created_at', { ascending: false });

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

    useEffect(() => {
        const hashValue = location.hash.startsWith('#clipper?')
            ? location.hash.slice('#clipper?'.length)
            : location.hash.startsWith('#?')
                ? location.hash.slice(2)
                : '';
        const hashParams = new URLSearchParams(hashValue);
        const searchParams = new URLSearchParams(location.search);
        const hasSearchImport = ['clipper', 'add', 'url', 'link'].some((key) => searchParams.has(key));
        const params = hashValue ? hashParams : hasSearchImport ? searchParams : null;
        if (!params) return;

        const rawUrl = params.get('url') || params.get('add') || params.get('link') || '';
        const parsed = parseLinkTarget(rawUrl);
        if (!rawUrl || !parsed) return;

        const requestedType = params.get('type') || params.get('link_type');
        const resolvedType: LinkType = requestedType === 'person_account' || parsed.linkType === 'person_account'
            ? 'person_account'
            : 'site';
        const importKey = [
            resolvedType,
            parsed.normalizedUrl,
            params.get('title') || '',
            params.get('thumbnail') || params.get('image') || '',
            params.get('description') || '',
        ].join(':');
        if (importedDraftKeyRef.current === importKey) return;
        importedDraftKeyRef.current = importKey;

        setEditTarget(null);
        const paramPlatform = params.get('platform');
        const rawDescription = params.get('description') || '';
        const draftDescription = resolvedType === 'person_account' && isWeakAccountDescription(rawDescription, parsed)
            ? ''
            : rawDescription;

        setInitialDraft({
            url: parsed.normalizedUrl,
            title: params.get('title') || '',
            imageUrl: params.get('thumbnail') || params.get('image') || '',
            description: draftDescription,
            category: params.get('category') || (resolvedType === 'person_account' ? '인물' : ''),
            linkType: resolvedType,
            accountPlatform: resolvedType === 'person_account' && (paramPlatform === 'instagram' || paramPlatform === 'youtube')
                ? paramPlatform
                : resolvedType === 'person_account'
                    ? parsed.accountPlatform
                    : 'other',
            accountHandle: resolvedType === 'person_account' ? (params.get('handle') || parsed.accountHandle) : '',
            source: params.get('source') || '',
        });
        setIsModalOpen(true);
        navigate('/links', { replace: true });
    }, [location.hash, location.search, navigate]);

    const accountLinks = useMemo(() => (
        links.filter((link) => getResolvedLinkType(link) === 'person_account')
    ), [links]);

    const typeFilteredLinks = useMemo(() => (
        filterType === 'all'
            ? links
            : links.filter(link => getResolvedLinkType(link) === filterType)
    ), [filterType, links]);

    const allCategories = useMemo(() => (
        Array.from(new Set(typeFilteredLinks.map(link => getCategoryForFilter(link)))).filter(Boolean).sort()
    ), [typeFilteredLinks]);

    const filteredLinks = useMemo(() => (
        filterCategory === '전체'
            ? typeFilteredLinks
            : typeFilteredLinks.filter(link => getCategoryForFilter(link) === filterCategory)
    ), [filterCategory, typeFilteredLinks]);

    const groupMembersById = useMemo(() => {
        const map = new Map<string, SiteLink[]>();
        accountLinks.forEach((link) => {
            const groupId = getPersonGroupId(link);
            if (!groupId) return;
            const members = map.get(groupId) || [];
            members.push(link);
            map.set(groupId, members);
        });
        return map;
    }, [accountLinks]);

    const cardItems = useMemo<AccountCardItem[]>(() => {
        const seenGroups = new Set<string>();
        return filteredLinks.reduce<AccountCardItem[]>((items, link) => {
            const isAccount = getResolvedLinkType(link) === 'person_account';
            const groupId = isAccount ? getPersonGroupId(link) : '';
            if (isAccount && groupId) {
                if (seenGroups.has(groupId)) return items;
                seenGroups.add(groupId);
                const members = groupMembersById.get(groupId) || [link];
                items.push({
                    kind: 'group',
                    key: `group:${groupId}`,
                    groupId,
                    links: members,
                    representative: getPrimaryLink(members),
                });
                return items;
            }

            items.push({
                kind: 'single',
                key: `link:${getLinkKey(link)}`,
                links: [link],
                representative: link,
            });
            return items;
        }, []);
    }, [filteredLinks, groupMembersById]);

    const selectedLinks = useMemo(() => (
        accountLinks.filter((link) => selectedAccountIds.has(getLinkKey(link)))
    ), [accountLinks, selectedAccountIds]);

    useEffect(() => {
        if (filterCategory !== '전체' && !allCategories.includes(filterCategory)) {
            setFilterCategory('전체');
        }
    }, [allCategories, filterCategory]);

    const handleApprove = async (id: SiteLink['id']) => {
        if (!isAdmin) return;
        try {
            const { error } = await cafe24.from('site_links').update({ is_approved: true }).eq('id', id);
            if (error) throw error;
            fetchLinks();
        } catch (error) {
            alert('승인 중 오류가 발생했습니다.');
        }
    };

    const handleApproveMany = async (targetLinks: SiteLink[]) => {
        if (!isAdmin) return;
        try {
            const results = await Promise.all(targetLinks.map((link) => (
                cafe24.from('site_links').update({ is_approved: true }).eq('id', link.id)
            )));
            const failed = results.find((result: any) => result?.error);
            if (failed) throw failed.error;
            fetchLinks();
        } catch (error) {
            alert('승인 중 오류가 발생했습니다.');
        }
    };

    const handleDelete = async (id: SiteLink['id']) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        try {
            const { error } = await cafe24.from('site_links').delete().eq('id', id);
            if (error) throw error;
            fetchLinks();
        } catch (error) {
            alert('삭제 중 오류가 발생했습니다.');
        }
    };

    const toggleAccountSelection = (targetLinks: SiteLink[], checked?: boolean) => {
        setSelectedAccountIds((prev) => {
            const next = new Set(prev);
            const shouldSelect = checked ?? !targetLinks.every((link) => next.has(getLinkKey(link)));
            targetLinks.forEach((link) => {
                if (shouldSelect) next.add(getLinkKey(link));
                else next.delete(getLinkKey(link));
            });
            return next;
        });
    };

    const openMergeModalForSelection = () => {
        const selected = uniqueBy(selectedLinks, getLinkKey);
        if (selected.length < 2) {
            alert('합칠 인물 계정을 2개 이상 선택해주세요.');
            return;
        }
        setMergeLinks(selected);
    };

    const handleSaveMerge = async (draft: PersonMergeDraft, targetLinks: SiteLink[]) => {
        if (!isAdmin) return;
        const updatedAt = new Date().toISOString();
        const payload = {
            person_group_id: draft.groupId,
            person_group_title: null,
            person_group_description: null,
            person_group_image_url: null,
            person_group_category: null,
            person_group_primary_link_id: null,
            updated_at: updatedAt,
        };

        try {
            const results = await Promise.all(targetLinks.map((link) => (
                cafe24.from('site_links').update(payload).eq('id', link.id)
            )));
            const failed = results.find((result: any) => result?.error);
            if (failed) throw failed.error;
            setSelectedAccountIds(new Set());
            setMergeLinks(null);
            await fetchLinks();
        } catch (error) {
            console.error('Person merge failed:', error);
            alert('인물 계정 병합 중 오류가 발생했습니다.');
        }
    };

    const handleUngroup = async (targetLinks: SiteLink[]) => {
        if (!isAdmin) return;
        if (!confirm('이 인물 묶음을 해제하시겠습니까? 개별 계정은 삭제되지 않습니다.')) return;
        try {
            const payload = {
                person_group_id: null,
                person_group_title: null,
                person_group_description: null,
                person_group_image_url: null,
                person_group_category: null,
                person_group_primary_link_id: null,
                updated_at: new Date().toISOString(),
            };
            const results = await Promise.all(targetLinks.map((link) => (
                cafe24.from('site_links').update(payload).eq('id', link.id)
            )));
            const failed = results.find((result: any) => result?.error);
            if (failed) throw failed.error;
            setSelectedAccountIds(new Set());
            setBridgeLinks(null);
            await fetchLinks();
        } catch (error) {
            console.error('Person ungroup failed:', error);
            alert('묶음 해제 중 오류가 발생했습니다.');
        }
    };

    const openEditModal = (link: SiteLink) => {
        setBridgeLinks(null);
        setInitialDraft(null);
        setEditTarget(link);
        setIsModalOpen(true);
    };

    return (
        <div className="links-page-glass-container">
            <header className="links-hero-header">
                <div className="links-hero-content">
                    <p className="subtitle-glass">댄스씬의 사이트와 인물 계정을 모아봅니다.</p>
                </div>
                <button className="links-action-btn glass-btn-primary" onClick={() => { setInitialDraft(null); setEditTarget(null); setIsModalOpen(true); }}>
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
                        const count = typeFilteredLinks.filter(l => getCategoryForFilter(l) === cat).length;
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

            {isAdmin && filterType !== 'site' && accountLinks.length > 1 && (
                <div className="person-merge-toolbar">
                    <div className="person-merge-toolbar-copy">
                        <strong>{selectedLinks.length > 0 ? `${selectedLinks.length}개 계정 선택됨` : '인물 계정 병합'}</strong>
                        <span>같은 사람의 Instagram, YouTube 계정을 하나의 브릿지 카드로 묶을 수 있습니다.</span>
                    </div>
                    <div className="person-merge-toolbar-actions">
                        {selectedLinks.length > 0 && (
                            <button type="button" className="glass-btn secondary" onClick={() => setSelectedAccountIds(new Set())}>
                                선택 해제
                            </button>
                        )}
                        <button
                            type="button"
                            className="glass-btn primary"
                            onClick={openMergeModalForSelection}
                            disabled={selectedLinks.length < 2}
                        >
                            <i className="ri-git-merge-line"></i>
                            합치기
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="links-glass-loading">
                    <div className="spinner-glow"></div>
                    <p>데이터를 불러오는 중입니다...</p>
                </div>
            ) : cardItems.length === 0 ? (
                <div className="links-glass-empty">
                    <div className="empty-icon-glow"><i className="ri-folder-open-line"></i></div>
                    <h3>등록된 링크가 없습니다</h3>
                    <p>가장 먼저 유용한 사이트나 계정을 공유해보세요.</p>
                </div>
            ) : (
                <div className="links-glass-grid">
                    {cardItems.map((item) => {
                        const link = item.representative;
                        const resolvedType = getResolvedLinkType(link);
                        const isAccountCard = resolvedType === 'person_account';
                        const isGroup = item.kind === 'group';
                        const title = isGroup ? getAccountClusterTitle(item.links) : isAccountCard ? getAccountTitle(link) : link.title;
                        const description = isGroup ? '' : link.description;
                        const imageUrl = isGroup ? '' : link.image_url;
                        const category = isGroup ? getAccountClusterCategory(item.links) : link.category;
                        const targetUrl = getTargetUrl(getPrimaryLink(item.links));
                        const accountHandle = getHandleSummary(item.links);
                        const platforms = getPlatforms(item.links);
                        const isSelected = item.links.length > 0 && item.links.every((target) => selectedAccountIds.has(getLinkKey(target)));
                        const isPending = item.links.some((target) => !isTruthy(target.is_approved));
                        const canManageSingle = item.kind === 'single' && (isAdmin || (user && user.id === link.created_by));

                        return (
                            <div
                                key={item.key}
                                className={`glass-card link-item ${isAccountCard ? 'account-card' : ''} ${isGroup ? 'grouped-account-card' : ''} ${isPending ? 'pending' : ''}`}
                                onClick={() => {
                                    if (isGroup) setBridgeLinks(item.links);
                                    else window.open(targetUrl, '_blank', 'noopener noreferrer');
                                }}
                            >

                                {isAdmin && isAccountCard && (
                                    <label className={`merge-select-control ${isSelected ? 'active' : ''}`} onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(event) => toggleAccountSelection(item.links, event.target.checked)}
                                        />
                                        <span>{isSelected ? '선택됨' : '선택'}</span>
                                    </label>
                                )}

                                {isPending && (
                                    <div className="glass-badge-pending">
                                        <i className="ri-time-line"></i> 승인 대기중
                                    </div>
                                )}

                                <div className="link-card-body">
                                    {isGroup ? (
                                        <AccountAvatarStack links={item.links} variant="card" />
                                    ) : (
                                        <div className="link-neon-icon">
                                            {imageUrl ? (
                                                <img
                                                    src={imageUrl}
                                                    alt={title}
                                                    loading="lazy"
                                                    referrerPolicy="no-referrer"
                                                    className={isAccountCard ? 'account-avatar-image' : undefined}
                                                />
                                            ) : (
                                                <div className={`icon-placeholder ${isAccountCard ? 'account-placeholder' : ''}`}>
                                                    {isAccountCard
                                                        ? <i className={getPlatformIcon(link.account_platform)}></i>
                                                        : title.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                            {isAccountCard && (
                                                <span className={`link-platform-float ${link.account_platform || 'other'}`}>
                                                    <i className={getPlatformIcon(link.account_platform)}></i>
                                                </span>
                                            )}
                                        </div>
                                    )}
                                    <div className={`link-content ${isAccountCard ? 'account-profile-content' : ''}`}>
                                        {isAccountCard ? (
                                            <div className="account-profile-meta">
                                                {platforms.map((platform) => (
                                                    <span key={platform} className={`account-platform-pill ${platform}`}>
                                                        <i className={getPlatformIcon(platform)}></i>
                                                        <span>{getPlatformLabel(platform)}</span>
                                                    </span>
                                                ))}
                                                {isGroup && <span className="glass-tag merged-person-tag">{item.links.length}개 계정</span>}
                                                <span className="glass-tag">{category || getLinkTypeLabel(resolvedType)}</span>
                                            </div>
                                        ) : (
                                            <div className="link-meta">
                                                <span className="glass-tag">{category || getLinkTypeLabel(resolvedType)}</span>
                                                <span className={`glass-tag link-type-tag ${resolvedType}`}>{getLinkTypeLabel(resolvedType)}</span>
                                                <span className="link-domain">{getDisplayDomain(targetUrl)}</span>
                                            </div>
                                        )}
                                        <h3 className="link-title" title={title}>{title}</h3>
                                        {isAccountCard && accountHandle && (
                                            <p className="account-handle-line" title={accountHandle}>{accountHandle}</p>
                                        )}
                                        {isGroup ? (
                                            <div className="account-cluster-list" aria-label="묶인 계정">
                                                {item.links.slice(0, 4).map((target) => (
                                                    <span key={getLinkKey(target)}>
                                                        <i className={getPlatformIcon(target.account_platform)}></i>
                                                        <b>{getAccountTitle(target)}</b>
                                                    </span>
                                                ))}
                                                {item.links.length > 4 && <em>+{item.links.length - 4}</em>}
                                            </div>
                                        ) : (
                                            <p className="link-desc" title={description || targetUrl}>
                                                {description || targetUrl}
                                            </p>
                                        )}
                                    </div>
                                    <div className="link-hover-arrow">
                                        <i className={isGroup ? 'ri-list-check-2' : 'ri-arrow-right-up-line'}></i>
                                    </div>
                                </div>

                                {item.kind === 'group' && isAdmin && (
                                    <div className="link-glass-actions" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => setMergeLinks(item.links)} className="glass-action-btn edit">
                                            <i className="ri-git-merge-line"></i> 병합 수정
                                        </button>
                                        {isPending && (
                                            <button onClick={() => handleApproveMany(item.links.filter((target) => !isTruthy(target.is_approved)))} className="glass-action-btn approve">
                                                <i className="ri-check-line"></i> 모두 승인
                                            </button>
                                        )}
                                        <button onClick={() => handleUngroup(item.links)} className="glass-action-btn ungroup">
                                            <i className="ri-scissors-cut-line"></i> 분리
                                        </button>
                                    </div>
                                )}

                                {canManageSingle && (
                                    <div className="link-glass-actions" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => openEditModal(link)} className="glass-action-btn edit">
                                            <i className="ri-pencil-line"></i> 수정
                                        </button>
                                        {isAdmin && !isTruthy(link.is_approved) && (
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
                    onClose={() => { setIsModalOpen(false); setEditTarget(null); setInitialDraft(null); }}
                    onSuccess={fetchLinks}
                    categories={allCategories}
                    editLink={editTarget}
                    initialDraft={initialDraft}
                />
            )}

            {mergeLinks && (
                <PersonMergeModal
                    links={mergeLinks}
                    onClose={() => setMergeLinks(null)}
                    onSave={(draft) => handleSaveMerge(draft, mergeLinks)}
                />
            )}

            {bridgeLinks && (
                <PersonBridgeModal
                    links={bridgeLinks}
                    isAdmin={isAdmin}
                    onClose={() => setBridgeLinks(null)}
                    onEditLink={openEditModal}
                    onUngroup={handleUngroup}
                />
            )}
        </div>
    );
}

function PersonMergeModal({
    links,
    onClose,
    onSave,
}: {
    links: SiteLink[];
    onClose: () => void;
    onSave: (draft: PersonMergeDraft) => void;
}) {
    const existingGroupIds = useMemo(() => (
        uniqueBy(links.map(getPersonGroupId).filter(Boolean), (groupId) => groupId)
    ), [links]);
    const initialGroupId = useMemo(() => (
        existingGroupIds.length === 1 ? existingGroupIds[0] : createPersonGroupId()
    ), [existingGroupIds]);
    const title = getAccountClusterTitle(links);

    const submit = () => {
        onSave({ groupId: initialGroupId });
    };

    return (
        <div className="links-modal-overlay glass-overlay">
            <div className="links-modal-panel glass-panel person-merge-panel" onClick={e => e.stopPropagation()}>
                <div className="links-modal-header">
                    <h2 className="links-modal-title">인물 계정 합치기</h2>
                    <button className="links-modal-close" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="links-modal-body">
                    <div className="merge-preview-strip account-cluster-preview">
                        <AccountAvatarStack links={links} variant="modal" />
                        <div>
                            <strong>{title}</strong>
                            <span>각 계정의 이름, 이미지, 링크는 그대로 살리고 한 카드 안에 묶습니다.</span>
                        </div>
                    </div>

                    <div className="merge-source-list">
                        {links.map((link) => (
                            <div key={getLinkKey(link)} className="merge-source-item">
                                <AccountAvatar link={link} />
                                <div className="merge-source-copy">
                                    <strong>{getAccountTitle(link)}</strong>
                                    <span>{getPlatformLabel(link.account_platform)} @{link.account_handle || '-'}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="links-modal-actions">
                    <button type="button" onClick={onClose} className="glass-btn secondary">취소</button>
                    <button type="button" onClick={submit} className="glass-btn primary">
                        <i className="ri-git-merge-line"></i>
                        한 인물로 묶기
                    </button>
                </div>
            </div>
        </div>
    );
}

function PersonBridgeModal({
    links,
    isAdmin,
    onClose,
    onEditLink,
    onUngroup,
}: {
    links: SiteLink[];
    isAdmin: boolean;
    onClose: () => void;
    onEditLink: (link: SiteLink) => void;
    onUngroup: (links: SiteLink[]) => void;
}) {
    const title = getAccountClusterTitle(links);

    return (
        <div className="links-modal-overlay glass-overlay">
            <div className="links-modal-panel glass-panel person-bridge-panel" onClick={e => e.stopPropagation()}>
                <div className="links-modal-header">
                    <h2 className="links-modal-title">{title}</h2>
                    <button className="links-modal-close" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>
                <div className="links-modal-body">
                    <div className="bridge-profile-head account-cluster-preview">
                        <AccountAvatarStack links={links} variant="modal" />
                        <div>
                            <strong>{links.length}개 계정</strong>
                            <span>열고 싶은 SNS 계정을 선택하세요.</span>
                        </div>
                    </div>

                    <div className="bridge-account-list">
                        {links.map((link) => {
                            const targetUrl = getTargetUrl(link);
                            return (
                                <div key={getLinkKey(link)} className="bridge-account-row">
                                    <button type="button" className="bridge-account-main" onClick={() => window.open(targetUrl, '_blank', 'noopener noreferrer')}>
                                        <AccountAvatar link={link} />
                                        <span className="bridge-account-copy">
                                            <strong>{getAccountTitle(link)}</strong>
                                            <em>{getPlatformLabel(link.account_platform)} @{link.account_handle || '-'}</em>
                                        </span>
                                        <i className="ri-arrow-right-up-line"></i>
                                    </button>
                                    {isAdmin && (
                                        <button type="button" className="bridge-edit-btn" onClick={() => onEditLink(link)}>
                                            <i className="ri-pencil-line"></i>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
                {isAdmin && (
                    <div className="links-modal-actions">
                        <button type="button" onClick={() => onUngroup(links)} className="glass-btn secondary">
                            <i className="ri-scissors-cut-line"></i>
                            묶음 해제
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function AccountAvatar({ link }: { link: SiteLink }) {
    return (
        <span className="account-mini-avatar">
            {link.image_url ? (
                <img src={link.image_url} alt={getAccountTitle(link)} loading="lazy" referrerPolicy="no-referrer" />
            ) : (
                <i className={getPlatformIcon(link.account_platform)}></i>
            )}
            <span className={`account-mini-platform ${link.account_platform || 'other'}`}>
                <i className={getPlatformIcon(link.account_platform)}></i>
            </span>
        </span>
    );
}

function AccountAvatarStack({ links, variant }: { links: SiteLink[]; variant: 'card' | 'modal' }) {
    const visibleLinks = links.slice(0, variant === 'card' ? 3 : 4);
    const hiddenCount = Math.max(0, links.length - visibleLinks.length);

    return (
        <div className={`account-avatar-stack ${variant}`} aria-label={`${links.length}개 계정`}>
            {visibleLinks.map((link, index) => (
                <span
                    key={getLinkKey(link)}
                    className="account-stack-avatar"
                    style={{ zIndex: visibleLinks.length - index } as React.CSSProperties}
                >
                    {link.image_url ? (
                        <img src={link.image_url} alt={getAccountTitle(link)} loading="lazy" referrerPolicy="no-referrer" />
                    ) : (
                        <i className={getPlatformIcon(link.account_platform)}></i>
                    )}
                    <span className={`account-mini-platform ${link.account_platform || 'other'}`}>
                        <i className={getPlatformIcon(link.account_platform)}></i>
                    </span>
                </span>
            ))}
            {hiddenCount > 0 && <span className="account-stack-more">+{hiddenCount}</span>}
        </div>
    );
}
