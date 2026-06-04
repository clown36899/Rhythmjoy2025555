import React, { useState } from "react";
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

export const HomeV2MenuPanel: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();
    const { openModal, closeModal } = useModalContext();
    const [isExpanded, setIsExpanded] = useState(false);

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

    return (
        <section
            className={`home-v2-menu-panel ${isExpanded ? "is-expanded" : ""} is-compact`}
            aria-label="메인 메뉴"
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
                                onClick={() => handleMenuItemClick(item)}
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
