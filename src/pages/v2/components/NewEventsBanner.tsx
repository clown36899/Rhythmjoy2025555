import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { useModalContext } from '../../../contexts/ModalContext';
import type { Event } from '../utils/eventListUtils';
import { formatEventDate } from '../../../utils/dateUtils';
import './NewEventsBanner.css';

type EdgeTone = 'dark' | 'light';
type SocialAdImageKind = 'photo' | 'poster' | 'unknown';

interface SocialAdImageAnalysis {
    kind: SocialAdImageKind;
    confidence: number;
}

const edgeToneCache = new Map<string, EdgeTone>();
const socialAdImageKindCache = new Map<string, SocialAdImageAnalysis>();
const EDGE_TONE_BLACK_LUMINANCE_THRESHOLD = 96;
const EDGE_TONE_BLACK_CHROMA_THRESHOLD = 52;
const EDGE_TONE_BLACK_SAMPLE_RATIO = 0.48;
const ONE_DAY_RECRUIT_ICON_SRC = '/icons/v2/oneday-recruit.svg';
const SOCIAL_POSTER_SCORE_THRESHOLD = 0.9;

const UNKNOWN_SOCIAL_IMAGE_ANALYSIS: SocialAdImageAnalysis = {
    kind: 'unknown',
    confidence: 0,
};

const isSocialAdEvent = (event: Event) => {
    const category = String(event.category || '').toLowerCase();
    const activityType = String((event as Event & { activity_type?: string | null }).activity_type || '').toLowerCase();
    const genre = String(event.genre || '').toLowerCase();

    return (
        category === 'social' ||
        activityType === 'social' ||
        genre.includes('소셜') ||
        genre.includes('social')
    );
};

const hasCustomEventImage = (event: Event) => Boolean(
    event.image_medium ||
    event.image_thumbnail ||
    event.image ||
    event.image_full
);

const getSocialImageUrlHint = (imageUrl: string): SocialAdImageAnalysis | null => {
    const normalizedUrl = imageUrl.toLowerCase();

    if (
        normalizedUrl.includes('/event-posters/') ||
        normalizedUrl.includes('event-posters%2f') ||
        normalizedUrl.includes('poster_') ||
        normalizedUrl.includes('_poster') ||
        normalizedUrl.includes('-poster')
    ) {
        return { kind: 'poster', confidence: 0.72 };
    }

    return null;
};

