import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../../contexts/AuthContext";
import { useModalContext } from "../../../contexts/ModalContext";
import "./HomeV2MenuPanel.css";

type HomeMenuItem = {
    label: string;
    icon: string;
    auxIcon?: string;
    theme: string;
    to?: string;
    action?: "stats";
};

const HOME_MENU_ITEMS: HomeMenuItem[] = [
    { label: "홈", icon: "ri-home-5-line", theme: "home", to: "/v2" },
    { label: "캘린더", icon: "ri-calendar-event-line", theme: "calendar", to: "/calendar?view=calendar&scrollToToday=true" },
    { label: "강습&행사", icon: "ri-ticket-2-line", auxIcon: "ri-book-open-line", theme: "events", to: "/events" },
    { label: "자유게시판", icon: "ri-chat-3-line", theme: "board", to: "/board" },
    { label: "map", icon: "ri-map-pin-2-line", theme: "places", to: "/places" },
    { label: "포럼", icon: "ri-layout-grid-line", theme: "forum", to: "/forum" },
    { label: "쇼핑", icon: "ri-shopping-bag-3-line", theme: "shopping", to: "/shopping" },
    { label: "안내", icon: "ri-compass-3-line", theme: "guide", to: "/guide" },
    { label: "게시물 통계", icon: "ri-bar-chart-box-line", theme: "stats", action: "stats" },
];

const SWIPE_MIN_DISTANCE = 48;
const SWIPE_MAX_DURATION_MS = 800;
const HOME_SCREEN_GESTURE_START_RATIO = 0.5;
const TAP_MAX_DISTANCE = 24;
const TAP_MAX_DURATION_MS = 700;
const SYNTHETIC_CLICK_SUPPRESS_MS = 700;
const MENU_ACTION_ANIMATION_MS = 130;
const SYSTEM_GESTURE_EDGE_GUARD_PX = 80;
const VISUAL_VIEWPORT_INSET_MAX_PX = 96;

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

const getMenuItemKey = (item: HomeMenuItem) => item.to || item.action || item.label;

export const HomeV2MenuPanel: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { openModal, closeModal, modalStack } = useModalContext();
    const [isExpanded, setIsExpanded] = useState(false);
    const [pressedMenuKey, setPressedMenuKey] = useState<string | null>(null);
    const panelPointerGestureStartRef = useRef<GestureStart | null>(null);
    const panelTouchGestureStartRef = useRef<GestureStart | null>(null);
    const menuPressStartRef = useRef<PressStart | null>(null);
    const suppressSyntheticClickUntilRef = useRef(0);
    const menuActionTimerRef = useRef<number | null>(null);
    const isHomeRoute = location.pathname === "/" || location.pathname === "/v2";

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
        if (path === "/v2") return location.pathname === "/" || location.pathname === "/v2";
        return location.pathname === path;
    };

    const openStatsModal = () => {
        setIsExpanded(false);

        if (!user) {
            window.dispatchEvent(new CustomEvent("openLoginModal", {
                detail: {
                    message: "게시물 통계를 보려면 로그인이 필요합니다.",
                },
            }));
            return;
        }

        openModal("stats", { userId: user.id, initialTab: "my" });
    };

    const handleMenuItemClick = (item: HomeMenuItem) => {
        if (item.action === "stats") {
            openStatsModal();
            return;
        }

        if (item.to) handleNavigate(item.to);
    };

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
        const start = panelPointerGestureStartRef.current;
        if (!start || event.pointerType === "mouse" || isModalGestureBlocked()) return;

        if (applyPanelGesture(start, event.clientX, event.clientY)) {
            panelPointerGestureStartRef.current = null;
        }
    }, [applyPanelGesture, isModalGestureBlocked]);

    const handlePanelPointerUp = useCallback((event: React.PointerEvent<HTMLElement>) => {
        const start = panelPointerGestureStartRef.current;
        panelPointerGestureStartRef.current = null;
        if (!start || event.pointerType === "mouse" || isModalGestureBlocked()) return;

        applyPanelGesture(start, event.clientX, event.clientY);
    }, [applyPanelGesture, isModalGestureBlocked]);

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
        const root = document.documentElement;

        const syncVisualViewportInset = () => {
            const viewport = window.visualViewport;
            const rawBottomInset = viewport
                ? window.innerHeight - viewport.height - viewport.offsetTop
                : 0;
            const bottomInset = Math.min(
                VISUAL_VIEWPORT_INSET_MAX_PX,
                Math.max(0, Math.round(rawBottomInset)),
            );
            root.style.setProperty("--home-v2-visual-bottom-inset", `${bottomInset}px`);
        };

        syncVisualViewportInset();
        window.visualViewport?.addEventListener("resize", syncVisualViewportInset);
        window.visualViewport?.addEventListener("scroll", syncVisualViewportInset);
        window.addEventListener("resize", syncVisualViewportInset);

        return () => {
            window.visualViewport?.removeEventListener("resize", syncVisualViewportInset);
            window.visualViewport?.removeEventListener("scroll", syncVisualViewportInset);
            window.removeEventListener("resize", syncVisualViewportInset);
            root.style.removeProperty("--home-v2-visual-bottom-inset");
        };
    }, []);

    useEffect(() => {
        return () => {
            if (menuActionTimerRef.current !== null) {
                window.clearTimeout(menuActionTimerRef.current);
            }
        };
    }, []);

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
            className={`home-v2-menu-panel ${isExpanded ? "is-expanded" : ""} is-compact`}
            aria-label="메인 메뉴"
            onPointerDown={handlePanelPointerDown}
            onPointerMove={handlePanelPointerMove}
            onPointerUp={handlePanelPointerUp}
            onPointerCancel={resetPanelPointerGesture}
            onTouchStart={handlePanelTouchStart}
            onTouchMove={handlePanelTouchMove}
            onTouchEnd={handlePanelTouchEnd}
            onTouchCancel={resetPanelTouchGesture}
        >
            <button
                type="button"
                className="home-v2-menu-toggle"
                onClick={(event) => {
                    event.stopPropagation();
                    setIsExpanded((next) => !next);
                }}
                aria-expanded={isExpanded}
            >
                <strong>MENU</strong>
                <i className={isExpanded ? "ri-arrow-up-s-line" : "ri-triangle-line"} aria-hidden="true" />
            </button>

            {isExpanded && (
                <div className="home-v2-menu-expanded">
                    <div className="home-v2-menu-grid">
                        {HOME_MENU_ITEMS.map((item) => {
                            const itemKey = getMenuItemKey(item);
                            return (
                                <button
                                    key={itemKey}
                                    type="button"
                                    className={`home-v2-menu-item ${isMenuItemActive(item) ? "is-active" : ""} ${pressedMenuKey === itemKey ? "is-pressed" : ""}`}
                                    onTouchStart={(event) => {
                                        if (event.touches.length !== 1) return;
                                        const touch = event.touches[0];
                                        rememberMenuPressStart(itemKey, touch.clientX, touch.clientY);
                                    }}
                                    onTouchMove={(event) => {
                                        if (event.touches.length !== 1) return;
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
                                >
                                    <span className={`home-v2-menu-icon home-v2-menu-icon--${item.theme}`} aria-hidden="true">
                                        <i className={item.icon} />
                                        {item.auxIcon && <i className={`home-v2-menu-icon-aux ${item.auxIcon}`} />}
                                    </span>
                                    <span className="home-v2-menu-label">{item.label}</span>
                                </button>
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
                        <span>일정 등록</span>
                    </button>
                </div>
            )}
        </section>
    );
};
