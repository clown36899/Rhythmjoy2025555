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
     * 
     * 1. Intent-Based Layout (의도 기반 배치):
     *    - 기존: 고정된 컬럼 수(2열, 3열 등)로 인해 사용자가 원하는 배치(가로로 길게 or 세로로 길게)가 무시됨.
     *    - 변경: "첫 번째 줄(Row 0)에 있는 노드 수"를 세어서 COLS를 동적으로 결정합니다.
     *      => 사용자가 가로로 5개를 놓으면 5열, 세로로만 놓으면 1열이 됩니다.
     * 
     * 2. Dynamic Sizing (동적 크기):
     *    - 기존: 고정 너비(320px)/높이(160px)로 인해 내용이 많아지면 겹침 발생.
     *    - 변경: 자식 노드들 중 가장 큰 너비/높이를 찾아 그리드 셀 크기(ITEM_WIDTH, ITEM_HEIGHT)로 사용합니다.
     * 
     * 3. Sync Stabilization (동기화 안정화):
     *    - setNodes를 직접 호출하지 않고 DB 업데이트 -> syncVisualization 흐름을 따라 무한 루프를 방지합니다.
     */
    const rearrangeFolderChildren = useCallback(async (parentId: string) => {
        console.log(`🔍 [FolderDebug] rearrangeFolderChildren called for parentId: ${parentId}`);
        const children = Array.from(allNodesRef.current.values())
            .filter(n => String(n.data.parent_node_id) === parentId)
            // 1. 현재 시각적 위치 기준으로 정렬 (Visual Order)
            .sort((a, b) => {
                // Y축 허용 오차 (같은 줄 판정)
                const dy = a.position.y - b.position.y;
                if (Math.abs(dy) > 60) return dy;
                return a.position.x - b.position.x;
            });

        console.log(`🔍 [FolderDebug] Found ${children.length} children in folder ${parentId}`);
        if (children.length === 0) return;

        // 2. Dynamic Grid Constants
        const PADDING_X = 40;
        const PADDING_Y = 80; // 제목 가림 방지
        const GAP = 50; // 겹침 방지를 위해 간격 확대

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

        console.log(`🔍 [FolderDebug] Inferred COLS: ${COLS} (from first row items)`);

        // 🔥 Dynamic Item Width & Height: 가장 큰 노드 기준으로 그리드 칸 크기 설정
        let maxNodeWidth = 320;
        let maxNodeHeight = 160;
        children.forEach(child => {
            const w = child.width || Number(child.style?.width) || 320;
            const h = child.height || Number(child.style?.height) || 160;
            if (w > maxNodeWidth) maxNodeWidth = w;
            if (h > maxNodeHeight) maxNodeHeight = h;
        });
        const ITEM_WIDTH = maxNodeWidth;
        const ITEM_HEIGHT = maxNodeHeight;

        console.log(`🔍 [FolderDebug] Rearranging Layout. MaxWidth: ${ITEM_WIDTH}, MaxHeight: ${ITEM_HEIGHT}, Gap: ${GAP}`);

        // 3. Re-assign positions based on sorted index (Snap to Grid)
        const updates = children.map(async (child, idx) => {
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);

            // "가까운 데 붙을 것": 순서대로 빈 칸을 채움
            const newX = PADDING_X + col * (ITEM_WIDTH + GAP);
            const newY = PADDING_Y + row * (ITEM_HEIGHT + GAP);

            console.log(`🔍 [FolderDebug] Child ${child.data.title} (${child.id}) -> Row: ${row}, Col: ${col} -> (${newX}, ${newY})`);

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

            if (child.position.x === newX && child.position.y === newY) return null;

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
     * 
     * 1. Vertical Breathing Room (수직 여백 확대):
     *    - 문제: 하단 여백이 40px로 좁아, 세로로 노드를 배치할 때 부모 박스가 너무 꽉 끼어 보임.
     *    - 해결: Bottom Padding을 100px로 대폭 늘려(maxY + 100) 시각적 안정감을 확보했습니다.
     * 
     * 2. Dynamic Height Calculation:
     *    - 자식 노드들의 실제 위치(maxY)와 높이를 기반으로 계산하되, 최소 높이(250px)를 보장합니다.
     */
    const updateParentSize = useCallback(async (parentId: string) => {
        console.log(`🔍 [FolderDebug] updateParentSize called for parentId: ${parentId}`);
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

        const newWidth = Math.max(maxX + 40, 421);
        const newHeight = Math.max(maxY + 100, 250); // 하단 여백 확대 (40 -> 100)

        console.log(`🔍 [FolderDebug] Calculated Size: ${newWidth}x${newHeight} (MaxX: ${maxX}, MaxY: ${maxY})`);

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
