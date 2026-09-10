import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { PageActionProvider } from '../../../contexts/PageActionContext';
import DanceSceneGuide from './DanceSceneGuide';

it('keeps every section anchor on the selected genre when the SPA base points to home', () => {
    const base = document.createElement('base');
    base.href = '/';
    document.head.append(base);
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const { unmount } = render(
        <MemoryRouter initialEntries={['/calendar?dance=salsa&view=list']}>
            <PageActionProvider><DanceSceneGuide scope="salsa" /></PageActionProvider>
        </MemoryRouter>,
    );
    try {
        const links = within(screen.getByRole('navigation', { name: '살사 안내 목차' })).getAllByRole('link');
        expect(links).toHaveLength(4);
        for (const link of links) {
            const url = new URL((link as HTMLAnchorElement).href);
            expect(url.pathname).toBe('/calendar');
            expect(url.searchParams.get('dance')).toBe('salsa');
            expect(url.searchParams.get('view')).toBe('list');
            expect(url.hash).toMatch(/^#scene-/);
        }
    } finally {
        unmount();
        base.remove();
        scroll.mockRestore();
    }
});
