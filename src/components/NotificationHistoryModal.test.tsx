import fs from 'node:fs/promises';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
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

const getKstTodayKey = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
};

const addDateKeyDays = (dateKey: string, days: number) => {
    const date = new Date(`${dateKey}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

describe('NotificationHistoryModal route separation', () => {
    it('prioritizes today schedules over new registration without route counts', () => {
        const todayDateKey = getKstTodayKey();
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
                                date: todayDateKey,
                                items: [
                                    { title: '오늘 일정 A', date: '2026-07-30', location: 'A홀', image: '/a.jpg' },
                                    { title: '오늘 일정 B', date: '2026-07-18', location: 'B홀' },
                                ],
                            },
                        },
                        {
                            ...common,
                            id: 'server:new-today',
                            title: '오늘 새 소셜 등록',
                            body: '오늘 열리는 신규 일정',
                            data: { notificationKind: 'new_event', category: 'social', date: todayDateKey },
                        },
                        {
                            ...common,
                            id: 'server:new-future',
                            title: '다음 주 새 소셜 등록',
                            body: '다음 주 열리는 신규 일정',
                            data: {
                                notificationKind: 'new_event',
                                category: 'social',
                                date: addDateKeyDays(todayDateKey, 7),
                            },
                        },
                    ]}
                />
            </MemoryRouter>,
        );

        expect(screen.getByText('오늘 일정')).toBeInTheDocument();
        expect(screen.getByText('신규 등록')).toBeInTheDocument();
        expect(screen.getByText('오늘 진행되는 일정')).toBeInTheDocument();
        expect(screen.getByText('알림 설정 후 새로 등록된 일정')).toBeInTheDocument();
        expect(screen.queryByText('첫 일정 · 테스트홀 외 1개')).not.toBeInTheDocument();
        expect(container.querySelector('.nhm-route-summary')).not.toBeInTheDocument();
        expect(screen.queryByText(/오늘 일정 \(\d+\)/)).not.toBeInTheDocument();
        expect(screen.queryByText(/신규 등록 \(\d+\)/)).not.toBeInTheDocument();
        expect(container.querySelectorAll('[data-notification-kind="daily_schedule"]')).toHaveLength(3);
        expect(container.querySelectorAll('[data-notification-kind="new_event"]')).toHaveLength(1);
        expect(screen.getAllByText('오늘 시작')).toHaveLength(3);
        expect(screen.getByText('오늘 새 소셜 등록')).toBeInTheDocument();
        expect(screen.getByText('다음 주 새 소셜 등록')).toBeInTheDocument();
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
        expect(css).not.toContain('.nhm-route-summary');
    });
});
