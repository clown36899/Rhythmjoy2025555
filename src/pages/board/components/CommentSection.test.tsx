import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CommentSection from './CommentSection';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'reader' }, isAdmin: false, isAuthCheckComplete: true }) }));
vi.mock('../../../lib/cafe24Client', () => ({ cafe24: {
    from: (table: string) => ({ select: () => table === 'board_users'
        ? { in: async () => ({ data: [] }) }
        : { eq: (_field: string, postId: string) => ({ order: () => mocks.query(postId) }) } }),
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
} }));
vi.mock('./CommentForm', () => ({ default: () => null }));
vi.mock('./CommentItem', () => ({ default: ({ comment }: any) => <div>{comment.content}</div> }));
vi.mock('../../../components/LocalLoading', () => ({ default: () => <div>loading</div> }));

beforeEach(() => {
    mocks.query.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('comment read snapshots', () => {
    it('waits for successful rendering and sends only the visible snapshot', async () => {
        let resolve!: (value: unknown) => void;
        mocks.query.mockReturnValue(new Promise(r => { resolve = r; }));
        render(<CommentSection postId={1} category="free" />);
        expect(fetch).not.toHaveBeenCalled();
        await act(async () => resolve({ data: [
            { id: 'c1', post_id: 1, content: 'visible reply' },
            { id: 'hidden', post_id: 1, content: 'hidden reply', is_hidden: true },
        ] }));
        expect(screen.getByText('visible reply')).toBeInTheDocument();
        expect(screen.queryByText('hidden reply')).not.toBeInTheDocument();
        await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/board/free/read', expect.objectContaining({
            body: JSON.stringify({ postId: '1', commentIds: ['c1'] }),
        })));
    });

    it('does not mark failed loads read and recovers when the visible detail resumes', async () => {
        vi.useFakeTimers();
        mocks.query.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValue({ data: [{ id: 'c1', content: 'recovered' }] });
        render(<CommentSection postId={1} category="free" />);
        await act(async () => {});
        expect(fetch).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('댓글을 불러오지 못했습니다.');
        act(() => window.dispatchEvent(new Event('online')));
        await act(async () => { await vi.advanceTimersByTimeAsync(800); });
        expect(screen.getByText('recovered')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('retries a failed load from its visible error message', async () => {
        mocks.query.mockResolvedValueOnce({ error: new Error('offline') }).mockResolvedValue({ data: [{ id: 'c1', content: 'retried reply' }] });
        render(<CommentSection postId={1} category="free" />);
        await screen.findByRole('alert');
        expect(fetch).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        await screen.findByText('retried reply');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    });

    it('ignores a previous post response when the detail switches posts', async () => {
        let resolveOld!: (value: unknown) => void;
        mocks.query.mockReturnValueOnce(new Promise(r => { resolveOld = r; })).mockResolvedValue({ data: [{ id: 'c2', content: 'second post' }] });
        const { rerender } = render(<CommentSection postId={1} category="free" />);
        rerender(<CommentSection postId={2} category="free" />);
        await act(async () => {});
        await act(async () => resolveOld({ data: [{ id: 'c1', content: 'stale post' }] }));
        expect(screen.queryByText('stale post')).not.toBeInTheDocument();
        expect(screen.getByText('second post')).toBeInTheDocument();
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch).toHaveBeenCalledWith('/api/board/free/read', expect.objectContaining({
            body: JSON.stringify({ postId: '2', commentIds: ['c2'] }),
        }));
    });
});
