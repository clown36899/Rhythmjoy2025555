import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getEventThumbnail, getLightweightEventImage } from '../../../utils/getEventThumbnail';
import { useModalContext } from '../../../contexts/ModalContext';
import type { Event } from '../utils/eventListUtils';
import { formatEventDate } from '../../../utils/dateUtils';
import { requestGoogleTranslateRefresh } from '../../../utils/googleTranslateRefresh';
import './NewEventsBanner.css';
import type { SocialSchedule } from '../../social/types';

type EdgeTone = 'dark' | 'light';
type SocialAdImageKind = 'photo' | 'poster' | 'unknown';

interface SocialAdImageAnalysis {
    kind: SocialAdImageKind;
    confidence: number;
}

const edgeToneCache = new Map<string, EdgeTone>();
const socialAdImageKindCache = new Map<string, SocialAdImageAnalysis>();
const imageAspectRatioCache = new Map<string, number>();
const EDGE_TONE_BLACK_LUMINANCE_THRESHOLD = 96;
const EDGE_TONE_BLACK_CHROMA_THRESHOLD = 52;
const EDGE_TONE_BLACK_SAMPLE_RATIO = 0.48;
const SOCIAL_POSTER_SCORE_THRESHOLD = 0.9;
const DEFAULT_POSTER_ASPECT_RATIO = 415 / 539;
const MIN_AD_ASPECT_RATIO = 0.42;
const MAX_AD_ASPECT_RATIO = 1.45;

const UNKNOWN_SOCIAL_IMAGE_ANALYSIS: SocialAdImageAnalysis = {
    kind: 'unknown',
    confidence: 0,
};

const getMainAdImage = (
    event: Event,
    defaultThumbnailClass?: string,
    defaultThumbnailEvent?: string,
) =>
    getLightweightEventImage(event, ['image_medium', 'image_thumbnail', 'image_micro']) ||
    event.image ||
    event.image_full ||
    getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

const getMainAdIndicatorImage = (
    event: Event,
    defaultThumbnailClass?: string,
    defaultThumbnailEvent?: string,
) =>
    getLightweightEventImage(event, ['image_micro', 'image_thumbnail', 'image_medium']) ||
    event.image ||
    event.image_full ||
    getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

const getMainAdPreviewImage = (
    event: Event,
    defaultThumbnailClass?: string,
    defaultThumbnailEvent?: string,
) =>
    getLightweightEventImage(event, ['image_thumbnail', 'image_micro', 'image_medium']) ||
    event.image ||
    event.image_full ||
    getEventThumbnail(event, defaultThumbnailClass, defaultThumbnailEvent);

const DEFAULT_NEB_TODAY_SCHEDULES = 3;

const getNebSchedulePlaceLabel = (schedule: SocialSchedule) => (
    schedule.location || schedule.place_name || schedule.address || ''
);

const getTodayMonthDayLabel = () => {
    const today = new Date();
    return `${today.getMonth() + 1}월 ${today.getDate()}일`;
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
    todaySchedules?: SocialSchedule[];
}

