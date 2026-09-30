import { act, fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ModalProvider } from '../../../contexts/ModalContext';
import { requestGoogleTranslateRefresh } from '../../../utils/googleTranslateRefresh';
import type { Event } from '../utils/eventListUtils';
import { NewEventsBanner } from './NewEventsBanner';
import { EventPreviewSection } from './EventList/components/EventPreviewSection';

vi.mock('../../../utils/googleTranslateRefresh', () => ({
    requestGoogleTranslateRefresh: vi.fn(),
}));

function RouteLocation() {
    const location = useLocation();
    return <output data-testid="route-location">{location.pathname}{location.search}</output>;
}

const events = [
    {
        id: 1,
        title: '첫번째 광고',
        start_date: '2026-06-20',
        location: '서울',
        category: 'social',
    },
    {
        id: 2,
        title: '두번째 광고',
        start_date: '2026-06-21',
        location: '부산',
        category: 'class',
    },
] as Event[];

describe('NewEventsBanner translation refresh', () => {
    let randomSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.mocked(requestGoogleTranslateRefresh).mockClear();
        randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        randomSpy.mockRestore();
        vi.useRealTimers();
    });

    it('starts the home ad randomly after loading and preserves selection on ordinary refresh', () => {
        randomSpy.mockReturnValue(0.75);
        const home = (ads: Event[], scope = 'swing') => (
            <MemoryRouter><ModalProvider>
                <EventPreviewSection
                    isSocialSchedulesLoading={false}
                    todayCalendarSchedules={[]} todaySocialSchedules={[]} thisWeekSocialSchedules={[]}
                    refreshSocialSchedules={async () => {}}
                    futureEvents={[]} regularClasses={[]} clubLessons={[]} clubRegularClasses={[]}
                    newlyRegisteredEvents={ads} homeAdMaxItems={15}
                    benefitEventUnreadCount={0} onBenefitEventsOpen={vi.fn()}
                    favoriteEventsList={[]} onEventClick={vi.fn()} highlightEvent={null}
                    defaultThumbnailClass="/class.png" defaultThumbnailEvent="/event.png"
                    effectiveFavoriteIds={new Set()} handleToggleFavorite={vi.fn()}
                    searchParams={new URLSearchParams({ dance: scope })} setSearchParams={vi.fn()}
                />
            </ModalProvider></MemoryRouter>
        );
        const { container, rerender, unmount } = render(home([]));
        expect(container.querySelector('.NEB-slide.is-active')).toBeNull();
        rerender(home(events));
        expect(container.querySelector('.NEB-slide.is-active')).toHaveTextContent('두번째 광고');

        randomSpy.mockReturnValue(0);
        rerender(home(events.map(event => ({ ...event }))));
        expect(container.querySelector('.NEB-slide.is-active')).toHaveTextContent('두번째 광고');
        rerender(home(events, 'salsa'));
        expect(container.querySelector('.NEB-slide.is-active')).toHaveTextContent('첫번째 광고');
        rerender(home([events[0]], 'salsa'));
        expect(container.querySelectorAll('.NEB-slide')).toHaveLength(1);
        expect(container.querySelector('.NEB-slide.is-active')).toHaveTextContent('첫번째 광고');

        unmount();
        const nextVisit = render(home(events));
        expect(nextVisit.container.querySelector('.NEB-slide.is-active')).toHaveTextContent('첫번째 광고');
    });

    it('continues auto rotation from the random start and from a manual selection', () => {
        vi.useFakeTimers();
        randomSpy.mockReturnValue(0.5);
        const ads = [...events, { ...events[1], id: 3, title: '세번째 광고' }];
        const { container, getByLabelText } = render(
            <MemoryRouter><ModalProvider>
                <NewEventsBanner events={ads} onEventClick={vi.fn()}
                    defaultThumbnailClass="/class.png" defaultThumbnailEvent="/event.png" />
            </ModalProvider></MemoryRouter>
        );
        const active = () => container.querySelector('.NEB-slide.is-active');
        expect(active()).toHaveTextContent('두번째 광고');
        act(() => vi.advanceTimersByTime(8000));
        expect(active()).toHaveTextContent('세번째 광고');
        act(() => vi.advanceTimersByTime(8000));
        expect(active()).toHaveTextContent('첫번째 광고');
        fireEvent.click(getByLabelText('3번째 이벤트 보기'));
        act(() => vi.advanceTimersByTime(8000));
        expect(active()).toHaveTextContent('세번째 광고');
        act(() => vi.advanceTimersByTime(8000));
        expect(active()).toHaveTextContent('첫번째 광고');
    });

    it('uses title and safe description for missing or failed posters across ad categories', () => {
        const onEventClick = vi.fn();
        const examples = [
            { ...events[0], description: '<p>즐거운 &amp; 편안한 소셜</p><script>bad()</script>' },
            { ...events[1], description: '처음 배우는 린디합 강습' },
            { ...events[1], id: 3, category: 'event', image: '/poster.jpg', title: '포스터 행사' },
            { ...events[1], id: 4, image: '/default-thumbnails/default_thumbnail.webp', title: '기본 이미지 강습' },
        ] as Event[];
        const { container } = render(
            <MemoryRouter><ModalProvider>
                <NewEventsBanner events={examples} onEventClick={onEventClick} />
            </ModalProvider></MemoryRouter>
        );
        const slides = container.querySelectorAll('.NEB-slide');
        expect(slides[0]).toHaveTextContent('즐거운 & 편안한 소셜');
        expect(slides[0]).not.toHaveTextContent('bad()');
        expect(slides[1]).toHaveTextContent('처음 배우는 린디합 강습');
        expect(slides[1].querySelector('.NEB-image')).toBeNull();
        expect(slides[3]).toHaveClass('is-text-poster');
        expect(slides[2]).not.toHaveClass('is-text-poster');
        fireEvent.error(slides[2].querySelector('.NEB-image')!);
        expect(slides[2]).toHaveClass('is-text-poster');
        expect(slides[2]).toHaveTextContent('포스터 행사');
        expect(slides[2].querySelector('.NEB-image')).toBeNull();
        expect(slides[0]).toHaveAttribute('draggable', 'false');
        expect(fireEvent.dragStart(slides[0])).toBe(false);
        fireEvent.click(slides[0]);
        expect(onEventClick).toHaveBeenCalled();
    });

    it('requests Google Translate refresh when the active ad changes', async () => {
        const user = userEvent.setup();

        const { getByLabelText } = render(
            <MemoryRouter>
                <ModalProvider>
                    <NewEventsBanner
                        events={events}
                        onEventClick={vi.fn()}
                        defaultThumbnailClass="/class.png"
                        defaultThumbnailEvent="/event.png"
                    />
                </ModalProvider>
            </MemoryRouter>
        );

        await waitFor(() => expect(requestGoogleTranslateRefresh).toHaveBeenCalled());
        vi.mocked(requestGoogleTranslateRefresh).mockClear();

        await user.click(getByLabelText('2번째 이벤트 보기'));

        await waitFor(() => expect(requestGoogleTranslateRefresh).toHaveBeenCalled());
    });

    it('shows the standalone benefit shortcut and clears its unread count through the open action', async () => {
        const user = userEvent.setup();
        const onBenefitEventsOpen = vi.fn();

        const { getByLabelText, getByText, getByTestId } = render(
            <MemoryRouter initialEntries={['/?dance=salsa']}>
                <RouteLocation />
                <ModalProvider>
                    <NewEventsBanner
                        events={events}
                        danceScope="salsa"
                        onEventClick={vi.fn()}
                        defaultThumbnailClass="/class.png"
                        defaultThumbnailEvent="/event.png"
                        benefitEventUnreadCount={3}
                        onBenefitEventsOpen={onBenefitEventsOpen}
                    />
                </ModalProvider>
            </MemoryRouter>
        );

        expect(getByText('3', { selector: '.NEB-benefitEventsBadge' })).toBeInTheDocument();
        await user.click(getByLabelText('무료, 할인 이벤트 보기, 새 이벤트 3개'));
        expect(onBenefitEventsOpen).toHaveBeenCalledTimes(1);
        expect(getByTestId('route-location')).toHaveTextContent('/benefit-events?dance=salsa');
    });
});
