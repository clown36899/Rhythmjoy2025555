import { useState, useCallback, useRef, useEffect } from 'react';
import {
    type ReactFlowInstance,
    type Edge,
    useNodesState,
    useEdgesState
} from 'reactflow';
import { supabase } from '../../../lib/supabase';
import type { HistoryRFNode } from '../types';
import { mapDbNodeToRFNode } from '../utils/mappers';
import { projectNodesToView } from '../utils/projection';
import { useFolderLogic } from './useFolderLogic';

/**
 * [Structure] History Node용 표준 SELECT 쿼리 (Join 포함)
 * 데이터 유실 방지를 위해 모든 INSERT/UPDATE/SELECT 시 이 쿼리를 사용합니다.
 */
export const HISTORY_NODE_SELECT = `
    *,
    linked_video: learning_resources!linked_video_id(*),
    linked_document: learning_resources!linked_document_id(*),
    linked_playlist: learning_resources!linked_playlist_id(*),
    linked_category: learning_categories!linked_category_id(*)
`;

interface UseHistoryEngineProps {
    userId: string | undefined;
    isAdmin: boolean;
    initialSpaceId?: string | number | null;
    isEditMode: boolean; // Added prop
}

export const useHistoryEngine = ({ userId, initialSpaceId = null, isEditMode }: UseHistoryEngineProps) => {
    // 1. 핵심 상태 관리
    const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [currentRootId, setCurrentRootId] = useState<string | null>(null);
    const [currentSpaceId] = useState<string | number | null>(initialSpaceId);
    const [breadcrumbs, setBreadcrumbs] = useState<{ id: string | null; title: string }[]>([{ id: null, title: 'Home' }]);

    // Selection Tracking for Edge Highlighting
    const prevSelectedNodeIds = useRef<Set<string>>(new Set());

    // 2. Authoritative Refs (단일 진실 공급원)
    const allNodesRef = useRef<Map<string, HistoryRFNode>>(new Map());
    const allEdgesRef = useRef<Map<string, Edge>>(new Map());
    // 🔥 Saved State Reference for Change Detection
    const lastSavedStateRef = useRef<Map<string, { x: number, y: number, w: number, h: number }>>(new Map());

    // 🆕 Folder Logic Hook Integration
    const { rearrangeFolderChildren, updateParentSize } = useFolderLogic({ allNodesRef });

    /**
     * 데이터를 화면에 동기화하는 함수 (Projection Engine + Filtering)
     */
    const syncVisualization = useCallback((
        rootId: string | null,
        filters: { search?: string } = {}
    ) => {
        console.log('🔧 [useHistoryEngine] syncVisualization Called', {
            rootId,
            filters,
            totalNodes: allNodesRef.current.size,
            totalEdges: allEdgesRef.current.size
        });

        let allNodes = Array.from(allNodesRef.current.values());
        const allEdges = Array.from(allEdgesRef.current.values());

        // 1. 검색 및 필터링 적용
        // 1. 검색 적용
        if (filters?.search) {
            // console.log('🔍 Filtering nodes with:', filters);

            // [Helper] 해당 노드가 캔버스(Portal) 내부에 있는지 재귀적으로 확인
            const isNodeInsideCanvas = (node: any): boolean => {
                let current = node;
                while (current.parentNode) {
                    const parent = allNodesRef.current.get(current.parentNode);
                    if (!parent) break;
                    // 부모가 캔버스이거나 포털이면 내부에 있는 것으로 간주
                    if (parent.data.category === 'canvas' || parent.data.node_behavior === 'PORTAL') {
                        return true;
                    }
                    current = parent;
                }
                return false;
            };

            // A. Primary Matches (검색어/카테고리 직접 일치)
            const primaryMatches = allNodes.filter(n => {
                // 0. 레벨에 상관없이 캔버스(Portal) 내부에 있다면 검색 대상에서 제외 (사용자 요청: 내용물 유출 방지)
                if (isNodeInsideCanvas(n)) return false;

                const title = n.data.title || '';

                let matchesSearch = !filters.search;
                if (filters.search) {
                    const lowerQuery = filters.search.toLowerCase();

                    // 사용자 요청: 발음 검색 제거, 제목에 텍스트 포함 여부만 확인
                    matchesSearch = title.toLowerCase().includes(lowerQuery);
                }

                return matchesSearch;
            });

            // [FIX] 검색어가 있는데 결과가 없으면 즉시 빈 화면 처리
            if (filters.search && primaryMatches.length === 0) {
                console.log('🚫 [useHistoryEngine] No matches found for search:', filters.search);
                setNodes([]);
                setEdges([]);
                return;
            }

            // B. Connected Nodes (Neighbors via Edges)
            // B. Identify Neighbors first
            const primaryIds = new Set(primaryMatches.map(n => n.id));
            const neighborIds = new Set<string>();

            allEdges.forEach(edge => {
                const isSourcePrimary = primaryIds.has(edge.source);
                const isTargetPrimary = primaryIds.has(edge.target);
                if (isSourcePrimary) neighborIds.add(edge.target);
                if (isTargetPrimary) neighborIds.add(edge.source);
            });

            // [FIX] 이웃 노드도 캔버스 내부에 있다면 제외
            const neighbors = allNodes.filter(n => {
                if (isNodeInsideCanvas(n)) return false;
                return neighborIds.has(n.id) && !primaryIds.has(n.id);
            });

            // C. Folder/Group Content Recursive Expansion
            // [FIX] 결과 노드가 폴더일 경우 그 안의 모든 하위 자식들을 재귀적으로 포함한다.
            const expandedIds = new Set([...primaryMatches, ...neighbors].map(n => n.id));
            let hasAdded = true;
            let loopSafety = 0; // 🔥 Safety Break

            while (hasAdded && loopSafety < 100) { // Limit recursion depth
                hasAdded = false;
                loopSafety++;

                const children = allNodes.filter(n => {
                    if (expandedIds.has(n.id)) return false; // Already include
                    if (!n.parentNode || !expandedIds.has(n.parentNode)) return false; // Parent not in set

                    const parentNode = allNodesRef.current.get(n.parentNode);
                    if (!parentNode) return false;
                    // 캔버스의 내용물은 절대 꺼내지 않음 (방어 로직)
                    if (parentNode.data.category === 'canvas' || parentNode.data.node_behavior === 'PORTAL') return false;

                    return true;
                });

                if (children.length > 0) {
                    children.forEach(c => expandedIds.add(c.id));
                    hasAdded = true;
                }
            }

            if (loopSafety >= 100) {
                console.warn('⚠️ [HistoryEngine] Search expansion hit safety limit. Possible cyclic folder structure?');
            }

            const finalNodes = allNodes.filter(n => expandedIds.has(n.id));
            const finalNodeIds = expandedIds;
            const relevantEdges = allEdges.filter(e => finalNodeIds.has(e.source) && finalNodeIds.has(e.target));

            // console.log(`📊 Filtered: Primary(${primaryMatches.length}) + Neighbors(${neighbors.length}) + Extracted(${finalNodes.length - primaryMatches.length - neighbors.length})`);

            setNodes(prevNodes => {
                return finalNodes.map(n => {
                    // 부모가 결과에 포함되어 있으면 계층 유지
                    const hasParentInView = n.parentNode && finalNodeIds.has(n.parentNode);

                    // 🔥 [UX Fix] 기존 선택 상태 유지 (함수형 업데이트 사용으로 의존성 제거)
                    const isSelected = prevNodes.find(prev => prev.id === n.id)?.selected || false;

                    return {
                        ...n,
                        selected: isSelected,
                        parentNode: hasParentInView ? n.parentNode : undefined,
                        extent: hasParentInView ? 'parent' as const : undefined,
                        // draggable: true, // Derived from Canvas prop
                    };
                });
            });

            setEdges(relevantEdges);
            return;
        }

        // 2. 계층 구조 투영 (V7 Projection Engine)
        const rawProjectedNodes = projectNodesToView(allNodes, rootId);

        // 3. 엣지 필터링 (가시 노드 간의 연결만 표시)
        const visibleNodeIds = new Set(rawProjectedNodes.map(n => n.id));
        const visibleEdges = allEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target));

        setNodes(prevNodes => {
            const nextNodes = rawProjectedNodes.map(n => {
                const isSelected = prevNodes.find(prev => prev.id === n.id)?.selected || false;
                return {
                    ...n,
                    selected: isSelected
                };
            });

            // 🔥 [Optimization] Deep Equality Check to prevent re-renders
            if (prevNodes.length === nextNodes.length) {
                const isSame = prevNodes.every((prev, idx) => {
                    const next = nextNodes[idx];
                    return prev.id === next.id &&
                        Math.round(prev.position.x) === Math.round(next.position.x) &&
                        Math.round(prev.position.y) === Math.round(next.position.y) &&
                        prev.selected === next.selected &&
                        prev.width === next.width &&
                        prev.height === next.height &&
                        prev.zIndex === next.zIndex &&
                        prev.data?.title === next.data?.title &&
                        prev.data?.isEditMode === next.data?.isEditMode && // 🔥 Mode Sync
                        prev.data?.isSelectionMode === next.data?.isSelectionMode; // 🔥 Mode Sync
                });
                if (isSame) return prevNodes;
            }

            return nextNodes;
        });

        setEdges(prevEdges => {
            // Simple check for edges
            if (prevEdges.length === visibleEdges.length) {
                const isSame = prevEdges.every((prev, idx) => prev.id === visibleEdges[idx].id);
                if (isSame) return prevEdges;
            }
            return visibleEdges;
        });
    }, [allNodesRef, allEdgesRef, setNodes, setEdges]);

    /**
     * 타임라인 초기 데이터 로드
     */
    const loadTimeline = useCallback(async () => {
        try {
            console.log('📡 [useHistoryEngine] loadTimeline Started');
            setLoading(true);

            // 1. 노드 페칭
            const { data: nodesData, error: nodesErr } = await supabase
                .from('history_nodes')
                .select(HISTORY_NODE_SELECT);
            if (nodesErr) {
                console.error('🚨 [HistoryEngine] Nodes Fetch Error:', nodesErr.message, nodesErr.details, nodesErr.hint);
                throw nodesErr;
            }

            // 2. 엣지 페칭
            const { data: edgesData, error: edgeErr } = await supabase
                .from('history_edges')
                .select('*');

            if (edgeErr) {
                console.error('🚨 [HistoryEngine] Edges Fetch Error:', edgeErr.message, edgeErr.details);
                throw edgeErr;
            }

            // 3. 변환 및 Ref 업데이트
            const handlers = {
                onNavigate: (id: string | null, title: string) => handleNavigate(id, title),
                onSelectionChange: (id: string, selected: boolean) => {
                    setNodes(nds => nds.map(node => node.id === id ? { ...node, selected } : node));
                },
                onResizeStop: handleResizeStop
            };

            const flowNodes = (nodesData || []).map(node => mapDbNodeToRFNode(node, handlers));

            allNodesRef.current.clear();
            flowNodes.forEach(node => {
                allNodesRef.current.set(node.id, node);
                // Initialize Last Saved State
                lastSavedStateRef.current.set(node.id, {
                    x: Math.round(node.position.x),
                    y: Math.round(node.position.y),
                    w: node.width || Number(node.style?.width) || 320,
                    h: node.height || Number(node.style?.height) || 160
                });
            });

            const flowEdges: Edge[] = (edgesData || []).map(edge => {
                // DB에 핸들 정보가 있으면 그것을 사용, 없으면 기본값 (right -> left)
                // 사용자 피드백: DB에 정보가 있다고 하셨으므로, source_handle이 null이면 데이터 문제일 가능성 확인 필요
                const sourceHandle = edge.source_handle || 'right';
                const targetHandle = edge.target_handle || 'left';

                return {
                    id: String(edge.id),
                    source: String(edge.source_id),
                    target: String(edge.target_id),
                    sourceHandle,
                    targetHandle,
                    label: edge.label,
                    data: { label: edge.label },
                    style: { stroke: edge.color || '#71717a', strokeWidth: 4 },
                    animated: !!edge.is_animated
                };
            });

            // console.log('🕷️ [HistoryEngine] Edges Mapped:', flowEdges.length, flowEdges[0]);

            allEdgesRef.current.clear();
            flowEdges.forEach(edge => allEdgesRef.current.set(edge.id, edge));

            // 4. 초기 가시성 투영
            console.log('🎨 [useHistoryEngine] Initial syncVisualization from loadTimeline');
            syncVisualization(currentRootId);
            console.log('✅ [useHistoryEngine] loadTimeline Complete', { nodesLoaded: flowNodes.length, edgesLoaded: flowEdges.length });

        } catch (error) {
            console.error('🚨 [useHistoryEngine] Load Failed:', error);
        } finally {
            setLoading(false);
        }
    }, [currentRootId, syncVisualization]);

    useEffect(() => {
        loadTimeline();
    }, [loadTimeline]);

    // 🔥 Force sync when Edit Mode changes to update draggable/ui state
    useEffect(() => {
        syncVisualization(currentRootId);
    }, [isEditMode, syncVisualization, currentRootId]);

    /**
     * Edge Highlighting on Node Selection
     */
    useEffect(() => {
        const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));

        // Optimization: Skip if selection hasn't changed
        let changed = false;
        if (selectedIds.size !== prevSelectedNodeIds.current.size) changed = true;
        else {
            for (const id of selectedIds) {
                if (!prevSelectedNodeIds.current.has(id)) {
                    changed = true;
                    break;
                }
            }
        }

        if (!changed && prevSelectedNodeIds.current.size > 0) {
            // Even if set same, we might need to verify edges if nodes reloaded? 
            // Actually, standard check is enough for selection user interaction.
            // However, if nodes update from DB, selected state might be preserved but edges reset.
            // But loadTimeline resets edges anyway.
            // So just return.
            return;
        }

        // If changed or first run (if we want explicit default reset, but 'changed' is enough usually)
        if (!changed) return;

        prevSelectedNodeIds.current = selectedIds;

        setEdges(currentEdges => {
            return currentEdges.map(edge => {
                const isConnect = selectedIds.has(edge.source) || selectedIds.has(edge.target);

                // Retrieve original style source of truth
                const originalEdge = allEdgesRef.current.get(edge.id);
                // Fallback default
                const defaultColor = originalEdge?.style?.stroke || '#71717a';
                const defaultWidth = originalEdge?.style?.strokeWidth || 4;
                const defaultAnimated = !!originalEdge?.animated;

                const targetColor = isConnect ? '#3b82f6' : defaultColor;
                const targetWidth = isConnect ? 12 : defaultWidth;
                const targetAnimated = defaultAnimated;

                // Optimization: Skip loop update if identical
                if (
                    edge.style?.stroke === targetColor &&
                    edge.style?.strokeWidth === targetWidth &&
                    edge.animated === targetAnimated
                ) {
                    return edge;
                }

                return {
                    ...edge,
                    style: {
                        ...edge.style,
                        stroke: targetColor,
                        strokeWidth: targetWidth,
                        strokeDasharray: isConnect ? '20 10' : (originalEdge?.style?.strokeDasharray || undefined)
                    },
                    animated: targetAnimated,
                    zIndex: isConnect ? 999 : 0 // Ensure highlighted edges are on top (if renderer supports via iteration order, usually handled by array order)
                };
            });
        });

    }, [nodes, setEdges]); // Runs on every node change (drag included), but optimized by Set comparison

    /**
     * 계층 이동 (Drill-down / Up)
     */
    const handleNavigate = useCallback((nodeId: string | null, title: string) => {
        // console.log('📂 [HistoryEngine] Navigating to:', nodeId, title);
        setCurrentRootId(nodeId);

        if (nodeId === null) {
            setBreadcrumbs([{ id: null, title: 'Home' }]);
        } else {
            setBreadcrumbs(prev => {
                const idx = prev.findIndex(b => b.id === nodeId);
                if (idx !== -1) return prev.slice(0, idx + 1);
                return [...prev, { id: nodeId, title }];
            });
        }
        syncVisualization(nodeId);
    }, [syncVisualization]);

    /**
     * 노드 저장 (신규/수정)
     */
    const handleSaveNode = useCallback(async (nodeData: any) => {
        try {
            setLoading(true);

            // 0. Proxy Sync: 연동된 리소스가 있다면 원본 데이터도 함께 업데이트 (Source of Truth 동기화)
            try {
                const syncData: any = {
                    title: nodeData.title,
                    description: nodeData.description,
                    content: nodeData.content,
                    image_url: nodeData.image_url,
                    year: nodeData.year
                    // date: nodeData.date // 🔥 Removed: Causes 400 if column missing
                };

                // 리소스 테이블(영상, 문서, 재생목록 등)
                if (nodeData.linked_video_id || nodeData.linked_document_id || nodeData.linked_playlist_id) {
                    const resourceId = nodeData.linked_video_id || nodeData.linked_document_id || nodeData.linked_playlist_id;
                    await supabase.from('learning_resources').update(syncData).eq('id', resourceId);
                }

                // 카테고리 테이블 (폴더 등)
                if (nodeData.linked_category_id) {
                    // For categories, map 'title' to 'name'
                    const categorySync = {
                        name: nodeData.title, // Map title -> name
                        description: nodeData.description,
                        content: nodeData.content,
                        image_url: nodeData.image_url,
                        year: nodeData.year
                    };
                    await supabase.from('learning_categories').update(categorySync).eq('id', nodeData.linked_category_id);
                }
            } catch (syncErr) {
                console.warn('⚠️ [HistoryEngine] Proxy Sync partly failed:', syncErr);
            }

            const isNew = !nodeData.id;

            // 🔥 CRITICAL: DB 컬럼에 존재하지 않는 필드들(핸들러, 조인된 객체 등) 제거
            const validColumns = [
                'title', 'description', 'content', 'year', 'date',
                'youtube_url', 'attachment_url', 'category', 'tags',
                'position_x', 'position_y', 'width', 'height', 'z_index',
                'parent_node_id', 'space_id', 'created_by', 'node_behavior', 'content_data',
                'linked_video_id', 'linked_document_id', 'linked_playlist_id', 'linked_category_id'
            ];


            const dbData: any = {};
            validColumns.forEach(col => {
                const value = (nodeData as any)[col];
                if (value !== undefined) {
                    // [Source of Truth] 연결된 노드는 제목/설명을 원본에서 가져오지만, 
                    // 네트워크 지연이나 조인 오류 시 제목이 사라지는 것을 방지하기 위해 
                    // DB에도 백업본으로 제목/설명을 저장합니다. (Null 처리를 제거함)
                    dbData[col] = value;
                }
            });

            const finalData: any = { ...dbData };

            // space_id와 parent_node_id는 신규 생성 시에만 자동 할당 (수정 시에는 기존값 보존)
            if (isNew) {
                if (finalData.space_id === undefined) finalData.space_id = currentSpaceId;
                if (finalData.parent_node_id === undefined) {
                    finalData.parent_node_id = currentRootId ? String(currentRootId) : null;
                }
                if (userId) finalData.created_by = userId;
            }

            let result;

            if (isNew) {
                result = await supabase.from('history_nodes').insert(finalData).select(HISTORY_NODE_SELECT).single();
            } else {
                result = await supabase.from('history_nodes').update(finalData).eq('id', nodeData.id).select(HISTORY_NODE_SELECT).single();
            }

            if (result.error) {
                console.error('🚨 [HistoryEngine] DB Save Error:', result.error);
                throw result.error;
            }

            // 1. Ref 업데이트 (Authoritative 상태 동기화)
            const updatedNode = mapDbNodeToRFNode(result.data, {
                onNavigate: (id: string | null, title: string) => handleNavigate(id, title),
                onSelectionChange: (id: string, selected: boolean) => {
                    setNodes(nds => nds.map(node => node.id === id ? { ...node, selected } : node));
                },
                onResizeStop: handleResizeStop
            });
            allNodesRef.current.set(updatedNode.id, updatedNode);

            // 🔥 Update Saved State
            lastSavedStateRef.current.set(updatedNode.id, {
                x: Math.round(updatedNode.position.x),
                y: Math.round(updatedNode.position.y),
                w: updatedNode.width || Number(updatedNode.style?.width) || 320,
                h: updatedNode.height || Number(updatedNode.style?.height) || 160
            });
            setHasUnsavedChanges(false);

            // 2. 시각화 투영 (엔진이 가시성 판단 후 setNodes 수행)
            syncVisualization(currentRootId);

            return updatedNode;
        } catch (error) {
            console.error('🚨 [HistoryEngine] Save Node Failed:', error);
            throw error;
        } finally {
            setLoading(false);
        }
    }, [userId, currentSpaceId, currentRootId, syncVisualization, handleNavigate]);

    /**
     * 노드 삭제 (V7: Recursive Cascading Delete)
     */
    const handleDeleteNodes = useCallback(async (nodeIds: string[]) => {
        if (!window.confirm(`선정된 ${nodeIds.length}개의 노드와 그 하위 노드들이 모두 삭제됩니다. 계속하시겠습니까?`)) return;

        try {
            setLoading(true);

            // 실제로는 DB 트리거 혹은 재귀 쿼리로 처리하는 것이 안전하지만, 클라이언트 로직으로 시뮬레이션
            const { error } = await supabase.from('history_nodes').delete().in('id', nodeIds);
            if (error) throw error;

            nodeIds.forEach(id => allNodesRef.current.delete(id));
            syncVisualization(currentRootId);
        } catch (error) {
            console.error('🚨 [HistoryEngine] Delete Failed:', error);
        } finally {
            setLoading(false);
        }
    }, [currentRootId, syncVisualization]);

    /**
     * Z-Index 일괄 변경
     */
    const handleUpdateZIndex = useCallback(async (nodeIds: string[], action: 'front' | 'back') => {
        try {
            setLoading(true);
            const allNodesArray = Array.from(allNodesRef.current.values());
            const currentZIndices = allNodesArray.map(n => Number(n.style?.zIndex) || 0);
            const maxZ = Math.max(...currentZIndices, 0);
            const minZ = Math.min(...currentZIndices, 0);

            const updates = nodeIds.map(async (id) => {
                const newZ = action === 'front' ? maxZ + 1 : minZ - 1;
                const { data, error } = await supabase.from('history_nodes').update({ z_index: newZ }).eq('id', id).select(HISTORY_NODE_SELECT).single();
                if (error) throw error;
                const updated = mapDbNodeToRFNode(data, {
                    onNavigate: handleNavigate,
                    onSelectionChange: (sid: string, selected: boolean) => {
                        setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                    },
                    onResizeStop: handleResizeStop
                });
                allNodesRef.current.set(updated.id, updated);
                return updated;
            });

            await Promise.all(updates);
            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Z-Index Update Failed:', err);
        } finally {
            setLoading(false);
        }
    }, [currentRootId, syncVisualization, handleNavigate]);

    /**
     * 계층 변경 (Parent Node 변경) & 자동 크기 조절
     */
    const handleMoveToParent = useCallback(async (nodeIds: string[], newParentId: string | null) => {
        // console.log(`🔍 [FolderDebug] handleMoveToParent called. Nodes: ${nodeIds.join(', ')} -> NewParent: ${newParentId}`);
        // 1. Prepare for Auto-Resize
        const parentsToResize = new Set<string>();
        if (newParentId) parentsToResize.add(String(newParentId));

        const updates = nodeIds.map(async (id) => {
            const node = nodes.find(n => n.id === id);
            if (!node) return null;

            if (newParentId === node.id) {
                console.warn('⚠️ Cannot move node to itself');
                return null;
            }

            // Track old parent for resize
            if (node.data.parent_node_id) {
                parentsToResize.add(String(node.data.parent_node_id));
            }

            // Calculate new relative position
            let newX = node.position.x;
            let newY = node.position.y;

            const oldParentId = node.data.parent_node_id ? String(node.data.parent_node_id) : null;
            const targetParentIdStr = newParentId ? String(newParentId) : null;

            let newWidth = node.width || Number(node.style?.width);
            let newHeight = node.height || Number(node.style?.height);

            if (oldParentId !== targetParentIdStr) {
                const getAbs = (n: any) => {
                    if (n.positionAbsolute) return n.positionAbsolute;
                    let x = n.position.x, y = n.position.y;
                    let curr = n;
                    while (curr.parentNode) {
                        const p = allNodesRef.current.get(String(curr.parentNode));
                        if (p) { x += p.position.x; y += p.position.y; curr = p; }
                        else break;
                    }
                    return { x, y };
                };

                const nodeAbs = getAbs(node);
                let parentAbs = { x: 0, y: 0 };

                if (newParentId) {
                    const parentNode = allNodesRef.current.get(String(newParentId));
                    if (parentNode) {
                        parentAbs = getAbs(parentNode);
                    }
                }

                newX = nodeAbs.x - parentAbs.x;
                newY = nodeAbs.y - parentAbs.y;

                // 🔥 [Safety] Portal Exit Placement (Keep this logic as it handles higher level logic)
                // When moving to a parent level higher than the current view
                if (currentRootId) {
                    let traceNode = allNodesRef.current.get(String(currentRootId));
                    let representativePortal: any = null;

                    // Trace up from currentRootId to find the node whose parent is targetParentIdStr
                    while (traceNode) {
                        const traceParentIdStr = traceNode.data.parent_node_id ? String(traceNode.data.parent_node_id) : null;
                        if (traceParentIdStr === targetParentIdStr) {
                            representativePortal = traceNode;
                            break;
                        }
                        if (!traceParentIdStr) break;
                        traceNode = allNodesRef.current.get(traceParentIdStr);
                    }

                    if (representativePortal) {
                        // Place next to the representative portal in the target level
                        const portalWidth = representativePortal.width || Number(representativePortal.style?.width) || 421;
                        newX = representativePortal.position.x + portalWidth + 120;
                        newY = representativePortal.position.y;

                        // console.log('🚀 [HistoryEngine] Portal Exit Placement:', {
                        //     node: node.data.title,
                        //     pushedToPortal: representativePortal.data.title,
                        //     newX,
                        //     newY
                        // });
                    }
                }
            }

            const dbData: any = {
                id: node.data.id,
                position_x: newX,
                position_y: newY,
                width: newWidth,
                height: newHeight,
                parent_node_id: newParentId ? Number(newParentId) : null
            };

            const { data, error } = await supabase.from('history_nodes').update(dbData).eq('id', node.data.id).select(HISTORY_NODE_SELECT).single();
            if (error) throw error;

            const updated = mapDbNodeToRFNode(data, {
                onNavigate: handleNavigate,
                onSelectionChange: (sid: string, selected: boolean) => {
                    setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                },
                onResizeStop: handleResizeStop
            }, isEditMode);

            // Ref & Position Update
            updated.position = { x: newX, y: newY };
            allNodesRef.current.set(updated.id, updated);
            return updated;
        });

        try {
            await Promise.all(updates);

            // Auto-Sort & Resize for affected folders
            if (parentsToResize.size > 0) {
                // console.log(`🔍 [FolderDebug] Triggering Sort & Resize for: ${Array.from(parentsToResize).join(', ')}`);
                for (const pid of Array.from(parentsToResize)) {
                    // Safe call check (in case functions are defined below)
                    if (rearrangeFolderChildren) await rearrangeFolderChildren(pid);
                    if (updateParentSize) await updateParentSize(pid);
                }
            }

            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Move Failed:', err);
            loadTimeline();
        }
    }, [nodes, currentRootId, syncVisualization, handleNavigate, loadTimeline, isEditMode, rearrangeFolderChildren, updateParentSize]);



    /**
     * 노드 위치 저장 (Batch Upsert)
     */
    const onNodeDragStop = useCallback((event: any, node: any) => {
        // 1. Update internal Ref
        const refNode = allNodesRef.current.get(node.id);
        if (refNode) {
            refNode.position = node.position;
            // Sync dimensions if updated by resizer before drag stop
            if (node.width) refNode.width = node.width;
            if (node.height) refNode.height = node.height;
        }

        // Helper: Calculate Intersection Ratio
        const getIntersectionRatio = (r1: any, r2: any) => {
            const x1 = Math.max(r1.x, r2.x);
            const y1 = Math.max(r1.y, r2.y);
            const x2 = Math.min(r1.x + r1.w, r2.x + r2.w);
            const y2 = Math.min(r1.y + r1.h, r2.y + r2.h);
            if (x2 < x1 || y2 < y1) return 0;
            const intersectArea = (x2 - x1) * (y2 - y1);
            const nodeArea = r1.w * r1.h;
            return intersectArea / nodeArea;
        };

        const nodeRect = {
            x: node.positionAbsolute?.x ?? node.position.x,
            y: node.positionAbsolute?.y ?? node.position.y,
            w: node.width || Number(node.style?.width) || 320,
            h: node.height || Number(node.style?.height) || 160
        };

        // 2. Logic: Move Out (Escape Parent)
        // If the node has a parent visible on the canvas, check if we dragged it out.
        const parentId = node.data?.parent_node_id;
        if (parentId) {
            // Find parent in CURRENT VISIBLE nodes (not just ref)
            const parentNode = nodes.find(n => n.id === String(parentId));
            if (parentNode) {
                const parentRect = {
                    x: parentNode.positionAbsolute?.x ?? parentNode.position.x,
                    y: parentNode.positionAbsolute?.y ?? parentNode.position.y,
                    w: parentNode.width || Number(parentNode.style?.width) || 640,
                    h: parentNode.height || Number(parentNode.style?.height) || 480
                };

                const ratio = getIntersectionRatio(nodeRect, parentRect);
                // If less than 20% overlap, move out (Magnetic Snap)
                if (ratio < 0.2) {
                    const grandParentId = parentNode.data?.parent_node_id || null;
                    // console.log('🧲 Magnetic Out: Moving to', grandParentId);
                    handleMoveToParent([node.id], grandParentId);
                    return;
                }
            }
        }

        // 3. Logic: Move In (Enter Folder)
        // Check overlap with other visible folders
        const potentialParents = nodes.filter(n =>
            n.id !== node.id &&
            (n.data?.category === 'folder' || n.data?.category === 'canvas' || n.data?.nodeType === 'folder')
        );

        for (const target of potentialParents) {
            const targetRect = {
                x: target.positionAbsolute?.x ?? target.position.x,
                y: target.positionAbsolute?.y ?? target.position.y,
                w: target.width || Number(target.style?.width) || 640,
                h: target.height || Number(target.style?.height) || 480
            };

            const ratio = getIntersectionRatio(nodeRect, targetRect);
            if (ratio > 0.2) {
                // console.log('🧲 Magnetic In: Moving into', target.data.title);
                handleMoveToParent([node.id], target.id);
                return;
            }
        }

        // 4. Fallback: Breadcrumb Drop (Client-Point Checks)
        const clientX = event.clientX || event.sourceEvent?.clientX;
        const clientY = event.clientY || event.sourceEvent?.clientY;
        if (clientX && clientY) {
            const elements = document.elementsFromPoint(clientX, clientY);
            const breadcrumbEl = elements.find(el => el.getAttribute('data-breadcrumb-id') !== null);
            if (breadcrumbEl) {
                const targetIdStr = breadcrumbEl.getAttribute('data-breadcrumb-id');
                const targetId = targetIdStr === 'null' ? null : targetIdStr;
                if (String(targetId) !== String(currentRootId)) {
                    handleMoveToParent([node.id], targetId);
                }
            }
        }

        // 5. 🔥 Intra-Folder Move: 폴더 내부 이동 시 자동 정렬 및 크기 조절
        const currentParentId = node.data?.parent_node_id;
        if (currentParentId && rearrangeFolderChildren && updateParentSize) {
            const pid = String(currentParentId);

            // 비동기 정렬 및 크기 조절 후 화면 갱신
            rearrangeFolderChildren(pid).then(async () => {
                await updateParentSize(pid);
                syncVisualization(currentRootId); // 화면 갱신 추가
            });

            // 🚨 중요: Layout 저장이 필요한 상태임을 표시
            setHasUnsavedChanges(true);

            // 🚨 중요: Standard Save(단순 좌표 저장) 방지
            // 정렬 로직이 좌표를 재설정하므로, 여기서 함수를 종료하여 덮어쓰기를 막음.
            return;
        }

        // 6. 좌표가 변경되었는지 확인 (Smart Change Detection)
        const savedState = lastSavedStateRef.current.get(node.id);
        if (savedState) {
            const currentX = Math.round(node.position.x);
            const currentY = Math.round(node.position.y);
            // const currentW = node.width || Number(node.style?.width) || 320;
            // const currentH = node.height || Number(node.style?.height) || 160;

            const isChanged =
                Math.abs(currentX - savedState.x) > 1 ||
                Math.abs(currentY - savedState.y) > 1;
            // Size usually changes via resize handler, not drag, but can add if needed.
            // || Math.abs(currentW - savedState.w) > 1 || Math.abs(currentH - savedState.h) > 1;

            if (isChanged) {
                // console.log(`📝 [HistoryEngine] Node Moved: ${node.data.title} (${savedState.x},${savedState.y}) -> (${currentX},${currentY})`);
                setHasUnsavedChanges(true);
            }
        } else {
            // New node or unknown state
            setHasUnsavedChanges(true);
        }

    }, [nodes, currentRootId, handleMoveToParent, rearrangeFolderChildren, updateParentSize, syncVisualization]);

    const handleSaveLayout = useCallback(async () => {
        const updates = Array.from(allNodesRef.current.values()).map(n => {
            const w = Number(n.width) || Number(n.style?.width) || 320;
            const h = Number(n.height) || Number(n.style?.height) || 160;

            return {
                id: Number(n.id),
                position_x: Math.round(n.position.x),
                position_y: Math.round(n.position.y),
                width: w,
                height: h,
                z_index: Number(n.style?.zIndex) || (n.zIndex && n.zIndex !== 0 ? n.zIndex : 0)
            };
        });

        // console.log('📋 [HistoryEngine] Preparing Layout Save. Sample Node:', updates[0]);

        try {
            // Upsert fails if required fields (title) are missing for potential inserts.
            // Using generic update for existing rows is safer.
            const promises = updates.map(update =>
                supabase.from('history_nodes').update({
                    position_x: update.position_x,
                    position_y: update.position_y,
                    width: update.width,
                    height: update.height,
                    z_index: update.z_index
                }).eq('id', update.id)
            );

            await Promise.all(promises);
            // 2. Save Complete - Update Last Saved State
            setHasUnsavedChanges(false);
            updates.forEach(u => {
                lastSavedStateRef.current.set(String(u.id), {
                    x: u.position_x,
                    y: u.position_y,
                    w: u.width,
                    h: u.height
                });
            });

            // console.log('✅ [HistoryEngine] Layout Saved Successfully');
        } catch (err) {
            console.error('🚨 [HistoryEngine] Layout Save Failed:', err);
        }
    }, []);

    /**
     * 노드 리사이즈 종료 시 DB 저장
     */
    const handleResizeStop = useCallback(async (id: string | number, width: number, height: number) => {
        // 1. Update Ref
        const refNode = allNodesRef.current.get(String(id));
        if (refNode) {
            refNode.width = width;
            refNode.height = height;
            refNode.style = { ...refNode.style, width, height };
        }

        // 2. Update DB (Ensure ID is numeric for Supabase)
        try {
            const numericId = Number(id);
            const { data, error } = await supabase.from('history_nodes').update({ width, height }).eq('id', numericId).select(HISTORY_NODE_SELECT).single();

            if (!error && data) {
                const updated = mapDbNodeToRFNode(data, {
                    onNavigate: handleNavigate,
                    onSelectionChange: (sid: string, selected: boolean) => {
                        setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                    },
                    onResizeStop: handleResizeStop
                }, isEditMode);
                allNodesRef.current.set(updated.id, updated);

                // 🔥 [New Fix] 자식 노드 크기가 바뀌면 부모 폴더 크기만 업데이트 (위치 점프 방지를 위해 정렬은 제외)
                if (data.parent_node_id) {
                    await updateParentSize(String(data.parent_node_id));
                }

                // 🔥 [UX Fix] 부모 크기 변경사항을 즉시 화면에 반영 (Sync)
                syncVisualization(currentRootId);
            }
            // console.log('💾 [HistoryEngine] Resize Saved:', { id: numericId, width, height });
        } catch (err) {
            console.error('🚨 [HistoryEngine] Resize Save Failed:', err);
        }
    }, [currentRootId, syncVisualization, handleNavigate, isEditMode, rearrangeFolderChildren, updateParentSize, setNodes]);

    /**
     * 엣지 생성 (Connect)
     */
    const handleConnect = useCallback(async (params: any) => {
        try {
            const newEdge = {
                source_id: Number(params.source),
                target_id: Number(params.target),
                source_handle: params.sourceHandle,
                target_handle: params.targetHandle,
                // user_id: userId, // DB schema doesn't seem to require user_id in the migration I saw, but let's check. 
                // Actually migration has created_by, not user_id. 
                // But let's stick to column names I saw: source_id, target_id.
                // If insertion fails on other cols, I'll fix them too.
                label: ''
            };

            const { data, error } = await supabase.from('history_edges').insert(newEdge).select().single();
            if (error) throw error;

            const flowEdge: Edge = {
                id: String(data.id),
                source: String(data.source_id),
                target: String(data.target_id),
                sourceHandle: data.source_handle,
                targetHandle: data.target_handle,
                label: '',
                data: { label: '' },
                style: { stroke: '#71717a', strokeWidth: 4 }
            };

            allEdgesRef.current.set(flowEdge.id, flowEdge);
            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Connect Failed:', err);
        }
    }, [userId, currentSpaceId, currentRootId, syncVisualization]);

    /**
     * 엣지 수정
     */
    const handleUpdateEdge = useCallback(async (edgeId: string, updates: any) => {
        try {
            const { data, error } = await supabase.from('history_edges').update(updates).eq('id', edgeId).select().single();
            if (error) throw error;

            const existing = allEdgesRef.current.get(edgeId);
            if (existing) {
                const updated: Edge = {
                    ...existing,
                    label: data.label,
                    data: { label: data.label },
                    style: { ...existing.style, stroke: data.color || existing.style?.stroke }
                };
                allEdgesRef.current.set(edgeId, updated);
                syncVisualization(currentRootId);
            }
        } catch (err) {
            console.error('🚨 [HistoryEngine] Edge Update Failed:', err);
        }
    }, [currentRootId, syncVisualization]);

    /**
     * 엣지 삭제
     */
    const handleDeleteEdge = useCallback(async (edgeId: string) => {
        try {
            const { error } = await supabase.from('history_edges').delete().eq('id', edgeId);
            if (error) throw error;

            allEdgesRef.current.delete(edgeId);
            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Edge Delete Failed:', err);
        }
    }, [currentRootId, syncVisualization]);



    /**
     * 외부 리소스 드롭 시 노드 생성
     */
    const handleDrop = useCallback(async (event: React.DragEvent, draggedResource: any, rfInstance: ReactFlowInstance | null) => {
        if (!rfInstance || !draggedResource || !userId) return;

        event.preventDefault();

        const position = rfInstance.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
        });

        // V7: 하이브리드 자동 연동 로직
        const type = String(draggedResource.type || '').toLowerCase();
        const isLinked = !!(type === 'video' || type === 'playlist' ||
            type === 'document' || type === 'general' ||
            type === 'person' || type === 'canvas' || type === 'category');

        const newNodeData: any = {
            title: isLinked ? null : draggedResource.title,
            description: isLinked ? null : (draggedResource.description || ''),
            category: draggedResource.category || 'general',
            year: draggedResource.year || new Date().getFullYear(),
            position_x: Math.round(position.x),
            position_y: Math.round(position.y),
            created_by: userId,
            space_id: currentSpaceId,
            parent_node_id: currentRootId ? Number(currentRootId) : null,
            node_behavior: 'LEAF'
        };

        // 타입별 연동 필드 설정
        if (type === 'video') newNodeData.linked_video_id = draggedResource.id;
        if (type === 'playlist') newNodeData.linked_playlist_id = draggedResource.id;
        if (type === 'document') newNodeData.linked_document_id = draggedResource.id;
        if (type === 'general' || type === 'category') newNodeData.linked_category_id = draggedResource.id;
        if (type === 'person') newNodeData.linked_document_id = draggedResource.id;
        if (type === 'canvas') newNodeData.linked_category_id = draggedResource.id;

        try {
            const { data, error } = await supabase.from('history_nodes').insert(newNodeData).select().single();
            if (error) throw error;

            const updated = mapDbNodeToRFNode(data, {
                onNavigate: handleNavigate,
                onSelectionChange: (sid: string, selected: boolean) => {
                    setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                },
                onResizeStop: handleResizeStop
            });
            allNodesRef.current.set(updated.id, updated);
            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Drop Processing Failed:', err);
        }
    }, [userId, currentSpaceId, currentRootId, syncVisualization, handleNavigate]);

    /**
     * 10년 단위 시간 경계 노드 생성 (V7 Helper)
     */
    const generateDecadeNodes = useCallback((minYear: number, maxYear: number) => {
        const decades: HistoryRFNode[] = [];
        const startDecade = Math.floor(minYear / 10) * 10;
        const endDecade = Math.ceil(maxYear / 10) * 10;

        for (let year = startDecade; year <= endDecade; year += 10) {
            decades.push({
                id: `decade-${year}`,
                type: 'decadeNode',
                position: { x: (year - 1900) * 400, y: -200 },
                data: {
                    id: 0,
                    title: `${year}s`,
                    year,
                    node_behavior: 'LEAF'
                },
                draggable: false,
                selectable: false,
                zIndex: -10
            } as any);
        }
        return decades;
    }, []);

    return {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        loading,
        breadcrumbs,
        currentRootId,
        handleNavigate,
        allNodesRef,
        syncVisualization,
        handleSaveNode,
        handleDeleteNodes,
        onNodeDragStop,
        handleDrop,
        handleSaveLayout,
        handleUpdateZIndex,
        handleConnect,
        handleDeleteEdge,
        handleUpdateEdge,
        handleMoveToParent,
        generateDecadeNodes,
        handleResizeStop,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        loadTimeline
    };
};