const detectSocialAdImageKind = (imageUrl: string): Promise<SocialAdImageAnalysis> => (
    new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('document unavailable'));
            return;
        }

        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            try {
                const width = 72;
                const height = 96;
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d', { willReadFrequently: true });

                if (!context) {
                    reject(new Error('canvas context unavailable'));
                    return;
                }

                context.drawImage(image, 0, 0, width, height);

                const imageData = context.getImageData(0, 0, width, height).data;
                const colorBins = new Map<string, number>();
                const cellSize = 8;
                const cellsWide = Math.ceil(width / cellSize);
                const cellsHigh = Math.ceil(height / cellSize);
                const cells = Array.from({ length: cellsWide * cellsHigh }, () => ({
                    edgeCount: 0,
                    samples: 0,
                    minLuminance: 255,
                    maxLuminance: 0,
                }));

                let strongEdgeCount = 0;
                let edgeSampleCount = 0;
                let highSaturationCount = 0;
                let pixelSampleCount = 0;

                for (let y = 0; y < height - 1; y += 1) {
                    for (let x = 0; x < width - 1; x += 1) {
                        const index = (y * width + x) * 4;
                        const alpha = imageData[index + 3];
                        if (alpha < 12) continue;

                        const red = imageData[index];
                        const green = imageData[index + 1];
                        const blue = imageData[index + 2];
                        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                        const maxChannel = Math.max(red, green, blue);
                        const minChannel = Math.min(red, green, blue);
                        const saturation = maxChannel === 0 ? 0 : (maxChannel - minChannel) / maxChannel;
                        const colorBin = `${red >> 4}-${green >> 4}-${blue >> 4}`;
                        const cellIndex = Math.floor(y / cellSize) * cellsWide + Math.floor(x / cellSize);
                        const cell = cells[cellIndex];

                        colorBins.set(colorBin, (colorBins.get(colorBin) || 0) + 1);
                        if (saturation > 0.58) highSaturationCount += 1;
                        pixelSampleCount += 1;

                        cell.samples += 1;
                        cell.minLuminance = Math.min(cell.minLuminance, luminance);
                        cell.maxLuminance = Math.max(cell.maxLuminance, luminance);

                        const rightIndex = index + 4;
                        const downIndex = ((y + 1) * width + x) * 4;
                        const rightLuminance = 0.299 * imageData[rightIndex] + 0.587 * imageData[rightIndex + 1] + 0.114 * imageData[rightIndex + 2];
                        const downLuminance = 0.299 * imageData[downIndex] + 0.587 * imageData[downIndex + 1] + 0.114 * imageData[downIndex + 2];
                        const edgeStrength = Math.abs(luminance - rightLuminance) + Math.abs(luminance - downLuminance);

                        if (edgeStrength > 78) {
                            strongEdgeCount += 1;
                            cell.edgeCount += 1;
                        }
                        edgeSampleCount += 1;
                    }
                }

                if (pixelSampleCount === 0 || edgeSampleCount === 0) {
                    reject(new Error('no image samples'));
                    return;
                }

                const sortedColorBins = [...colorBins.values()].sort((a, b) => b - a);
                const topTwelveColorRatio = sortedColorBins
                    .slice(0, 12)
                    .reduce((sum, count) => sum + count, 0) / pixelSampleCount;
                const uniqueColorRatio = colorBins.size / pixelSampleCount;
                const edgeDensity = strongEdgeCount / edgeSampleCount;
                const highSaturationRatio = highSaturationCount / pixelSampleCount;
                const textLikeCells = cells.filter((cell) => {
                    if (cell.samples < 20) return false;
                    const cellEdgeRatio = cell.edgeCount / cell.samples;
                    const luminanceRange = cell.maxLuminance - cell.minLuminance;
                    return cellEdgeRatio > 0.18 && cellEdgeRatio < 0.62 && luminanceRange > 84;
                }).length;
                const textLikeCellRatio = textLikeCells / cells.length;
                const aspectRatio = image.naturalHeight > 0 ? image.naturalHeight / Math.max(image.naturalWidth, 1) : 1;

                const posterScore =
                    topTwelveColorRatio * 0.9 +
                    textLikeCellRatio * 0.95 +
                    Math.min(edgeDensity * 2.3, 0.55) +
                    (aspectRatio > 1.18 ? 0.12 : 0) +
                    (highSaturationRatio > 0.22 ? 0.15 : 0) -
                    (uniqueColorRatio > 0.11 ? 0.22 : 0);
                const hasPosterLayoutCue =
                    topTwelveColorRatio > 0.46 &&
                    highSaturationRatio > 0.32 &&
                    textLikeCellRatio > 0.07;
                const hasTextPosterCue =
                    textLikeCellRatio > 0.1 &&
                    edgeDensity > 0.055;
                const isPoster = posterScore >= SOCIAL_POSTER_SCORE_THRESHOLD || hasPosterLayoutCue || hasTextPosterCue;
                const confidence = Math.min(
                    0.98,
                    0.52 + Math.abs(posterScore - SOCIAL_POSTER_SCORE_THRESHOLD) * 1.12,
                );

                resolve({
                    kind: isPoster ? 'poster' : 'photo',
                    confidence,
                });
            } catch (error) {
                reject(error);
            }
        };
        image.onerror = () => reject(new Error('image load failed'));
        image.src = imageUrl;
    })
);

