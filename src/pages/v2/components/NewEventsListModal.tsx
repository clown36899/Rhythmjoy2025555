import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../../../styles/domains/events.css';
import '../../../styles/components/NewEventsListModal.css';
import '../../../styles/components/NewEventsListModalV1.css';
import '../../../styles/components/NewEventsListModalV2.css';
import '../../../styles/components/NewEventsListModalV3.css';
import '../../../styles/components/NewEventsListModalV4.css';
import { formatEventDate } from '../../../utils/dateUtils';

interface NewEventsListModalProps {
    isOpen: boolean;
    onClose: () => void;
    events: AppEvent[];
    onEventClick: (event: AppEvent) => void;
}

export default function NewEventsListModal({
    isOpen,
    onClose,
    events,
    onEventClick
}: NewEventsListModalProps) {
    const [viewMode, setViewMode] = useState<'list' | 'showcase' | 'selector'>('selector');
    const [showcaseVersion, setShowcaseVersion] = useState(3);
    const [page, setPage] = useState(0);
    const [v1ActiveIndex, setV1ActiveIndex] = useState(-1); // -1: Opening state
    const [v1Stage, setV1Stage] = useState<'opening' | 'spotlight' | 'outro'>('opening');

    // V1 Cinema Sequence Controller (Opening -> Spotlight -> Outro -> Loop)
    useEffect(() => {
        if (showcaseVersion === 1 && viewMode === 'showcase' && isOpen && events.length > 0) {
            if (v1Stage === 'opening') {
                setV1ActiveIndex(-1);
                const stageTimer = setTimeout(() => {
                    setV1Stage('spotlight');
                    setV1ActiveIndex(0);
                }, 2500);
                return () => clearTimeout(stageTimer);
            }

            if (v1Stage === 'outro') {
                setV1ActiveIndex(events.length); // Special index for outro
                const loopTimer = setTimeout(() => {
                    setV1Stage('opening');
                }, 3000); // Show outro for 3s
                return () => clearTimeout(loopTimer);
            }
        }
    }, [showcaseVersion, viewMode, isOpen, events.length, v1Stage]);

    // 2. Sequential Spotlight Timer
    useEffect(() => {
        if (showcaseVersion === 1 && viewMode === 'showcase' && isOpen && events.length > 0 && v1Stage === 'spotlight') {
            const spotlightTimer = setInterval(() => {
                setV1ActiveIndex(prev => {
                    if (prev >= events.length - 1) {
                        setV1Stage('outro');
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1000); // 1s interval
            return () => clearInterval(spotlightTimer);
        }
    }, [showcaseVersion, viewMode, isOpen, events.length, v1Stage]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPage(0);
            setViewMode('selector'); // Always start with selector when opened
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const pages = useMemo(() => {
        const result = [];
        for (let i = 0; i < events.length; i += 12) {
            result.push(events.slice(i, i + 12));
        }
        return result.length > 0 ? result : [[]];
    }, [events]);

    if (!isOpen) return null;

    const currentEvents = pages[page] || [];
    const totalPages = pages.length;

    const getCategoryColor = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social' || cat === 'party') return 'cat-bg-social';
        if (cat === 'regular' || cat === 'club') return 'cat-bg-regular';
        if (cat === 'class') return 'cat-bg-class';
        return 'cat-bg-default';
    };

    const getCategoryName = (category?: string) => {
        const cat = category?.toLowerCase();
        if (cat === 'social') return '소셜';
        if (cat === 'party') return '파티';
        if (cat === 'regular') return '정모';
        if (cat === 'club') return '동호회';
        if (cat === 'class') return '강습';
        return '기타';
    };

    const getDateText = (event: AppEvent) => {
        if (event.event_dates && event.event_dates.length > 0) {
            return formatEventDate(event.event_dates[0]) + (event.event_dates.length > 1 ? ' ...' : '');
        }
        const startDate = event.start_date || event.date;
        return startDate ? formatEventDate(startDate) : '';
    };

    return createPortal(
        <div className="NewEventsListModal" onClick={onClose}>
            <div className={`NEL-container ${viewMode === 'list' ? 'list-mode' : 'showcase-mode'}`} onClick={e => e.stopPropagation()}>
                <div className="NEL-header">
                    <div className="NEL-titleInfo">
                        <h3 className="NEL-title">신규 이벤트 <span className="NEL-badge">NEW</span></h3>
                        <span className="NEL-subtitle">최근 72시간 내 업데이트</span>
                    </div>
                    <div className="NEL-headerActions">
                        {events.length > 0 && viewMode !== 'selector' ? (
                            <button
                                className="NEL-modeBtn back-to-selector"
                                onClick={() => setViewMode('selector')}
                            >
                                <i className="ri-arrow-left-line"></i>

                            </button>
                        ) : (
                            <button className="NEL-closeBtn" onClick={onClose}><i className="ri-close-line"></i></button>
                        )}
                    </div>
                </div>

                <div className="NEL-body">
                    {events.length > 0 ? (
                        viewMode === 'selector' ? (
                            /* New Selector View: Choose Showcase version or List */
                            <div className="NEL-selectorView">
                                <div className="NEL-sTitleGroup">
                                    <h2 className="NEL-sTitle">어떻게 보여드릴까요?</h2>
                                    <p className="NEL-sDesc">원하는 스타일로 신규 이벤트를 감상해보세요.</p>
                                </div>
                                <div className="NEL-sGrid">
                                    {/* Showcase Version 1-4 */}
                                    {[1, 2, 3, 4].map(v => (
                                        <div
                                            key={v}
                                            className="NEL-sCard showcase-card"
                                            onClick={() => {
                                                setShowcaseVersion(v);
                                                setViewMode('showcase');
                                            }}
                                        >
                                            <div className="NEL-sIcon"><i className="ri-slideshow-view"></i></div>
                                            <div className="NEL-sMeta">STYLE V{v}</div>
                                            <h4 className="NEL-sLabel">시네마틱 {v === 1 ? '빌보드' : v === 2 ? '스트림' : v === 3 ? '캔버스' : '키네틱'}</h4>
                                        </div>
                                    ))}
                                    {/* List View Option */}
                                    <div
                                        className="NEL-sCard list-card"
                                        onClick={() => setViewMode('list')}
                                    >
                                        <div className="NEL-sIcon"><i className="ri-layout-grid-line"></i></div>
                                        <div className="NEL-sMeta">LIST VIEW</div>
                                        <h4 className="NEL-sLabel">목록으로 보기</h4>
                                    </div>
                                </div>
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="NEL-listView">
                                <div className="NEL-grid">
                                    {currentEvents.map(event => (
                                        <div key={event.id} className="NEL-item" onClick={() => onEventClick(event)}>
                                            <div className="NEL-thumbnail">
                                                <img src={event.image_thumbnail || event.image_medium} alt={event.title} loading="lazy" />
                                                <span className={`NEL-catBadge ${getCategoryColor(event.category)}`}>{getCategoryName(event.category)}</span>
                                            </div>
                                            <div className="NEL-itemInfo">
                                                <h4 className="NEL-itemTitle">{event.title}</h4>
                                                <div className="NEL-itemMeta">
                                                    <span><i className="ri-calendar-line"></i> {getDateText(event)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {totalPages > 1 && (
                                    <div className="NEL-pagination">
                                        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>이전</button>
                                        <span>{page + 1} / {totalPages}</span>
                                        <button disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>다음</button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`NEL-multiShowcase v${showcaseVersion}`}>
                                {showcaseVersion === 1 ? (
                                    /* Version 1: Kinetic Backdrop Montage with Sequential Spotlight */
                                    <div className="NEL-cinematicV1">
                                        {/* Background Flow */}
                                        <div className="NEL-kineticCanvas">
                                            {events.map((event, idx) => (
                                                <div
                                                    key={`${event.id}-${idx}`}
                                                    className={`NEL-kineticTile ${v1ActiveIndex === idx ? 'v1-active-tile' : ''}`}
                                                    style={{ '--delay': `${idx * 0.2}s` } as any}
                                                >
                                                    <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                </div>
                                            ))}
                                        </div>

                                        {/* Opening Title Overlay */}
                                        <div className="NEL-v1Overlay">
                                            <div className="NEL-v1Meta">NEW EVENTS ARRIVING</div>
                                            <h1 className="NEL-v1Title">DANce billboard</h1>
                                        </div>

                                        {/* Sequential Spotlight Stage */}
                                        <div className="v1-spotlight-stage">
                                            {events.map((event, idx) => (
                                                <div
                                                    key={`v1-spot-${event.id}`}
                                                    className={`v1-spot-item ${v1ActiveIndex === idx ? 'active' : ''}`}
                                                >
                                                    <div className="v1-spot-card">
                                                        <div className="v1-spot-media">
                                                            <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                        </div>
                                                        <div className="v1-spot-info">
                                                            <span className="v1-spot-cat">{getCategoryName(event.category)}</span>
                                                            <h2 className="v1-spot-title">{event.title}</h2>
                                                            <div className="v1-spot-date">{getDateText(event)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Outro Stage (New) */}
                                        <div className={`v1-outro-stage ${v1Stage === 'outro' ? 'active' : ''}`}>
                                            <div className="v1-outro-content">
                                                <div className="v1-outro-site">swingenjoy.com</div>
                                                <div className="v1-outro-brand">DANCE BILLBOARD</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : showcaseVersion === 2 ? (
                                    /* Version 2: Endless Streaming Flow */
                                    <div className="NEL-cinematicV2">
                                        <div className="NEL-streamBelt">
                                            {[...events, ...events].map((event, idx) => (
                                                <div key={`${event.id}-${idx}`} className="NEL-streamItem">
                                                    <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                    <div className="NEL-streamLabel">
                                                        <span>{getCategoryName(event.category)}</span>
                                                        <h4>{event.title}</h4>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : showcaseVersion === 3 ? (
                                    /* Version 3: Grand Cinema Rolling (Current Version) */
                                    <div className="NEL-cinematicV3">
                                        <div className="NEL-cinemaStage">
                                            <div className="NEL-cinemaTrack">
                                                {events.map((event, idx) => (
                                                    <div key={event.id} className="NEL-cinemaCard" style={{ '--idx': idx } as any}>
                                                        <div className="NEL-cardPoster">
                                                            <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                        </div>
                                                        <div className="NEL-cardInfo">
                                                            <div className="NEL-cardHeader">
                                                                <span className="NEL-cardCat">{getCategoryName(event.category)}</span>
                                                                <span className="NEL-cardDate">{getDateText(event)}</span>
                                                            </div>
                                                            <h2 className="NEL-cardTitle">{event.title}</h2>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Version 4: Cinematic Dance Billboard (Redone - Seamless Motion) */
                                    <div className="NEL-cinematicV4">
                                        <div className="v4-kinetic-stage">
                                            {/* Massive Background Branding */}
                                            <div className="v4-brand-canvas">
                                                <div className="v4-brand-row">DANCE BILLBOARD</div>
                                                <div className="v4-brand-row outline">DANCE BILLBOARD</div>
                                                <div className="v4-brand-row">DANCE BILLBOARD</div>
                                            </div>

                                            {/* Seamless Kinetic Wall of all events */}
                                            <div className="v4-kinetic-wall">
                                                {[...events, ...events].map((event, idx) => (
                                                    <div
                                                        key={`${event.id}-${idx}`}
                                                        className="v4-kinetic-poster"
                                                        style={{ '--v4-delay': `${idx * 0.15}s` } as any}
                                                    >
                                                        <div className="v4-poster-media">
                                                            <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                            <div className="v4-poster-overlay">
                                                                <span className="v4-p-cat">{getCategoryName(event.category)}</span>
                                                                <h4 className="v4-p-title">{event.title}</h4>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Foreground Impact Elements */}
                                            <div className="v4-impact-layer">
                                                <div className="v4-glitch-line"></div>
                                                <div className="v4-spotlight"></div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="NEL-cinematicFilters">
                                    <div className="NEL-vignette"></div>
                                    <div className="NEL-grain"></div>
                                </div>
                            </div>
                        )
                    ) : (
                        <div className="NEL-empty">등록된 이벤트가 없습니다.</div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
