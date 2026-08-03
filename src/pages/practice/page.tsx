import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { cafe24 } from "../../lib/cafe24Client";
import { useAuth } from "../../contexts/AuthContext";
import { useSetPageAction } from "../../contexts/PageActionContext";
import { useModal } from "../../hooks/useModal";
import PracticeRoomList, { type PracticeRoom } from "./components/PracticeRoomList";
import VenueMapView from "./components/VenueMapView";
import VenueTabBar from "./components/VenueTabBar";
import { getVenueDirectUrl } from "./utils/venueLinks";
import "./practice.css";

type ViewMode = "list" | "map";
type RegionFilter = "all" | "seoul" | "other";
type SortMode = "recommended" | "title";

const SEOUL_ADDRESS_PREFIXES = [
  "서울", "서울시", "서울특별시", "종로구", "중구", "용산구", "성동구", "광진구",
  "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구", "은평구",
  "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구",
  "동작구", "관악구", "서초구", "강남구", "송파구", "강동구",
];

const isSeoulAddress = (address?: string | null) => (
  Boolean(address && SEOUL_ADDRESS_PREFIXES.some((prefix) => address.trim().startsWith(prefix)))
);

export default function PracticeRoomsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState("연습실");
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("all");
  const [sortBy, setSortBy] = useState<SortMode>("recommended");
  const [searchQuery, setSearchQuery] = useState("");
  const handledRoomIdRef = useRef<string | null>(null);
  const { open: openVenueRegistrationModal } = useModal("venueRegistration");
  const { user, isAdmin } = useAuth();
  const isEffectiveAdmin = isAdmin || localStorage.getItem("isDevAdmin") === "true";

  useEffect(() => {
    let cancelled = false;

    const fetchRooms = async () => {
      setLoading(true);
      try {
        const { data, error } = await cafe24
          .from("venues")
          .select("*")
          .eq("category", activeCategory)
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        setRooms((data ?? []).map((room) => ({
          ...room,
          images: typeof room.images === "string"
            ? (() => {
                try { return JSON.parse(room.images); } catch { return []; }
              })()
            : (room.images ?? []),
        })) as PracticeRoom[]);
      } catch (error) {
        console.error("Failed to load practice rooms:", error);
        if (!cancelled) setRooms([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchRooms();
    return () => { cancelled = true; };
  }, [activeCategory, refreshTrigger]);

  const categoryRooms = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase("ko-KR");

    return rooms.filter((room) => {
      const inRegion = regionFilter === "all"
        || (regionFilter === "seoul" && isSeoulAddress(room.address))
        || (regionFilter === "other" && !isSeoulAddress(room.address));
      if (!inRegion) return false;
      if (!normalizedQuery) return true;

      return [room.name, room.address, room.location]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ko-KR").includes(normalizedQuery));
    });
  }, [regionFilter, rooms, searchQuery]);

  const visibleRooms = useMemo(() => (
    sortBy === "title"
      ? [...categoryRooms].sort((a, b) => a.name.localeCompare(b.name, "ko"))
      : categoryRooms
  ), [categoryRooms, sortBy]);

  const seoulCount = useMemo(
    () => rooms.filter((room) => isSeoulAddress(room.address)).length,
    [rooms],
  );

  const openVenueLink = useCallback((venueId: string, directUrl?: string) => {
    const venue = rooms.find((room) => room.id === venueId);
    const targetUrl = directUrl || (venue ? getVenueDirectUrl(venue) : "");
    if (!targetUrl) return;
    window.location.assign(targetUrl);
  }, [rooms]);

  useEffect(() => {
    const roomId = searchParams.get("id");
    if (!roomId || loading || handledRoomIdRef.current === roomId) return;
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) return;

    handledRoomIdRef.current = roomId;
    openVenueLink(roomId);
  }, [loading, openVenueLink, rooms, searchParams]);

  const handleVenueCreatedOrUpdated = useCallback(() => {
    setRefreshTrigger((previous) => previous + 1);
  }, []);

  const openRegistration = useCallback(() => {
    if (!user) {
      window.dispatchEvent(new CustomEvent("requestProtectedAction", {
        detail: { message: "연습실 등록을 위해 로그인이 필요합니다." },
      }));
      return;
    }

    openVenueRegistrationModal({
      editVenueId: null,
      onVenueCreated: handleVenueCreatedOrUpdated,
      onVenueDeleted: handleVenueCreatedOrUpdated,
    });
  }, [handleVenueCreatedOrUpdated, openVenueRegistrationModal, user]);

  useEffect(() => {
    const handleRegisterEvent = () => openRegistration();
    window.addEventListener("practiceRoomRegister", handleRegisterEvent);
    return () => window.removeEventListener("practiceRoomRegister", handleRegisterEvent);
  }, [openRegistration]);

  useEffect(() => {
    if (searchParams.get("action") !== "register") return;
    openRegistration();
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("action");
    setSearchParams(nextParams, { replace: true });
  }, [openRegistration, searchParams, setSearchParams]);

  useSetPageAction({
    icon: "ri-add-line",
    label: "연습실 등록",
    onClick: () => window.dispatchEvent(new CustomEvent("practiceRoomRegister")),
    requireAuth: true,
  });

  return (
    <main className="practice-page-container">
      <div className="practice-main-content">
        <header className="practice-discovery-header">
          <div className="practice-title-row">
            <div>
              <span className="practice-title-kicker">DANCE SPACE</span>
              <h1>연습실 찾기</h1>
            </div>
            {!loading && <span className="practice-result-count">{visibleRooms.length}곳</span>}
          </div>

          <VenueTabBar activeCategory={activeCategory} onCategoryChange={setActiveCategory} />

          <label className="practice-search-box">
            <i className="ri-search-line" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="연습실 이름이나 지역 검색"
              aria-label="연습실 검색"
            />
            {searchQuery && (
              <button type="button" onClick={() => setSearchQuery("")} aria-label="검색어 지우기">
                <i className="ri-close-circle-fill" aria-hidden="true" />
              </button>
            )}
          </label>

          <div className="practice-control-row">
            <div className="practice-view-toggle" aria-label="보기 방식">
              <button
                type="button"
                className={viewMode === "list" ? "active" : ""}
                onClick={() => setViewMode("list")}
                aria-pressed={viewMode === "list"}
              >
                <i className="ri-list-check" aria-hidden="true" /> 리스트
              </button>
              <button
                type="button"
                className={viewMode === "map" ? "active" : ""}
                onClick={() => setViewMode("map")}
                aria-pressed={viewMode === "map"}
              >
                <i className="ri-map-2-line" aria-hidden="true" /> 지도
              </button>
            </div>

            <select
              className="practice-sort-select"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortMode)}
              aria-label="연습실 정렬"
            >
              <option value="recommended">추천순</option>
              <option value="title">이름순</option>
            </select>
          </div>

          <div className="practice-region-filter" aria-label="지역 필터">
            {([
              ["all", `전체 ${rooms.length}`],
              ["seoul", `서울 ${seoulCount}`],
              ["other", `그 외 ${Math.max(0, rooms.length - seoulCount)}`],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={regionFilter === value ? "active" : ""}
                onClick={() => setRegionFilter(value)}
                aria-pressed={regionFilter === value}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {viewMode === "map" ? (
          <section className="practice-map-section" aria-label="연습실 지도">
            {loading ? (
              <div className="practice-loading"><span />위치를 불러오는 중입니다</div>
            ) : visibleRooms.length > 0 ? (
              <>
                <VenueMapView venues={visibleRooms} onVenueClick={openVenueLink} />
                <p className="practice-map-hint">
                  <i className="ri-cursor-line" aria-hidden="true" /> 마커를 누르면 예약 또는 지도 링크로 바로 이동합니다.
                </p>
              </>
            ) : (
              <div className="practice-empty-search">
                <i className="ri-map-pin-line" aria-hidden="true" />
                <strong>조건에 맞는 연습실이 없습니다</strong>
                <button type="button" onClick={() => { setSearchQuery(""); setRegionFilter("all"); }}>필터 초기화</button>
              </div>
            )}
          </section>
        ) : (
          <PracticeRoomList
            adminType={isEffectiveAdmin ? "super" : null}
            rooms={visibleRooms}
            loading={loading}
            hasActiveFilter={Boolean(searchQuery.trim()) || regionFilter !== "all"}
            onClearFilters={() => { setSearchQuery(""); setRegionFilter("all"); }}
            onVenueClick={openVenueLink}
          />
        )}
      </div>
    </main>
  );
}