const detectImageEdgeTone = (imageUrl: string): Promise<EdgeTone> => (
    new Promise((resolve, reject) => {
        if (typeof document === 'undefined') {
            reject(new Error('document unavailable'));
            return;
        }

        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            try {
                const width = 48;
                const height = 64;
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext('2d', { willReadFrequently: true });

                if (!context) {
                    reject(new Error('canvas context unavailable'));
                    return;
                }

                context.drawImage(image, 0, 0, width, height);

                const imageData = context.getImageData(0, 0, width, height).data;
                const edgeBand = Math.max(4, Math.round(Math.min(width, height) * 0.14));
                let luminanceSum = 0;
                let chromaSum = 0;
                let blackishSampleCount = 0;
                let sampleCount = 0;

                for (let y = 0; y < height; y += 1) {
                    for (let x = 0; x < width; x += 1) {
                        const isEdge =
                            x < edgeBand ||
                            x >= width - edgeBand ||
                            y < edgeBand ||
                            y >= height - edgeBand;

                        if (!isEdge) continue;

                        const index = (y * width + x) * 4;
                        const alpha = imageData[index + 3];
                        if (alpha < 12) continue;

                        const red = imageData[index];
                        const green = imageData[index + 1];
                        const blue = imageData[index + 2];
                        const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
                        const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);

                        luminanceSum += luminance;
                        chromaSum += chroma;
                        if (
                            luminance < EDGE_TONE_BLACK_LUMINANCE_THRESHOLD &&
                            chroma < EDGE_TONE_BLACK_CHROMA_THRESHOLD
                        ) {
                            blackishSampleCount += 1;
                        }
                        sampleCount += 1;
                    }
                }

                if (sampleCount === 0) {
                    reject(new Error('no edge samples'));
                    return;
                }

                const averageLuminance = luminanceSum / sampleCount;
                const averageChroma = chromaSum / sampleCount;
                const blackishRatio = blackishSampleCount / sampleCount;
                const isBlackEdge =
                    averageLuminance < EDGE_TONE_BLACK_LUMINANCE_THRESHOLD &&
                    averageChroma < EDGE_TONE_BLACK_CHROMA_THRESHOLD &&
                    blackishRatio >= EDGE_TONE_BLACK_SAMPLE_RATIO;

                resolve(isBlackEdge ? 'dark' : 'light');
            } catch (error) {
                reject(error);
            }
        };
        image.onerror = () => reject(new Error('image load failed'));
        image.src = imageUrl;
    })
);

interface NewEventsBannerProps {
    events: Event[];
    onEventClick: (event: Event) => void;
    defaultThumbnailClass: string;
    defaultThumbnailEvent: string;
    currentIndex?: number;
    onCurrentIndexChange?: (index: number) => void;
}

