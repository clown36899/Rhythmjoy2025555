export interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    youtube_url?: string;
    attachment_url?: string;
    url?: string;
    // Unified Resoruce Fields
    type?: 'VIDEO' | 'PLAYLIST' | 'DOCUMENT' | 'PERSON' | string;
    metadata?: any; // For flexible data (duration, is_public, etc)

    // Legacy mapping (keep optional for now)
    subtype?: string;
    youtube_video_id?: string;
    youtube_playlist_id?: string;

    user_id?: string;
    category?: string;
    tags?: string[];
    linked_playlist_id?: string;
    linked_document_id?: string;
    linked_video_id?: string;
    linked_category_id?: string;
    thumbnail_url?: string | null;
    image_url?: string | null;
    playlist_data?: any;
    nodeType?: string;
    onEdit?: (data: HistoryNodeData) => void;
    onViewDetail?: (data: HistoryNodeData) => void;
    onPlayVideo?: (url: string, playlistId?: string | null, linkedVideoId?: string | null) => void;
    onPreviewLinkedResource?: (id: string, type: string, title: string) => void;
    isSelectionMode?: boolean; // Disable click actions in selection mode
    isEditMode?: boolean; // Show/Hide edit controls
}
