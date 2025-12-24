export interface BaseBoardPost {
    id: number;
    title: string;
    content: string;
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
    prefix_id?: number | null;
    category: string; // 'free', 'market', etc.
    comment_count?: number; // Often joined or counted
    likes_count?: number;
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
    // Anonymous specific fields
}

// Union type for legacy compatibility during migration, but ideally we split usage
export type AnyBoardPost = StandardBoardPost | AnonymousBoardPost;
