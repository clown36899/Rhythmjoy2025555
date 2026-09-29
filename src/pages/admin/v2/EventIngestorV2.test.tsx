import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ isAdmin: true, isAuthCheckComplete: true }) }));
vi.mock('../../../lib/cafe24EventsApi', () => ({ fetchCafe24Events: vi.fn(async () => []) }));
vi.mock('../../../lib/cafe24Client', () => ({ cafe24: {
  auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
} }));
vi.mock('../../../components/ImageCropModal', () => ({ default: () => null }));
vi.mock('./components/EventEditModal', () => ({ default: ({ isOpen, onSuccess, event }: { isOpen: boolean; onSuccess: (id: string) => void; event: { id: string } }) => isOpen
  ? <button onClick={() => onSuccess(event.id)}>등록 성공 재현</button> : null }));
import EventIngestorV2 from './EventIngestorV2';

const candidate = { id: 'candidate', source_url: 'https://example.com/social', extracted_text: '',
  status: 'pending', structured_data: { title: '검증 대상 소셜', date: '2026-10-01', location: '스윙타임', category: 'social' } };
let registered: boolean;
let failList: boolean;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  registered = false;
  failList = false;
  fetchMock = vi.fn(async (url: string) => {
    if (failList) return { ok: false, status: 503, text: async () => '일시적인 조회 실패', json: async () => ({}) };
    const tab = new URL(url, 'http://localhost').searchParams.get('tab');
    const rows = (!registered && tab === 'new') || (registered && tab === 'collected')
      ? [{ ...candidate, status: registered ? 'collected' : 'pending', is_collected: registered }] : [];
    return { ok: true, json: async () => ({ data: rows, total: rows.length }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const open = async () => { await act(async () => { render(<EventIngestorV2 />); }); };
const list = () => within(screen.getByRole('region', { name: '수집 후보 리스트' }));

it('refreshes automatic registration on return and shows it under already registered', async () => {
  await open();
  expect(list().getByText(candidate.structured_data.title)).toBeInTheDocument();
  registered = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(list().queryByText(candidate.structured_data.title)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이미 등록 1' })).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이미 등록 1' })); });
  expect(list().getByText(candidate.structured_data.title)).toBeInTheDocument();
});

it('refreshes an open list periodically and stops while hidden or unmounted', async () => {
  await open();
  registered = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(list().queryByText(candidate.structured_data.title)).not.toBeInTheDocument();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  fetchMock.mockClear();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).not.toHaveBeenCalled();
  cleanup();
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('pauses background reads during editing and updates list and counts after manual success', async () => {
  await open();
  await act(async () => { fireEvent.click(list().getByRole('button', { name: '등록', exact: true })); });
  fetchMock.mockClear();
  registered = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(60_000); });
  expect(fetchMock).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '등록 성공 재현' })); });
  expect(list().queryByText(candidate.structured_data.title)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이미 등록 1' })).toBeInTheDocument();
});

it('retains the last list on background failure and retries on visibility return', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await open();
  failList = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  expect(list().getByText(candidate.structured_data.title)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '신규 1' })).toBeInTheDocument();
  failList = false;
  registered = true;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(list().queryByText(candidate.structured_data.title)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '이미 등록 1' })).toBeInTheDocument();
});

it('ignores an older background list response after switching tabs', async () => {
  await open();
  let resolveOld: (response: unknown) => void = () => {};
  fetchMock.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  registered = true;
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '이미 등록 1' })); });
  await act(async () => { resolveOld({ ok: true, json: async () => ({ data: [{ ...candidate,
    structured_data: { ...candidate.structured_data, title: '이전 요청 후보' } }], total: 1 }) }); });
  expect(list().queryByText('이전 요청 후보')).not.toBeInTheDocument();
  expect(list().getByText(candidate.structured_data.title)).toBeInTheDocument();
});
