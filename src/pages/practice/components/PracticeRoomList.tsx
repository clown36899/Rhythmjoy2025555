import { useEffect, useState } from "react";
import { cafe24 } from "../../../lib/cafe24Client";
import { useAuth } from "../../../contexts/AuthContext";
import { logEvent } from "../../../lib/analytics";
import { getOptimizedImageUrl } from "../../../utils/getEventThumbnail";
import { getVenueDirectUrl, hasVenueWebsite } from "../utils/venueLinks";
import "./PracticeRoomList.css";

export interface PracticeRoom {
  id: string;
  name: string;
  address?: string | null;
  location?: string | null;
  images: (string | Record<string, unknown>)[];
  website_url?: string | null;
  map_url?: string | null;
  additional_link?: string | null;
  additional_link_title?: string | null;
  address_link?: string | null;
  display_order?: number | null;
}

interface PracticeRoomListProps {
  adminType?: "super" | "sub" | null;
  rooms: PracticeRoom[];
  loading: boolean;
  hasActiveFilter: boolean;
  onClearFilters: () => void;
  onVenueClick: (venueId: string, directUrl?: string) => void;
}

export default function PracticeRoomList({
  adminType = null,
  rooms,
  loading,
  hasActiveFilter,
  onClearFilters,
  onVenueClick,
}: PracticeRoomListProps) {
  const { user, signInWithKakao } = useAuth();
  const [favoritePracticeRoomIds, setFavoritePracticeRoomIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setFavoritePracticeRoomIds(new Set());
      return;
    }

    let cancelled = false;
    const fetchFavorites = async () => {
      try {
        const { data, error } = await cafe24
          .from("practice_room_favorites")
          .select("practice_room_id")
          .eq("user_id", user.id);

        if (error) throw error;
        if (!cancelled) {
          setFavoritePracticeRoomIds(new Set((data ?? []).map((favorite) => String(favorite.practice_room_id))));
        }
      } catch (error) {
        console.error("Failed to load practice room favorites:", error);
      }
    };

    void fetchFavorites();
    return () => { cancelled = true; };
  }, [user]);

  const handleToggleFavorite = async (room: PracticeRoom, event: React.MouseEvent) => {
    event.stopPropagation();

    if (!user) {
      if (confirm("로그인이 필요한 기능입니다. 카카오로 로그인하시겠습니까?")) {
        try { await signInWithKakao(); } catch (error) { console.error(error); }
      }
      return;
    }

    const wasFavorite = favoritePracticeRoomIds.has(room.id);
    const userLabel = user.user_metadata?.name || user.email?.split("@")[0] || "Unknown";
    logEvent("Favorite", `Practice ${wasFavorite ? "Remove" : "Add"}`, `${room.name} (by ${userLabel})`);

    setFavoritePracticeRoomIds((previous) => {
      const next = new Set(previous);
      if (wasFavorite) next.delete(room.id);
      else next.add(room.id);
      return next;
    });

    const query = cafe24.from("practice_room_favorites");
    const { error } = wasFavorite
      ? await query.delete().eq("user_id", user.id).eq("practice_room_id", room.id)
      : await query.insert({ user_id: user.id, practice_room_id: room.id });

    if (error) {
      console.error("Failed to update practice room favorite:", error);
      setFavoritePracticeRoomIds((previous) => {
        const next = new Set(previous);
        if (wasFavorite) next.add(room.id);
        else next.delete(room.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="prl-loading-container" aria-live="polite">
        <span className="prl-spinner" />
        <p>등록된 연습실을 불러오는 중입니다</p>
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <div className="prl-empty-state">
        <i className="ri-search-eye-line" aria-hidden="true" />
        <strong>{hasActiveFilter ? "검색 결과가 없습니다" : "등록된 연습실이 없습니다"}</strong>
        {hasActiveFilter ? (
          <button type="button" onClick={onClearFilters}>필터 초기화</button>
        ) : adminType === "super" ? (
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("practiceRoomRegister"))}>
            연습실 등록
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="prl-main-container" aria-label="연습실 목록">
      <div className="prl-grid">
        {rooms.map((room) => {
          const targetUrl = getVenueDirectUrl(room);
          const isFavorite = favoritePracticeRoomIds.has(room.id);
          const imageUrl = room.images?.length > 0
            ? getOptimizedImageUrl(room.images[0], 320)
            : "";
          const linkLabel = hasVenueWebsite(room)
            ? (room.additional_link_title?.trim() || "예약·정보 보기")
            : "지도에서 보기";

          return (
            <article
              key={room.id}
              className="prl-card"
              role="link"
              tabIndex={0}
              onClick={() => onVenueClick(room.id, targetUrl)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onVenueClick(room.id, targetUrl);
                }
              }}
              data-analytics-id={room.id}
              data-analytics-type="venue"
              data-analytics-title={room.name}
              data-analytics-section="practice_room_list"
              aria-label={`${room.name}, ${linkLabel}`}
            >
              <div className={`prl-card-image-wrapper${imageUrl ? "" : " is-empty"}`} aria-hidden="true">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt=""
                    className="prl-card-image"
                    loading="lazy"
                    draggable={false}
                  />
                ) : (
                  <i className="ri-music-2-line" />
                )}
              </div>

              <div className="prl-card-info">
                <div className="prl-card-heading">
                  <h2>{room.name}</h2>
                  <button
                    type="button"
                    className={`prl-favorite-btn${isFavorite ? " is-active" : ""}`}
                    onClick={(event) => void handleToggleFavorite(room, event)}
                    aria-label={isFavorite ? `${room.name} 즐겨찾기 해제` : `${room.name} 즐겨찾기 추가`}
                    aria-pressed={isFavorite}
                  >
                    <i className={isFavorite ? "ri-star-fill" : "ri-star-line"} aria-hidden="true" />
                  </button>
                </div>

                {(room.location || room.address) && (
                  <p className="prl-card-address">
                    <i className="ri-map-pin-2-fill" aria-hidden="true" />
                    <span>{room.location || room.address}</span>
                  </p>
                )}

                <span className="prl-card-link-label">
                  {linkLabel}
                  <i className="ri-arrow-right-up-line" aria-hidden="true" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
