const CALENDAR_MOBILE_LAYOUT_MAX_WIDTH = 720;
const CALENDAR_COMPACT_LAYOUT_MAX_WIDTH = 430;

export const CALENDAR_SPAN_TITLE_FONT_SIZE = 10;
export const CALENDAR_SOCIAL_MIN_FONT_SIZE = 4.8;
export const CALENDAR_SOCIAL_CARD_HEIGHT = 28;
export const CALENDAR_SOCIAL_CARD_VERTICAL_PADDING = 3;

const getSafeViewportWidth = (viewportWidth: number) => (
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 390
);

export const getCalendarLayoutMetrics = (viewportWidth: number) => {
    const safeWidth = getSafeViewportWidth(viewportWidth);
    const isMobile = safeWidth <= CALENDAR_MOBILE_LAYOUT_MAX_WIDTH;
    const isCompact = safeWidth <= CALENDAR_COMPACT_LAYOUT_MAX_WIDTH;

    const gridSidePadding = isMobile ? 3 : 5;
    const gridColumnGap = isMobile ? 1 : 0;
    const cellHorizontalPadding = isMobile ? 2 : 0;
    const eventTextAreaHeight = isMobile ? 30 : 34;
    const eventCardVerticalPadding = isMobile ? 3 : 6;
    const eventCardInternalGap = isMobile ? 0 : 3;
    const availableGridWidth = Math.max(0, safeWidth - (gridSidePadding * 2) - (gridColumnGap * 6));
    const estimatedCellInnerWidth = Math.max(0, (availableGridWidth / 7) - cellHorizontalPadding);
    const estimatedMediaHeight = estimatedCellInnerWidth * 9 / 16;

    return {
        dayHeaderHeight: isMobile ? 18 : 28,
        eventGap: isMobile ? 3 : 4,
        eventTextAreaHeight,
        eventChipHeight: Math.ceil(estimatedMediaHeight + eventTextAreaHeight + eventCardVerticalPadding + eventCardInternalGap),
        minCellHeight: isMobile ? 30 : 112,
        rowGap: isMobile ? 3 : 5,
        socialCardHeight: CALENDAR_SOCIAL_CARD_HEIGHT,
        socialCardVerticalPadding: CALENDAR_SOCIAL_CARD_VERTICAL_PADDING,
        isCompact,
        isMobile,
    };
};

export const getCalendarLayoutCssVars = (viewportWidth: number) => {
    const metrics = getCalendarLayoutMetrics(viewportWidth);

    return {
        '--calendar-event-card-text-height': `${metrics.eventTextAreaHeight}px`,
        '--calendar-social-card-height': `${metrics.socialCardHeight}px`,
        '--calendar-social-card-padding-y': `${metrics.socialCardVerticalPadding}px`,
    };
};
