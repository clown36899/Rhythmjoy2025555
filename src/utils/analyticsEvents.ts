import { trackEvent } from './analyticsEngine';

interface ActivitySuccessParams {
    id: string | number;
    type: string;
    title?: string | null;
    section: string;
    category?: string | null;
    userId?: string | null;
    isAdmin?: boolean;
}

export const trackActivitySuccess = ({
    id,
    type,
    title,
    section,
    category,
    userId,
    isAdmin,
}: ActivitySuccessParams) => {
    trackEvent({
        target_id: String(id),
        target_type: type,
        target_title: title || undefined,
        section,
        category: category || undefined,
        route: window.location.pathname,
        user_id: userId || undefined,
        is_admin: isAdmin,
    });
};
