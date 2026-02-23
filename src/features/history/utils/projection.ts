import type { HistoryRFNode, HistoryNodeData } from '../types';

/**
 * 특정 루트를 기준으로 노드들의 가시성을 판단하는 함수
 * @param node 대상 노드
 * @param currentRootId 현재 보고 있는 캔버스/공간의 루트 ID
 * @param allNodes 전체 노드 맵 (ID -> 노드)
 * @returns 가시성 여부
 */
export const isNodeVisible = (
    node: HistoryRFNode | { parentNode?: string | null; data: HistoryNodeData },
    currentRootId: string | null,
    allNodes: Map<string, HistoryRFNode>
): boolean => {
    const parentId = node.parentNode || null;

    // 1. 현재 뷰의 직계 자식이면 무조건 보임
    if (parentId === currentRootId) return true;

    // 2. 부모가 없는 루트 노드는 '홈(null)' 일 때만 보임
    if (parentId === null) return currentRootId === null;

    // 3. 중첩된 노드라면 부모의 가시성을 재귀적으로 확인
    const parent = allNodes.get(parentId);
    if (!parent) return false; // 부모 정보가 없으면 고아 노드로 판단하여 숨김

    // 4. 부모가 PORTAL(캔버스)인 경우:
    // 직계 자식이 아닌 이상(위 1번에서 이미 걸러짐) 캔버스 내부의 노드는 숨겨야 함
    if (parent.data.node_behavior === 'PORTAL' || parent.data.containerMode === 'portal') {
        return false;
    }

    // 5. 부모가 GROUP(폴더)인 경우:
    // 부모가 보이면 자식도 보임 (재귀적 확인)
    return isNodeVisible(parent, currentRootId, allNodes);
};

/**
 * DB 데이터(Authoritative)를 React Flow 시각적 노드로 변환하는 프로젝션 함수
 * @param allNodes 전체 가용 노드 리스트
 * @param currentRootId 현재 렌더링할 루트 ID
 * @returns 필터링 및 시각적 부모 관계가 정리된 노드 리스트
 */
export const projectNodesToView = (
    allNodes: HistoryRFNode[],
    currentRootId: string | null
): HistoryRFNode[] => {
    const nodeMap = new Map<string, HistoryRFNode>(allNodes.map(n => [n.id, n]));

    // 1. 가시성 기준에 따른 필터링
    const visibleNodes = allNodes.filter(node => isNodeVisible(node, currentRootId, nodeMap));
    const visibleIds = new Set(visibleNodes.map(n => n.id));

    // 2. 시각적 부모 관계 최적화 (React Flow 렌더링 오류 및 투명화 방지)
    return visibleNodes.map(node => {
        const realParentId = node.data.parent_node_id ? String(node.data.parent_node_id) : undefined;

        // 규칙:
        // 1. 부모가 현재 보고 있는 루트 자체라면 시각적으로 부모 관계 해제 (직계 자식으로 렌더링)
        // 2. 부모가 현재 화면(visibleNodes)에 존재하지 않는다면 시각적으로 해제 (투명화 방지)
        // 3. 그 외(폴더 내부 등)에는 원본 부모 관계 유지
        let visualParent: string | undefined = undefined;

        if (realParentId && realParentId !== currentRootId && visibleIds.has(realParentId)) {
            visualParent = realParentId;
        }

        return {
            ...node,
            parentNode: visualParent,
            // React Flow의 extent 설정은 부모가 있을 때만 유효함
            // extent: visualParent ? 'parent' : undefined // Removed restrict to allow drag-out from group
        };
    });
};
