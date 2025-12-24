export interface BaseBoardPost {
    id: number;
    title: string;
    content?: string;
    views: number;
    created_at: string;
    image?: string | null;
    image_thumbnail?: string | null;
    is_notice?: boolean;
    likes?: number; // Optional as not all boards might use it heavily, but common
}

export interface StandardBoardPost extends BaseBoardPost {
    user_id: string; // Standard posts must be linked to a user
    author_name: string; // Display name
    author_nickname?: string;
    author_profile_image?: string | null; // Profile image URL
    prefix_id?: number | null;
    prefix?: {
        id: number;
        name: string;
        color: string;
        admin_only: boolean;
    };
    category: string; // 'free', 'market', etc.
    comment_count?: number; // Often joined or counted
    likes_count?: number;
    is_hidden?: boolean; // For admin visibility control
    // Standard specific fields
}

export interface AnonymousBoardPost extends BaseBoardPost {
    // No user_id (or null)
    author_name: string; // Usually nickname entered by user
    author_nickname: string; // Explicit nickname field
    password?: string; // Only used for verification, verified server-side usually
    likes: number;
    dislikes: number;
    is_hidden: boolean;
    comment_count?: number; // Added for display
    // Anonymous specific fields
}

// Union type for legacy compatibility during migration, but ideally we split usage
export type AnyBoardPost = StandardBoardPost | AnonymousBoardPost;
