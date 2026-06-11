import { useState, useCallback, useRef, useEffect } from 'react';
import {
    type ReactFlowInstance,
    type Edge,
    useNodesState,
    useEdgesState
} from 'reactflow';
import { supabase } from '../../../lib/cafe24Client';
import type { HistoryRFNode, NodeBehavior } from '../types';
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
    const [nodes, setNodes, onNodesChangeRaw] = useNodesState<any>([]);
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
    // � Saved State Reference for Change Detection
    const lastSavedStateRef = useRef<Map<string, { x: number, y: number, w: number, h: number }>>(new Map());
    // 🔥 Load Tracking to prevent duplicate loadTimeline calls
    const loadedRef = useRef(false);

    // 🔥 Track dragged nodes for position sync
    const draggedNodesRef = useRef<Set<string>>(new Set());

    // 🆕 Folder Logic Hook Integration
    const { rearrangeFolderChildren, updateParentSize } = useFolderLogic({ allNodesRef });

    // �🔍 DEBUG: Wrap onNodesChange to log all node changes AND handle drag end
    const onNodesChange = useCallback((changes: any[]) => {
        const dragChanges = changes.filter(c => c.type === 'position' && c.dragging !== undefined);

        if (dragChanges.length > 0) {
            console.log('🎯🎯🎯 [DEBUG] DRAG DETECTED in onNodesChange', {
                totalChanges: changes.length,
                dragChanges: dragChanges.length,
                changes: dragChanges
            });

            // 🔥 CRITICAL FIX: Detect drag END (dragging: false)
            const dragEndChanges = dragChanges.filter(c => c.dragging === false);
            if (dragEndChanges.length > 0) {
                console.log('🏁🏁🏁 [DEBUG] DRAG END DETECTED', {
                    nodesCount: dragEndChanges.length,
                    nodeIds: dragEndChanges.map(c => c.id)
                });

                // 🔥 CRITICAL FIX: Track dragged nodes and sync positions in useEffect
                console.log('🏁 [DEBUG] Drag ended, tracking node IDs for position sync');
                dragEndChanges.forEach(change => {
                    draggedNodesRef.current.add(change.id);
                    console.log(`� [DEBUG] Added ${change.id} to draggedNodesRef`);
                });
            }
        }

        onNodesChangeRaw(changes);
    }, [onNodesChangeRaw, allNodesRef, lastSavedStateRef]);

    /**
     * 데이터를 화면에 동기화하는 함수 (Projection Engine + Filtering)
     */
    const syncVisualization = useCallback((
        rootId: string | null,
        filters: { search?: string } = {}
    ) => {
        // console.log('🔧 [useHistoryEngine] syncVisualization Called', {
        //     rootId,
        //     filters,
        //     totalNodes: allNodesRef.current.size,
        //     totalEdges: allEdgesRef.current.size
        // });

        const allNodes = Array.from(allNodesRef.current.values());
        const allEdges = Array.from(allEdgesRef.current.values());

        // 1. 검색 및 필터링 적용
        // 1. 검색 적용
        if (filters?.search) {
            // console.log('🔍 Filtering nodes with:', filters);

            // [Helper] Check if node is visible in current scope (Standard Canvas Logic)
            const isSearchableInScope = (node: any): boolean => {
                let current = node;
                while (current.parentNode) {
                    const parent = allNodesRef.current.get(current.parentNode);
                    if (!parent) break;

                    // If we hit a canvas boundary
                    if (parent.data.category === 'canvas' || parent.data.node_behavior === 'PORTAL') {
                        // If this canvas IS the current view, then the node is inside it (Visible)
                        if (parent.id === rootId) return true;
                        // If this canvas is NOT the current view, it's a nested/sibling canvas (Hidden)
                        return false;
                    }
                    current = parent;
                }
                // Reached Root (no parent)
                // If we are at Global Root (rootId === null), this is visible.
                // If we are inside a specific canvas (rootId !== null), this Global node is NOT visible.
                return rootId === null;
            };

            // A. Primary Matches
            const primaryMatches = allNodes.filter(n => {
                // 🔥 User Request: "Search only nodes in THAT canvas"
                if (!isSearchableInScope(n)) return false;

                const title = n.data.title || '';

                let matchesSearch = !filters.search;
                if (filters.search) {
                    const lowerQuery = filters.search.toLowerCase();
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

            // [FIX] 이웃 노드도 캔버스 내부에 있다면 제외 -> User Request: Allow
            const neighbors = allNodes.filter(n => {
                // if (isNodeInsideCanvas(n)) return false;
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

                    // 🔥 Scope Check (Recycled logic)
                    if (parentNode.data.category === 'canvas' || parentNode.data.node_behavior === 'PORTAL') {
                        if (parentNode.id !== rootId) return false;
                    }
                    // if (parentNode.data.category === 'canvas' || parentNode.data.node_behavior === 'PORTAL') return false;

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

            const flowNodes = (nodesData || []).map(node => mapDbNodeToRFNode(node, handlers, isEditMode));

            // [V21] PERSISTENCE FIX: Calculate child counts immediately on load
            // This ensures has-children (floating UI) is active on refresh.
            const childCounts = new Map<any, number>();
            flowNodes.forEach(node => {
                const pid = node.data.parent_node_id;
                if (pid) {
                    childCounts.set(String(pid), (childCounts.get(String(pid)) || 0) + 1);
                }
            });

            allNodesRef.current.clear();
            flowNodes.forEach(node => {
                const nodeHasChildren = (childCounts.get(String(node.id)) || 0) > 0;
                node.data = { ...node.data, hasChildren: nodeHasChildren };

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
            // console.log('🎨 [useHistoryEngine] Initial syncVisualization from loadTimeline');
            syncVisualization(currentRootId);
            // console.log('✅ [useHistoryEngine] loadTimeline Complete', { nodesLoaded: flowNodes.length, edgesLoaded: flowEdges.length });

        } catch (error: any) {
            console.error('🚨 [useHistoryEngine] Load Failed:', error);
            // [Mobile Debug] 화면에 에러 표시
            alert(`데이터 로딩 실패:\n${error?.message || 'Unknown Error'}`);
        } finally {
            setLoading(false);
        }
    }, [currentRootId, syncVisualization, isEditMode]);

    // 🔥 CRITICAL FIX: loadTimeline should only run ONCE on mount
    useEffect(() => {
        if (!loadedRef.current) {
            loadedRef.current = true;
            loadTimeline();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty dependency - only run once on mount

    // 🔥 Sync dragged node positions after nodes state updates
    useEffect(() => {
        if (draggedNodesRef.current.size > 0) {
            console.log('🔄 [DEBUG] Syncing dragged node positions from nodes state', {
                draggedCount: draggedNodesRef.current.size,
                draggedIds: Array.from(draggedNodesRef.current)
            });

            let hasAnyChange = false;
            draggedNodesRef.current.forEach(nodeId => {
                const stateNode = nodes.find(n => n.id === nodeId);
                const refNode = allNodesRef.current.get(nodeId);

                if (stateNode && refNode) {
                    console.log(`📝 [DEBUG] Syncing position for ${nodeId}:`, stateNode.position);
                    refNode.position = stateNode.position;
                    if (stateNode.positionAbsolute) refNode.positionAbsolute = stateNode.positionAbsolute;

                    // Check if position changed
                    const savedState = lastSavedStateRef.current.get(nodeId);
                    if (savedState) {
                        const currentX = Math.round(stateNode.position.x);
                        const currentY = Math.round(stateNode.position.y);
                        const isChanged = Math.abs(currentX - savedState.x) > 1 || Math.abs(currentY - savedState.y) > 1;

                        if (isChanged) {
                            console.log(`✅ [DEBUG] Position changed for ${nodeId}`);
                            hasAnyChange = true;
                        }
                    } else {
                        hasAnyChange = true;
                    }
                } else {
                    console.warn(`⚠️ [DEBUG] Could not sync ${nodeId}:`, {
                        hasStateNode: !!stateNode,
                        hasRefNode: !!refNode
                    });
                }
            });

            if (hasAnyChange) {
                console.log('💾 [DEBUG] Setting hasUnsavedChanges = true from useEffect');
                setHasUnsavedChanges(true);
            }

            // Clear the set
            draggedNodesRef.current.clear();
            console.log('🧹 [DEBUG] Cleared draggedNodesRef');
        }
    }, [nodes]); // Run whenever nodes change

    // 🔥 Force sync when Edit Mode changes to update draggable/ui state
    useEffect(() => {
        // Debounce sync slightly to avoid rapid toggles
        const timer = setTimeout(() => {
            syncVisualization(currentRootId);
        }, 50);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditMode]); // Only react to Edit Mode changes. RootId change is handled by handleNavigate.

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
                    zIndex: isConnect ? 999 : 1 // Ensure highlighted edges are on top, default to 1 (above folders)
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
                    year: nodeData.year,
                    ...(nodeData.metadata !== undefined ? { metadata: nodeData.metadata } : {})
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
            const existingContentData = typeof nodeData.content_data === 'object' && nodeData.content_data !== null
                ? nodeData.content_data
                : {};
            if (nodeData.metadata !== undefined || nodeData.image_url !== undefined) {
                finalData.content_data = {
                    ...existingContentData,
                    ...(nodeData.metadata !== undefined ? { metadata: nodeData.metadata } : {}),
                    ...(nodeData.image_url !== undefined ? { image_url: nodeData.image_url } : {}),
                };
            }

            // space_id와 parent_node_id는 신규 생성 시에만 자동 할당 (수정 시에는 기존값 보존)
            if (isNew) {
                if (finalData.space_id === undefined) finalData.space_id = currentSpaceId;
                if (finalData.parent_node_id === undefined) {
                    finalData.parent_node_id = currentRootId ? String(currentRootId) : null;
                }
                if (userId) finalData.created_by = userId;

                // 🔥 [UX Fix] 초기 생성 크기 명시 (작게 생성되는 문제 해결)
                const isCanvas = finalData.category === 'canvas' || finalData.nodeType === 'canvas';
                if (!finalData.width) finalData.width = isCanvas ? 420 : 320;
                if (!finalData.height) finalData.height = isCanvas ? 250 : 140;

                console.log('🆕 [HistoryEngine] Creating New Node:', {
                    title: finalData.title,
                    category: finalData.category,
                    width: finalData.width,
                    height: finalData.height
                });
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
            }, isEditMode);
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
    }, [userId, currentSpaceId, currentRootId, syncVisualization, handleNavigate, isEditMode]);

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
                const isLeaf = allNodesRef.current.get(id)?.data.node_behavior === 'LEAF';
                const calculatedZ = action === 'front' ? maxZ + 1 : minZ - 1;
                const newZ = isLeaf ? Math.max(1, calculatedZ) : 0;
                const { data, error } = await supabase.from('history_nodes').update({ z_index: newZ }).eq('id', id).select(HISTORY_NODE_SELECT).single();
                if (error) throw error;
                const updated = mapDbNodeToRFNode(data, {
                    onNavigate: handleNavigate,
                    onSelectionChange: (sid: string, selected: boolean) => {
                        setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                    },
                    onResizeStop: handleResizeStop
                }, isEditMode);
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
    }, [currentRootId, syncVisualization, handleNavigate, isEditMode]);

    /**
     * 계층 변경 (Parent Node 변경) & 자동 크기 조절
     */
    const handleMoveToParent = useCallback(async (nodeIds: string[], newParentId: string | null) => {
        // console.log(`🔍 [FolderDebug] handleMoveToParent called. Nodes: ${nodeIds.join(', ')} -> NewParent: ${newParentId}`);
        // 1. Prepare for Auto-Resize
        const parentsToResize = new Set<string>();
        if (newParentId) parentsToResize.add(String(newParentId));

        const updates = nodeIds.map(async (id) => {
            // 🔥 Fix: Use Authoritative Ref to get the LATEST drag position (positionAbsolute is synced in onNodeDragStop)
            let node = allNodesRef.current.get(id);
            if (!node) node = nodes.find(n => n.id === id); // Fallback to state if not in Ref
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

            const newWidth = node.width || Number(node.style?.width);
            const newHeight = node.height || Number(node.style?.height);

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

                // 🔥 Fix: When moving into a folder, ensure we don't overlap the header (140px)
                // If the calculations put us at < 160, force it to 160.
                let calculatedY = nodeAbs.y - parentAbs.y;
                if (newParentId) {
                    calculatedY = Math.max(calculatedY, 160);
                }
                newX = nodeAbs.x - parentAbs.x;
                newY = calculatedY;

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
        // 🔍 DEBUG: Multi-Select Tracking
        const selectedNodes = nodes.filter(n => n.selected);
        const debugMsg = `🎯 onNodeDragStop: ${node.data?.title || node.id} | Selected: ${selectedNodes.length}`;
        console.log('='.repeat(80));
        console.log(debugMsg);
        console.log('='.repeat(80));
        console.log('🎯 [DEBUG] onNodeDragStop Called', {
            draggedNode: node.data?.title || node.id,
            totalSelected: selectedNodes.length,
            selectedNodeTitles: selectedNodes.map(n => n.data?.title || n.id),
            draggedNodePosition: node.position
        });

        // Visual alert for debugging
        if (selectedNodes.length > 1) {
            console.warn(`⚠️⚠️⚠️ MULTI-SELECT DRAG: ${selectedNodes.length} nodes selected`);
        }

        // 1. Update internal Ref
        const refNode = allNodesRef.current.get(node.id);
        if (refNode) {
            console.log('📝 [DEBUG] Updating allNodesRef for dragged node:', node.data?.title || node.id);
            refNode.position = node.position;
            if (node.positionAbsolute) refNode.positionAbsolute = node.positionAbsolute; // 🔥 Fix: Sync Absolute Position for Calculations
            // Sync dimensions if updated by resizer before drag stop
            if (node.width) refNode.width = node.width;
            if (node.height) refNode.height = node.height;
        } else {
            console.warn('⚠️ [DEBUG] refNode not found in allNodesRef for:', node.id);
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

        // 🔥 Fix: Manual Drag Safety - If we are inside a folder, enforce Header Safe Zone
        const parentId = node.data?.parent_node_id;
        if (parentId) {
            // Apply constraint to internal Ref and Node object
            if (node.position.y < 160) {
                // console.log('🛡️ Header Safe Zone Protection Triggered');
                node.position.y = 160;
                if (refNode) refNode.position.y = 160;

                // Also update immediate database state if we proceed to save
                // This will be picked up by the 'isChanged' check later
            }
        }

        // 2. Logic: Move Out (Escape Parent)
        // If the node has a parent visible on the canvas, check if we dragged it out.
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
                    console.log('🧲 [DEBUG] Magnetic Out Triggered - EARLY RETURN', {
                        node: node.data?.title || node.id,
                        ratio,
                        movingTo: grandParentId
                    });
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
                console.log('🧲 [DEBUG] Magnetic In Triggered - EARLY RETURN', {
                    node: node.data?.title || node.id,
                    folder: target.data?.title || target.id,
                    ratio
                });
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
                    console.log('📍 [DEBUG] Breadcrumb Drop Triggered - EARLY RETURN', {
                        node: node.data?.title || node.id,
                        targetId
                    });
                    handleMoveToParent([node.id], targetId);
                    return;
                }
            }
        }

        // 5. 🔥 Intra-Folder Move: 폴더 내부 이동 시 자동 정렬 및 크기 조절
        const currentParentId = node.data?.parent_node_id;
        if (currentParentId && rearrangeFolderChildren && updateParentSize) {
            const pid = String(currentParentId);

            console.log('📁 [DEBUG] Folder Rearrange Triggered - EARLY RETURN', {
                node: node.data?.title || node.id,
                parentId: pid
            });

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
                console.log(`📝 [DEBUG] Position Changed - Setting hasUnsavedChanges`, {
                    node: node.data?.title || node.id,
                    oldPos: `(${savedState.x}, ${savedState.y})`,
                    newPos: `(${currentX}, ${currentY})`
                });
                // console.log(`📝 [HistoryEngine] Node Moved: ${node.data.title} (${savedState.x},${savedState.y}) -> (${currentX},${currentY})`);
                setHasUnsavedChanges(true);
            } else {
                console.log(`⏭️ [DEBUG] Position NOT Changed - No save needed`, {
                    node: node.data?.title || node.id,
                    pos: `(${currentX}, ${currentY})`
                });
            }
        } else {
            // New node or unknown state
            console.log(`🆕 [DEBUG] No saved state found - Setting hasUnsavedChanges`, {
                node: node.data?.title || node.id
            });
            setHasUnsavedChanges(true);
        }

        console.log('✅ [DEBUG] onNodeDragStop Completed - No early returns triggered');


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
                z_index: (n.data.node_behavior === 'LEAF') ? Math.max(1, Number(n.style?.zIndex) || n.zIndex || 1) : 0
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
    const handleResizeStop = useCallback(async (id: string | number, width: number, height: number, x: number, y: number) => {
        // console.log('📐 [HistoryEngine] onResizeStop:', id, width, height, x, y);

        const rfId = String(id);
        const refNode = allNodesRef.current.get(rfId);

        // 🔥 [Scaling Logic] Calculate Scale Factor BEFORE updating ref
        let scaleX = 1;
        let scaleY = 1;
        let shouldScaleChildren = false;

        if (refNode) {
            // 🔥 [Fix] Use Current Ref State (just before this update) as 'old' dimension
            // This ensures we calculate scale relative to the *immediate previous* size, not the DB saved size.
            // This prevents exponential scaling when resizing multiple times.
            const oldW = refNode.width || Number(refNode.style?.width) || 320;
            const oldH = refNode.height || Number(refNode.style?.height) || 160;

            // Protect against zero division
            if (oldW > 0 && oldH > 0) {
                scaleX = width / oldW;
                scaleY = height / oldH;
            }

            // Only scale if it's a GROUP node and scale is significant/valid
            shouldScaleChildren = (refNode.data.node_behavior === 'GROUP') &&
                (Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01);

            if (shouldScaleChildren) {
                console.log(`📐 [Scaling] Folder ${rfId} resized. Scale: ${scaleX.toFixed(2)}x${scaleY.toFixed(2)}`);
            }

            // 1. Update Ref (Authoritative State) - Parent
            refNode.width = width;
            refNode.height = height;
            refNode.position = { x, y };
            refNode.style = { ...refNode.style, width, height };
        }

        // 2. ReactFlow state sync (Functional update) + Child Scaling
        setNodes(nds => {
            let nextNodes = nds.map(n => {
                if (n.id === rfId) {
                    return {
                        ...n,
                        width,
                        height,
                        position: { x, y },
                        style: { ...n.style, width, height }
                    };
                }
                return n;
            });

            // 🔥 Apply Scaling to Children
            if (shouldScaleChildren) {
                nextNodes = nextNodes.map(child => {
                    // Check if this node is a child of the resized folder
                    if (String(child.data.parent_node_id) === rfId) {
                        const oldCW = child.width || Number(child.style?.width) || 320;
                        const oldCH = child.height || Number(child.style?.height) || 160;

                        const newCW = oldCW * scaleX;
                        const newCH = oldCH * scaleY;
                        const newCX = child.position.x * scaleX;
                        const newCY = child.position.y * scaleY;

                        // Update Ref for Child as well
                        const childRef = allNodesRef.current.get(child.id);
                        if (childRef) {
                            childRef.width = newCW;
                            childRef.height = newCH;
                            childRef.position = { x: newCX, y: newCY };
                            childRef.style = { ...childRef.style, width: newCW, height: newCH };
                        }

                        // Return updated child props
                        return {
                            ...child,
                            width: newCW,
                            height: newCH,
                            position: { x: newCX, y: newCY },
                            style: { ...child.style, width: newCW, height: newCH }
                        };
                    }
                    return child;
                });
            }

            return nextNodes;
        });

        // 🚨 CRITICAL: Mark as dirty to trigger Save/Cancel modal
        setHasUnsavedChanges(true);

        // [V11] Removed immediate DB update. Resizes are now batched into handleSaveLayout.
    }, [setNodes]);

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

        // Determine Node Behavior based on type
        let node_behavior: NodeBehavior = 'LEAF';
        if (type === 'canvas') node_behavior = 'PORTAL';
        else if (type === 'category' || type === 'general' || type === 'folder') node_behavior = 'GROUP';

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
            node_behavior,
            // 🔥 [UX Fix] 초기 생성 크기 명시 (작게 생성되는 문제 해결)
            width: type === 'canvas' ? 420 : 320,
            height: type === 'canvas' ? 250 : 140
        };

        console.log('🖱️ [HistoryEngine] Node Drop Detected:', {
            type,
            title: draggedResource.title,
            initialWidth: newNodeData.width,
            initialHeight: newNodeData.height
        });

        // 타입별 연동 필드 설정
        if (type === 'video') newNodeData.linked_video_id = draggedResource.id;
        if (type === 'playlist') newNodeData.linked_playlist_id = draggedResource.id;
        if (type === 'document') newNodeData.linked_document_id = draggedResource.id;
        if (type === 'general' || type === 'category' || type === 'folder') {
            if (draggedResource.source === 'resource') {
                newNodeData.linked_document_id = draggedResource.id;
            } else {
                newNodeData.linked_category_id = draggedResource.id;
            }
        }
        if (type === 'person') newNodeData.linked_document_id = draggedResource.id;
        if (type === 'canvas') newNodeData.linked_category_id = draggedResource.id;

        try {
            console.log('📡 [HistoryEngine] Requesting Node Insertion:', newNodeData);

            // 1. Insert Parent Node
            const { data: parentData, error } = await supabase.from('history_nodes').insert(newNodeData).select(HISTORY_NODE_SELECT).single();
            if (error) throw error;

            const updatedParent = mapDbNodeToRFNode(parentData, {
                onNavigate: handleNavigate,
                onSelectionChange: (sid: string, selected: boolean) => {
                    setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                },
                onResizeStop: handleResizeStop
            }, isEditMode);
            allNodesRef.current.set(updatedParent.id, updatedParent);

            // 🔥 [Folder Expansion] If it's a folder, populate children
            if (node_behavior === 'GROUP' && draggedResource.id) {
                console.log('📂 [HistoryEngine] Folder Drop Detected. Expanding children for:', draggedResource.id);

                // Fetch Resources (Videos, Docs, Playlists)
                const { data: resources } = await supabase
                    .from('learning_resources')
                    .select('*')
                    .eq('category_id', draggedResource.id)
                    .order('order_index', { ascending: true });

                // Fetch Sub-categories (Folders)
                const { data: categories } = await supabase
                    .from('learning_categories')
                    .select('*')
                    .eq('parent_id', draggedResource.id)
                    .order('order_index', { ascending: true });

                const allChildren = [
                    ...(categories || []).map(c => ({ ...c, itemType: 'general', linkedId: c.id })),
                    ...(resources || []).map(r => ({ ...r, itemType: r.type, linkedId: r.id, source: 'resource' }))
                ].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));

                if (allChildren.length > 0) {
                    console.log(`📂 Found ${allChildren.length} items to expand.`);

                    // Layout Constants
                    const COLS = 2; // Fixed 2 columns for neatness inside folder
                    const GAP = 50;
                    const ITEM_W = 320;
                    const ITEM_H = 160;
                    const PADDING_X = 40;
                    const PADDING_Y = 120; // Header Buffer

                    const insertPromises = allChildren.map(async (child, idx) => {
                        const col = idx % COLS;
                        const row = Math.floor(idx / COLS);
                        const relX = PADDING_X + col * (ITEM_W + GAP);
                        const relY = PADDING_Y + row * (ITEM_H + GAP);

                        const isResourceFolder = child.source === 'resource' && (child.itemType === 'general' || child.itemType === 'folder' || child.itemType === 'category');

                        const childData: any = {
                            title: null, // Linked content
                            description: null,
                            category: child.itemType || 'general',
                            year: child.year || new Date().getFullYear(),
                            position_x: relX,
                            position_y: relY,
                            width: ITEM_W,
                            height: ITEM_H,
                            created_by: userId,
                            space_id: currentSpaceId,
                            parent_node_id: parentData.id, // Link to new parent
                            node_behavior: (child.itemType === 'general' || child.itemType === 'folder') ? 'GROUP' : 'LEAF',
                            // Link Fields
                            linked_video_id: child.itemType === 'video' ? child.linkedId : null,
                            linked_playlist_id: child.itemType === 'playlist' ? child.linkedId : null,
                            linked_document_id: (child.itemType === 'document' || child.itemType === 'person' || isResourceFolder) ? child.linkedId : null,
                            linked_category_id: (!isResourceFolder && (child.itemType === 'general' || child.itemType === 'folder')) ? child.linkedId : null
                        };

                        return supabase.from('history_nodes').insert(childData).select(HISTORY_NODE_SELECT).single();
                    });

                    // Wait for all inserts
                    const results = await Promise.all(insertPromises);
                    const validEncodedNodes = results
                        .filter(r => !r.error && r.data)
                        .map(r => mapDbNodeToRFNode(r.data, {
                            onNavigate: handleNavigate,
                            onSelectionChange: (sid: string, selected: boolean) => {
                                setNodes(nds => nds.map(node => node.id === sid ? { ...node, selected } : node));
                            },
                            onResizeStop: handleResizeStop
                        }, isEditMode));

                    // Add children to Ref
                    validEncodedNodes.forEach(n => allNodesRef.current.set(n.id, n));

                    // 🔥 Resize Parent to fit
                    const rows = Math.ceil(allChildren.length / COLS);
                    const newWidth = Math.max(421, PADDING_X * 2 + (ITEM_W * COLS) + (GAP * (COLS - 1)));
                    const newHeight = Math.max(200, PADDING_Y + (rows * (ITEM_H + GAP)) + 50);

                    // Update local ref
                    updatedParent.width = newWidth;
                    updatedParent.height = newHeight;
                    updatedParent.style = { ...updatedParent.style, width: newWidth, height: newHeight };
                    allNodesRef.current.set(updatedParent.id, updatedParent);

                    // Update DB for parent size
                    await supabase.from('history_nodes').update({ width: newWidth, height: newHeight }).eq('id', parentData.id);
                }
            }

            syncVisualization(currentRootId);
        } catch (err) {
            console.error('🚨 [HistoryEngine] Drop Processing Failed:', err);
        }
    }, [userId, currentSpaceId, currentRootId, syncVisualization, handleNavigate, isEditMode]);

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
