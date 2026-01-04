export interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    youtube_url?: string;
    category?: string;
    tags?: string[];
    linked_playlist_id?: string;
    linked_document_id?: string;
    linked_video_id?: string;
    linked_category_id?: string; // 카테고리(폴더) 연결
    playlist_data?: any;
    nodeType?: string;
    onEdit?: (data: HistoryNodeData) => void;
    onViewDetail?: (data: HistoryNodeData) => void;
    onPlayVideo?: (url: string, playlistId?: string | null) => void;
    onPreviewLinkedResource?: (id: string, type: string, title: string) => void;
}
