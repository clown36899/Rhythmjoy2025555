import React, { useState } from 'react';
import { createPortal } from 'react-dom';

// Define types locally if not imported
interface PushPreferences {
    pref_events: boolean;
    pref_class: boolean;
    pref_clubs: boolean;
    pref_filter_tags: string[] | null;
    pref_filter_class_genres: string[] | null;
}

interface PwaNotificationModalProps {
    isOpen: boolean;
    onConfirm: (prefs: PushPreferences) => void;
    onCancel: (dontShowAgain: boolean) => void;
    initialPrefs?: PushPreferences | null;
}

export const PwaNotificationModal: React.FC<PwaNotificationModalProps> = ({ isOpen, onConfirm, onCancel, initialPrefs }) => {
    const [dontShowAgain, setDontShowAgain] = useState(false);

    // Initial Defaults
    const defaultTags = ['파티', '워크샵', '대회', '기타'];
    const defaultGenres = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];

    // Initialize state from props or defaults
    const [prefs, setPrefs] = useState<PushPreferences>(() => {
        if (initialPrefs) {
            return {
                pref_events: initialPrefs.pref_events,
                pref_class: initialPrefs.pref_class,
                pref_clubs: initialPrefs.pref_clubs,
                // DB의 null은 '전체 선택'을 의미하므로 UI에서는 풀 리스트로 보여줌
                pref_filter_tags: initialPrefs.pref_filter_tags || defaultTags,
                pref_filter_class_genres: initialPrefs.pref_filter_class_genres || defaultGenres
            };
        }
        return {
            pref_events: false,
            pref_class: false,
            pref_clubs: false,
            pref_filter_tags: defaultTags,
            pref_filter_class_genres: defaultGenres
        };
    });

    // Reset state when isOpen becomes true (if needed to sync with fresh props)
    // However, usually component remounts or we can use useEffect
    React.useEffect(() => {
        if (isOpen && initialPrefs) {
            setPrefs({
                pref_events: initialPrefs.pref_events,
                pref_class: initialPrefs.pref_class,
                pref_clubs: initialPrefs.pref_clubs,
                pref_filter_tags: initialPrefs.pref_filter_tags || defaultTags,
                pref_filter_class_genres: initialPrefs.pref_filter_class_genres || defaultGenres
            });
        }
    }, [isOpen, initialPrefs]);

    if (!isOpen) return null;

    console.log('[PwaModal] Rendering... zIndex max');

    const togglePref = (key: 'pref_events' | 'pref_class' | 'pref_clubs') => {
        setPrefs(prev => {
            const nextVal = !prev[key];
            const updates: any = { [key]: nextVal };

            // [Change] 꺼져있던 카테고리를 켤 때, 태그가 하나도 없으면 '전체 선택'으로 초기화
            if (nextVal) {
                if (key === 'pref_events' && (!prev.pref_filter_tags || prev.pref_filter_tags.length === 0)) {
                    updates.pref_filter_tags = ['워크샵', '파티', '대회', '기타'];
                }
                if (key === 'pref_class' && (!prev.pref_filter_class_genres || prev.pref_filter_class_genres.length === 0)) {
                    updates.pref_filter_class_genres = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                }
            }
            return { ...prev, ...updates };
        });
    };

    const toggleTag = (tag: string) => {
        setPrefs(prev => {
            const current = prev.pref_filter_tags || [];
            let nextTags;
            if (current.includes(tag)) {
                nextTags = current.filter(t => t !== tag);
            } else {
                nextTags = [...current, tag];
            }

            // [Change] 만약 모든 태그가 해제되면 카테고리 자체를 OFF
            if (nextTags.length === 0) {
                return { ...prev, pref_filter_tags: nextTags, pref_events: false };
            }
            return { ...prev, pref_filter_tags: nextTags };
        });
    };

    const toggleClassGenre = (genre: string) => {
        setPrefs(prev => {
            const current = prev.pref_filter_class_genres || [];
            let nextGenres;
            if (current.includes(genre)) {
                nextGenres = current.filter(t => t !== genre);
            } else {
                nextGenres = [...current, genre];
            }

            // [Change] 만약 모든 장르가 해제되면 카테고리 자체를 OFF
            if (nextGenres.length === 0) {
                return { ...prev, pref_filter_class_genres: nextGenres, pref_class: false };
            }
            return { ...prev, pref_filter_class_genres: nextGenres };
        });
    };

    const handleConfirm = () => {
        // null implies "ALL" if that's the convention, OR just pass the array.
        // The implementation_plan suggests arrays for filters.
        onConfirm({
            pref_events: prefs.pref_events,
            pref_class: prefs.pref_class,
            pref_clubs: prefs.pref_clubs,
            pref_filter_tags: prefs.pref_filter_tags,
            pref_filter_class_genres: prefs.pref_filter_class_genres
        });
    };

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2147483647 // Max Safe Integer
        }}
            onClick={() => onCancel(dontShowAgain)}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    backgroundColor: 'white',
                    borderRadius: '20px',
                    padding: '24px',
                    width: '90%',
                    maxWidth: '380px',
                    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                    animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}
            >
                <div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 800, color: '#111827' }}>
                        🔔 알림 설정 안내
                    </h2>
                    <p style={{ margin: 0, fontSize: '15px', color: '#4b5563', lineHeight: '1.5' }}>
                        관심있는 장르의 행사 소식을 받아보세요.<br />
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                            (설정은 좌측 상단 <b>[메뉴 <i className="ri-menu-line" style={{ verticalAlign: 'bottom' }}></i> &gt; 알림 설정]</b>에서 언제든 변경할 수 있습니다.)
                        </span>
                    </p>
                </div>

                <div className="pwa-noti-options">

                    {/* 1. 행사 알림 (Events) */}
                    <div className="pwa-option-group">
                        <div className="pwa-option-row" onClick={() => togglePref('pref_events')}>
                            <div className="pwa-option-label">
                                <span className="pwa-main-label">행사 알림</span>
                                <span className="pwa-sub-label">워크샵, 파티, 대회 등</span>
                            </div>
                            <div className={`pwa-toggle ${prefs.pref_events ? 'active' : ''}`}>
                                <div className="pwa-toggle-thumb"></div>
                            </div>
                        </div>

                        {prefs.pref_events && (
                            <div className="pwa-tags-row">
                                {['워크샵', '파티', '대회', '기타'].map(tag => (
                                    <button
                                        key={tag}
                                        className={`pwa-tag-btn ${!prefs.pref_filter_tags || prefs.pref_filter_tags.includes(tag) ? 'selected' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleTag(tag);
                                        }}
                                    >
                                        {(!prefs.pref_filter_tags || prefs.pref_filter_tags.includes(tag)) && <span style={{ marginRight: '4px' }}>✓</span>}
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        )}

                    </div>

                    {/* 2. 강습 알림 (Classes) */}
                    <div className="pwa-option-group">
                        <div className="pwa-option-row" onClick={() => togglePref('pref_class')}>
                            <div className="pwa-option-label">
                                <span className="pwa-main-label">강습 알림</span>
                                <span className="pwa-sub-label">댄서들의 정규/오픈 강습</span>
                            </div>
                            <div className={`pwa-toggle ${prefs.pref_class ? 'active' : ''}`}>
                                <div className="pwa-toggle-thumb"></div>
                            </div>
                        </div>

                        {prefs.pref_class && (
                            <div className="pwa-tags-row">
                                {['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'].map(genre => (
                                    <button
                                        key={genre}
                                        className={`pwa-tag-btn ${!prefs.pref_filter_class_genres || prefs.pref_filter_class_genres.includes(genre) ? 'selected' : ''}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleClassGenre(genre);
                                        }}
                                    >
                                        {(!prefs.pref_filter_class_genres || prefs.pref_filter_class_genres.includes(genre)) && <span style={{ marginRight: '4px' }}>✓</span>}
                                        {genre}
                                    </button>
                                ))}
                            </div>
                        )}

                    </div>

                    {/* 3. 동호회 강습 알림 (Club Lessons) - Toggle Only */}
                    <div className="pwa-option-group">
                        <div className="pwa-option-row" onClick={() => togglePref('pref_clubs')}>
                            <div className="pwa-option-label">
                                <span className="pwa-main-label">동호회 강습 알림</span>
                                <span className="pwa-sub-label">동호회 주최 강습 및 소식</span>
                            </div>
                            <div className={`pwa-toggle ${prefs.pref_clubs ? 'active' : ''}`}>
                                <div className="pwa-toggle-thumb"></div>
                            </div>
                        </div>
                    </div>

                </div>

                <div style={{ marginBottom: '4px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px', color: '#6b7280' }}>
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(e) => setDontShowAgain(e.target.checked)}
                            style={{ width: '18px', height: '18px', accentColor: '#2563eb' }}
                        />
                        다시 보지 않기
                    </label>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                        onClick={() => onCancel(dontShowAgain)}
                        style={{
                            flex: 1,
                            padding: '14px',
                            border: '1px solid #e5e7eb',
                            borderRadius: '12px',
                            backgroundColor: 'white',
                            color: '#4b5563',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        취소
                    </button>
                    <button
                        onClick={handleConfirm}
                        style={{
                            flex: 1,
                            padding: '14px',
                            border: 'none',
                            borderRadius: '12px',
                            backgroundColor: '#2563eb',
                            color: 'white',
                            fontSize: '15px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)'
                        }}
                    >
                        적용하기
                    </button>
                </div>
            </div>
            <style>
                {`
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px) scale(0.95); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }

                    .pwa-noti-options {
                        display: flex;
                        flex-direction: column;
                        gap: 16px;
                    }

                    .pwa-option-group {
                        border: 1px solid #f3f4f6;
                        border-radius: 12px;
                        padding: 12px;
                        background-color: #f9fafb;
                    }

                    .pwa-option-row {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        cursor: pointer;
                    }

                    .pwa-option-label {
                        display: flex;
                        flex-direction: column;
                        gap: 2px;
                    }

                    .pwa-main-label {
                        font-size: 15px;
                        font-weight: 600;
                        color: #1f2937;
                    }

                    .pwa-sub-label {
                        font-size: 12px;
                        color: #6b7280;
                    }

                    .pwa-toggle {
                        width: 44px;
                        height: 24px;
                        background-color: #e5e7eb;
                        border-radius: 9999px;
                        position: relative;
                        transition: background-color 0.2s;
                        flex-shrink: 0;
                    }

                    .pwa-toggle.active {
                        background-color: #2563eb;
                    }

                    .pwa-toggle-thumb {
                        width: 20px;
                        height: 20px;
                        background-color: white;
                        border-radius: 50%;
                        position: absolute;
                        top: 2px;
                        left: 2px;
                        transition: transform 0.2s;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                    }

                    .pwa-toggle.active .pwa-toggle-thumb {
                        transform: translateX(20px);
                    }

                    .pwa-tags-row {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 6px;
                        margin-top: 12px;
                        padding-top: 12px;
                        border-top: 1px dashed #e5e7eb;
                    }

                    .pwa-tag-btn {
                        padding: 8px 12px;
                        border-radius: 20px; /* Pill shape */
                        border: 1px solid #e5e7eb;
                        background-color: #f3f4f6;
                        color: #4b5563;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    }

                    .pwa-tag-btn:hover {
                        background-color: #e5e7eb;
                    }

                    .pwa-tag-btn.selected {
                        background-color: #2563eb;
                        border-color: #2563eb;
                        color: white !important;
                        font-weight: 600;
                        box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
                        transform: translateY(-1px);
                    }
                    
                    .pwa-all-hint {
                        margin-top: 8px;
                        font-size: 12px;
                        color: #2563eb;
                        background-color: #eff6ff;
                        padding: 4px 8px;
                        border-radius: 4px;
                        display: inline-block;
                    }
                `}
            </style>
        </div>,
        document.body
    );
};
