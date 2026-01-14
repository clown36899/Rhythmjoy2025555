/**
 * 히스토리 타임라인에서 사용하는 상수 정의
 */

// 카테고리별 테마 색상 (프리미엄 디자인 가이드 적용)
export const CATEGORY_COLORS: Record<string, string> = {
    genre: '#6366f1',  // Indigo
    person: '#ec4899', // Pink
    event: '#10b981',  // Emerald
    music: '#f59e0b',  // Amber
    place: '#3b82f6',  // Blue
    canvas: '#8b5cf6', // Violet
    folder: '#64748b', // Slate
    playlist: '#f43f5e', // Rose
    default: '#8b5cf6'
};

// 노드 타입별 기본 크기 설정
export const NODE_BASE_DIMENSIONS = {
    LEAF: { width: 320, height: 160 },
    GROUP: { width: 640, height: 480 },
    PORTAL: { width: 640, height: 480 }
};

// 캔버스 인터랙션 설정
export const CANVAS_CONFIG = {
    minZoom: 0.02,
    maxZoom: 4,
    defaultEdgeType: 'default',
    snapGrid: [20, 20] as [number, number]
};
