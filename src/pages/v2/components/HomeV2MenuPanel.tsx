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

type GestureStart = {
    x: number;
    y: number;
    time: number;
    scrollTop: number;
};

export const HomeV2MenuPanel: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { openModal, closeModal, modalStack } = useModalContext();
    const [isExpanded, setIsExpanded] = useState(false);
    const panelPointerGestureStartRef = useRef<GestureStart | null>(null);
    const panelTouchGestureStartRef = useRef<GestureStart | null>(null);
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

    const isMenuActionTarget = useCallback((target: EventTarget | null) => {
        const element = target instanceof Element
            ? target
            : target instanceof Node
                ? target.parentElement
                : null;
        return Boolean(element?.closest(".home-v2-menu-item, .home-v2-menu-register"));
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

    const handleAddClick = (event: React.MouseEvent) => {
        event.stopPropagation();
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
        if (isMenuActionTarget(event.target)) return;
        panelPointerGestureStartRef.current = {
            x: event.clientX,
            y: event.clientY,
            time: Date.now(),
            scrollTop: event.currentTarget.scrollTop,
        };
    }, [isMenuActionTarget, isModalGestureBlocked]);

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
        if (isMenuActionTarget(event.target)) return;
        const touch = event.touches[0];
        panelTouchGestureStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            scrollTop: event.currentTarget.scrollTop,
        };
    }, [isMenuActionTarget, isModalGestureBlocked]);

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
    }, [isExpanded, isHomeRoute, isModalGestureBlocked, isSwipeUp, modalStack.length, openMenu]);

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
                onClick={() => setIsExpanded((next) => !next)}
                aria-expanded={isExpanded}
            >
                <strong>MENU</strong>
                <i className={isExpanded ? "ri-arrow-up-s-line" : "ri-triangle-line"} aria-hidden="true" />
            </button>

            {isExpanded && (
                <div className="home-v2-menu-expanded">
                    <div className="home-v2-menu-grid">
                        {HOME_MENU_ITEMS.map((item) => (
                            <button
                                key={item.to || item.action}
                                type="button"
                                className={`home-v2-menu-item ${isMenuItemActive(item) ? "is-active" : ""}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    handleMenuItemClick(item);
                                }}
                            >
                                <span className={`home-v2-menu-icon home-v2-menu-icon--${item.theme}`} aria-hidden="true">
                                    <i className={item.icon} />
                                    {item.auxIcon && <i className={`home-v2-menu-icon-aux ${item.auxIcon}`} />}
                                </span>
                                <span className="home-v2-menu-label">{item.label}</span>
                            </button>
                        ))}
                    </div>

                    <button
                        type="button"
                        className="home-v2-menu-register"
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
