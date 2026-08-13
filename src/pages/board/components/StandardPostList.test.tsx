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
        expect(container.querySelector('.free-board-prefix-cell')).toBeNull();
        expect(container.querySelector('.free-board-thumb img[draggable="true"]')).toBeNull();
    });
});
