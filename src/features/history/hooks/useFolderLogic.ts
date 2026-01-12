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
        const PADDING_TOP = 80; // 제목 가림 방지
        const GAP = 50;

        // 🔥 Intent-Based Columns Inference:
        let firstRowItemCount = 0;
        if (children.length > 0) {
            const firstY = children[0].position.y;
            for (const child of children) {
                if (Math.abs(child.position.y - firstY) < 60) {
                    firstRowItemCount++;
                } else {
                    break;
                }
            }
        }
        const COLS = Math.max(firstRowItemCount, 1);

        // console.log(`🔍 [FolderDebug] Inferred COLS: ${COLS} (from first row items)`);

        // 🔥 [Improvement] Column-Specific Widths:
        const columnWidths = new Array(COLS).fill(0);
        const rowHeights = new Array(Math.ceil(children.length / COLS)).fill(0);

        children.forEach((child, idx) => {
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const w = child.width || Number(child.style?.width) || 320;
            const h = child.height || Number(child.style?.height) || 160;
            if (w > columnWidths[col]) columnWidths[col] = w;
            if (h > rowHeights[row]) rowHeights[row] = h;
        });

        // 3. Re-assign positions based on sorted index (Snap to Grid)
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
                if (child.data.linked_category_id) {
                    await supabase.from('learning_categories').update({ order_index: idx }).eq('id', child.data.linked_category_id);
                }
            } catch (err) { /* ignore */ }

            // [Optimization] Threshold check to prevent infinite loops (floating point diffs)
            if (Math.abs(child.position.x - newX) < 1 && Math.abs(child.position.y - newY) < 1) return null;

            // Update ref immediately for smoothness
            child.position = { x: newX, y: newY };
            const refNode = allNodesRef.current.get(child.id);
            if (refNode) refNode.position = { x: newX, y: newY };

            // Do not invoke setNodes here to avoid render loops, syncVisualization handles it eventually
            return supabase.from('history_nodes').update({ position_x: newX, position_y: newY }).eq('id', Number(child.id));
        });

        await Promise.all(updates);
    }, [allNodesRef]);

    /**
     * [Folder Resizing Improvements - 2026.01.13]
     */
    const updateParentSize = useCallback(async (parentId: string) => {
        // console.log(`🔍 [FolderDebug] updateParentSize called for parentId: ${parentId}`);
        const children = Array.from(allNodesRef.current.values()).filter(n => String(n.data.parent_node_id) === parentId);
        const parentNode = allNodesRef.current.get(parentId);
        if (!parentNode || children.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        children.forEach(child => {
            const w = child.width || Number(child.style?.width) || 320;
            const h = child.height || Number(child.style?.height) || 160;
            minX = Math.min(minX, child.position.x);
            minY = Math.min(minY, child.position.y);
            maxX = Math.max(maxX, child.position.x + w);
            maxY = Math.max(maxY, child.position.y + h);
        });

        const PADDING_RIGHT = 40;
        const PADDING_BOTTOM = 80;

        const newWidth = Math.max(maxX + PADDING_RIGHT, 421);
        const newHeight = Math.max(maxY + PADDING_BOTTOM, 250);

        // console.log(`🔍 [FolderDebug] Calculated Size: ${newWidth}x${newHeight} (MaxX: ${maxX}, MaxY: ${maxY})`);

        await supabase.from('history_nodes').update({ width: newWidth, height: newHeight }).eq('id', Number(parentId));

        // Ref Update
        parentNode.width = newWidth;
        parentNode.height = newHeight;
        parentNode.style = { ...parentNode.style, width: newWidth, height: newHeight };
    }, [allNodesRef]);

    return {
        rearrangeFolderChildren,
        updateParentSize
    };
};
