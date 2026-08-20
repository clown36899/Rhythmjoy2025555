import { cafe24, type Event } from './cafe24Client';

export type OneDayBenefitLink = {
    id: string;
    community: string;
    venue?: string | null;
    region?: string | null;
    area?: string | null;
    url: string;
    logo_micro?: string | null;
    logo_thumbnail?: string | null;
    logo_medium?: string | null;
    logo_full?: string | null;
    benefit_eligible?: boolean | null;
    benefit_kind?: 'free_event' | 'discount_event' | null;
    is_active?: boolean | null;
};

export function oneDayLinkToBenefitEvent(link: OneDayBenefitLink): Event {
    return {
        id: `oneday-${link.id}`,
        title: `${link.community} 원데이 모집`,
        time: '',
        location: link.venue || link.area || link.region || '장소 미정',
        category: 'class',
        genre: '원데이모집',
        price: link.benefit_kind === 'free_event' ? '무료' : '',
        image: link.logo_full || link.logo_medium || link.logo_thumbnail || link.logo_micro || '',
        image_micro: link.logo_micro || undefined,
        image_thumbnail: link.logo_thumbnail || undefined,
        image_medium: link.logo_medium || undefined,
        image_full: link.logo_full || undefined,
        description: '상시 원데이 모집 링크',
        organizer: link.community,
        link1: link.url,
        link_name1: '모집 링크',
        benefit_eligible: link.benefit_eligible === true,
        benefit_kind: link.benefit_kind || null,
    };
}

export async function fetchActiveOneDayBenefitEvents() {
    const { data, error } = await cafe24
        .from('swing_oneday_recruit_links')
        .select('id,community,venue,region,area,url,logo_micro,logo_thumbnail,logo_medium,logo_full,benefit_eligible,benefit_kind,is_active')
        .eq('is_active', true);

    if (error) throw error;

    return ((data || []) as OneDayBenefitLink[])
        .filter((link) => link.benefit_eligible === true)
        .map(oneDayLinkToBenefitEvent);
}
