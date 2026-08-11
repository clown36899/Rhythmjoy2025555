import fs from 'node:fs/promises';
import path from 'node:path';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import NotificationHistoryModal from './NotificationHistoryModal';

vi.mock('../contexts/ModalContext', () => ({
    useModalActions: () => ({ openModal: vi.fn() }),
}));

vi.mock('../lib/cafe24Client', () => ({
    cafe24: { from: vi.fn() },
}));

const common = {
    is_read: false,
    received_at: '2026-08-11T00:00:00.000Z',
};

describe('NotificationHistoryModal route separation', () => {
    it('renders today schedules and newly registered events as separate sections and counts', () => {
        const { container } = render(
            <MemoryRouter>
                <NotificationHistoryModal
                    isOpen
                    onClose={vi.fn()}
                    onRefresh={vi.fn()}
                    notifications={[
                        {
                            ...common,
                            id: 'server:daily',
                            title: '오늘 일정 2개',
                            body: '첫 일정 · 테스트홀 외 1개',
                            data: {
                                notificationKind: 'daily_schedule',
                                kind: 'daily_schedule_morning',
                                date: '2026-08-11',
                                items: [
                                    { title: '오늘 일정 A', date: '2026-07-30', location: 'A홀', image: '/a.jpg' },
                                    { title: '오늘 일정 B', date: '2026-07-18', location: 'B홀' },
                                ],
                            },
                        },
                        {
                            ...common,
                            id: 'server:new',
                            title: '새 소셜 등록',
                            body: '설정 이후 등록된 일정',
                            data: { notificationKind: 'new_event', category: 'social' },
                        },
                    ]}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('오늘 일정 (2)')).toBeInTheDocument();
        expect(screen.getByText('신규 등록 (1)')).toBeInTheDocument();
        expect(screen.getByText('시작일이 오늘인 일정')).toBeInTheDocument();
        expect(screen.getByText('알림 설정 후 새로 등록된 일정')).toBeInTheDocument();
        expect(screen.queryByText('첫 일정 · 테스트홀 외 1개')).not.toBeInTheDocument();

        const summary = screen.getByLabelText('읽지 않은 알림 종류별 개수');
        expect(within(summary).getByText('오늘 일정').parentElement).toHaveTextContent('2');
        expect(within(summary).getByText('신규 등록').parentElement).toHaveTextContent('1');
        expect(container.querySelectorAll('[data-notification-kind="daily_schedule"]')).toHaveLength(2);
        expect(container.querySelectorAll('[data-notification-kind="new_event"]')).toHaveLength(1);
        expect(screen.getAllByText('오늘 시작')).toHaveLength(2);
        expect(screen.queryByText('7.30')).not.toBeInTheDocument();
        expect(screen.queryByText('7.18')).not.toBeInTheDocument();
        expect(container.querySelector('img')).toHaveAttribute('draggable', 'false');
        expect(screen.getByText(/다음 발송 설정에는 영향을 주지 않습니다/)).toBeInTheDocument();
    });

    it('keeps notification images scrollable instead of browser-draggable on mobile', async () => {
        const css = await fs.readFile(path.resolve(
            process.cwd(),
            'src/styles/components/NotificationHistoryModal.css',
        ), 'utf8');

        expect(css).toContain('-webkit-user-drag: none');
        expect(css).toContain('touch-action: pan-y pinch-zoom');
        expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
    });
});
