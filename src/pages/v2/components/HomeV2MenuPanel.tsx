import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useModalContext } from "../../../contexts/ModalContext";
import {
    loadDefaultHomeMenuLayoutSettings,
    loadUserHomeMenuLayoutSettings,
    saveHomeMenuLayoutSettings,
    type HomeMenuLayoutSettings,
} from "../../../hooks/useHomeMenuLayoutSettings";
import {
    isTempoToolItemHidden,
    useTempoToolVisibilitySettings,
} from "../../../hooks/useTempoToolVisibilitySettings";
import { trackActivitySuccess } from "../../../utils/analyticsEvents";
import "./HomeV2MenuPanel.css";

type HomeMenuItem = {
    id: string;
    label: string;
    shortLabel?: string;
    icon: string;
    auxIcon?: string;
    theme: string;
    to?: string;
    action?: string;
    status?: string;
    adminOnly?: boolean;
};

const HOME_MENU_ITEMS: HomeMenuItem[] = [
    { id: "home", label: "홈", icon: "ri-home-5-line", theme: "home", to: "/" },
    { id: "calendar", label: "캘린더", icon: "ri-calendar-event-line", theme: "calendar", to: "/calendar?view=calendar&scrollToToday=true" },
    { id: "events", label: "강습&행사", icon: "ri-ticket-2-line", auxIcon: "ri-book-open-line", theme: "events", to: "/events" },
    { id: "board", label: "자유게시판", icon: "ri-chat-3-line", theme: "board", to: "/board" },
    { id: "places", label: "map", icon: "ri-map-pin-2-line", theme: "places", to: "/places" },
    { id: "forum-media", label: "SNS 아카이브", icon: "ri-movie-2-line", theme: "media", to: "/forum/media" },
    { id: "forum-library", label: "라이브러리", icon: "ri-book-open-line", theme: "library", to: "/board?category=history" },
    { id: "forum-links", label: "사이트 모음", icon: "ri-earth-line", theme: "links", to: "/links" },
    { id: "bpm-tapper", label: "BPM 측정기", icon: "ri-pulse-line", theme: "bpm", to: "/bpm-tapper" },
    { id: "metronome", label: "메트로놈", icon: "ri-timer-flash-line", theme: "metronome", to: "/metronome" },
    { id: "tempo-tool", label: "BPM 측정기/메트로놈", shortLabel: "BPM/메트로놈", icon: "ri-speed-up-line", theme: "tempo", to: "/tempo-tool" },
    { id: "shopping", label: "쇼핑", icon: "ri-shopping-bag-3-line", theme: "shopping", to: "/shopping" },
    { id: "guide", label: "안내", icon: "ri-compass-3-line", theme: "guide", to: "/guide" },
    { id: "home-menu-hub-test", label: "메뉴 허브", icon: "ri-layout-grid-line", theme: "menu-hub", to: "/test/home-menu-hub", adminOnly: true },
];

const PINNED_MENU_LIMIT = 5;
const DEFAULT_PINNED_MENU_IDS: string[] = ["tempo-tool"];
const HIDEABLE_MENU_ITEM_IDS = new Set(
    HOME_MENU_ITEMS
        .filter((item) => item.id !== "home")
        .map((item) => item.id),
);

const isLocalPreviewHost = () => {
    if (typeof window === "undefined") return false;
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};

const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MAX_DURATION_MS = 800;
const HOME_SCREEN_GESTURE_START_RATIO = 0.5;
const TAP_MAX_DISTANCE = 24;
const TAP_MAX_DURATION_MS = 700;
const SYNTHETIC_CLICK_SUPPRESS_MS = 700;
const MENU_ACTION_ANIMATION_MS = 130;
const SYSTEM_GESTURE_EDGE_GUARD_PX = 80;
const MEDIA_PLAYER_BOTTOM_NAV_EVENT = "swingenjoy:media-player-bottom-nav";

type MediaPlayerBottomNavEventDetail = {
    id?: string;
    active?: boolean;
};

type GestureStart = {
    x: number;
    y: number;
    time: number;
    scrollTop: number;
};

type PressStart = {
    key: string;
    x: number;
    y: number;
    time: number;
};

