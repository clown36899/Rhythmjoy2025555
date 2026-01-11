import { useState, useCallback } from 'react';
import type { HistoryRFNode } from '../types';

export const useHistoryContextMenu = (
    handleDeleteNodes: (ids: string[]) => Promise<void>,
    handleSaveNode: (data: any) => Promise<any>,
    nodes: any[],
    handleUpdateZIndex: (ids: string[], action: 'front' | 'back') => Promise<void>,
    handleMoveToParent: (ids: string[], targetParentId: string | null) => Promise<void>
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
     * 상위 계층으로 이동 (지능형 엔진 핸들러 사용)
     */
    const handleMoveUp = useCallback(async () => {
        if (!contextMenu || !contextMenu.currentParentId) return;

        // 부모 노드를 찾아 그 부모(조부모) ID 획격 (엔진 Ref를 활용하는 handleMoveToParent에 위임)
        const parentNode = nodes.find(n => n.id === contextMenu.currentParentId);
        const grandParentId = parentNode?.parentNode || null;

        await handleMoveToParent(contextMenu.selectedIds, grandParentId);
        closeContextMenu();
    }, [contextMenu, nodes, handleMoveToParent, closeContextMenu]);

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
