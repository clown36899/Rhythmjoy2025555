import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import type { Event as AppEvent } from '../../../lib/supabase';
import '../../../styles/domains/events.css';
import '../../../styles/components/NewEventsListModal.css';
import '../../../styles/components/NewEventsListModalV1.css';
import '../../../styles/components/NewEventsListModalV2.css';
import '../../../styles/components/NewEventsListModalV3.css';
import '../../../styles/components/NewEventsListModalV4.css';
import '../../../styles/components/NewEventsListModalV5.css';
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
    const [v1ActiveIndex, setV1ActiveIndex] = useState(-1);
    const [v1Stage, setV1Stage] = useState<'opening' | 'spotlight' | 'outro'>('opening');
    const [v1Interval, setV1Interval] = useState(1500); // Initial 1.5s for spotlight
    const [v5ActiveIndex, setV5ActiveIndex] = useState(-1);
    const [v5Stage, setV5Stage] = useState<'opening' | 'spotlight' | 'outro'>('opening');
    const [dbEvents, setDbEvents] = useState<AppEvent[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Fetch latest 15 events (Class & Event only)
    useEffect(() => {
        if (isOpen) {
            const fetchLatestEvents = async () => {
                setIsLoading(true);
                try {
                    const { data, error } = await supabase
                        .from('events')
                        .select('*')
                        .in('category', ['class', 'party']) // ONLY Class & Party (Excluded Social)
                        .order('created_at', { ascending: false })
                        .limit(20); // EXTENDED TO 20

                    if (error) throw error;
                    if (data) setDbEvents(data as AppEvent[]);
                } catch (err) {
                    console.error('Failed to fetch latest events for showcase:', err);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchLatestEvents();
        }
    }, [isOpen]);

    // Use dbEvents if available (user wants latest 15 from table), otherwise fallback to props
    const activeEvents = useMemo(() => dbEvents.length > 0 ? dbEvents : events, [dbEvents, events]);
    const v1Events = useMemo(() => activeEvents.slice(0, 15), [activeEvents]);

    // V1 Cinema Sequence Controller 
    useEffect(() => {
        if (showcaseVersion === 1 && viewMode === 'showcase' && isOpen && v1Events.length > 0) {
            if (v1Stage === 'opening') {
                setV1ActiveIndex(-1);
                setV1Interval(1000); // Reset interval to 1s (Faster start)
                const stageTimer = setTimeout(() => {
                    setV1Stage('spotlight');
                    setV1ActiveIndex(0);
                }, 5500); // 5.5s intro
                return () => clearTimeout(stageTimer);
            }

            if (v1Stage === 'outro') {
                setV1ActiveIndex(v1Events.length);
                const loopTimer = setTimeout(() => {
                    setV1Stage('opening');
                }, 3000);
                return () => clearTimeout(loopTimer);
            }
        }
    }, [showcaseVersion, viewMode, isOpen, v1Events.length, v1Stage]);

    // V1 Sequential Spotlight Timer with Acceleration
    useEffect(() => {
        if (showcaseVersion === 1 && viewMode === 'showcase' && isOpen && v1Events.length > 0 && v1Stage === 'spotlight') {
            const timer = setTimeout(() => {
                setV1ActiveIndex(prev => {
                    if (prev >= v1Events.length - 1) {
                        setV1Stage('outro');
                        return prev;
                    }
                    // Speed up: 20% faster each step (0.9 -> 0.8), min 200ms
                    setV1Interval(cur => Math.max(200, cur * 0.8));
                    return prev + 1;
                });
            }, v1Interval);
            return () => clearTimeout(timer);
        }
    }, [showcaseVersion, viewMode, isOpen, v1Events.length, v1Stage, v1ActiveIndex, v1Interval]);

    // V5 Cinema Sequence Controller
    useEffect(() => {
        if (showcaseVersion === 5 && viewMode === 'showcase' && isOpen && activeEvents.length > 0) {
            if (v5Stage === 'opening') {
                setV5ActiveIndex(-1);
                const stageTimer = setTimeout(() => {
                    setV5Stage('spotlight');
                    setV5ActiveIndex(0);
                }, 2500);
                return () => clearTimeout(stageTimer);
            }
            if (v5Stage === 'outro') {
                setV5ActiveIndex(activeEvents.length);
                const loopTimer = setTimeout(() => {
                    setV5Stage('opening');
                }, 3000);
                return () => clearTimeout(loopTimer);
            }
        }
    }, [showcaseVersion, viewMode, isOpen, activeEvents.length, v5Stage]);

    useEffect(() => {
        if (showcaseVersion === 5 && viewMode === 'showcase' && isOpen && events.length > 0 && v5Stage === 'spotlight') {
            const spotlightTimer = setInterval(() => {
                setV5ActiveIndex(prev => {
                    if (prev >= events.length - 1) {
                        setV5Stage('outro');
                        return prev;
                    }
                    return prev + 1;
                });
            }, 1500); // 1.5s for cyber feel
            return () => clearInterval(spotlightTimer);
        }
    }, [showcaseVersion, viewMode, isOpen, activeEvents.length, v5Stage]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            setPage(0);
            setViewMode('selector');
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    const pages = useMemo(() => {
        const result = [];
        for (let i = 0; i < activeEvents.length; i += 12) {
            result.push(activeEvents.slice(i, i + 12));
        }
        return result.length > 0 ? result : [[]];
    }, [activeEvents]);

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
                            <div className="NEL-selectorView">
                                <div className="NEL-sTitleGroup">
                                    <h2 className="NEL-sTitle">어떻게 보여드릴까요?</h2>
                                    <p className="NEL-sDesc">원하는 스타일로 신규 이벤트를 감상해보세요.</p>
                                </div>
                                <div className="NEL-sGrid">
                                    {[1, 2, 3, 4].map(v => (
                                        <div
                                            key={v}
                                            className="NEL-sCard showcase-card"
                                            onClick={() => {
                                                setShowcaseVersion(v);
                                                setV1ActiveIndex(-1);
                                                setV1Stage('opening');
                                                setV5ActiveIndex(-1);
                                                setV5Stage('opening');
                                                setViewMode('showcase');
                                            }}
                                        >
                                            <div className="NEL-sPreview">
                                                <div className="NEL-sIcon"><i className={`ri-number-${v}`}></i></div>
                                            </div>
                                            <div className="NEL-sMeta">STYLE V{v}</div>
                                            <h4 className="NEL-sLabel">시네마틱 {v === 1 ? '빌보드' : v === 2 ? '스트림' : v === 3 ? '캔버스' : '키네틱'}</h4>
                                        </div>
                                    ))}
                                    <div
                                        className="NEL-sCard showcase-card v5-card"
                                        onClick={() => {
                                            setShowcaseVersion(5);
                                            setV5ActiveIndex(-1);
                                            setV5Stage('opening');
                                            setViewMode('showcase');
                                        }}
                                    >
                                        <div className="NEL-sPreview">
                                            <div className="NEL-sIcon"><i className="ri-flashlight-line"></i></div>
                                        </div>
                                        <div className="NEL-sMeta">STYLE V5</div>
                                        <h4 className="NEL-sLabel">사이버 키네틱</h4>
                                    </div>
                                    <div
                                        className="NEL-sCard list-card"
                                        onClick={() => setViewMode('list')}
                                    >
                                        <div className="NEL-sPreview">
                                            <div className="NEL-sIcon"><i className="ri-layout-grid-line"></i></div>
                                        </div>
                                        <div className="NEL-sMeta">LIST VIEW</div>
                                        <h4 className="NEL-sLabel">목록으로 보기</h4>
                                    </div>
                                </div>
                            </div>
                        ) : viewMode === 'list' ? (
                            <div className="NEL-listView">
                                <div className="NEL-grid">
                                    {currentEvents.map(event => (
                                        <div key={event.id} className="NEL-item list-text-only" onClick={() => onEventClick(event)}>
                                            <div className="NEL-itemInfo">
                                                <div className="NEL-itemHeader">
                                                    <span className={`NEL-catBadge ${getCategoryColor(event.category)}`}>{getCategoryName(event.category)}</span>
                                                    <h4 className="NEL-itemTitle">{event.title}</h4>
                                                </div>
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
                                    <div className="NEL-cinematicV1">
                                        <div className="NEL-kineticCanvas">
                                            {v1Events.map((event, idx) => (
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
                                            <div className="NEL-v1Meta">LATEST {v1Events.length} EVENTS</div>
                                            <h1 className="NEL-v1Title">DANce billboard</h1>
                                        </div>

                                        {/* Sequential Spotlight Stage */}
                                        <div className="v1-spotlight-stage">
                                            {v1Events.map((event, idx) => (
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
                                        <div className={`v1-outro-stage ${v1Stage === 'outro' ? 'active' : ''}`}>
                                            <div className="v1-outro-content">
                                                <div className="v1-outro-site">swingenjoy.com</div>
                                                <div className="v1-outro-brand">DANCE BILLBOARD</div>
                                            </div>
                                        </div>
                                    </div>
                                ) : showcaseVersion === 2 ? (
                                    <div className="NEL-cinematicV2">
                                        <div className="NEL-streamBelt">
                                            {[...activeEvents, ...activeEvents].map((event, idx) => (
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
                                    <div className="NEL-cinematicV3">
                                        <div className="NEL-cinemaStage">
                                            <div className="NEL-cinemaTrack">
                                                {activeEvents.map((event, idx) => (
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
                                ) : showcaseVersion === 5 ? (
                                    /* Version 5: Cyber Kinetic & Glitch (Redone) */
                                    <div className="NEL-cinematicV5">
                                        {/* Background Glitch Canvas */}
                                        <div className="NEL-v5Backdrop">
                                            {activeEvents.map((event, idx) => (
                                                <div key={`v5-bg-${event.id}-${idx}`} className="NEL-v5Tile">
                                                    <img src={event.image_thumbnail} alt="" />
                                                </div>
                                            ))}
                                        </div>

                                        {/* Digital Scan Opening */}
                                        <div className={`NEL-v5Opening ${v5Stage === 'opening' ? 'active' : ''}`}>
                                            <div className="v5-title-scanner">Billboard</div>
                                            <div className="v5-scan-progress">ACCESS_GRANTED</div>
                                        </div>

                                        {/* 3D Perspective Carousel Stage */}
                                        <div className="v5-spotlight-stage">
                                            {activeEvents.map((event, idx) => {
                                                const isActive = v5ActiveIndex === idx;
                                                const isNext = v5ActiveIndex + 1 === idx || (v5ActiveIndex === activeEvents.length - 1 && idx === 0);

                                                return (
                                                    <div
                                                        key={`v5-spot-${event.id}`}
                                                        className={`v5-spot-item ${isActive ? 'active' : ''} ${isNext ? 'next' : ''}`}
                                                    >
                                                        <div className="v5-spot-card">
                                                            <div className="v5-spot-media">
                                                                <img src={event.image_medium || event.image_thumbnail} alt="" />
                                                            </div>
                                                            <div className="v5-spot-info">
                                                                <h2 className="v5-spot-title">{event.title}</h2>
                                                                <div className="v5-spot-date">{getDateText(event)}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Digital Dissolve Outro Stage */}
                                        <div className={`v5-outro-stage ${v5Stage === 'outro' ? 'active' : ''}`}>
                                            <div className="v5-outro-brand">DISCONNECTED</div>
                                            <div className="v5-outro-tagline">ENJOY THE RHYTHM_</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="NEL-cinematicV4">
                                        <div className="v4-kinetic-stage">
                                            <div className="v4-brand-canvas">
                                                <div className="v4-brand-row">DANCE BILLBOARD</div>
                                                <div className="v4-brand-row outline">DANCE BILLBOARD</div>
                                                <div className="v4-brand-row">DANCE BILLBOARD</div>
                                            </div>
                                            <div className="v4-kinetic-wall">
                                                {[...activeEvents, ...activeEvents].map((event, idx) => (
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