type PinnedDragStart = {
    id: string;
    x: number;
    y: number;
    isDragging: boolean;
    rect: {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    pointerOffsetX: number;
    pointerOffsetY: number;
};

type PinnedDragOverlay = {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    pointerOffsetX: number;
    pointerOffsetY: number;
};

type EditDropTarget =
    | { type: "item"; id: string; placement: "before" | "after" }
    | { type: "slot"; index: number };

type ExpandedMenuCell =
    | { type: "item"; item: HomeMenuItem; pinnedIndex: number }
    | { type: "slot"; index: number };

const getMenuItemKey = (item: HomeMenuItem) => item.id || item.to || item.action || item.label;

const getEditDropTargetKey = (target: EditDropTarget | null) => {
    if (!target) return null;
    if (target.type === "slot") return `slot:${target.index}`;
    return `item:${target.id}:${target.placement}`;
};

const getDefaultUnpinnedMenuIds = (pinnedIds: string[], menuItems: HomeMenuItem[] = HOME_MENU_ITEMS) => {
    const pinnedIdSet = new Set(pinnedIds);
    return menuItems
        .map(getMenuItemKey)
        .filter((id) => !pinnedIdSet.has(id));
};

const sanitizeMenuOrderIds = (
    ids: unknown,
    menuItems: HomeMenuItem[] = HOME_MENU_ITEMS,
): string[] => {
    const defaultIds = menuItems.map(getMenuItemKey);
    if (!Array.isArray(ids)) return defaultIds;

    const validIds = new Set(defaultIds);
    const cleanIds: string[] = [];

    ids.forEach((id) => {
        if (typeof id !== "string") return;
        if (!validIds.has(id) || cleanIds.includes(id)) return;
        cleanIds.push(id);
    });

    const cleanIdSet = new Set(cleanIds);
    return [...cleanIds, ...defaultIds.filter((id) => !cleanIdSet.has(id))];
};

const sanitizeUnpinnedMenuIds = (
    ids: unknown,
    pinnedIds: string[],
    menuItems: HomeMenuItem[] = HOME_MENU_ITEMS,
): string[] => {
    const pinnedIdSet = new Set(pinnedIds);
    return sanitizeMenuOrderIds(ids, menuItems).filter((id) => !pinnedIdSet.has(id));
};

const moveEditMenuItem = (
    pinnedIds: string[],
    unpinnedIds: string[],
    activeId: string,
    target: EditDropTarget,
) => {
    const activeWasPinned = pinnedIds.includes(activeId);
    const nextPinnedIds = pinnedIds.filter((id) => id !== activeId);
    const nextUnpinnedIds = unpinnedIds.filter((id) => id !== activeId);

    if (target.type === "slot") {
        const insertIndex = Math.min(Math.max(0, target.index), nextPinnedIds.length);
        nextPinnedIds.splice(insertIndex, 0, activeId);
    } else {
        const pinnedTargetIndex = nextPinnedIds.indexOf(target.id);
        if (pinnedTargetIndex >= 0) {
            const requestedIndex = pinnedTargetIndex + (target.placement === "after" ? 1 : 0);
            const maxInsertIndex = !activeWasPinned && nextPinnedIds.length >= PINNED_MENU_LIMIT
                ? PINNED_MENU_LIMIT - 1
                : nextPinnedIds.length;
            const insertIndex = Math.min(Math.max(0, requestedIndex), maxInsertIndex);
            nextPinnedIds.splice(insertIndex, 0, activeId);
        } else {
            const unpinnedTargetIndex = nextUnpinnedIds.indexOf(target.id);
            const requestedIndex = unpinnedTargetIndex >= 0
                ? unpinnedTargetIndex + (target.placement === "after" ? 1 : 0)
                : nextUnpinnedIds.length;
            const insertIndex = Math.min(Math.max(0, requestedIndex), nextUnpinnedIds.length);
            nextUnpinnedIds.splice(insertIndex, 0, activeId);
        }
    }

    if (nextPinnedIds.length > PINNED_MENU_LIMIT) {
        nextUnpinnedIds.unshift(...nextPinnedIds.splice(PINNED_MENU_LIMIT));
    }

    return {
        pinnedIds: nextPinnedIds,
        unpinnedIds: nextUnpinnedIds,
    };
};

const sanitizePinnedMenuIds = (
    ids: unknown,
    menuItems: HomeMenuItem[] = HOME_MENU_ITEMS,
    fallbackIds: string[] = DEFAULT_PINNED_MENU_IDS,
): string[] => {
    if (!Array.isArray(ids)) return [...fallbackIds];

    const validIds = new Set(menuItems.map(getMenuItemKey));
    const cleanIds = ids
        .filter((id): id is string => typeof id === "string" && validIds.has(id))
        .filter((id, index, list) => list.indexOf(id) === index)
        .slice(0, PINNED_MENU_LIMIT);

    return cleanIds.length > 0 ? cleanIds : [...fallbackIds];
};

const getInitialPinnedMenuIds = () => [...DEFAULT_PINNED_MENU_IDS];

const getInitialMenuOrderIds = () => sanitizeMenuOrderIds(HOME_MENU_ITEMS.map(getMenuItemKey));

export const HomeV2MenuPanel: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const { user, isAdmin } = useAuth();
    const { openModal, closeModal, modalStack } = useModalContext();
    const {
        settings: tempoToolVisibilitySettings,
        isLoading: isTempoToolVisibilityLoading,
        saveSettings: saveTempoToolVisibilitySettings,
    } = useTempoToolVisibilitySettings();
    const [isExpanded, setIsExpanded] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [pressedMenuKey, setPressedMenuKey] = useState<string | null>(null);
    const [pinnedMenuIds, setPinnedMenuIds] = useState<string[]>(getInitialPinnedMenuIds);
    const [menuOrderIds, setMenuOrderIds] = useState<string[]>(getInitialMenuOrderIds);
    const [draggingPinnedId, setDraggingPinnedId] = useState<string | null>(null);
    const [dragTargetPinnedId, setDragTargetPinnedId] = useState<string | null>(null);
    const [editPinnedMenuIds, setEditPinnedMenuIds] = useState<string[]>([]);
    const [editUnpinnedMenuIds, setEditUnpinnedMenuIds] = useState<string[]>([]);
    const [pinnedDragOverlay, setPinnedDragOverlay] = useState<PinnedDragOverlay | null>(null);
    const [isSavingTempoToolVisibility, setIsSavingTempoToolVisibility] = useState(false);
    const [isLoadingMenuLayout, setIsLoadingMenuLayout] = useState(false);
    const [isSavingMenuLayout, setIsSavingMenuLayout] = useState(false);
    const [isMediaPlayerEngaged, setIsMediaPlayerEngaged] = useState(false);
    const panelPointerGestureStartRef = useRef<GestureStart | null>(null);
    const panelTouchGestureStartRef = useRef<GestureStart | null>(null);
    const menuPressStartRef = useRef<PressStart | null>(null);
    const pinnedDragStartRef = useRef<PinnedDragStart | null>(null);
    const lastDragTargetIdRef = useRef<string | null>(null);
    const mediaPlayerEngagedIdsRef = useRef<Set<string>>(new Set());
    const pinnedMenuIdsRef = useRef(pinnedMenuIds);
    const menuOrderIdsRef = useRef(menuOrderIds);
    const editPinnedMenuIdsRef = useRef(editPinnedMenuIds);
    const editUnpinnedMenuIdsRef = useRef(editUnpinnedMenuIds);
    const suppressSyntheticClickUntilRef = useRef(0);
    const menuActionTimerRef = useRef<number | null>(null);
    const isHomeRoute = location.pathname === "/" || location.pathname === "/v2";
    const visibleHomeMenuItems = useMemo(() => {
        return HOME_MENU_ITEMS.filter((item) => {
            if (item.adminOnly && !isAdmin && !isLocalPreviewHost()) return false;
            if (isAdmin) return true;
            if (isTempoToolVisibilityLoading && HIDEABLE_MENU_ITEM_IDS.has(item.id)) return false;
            return !isTempoToolItemHidden(tempoToolVisibilitySettings, item.id);
        });
    }, [isAdmin, isTempoToolVisibilityLoading, tempoToolVisibilitySettings]);
    const visibleDefaultPinnedMenuIds = useMemo(() => {
        const visibleMenuItemIds = new Set(visibleHomeMenuItems.map(getMenuItemKey));
        return DEFAULT_PINNED_MENU_IDS.filter((id) => visibleMenuItemIds.has(id));
    }, [visibleHomeMenuItems]);
    const menuItemById = useMemo(() => {
        return new Map(visibleHomeMenuItems.map((item) => [getMenuItemKey(item), item]));
    }, [visibleHomeMenuItems]);
    const pinnedMenuItems = useMemo(() => {
        return pinnedMenuIds
            .map((id) => menuItemById.get(id))
            .filter((item): item is HomeMenuItem => Boolean(item));
    }, [menuItemById, pinnedMenuIds]);
    const quickMenuItems = useMemo(() => {
        return pinnedMenuItems.slice(0, PINNED_MENU_LIMIT);
    }, [pinnedMenuItems]);
    const orderedMenuItems = useMemo(() => {
        if (isEditMode) {
            return [...editPinnedMenuIds, ...editUnpinnedMenuIds]
                .map((id) => menuItemById.get(id))
                .filter((item): item is HomeMenuItem => Boolean(item));
        }

        const pinnedIdSet = new Set(pinnedMenuIds);
        const unpinnedMenuItems = sanitizeMenuOrderIds(menuOrderIds, visibleHomeMenuItems)
            .filter((id) => !pinnedIdSet.has(id))
            .map((id) => menuItemById.get(id))
            .filter((item): item is HomeMenuItem => Boolean(item));

        return [...pinnedMenuItems, ...unpinnedMenuItems];
    }, [editPinnedMenuIds, editUnpinnedMenuIds, isEditMode, menuItemById, menuOrderIds, pinnedMenuIds, pinnedMenuItems, visibleHomeMenuItems]);
    const expandedMenuCells = useMemo<ExpandedMenuCell[]>(() => {
        if (!isEditMode) {
            return orderedMenuItems.map((item) => ({
                type: "item",
                item,
                pinnedIndex: pinnedMenuIds.indexOf(getMenuItemKey(item)),
            }));
        }

        const pinnedCells: ExpandedMenuCell[] = Array.from({ length: PINNED_MENU_LIMIT }, (_, index) => {
            const itemId = editPinnedMenuIds[index];
            const item = itemId ? menuItemById.get(itemId) : null;

            if (item) {
                return {
                    type: "item",
                    item,
                    pinnedIndex: index,
                };
            }

            return {
                type: "slot",
                index,
            };
        });

        const unpinnedCells = editUnpinnedMenuIds
            .map((id) => menuItemById.get(id))
            .filter((item): item is HomeMenuItem => Boolean(item))
            .map((item) => ({
                type: "item" as const,
                item,
                pinnedIndex: -1,
            }));

        return [...pinnedCells, ...unpinnedCells];
    }, [editPinnedMenuIds, editUnpinnedMenuIds, isEditMode, menuItemById, orderedMenuItems, pinnedMenuIds]);

    const openMenu = useCallback(() => {
        setIsExpanded(true);
    }, []);

    const closeMenu = useCallback(() => {
        setIsExpanded(false);
    }, []);

    const resetPanelPointerGesture = useCallback(() => {
        panelPointerGestureStartRef.current = null;
    }, []);

    const resetPanelTouchGesture = useCallback(() => {
        panelTouchGestureStartRef.current = null;
    }, []);

    const isModalGestureBlocked = useCallback(() => {
        return modalStack.length > 0;
    }, [modalStack.length]);

    const shouldSuppressSyntheticClick = useCallback(() => {
        return Date.now() < suppressSyntheticClickUntilRef.current;
    }, []);

    const rememberMenuPressStart = useCallback((key: string, x: number, y: number) => {
        menuPressStartRef.current = {
            key,
            x,
            y,
            time: Date.now(),
        };
        setPressedMenuKey(key);
    }, []);

    const clearMenuPressIfMoved = useCallback((x: number, y: number) => {
        const start = menuPressStartRef.current;
        if (!start) return;

        if (Math.hypot(x - start.x, y - start.y) > TAP_MAX_DISTANCE) {
            menuPressStartRef.current = null;
            setPressedMenuKey(null);
            suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_CLICK_SUPPRESS_MS;
        }
    }, []);

    const runMenuActionWithFeedback = useCallback((key: string, action: () => void) => {
        if (menuActionTimerRef.current !== null) {
            window.clearTimeout(menuActionTimerRef.current);
        }

        setPressedMenuKey(key);
        menuActionTimerRef.current = window.setTimeout(() => {
            menuActionTimerRef.current = null;
            setPressedMenuKey((currentKey) => currentKey === key ? null : currentKey);
            action();
        }, MENU_ACTION_ANIMATION_MS);
    }, []);

    const consumeMenuTouchTap = useCallback((
        event: React.TouchEvent<HTMLElement>,
        key: string,
        onTap: () => void,
    ) => {
        const start = menuPressStartRef.current;
        menuPressStartRef.current = null;

        if (!start || start.key !== key || event.changedTouches.length === 0) {
            setPressedMenuKey(null);
            return false;
        }

        const touch = event.changedTouches[0];
        const distance = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
        const elapsed = Date.now() - start.time;
        const isTap = distance <= TAP_MAX_DISTANCE && elapsed <= TAP_MAX_DURATION_MS;

        if (!isTap) {
            setPressedMenuKey(null);
            suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_CLICK_SUPPRESS_MS;
            return false;
        }

        event.preventDefault();
        event.stopPropagation();
        suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_CLICK_SUPPRESS_MS;
        onTap();
        return true;
    }, []);

    const isSystemGestureEdgeStart = useCallback((clientY: number) => {
        return clientY >= window.innerHeight - SYSTEM_GESTURE_EDGE_GUARD_PX;
    }, []);

    const isSwipeUp = useCallback((start: GestureStart, x: number, y: number) => {
        const deltaY = y - start.y;
        const absX = Math.abs(x - start.x);
        const absY = Math.abs(deltaY);
        const elapsed = Date.now() - start.time;

        return (
            deltaY <= -SWIPE_MIN_DISTANCE &&
            absY > absX * 1.15 &&
            elapsed <= SWIPE_MAX_DURATION_MS
        );
    }, []);

    const isSwipeDown = useCallback((start: GestureStart, x: number, y: number) => {
        const deltaY = y - start.y;
        const absX = Math.abs(x - start.x);
        const absY = Math.abs(deltaY);
        const elapsed = Date.now() - start.time;

        return (
            deltaY >= SWIPE_MIN_DISTANCE &&
            absY > absX * 1.15 &&
            elapsed <= SWIPE_MAX_DURATION_MS
        );
    }, []);

    const handleNavigate = (to: string) => {
        setIsExpanded(false);
        if (to.startsWith("/calendar")) {
            navigate(`${to}&nav=${Date.now()}`);
            return;
        }
        navigate(to);
    };

    const isMenuItemActive = (item: HomeMenuItem) => {
        if (!item.to) return false;
        const path = item.to.split("?")[0];
        if (path === "/") return location.pathname === "/" || location.pathname === "/v2";
        if (item.id === "forum-library") {
            return location.pathname === "/board" && new URLSearchParams(location.search).get("category") === "history";
        }
        if (item.id === "board" && location.pathname === "/board") {
            return new URLSearchParams(location.search).get("category") !== "history";
        }
        return location.pathname === path;
    };

    const trackHomeMenuAppClick = (item: HomeMenuItem) => {
        trackActivitySuccess({
            id: `home_menu_${item.id}`,
            type: "nav_item",
            title: item.label,
            section: "bottom_menu_apps",
            category: "bottom_app",
            userId: user?.id,
            isAdmin,
        });
    };

    const handleMenuItemClick = (item: HomeMenuItem) => {
        trackHomeMenuAppClick(item);
        if (item.to) handleNavigate(item.to);
    };

    const normalizeVisibleHomeMenuLayout = useCallback((settings?: HomeMenuLayoutSettings | null): HomeMenuLayoutSettings => {
        const fallbackPinnedIds = sanitizePinnedMenuIds(
            visibleDefaultPinnedMenuIds,
            visibleHomeMenuItems,
            visibleDefaultPinnedMenuIds,
        );
        const fallbackMenuOrderIds = sanitizeMenuOrderIds(
            [...fallbackPinnedIds, ...getDefaultUnpinnedMenuIds(fallbackPinnedIds, visibleHomeMenuItems)],
            visibleHomeMenuItems,
        );
        const source = settings || {
            pinnedMenuIds: fallbackPinnedIds,
            menuOrderIds: fallbackMenuOrderIds,
        };
        const cleanPinnedIds = sanitizePinnedMenuIds(
            source.pinnedMenuIds,
            visibleHomeMenuItems,
            fallbackPinnedIds,
        );
        const cleanMenuOrderIds = sanitizeMenuOrderIds(
            source.menuOrderIds.length > 0 ? source.menuOrderIds : fallbackMenuOrderIds,
            visibleHomeMenuItems,
        );
        const cleanUnpinnedIds = sanitizeUnpinnedMenuIds(
            cleanMenuOrderIds,
            cleanPinnedIds,
            visibleHomeMenuItems,
        );

        return {
            pinnedMenuIds: cleanPinnedIds,
            menuOrderIds: sanitizeMenuOrderIds([...cleanPinnedIds, ...cleanUnpinnedIds], visibleHomeMenuItems),
        };
    }, [visibleDefaultPinnedMenuIds, visibleHomeMenuItems]);

    const applyHomeMenuLayout = useCallback((settings?: HomeMenuLayoutSettings | null) => {
        const normalizedSettings = normalizeVisibleHomeMenuLayout(settings);
        const cleanUnpinnedIds = sanitizeUnpinnedMenuIds(
            normalizedSettings.menuOrderIds,
            normalizedSettings.pinnedMenuIds,
            visibleHomeMenuItems,
        );

        pinnedMenuIdsRef.current = normalizedSettings.pinnedMenuIds;
        menuOrderIdsRef.current = normalizedSettings.menuOrderIds;
        editPinnedMenuIdsRef.current = normalizedSettings.pinnedMenuIds;
        editUnpinnedMenuIdsRef.current = cleanUnpinnedIds;

        setPinnedMenuIds(normalizedSettings.pinnedMenuIds);
        setMenuOrderIds(normalizedSettings.menuOrderIds);
        setEditPinnedMenuIds(normalizedSettings.pinnedMenuIds);
        setEditUnpinnedMenuIds(cleanUnpinnedIds);
        return normalizedSettings;
    }, [normalizeVisibleHomeMenuLayout, visibleHomeMenuItems]);

    const persistMenuLayout = useCallback(async (settings: HomeMenuLayoutSettings) => {
        if (!user?.id) return;

        const normalizedSettings = normalizeVisibleHomeMenuLayout(settings);
        setIsSavingMenuLayout(true);
        try {
            await saveHomeMenuLayoutSettings(normalizedSettings, {
                userId: user.id,
                isAdmin,
            });
        } catch (error) {
            console.error("[HomeV2MenuPanel] Failed to save home menu layout:", error);
            alert("메뉴 설정 저장에 실패했습니다.");
        } finally {
            setIsSavingMenuLayout(false);
        }
    }, [isAdmin, normalizeVisibleHomeMenuLayout, user?.id]);

    const openMenuSettingsLogin = useCallback(() => {
        openModal("login", {
            message: "바텀 메뉴 설정은 로그인 후 이용 가능합니다.",
        });
    }, [openModal]);

    const resetPinnedDrag = useCallback(() => {
        pinnedDragStartRef.current = null;
        lastDragTargetIdRef.current = null;
        setDraggingPinnedId(null);
        setDragTargetPinnedId(null);
        setPinnedDragOverlay(null);
    }, []);

    const startEditMode = useCallback(() => {
        const cleanPinnedIds = sanitizePinnedMenuIds(pinnedMenuIds, visibleHomeMenuItems, visibleDefaultPinnedMenuIds);
        const cleanMenuOrderIds = sanitizeMenuOrderIds(menuOrderIds, visibleHomeMenuItems);
        const cleanUnpinnedIds = sanitizeUnpinnedMenuIds(cleanMenuOrderIds, cleanPinnedIds, visibleHomeMenuItems);
        editPinnedMenuIdsRef.current = cleanPinnedIds;
        editUnpinnedMenuIdsRef.current = cleanUnpinnedIds;
        menuOrderIdsRef.current = cleanMenuOrderIds;
        setEditPinnedMenuIds(cleanPinnedIds);
        setEditUnpinnedMenuIds(cleanUnpinnedIds);
        setMenuOrderIds(cleanMenuOrderIds);
        setIsEditMode(true);
        resetPinnedDrag();
    }, [menuOrderIds, pinnedMenuIds, resetPinnedDrag, visibleDefaultPinnedMenuIds, visibleHomeMenuItems]);

    const finishEditMode = useCallback(() => {
        const cleanPinnedIds = sanitizePinnedMenuIds(editPinnedMenuIds, visibleHomeMenuItems, visibleDefaultPinnedMenuIds);
        const cleanUnpinnedIds = sanitizeUnpinnedMenuIds(editUnpinnedMenuIds, cleanPinnedIds, visibleHomeMenuItems);
        const nextMenuOrderIds = sanitizeMenuOrderIds([...cleanPinnedIds, ...cleanUnpinnedIds], visibleHomeMenuItems);
        editPinnedMenuIdsRef.current = cleanPinnedIds;
        editUnpinnedMenuIdsRef.current = cleanUnpinnedIds;
        menuOrderIdsRef.current = nextMenuOrderIds;
        setPinnedMenuIds(cleanPinnedIds);
        setMenuOrderIds(nextMenuOrderIds);
        setEditPinnedMenuIds(cleanPinnedIds);
        setEditUnpinnedMenuIds(cleanUnpinnedIds);
        setIsEditMode(false);
        resetPinnedDrag();
        void persistMenuLayout({
            pinnedMenuIds: cleanPinnedIds,
            menuOrderIds: nextMenuOrderIds,
        });
    }, [editPinnedMenuIds, editUnpinnedMenuIds, persistMenuLayout, resetPinnedDrag, visibleDefaultPinnedMenuIds, visibleHomeMenuItems]);

    const toggleEditMode = useCallback(() => {
        if (isLoadingMenuLayout || isSavingMenuLayout) return;

        if (isEditMode) {
            finishEditMode();
            return;
        }

        if (!user?.id) {
            openMenuSettingsLogin();
            return;
        }

        startEditMode();
    }, [
        finishEditMode,
        isEditMode,
        isLoadingMenuLayout,
        isSavingMenuLayout,
        openMenuSettingsLogin,
        startEditMode,
        user?.id,
    ]);

    const resetPinnedMenu = useCallback(() => {
        const cleanPinnedIds = [...visibleDefaultPinnedMenuIds];
        const cleanUnpinnedIds = getDefaultUnpinnedMenuIds(cleanPinnedIds, visibleHomeMenuItems);
        const nextMenuOrderIds = sanitizeMenuOrderIds([...cleanPinnedIds, ...cleanUnpinnedIds], visibleHomeMenuItems);
        editPinnedMenuIdsRef.current = cleanPinnedIds;
        editUnpinnedMenuIdsRef.current = cleanUnpinnedIds;
        menuOrderIdsRef.current = nextMenuOrderIds;
        setPinnedMenuIds(cleanPinnedIds);
        setMenuOrderIds(nextMenuOrderIds);
        setEditPinnedMenuIds(cleanPinnedIds);
        setEditUnpinnedMenuIds(cleanUnpinnedIds);
        void persistMenuLayout({
            pinnedMenuIds: cleanPinnedIds,
            menuOrderIds: nextMenuOrderIds,
        });
    }, [persistMenuLayout, visibleDefaultPinnedMenuIds, visibleHomeMenuItems]);

    const toggleMenuItemVisibility = useCallback(async (itemId: string) => {
        if (!isAdmin || isSavingTempoToolVisibility) return;

        const currentlyHidden = isTempoToolItemHidden(tempoToolVisibilitySettings, itemId);
        const nextHiddenItemIds = new Set(tempoToolVisibilitySettings.hiddenItemIds);
        if (currentlyHidden) {
            nextHiddenItemIds.delete(itemId);
        } else {
            nextHiddenItemIds.add(itemId);
        }

        setIsSavingTempoToolVisibility(true);
        try {
            await saveTempoToolVisibilitySettings({
                hidden: itemId === "tempo-tool" ? !currentlyHidden : tempoToolVisibilitySettings.hidden,
                hiddenItemIds: Array.from(nextHiddenItemIds),
            });
        } catch (error) {
            console.error("[HomeV2MenuPanel] Failed to save menu visibility settings:", error);
            alert("숨김 설정 저장에 실패했습니다.");
        } finally {
            setIsSavingTempoToolVisibility(false);
        }
    }, [
        isAdmin,
        isSavingTempoToolVisibility,
        saveTempoToolVisibilitySettings,
        tempoToolVisibilitySettings,
    ]);

    const getMenuItemStatus = useCallback((item: HomeMenuItem) => {
        if (isAdmin && isTempoToolItemHidden(tempoToolVisibilitySettings, item.id)) return "숨김";
        return item.status;
    }, [isAdmin, tempoToolVisibilitySettings]);

    const getMenuItemStatusClassName = useCallback((item: HomeMenuItem) => (
        `home-v2-menu-status-badge ${isTempoToolItemHidden(tempoToolVisibilitySettings, item.id) ? "is-hidden" : ""}`.trim()
    ), [tempoToolVisibilitySettings]);

    const getMenuItemVisibilityLabel = useCallback((item: HomeMenuItem, hidden: boolean) => (
        hidden ? `${item.label} 공개` : `${item.label} 숨김`
    ), []);

    const getMenuItemVisibilityIcon = useCallback((hidden: boolean) => (
        hidden ? "ri-eye-line" : "ri-eye-off-line"
    ), []);

    const handleMenuItemVisibilityClick = useCallback((event: React.MouseEvent, itemId: string) => {
        event.preventDefault();
        event.stopPropagation();
        void toggleMenuItemVisibility(itemId);
    }, [toggleMenuItemVisibility]);

    const stopMenuItemVisibilityDrag = useCallback((event: React.SyntheticEvent) => {
        event.stopPropagation();
    }, []);

    const getEditDropTarget = useCallback((clientX: number, clientY: number): EditDropTarget | null => {
        if (typeof document === "undefined") return null;

        const getItemTarget = (element: HTMLElement | null): EditDropTarget | null => {
            const itemId = element?.dataset.menuEditId;
            if (!element || !itemId) return null;

            const rect = element.getBoundingClientRect();
            return {
                type: "item",
                id: itemId,
                placement: clientX > rect.left + rect.width / 2 ? "after" : "before",
            };
        };

        const targetElement = document.elementFromPoint(clientX, clientY);
        const slotElement = targetElement?.closest<HTMLElement>("[data-edit-slot-index]");
        if (slotElement?.dataset.editSlotIndex) {
            return {
                type: "slot",
                index: Number(slotElement.dataset.editSlotIndex),
            };
        }

        const itemElement = targetElement?.closest<HTMLElement>("[data-menu-edit-id]");
        const itemTarget = getItemTarget(itemElement ?? null);
        if (itemTarget) return itemTarget;

        const gridElement = targetElement?.closest<HTMLElement>(".home-v2-menu-grid");
        if (!gridElement) return null;

        const nearestItem = Array.from(gridElement.querySelectorAll<HTMLElement>("[data-menu-edit-id]"))
            .reduce<{ element: HTMLElement | null; distance: number }>((nearest, element) => {
                const rect = element.getBoundingClientRect();
                const distanceX = clientX < rect.left
                    ? rect.left - clientX
                    : clientX > rect.right
                        ? clientX - rect.right
                        : 0;
                const distanceY = clientY < rect.top
                    ? rect.top - clientY
                    : clientY > rect.bottom
                        ? clientY - rect.bottom
                        : 0;
                const distance = Math.hypot(distanceX, distanceY);

                return distance < nearest.distance
                    ? { element, distance }
                    : nearest;
            }, { element: null, distance: Number.POSITIVE_INFINITY });

        if (!nearestItem.element || nearestItem.distance > 28) return null;
        return getItemTarget(nearestItem.element);
    }, []);

    const captureMenuItemRects = useCallback((activeId: string) => {
        const rects = new Map<string, { left: number; top: number }>();
        if (typeof document === "undefined") return rects;

        document.querySelectorAll<HTMLElement>(".home-v2-menu-item[data-menu-item-id]").forEach((element) => {
            const itemId = element.dataset.menuItemId;
            if (!itemId || itemId === activeId) return;

            const rect = element.getBoundingClientRect();
            rects.set(itemId, {
                left: rect.left,
                top: rect.top,
            });
        });

        return rects;
    }, []);

    const animateMenuItemLayout = useCallback((previousRects: Map<string, { left: number; top: number }>) => {
        if (typeof document === "undefined") return;

        requestAnimationFrame(() => {
            document.querySelectorAll<HTMLElement>(".home-v2-menu-item[data-menu-item-id]").forEach((element) => {
                const itemId = element.dataset.menuItemId;
                if (!itemId) return;

                const previousRect = previousRects.get(itemId);
                if (!previousRect) return;

                const rect = element.getBoundingClientRect();
                const deltaX = previousRect.left - rect.left;
                const deltaY = previousRect.top - rect.top;

                if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;

                element.style.transition = "none";
                element.style.transform = `translate3d(${deltaX}px, ${deltaY}px, 0)`;
                element.style.willChange = "transform";

                requestAnimationFrame(() => {
                    element.style.transition = "transform 190ms cubic-bezier(0.2, 0.85, 0.25, 1)";
                    element.style.transform = "";

                    window.setTimeout(() => {
                        element.style.transition = "";
                        element.style.willChange = "";
                    }, 220);
                });
            });
        });
    }, []);

    const previewEditMenuReorder = useCallback((activeId: string, target: EditDropTarget) => {
        const previousRects = captureMenuItemRects(activeId);
        let didMove = false;

        flushSync(() => {
            const nextOrder = moveEditMenuItem(
                editPinnedMenuIdsRef.current,
                editUnpinnedMenuIdsRef.current,
                activeId,
                target,
            );
            didMove = (
                nextOrder.pinnedIds.join("|") !== editPinnedMenuIdsRef.current.join("|") ||
                nextOrder.unpinnedIds.join("|") !== editUnpinnedMenuIdsRef.current.join("|")
            );
            editPinnedMenuIdsRef.current = nextOrder.pinnedIds;
            editUnpinnedMenuIdsRef.current = nextOrder.unpinnedIds;

            setEditPinnedMenuIds(nextOrder.pinnedIds);
            setEditUnpinnedMenuIds(nextOrder.unpinnedIds);
        });

        if (didMove) {
            animateMenuItemLayout(previousRects);
        }
    }, [animateMenuItemLayout, captureMenuItemRects]);

    const handlePinnedPointerDown = useCallback((event: React.PointerEvent<HTMLElement>, itemId: string) => {
        if (!isEditMode) return;
        if (event.pointerType === "mouse" && event.button !== 0) return;

        event.preventDefault();
        event.stopPropagation();
        const rect = event.currentTarget.getBoundingClientRect();
        pinnedDragStartRef.current = {
            id: itemId,
            x: event.clientX,
            y: event.clientY,
            isDragging: false,
            rect: {
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
            },
            pointerOffsetX: event.clientX - rect.left,
            pointerOffsetY: event.clientY - rect.top,
        };

        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // Some embedded browsers may not allow pointer capture for synthetic events.
        }
    }, [isEditMode]);

    const handlePinnedPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (!isEditMode) return;
        const start = pinnedDragStartRef.current;
        if (!start) return;

        const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (!start.isDragging && distance <= TAP_MAX_DISTANCE) return;

        event.preventDefault();
        event.stopPropagation();

        start.isDragging = true;
        menuPressStartRef.current = null;
        setPressedMenuKey(null);
        setDraggingPinnedId(start.id);
        setPinnedDragOverlay({
            id: start.id,
            x: event.clientX,
            y: event.clientY,
            width: start.rect.width,
            height: start.rect.height,
            pointerOffsetX: start.pointerOffsetX,
            pointerOffsetY: start.pointerOffsetY,
        });
        suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_CLICK_SUPPRESS_MS;

        const target = getEditDropTarget(event.clientX, event.clientY);
        const targetKey = getEditDropTargetKey(target);
        setDragTargetPinnedId(targetKey);

        if (
            target &&
            !(target.type === "item" && target.id === start.id) &&
            targetKey !== lastDragTargetIdRef.current
        ) {
            lastDragTargetIdRef.current = targetKey;
            previewEditMenuReorder(start.id, target);
        }
    }, [getEditDropTarget, isEditMode, previewEditMenuReorder]);

    const handlePinnedPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const wasDragging = Boolean(pinnedDragStartRef.current?.isDragging);

        if (wasDragging) {
            event.preventDefault();
            event.stopPropagation();
            suppressSyntheticClickUntilRef.current = Date.now() + SYNTHETIC_CLICK_SUPPRESS_MS;
            const cleanPinnedIds = sanitizePinnedMenuIds(
                editPinnedMenuIdsRef.current,
                visibleHomeMenuItems,
                visibleDefaultPinnedMenuIds,
            );
            const cleanUnpinnedIds = sanitizeUnpinnedMenuIds(
                editUnpinnedMenuIdsRef.current,
                cleanPinnedIds,
                visibleHomeMenuItems,
            );
            const nextMenuOrderIds = sanitizeMenuOrderIds([...cleanPinnedIds, ...cleanUnpinnedIds], visibleHomeMenuItems);

            pinnedMenuIdsRef.current = cleanPinnedIds;
            editPinnedMenuIdsRef.current = cleanPinnedIds;
            editUnpinnedMenuIdsRef.current = cleanUnpinnedIds;
            menuOrderIdsRef.current = nextMenuOrderIds;

            setPinnedMenuIds(cleanPinnedIds);
            setEditPinnedMenuIds(cleanPinnedIds);
            setEditUnpinnedMenuIds(cleanUnpinnedIds);
            setMenuOrderIds(nextMenuOrderIds);
        }

        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            // Ignore pointer-capture mismatches after cancelled gestures.
        }

        resetPinnedDrag();
    }, [resetPinnedDrag, visibleDefaultPinnedMenuIds, visibleHomeMenuItems]);

    const openRegistrationChoice = () => {
        openModal("registrationChoice", {
            onSelectMain: () => {
                closeModal("registrationChoice");
                openModal("eventRegistration", {
                    selectedDate: new Date(),
                });
            },
            onSelectSocial: () => {
                closeModal("registrationChoice");
                openModal("weeklySocial");
            },
            onSelectOneDay: () => {
                closeModal("registrationChoice");
                openModal("oneDayRecruitRegistration");
            },
        });
    };

    const handleAddAction = () => {
        trackActivitySuccess({
            id: "home_menu_register",
            type: "action",
            title: "일정 등록",
            section: "bottom_menu_apps",
            category: "bottom_action",
            userId: user?.id,
            isAdmin,
        });
        setIsExpanded(false);
        if (!user) {
            window.dispatchEvent(new CustomEvent("requestProtectedAction", {
                detail: {
                    message: "댄스빌보드 로그인",
                    callback: openRegistrationChoice,
                },
            }));
            return;
        }
        openRegistrationChoice();
    };

    const handleAddClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (shouldSuppressSyntheticClick()) {
            event.preventDefault();
            return;
        }
        runMenuActionWithFeedback("register", handleAddAction);
    };

    const applyPanelGesture = useCallback((start: GestureStart, x: number, y: number) => {
        if (isSwipeUp(start, x, y)) {
            openMenu();
            return true;
        }

        if (isExpanded && start.scrollTop <= 8 && isSwipeDown(start, x, y)) {
            closeMenu();
            return true;
        }

        return false;
    }, [closeMenu, isExpanded, isSwipeDown, isSwipeUp, openMenu]);

    const handlePanelPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.pointerType === "mouse" || isModalGestureBlocked()) return;
        panelPointerGestureStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now(),
            scrollTop: event.currentTarget.scrollTop,
        };
    }, [isModalGestureBlocked]);

    const handlePanelPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (isEditMode && pinnedDragStartRef.current) {
            handlePinnedPointerMove(event);
            return;
        }

        const start = panelPointerGestureStartRef.current;
        if (!start || event.pointerType === "mouse" || isModalGestureBlocked()) return;

        if (applyPanelGesture(start, event.clientX, event.clientY)) {
            panelPointerGestureStartRef.current = null;
        }
    }, [applyPanelGesture, handlePinnedPointerMove, isEditMode, isModalGestureBlocked]);

    const handlePanelPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (isEditMode && pinnedDragStartRef.current) {
            handlePinnedPointerEnd(event);
            return;
        }

        const start = panelPointerGestureStartRef.current;
        panelPointerGestureStartRef.current = null;
        if (!start || event.pointerType === "mouse" || isModalGestureBlocked()) return;

        applyPanelGesture(start, event.clientX, event.clientY);
    }, [applyPanelGesture, handlePinnedPointerEnd, isEditMode, isModalGestureBlocked]);

    const handlePanelPointerCancel = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (isEditMode && pinnedDragStartRef.current) {
            handlePinnedPointerEnd(event);
            return;
        }

        resetPanelPointerGesture();
    }, [handlePinnedPointerEnd, isEditMode, resetPanelPointerGesture]);

    const handlePanelTouchStart = useCallback((event: React.TouchEvent<HTMLElement>) => {
        if (event.touches.length !== 1 || isModalGestureBlocked()) return;
        const touch = event.touches[0];
        panelTouchGestureStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            scrollTop: event.currentTarget.scrollTop,
        };
    }, [isModalGestureBlocked]);

    const handlePanelTouchEnd = useCallback((event: React.TouchEvent<HTMLElement>) => {
        const start = panelTouchGestureStartRef.current;
        panelTouchGestureStartRef.current = null;
        if (!start || event.changedTouches.length === 0 || isModalGestureBlocked()) return;
        const touch = event.changedTouches[0];

        applyPanelGesture(start, touch.clientX, touch.clientY);
    }, [applyPanelGesture, isModalGestureBlocked]);

    const handlePanelTouchMove = useCallback((event: React.TouchEvent<HTMLElement>) => {
        const start = panelTouchGestureStartRef.current;
        if (!start || event.touches.length !== 1 || isModalGestureBlocked()) return;
        const touch = event.touches[0];

        if (applyPanelGesture(start, touch.clientX, touch.clientY)) {
            panelTouchGestureStartRef.current = null;
        }
    }, [applyPanelGesture, isModalGestureBlocked]);

    useEffect(() => {
        return () => {
            if (menuActionTimerRef.current !== null) {
                window.clearTimeout(menuActionTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        pinnedMenuIdsRef.current = pinnedMenuIds;
    }, [pinnedMenuIds]);

    useEffect(() => {
        menuOrderIdsRef.current = menuOrderIds;
    }, [menuOrderIds]);

    useEffect(() => {
        editPinnedMenuIdsRef.current = editPinnedMenuIds;
    }, [editPinnedMenuIds]);

    useEffect(() => {
        editUnpinnedMenuIdsRef.current = editUnpinnedMenuIds;
    }, [editUnpinnedMenuIds]);

    useEffect(() => {
        if (isTempoToolVisibilityLoading) return undefined;

        let isCancelled = false;

        const loadMenuLayout = async () => {
            setIsLoadingMenuLayout(true);

            try {
                let settings: HomeMenuLayoutSettings | null = null;

                if (user?.id) {
                    try {
                        settings = await loadUserHomeMenuLayoutSettings(user.id);
                    } catch (error) {
                        console.warn("[HomeV2MenuPanel] Failed to load user menu layout:", error);
                    }
                }

                if (!settings) {
                    settings = await loadDefaultHomeMenuLayoutSettings();
                }

                if (isCancelled) return;
                applyHomeMenuLayout(settings);
                setIsEditMode(false);
                resetPinnedDrag();
            } catch (error) {
                console.warn("[HomeV2MenuPanel] Failed to load default menu layout:", error);
                if (!isCancelled) {
                    applyHomeMenuLayout(null);
                    setIsEditMode(false);
                    resetPinnedDrag();
                }
            } finally {
                if (!isCancelled) setIsLoadingMenuLayout(false);
            }
        };

        void loadMenuLayout();

        return () => {
            isCancelled = true;
        };
    }, [applyHomeMenuLayout, isTempoToolVisibilityLoading, resetPinnedDrag, user?.id]);

    useEffect(() => {
        const handleMediaPlayerBottomNav = (event: Event) => {
            const detail = (event as CustomEvent<MediaPlayerBottomNavEventDetail>).detail;
            const eventId = detail?.id || "global";
            const nextIds = new Set(mediaPlayerEngagedIdsRef.current);

            if (detail?.active) {
                nextIds.add(eventId);
            } else {
                nextIds.delete(eventId);
            }

            mediaPlayerEngagedIdsRef.current = nextIds;
            setIsMediaPlayerEngaged(nextIds.size > 0);
        };

        window.addEventListener(MEDIA_PLAYER_BOTTOM_NAV_EVENT, handleMediaPlayerBottomNav);
        return () => {
            window.removeEventListener(MEDIA_PLAYER_BOTTOM_NAV_EVENT, handleMediaPlayerBottomNav);
        };
    }, []);

    useEffect(() => {
        if (location.pathname === "/forum/media") return;
        mediaPlayerEngagedIdsRef.current.clear();
        setIsMediaPlayerEngaged(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!isHomeRoute || isExpanded || modalStack.length > 0) return undefined;

        let screenPointerGestureStart: GestureStart | null = null;
        let screenTouchGestureStart: GestureStart | null = null;

        const resetScreenPointerGesture = () => {
            screenPointerGestureStart = null;
        };

        const resetScreenTouchGesture = () => {
            screenTouchGestureStart = null;
        };

        const applyScreenGesture = (start: GestureStart, x: number, y: number) => {
            if (isModalGestureBlocked()) return false;
            if (!isSwipeUp(start, x, y)) return false;
            openMenu();
            return true;
        };

        const handlePointerStart = (event: PointerEvent) => {
            if (event.pointerType === "mouse" || isModalGestureBlocked()) return;
            if (event.clientY < window.innerHeight * HOME_SCREEN_GESTURE_START_RATIO) return;
            if (isSystemGestureEdgeStart(event.clientY)) return;

            screenPointerGestureStart = {
                x: event.clientX,
                y: event.clientY,
                time: Date.now(),
                scrollTop: 0,
            };
        };

        const handleTouchStart = (event: TouchEvent) => {
            if (isModalGestureBlocked()) return;
            if (event.touches.length !== 1) return;
            const touch = event.touches[0];
            if (touch.clientY < window.innerHeight * HOME_SCREEN_GESTURE_START_RATIO) return;
            if (isSystemGestureEdgeStart(touch.clientY)) return;

            screenTouchGestureStart = {
                x: touch.clientX,
                y: touch.clientY,
                time: Date.now(),
                scrollTop: 0,
            };
        };

        const handlePointerMove = (event: PointerEvent) => {
            if (!screenPointerGestureStart || event.pointerType === "mouse") return;

            if (applyScreenGesture(screenPointerGestureStart, event.clientX, event.clientY)) {
                resetScreenPointerGesture();
            }
        };

        const handleTouchMove = (event: TouchEvent) => {
            if (!screenTouchGestureStart || event.touches.length !== 1) return;
            const touch = event.touches[0];

            if (applyScreenGesture(screenTouchGestureStart, touch.clientX, touch.clientY)) {
                resetScreenTouchGesture();
            }
        };

        const handlePointerEnd = (event: PointerEvent) => {
            if (!screenPointerGestureStart || event.pointerType === "mouse") return;
            const start = screenPointerGestureStart;
            resetScreenPointerGesture();

            applyScreenGesture(start, event.clientX, event.clientY);
        };

        const handleTouchEnd = (event: TouchEvent) => {
            if (!screenTouchGestureStart || event.changedTouches.length === 0) return;
            const touch = event.changedTouches[0];
            const start = screenTouchGestureStart;
            resetScreenTouchGesture();

            applyScreenGesture(start, touch.clientX, touch.clientY);
        };

        window.addEventListener("pointerdown", handlePointerStart);
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerEnd);
        window.addEventListener("pointercancel", resetScreenPointerGesture);
        window.addEventListener("touchstart", handleTouchStart, { passive: true });
        window.addEventListener("touchmove", handleTouchMove, { passive: true });
        window.addEventListener("touchend", handleTouchEnd, { passive: true });
        window.addEventListener("touchcancel", resetScreenTouchGesture, { passive: true });

        return () => {
            window.removeEventListener("pointerdown", handlePointerStart);
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerEnd);
            window.removeEventListener("pointercancel", resetScreenPointerGesture);
            window.removeEventListener("touchstart", handleTouchStart);
            window.removeEventListener("touchmove", handleTouchMove);
            window.removeEventListener("touchend", handleTouchEnd);
            window.removeEventListener("touchcancel", resetScreenTouchGesture);
        };
    }, [isExpanded, isHomeRoute, isModalGestureBlocked, isSwipeUp, isSystemGestureEdgeStart, modalStack.length, openMenu]);

    return (
        <section
            className={`home-v2-menu-panel ${isExpanded ? "is-expanded" : ""} ${isMediaPlayerEngaged ? "is-media-player-engaged" : ""} is-compact`}
            aria-label={t("mainMenu")}
            translate="no"
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={handlePanelPointerCancel}
            onTouchStart={handlePanelTouchStart}
            onTouchMove={handlePanelTouchMove}
            onTouchEnd={handlePanelTouchEnd}
            onTouchCancel={resetPanelTouchGesture}
        >
            <div className={`home-v2-menu-compact-row ${quickMenuItems.length === 0 ? "has-no-quick-items" : ""}`}>
                {quickMenuItems.length > 0 && (
                    <div
                        className="home-v2-menu-quickbar"
                        style={{ "--quick-count": String(quickMenuItems.length) } as React.CSSProperties}
                        aria-label="고정 메뉴"
                    >
                        {quickMenuItems.map((item) => {
                            const itemKey = getMenuItemKey(item);
                            const itemStatus = getMenuItemStatus(item);
                            return (
                                <button
                                    key={`quick-${itemKey}`}
                                    type="button"
                                    className={`home-v2-menu-quick-item ${isMenuItemActive(item) ? "is-active" : ""} ${pressedMenuKey === itemKey ? "is-pressed" : ""} ${draggingPinnedId === itemKey ? "is-dragging" : ""} ${dragTargetPinnedId === itemKey ? "is-drag-target" : ""}`}
                                    onTouchStart={(event) => {
                                        if (event.touches.length !== 1) return;
                                        event.stopPropagation();
                                        const touch = event.touches[0];
                                        rememberMenuPressStart(itemKey, touch.clientX, touch.clientY);
                                    }}
                                    onTouchMove={(event) => {
                                        if (event.touches.length !== 1) return;
                                        event.stopPropagation();
                                        const touch = event.touches[0];
                                        clearMenuPressIfMoved(touch.clientX, touch.clientY);
                                    }}
                                    onTouchEnd={(event) => {
                                        consumeMenuTouchTap(event, itemKey, () => {
                                            runMenuActionWithFeedback(itemKey, () => handleMenuItemClick(item));
                                        });
                                    }}
                                    onTouchCancel={() => {
                                        menuPressStartRef.current = null;
                                        setPressedMenuKey(null);
                                    }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        if (shouldSuppressSyntheticClick()) {
                                            event.preventDefault();
                                            return;
                                        }
                                        runMenuActionWithFeedback(itemKey, () => handleMenuItemClick(item));
                                    }}
                                    aria-label={t(item.label)}
                                >
                                    <span className={`home-v2-menu-quick-icon home-v2-menu-icon--${item.theme}`} aria-hidden="true">
                                        <i className={item.icon} />
                                        {item.auxIcon && <i className={`home-v2-menu-icon-aux ${item.auxIcon}`} />}
                                        {itemStatus && <span className={getMenuItemStatusClassName(item)}>{itemStatus}</span>}
                                    </span>
                                    <span className={`home-v2-menu-quick-label ${item.id === "tempo-tool" ? "home-v2-menu-quick-label--tempo" : ""}`}>
                                        {item.id === "tempo-tool" ? (
                                            <>
                                                <span>BPM</span>
                                                <span>메트로놈</span>
                                            </>
                                        ) : t(item.shortLabel ?? item.label)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}

                <button
                    type="button"
                    className="home-v2-menu-toggle"
                    onClick={(event) => {
                        event.stopPropagation();
                        if (isExpanded && isEditMode) {
                            finishEditMode();
                        }
                        setIsExpanded((next) => !next);
                    }}
                    aria-expanded={isExpanded}
                >
                    <strong>MENU</strong>
                    <i className={isExpanded ? "ri-arrow-down-s-line" : "ri-equalizer-line"} aria-hidden="true" />
                </button>

                {isExpanded && (
                    <>
                        <button
                            type="button"
                            className={`home-v2-menu-edit-btn ${isEditMode ? "is-active" : ""}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleEditMode();
                            }}
                            aria-pressed={isEditMode}
                            aria-label={isEditMode ? "메뉴 편집 완료" : "메뉴 편집"}
                            title={isEditMode ? "메뉴 편집 완료" : "메뉴 편집"}
                            disabled={isLoadingMenuLayout || isSavingMenuLayout}
                        >
                            <i className={isEditMode ? "ri-check-line" : "ri-pencil-line"} aria-hidden="true" />
                        </button>

                        {isEditMode && (
                            <button
                                type="button"
                                className="home-v2-menu-reset-btn"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    resetPinnedMenu();
                                }}
                                aria-label="고정 메뉴 리셋"
                                title="고정 메뉴 리셋"
                                disabled={isSavingMenuLayout}
                            >
                                <i className="ri-restart-line" aria-hidden="true" />
                                <span>리셋</span>
                            </button>
                        )}
                    </>
                )}
            </div>

            {isExpanded && (
                <div className="home-v2-menu-expanded">
                    <div className="home-v2-menu-grid">
                        {expandedMenuCells.map((cell) => {
                            if (cell.type === "slot") {
                                return (
                                    <div
                                        key={`edit-slot-${cell.index}`}
                                        className={`home-v2-menu-edit-slot ${dragTargetPinnedId === `slot:${cell.index}` ? "is-drag-target" : ""}`}
                                        data-edit-slot-index={cell.index}
                                        aria-hidden="true"
                                    >
                                        <i className="ri-add-line" />
                                    </div>
                                );
                            }

                            const { item } = cell;
                            const itemKey = getMenuItemKey(item);
                            const itemHidden = isTempoToolItemHidden(tempoToolVisibilitySettings, item.id);
                            const itemStatus = getMenuItemStatus(item);
                            const pinnedIndex = cell.pinnedIndex;
                            const isPinned = pinnedIndex >= 0;
                            const isDropBefore = dragTargetPinnedId === `item:${itemKey}:before`;
                            const isDropAfter = dragTargetPinnedId === `item:${itemKey}:after`;
                            return (
                                <div
                                    key={itemKey}
                                    className={`home-v2-menu-item ${isMenuItemActive(item) ? "is-active" : ""} ${isPinned ? "is-pinned" : ""} ${isEditMode ? "is-editable" : ""} ${pressedMenuKey === itemKey ? "is-pressed" : ""} ${draggingPinnedId === itemKey ? "is-drag-placeholder" : ""} ${isDropBefore || isDropAfter ? "is-drag-target" : ""} ${isDropBefore ? "is-drop-before" : ""} ${isDropAfter ? "is-drop-after" : ""}`}
                                    data-menu-item-id={itemKey}
                                    data-menu-edit-id={isEditMode ? itemKey : undefined}
                                    onPointerDown={isEditMode ? (event) => handlePinnedPointerDown(event, itemKey) : undefined}
                                    onPointerMove={isEditMode ? handlePinnedPointerMove : undefined}
                                    onPointerUp={isEditMode ? handlePinnedPointerEnd : undefined}
                                    onPointerCancel={isEditMode ? handlePinnedPointerEnd : undefined}
                                    onDragStart={isEditMode ? (event) => event.preventDefault() : undefined}
                                    onContextMenu={isEditMode ? (event) => event.preventDefault() : undefined}
                                >
                                    <button
                                        type="button"
                                        className="home-v2-menu-item-main"
                                        onTouchStart={(event) => {
                                            if (isEditMode) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                return;
                                            }
                                            if (event.touches.length !== 1) return;
                                            const touch = event.touches[0];
                                            rememberMenuPressStart(itemKey, touch.clientX, touch.clientY);
                                        }}
                                        onTouchMove={(event) => {
                                            if (isEditMode) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                return;
                                            }
                                            if (event.touches.length !== 1) return;
                                            const touch = event.touches[0];
                                            clearMenuPressIfMoved(touch.clientX, touch.clientY);
                                        }}
                                        onTouchEnd={(event) => {
                                            if (isEditMode) {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                return;
                                            }
                                            consumeMenuTouchTap(event, itemKey, () => {
                                                runMenuActionWithFeedback(itemKey, () => handleMenuItemClick(item));
                                            });
                                        }}
                                        onTouchCancel={() => {
                                            menuPressStartRef.current = null;
                                            setPressedMenuKey(null);
                                        }}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            if (isEditMode) {
                                                event.preventDefault();
                                                return;
                                            }
                                            if (shouldSuppressSyntheticClick()) {
                                                event.preventDefault();
                                                return;
                                            }
                                            runMenuActionWithFeedback(itemKey, () => handleMenuItemClick(item));
                                        }}
                                    >
                                        <span className={`home-v2-menu-icon home-v2-menu-icon--${item.theme}`} aria-hidden="true">
                                            <i className={item.icon} />
                                            {item.auxIcon && <i className={`home-v2-menu-icon-aux ${item.auxIcon}`} />}
                                            {itemStatus && <span className={getMenuItemStatusClassName(item)}>{itemStatus}</span>}
                                        </span>
                                        <span className={`home-v2-menu-label ${item.id === "tempo-tool" ? "home-v2-menu-label--tempo" : ""}`}>
                                            {item.id === "tempo-tool" ? (
                                                <>
                                                    <span>BPM 측정기</span>
                                                    <span>메트로놈</span>
                                                </>
                                            ) : t(item.label)}
                                        </span>
                                    </button>
                                    {isAdmin && isEditMode && HIDEABLE_MENU_ITEM_IDS.has(item.id) && (
                                        <button
                                            type="button"
                                            className={`home-v2-menu-item-visibility ${itemHidden ? "is-hidden" : ""}`}
                                            onPointerDown={stopMenuItemVisibilityDrag}
                                            onTouchStart={stopMenuItemVisibilityDrag}
                                            onMouseDown={stopMenuItemVisibilityDrag}
                                            onClick={(event) => handleMenuItemVisibilityClick(event, item.id)}
                                            disabled={isSavingTempoToolVisibility || isTempoToolVisibilityLoading}
                                            aria-label={getMenuItemVisibilityLabel(item, itemHidden)}
                                            aria-pressed={itemHidden}
                                            title={getMenuItemVisibilityLabel(item, itemHidden)}
                                        >
                                            <i className={getMenuItemVisibilityIcon(itemHidden)} aria-hidden="true" />
                                        </button>
                                    )}
                                    {isEditMode && isPinned && <span className="home-v2-menu-rank-badge">{pinnedIndex + 1}</span>}
                                </div>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        className={`home-v2-menu-register ${pressedMenuKey === "register" ? "is-pressed" : ""}`}
                        onTouchStart={(event) => {
                            if (event.touches.length !== 1) return;
                            const touch = event.touches[0];
                            rememberMenuPressStart("register", touch.clientX, touch.clientY);
                        }}
                        onTouchMove={(event) => {
                            if (event.touches.length !== 1) return;
                            const touch = event.touches[0];
                            clearMenuPressIfMoved(touch.clientX, touch.clientY);
                        }}
                        onTouchEnd={(event) => {
                            consumeMenuTouchTap(event, "register", () => {
                                runMenuActionWithFeedback("register", handleAddAction);
                            });
                        }}
                        onTouchCancel={() => {
                            menuPressStartRef.current = null;
                            setPressedMenuKey(null);
                        }}
                        onClick={handleAddClick}
                    >
                        <i className="ri-add-line" aria-hidden="true" />
                        <span>{t("일정 등록")}</span>
                    </button>
                </div>
            )}

            {pinnedDragOverlay && (() => {
                const overlayItem = menuItemById.get(pinnedDragOverlay.id);
                if (!overlayItem) return null;
                const overlayItemStatus = getMenuItemStatus(overlayItem);

                return (
                    <div
                        className="home-v2-menu-drag-overlay"
                        style={{
                            left: `${pinnedDragOverlay.x - pinnedDragOverlay.pointerOffsetX}px`,
                            top: `${pinnedDragOverlay.y - pinnedDragOverlay.pointerOffsetY}px`,
                            width: `${pinnedDragOverlay.width}px`,
                            height: `${pinnedDragOverlay.height}px`,
                        }}
                        aria-hidden="true"
                    >
                        <span className={`home-v2-menu-icon home-v2-menu-icon--${overlayItem.theme}`}>
                            <i className={overlayItem.icon} />
                            {overlayItem.auxIcon && <i className={`home-v2-menu-icon-aux ${overlayItem.auxIcon}`} />}
                            {overlayItemStatus && <span className={getMenuItemStatusClassName(overlayItem)}>{overlayItemStatus}</span>}
                        </span>
                        <span className={`home-v2-menu-label ${overlayItem.id === "tempo-tool" ? "home-v2-menu-label--tempo" : ""}`}>
                            {overlayItem.id === "tempo-tool" ? (
                                <>
                                    <span>BPM 측정기</span>
                                    <span>메트로놈</span>
                                </>
                            ) : t(overlayItem.label)}
                        </span>
                    </div>
                );
            })()}
        </section>
    );
};
