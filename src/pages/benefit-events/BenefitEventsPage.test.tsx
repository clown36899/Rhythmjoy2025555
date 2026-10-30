import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BENEFIT_EVENTS_SEEN_STORAGE_KEY } from '../../hooks/useBenefitEventsUnreadCount';
import { getBenefitEventThumbnail } from './BenefitEventsPage';
import BenefitEventsPage from './BenefitEventsPage';

const fetchCafe24Events = vi.fn();
const updateCafe24EventById = vi.fn();
const fetchOneDayLinks = vi.fn();
let isAdmin = false;

vi.mock('../../lib/cafe24EventsApi', () => ({
  fetchCafe24Events: (...args: unknown[]) => fetchCafe24Events(...args),
  updateCafe24EventById: (...args: unknown[]) => updateCafe24EventById(...args),
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
  useAuth: () => ({ user: { id: 'benefit-page-user' }, isAdmin }),
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
    updateCafe24EventById.mockReset();
    isAdmin = false;
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
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(within(dialog).queryByRole('button', { name: '혜택 분류 수정' })).not.toBeInTheDocument();
  });

  it.each([
    ['일반', null], ['할인 이벤트', 'discount_event'], ['정기권', 'season_pass'],
  ])('lets an administrator save %s in the existing benefit editor and immediately updates the list', async (label, kind) => {
    isAdmin = true;
    const event = { id: 'editable', title: '유료 워크숍', date: '2099-11-05', benefit_eligible: true, benefit_kind: 'free_event' };
    fetchCafe24Events.mockResolvedValue([event]);
    updateCafe24EventById.mockResolvedValue({ ...event, benefit_eligible: kind !== null, benefit_kind: kind });
    renderPage();
    fireEvent.click((await screen.findByText(event.title)).closest('.benefit-event-item') as HTMLElement);
    fireEvent.click(screen.getByRole('button', { name: '혜택 분류 수정' }));
    const options = await screen.findByRole('group', { name: '혜택 분류' });
    fireEvent.click(within(options).getByRole('button', { name: label }));
    fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(updateCafe24EventById).toHaveBeenCalledWith('editable', {
      benefit_eligible: kind !== null, benefit_kind: kind,
    }));
    await waitFor(() => expect(screen.queryByRole('group', { name: '혜택 분류' })).not.toBeInTheDocument());
    if (kind === null) {
      expect(screen.queryByText(event.title)).not.toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } else {
      expect(screen.getByRole('dialog')).toHaveTextContent(kind === 'season_pass' ? '정기권' : '할인');
    }
  });

  it('keeps the event and allows a retry when saving fails', async () => {
    isAdmin = true;
    fetchCafe24Events.mockResolvedValue([{ id: 'retry', title: '실패 후 재시도', date: '2099-11-05', benefit_eligible: true, benefit_kind: 'free_event' }]);
    updateCafe24EventById.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce({ id: 'retry', title: '실패 후 재시도', benefit_eligible: false, benefit_kind: null });
    renderPage();
    fireEvent.click((await screen.findByText('실패 후 재시도')).closest('.benefit-event-item') as HTMLElement);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(screen.getByRole('button', { name: '혜택 분류 수정' }));
      const options = await screen.findByRole('group', { name: '혜택 분류' });
      fireEvent.click(within(options).getByRole('button', { name: '일반', exact: true }));
      fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
      if (attempt === 0) {
        expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다');
        expect(screen.getByRole('dialog')).toHaveTextContent('무료 혜택');
      }
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updateCafe24EventById).toHaveBeenCalledTimes(2);
  });

  it('routes synthetic one-day links to their existing owner instead of the events API', async () => {
    isAdmin = true;
    fetchCafe24Events.mockResolvedValue([]);
    fetchOneDayLinks.mockReturnValue([{ id: 'community', community: '동호회', benefit_eligible: true, benefit_kind: 'free_event', url: 'https://example.com' }]);
    renderPage();
    fireEvent.click((await screen.findByText('동호회 원데이 모집')).closest('.benefit-event-item') as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link', { name: '원데이 모집 수정' })).toHaveAttribute('href', '/oneday-recruits?dance=swing');
    expect(within(dialog).queryByRole('button', { name: '혜택 분류 수정' })).not.toBeInTheDocument();
    expect(updateCafe24EventById).not.toHaveBeenCalled();
  });
  it('hides ended benefits but preserves today, remaining occurrences and undated offers', async () => {
    const today = new Date().toLocaleDateString('en-CA');
    fetchCafe24Events.mockResolvedValue([
      { id: 'past', title: '종료된 무료', date: '2000-01-01', benefit_eligible: true, benefit_kind: 'free_event' },
      { id: 'today', title: '오늘 무료', date: today, benefit_eligible: true, benefit_kind: 'free_event' },
      { id: 'multi', title: '남은 회차', date: '2000-01-01', event_dates: ['2000-01-01', '2099-08-04'], benefit_eligible: true },
      { id: 'ongoing', title: '상시 혜택', benefit_eligible: true },
    ]);
    renderPage();
    await screen.findByText('오늘 무료');
    expect(screen.queryByText('종료된 무료')).not.toBeInTheDocument();
    expect(screen.getByText('남은 회차')).toBeInTheDocument();
    expect(screen.getByText('상시 혜택')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '목록 요약' })).toHaveTextContent('3개 수집');
  });

  it('shows the free lesson scope in list and detail without a separate time or draggable image', async () => {
    const description = '무료 라인강습: 심샘(세인트루이스) - 리베\n강습만 무료 · 소셜 입장료 별도';
    const offerTitle = '무료 라인강습: 심샘(세인트루이스) - 리베';
    fetchCafe24Events.mockResolvedValue([{
      id: 'partial', title: '유료 소셜', date: '2099-08-04', activity_type: 'social',
      benefit_eligible: true, benefit_kind: 'free_event', description: '다른 회차 DJ 로젤 소셜 안내',
      benefit_details: {title: offerTitle, description},
      time: '19:40', image_thumbnail: '/poster.webp', image_full: '/poster.webp', link1: 'https://example.com/post',
    }]);
    renderPage();
    const title = await screen.findByRole('heading', {name: offerTitle});
    expect(screen.queryByText('유료 소셜')).not.toBeInTheDocument();
    expect(screen.queryByText('다른 회차 DJ 로젤 소셜 안내')).not.toBeInTheDocument();
    expect(document.querySelector('.benefit-event-offer')?.textContent).toBe(description);
    expect(screen.getByText('무료 혜택')).toBeInTheDocument();
    expect(screen.queryByText('19:40')).not.toBeInTheDocument();
    expect(document.querySelector('img')).toHaveAttribute('draggable', 'false');
    fireEvent.click(title.closest('.benefit-event-item') as HTMLElement);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading', {name: offerTitle})).toBeInTheDocument();
    expect(dialog.querySelector('p')?.textContent).toBe(description);
    expect(within(dialog).queryByText('19:40')).not.toBeInTheDocument();
    for (const anchor of document.querySelectorAll('a')) expect(anchor).toHaveAttribute('draggable', 'false');
  });

});
