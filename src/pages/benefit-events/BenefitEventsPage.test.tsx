import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BENEFIT_EVENTS_SEEN_STORAGE_KEY } from '../../hooks/useBenefitEventsUnreadCount';
import { getBenefitEventThumbnail } from './BenefitEventsPage';
import BenefitEventsPage from './BenefitEventsPage';

const fetchCafe24Events = vi.fn();
const fetchOneDayLinks = vi.fn();

vi.mock('../../lib/cafe24EventsApi', () => ({
  fetchCafe24Events: (...args: unknown[]) => fetchCafe24Events(...args),
}));

vi.mock('../../lib/cafe24Client', () => ({
  cafe24: {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: fetchOneDayLinks(), error: null }),
      }),
    }),
  },
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'benefit-page-user' } }),
}));

function renderPage(url = '/benefit-events') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[url]}><BenefitEventsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('benefit event images', () => {
  beforeEach(() => {
    fetchCafe24Events.mockReset();
    fetchOneDayLinks.mockReturnValue([]);
    window.localStorage.clear();
  });

  it('separates events and one-day links by genre and only marks the selected genre seen', async () => {
    fetchCafe24Events.mockResolvedValue([
      { id: 'legacy', title: '기존 스윙 강습', date: '2099-08-04', benefit_eligible: true },
      { id: 'salsa', title: '살사 할인 강습', dance_scope: 'salsa', date: '2099-08-04', benefit_eligible: true, benefit_kind: 'discount_event' },
      { id: 'tango', title: '탱고 강습', dance_scope: 'tango', date: '2099-08-04', benefit_eligible: true },
    ]);
    fetchOneDayLinks.mockReturnValue([
      { id: 'salsa-link', community: '라틴 동호회', dance_scope: 'salsa', benefit_eligible: true, benefit_kind: 'free_event', url: 'https://example.com/salsa' },
      { id: 'legacy-link', community: '기존 동호회', benefit_eligible: true, benefit_kind: 'free_event', url: 'https://example.com/swing' },
    ]);
    renderPage('/benefit-events?dance=salsa');
    await screen.findByText('살사 할인 강습');
    expect(screen.getByText('라틴 동호회 원데이 모집')).toBeInTheDocument();
    expect(screen.queryByText('기존 스윙 강습')).not.toBeInTheDocument();
    expect(screen.queryByText('기존 동호회 원데이 모집')).not.toBeInTheDocument();
    expect(screen.queryByText('탱고 강습')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '메인으로 이동' })).toHaveAttribute('href', '/?dance=salsa');
    expect(screen.getByRole('button', { name: '탱고 준비중' })).toBeDisabled();
    expect(screen.getByRole('region', { name: '목록 요약' })).toHaveTextContent('2개 수집');
    await waitFor(() => {
      const seen = JSON.parse(window.localStorage.getItem(BENEFIT_EVENTS_SEEN_STORAGE_KEY) || '{}');
      expect(seen['user:benefit-page-user']).toEqual(['oneday-salsa-link', 'salsa']);
    });
    fireEvent.click(screen.getByRole('button', { name: '스윙', exact: true }));
    await screen.findByText('기존 스윙 강습');
    expect(screen.getByText('기존 동호회 원데이 모집')).toBeInTheDocument();
    expect(screen.queryByText('살사 할인 강습')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '스윙', exact: true })).toHaveAttribute('aria-pressed', 'true');
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

  it('opens an event detail with the same display date used by the list', async () => {
    fetchCafe24Events.mockResolvedValue([{
      id: 'detail-benefit',
      title: '상세 무료 행사',
      date: '2099-08-04',
      benefit_eligible: true,
      benefit_kind: 'free_event',
      location: '해피홀',
    }]);

    renderPage();

    const title = await screen.findByText('상세 무료 행사');
    fireEvent.click(title.closest('.benefit-event-item') as HTMLElement);

    const dialog = screen.getByRole('dialog', { name: '상세 무료 행사' });
    expect(within(dialog).getByText(/8월 4일/)).toBeInTheDocument();
    expect(within(dialog).getByText('해피홀')).toBeInTheDocument();
  });
});
