import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BoardDetailModal from './BoardDetailModal';

const mocks = vi.hoisted(() => ({
    refreshPost: vi.fn(),
    deletePost: vi.fn(),
    toggleHidden: vi.fn(),
    detailArgs: null as any,
    auth: {
        user: { id: 'admin-1' },
        isAdmin: true,
        userProfile: { nickname: '관리자', profile_image: null },
    },
}));

vi.mock('../hooks/useBoardDetail', () => ({
    useBoardDetail: (args: any) => {
        mocks.detailArgs = args;
        return {
            post: {
                id: 'post-1',
                title: '수정할 글',
                content: '<p>본문</p>',
                author_name: '관리자',
                author_nickname: '관리자',
                user_id: 'admin-1',
                category: 'free',
                is_hidden: false,
                is_notice: false,
                views: 1,
                likes: 0,
                created_at: '2026-08-13T01:21:00.000Z',
                prefix: { id: 'prefix-news', name: '뉴스', color: '#22c55e' },
            },
            loading: false,
            error: null,
            updating: false,
            handleDelete: mocks.deletePost,
            handleToggleHidden: mocks.toggleHidden,
            refreshPost: mocks.refreshPost,
        };
    },
}));

vi.mock('../../../contexts/AuthContext', () => ({
    useAuth: () => mocks.auth,
}));

vi.mock('../../../lib/cafe24Client', () => ({
    cafe24: { from: vi.fn() },
}));

vi.mock('../../../hooks/useFreeBoardUnreadCount', () => ({
    useMarkFreeBoardPostRead: vi.fn(),
}));

vi.mock('../../../components/GlobalLoadingOverlay', () => ({
    default: () => null,
}));

vi.mock('./ReadOnlyBoardContent', () => ({
    default: () => <div>본문</div>,
}));

vi.mock('./CommentSection', () => ({
    default: () => null,
}));

vi.mock('./UniversalPostEditor', () => ({
    default: ({ onPostCreated }: { onPostCreated: () => void | Promise<void> }) => (
        <button type="button" onClick={() => void onPostCreated()}>편집 저장 완료</button>
    ),
}));

afterEach(() => cleanup());

beforeEach(() => {
    mocks.refreshPost.mockReset().mockResolvedValue(undefined);
    mocks.deletePost.mockReset();
    mocks.toggleHidden.mockReset().mockResolvedValue(true);
    mocks.detailArgs = null;
    mocks.auth.user = { id: 'admin-1' };
    mocks.auth.isAdmin = true;
});

function renderModal(onPostChanged = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) {
    render(
        <BoardDetailModal
            postId="post-1"
            category="free"
            isOpen={true}
            onClose={onClose}
            onPostChanged={onPostChanged}
        />,
    );
    return { onPostChanged, onClose };
}

describe('BoardDetailModal list synchronization', () => {
    it('places share before edit and copies a deep link when native share is unavailable', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
        renderModal();

        const shareButton = screen.getByRole('button', { name: '게시물 공유' });
        const editButton = screen.getByRole('button', { name: '게시물 수정' });
        expect(shareButton.compareDocumentPosition(editButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        fireEvent.click(shareButton);
        await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
        const sharedUrl = new URL(writeText.mock.calls[0][0]);
        expect(sharedUrl.pathname).toBe('/board');
        expect(sharedUrl.searchParams.get('category')).toBe('free');
        expect(sharedUrl.searchParams.get('postId')).toBe('post-1');
        alertSpy.mockRestore();
    });

    it('keeps share public while edit controls remain permission-gated', () => {
        mocks.auth.user = { id: 'reader-1' };
        mocks.auth.isAdmin = false;
        renderModal();

        expect(screen.getByRole('button', { name: '게시물 공유' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '게시물 수정' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '게시물 삭제' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '게시물 숨기기' })).not.toBeInTheDocument();
    });

    it('refreshes both detail and list after an edit is saved', async () => {
        const { onPostChanged } = renderModal();

        fireEvent.click(screen.getByTitle('수정'));
        fireEvent.click(await screen.findByRole('button', { name: '편집 저장 완료' }));

        await waitFor(() => {
            expect(mocks.refreshPost).toHaveBeenCalledTimes(1);
            expect(onPostChanged).toHaveBeenCalledTimes(1);
        });
    });

    it('refreshes the list after visibility changes', async () => {
        const { onPostChanged } = renderModal();

        fireEvent.click(screen.getByTitle('숨기기'));

        await waitFor(() => expect(onPostChanged).toHaveBeenCalledTimes(1));
    });

    it('refreshes the list before closing after deletion', async () => {
        const { onPostChanged, onClose } = renderModal();
        mocks.deletePost.mockImplementation(async () => {
            await mocks.detailArgs.onPostDeleted();
        });

        fireEvent.click(screen.getByTitle('삭제'));

        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(onPostChanged).toHaveBeenCalledTimes(1);
        expect(onPostChanged.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
    });
});
