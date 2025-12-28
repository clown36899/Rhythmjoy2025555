export interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    youtube_url?: string;
    category?: string;
    tags?: string[];
    onEdit?: (data: HistoryNodeData) => void;
    onViewDetail?: (data: HistoryNodeData) => void;
    onPlayVideo?: (url: string) => void;
}
