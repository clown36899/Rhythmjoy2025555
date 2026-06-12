import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ModalProvider } from '../../../contexts/ModalContext';
import { requestGoogleTranslateRefresh } from '../../../utils/googleTranslateRefresh';
import type { Event } from '../utils/eventListUtils';
import { NewEventsBanner } from './NewEventsBanner';

vi.mock('../../../utils/googleTranslateRefresh', () => ({
    requestGoogleTranslateRefresh: vi.fn(),
}));

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
    beforeEach(() => {
        vi.mocked(requestGoogleTranslateRefresh).mockClear();
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
});
