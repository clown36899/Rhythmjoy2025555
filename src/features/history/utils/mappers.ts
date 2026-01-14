import type { HistoryRFNode, HistoryNodeData, NodeBehavior } from '../types';
import { parseVideoUrl } from '../../../utils/videoEmbed';

/**
 * DB에서 가져온 로우 데이터를 HistoryRFNode 형식으로 변환하는 매퍼
 */
export const mapDbNodeToRFNode = (
    node: any,
    handlers: {
        onEdit?: (data: HistoryNodeData) => void;
        onViewDetail?: (data: HistoryNodeData) => void;
        onPlayVideo?: (url: string, playlistId?: string | null, linkedVideoId?: string | null) => void;
        onPreviewLinkedResource?: (id: string, type: string, title: string) => void;
        onNavigate?: (id: string | null, title: string) => void;
        onSelectionChange?: (id: string, selected: boolean) => void;
        onResizeStop?: (id: string | number, width: number, height: number, x: number, y: number) => void;
    },
    isEditMode: boolean = false
): HistoryRFNode => {
    const lp = node.linked_playlist;
    const ld = node.linked_document;
    const lv = node.linked_video;
    const lc = node.linked_category;

    // 기본값 설정
    let title = node.title;
    let year = node.year;
    let date = node.date;
    let desc = node.description || '';
    let content = node.content || '';
    let category = node.category;
    let thumbnail_url = null;
    let image_url = null;
    let nodeType = 'default';

    // 연결된 리소스가 있는 경우 정보 덮어쓰기 (Source of Truth)
    if (lp) {
        title = lp.title || lp.name || title;
        desc = lp.description || desc;
        content = lp.content || content;
        year = lp.year || year;
        date = lp.date || date;
        thumbnail_url = lp.image_url || (lp.metadata?.thumbnail_url);
        image_url = lp.image_url;
        nodeType = 'playlist';
        category = 'playlist';
    } else if (lc) {
        // [Fix] learning_categories table uses 'name', not 'title'
        title = lc.name || lc.title || title;
        // [Fix] learning_categories description usually in metadata
        desc = lc.description || lc.metadata?.description || desc;
        content = lc.content || content;
        year = lc.year || (lc.metadata?.year ? parseInt(lc.metadata.year) : year);
        date = lc.date || date;
        thumbnail_url = lc.image_url;
        image_url = lc.image_url;

        let isLinkedCanvas = false;
        if (lc?.type === 'canvas') {
            isLinkedCanvas = true;
        } else if (lc?.type === 'general') {
            let meta = lc.metadata;
            if (typeof meta === 'string') {
                try { meta = JSON.parse(meta); } catch (e) { /* ignore */ }
            }
            if (meta?.subtype === 'canvas') isLinkedCanvas = true;
        }

        if (node.category === 'playlist' || lc?.type === 'playlist') {
            nodeType = 'playlist';
            category = 'playlist';
        } else if (node.category === 'canvas' || isLinkedCanvas) {
            nodeType = 'canvas';
            category = 'canvas';
        } else {
            nodeType = 'folder';
            category = 'folder';
        }
    } else if (ld) {
        title = ld.title || ld.name || title;
        desc = ld.description || desc;
        content = ld.content || content;
        year = ld.year || year;
        date = ld.date || date;
        image_url = ld.image_url;
        thumbnail_url = ld.image_url;
        nodeType = ld.type === 'person' ? 'person' : 'document';
        category = ld.type === 'person' ? 'person' : 'document';
    } else if (lv) {
        title = lv.title || lv.name || title;
        desc = lv.description || desc;
        content = lv.content || content;
        year = lv.year || year;
        image_url = lv.image_url;
        thumbnail_url = lv.image_url || (lv.metadata?.youtube_video_id ? `https://img.youtube.com/vi/${lv.metadata.youtube_video_id}/mqdefault.jpg` : null);
        nodeType = 'video';
        category = 'video';
    }

    // 썸네일 최종 폴백
    const finalYoutubeUrl = node.youtube_url || lv?.url || lp?.url;
    if (!thumbnail_url && finalYoutubeUrl) {
        const vInfo = parseVideoUrl(finalYoutubeUrl);
        if (vInfo?.thumbnailUrl) thumbnail_url = vInfo.thumbnailUrl;
    }

    const attachmentUrl = node.attachment_url || lv?.attachment_url || ld?.attachment_url || lp?.attachment_url || lc?.attachment_url;

    // nodeType 보정
    if (nodeType === 'default') {
        if (category === 'canvas') nodeType = 'canvas';
        else if (category === 'folder') nodeType = 'folder';
        else if (category === 'playlist') nodeType = 'playlist';
        else if (category === 'video') nodeType = 'video';
    }

    // V7: node_behavior 결정
    let node_behavior: NodeBehavior = node.node_behavior || 'LEAF';
    if (!node.node_behavior) {
        if (nodeType === 'canvas') node_behavior = 'PORTAL';
        else if (nodeType === 'folder' || nodeType === 'playlist') node_behavior = 'GROUP';
    }

    // 하위 호환성용 containerMode
    let containerMode: 'portal' | 'group' | 'none' = 'none';
    if (node_behavior === 'PORTAL') containerMode = 'portal';
    else if (node_behavior === 'GROUP') containerMode = 'group';

    const isContainer = containerMode !== 'none';

    return {
        id: String(node.id),
        type: 'historyNode',
        parentNode: node.parent_node_id ? String(node.parent_node_id) : undefined,
        style: {
            width: node.width || (isContainer ? 640 : 320),
            height: node.height || (isContainer ? 480 : 160),
            // Fix: Children (with parent_node_id) get z-index 1 to appear above folder parents (z-index -1)
            zIndex: (node.z_index && node.z_index !== 0) ? node.z_index :
                (node.parent_node_id ? 1 : (isContainer ? -1 : 0))
        },
        width: node.width || (isContainer ? 640 : 320),
        height: node.height || (isContainer ? 480 : 160),
        position: {
            x: node.position_x || 0,
            y: node.position_y || 0
        },
        selectable: true,
        data: {
            ...node, // 기존 필드 유지
            id: node.id,
            title,
            date: node.date,
            year,
            description: desc,
            content: content,
            youtube_url: finalYoutubeUrl,
            attachment_url: attachmentUrl,
            category,
            thumbnail_url,
            image_url,
            nodeType,
            node_behavior,
            containerMode,
            isCanvas: nodeType === 'canvas',
            isEditMode,
            ...handlers
        },
    };
};
