import type { HistoryRFNode, HistoryNodeData, NodeBehavior } from '../types';
import { parseVideoUrl } from '../../../utils/videoEmbed';

const getResourceMetadata = (resource: any): Record<string, any> => {
    const value = resource?.metadata || {};
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return {}; }
    }
    return value && typeof value === 'object' ? value : {};
};

const getYoutubeUrlFromResource = (resource: any): string | null => {
    if (!resource) return null;

    if (resource.url) return resource.url;
    if (resource.youtube_url) return resource.youtube_url;

    const meta = getResourceMetadata(resource);
    if (meta.youtube_url) return meta.youtube_url;
    if (meta.youtube_video_id) return `https://www.youtube.com/watch?v=${meta.youtube_video_id}`;
    if (meta.youtube_playlist_id) return `https://www.youtube.com/playlist?list=${meta.youtube_playlist_id}`;

    return null;
};

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
    const lpMeta = getResourceMetadata(lp);
    const lcMeta = getResourceMetadata(lc);
    const lvMeta = getResourceMetadata(lv);
    const contentData = (() => {
        const value = node.content_data || {};
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch { return {}; }
        }
        return value && typeof value === 'object' ? value : {};
    })();
    const nodeMeta = (() => {
        const value = node.metadata || contentData.metadata || {};
        if (typeof value === 'string') {
            try { return JSON.parse(value); } catch { return {}; }
        }
        return value && typeof value === 'object' ? value : {};
    })();

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
        thumbnail_url = lp.image_url || lpMeta.thumbnail_url;
        image_url = lp.image_url;
        nodeType = 'playlist';
        category = 'playlist';
    } else if (lc) {
        // [Fix] learning_categories table uses 'name', not 'title'
        title = lc.name || lc.title || title;
        // [Fix] learning_categories description usually in metadata
        desc = lc.description || lcMeta.description || desc;
        content = lc.content || content;
        year = lc.year || (lcMeta.year ? parseInt(lcMeta.year) : year);
        date = lc.date || date;
        thumbnail_url = lc.image_url;
        image_url = lc.image_url;

        let isLinkedCanvas = false;
        if (lc?.type === 'canvas') {
            isLinkedCanvas = true;
        } else if (lc?.type === 'general') {
            const meta = lcMeta;
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
        const meta = getResourceMetadata(ld);


        // Multi-image support with backward compatibility
        if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
            // Use first image as primary
            image_url = meta.images[0].medium || meta.images[0].full || meta.images[0].thumbnail || ld.image_url;
            thumbnail_url = meta.images[0].thumbnail || meta.images[0].micro || meta.images[0].medium || ld.image_url;
        } else {
            // Fallback to single image structure
            image_url = meta.image_medium || meta.image_full || meta.image_thumbnail || ld.image_url;
            thumbnail_url = meta.image_thumbnail || meta.image_micro || meta.image_medium || ld.image_url;
        }
        const documentType = String(ld.type || '').toLowerCase();
        if (documentType === 'person') {
            nodeType = 'person';
            category = 'person';
        } else if (documentType === 'general' || documentType === 'folder' || documentType === 'category') {
            nodeType = 'folder';
            category = 'folder';
        } else {
            nodeType = 'document';
            category = 'document';
        }
    } else if (lv) {
        title = lv.title || lv.name || title;
        desc = lv.description || desc;
        content = lv.content || content;
        year = lv.year || year;
        image_url = lv.image_url;
        thumbnail_url = lv.image_url || (lvMeta.youtube_video_id ? `https://img.youtube.com/vi/${lvMeta.youtube_video_id}/mqdefault.jpg` : null);
        nodeType = 'video';
        category = 'video';
    }

    if (!image_url && contentData.image_url) {
        image_url = contentData.image_url;
    }
    if (!thumbnail_url && nodeMeta.images && Array.isArray(nodeMeta.images) && nodeMeta.images.length > 0) {
        thumbnail_url = nodeMeta.images[0].thumbnail || nodeMeta.images[0].micro || nodeMeta.images[0].medium || nodeMeta.images[0].full;
        image_url = image_url || nodeMeta.images[0].medium || nodeMeta.images[0].full || nodeMeta.images[0].thumbnail;
    }
    if (!thumbnail_url) {
        thumbnail_url = nodeMeta.image_thumbnail || nodeMeta.image_micro || nodeMeta.image_medium || image_url;
    }

    // 썸네일 최종 폴백
    const finalYoutubeUrl = node.youtube_url || getYoutubeUrlFromResource(lv) || getYoutubeUrlFromResource(lp);
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
        else if (category === 'arrow') nodeType = 'arrow';
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

    const isContainer = containerMode !== 'none' ||
        nodeType === 'folder' ||
        category === 'folder' ||
        (node_behavior as string) === 'FOLDER' ||
        nodeType === 'canvas' ||
        category === 'canvas';

    // React Flow Position
    // 🔥 Fix: Enforce Folder Header Safe Zone (160px) at the View Layer
    // This ensures existing data at y=0 doesn't overlap the header (140px).
    let positionY = node.position_y || 0;
    if (node.parent_node_id) {
        // Force minimum 160px Y-offset for children to clear the absolute header
        positionY = Math.max(positionY, 160);
    }

    return {
        id: String(node.id),
        type: 'historyNode',
        parentNode: node.parent_node_id ? String(node.parent_node_id) : undefined,
        style: {
            width: node.width || (isContainer ? 421 : 320),
            height: node.height || 160,
            zIndex: isContainer ? 0 : Math.max(1, node.z_index || 1)
        },
        width: node.width || (isContainer ? 421 : 320),
        height: node.height || 160,
        zIndex: isContainer ? 0 : Math.max(1, node.z_index || 1),
        position: {
            x: node.position_x || 0,
            y: positionY
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
            // 화살표 전용 필드
            arrow_rotation: node.arrow_rotation || 0,
            arrow_length: node.arrow_length || 200,
            arrow_text: node.arrow_text || '',
            ...handlers
        },
    };
};
