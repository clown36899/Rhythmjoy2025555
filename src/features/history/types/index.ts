import type { Node as RFNode } from 'reactflow';

/**
 * 히스토리 노드의 동작 방식 정의
 * LEAF: 일반 데이터 아이템
 * GROUP: 시각적 폴더 (데이터를 로컬에서 함께 로드)
 * PORTAL: 독립된 서브 캔버스 (진입 시 지연 로딩)
 */
export type NodeBehavior = 'LEAF' | 'GROUP' | 'PORTAL';

/**
 * 히스토리 노드 데이터 인터페이스
 */
export interface HistoryNodeData {
    id: number;
    title: string;
    date?: string;
    year?: number;
    description?: string;
    content?: string; // 상세 메모
    youtube_url?: string;
    attachment_url?: string;
    url?: string;

    // 리소스 연동 필드
    type?: 'VIDEO' | 'PLAYLIST' | 'DOCUMENT' | 'PERSON' | string;
    metadata?: any;

    user_id?: string;
    category?: string;
    z_index?: number;
    tags?: string[] | string;

    // 외래 키 관계
    linked_playlist_id?: string;
    linked_document_id?: string;
    linked_video_id?: string;
    linked_category_id?: string;
    parent_node_id?: string; // 계층 구조 핵심 필드

    // 시각적 데이터
    thumbnail_url?: string | null;
    image_url?: string | null;
    nodeType?: string;
    position_x?: number;
    position_y?: number;

    // V7 신규 필드 (독립성 및 확장성)
    node_behavior: NodeBehavior;
    space_id?: number | string;
    content_data?: any; // 외부 테이블 의존성 제거를 위한 데이터 백업

    // 핸들러 및 상태 (UI 전용)
    onEdit?: (data: HistoryNodeData) => void;
    onViewDetail?: (data: HistoryNodeData) => void;
    onPlayVideo?: (url: string, playlistId?: string | null, linkedVideoId?: string | null) => void;
    onPreviewLinkedResource?: (id: string, type: string, title: string) => void;
    onNavigate?: (id: string | null, title: string) => void;

    isSelectionMode?: boolean;
    isEditMode?: boolean;
    isSelected?: boolean;
    isShiftPressed?: boolean; // 쉬프트 키 눌림 상태 (누적 선택 지원)
    onSelectionChange?: (id: string, selected: boolean) => void;
    containerMode?: 'portal' | 'group' | 'none'; // 하위 호환성 유지
    onResizeStop?: (id: string | number, width: number, height: number) => void;
}

/**
 * 히스토리 작업 공간 정의
 */
export interface HistorySpace {
    id: number | string;
    owner_id: string;
    title: string;
    description?: string;
    is_default: boolean;
    created_at?: string;
}

/**
 * React Flow 노드 타입 별칭
 */
export type HistoryRFNode = RFNode<HistoryNodeData>;
