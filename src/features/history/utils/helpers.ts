import type { Connection } from 'reactflow';
import type { HistoryRFNode, HistoryNodeData } from '../types';
import { CATEGORY_COLORS } from './constants';

/**
 * 노드 간 연결이 유효한지 검사 (자기 자신으로의 연결 방지 등)
 */
export const isValidConnection = (connection: Connection): boolean => {
    return connection.source !== connection.target;
};

/**
 * 노드의 카테고리에 따른 시각적 테마 색상 반환
 */
export const getNodeColor = (node: HistoryRFNode | { data: HistoryNodeData }): string => {
    const category = node.data?.category || 'default';
    return CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
};

/**
 * 특정 부모 노드 내부에 새로운 자식 노드가 생성될 때의 상대 좌표 계산
 */
export const calculateRelativePosition = (
    absolutePos: { x: number; y: number },
    parent?: HistoryRFNode
) => {
    if (!parent) return absolutePos;
    return {
        x: absolutePos.x - parent.position.x,
        y: absolutePos.y - parent.position.y
    };
};

/**
 * 노드의 경계 상자(Bounding Box) 계산
 */
export const getNodeBounds = (node: HistoryRFNode) => {
    const { x, y } = node.position;
    const width = node.width || 320;
    const height = node.height || 160;
    return {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width,
        height
    };
};

/**
 * 두 노드가 겹치는지 확인 (Collision Detection)
 */
export const isIntersecting = (rect1: any, rect2: any) => {
    return (
        rect1.left < rect2.right &&
        rect1.right > rect2.left &&
        rect1.top < rect2.bottom &&
        rect1.bottom > rect2.top
    );
};
