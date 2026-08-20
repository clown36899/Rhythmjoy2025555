import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StandardPostList from './StandardPostList';

afterEach(() => cleanup());

describe('StandardPostList free-board heading', () => {
    it('renders the prefix as a compact row above the mobile title', () => {
        const { container } = render(
            <StandardPostList
                posts={[{
                    id: 'post-1',
                    title: '경성홀 입장료변경안내',
                    content: '',
                    author_name: '관리자',
                    author_nickname: '관리자',
                    user_id: 'admin-1',
                    views: 1,
                    is_notice: false,
                    prefix_id: 'prefix-news',
                    prefix: {
                        id: 'prefix-news',
                        name: '뉴스',
                        color: '#22c55e',
                        admin_only: false,
                    },
                    created_at: '2026-08-13T01:21:00.000Z',
                    updated_at: '2026-08-13T01:21:00.000Z',
                    category: 'free',
                    image_thumbnail: null,
                    is_hidden: false,
                    comment_count: 0,
                    likes: 0,
                    favorites: 0,
                    dislikes: 0,
                    display_order: 0,
                } as any]}
                onPostClick={vi.fn()}
                category="free"
                isAdmin={true}
            />,
        );

        const desktopMain = container.querySelector('.free-board-main');
        expect(desktopMain?.children[0]).toHaveClass('free-board-badge-row');
        expect(desktopMain?.children[0]).toHaveTextContent('뉴스');
        expect(desktopMain?.children[1]).toHaveClass('free-board-title-line');

        const mobileMain = container.querySelector('.free-board-mobile-main');
        expect(mobileMain?.children[0]).toHaveClass('free-board-mobile-badge-row');
        expect(mobileMain?.children[0]).toHaveTextContent('뉴스');
        expect(mobileMain?.children[1]).toHaveClass('free-board-mobile-title-line');
        expect(mobileMain?.children[1]).toHaveTextContent('경성홀 입장료변경안내');
        expect(mobileMain?.querySelector('.free-board-mobile-title-line .free-board-prefix')).toBeNull();
        expect(mobileMain?.querySelector('[aria-label="조회 1"]')).toHaveTextContent('1');
        expect(mobileMain?.querySelector('[aria-label="댓글 0"]')).toHaveTextContent('0');
        expect(container.querySelector('.free-board-prefix-cell')).toBeNull();
        expect(container.querySelector('.free-board-thumb img[draggable="true"]')).toBeNull();
    });

    it('masks a raw anonymous author for non-admin board views', () => {
        const post = {
            id: 'anonymous-post',
            title: '익명 게시글',
            content: '',
            author_name: '실명 작성자',
            author_nickname: '실제 닉네임',
            author_profile_image: 'https://example.com/profile.jpg',
            user_id: 'author-1',
            views: 0,
            created_at: '2026-08-21T00:00:00.000Z',
            category: 'free',
            is_anonymous: true,
            is_hidden: false,
        } as any;

        const { container } = render(
            <StandardPostList
                posts={[post]}
                onPostClick={vi.fn()}
                category="free"
                isAdmin={false}
                currentUserId="other-user"
            />,
        );

        expect(container).toHaveTextContent('익명');
        expect(container).not.toHaveTextContent('실제 닉네임');
        expect(container.querySelector('img[alt="author"]')).toBeNull();
    });

    it('keeps the stored anonymous author visible to administrators', () => {
        const post = {
            id: 'anonymous-post',
            title: '익명 게시글',
            author_name: '실명 작성자',
            author_nickname: '실제 닉네임',
            user_id: 'author-1',
            views: 0,
            created_at: '2026-08-21T00:00:00.000Z',
            category: 'free',
            is_anonymous: true,
            is_hidden: false,
        } as any;

        const { container } = render(
            <StandardPostList
                posts={[post]}
                onPostClick={vi.fn()}
                category="free"
                isAdmin={true}
            />,
        );

        expect(container).toHaveTextContent('실제 닉네임');
    });
});
