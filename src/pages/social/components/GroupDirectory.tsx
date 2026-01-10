import React, { useState, useMemo } from 'react';
import type { SocialGroup } from '../types';
import './GroupDirectory.css';


interface GroupDirectoryProps {
    groups: SocialGroup[];
    favorites: number[];
    onToggleFavorite: (groupId: number) => void;
    onGroupClick: (group: SocialGroup) => void; // Legacy name: Opens Schedule Calendar
    onGroupDetailClick?: (group: SocialGroup) => void; // New: Opens Info Modal
    onEditGroup: (group: SocialGroup) => void;
    onAddSchedule: (groupId: number) => void;
    isAdmin: boolean;
    hideTitle?: boolean;
    currentUserId?: string; // Current user ID for permission checks
    initialTab?: string | null;
    onEditRecruit?: (group: SocialGroup) => void;
    onOpenRecruit?: (group: SocialGroup) => void;
}

const typeLabels: Record<string, string> = {
    all: '전체',
    club: '동호회',
    bar: '스윙바',
    etc: '기타',
    other: '기타'
};

const getRegionFromAddress = (address?: string): string | null => {
    if (!address) return null;
    // 서울시, 서울특별시, 부산시, 부산광역시 등 앞 두 글자만 따거나 매핑
    // 간단하게 공백으로 분리 후 첫 단어의 앞 2글자 사용 (e.g., "서울시" -> "서울")
    const firstWord = address.split(' ')[0];
    if (firstWord.length >= 2) {
        return firstWord.substring(0, 2);
    }
    return null;
};

const GroupDirectory: React.FC<GroupDirectoryProps> = ({
    groups,
    favorites,
    onToggleFavorite,
    onGroupClick,
    onGroupDetailClick,
    onEditGroup,
    onAddSchedule,
    isAdmin,
    hideTitle = false,
    currentUserId,
    initialTab,
    onOpenRecruit
}) => {
    const [activeTab, setActiveTab] = useState(initialTab || 'all');
    // internal modal state removed

    // 동적으로 분류 추출
    const categories = useMemo(() => {
        const types = Array.from(new Set(groups.map(g => g.type)));
        return ['all', ...types];
    }, [groups]);

    // 필터링된 그룹 리스트
    // 필터링된 그룹 리스트
    const filteredGroups = useMemo(() => {
        if (activeTab === 'all') return groups;
        return groups.filter(g => g.type === activeTab);
    }, [groups, activeTab]);

    // Update activeTab when initialTab changes (optional, but good for sync)
    React.useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    return (
        <section className={`group-directory-container ${hideTitle ? 'no-title' : ''}`}>
            {!hideTitle && (
                <div className="section-header-area">
                    <h2 className="section-title">단체</h2>
                    <span className="count-badge">{groups.length}개 단체</span>
                </div>
            )}

            {/* 탭 메뉴 */}
            <div className="group-tabs-container">
                <div className="group-tabs">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            className={`group-tab ${activeTab === cat ? 'active' : ''}`}
                            onClick={() => setActiveTab(cat)}
                        >
                            {cat === 'all' ? (
                                <span className="manual-label-wrapper">
                                    <span className="translated-part">All</span>
                                    <span className="fixed-part ko" translate="no">전체</span>
                                    <span className="fixed-part en" translate="no">All</span>
                                </span>
                            ) : (
                                typeLabels[cat] || cat
                            )}
                            {activeTab === cat && <span className="tab-count">{filteredGroups.length}</span>}
                        </button>
                    ))}
                </div>
            </div>

            <div className="group-list">
                {filteredGroups.length > 0 ? (
                    filteredGroups.map((group) => {
                        const isFavorited = favorites.includes(group.id);

                        return (
                            <div
                                key={group.id}
                                className="group-wide-card"
                                data-analytics-id={group.id}
                                data-analytics-type="group"
                                data-analytics-title={group.name}
                                data-analytics-section="group_directory"
                                onClick={() => {
                                    if (onGroupDetailClick) {
                                        onGroupDetailClick(group);
                                    } else {
                                        onGroupClick(group); // Fallback
                                    }
                                }}
                            >
                                <div className="group-wide-image">
                                    {getRegionFromAddress(group.address) && (
                                        <div className="group-region-badge">
                                            <i className="ri-map-pin-line" style={{ marginRight: '2px' }}></i>
                                            {getRegionFromAddress(group.address)}
                                        </div>
                                    )}
                                    {(group.image_thumbnail || group.image_url) ? (
                                        <img src={group.image_thumbnail || group.image_url} alt={group.name} loading="lazy" />
                                    ) : (
                                        <div className="group-placeholder">
                                            <i className="ri-team-line"></i>
                                        </div>
                                    )}
                                    <div className="group-type-tag">
                                        {typeLabels[group.type] || group.type}
                                    </div>
                                    {group.recruit_content && (
                                        <div className="group-recruit-badge">NEW</div>
                                    )}
                                </div>

                                <div className="group-wide-info">
                                    <div className="group-wide-header">
                                        <h3 className="group-wide-name">{group.name}</h3>
                                        <button
                                            className={`fav-btn ${isFavorited ? 'active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleFavorite(group.id);
                                            }}
                                        >
                                            <i className={isFavorited ? "ri-star-fill" : "ri-star-line"}></i>
                                        </button>
                                    </div>
                                    <p className="group-wide-desc">{group.description || '아직 설명이 없습니다.'}</p>

                                    <div className="group-wide-footer">
                                        {/* Only show schedule button to group creator */}
                                        {currentUserId && group.user_id === currentUserId && (
                                            <button
                                                className="view-calendar-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onGroupClick(group);
                                                }}
                                            >
                                                <i className="ri-calendar-line"></i> 일정 달력
                                            </button>
                                        )}
                                        {/* New Recruit Check Button */}
                                        {group.recruit_content && (
                                            <button
                                                className="view-recruit-btn"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onOpenRecruit?.(group);
                                                }}
                                            >
                                                <i className="ri-megaphone-line"></i> 신규모집
                                            </button>
                                        )}
                                        {isAdmin && (
                                            <>
                                                <button
                                                    className="admin-add-item-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onAddSchedule(group.id);
                                                    }}
                                                >
                                                    <i className="ri-add-line"></i> 일정 추가
                                                </button>
                                                <button
                                                    className="admin-edit-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onEditGroup(group);
                                                    }}
                                                >
                                                    <i className="ri-edit-circle-line"></i> 정보 수정
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="empty-filter-result">
                        해당 분류의 단체가 없습니다.
                    </div>
                )}
            </div>
            {/* Modal removed: handled by parent now */}
        </section>
    );
};

export default GroupDirectory;