export const NewEventsBanner: React.FC<NewEventsBannerProps> = ({
    events,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    currentIndex: controlledCurrentIndex,
    onCurrentIndexChange,
}) => {
    const { openModal } = useModalContext();
    const navigate = useNavigate();
    const [internalCurrentIndex, setInternalCurrentIndex] = useState(() => {
        if (!events || events.length === 0) return 0;
        return Math.floor(Math.random() * events.length);
    });
    const isControlled = typeof controlledCurrentIndex === 'number';
    const currentIndex = isControlled
        ? Math.min(Math.max(controlledCurrentIndex ?? 0, 0), Math.max(events.length - 1, 0))
        : internalCurrentIndex;
    const [isPaused, setIsPaused] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isManualPaused, setIsManualPaused] = useState(false);
    const [isOneDayRecruitPressed, setIsOneDayRecruitPressed] = useState(false);
    const manualPauseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const oneDayRecruitPressTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const pendingEdgeToneUrlsRef = React.useRef<Set<string>>(new Set());
    const pendingSocialImageKindUrlsRef = React.useRef<Set<string>>(new Set());
    const dragStateRef = React.useRef({
        mouseDown: false,
        startX: 0,
        currentX: 0,
        moved: false,
        suppressClick: false,
    });
    const [edgeToneByUrl, setEdgeToneByUrl] = useState<Record<string, EdgeTone>>({});
    const [socialImageAnalysisByUrl, setSocialImageAnalysisByUrl] = useState<Record<string, SocialAdImageAnalysis>>({});

    useEffect(() => {
        return () => {
            if (manualPauseTimeoutRef.current) {
                clearTimeout(manualPauseTimeoutRef.current);
            }
            if (oneDayRecruitPressTimeoutRef.current) {
                clearTimeout(oneDayRecruitPressTimeoutRef.current);
            }
        };
    }, []);

    // 수동 조작 시 8초간 자동 슬라이드 중지 로직
    const triggerManualPause = useCallback(() => {
        setIsManualPaused(true);
        if (manualPauseTimeoutRef.current) {
            clearTimeout(manualPauseTimeoutRef.current);
        }
        manualPauseTimeoutRef.current = setTimeout(() => {
            setIsManualPaused(false);
        }, 8000);
    }, []);

    const setCurrentIndex = useCallback((nextIndex: number | ((prev: number) => number)) => {
        if (events.length === 0) return;

        const rawNext = typeof nextIndex === 'function' ? nextIndex(currentIndex) : nextIndex;
        const normalizedNext = (rawNext + events.length) % events.length;

        if (isControlled) {
            onCurrentIndexChange?.(normalizedNext);
            return;
        }

        setInternalCurrentIndex(normalizedNext);
    }, [currentIndex, events.length, isControlled, onCurrentIndexChange]);

    // 최소 스와이프 거리 (픽셀)
    const minSwipeDistance = 50;
    const dragIntentDistance = 8;

    const suppressNextClick = useCallback(() => {
        dragStateRef.current.suppressClick = true;
        window.setTimeout(() => {
            dragStateRef.current.suppressClick = false;
        }, 0);
    }, []);

    const onTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (touchStart === null || touchEnd === null) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            triggerManualPause();
            goToNext();
            suppressNextClick();
        } else if (isRightSwipe) {
            triggerManualPause();
            goToPrevious();
            suppressNextClick();
        }

        setTouchStart(null);
        setTouchEnd(null);
    };

    // 자동 슬라이드 (8초마다)
    useEffect(() => {
        if (events.length <= 1 || isPaused || isManualPaused) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % events.length);
        }, 8000);

        return () => clearInterval(interval);
    }, [events.length, isPaused, isManualPaused, setCurrentIndex]);

    const goToSlide = useCallback((index: number) => {
        triggerManualPause();
        setCurrentIndex(index);
    }, [setCurrentIndex, triggerManualPause]);

    const goToPrevious = useCallback(() => {
        setCurrentIndex((prev) => (prev - 1 + events.length) % events.length);
    }, [events.length, setCurrentIndex]);

    const goToNext = useCallback(() => {
        setCurrentIndex((prev) => (prev + 1) % events.length);
    }, [events.length, setCurrentIndex]);

    const ensureImageEdgeTone = useCallback((imageUrl: string) => {
        if (!imageUrl) return;

        const cachedTone = edgeToneCache.get(imageUrl);
        if (cachedTone) {
            setEdgeToneByUrl((prev) => (
                prev[imageUrl] === cachedTone ? prev : { ...prev, [imageUrl]: cachedTone }
            ));
            return;
        }

        if (pendingEdgeToneUrlsRef.current.has(imageUrl)) return;
        pendingEdgeToneUrlsRef.current.add(imageUrl);

        detectImageEdgeTone(imageUrl)
            .then((tone) => {
                edgeToneCache.set(imageUrl, tone);
                setEdgeToneByUrl((prev) => (
                    prev[imageUrl] === tone ? prev : { ...prev, [imageUrl]: tone }
                ));
            })
            .catch(() => {
                edgeToneCache.set(imageUrl, 'light');
            })
            .finally(() => {
                pendingEdgeToneUrlsRef.current.delete(imageUrl);
            });
    }, []);

    const ensureSocialAdImageKind = useCallback((imageUrl: string, event: Event) => {
        if (!imageUrl || !hasCustomEventImage(event) || !isSocialAdEvent(event)) return;

        const cachedAnalysis = socialAdImageKindCache.get(imageUrl);
        if (cachedAnalysis) {
            setSocialImageAnalysisByUrl((prev) => (
                prev[imageUrl] === cachedAnalysis ? prev : { ...prev, [imageUrl]: cachedAnalysis }
            ));
            return;
        }

        const urlHint = getSocialImageUrlHint(imageUrl);
        if (urlHint?.kind === 'poster') {
            socialAdImageKindCache.set(imageUrl, urlHint);
            setSocialImageAnalysisByUrl((prev) => (
                prev[imageUrl] === urlHint ? prev : { ...prev, [imageUrl]: urlHint }
            ));
            return;
        }

        if (pendingSocialImageKindUrlsRef.current.has(imageUrl)) return;
        pendingSocialImageKindUrlsRef.current.add(imageUrl);

        detectSocialAdImageKind(imageUrl)
            .then((analysis) => {
                socialAdImageKindCache.set(imageUrl, analysis);
                setSocialImageAnalysisByUrl((prev) => (
                    prev[imageUrl] === analysis ? prev : { ...prev, [imageUrl]: analysis }
                ));
            })
            .catch(() => {
                socialAdImageKindCache.set(imageUrl, UNKNOWN_SOCIAL_IMAGE_ANALYSIS);
                setSocialImageAnalysisByUrl((prev) => (
                    prev[imageUrl] === UNKNOWN_SOCIAL_IMAGE_ANALYSIS
                        ? prev
                        : { ...prev, [imageUrl]: UNKNOWN_SOCIAL_IMAGE_ANALYSIS }
                ));
            })
            .finally(() => {
                pendingSocialImageKindUrlsRef.current.delete(imageUrl);
            });
    }, []);
    const openOneDayRecruitment = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setIsOneDayRecruitPressed(true);
        if (oneDayRecruitPressTimeoutRef.current) {
            clearTimeout(oneDayRecruitPressTimeoutRef.current);
        }
        oneDayRecruitPressTimeoutRef.current = setTimeout(() => {
            navigate('/oneday-recruits');
        }, 180);
    }, [navigate]);

    const openEventDetail = useCallback((event: Event) => {
        if (dragStateRef.current.suppressClick) return;
        onEventClick(event);
    }, [onEventClick]);

    const onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest('button')) return;

        dragStateRef.current = {
            mouseDown: true,
            startX: event.clientX,
            currentX: event.clientX,
            moved: false,
            suppressClick: false,
        };
    };

    const onMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current;
        if (!dragState.mouseDown) return;

        dragState.currentX = event.clientX;
        if (Math.abs(dragState.startX - dragState.currentX) > dragIntentDistance) {
            dragState.moved = true;
            event.preventDefault();
        }
    };

    const finishMouseDrag = useCallback(() => {
        const dragState = dragStateRef.current;
        if (!dragState.mouseDown) return;

        const distance = dragState.startX - dragState.currentX;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        dragState.mouseDown = false;

        if (isLeftSwipe) {
            triggerManualPause();
            goToNext();
            suppressNextClick();
        } else if (isRightSwipe) {
            triggerManualPause();
            goToPrevious();
            suppressNextClick();
        } else if (dragState.moved) {
            suppressNextClick();
        }
    }, [goToNext, goToPrevious, suppressNextClick, triggerManualPause]);

    if (events.length === 0) return null;

    const currentEvent = events[currentIndex];

    // PWA 재개 시 refetch 중 currentEvent가 undefined일 수 있음
    if (!currentEvent) return null;

    const hasMultipleEvents = events.length > 1;
    const activeCardAlignmentStyle = {
        '--neb-summary-left': hasMultipleEvents ? '30%' : '7%',
        '--neb-summary-width': hasMultipleEvents ? '64%' : '86%',
    } as React.CSSProperties;

    const getDateLabel = (event: Event) => {
        if (event.event_dates && event.event_dates.length > 0) {
            return formatEventDate(event.event_dates[0]);
        }
        const startDate = event.start_date || event.date;
        const endDate = event.end_date || event.date;
        if (!startDate) return "날짜 미정";
        if (endDate && endDate !== startDate) return `${formatEventDate(startDate)}~${formatEventDate(endDate)}`;
        return formatEventDate(startDate);
    };
    const getPlaceLabel = (event: Event) => event.location || event.place_name || "장소 미정";
    const getTimeLabel = (event: Event) => event.time?.trim() || '';
    const getSocialImageAnalysis = (imageUrl: string) =>
        getSocialImageUrlHint(imageUrl) || socialImageAnalysisByUrl[imageUrl] || UNKNOWN_SOCIAL_IMAGE_ANALYSIS;
    const getSlidePlacement = (index: number) => {
        if (!hasMultipleEvents) {
            return {
                className: 'is-active',
                style: {
                    '--neb-left': '7%',
                    '--neb-width': '86%',
                    '--neb-transform': 'scale(1)',
                    zIndex: 5,
                    opacity: 1,
                } as React.CSSProperties,
            };
        }

        const previousDistance = (currentIndex - index + events.length) % events.length;
        const nextDistance = (index - currentIndex + events.length) % events.length;

        if (index === currentIndex) {
            return {
                className: 'is-active',
                style: {
                    '--neb-left': '30%',
                    '--neb-width': '64%',
                    '--neb-transform': 'scale(1)',
                    zIndex: 6,
                    opacity: 1,
                } as React.CSSProperties,
            };
        }

        if (previousDistance >= 1 && previousDistance <= 3) {
            return {
                className: `is-preview is-preview-${previousDistance}`,
                style: {
                    '--neb-left': `${19 - previousDistance * 4}%`,
                    '--neb-width': '64%',
                    '--neb-transform': 'scale(1)',
                    zIndex: 6 - previousDistance,
                    opacity: 1,
                } as React.CSSProperties,
            };
        }

        if (nextDistance === 1) {
            return {
                className: 'is-hidden',
                style: {
                    '--neb-left': '112%',
                    '--neb-width': '64%',
                    '--neb-transform': 'scale(0.94)',
                    zIndex: 0,
                    opacity: 0,
                    pointerEvents: 'none',
                } as React.CSSProperties,
            };
        }

        return {
            className: 'is-hidden',
            style: {
                '--neb-left': '100%',
                '--neb-width': '64%',
                '--neb-transform': 'scale(0.9)',
                zIndex: 0,
                opacity: 0,
                pointerEvents: 'none',
            } as React.CSSProperties,
        };
    };
    const getBannerImage = (event: Event) =>
        event.image_medium ||
        event.image_thumbnail ||
        event.image ||
        event.image_full ||
        getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const getIndicatorImage = (event: Event) =>
        event.image_micro ||
        event.image_thumbnail ||
        getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);
    const getAuthorProfile = (event: Event) => {
        const boardUsers = event.board_users;
        const profile = Array.isArray(boardUsers) ? boardUsers[0] : boardUsers;

        if (!profile || typeof profile !== 'object') {
            return { image: null, nickname: null };
        }

        return {
            image: typeof profile.profile_image === 'string' && profile.profile_image.trim()
                ? profile.profile_image.trim()
                : null,
            nickname: typeof profile.nickname === 'string' && profile.nickname.trim()
                ? profile.nickname.trim()
                : null,
        };
    };

    return (
        <>
            <div
                className="NEB-container"
                onMouseEnter={() => setIsPaused(true)}
                onMouseLeave={() => {
                    setIsPaused(false);
                    finishMouseDrag();
                }}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={finishMouseDrag}
                onDragStart={(event) => event.preventDefault()}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
            >
                <div className="NEB-header">
                    <div>
                        <strong>신규 이벤트</strong>
                        <span className="NEB-badge">NEW</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowInfoModal(true);
                            }}
                            title="노출 기준 안내"
                        >
                            <i className="ri-information-line"></i>
                        </button>
                    </div>
                    <div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                openModal('newEventsList', {
                                    events,
                                    onEventClick,
                                    initialVersion: 5
                                });
                            }}
                        >
                            모아보기 <i className="ri-arrow-right-s-line"></i>
                        </button>
                        {events.length > 1 && (
                            <em>
                                {currentIndex + 1} / {events.length}
                            </em>
                        )}
                    </div>
                </div>

                {/* 인디케이터 */}
                {events.length > 1 && (
                    <div className="NEB-indicators">
                        {events.map((event, index) => {
                            const indicatorImage = getIndicatorImage(event);

                            return (
                                <button
                                    key={event.id}
                                    className={`NEB-indicator ${index === currentIndex ? 'is-active' : ''}`}
                                    onClick={() => goToSlide(index)}
                                    aria-label={`${index + 1}번째 이벤트 보기`}
                                >
                                    <img
                                        src={indicatorImage}
                                        alt=""
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="NEB-slider">
                    <div className="NEB-track">
                        {events.map((event, index) => {
                            const eventThumbnail = getBannerImage(event);
                            const isActiveSlide = index === currentIndex;
                            const placement = getSlidePlacement(index);
                            const edgeTone = edgeToneByUrl[eventThumbnail];
                            const edgeToneClass = isActiveSlide && edgeTone === 'dark' ? 'is-dark-edge' : '';
                            const socialImageAnalysis = getSocialImageAnalysis(eventThumbnail);
                            const isSocialPhotoAd =
                                hasCustomEventImage(event) &&
                                isSocialAdEvent(event) &&
                                socialImageAnalysis.kind === 'photo';
                            const authorProfile = getAuthorProfile(event);
                            const timeLabel = getTimeLabel(event);

                            return (
                                <div
                                    key={event.id}
                                    className={`NEB-slide ${placement.className} ${edgeToneClass} ${isSocialPhotoAd ? 'is-social-photo-ad' : ''}`}
                                    style={placement.style}
                                    onClick={() => openEventDetail(event)}
                                    aria-label={event.title}
                                >
                                    <div className="NEB-imageWrapper">
                                        <img
                                            src={eventThumbnail}
                                            alt={event.title}
                                            className="NEB-image"
                                            loading={isActiveSlide ? 'eager' : 'lazy'}
                                            decoding="async"
                                            fetchPriority={isActiveSlide ? 'high' : 'low'}
                                            onLoad={() => {
                                                ensureImageEdgeTone(eventThumbnail);
                                                ensureSocialAdImageKind(eventThumbnail, event);
                                            }}
                                        />
                                        {authorProfile.image && (
                                            <span
                                                className="NEB-authorBadge"
                                                title={authorProfile.nickname ? `등록자 ${authorProfile.nickname}` : '등록자'}
                                                aria-hidden="true"
                                            >
                                                <img
                                                    src={authorProfile.image}
                                                    alt=""
                                                    loading={isActiveSlide ? 'eager' : 'lazy'}
                                                    decoding="async"
                                                    referrerPolicy="no-referrer"
                                                />
                                            </span>
                                        )}
                                        {isSocialPhotoAd && (
                                            <div className="NEB-socialPhotoPoster" aria-hidden="true">
                                                <span className="NEB-socialPhotoPortrait">
                                                    <img
                                                        src={eventThumbnail}
                                                        alt=""
                                                        loading={isActiveSlide ? 'eager' : 'lazy'}
                                                        decoding="async"
                                                    />
                                                </span>
                                                <span className="NEB-socialPhotoCopy">
                                                    <span className="NEB-socialPhotoKicker">
                                                        <i className="ri-music-2-line" />
                                                        SOCIAL
                                                    </span>
                                                    <strong>{event.title}</strong>
                                                    <span className="NEB-socialPhotoMeta">
                                                        <i className="ri-calendar-line" />
                                                        {getDateLabel(event)}
                                                    </span>
                                                    {timeLabel && (
                                                        <span className="NEB-socialPhotoMeta">
                                                            <i className="ri-time-line" />
                                                            {timeLabel}
                                                        </span>
                                                    )}
                                                    <span className="NEB-socialPhotoMeta is-place">
                                                        <i className="ri-map-pin-line" />
                                                        {getPlaceLabel(event)}
                                                    </span>
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="NEB-lowerDeck" style={activeCardAlignmentStyle}>
                    <button
                        type="button"
                        className={`NEB-oneDayRecruitBtn ${isOneDayRecruitPressed ? 'is-pressed' : ''}`}
                        onClick={openOneDayRecruitment}
                        onPointerDown={() => setIsOneDayRecruitPressed(true)}
                        onPointerCancel={() => setIsOneDayRecruitPressed(false)}
                        onPointerLeave={() => setIsOneDayRecruitPressed(false)}
                        onBlur={() => setIsOneDayRecruitPressed(false)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                setIsOneDayRecruitPressed(true);
                            }
                        }}
                        aria-label="스윙 원데이 모집 보기"
                    >
                        <img src={ONE_DAY_RECRUIT_ICON_SRC} alt="" aria-hidden="true" />
                    </button>

                    <div className="NEB-activeSummaryCluster">
                        <button
                            type="button"
                            className="NEB-activeSummary"
                            onClick={() => openEventDetail(currentEvent)}
                            aria-label={`${currentEvent.title} 상세 보기`}
                        >
                            <strong>{currentEvent.title}</strong>
                            <span className="NEB-activeSummaryMeta">
                                <em>{getDateLabel(currentEvent)}</em>
                                <small>
                                    <i className="ri-map-pin-line" aria-hidden="true" />
                                    {getPlaceLabel(currentEvent)}
                                </small>
                            </span>
                        </button>
                    </div>
                </div>
            </div >

            {/* Info Modal */}
            {
                showInfoModal && (
                    <div className="neb-modal-overlay" onClick={() => setShowInfoModal(false)}>
                        <div className="neb-modal" onClick={e => e.stopPropagation()}>
                            <h3 className="neb-modal-title">📢 신규 등록 노출 기준</h3>
                            <div className="neb-modal-content">
                                <p className="neb-highlight">등록 후 72시간 동안 이 섹션에 노출됩니다.<br />72시간 내 신규 이벤트가 없을 경우 최근 등록 7개가 표시됩니다.</p>
                                <p className="neb-highlight" style={{ color: '#4ade80', marginTop: '4px' }}>※ 라이브밴드 파티는 기간 제한 없이 계속 노출됩니다.</p>
                                <ul className="neb-modal-list">
                                    <li>자동 슬라이드: 8초마다 전환</li>
                                    <li>마우스 호버 시 일시정지</li>
                                    <li>좌우 화살표로 수동 전환 가능</li>
                                </ul>
                            </div>
                            <button className="neb-modal-close" onClick={() => setShowInfoModal(false)}>확인</button>
                        </div>
                        <style>{`
                        .neb-modal-overlay {
                            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
                            z-index: 9999;
                            display: flex; align-items: center; justify-content: center;
                            padding: 20px;
                            animation: fadeIn 0.2s ease-out;
                        }
                        .neb-modal {
                            background: #1a1a1a;
                            border: 1px solid rgba(255,255,255,0.1);
                            border-radius: 16px;
                            padding: 24px;
                            width: 100%; max-width: 320px;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                            text-align: center;
                            transform: translateY(0);
                            animation: slideUp 0.2s ease-out;
                        }
                        .neb-modal-title {
                            font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 16px;
                        }
                        .neb-modal-content {
                            font-size: 14px; color: #ccc; line-height: 1.6; margin-bottom: 24px; text-align: left;
                        }
                        .neb-highlight {
                            color: #fbbf24; font-weight: 600; margin-bottom: 12px; text-align: center;
                        }
                        .neb-modal-list {
                            list-style: none; padding: 0; margin: 0;
                            background: rgba(255,255,255,0.03); border-radius: 8px; padding: 12px;
                        }
                        .neb-modal-list li {
                            margin-bottom: 4px; display: flex; align-items: center; gap: 6px;
                            font-size: 13px; color: #aaa;
                        }
                        .neb-modal-list li::before {
                            content: "•"; color: #666;
                        }
                        .neb-modal-list li:last-child { margin-bottom: 0; }
                        .neb-modal-close {
                            background: #3b82f6; color: #fff; border: none; padding: 10px 0; width: 100%;
                            border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 15px;
                            transition: background 0.2s;
                        }
                        .neb-modal-close:hover { background: #2563eb; }
                        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                        @keyframes slideUp { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                    `}</style>
                    </div>
                )
            }
        </>
    );
};
