import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { supabase } from '../../../lib/supabase';
import type { HistoryRFNode } from '../types';

interface UseFolderLogicProps {
    allNodesRef: MutableRefObject<Map<string, HistoryRFNode>>;
}

export const useFolderLogic = ({ allNodesRef }: UseFolderLogicProps) => {

    /**
     * [Folder Layout Engine Improvements - 2026.01.13]
     */
    const rearrangeFolderChildren = useCallback(async (parentId: string) => {
        // console.log(`🔍 [FolderDebug] rearrangeFolderChildren called for parentId: ${parentId}`);
        const children = Array.from(allNodesRef.current.values())
            .filter(n => String(n.data.parent_node_id) === parentId)
            // 1. 현재 시각적 위치 기준으로 정렬 (Visual Order)
            .sort((a, b) => {
                // Y축 허용 오차 (같은 줄 판정)
                const dy = a.position.y - b.position.y;
                if (Math.abs(dy) > 60) return dy;
                return a.position.x - b.position.x;
            });

        // console.log(`🔍 [FolderDebug] Found ${children.length} children in folder ${parentId}`);
        if (children.length === 0) return;

        // 2. Dynamic Grid Constants
        const PADDING_LEFT = 40;
        const PADDING_TOP = 120; // Reduced to allow shrinking
        const GAP = 50;

        // 🔥 Intent-Based Columns Inference:
        let firstRowItemCount = 0;
        if (children.length > 0) {
            const firstY = children[0].position.y;
            for (const child of children) {
                if (Math.abs(child.position.y - firstY) < 60) {
                    firstRowItemCount++;
                }
            }
        }
        const COLS = Math.max(2, Math.min(firstRowItemCount || 2, 4));
        // 3. Dynamic Column Widths (Fix Overlap)
        // Find maximum width among all children to determine column sizing
        let maxChildWidth = 320;
        children.forEach(child => {
            const w = child.width || Number(child.style?.width) || 320;
            maxChildWidth = Math.max(maxChildWidth, w);
        });

        // 🔥 Force wider columns for safe spacing
        const COLUMN_WIDTH = maxChildWidth;
        const columnWidths = new Array(COLS).fill(COLUMN_WIDTH);
        const rowHeights: number[] = [];

        // Pre-calculate row heights
        children.forEach((child, idx) => {
            const row = Math.floor(idx / COLS);
            const h = child.height || Number(child.style?.height) || 160;
            rowHeights[row] = Math.max(rowHeights[row] || 0, h);
        });

        // 3. Calculate New Positions (Simulation)
        const updates = children.map(async (child, idx) => {
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);

            // 해당 열까지의 너비 합계를 계산하여 X 위치 결정
            let currentX = PADDING_LEFT;
            for (let i = 0; i < col; i++) {
                currentX += columnWidths[i] + GAP;
            }

            // 해당 행까지의 높이 합계를 계산하여 Y 위치 결정
            let currentY = PADDING_TOP;
            for (let i = 0; i < row; i++) {
                currentY += rowHeights[i] + GAP;
            }

            const newX = currentX;
            const newY = currentY;

            // console.log(`🔍 [FolderDebug] Child ${child.data.title} (${child.id}) -> Row: ${row}, Col: ${col} -> (${newX}, ${newY})`);

            // [Proxy Sync] 정렬 순서 업데이트
            try {
                if (child.data.linked_video_id || child.data.linked_document_id || child.data.linked_playlist_id) {
                    const resourceId = child.data.linked_video_id || child.data.linked_document_id || child.data.linked_playlist_id;
                    await supabase.from('learning_resources').update({ order_index: idx }).eq('id', resourceId);
                }
            } catch (e) {
                console.error('Failed to update order_index', e);
            }

            // Update ReactFlow + DB
            child.position = { x: newX, y: newY };
            const { error } = await supabase.from('history_nodes')
                .update({ position_x: newX, position_y: newY })
                .eq('id', Number(child.id));

            if (error) console.error('Failed to update position', error);
        });

        await Promise.all(updates);

        // 4. Calculate Final Container Size
        // Re-measure after simulated move
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        children.forEach(child => {
            const w = child.width || Number(child.style?.width) || 320;
            const h = child.height || Number(child.style?.height) || 160;
            minX = Math.min(minX, child.position.x);
            minY = Math.min(minY, child.position.y);
            maxX = Math.max(maxX, child.position.x + w);
            maxY = Math.max(maxY, child.position.y + h);
        });

        // Account for header (title + badges) and footer (buttons) space
        const FOOTER_HEIGHT = (children.length === 0) ? 0 : 100; // Nuclear: Footer space is 0 for empty
        const PADDING_RIGHT = 40;
        const PADDING_BOTTOM = (children.length === 0) ? 0 : 20;

        const newWidth = Math.max(maxX + PADDING_RIGHT, 421);
        const newHeight = Math.max(maxY + FOOTER_HEIGHT + PADDING_BOTTOM, 60);

        console.log(`🔍 [FolderDebug] Calculated Size: ${newWidth}x${newHeight} (MaxX: ${maxX}, MaxY: ${maxY})`);
    }, [allNodesRef]);

    /**
     * [Folder Resizing Improvements - 2026.01.13]
     */
    const updateParentSize = useCallback(async (parentId: string) => {
        console.log(`🔍 [FolderDebug] updateParentSize called for parentId: ${parentId}`);
        const children = Array.from(allNodesRef.current.values()).filter(n => String(n.data.parent_node_id) === parentId);
        const parentNode = allNodesRef.current.get(parentId);
        console.log(`🔍 [FolderDebug] Found ${children.length} children, parentNode exists: ${!!parentNode}`);
        if (!parentNode) return;

        // 🔥 Dynamic State: Update Parent "hasChildren" status
        const hasChildren = children.length > 0;
        if (parentNode.data.hasChildren !== hasChildren) {
            parentNode.data = { ...parentNode.data, hasChildren };
        }

        // Force Folder Z-Index and Style even if empty (Folders: 0, Nodes: 1+)
        parentNode.zIndex = 0;
        parentNode.style = { ...parentNode.style, zIndex: 0 };

        if (!hasChildren) {
            // 🔥 Just sync basic state for empty folder
            // Do not force width/height here anymore, allow user manual resize to persist.
            parentNode.zIndex = 0;
            parentNode.style = { ...parentNode.style, zIndex: 0 };
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        children.forEach(child => {
            const w = child.width || Number(child.style?.width) || 320;
            const h = child.height || Number(child.style?.height) || 160;
            minX = Math.min(minX, child.position.x);
            minY = Math.min(minY, child.position.y);
            maxX = Math.max(maxX, child.position.x + w);
            maxY = Math.max(maxY, child.position.y + h);
        });

        // Account for header (title + badges) and footer (buttons) space
        const FOOTER_HEIGHT = hasChildren ? 100 : 0; // Nuclear: Footer space is 0 for empty
        const PADDING_RIGHT = 40;
        const PADDING_BOTTOM = hasChildren ? 20 : 0;

        const newWidth = Math.max(maxX + PADDING_RIGHT, 421);
        const newHeight = Math.max(maxY + FOOTER_HEIGHT + PADDING_BOTTOM, 60);

        console.log(`🔍 [FolderDebug] Calculated Size: ${newWidth}x${newHeight} (MaxX: ${maxX}, MaxY: ${maxY})`);

        // 🔥 Update DB with new Size AND Z-Index (Enforce low z-index for folders)
        await supabase.from('history_nodes').update({
            width: newWidth,
            height: newHeight,
            // position_z: -10 // Optional: if DB supports it, otherwise rely on local sorting
        }).eq('id', Number(parentId));

        // Ref Update
        parentNode.width = newWidth;
        parentNode.height = newHeight;
        parentNode.zIndex = 0; // 🔥 Folders: 0
        parentNode.style = { ...parentNode.style, width: newWidth, height: newHeight, zIndex: 0 };
    }, [allNodesRef]);

    return {
        rearrangeFolderChildren,
        updateParentSize
    };
};
