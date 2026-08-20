import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BENEFIT_EVENTS_SEEN_STORAGE_KEY } from '../../hooks/useBenefitEventsUnreadCount';
import { getBenefitEventThumbnail } from './BenefitEventsPage';
import BenefitEventsPage from './BenefitEventsPage';

const fetchCafe24Events = vi.fn();

vi.mock('../../lib/cafe24EventsApi', () => ({
  fetchCafe24Events: (...args: unknown[]) => fetchCafe24Events(...args),
}));

vi.mock('../../lib/cafe24Client', () => ({
  cafe24: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: [], error: null }),
      }),
    }),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'benefit-page-user' } }),
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BenefitEventsPage />
    </QueryClientProvider>,
  );
}

describe('benefit event images', () => {
  beforeEach(() => {
    fetchCafe24Events.mockReset();
    window.localStorage.clear();
  });

  it('returns no image instead of a synthetic URL when an event has none', () => {
    expect(getBenefitEventThumbnail({ id: 'pass-without-image', title: '정기권' } as any)).toBe('');
  });

  it('uses a real stored thumbnail when one exists', () => {
    expect(getBenefitEventThumbnail({
      id: 'free-with-image',
      title: '무료 행사',
      image_thumbnail: '/uploads/free/thumb.webp',
      image_full: '/uploads/free/full.webp',
    } as any)).toBe('/uploads/free/thumb.webp');
  });

  it('renders an image-free card without a placeholder element', async () => {
    fetchCafe24Events.mockResolvedValue([{
      id: 'pass-without-image',
      title: '정기권',
      date: '2099-08-04',
      benefit_eligible: true,
      benefit_kind: 'season_pass',
    }]);

    renderPage();

    const title = await screen.findByText('정기권', { selector: 'h2' });
    const card = title.closest('.benefit-event-item');
    expect(card).toHaveClass('has-no-image');
    expect(card?.querySelector('img')).toBeNull();
    expect(card?.querySelector('.benefit-event-empty-image')).toBeNull();
  });

  it('removes a broken image and switches the card to the image-free layout', async () => {
    fetchCafe24Events.mockResolvedValue([{
      id: 'pass-with-broken-image',
      title: '깨진 이미지 정기권',
      date: '2099-08-04',
      benefit_eligible: true,
      benefit_kind: 'season_pass',
      image_thumbnail: '/missing.webp',
    }]);

    renderPage();

    const title = await screen.findByText('깨진 이미지 정기권');
    const card = title.closest('.benefit-event-item');
    const image = card?.querySelector('img');
    expect(image).not.toBeNull();

    fireEvent.error(image as HTMLImageElement);

    expect(card).toHaveClass('has-no-image');
    expect(card?.querySelector('img')).toBeNull();
  });

  it('marks current benefit events seen when the page is opened', async () => {
    fetchCafe24Events.mockResolvedValue([{
      id: 'new-benefit',
      title: '새 무료 행사',
      date: '2099-08-04',
      benefit_eligible: true,
      benefit_kind: 'free_event',
    }]);

    renderPage();

    await screen.findByText('새 무료 행사');
    await waitFor(() => {
      const state = JSON.parse(window.localStorage.getItem(BENEFIT_EVENTS_SEEN_STORAGE_KEY) || '{}');
      expect(state['user:benefit-page-user']).toContain('new-benefit');
    });
  });
});
