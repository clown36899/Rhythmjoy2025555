
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import "./ColorSettingsModal.css";

interface ColorSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ColorSettingsModal({ isOpen, onClose }: ColorSettingsModalProps) {
    const [themeColors, setThemeColors] = useState({
        background_color: "#000000",
        header_bg_color: "#1f2937",
        calendar_bg_color: "#111827",
        event_list_bg_color: "#1f2937",
        event_list_outer_bg_color: "#1f2937",
        page_bg_color: "#111827",
    });

    // 색상 설정 불러오기
    const loadThemeColors = async () => {
        try {
            const { data, error } = await supabase
                .from("theme_settings")
                .select("*")
                .eq("id", 1)
                .single();

            if (error || !data) {
                return;
            }

            setThemeColors({
                background_color: data.background_color,
                header_bg_color: data.header_bg_color || "#1f2937",
                calendar_bg_color: data.calendar_bg_color,
                event_list_bg_color: data.event_list_bg_color,
                event_list_outer_bg_color: data.event_list_outer_bg_color,
                page_bg_color: data.page_bg_color || "#111827",
            });
        } catch (err) {
            console.error("테마 색상 로드 실패:", err);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadThemeColors();
        }
    }, [isOpen]);

    // 색상 저장
    const saveThemeColor = async (colorType: string, color: string) => {
        try {
            const { error } = await supabase
                .from("theme_settings")
                .update({
                    [colorType]: color,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", 1);

            if (error) {
                console.error("색상 저장 오류:", error);
                return;
            }

            // 로컬 상태 업데이트
            setThemeColors((prev) => ({
                ...prev,
                [colorType]: color,
            }));

            // CSS 변수 업데이트
            const cssVarMap: { [key: string]: string } = {
                background_color: "--bg-color",
                header_bg_color: "--header-bg-color",
                calendar_bg_color: "--calendar-bg-color",
                event_list_bg_color: "--event-list-bg-color",
                event_list_outer_bg_color: "--event-list-outer-bg-color",
                page_bg_color: "--page-bg-color",
            };

            document.documentElement.style.setProperty(cssVarMap[colorType], color);
        } catch (err) {
            console.error("색상 저장 실패:", err);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="header-color-panel-overlay">
            <div className="header-color-panel" translate="no">
                <div className="header-color-panel-header">
                    <h3 className="header-color-panel-title">색상 설정</h3>
                    <button
                        onClick={onClose}
                        className="header-color-panel-close"
                    >
                        <i className="ri-close-line header-icon-xl"></i>
                    </button>
                </div>

                <div className="header-btn-group-vertical header-gap-3 header-mb-6">
                    {/* 헤더 배경색 */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            헤더 배경색
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.header_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("header_bg_color", e.target.value)
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.header_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("header_bg_color", e.target.value)
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    {/* 배경색 (650px 밖) */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            배경색 (650px 밖)
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.background_color}
                                onChange={(e) =>
                                    saveThemeColor("background_color", e.target.value)
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.background_color}
                                onChange={(e) =>
                                    saveThemeColor("background_color", e.target.value)
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    {/* 달력 배경색 */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            달력 배경색
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.calendar_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("calendar_bg_color", e.target.value)
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.calendar_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("calendar_bg_color", e.target.value)
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    {/* 이벤트 리스트 배경색 */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            이벤트 리스트 배경색
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.event_list_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("event_list_bg_color", e.target.value)
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.event_list_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("event_list_bg_color", e.target.value)
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    {/* 이벤트 리스트 컨테이너 배경색 */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            이벤트 리스트 컨테이너 배경색
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.event_list_outer_bg_color}
                                onChange={(e) =>
                                    saveThemeColor(
                                        "event_list_outer_bg_color",
                                        e.target.value,
                                    )
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.event_list_outer_bg_color}
                                onChange={(e) =>
                                    saveThemeColor(
                                        "event_list_outer_bg_color",
                                        e.target.value,
                                    )
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    {/* 페이지 배경색 */}
                    <div className="header-color-section">
                        <label className="header-color-label">
                            이벤트리스트판 뒷배경
                        </label>
                        <div className="header-color-input-group">
                            <input
                                type="color"
                                value={themeColors.page_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("page_bg_color", e.target.value)
                                }
                                className="header-color-picker"
                            />
                            <input
                                type="text"
                                value={themeColors.page_bg_color}
                                onChange={(e) =>
                                    saveThemeColor("page_bg_color", e.target.value)
                                }
                                className="header-color-text"
                            />
                        </div>
                    </div>

                    <p className="header-color-note">
                        * 변경사항은 즉시 저장되어 모든 사용자에게 적용됩니다.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
