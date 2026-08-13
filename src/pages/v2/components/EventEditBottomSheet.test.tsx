import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EventEditBottomSheet from './EventEditBottomSheet';

afterEach(() => cleanup());

describe('EventEditBottomSheet benefit classification', () => {
    it('allows an incorrectly classified discount event to be saved as general', () => {
        const onSave = vi.fn();

        render(
            <EventEditBottomSheet
                activeField="benefitKind"
                onClose={vi.fn()}
                initialValue={{
                    benefit_eligible: true,
                    benefit_kind: 'discount_event',
                }}
                onSave={onSave}
                isSaving={false}
                event={{}}
                structuredGenres={{ class: [], event: [] }}
                allHistoricalGenres={[]}
            />,
        );

        expect(screen.getByRole('button', { name: '할인 이벤트' })).toHaveAttribute('aria-pressed', 'true');

        fireEvent.click(screen.getByRole('button', { name: '일반' }));
        fireEvent.click(screen.getByRole('button', { name: '저장' }));

        expect(onSave).toHaveBeenCalledWith(null, 'event');
    });
});