export const NewEventsBanner: React.FC<NewEventsBannerProps> = ({
    events,
    onEventClick,
    defaultThumbnailClass,
    defaultThumbnailEvent,
    currentIndex: controlledCurrentIndex,
    onCurrentIndexChange,
    todaySchedules = [],
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
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const [layoutVars, setLayoutVars] = useState<React.CSSProperties>({});
    const [layoutStats, setLayoutStats] = useState({
        sliderHeight: 245,
        containerWidth: 390,
        activeLeft: 168,
        stackStep: 22,
        frontStackExtra: 10,
    });
    const [todayItemLimit, setTodayItemLimit] = useState(DEFAULT_NEB_TODAY_SCHEDULES);

    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isManualPaused, setIsManualPaused] = useState(false);
    const [slideMotion, setSlideMotion] = useState<'forward' | 'rewind' | null>(null);
    const [isOneDayRecruitPressed, setIsOneDayRecruitPressed] = useState(false);
    const manualPauseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const slideMotionTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const oneDayRecruitPressTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const todayScheduleListRef = React.useRef<HTMLDivElement | null>(null);
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
    const [imageAspectRatioByUrl, setImageAspectRatioByUrl] = useState<Record<string, number>>({});
    const [todayScrollbarMetrics, setTodayScrollbarMetrics] = useState({
        thumbHeight: 100,
        thumbTop: 0,
        scrollable: false,
    });

    useEffect(() => {
        return () => {
            if (manualPauseTimeoutRef.current) {
                clearTimeout(manualPauseTimeoutRef.current);
            }
            if (slideMotionTimeoutRef.current) {
                clearTimeout(slideMotionTimeoutRef.current);
            }
            if (oneDayRecruitPressTimeoutRef.current) {
                clearTimeout(oneDayRecruitPressTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        const listElement = todayScheduleListRef.current;
        if (!listElement) return undefined;

        let frameId = 0;
        const updateScrollbarMetrics = () => {
            if (frameId) window.cancelAnimationFrame(frameId);

            frameId = window.requestAnimationFrame(() => {
                const scrollHeight = listElement.scrollHeight;
                const clientHeight = listElement.clientHeight;
                const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
                const scrollable = maxScrollTop > 1;
                const nextThumbHeight = scrollable
                    ? Math.max(18, Math.min(100, (clientHeight / Math.max(scrollHeight, 1)) * 100))
                    : 100;
                const nextThumbTop = scrollable
                    ? Math.min(100 - nextThumbHeight, (listElement.scrollTop / maxScrollTop) * (100 - nextThumbHeight))
                    : 0;

                setTodayScrollbarMetrics((prev) => {
                    if (
                        prev.scrollable === scrollable &&
                        Math.abs(prev.thumbHeight - nextThumbHeight) < 0.5 &&
                        Math.abs(prev.thumbTop - nextThumbTop) < 0.5
                    ) {
                        return prev;
                    }

                    return {
                        thumbHeight: nextThumbHeight,
                        thumbTop: nextThumbTop,
                        scrollable,
                    };
                });
            });
        };

        updateScrollbarMetrics();
        listElement.addEventListener('scroll', updateScrollbarMetrics, { passive: true });
        window.addEventListener('resize', updateScrollbarMetrics);

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateScrollbarMetrics)
            : null;
        resizeObserver?.observe(listElement);

        return () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            listElement.removeEventListener('scroll', updateScrollbarMetrics);
            window.removeEventListener('resize', updateScrollbarMetrics);
            resizeObserver?.disconnect();
        };
    }, [todaySchedules.length]);

    const markSlideMotion = useCallback((motion: 'forward' | 'rewind') => {
        setSlideMotion(motion);
        if (slideMotionTimeoutRef.current) {
            clearTimeout(slideMotionTimeoutRef.current);
        }
        slideMotionTimeoutRef.current = setTimeout(() => {
            setSlideMotion(null);
            slideMotionTimeoutRef.current = null;
        }, 760);
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
            goToPrevious();
            suppressNextClick();
        } else if (isRightSwipe) {
            triggerManualPause();
            goToNext();
            suppressNextClick();
        }

        setTouchStart(null);
        setTouchEnd(null);
    };

    // 자동 슬라이드 (8초마다)
    useEffect(() => {
        if (events.length <= 1 || isPaused || isManualPaused) return;

        const interval = setInterval(() => {
            markSlideMotion('forward');
            setCurrentIndex((prev) => (prev - 1 + events.length) % events.length);
        }, 8000);

        return () => clearInterval(interval);
    }, [events.length, isPaused, isManualPaused, markSlideMotion, setCurrentIndex]);

    const goToSlide = useCallback((index: number) => {
        triggerManualPause();
        setCurrentIndex(index);
    }, [setCurrentIndex, triggerManualPause]);

    const goToPrevious = useCallback(() => {
        markSlideMotion('rewind');
        setCurrentIndex((prev) => (prev + 1) % events.length);
    }, [events.length, markSlideMotion, setCurrentIndex]);

    const goToNext = useCallback(() => {
        markSlideMotion('forward');
        setCurrentIndex((prev) => (prev - 1 + events.length) % events.length);
    }, [events.length, markSlideMotion, setCurrentIndex]);

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

    const rememberImageAspectRatio = useCallback((imageUrl: string, image: HTMLImageElement) => {
        if (!imageUrl || !image.naturalWidth || !image.naturalHeight) return;

        const ratio = Math.min(
            MAX_AD_ASPECT_RATIO,
            Math.max(MIN_AD_ASPECT_RATIO, image.naturalWidth / image.naturalHeight),
        );
        const previousRatio = imageAspectRatioCache.get(imageUrl);
        if (previousRatio && Math.abs(previousRatio - ratio) < 0.001) return;

        imageAspectRatioCache.set(imageUrl, ratio);
        setImageAspectRatioByUrl((prev) => {
            if (prev[imageUrl] && Math.abs(prev[imageUrl] - ratio) < 0.001) return prev;
            return { ...prev, [imageUrl]: ratio };
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
            goToPrevious();
            suppressNextClick();
        } else if (isRightSwipe) {
            triggerManualPause();
            goToNext();
            suppressNextClick();
        } else if (dragState.moved) {
            suppressNextClick();
        }
    }, [goToNext, goToPrevious, suppressNextClick, triggerManualPause]);

    const currentEvent = events[currentIndex];

    useEffect(() => {
        if (!currentEvent) return;
        requestGoogleTranslateRefresh();
    }, [currentEvent]);

    if (events.length === 0) return null;

    // PWA 재개 시 refetch 중 currentEvent가 undefined일 수 있음
    if (!currentEvent) return null;

    const hasMultipleEvents = events.length > 1;
    const visibleTodaySchedules = todaySchedules;
    const todayMonthDayLabel = getTodayMonthDayLabel();
    const activeCardAlignmentStyle = {
        '--neb-summary-left': hasMultipleEvents
            ? 'var(--neb-active-left, 30%)'
            : 'var(--neb-single-left, var(--neb-active-left, 7%))',
        '--neb-summary-width': 'var(--neb-card-width, 64%)',
    } as React.CSSProperties;
    const bannerImages = useMemo(
        () => events.map((event) => getMainAdImage(event, defaultThumbnailClass, defaultThumbnailEvent)),
        [events, defaultThumbnailClass, defaultThumbnailEvent]
    );
    const indicatorImages = useMemo(
        () => events.map((event) => getMainAdIndicatorImage(event, defaultThumbnailClass, defaultThumbnailEvent)),
        [events, defaultThumbnailClass, defaultThumbnailEvent]
    );
    const currentBannerImage = bannerImages[currentIndex];
    const getImageAspectRatio = (imageUrl: string) => (
        imageAspectRatioByUrl[imageUrl] ||
        imageAspectRatioCache.get(imageUrl) ||
        DEFAULT_POSTER_ASPECT_RATIO
    );
    const currentImageAspectRatio = getImageAspectRatio(currentBannerImage);
    const getSlideWidthPx = (imageUrl: string) => {
        const ratio = getImageAspectRatio(imageUrl);
        const containerWidth = layoutStats.containerWidth || 390;
        const rawWidth = Math.round(layoutStats.sliderHeight * ratio);
        const maxWidth = Math.max(116, Math.floor(containerWidth * 0.78));
        return Math.min(Math.max(92, rawWidth), maxWidth);
    };

    const getSlideWidthPxForLayout = (imageUrl: string, sliderHeight: number, containerWidth: number) => {
        const ratio = getImageAspectRatio(imageUrl);
        const rawWidth = Math.round(sliderHeight * ratio);
        const maxWidth = Math.max(116, Math.floor(containerWidth * 0.78));
        return Math.min(Math.max(92, rawWidth), maxWidth);
    };

    const getSlideWidth = (imageUrl: string) => {
        return `${getSlideWidthPx(imageUrl)}px`;
    };

    useEffect(() => {
        if (!currentBannerImage || typeof document === 'undefined') return undefined;

        const preloadLink = document.createElement('link');
        preloadLink.rel = 'preload';
        preloadLink.as = 'image';
        preloadLink.href = currentBannerImage;
        preloadLink.setAttribute('fetchpriority', 'high');
        document.head.appendChild(preloadLink);

        return () => {
            preloadLink.remove();
        };
    }, [currentBannerImage]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        let frameId = 0;
        const updateDynamicLayout = () => {
            if (frameId) window.cancelAnimationFrame(frameId);

            frameId = window.requestAnimationFrame(() => {
                const container = containerRef.current;
                if (!container) return;

                const viewport = window.visualViewport;
                const viewportWidth = viewport?.width || window.innerWidth || 390;
                const viewportHeight = viewport?.height || window.innerHeight || 720;
                const containerRect = container.getBoundingClientRect();
                const headerRect = container.querySelector<HTMLElement>('.NEB-header')?.getBoundingClientRect();
                const indicatorRect = container.querySelector<HTMLElement>('.NEB-indicators')?.getBoundingClientRect();
                const navRect = document.querySelector<HTMLElement>('.home-v2-menu-panel')?.getBoundingClientRect();
                const navTop = navRect && navRect.height > 0 && navRect.top > 0 && navRect.top < viewportHeight
                    ? navRect.top
                    : viewportHeight - 86;
                const mediaBottom = Math.max(
                    headerRect ? headerRect.bottom - containerRect.top : 0,
                    indicatorRect ? indicatorRect.bottom - containerRect.top : 0,
                    94,
                );

                const isMobileSurface = viewportWidth < 640;
                const isDesktopSplitSurface = viewportWidth >= 640;
                const nextTodayItemLimit = !isMobileSurface
                    ? 4
                    : viewportHeight < 740
                        ? 2
                        : viewportWidth < 430
                            ? 3
                            : 3;
                const todayRows = Math.min(todaySchedules.length, nextTodayItemLimit);
                const lowerReserve = isDesktopSplitSurface
                    ? 118
                    : todaySchedules.length > 0
                    ? 86 + (todayRows * 30) + (viewportWidth < 430 ? 18 : 28)
                    : 96;
                const availableHeight = Math.floor(
                    navTop - containerRect.top - mediaBottom - lowerReserve - 14,
                );
                const widthBasedHeight = Math.floor(
                    isDesktopSplitSurface
                        ? Math.min(520, Math.max(330, (containerRect.width || viewportWidth) * 0.54))
                        : Math.min(360, Math.max(220, viewportWidth * (viewportWidth < 430 ? 0.62 : 0.54))),
                );
                const sliderHeight = Math.max(210, Math.min(widthBasedHeight, availableHeight));
                const containerWidth = containerRect.width || viewportWidth;
                const activeCardWidth = getSlideWidthPxForLayout(currentBannerImage, sliderHeight, containerWidth);
                const previewCount = hasMultipleEvents ? Math.max(events.length - 1, 0) : 0;
                const previewWidths = Array.from({ length: previewCount }, (_, previewIndex) => {
                    const distance = previewIndex + 1;
                    const eventIndex = (currentIndex - distance + events.length) % events.length;
                    const previewImage = getMainAdPreviewImage(events[eventIndex], defaultThumbnailClass, defaultThumbnailEvent);
                    return getSlideWidthPxForLayout(previewImage, sliderHeight, containerWidth);
                });
                const frontStackExtra = Math.floor(
                    Math.max(3, Math.min(12, containerWidth * (previewCount > 9 ? 0.014 : 0.025))),
                );
                const calculateStackMetrics = (baseGap: number) => {
                    let frontLeft = 0;
                    let frontRight = activeCardWidth;
                    let stackLeft = 0;
                    let stackRight = activeCardWidth;

                    previewWidths.forEach((width, index) => {
                        const gap = baseGap + (index < 2 ? frontStackExtra : 0);
                        const left = frontLeft - gap;
                        const rawRight = left + width;
                        const visibleRight = Math.min(rawRight, frontRight);

                        stackLeft = Math.min(stackLeft, left);
                        stackRight = Math.max(stackRight, visibleRight);
                        frontLeft = left;
                        frontRight = visibleRight;
                    });

                    return {
                        stackLeft,
                        stackRight,
                        span: stackRight - stackLeft,
                    };
                };
                const targetEdgeMargin = Math.floor(Math.max(10, Math.min(22, containerWidth * 0.035)));
                const targetSpan = Math.max(activeCardWidth, containerWidth - (targetEdgeMargin * 2));
                let minGap = previewCount > 9 ? 2 : 6;
                let maxGap = previewCount > 9 ? 22 : 30;

                for (let iteration = 0; iteration < 14; iteration += 1) {
                    const candidateGap = (minGap + maxGap) / 2;
                    if (calculateStackMetrics(candidateGap).span <= targetSpan) {
                        minGap = candidateGap;
                    } else {
                        maxGap = candidateGap;
                    }
                }

                const stackStep = Math.floor(minGap);
                const stackMetrics = calculateStackMetrics(stackStep);
                const edgeMargin = Math.max(0, Math.floor((containerWidth - stackMetrics.span) / 2));
                const activeLeft = Math.max(0, Math.round(edgeMargin - stackMetrics.stackLeft));

                setTodayItemLimit(nextTodayItemLimit);
                setLayoutStats((prev) => (
                    prev.sliderHeight === sliderHeight &&
                    prev.containerWidth === Math.round(containerWidth) &&
                    prev.activeLeft === Math.max(10, activeLeft) &&
                    prev.stackStep === stackStep &&
                    prev.frontStackExtra === frontStackExtra
                        ? prev
                        : {
                            sliderHeight,
                            containerWidth: Math.round(containerWidth),
                            activeLeft: Math.max(10, activeLeft),
                            stackStep,
                            frontStackExtra,
                        }
                ));
                setLayoutVars({
                    '--neb-dynamic-slider-height': `${sliderHeight}px`,
                    '--neb-card-width': `${activeCardWidth}px`,
                    '--neb-active-left': `${Math.max(10, activeLeft)}px`,
                    '--neb-single-left': `${Math.max(10, Math.floor((containerWidth - activeCardWidth) / 2))}px`,
                    '--neb-stack-step': `${stackStep}px`,
                    '--neb-stack-front-extra': `${frontStackExtra}px`,
                } as React.CSSProperties);
            });
        };

        const viewportTarget = window.visualViewport;

        updateDynamicLayout();
        window.addEventListener('resize', updateDynamicLayout);
        if (viewportTarget && typeof viewportTarget.addEventListener === 'function') {
            viewportTarget.addEventListener('resize', updateDynamicLayout);
        }

        const resizeObserver = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(updateDynamicLayout)
            : null;
        if (containerRef.current) resizeObserver?.observe(containerRef.current);

        return () => {
            if (frameId) window.cancelAnimationFrame(frameId);
            window.removeEventListener('resize', updateDynamicLayout);
            if (viewportTarget && typeof viewportTarget.removeEventListener === 'function') {
                viewportTarget.removeEventListener('resize', updateDynamicLayout);
            }
            resizeObserver?.disconnect();
        };
    }, [
        todaySchedules.length,
        currentIndex,
        currentImageAspectRatio,
        currentBannerImage,
        defaultThumbnailClass,
        defaultThumbnailEvent,
        events,
        hasMultipleEvents,
        imageAspectRatioByUrl,
    ]);

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
    const getPreviewStackMetrics = (distance: number) => {
        let frontLeft = layoutStats.activeLeft;
        let frontRight = layoutStats.activeLeft + getSlideWidthPx(currentBannerImage);
        let previewLeft = layoutStats.activeLeft;
        let clipRight = 0;

        for (let step = 1; step <= distance; step += 1) {
            const previewIndex = (currentIndex - step + events.length) % events.length;
            const previewEvent = events[previewIndex];
            const previewImageUrl = getMainAdPreviewImage(previewEvent, defaultThumbnailClass, defaultThumbnailEvent);
            const previewWidth = getSlideWidthPx(previewImageUrl);
            const gap = layoutStats.stackStep + (step <= 2 ? layoutStats.frontStackExtra : 0);
            const rawLeft = frontLeft - gap;
            const rawRight = rawLeft + previewWidth;
            const visibleRight = Math.min(rawRight, frontRight);

            previewLeft = rawLeft;
            clipRight = Math.max(0, Math.ceil(rawRight - visibleRight));
            frontLeft = previewLeft;
            frontRight = visibleRight;
        }

        return {
            left: Math.round(previewLeft),
            clipRight,
        };
    };

    const getSlidePlacement = (index: number, imageUrl = bannerImages[index] || '') => {
        const slideWidth = getSlideWidth(imageUrl);

        if (!hasMultipleEvents) {
            return {
                className: 'is-active',
                style: {
                    '--neb-left': 'var(--neb-single-left, 7%)',
                    '--neb-width': slideWidth,
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
                className: slideMotion === 'rewind' ? 'is-active is-rewind-enter' : 'is-active',
                style: {
                    '--neb-left': 'var(--neb-active-left, 30%)',
                    '--neb-width': slideWidth,
                    '--neb-clip-right': '0px',
                    '--neb-transform': 'scale(1)',
                    zIndex: 30,
                    opacity: 1,
                } as React.CSSProperties,
            };
        }

        if (previousDistance >= 1 && previousDistance <= events.length - 1) {
            const previewMetrics = getPreviewStackMetrics(previousDistance);

            return {
                className: `is-preview is-preview-${previousDistance}`,
                style: {
                    '--neb-left': `${previewMetrics.left}px`,
                    '--neb-width': slideWidth,
                    '--neb-clip-right': `${previewMetrics.clipRight}px`,
                    '--neb-transform': 'scale(1)',
                    zIndex: 30 - previousDistance,
                    opacity: 1,
                } as React.CSSProperties,
            };
        }

        if (nextDistance === 1) {
            return {
                className: 'is-hidden',
                style: {
                    '--neb-left': '112%',
                    '--neb-width': slideWidth,
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
                '--neb-width': slideWidth,
                '--neb-transform': 'scale(0.9)',
                zIndex: 0,
                opacity: 0,
                pointerEvents: 'none',
            } as React.CSSProperties,
        };
    };
    const getBannerImage = (event: Event, index: number) =>
        bannerImages[index] || getMainAdImage(event, defaultThumbnailClass, defaultThumbnailEvent);
    const getIndicatorImage = (event: Event, index: number) =>
        indicatorImages[index] || getMainAdIndicatorImage(event, defaultThumbnailClass, defaultThumbnailEvent);
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
                ref={containerRef}
                className="NEB-container"
                style={layoutVars}
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
                            const indicatorImage = getIndicatorImage(event, index);

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
                                        draggable={false}
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}

                <div className="NEB-slider">
                    <div className="NEB-track">
                        {events.map((event, index) => {
                            const isActiveSlide = index === currentIndex;
                            const eventThumbnail = isActiveSlide
                                ? getBannerImage(event, index)
                                : getMainAdPreviewImage(event, defaultThumbnailClass, defaultThumbnailEvent);
                            const placement = getSlidePlacement(index, eventThumbnail);
                            const imageLoading = isActiveSlide ? 'eager' : 'lazy';
                            const imageFetchPriority = isActiveSlide ? 'high' : 'low';
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
                                            loading={imageLoading}
                                            decoding="async"
                                            fetchPriority={imageFetchPriority}
                                            draggable={false}
                                            onLoad={(loadEvent) => {
                                                rememberImageAspectRatio(eventThumbnail, loadEvent.currentTarget);
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
                                                    draggable={false}
                                                />
                                            </span>
                                        )}
                                        {isSocialPhotoAd && (
                                            <div className="NEB-socialPhotoPoster" aria-hidden="true">
                                                <span className="NEB-socialPhotoPortrait">
                                                    <img
                                                    src={eventThumbnail}
                                                    alt=""
                                                    loading={imageLoading}
                                                    decoding="async"
                                                    draggable={false}
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
                        <span className="NEB-oneDayRecruitTicket" aria-hidden="true">
                            <span className="NEB-oneDayRecruitStub">OPEN</span>
                            <span className="NEB-oneDayRecruitBody">
                                <span className="NEB-oneDayRecruitKicker">SWING CLASS</span>
                                <span className="NEB-oneDayRecruitTitle">원데이 모집</span>
                                <span className="NEB-oneDayRecruitMeta">바로가기</span>
                            </span>
                        </span>
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

                    {visibleTodaySchedules.length > 0 && (
                        <aside className="NEB-todaySchedulePanel" aria-label="오늘 일정">
                            <div className="NEB-todayScheduleHeader">
                                <span>오늘일정</span>
                                <span className="NEB-todayScheduleHeaderMeta">
                                    <time dateTime={new Date().toISOString().slice(0, 10)}>{todayMonthDayLabel}</time>
                                    <em>{todaySchedules.length}</em>
                                </span>
                            </div>
                            <div className="NEB-todayScheduleScrollFrame">
                                <div ref={todayScheduleListRef} className="NEB-todayScheduleList">
                                    {visibleTodaySchedules.map((schedule, index) => {
                                        const place = getNebSchedulePlaceLabel(schedule);

                                        return (
                                            <button
                                                key={schedule.id}
                                                type="button"
                                                className="NEB-todayScheduleItem"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openEventDetail(schedule as unknown as Event);
                                                }}
                                            >
                                                <i aria-hidden="true">{index + 1}</i>
                                                <span>
                                                    <strong>{schedule.title}</strong>
                                                    {place && <small>장소 : {place}</small>}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div
                                    className={`NEB-todayScheduleScrollbar ${todayScrollbarMetrics.scrollable ? 'is-scrollable' : 'is-static'}`}
                                    aria-hidden="true"
                                >
                                    <span
                                        style={{
                                            height: `${todayScrollbarMetrics.thumbHeight}%`,
                                            top: `${todayScrollbarMetrics.thumbTop}%`,
                                        }}
                                    />
                                </div>
                            </div>
                        </aside>
                    )}
                </div>
            </div >

            {/* Info Modal */}
            {
                showInfoModal && (
                    <div className="neb-modal-overlay" onClick={() => setShowInfoModal(false)}>
                        <div className="neb-modal" onClick={e => e.stopPropagation()}>
                            <h3 className="neb-modal-title">📢 신규 등록 노출 기준</h3>
                            <div className="neb-modal-content">
                                <p className="neb-highlight">등록 후 72시간 동안 이 섹션에 노출됩니다.<br />72시간 내 신규 이벤트가 없을 경우 최근 등록 15개가 표시됩니다.</p>
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
