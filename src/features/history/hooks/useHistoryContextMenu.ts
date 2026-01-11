import { useState, useCallback } from 'react';
import type { HistoryRFNode } from '../types';

export const useHistoryContextMenu = (
    handleDeleteNodes: (ids: string[]) => Promise<void>,
    handleSaveNode: (data: any) => Promise<any>,
    nodes: any[],
    handleUpdateZIndex: (ids: string[], action: 'front' | 'back') => Promise<void>,
    handleMoveToParent: (ids: string[], targetParentId: string | null) => Promise<void>,
    breadcrumbs: { id: string | null; title: string }[]
) => {
    const [contextMenu, setContextMenu] = useState<{
        x: number;
        y: number;
        nodeId: string | null;
        selectedIds: string[];
        currentParentId: string | null;
    } | null>(null);

    const onNodeContextMenu = useCallback((event: any, node: HistoryRFNode) => {
        event.preventDefault();
        const selectedNodes = nodes.filter(n => n.selected);
        const selectedIds = selectedNodes.length > 0 ? selectedNodes.map(n => n.id) : [node.id];

        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: node.id,
            selectedIds,
            currentParentId: node.parentNode || null
        });
    }, [nodes]);

    const onPaneContextMenu = useCallback((event: any) => {
        event.preventDefault();
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            nodeId: null,
            selectedIds: [],
            currentParentId: null
        });
    }, []);

    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleDelete = useCallback(async () => {
        if (!contextMenu) return;
        if (window.confirm(`${contextMenu.selectedIds.length}개의 노드를 삭제하시겠습니까?`)) {
            await handleDeleteNodes(contextMenu.selectedIds);
            closeContextMenu();
        }
    }, [contextMenu, handleDeleteNodes, closeContextMenu]);

    const handleUpdateColor = useCallback(async (colorCategory: string) => {
        if (!contextMenu) return;
        const updates = contextMenu.selectedIds.map(id =>
            handleSaveNode({ id: Number(id), category: colorCategory })
        );
        await Promise.all(updates);
        closeContextMenu();
    }, [contextMenu, handleSaveNode, closeContextMenu]);

    /**
     * 상위 계층으로 이동 (Breadcrumb 기반)
     */
    const handleMoveUp = useCallback(async () => {
        if (!contextMenu) return;

        // 탐색 경로(Breadcrumb)가 2개 이상일 때만 상위 이동 가능 (Root > Folder > Current)
        if (breadcrumbs.length < 2) {
            alert('최상위 경로입니다.');
            return;
        }

        // 바로 윗 단계 경로 ID 찾기 (Breadcrumb의 뒤에서 두 번째 아이템)
        const parentBreadcrumb = breadcrumbs[breadcrumbs.length - 2];
        const targetParentId = parentBreadcrumb.id; // null이면 Root

        if (window.confirm(`선택한 노드를 상위 폴더('${parentBreadcrumb.title}')로 이동하시겠습니까?`)) {
            await handleMoveToParent(contextMenu.selectedIds, targetParentId);
            closeContextMenu();
        }
    }, [contextMenu, breadcrumbs, handleMoveToParent, closeContextMenu]);

    /**
     * 레이어 순서 변경
     */
    const handleZIndex = useCallback(async (action: 'front' | 'back') => {
        if (!contextMenu) return;
        await handleUpdateZIndex(contextMenu.selectedIds, action);
        closeContextMenu();
    }, [contextMenu, handleUpdateZIndex, closeContextMenu]);

    return {
        contextMenu,
        onNodeContextMenu,
        onPaneContextMenu,
        closeContextMenu,
        handleDelete,
        handleUpdateColor,
        handleMoveUp,
        handleZIndex
    };
};
