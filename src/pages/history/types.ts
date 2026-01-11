export interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    content?: string; // 사용자 상세 메모
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
    z_index?: number; // 뎁스 조절용
    tags?: string[];
    linked_playlist_id?: string;
    linked_document_id?: string;
    linked_video_id?: string;
    linked_category_id?: string;
    parent_node_id?: string; // For Group/Container Logic
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
