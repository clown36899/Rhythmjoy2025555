import { describe, expect, it } from 'vitest';
import { selectOneDayRecruitLinks, swingOneDayRecruitLinks, type SwingOneDayRecruitLink } from './swingOneDayRecruitLinks';

const legacy = { id: 'legacy', community: '스윙 모임' } as SwingOneDayRecruitLink;
const salsa = { id: 'salsa', community: '살사 모임', dance_scope: 'salsa' } as SwingOneDayRecruitLink;

describe('shared recruitment directory genre data', () => {
    it('keeps legacy untagged links in Swing and explicit Salsa links in Salsa', () => {
        expect(selectOneDayRecruitLinks([legacy, salsa], 'swing').links).toEqual([legacy]);
        expect(selectOneDayRecruitLinks([legacy, salsa], 'salsa').links).toEqual([salsa]);
    });
    it('preserves Swing fallback even after another genre is added to the DB', () => {
        expect(selectOneDayRecruitLinks([salsa], 'swing')).toEqual({ links: swingOneDayRecruitLinks, usingLegacyFallback: true });
    });
    it('never fills an empty expanded genre with the Swing fallback', () => {
        expect(selectOneDayRecruitLinks([], 'salsa')).toEqual({ links: [], usingLegacyFallback: false });
        expect(selectOneDayRecruitLinks([legacy], 'bachata').links).toEqual([]);
    });
});
