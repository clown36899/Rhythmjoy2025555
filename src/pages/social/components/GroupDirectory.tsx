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
}

const typeLabels: Record<string, string> = {
    all: '전체',
    club: '동호회',
    bar: '스윙바',
    etc: '기타',
    other: '기타'
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
    hideTitle = false
}) => {
    const [activeTab, setActiveTab] = useState('all');

    // 동적으로 분류 추출
    const categories = useMemo(() => {
        const types = Array.from(new Set(groups.map(g => g.type)));
        return ['all', ...types];
    }, [groups]);

    // 필터링된 그룹 리스트
    const filteredGroups = useMemo(() => {
        if (activeTab === 'all') return groups;
        return groups.filter(g => g.type === activeTab);
    }, [groups, activeTab]);

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
                                        <button
                                            className="view-calendar-btn"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onGroupClick(group);
                                            }}
                                        >
                                            <i className="ri-calendar-line"></i> 일정 달력
                                        </button>
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
        </section>
    );
};

export default GroupDirectory;
