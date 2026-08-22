import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    defaultLayout: {
        pinnedMenuIds: ['home', 'calendar'],
        menuOrderIds: ['home', 'calendar', 'benefits', 'board'],
    },
    markBenefitEventsSeen: vi.fn(),
    translate: (value: string) => value,
    modalContext: {
        openModal: vi.fn(),
        closeModal: vi.fn(),
        modalStack: [] as unknown[],
    },
    eventsQuery: { data: [] as unknown[] },
    menuVisibility: {
        settings: { hidden: false, hiddenItemIds: [] as string[] },
        isLoading: false,
        saveSettings: vi.fn(),
    },
}));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: mocks.translate }),
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => ({ user: null, isAdmin: false }),
}));

vi.mock('../../../contexts/ModalContext', () => ({
    useModalContext: () => mocks.modalContext,
}));

vi.mock('../../../hooks/useHomeMenuLayoutSettings', () => ({
    areHomeMenuLayoutSettingsEqual: vi.fn(() => false),
    deleteUserHomeMenuLayoutSettings: vi.fn(),
    loadDefaultHomeMenuLayoutSettings: vi.fn(async () => mocks.defaultLayout),
    loadUserHomeMenuLayoutSettings: vi.fn(async () => null),
    saveHomeMenuLayoutSettings: vi.fn(),
}));

vi.mock('../../../hooks/useBenefitEventsUnreadCount', () => ({
    useBenefitEventsUnreadState: () => ({
        count: 3,
        markAllSeen: mocks.markBenefitEventsSeen,
    }),
}));

vi.mock('../../../hooks/queries/useEventsQuery', () => ({
    useEventsQuery: () => mocks.eventsQuery,
}));

vi.mock('../../../hooks/useTempoToolVisibilitySettings', () => ({
    isTempoToolItemHidden: () => false,
    useTempoToolVisibilitySettings: () => mocks.menuVisibility,
}));

vi.mock('../../../hooks/useFreeBoardUnreadCount', () => ({
    useFreeBoardUnreadCount: () => 0,
}));

vi.mock('../../../utils/analyticsEvents', () => ({
    trackActivitySuccess: vi.fn(),
}));

import { HomeV2MenuPanel } from './HomeV2MenuPanel';

describe('HomeV2MenuPanel configured quick items', () => {
    beforeEach(() => {
        mocks.defaultLayout.pinnedMenuIds = ['home', 'calendar'];
        mocks.defaultLayout.menuOrderIds = ['home', 'calendar', 'benefits', 'board'];
        mocks.markBenefitEventsSeen.mockClear();
    });

    it('does not force an unpinned benefit item into the compact home menu', async () => {
        render(
            <MemoryRouter>
                <HomeV2MenuPanel />
            </MemoryRouter>,
        );

        expect(await screen.findByRole('button', { name: '홈' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /댄스이벤트/ })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /무료,\s*할인 이벤트/ })).not.toBeInTheDocument();
    });

    it('shows the benefit item and its unread count only when it is pinned', async () => {
        const user = userEvent.setup();
        mocks.defaultLayout.pinnedMenuIds = ['home', 'benefits'];
        mocks.defaultLayout.menuOrderIds = ['home', 'benefits', 'calendar', 'board'];

        render(
            <MemoryRouter>
                <HomeV2MenuPanel />
            </MemoryRouter>,
        );

        const benefitButton = await screen.findByRole('button', {
            name: /무료,\s*할인 이벤트, 새 이벤트 3개/,
        });
        expect(benefitButton.querySelector('.home-v2-menu-unread-badge')).toHaveTextContent('3');

        await user.click(benefitButton);
        await waitFor(() => expect(mocks.markBenefitEventsSeen).toHaveBeenCalledTimes(1));
    });
});
