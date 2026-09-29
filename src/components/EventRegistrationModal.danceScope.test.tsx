import React from 'react';
import type { ComponentProps } from 'react';
import type EditableEventDetail from './EditableEventDetail';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'test-member' } as { id: string } | null, isAdmin: false },
  writes: [] as Array<{ method: string; data: Record<string, unknown>; filters: unknown[] }>,
  showLoading: vi.fn(), hideLoading: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../contexts/LoadingContext', () => ({ useLoading: () => mocks }));
vi.mock('../hooks/useModalHistory', () => ({ useModalHistory: vi.fn() }));
vi.mock('../lib/analytics', () => ({ logEvent: vi.fn() }));
vi.mock('../utils/analyticsEngine', () => ({ trackEvent: vi.fn() }));
vi.mock('../utils/eventMutationSync', () => ({ applyEventMutationToQueryCache: vi.fn() }));
vi.mock('../lib/queryClient', () => ({ queryClient: { invalidateQueries: vi.fn(), refetchQueries: vi.fn() } }));
vi.mock('./ImageCropModal', () => ({ default: () => null }));
vi.mock('./EditablePreviewCard', () => ({ EditablePreviewCard: () => null }));
vi.mock('./EditableEventDetail', () => ({ default: React.forwardRef<unknown, ComponentProps<typeof EditableEventDetail>>((props, _ref) => (
  <div>
    <output data-testid="scope">{props.danceScope}</output>
    <button onClick={() => { props.onUpdate('title', '살사 체험 강습'); props.onUpdate('link1', 'https://example.com/course'); props.onBenefitKindChange?.('free_event'); }}>필수 입력</button>
    <button onClick={() => { props.onUpdate('genre', '살사'); props.onDanceScopeChange?.('salsa'); }}>살사 선택</button>
    {['event', 'class', 'club'].map(category => <button key={category} onClick={() => props.onUpdate('category', category)}>{category}</button>)}
    <button onClick={props.onRegister}>등록</button>
  </div>
)) }));
vi.mock('../lib/cafe24Client', () => ({ cafe24: { from: () => {
  let write: typeof mocks.writes[number] | undefined;
  interface Query {
    select(): Query; not(): Query; gte(): Query; lte(): Query; order(): Query; limit(): Query;
    eq(key: string, value: unknown): Query;
    insert(rows: Record<string, unknown>[]): Query; update(data: Record<string, unknown>): Query;
    then(resolve: (result: unknown) => unknown): Promise<unknown>;
  }
  const query: Query = {
    select: () => query, not: () => query, gte: () => query, lte: () => query, order: () => query, limit: () => query,
    eq: (key: string, value: unknown) => { write?.filters.push([key, value]); return query; },
    insert: (rows: Record<string, unknown>[]) => { write = { method: 'insert', data: rows[0], filters: [] }; mocks.writes.push(write); return query; },
    update: (data: Record<string, unknown>) => { write = { method: 'update', data, filters: [] }; mocks.writes.push(write); return query; },
    then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: write ? [{ id: 'saved-event', ...write.data }] : [], error: null }).then(resolve),
  };
  return query;
} } }));
import EventRegistrationModal from './EventRegistrationModal';
const selectedDate = new Date('2026-09-20T12:00:00+09:00');
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
beforeEach(() => { mocks.auth.user = { id: 'test-member' }; mocks.auth.isAdmin = false; mocks.writes.length = 0; vi.spyOn(window, 'alert').mockImplementation(() => {}); vi.spyOn(window, 'confirm').mockReturnValue(true); });
describe('member event registration dance scope', () => {
  it.each(['event', 'class', 'club'])('creates a coherent Salsa %s for an ordinary member', async (category) => {
    const onClose = vi.fn();
    render(<EventRegistrationModal isOpen onClose={onClose} selectedDate={selectedDate} />);
    fireEvent.click(screen.getByText('필수 입력'));
    fireEvent.click(screen.getByText(category, { exact: true }));
    fireEvent.click(screen.getByText('살사 선택'));
    expect(screen.getByTestId('scope')).toHaveTextContent('salsa');
    fireEvent.click(screen.getByText('등록', { exact: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.writes).toHaveLength(1);
    expect(mocks.writes[0]).toMatchObject({ method: 'insert', data: { user_id: 'test-member', dance_scope: 'salsa', dance_genre: 'salsa', genre: '살사', category } });
  });
  it('preserves Salsa when an owner edits an existing lesson and retains the ownership filter', async () => {
    const onClose = vi.fn();
    const existing: ComponentProps<typeof EventRegistrationModal>['editEventData'] = { id: 'own-salsa', user_id: 'test-member', title: '살사 강습', date: '2026-09-20', category: 'class', genre: '살사', dance_scope: 'salsa', link1: 'https://example.com/course', image: '/uploads/original.webp' };
    render(<EventRegistrationModal isOpen onClose={onClose} selectedDate={selectedDate} editEventData={existing} />);
    expect(screen.getByTestId('scope')).toHaveTextContent('salsa');
    fireEvent.click(screen.getByText('등록', { exact: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mocks.writes[0]).toMatchObject({ method: 'update', data: { dance_scope: 'salsa', category: 'class', image: '/uploads/original.webp' }, filters: [['id', 'own-salsa'], ['user_id', 'test-member']] });
  });
  it('still requires login before creating any event', async () => {
    mocks.auth.user = null;
    await act(async () => { render(<EventRegistrationModal isOpen onClose={vi.fn()} selectedDate={selectedDate} />); });
    fireEvent.click(screen.getByText('등록', { exact: true }));
    expect(mocks.writes).toHaveLength(0);
  });
});
