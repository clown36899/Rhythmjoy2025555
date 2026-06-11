import { useEffect, useMemo, useRef, useState } from 'react';
import { useSetPageAction } from '../../contexts/PageActionContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  swingOneDayRecruitLinks,
  type SwingOneDayRecruitLogo,
  type SwingOneDayRecruitLink,
} from '../../data/swingOneDayRecruitLinks';
import { supabase } from '../../lib/supabase';
import {
  KOREA_CENTER,
  ONE_DAY_REGION_OPTIONS,
  REGION_ALIASES,
  REGION_COORDINATES,
  REGION_DISPLAY_ORDER,
  REGION_SORT_INDEX,
} from './oneDayRecruitRegions';
import './OneDayRecruitPage.css';

declare global {
  interface Window {
    kakao: any;
  }
}

type OneDayLinkDraft = Pick<SwingOneDayRecruitLink, 'id' | 'community' | 'venue' | 'region' | 'area' | 'url' | 'coordinates' | 'logoSourceUrl' | 'logo'>;
type RegionScopedLink = SwingOneDayRecruitLink & { displayRegion: string };
type PinDisplayOffset = { x: number; y: number };
type OneDayRecruitLinkRow = {
  id: string;
  community: string;
  venue: string | null;
  region: string;
  area: string;
  lat: number;
  lng: number;
  url: string;
  logo_source_url: string | null;
  logo_micro: string | null;
  logo_thumbnail: string | null;
  logo_medium: string | null;
  logo_full: string | null;
  logo_storage_path: string | null;
  logo_updated_at: string | null;
  sort_order: number | null;
  is_active: boolean | null;
};

const ONE_DAY_LINKS_TABLE = 'swing_oneday_recruit_links';
const ONE_DAY_LINK_SELECT = 'id,community,venue,region,area,lat,lng,url,logo_source_url,logo_micro,logo_thumbnail,logo_medium,logo_full,logo_storage_path,logo_updated_at,sort_order,is_active';
const REGION_PIN_OFFSETS: Record<string, PinDisplayOffset> = {
  서울: { x: 36, y: -44 },
  인천: { x: -58, y: -18 },
  부천: { x: 52, y: 8 },
  천안: { x: -48, y: -42 },
  청주: { x: 50, y: -34 },
  세종: { x: -56, y: 2 },
  대전: { x: 44, y: 38 },
  부산: { x: 34, y: 40 },
};
const FALLBACK_PIN_OFFSETS: PinDisplayOffset[] = [
  { x: 0, y: -42 },
  { x: -58, y: -12 },
  { x: 54, y: 10 },
  { x: 0, y: 42 },
];
const ONE_DAY_LOGO_FUNCTION_PATH = '/api/oneday-recruit-logo';
const LINK_CORRECTIONS: Record<string, Partial<SwingOneDayRecruitLink>> = {
  'goldenswing-linktree': {
    venue: '골든스윙',
    region: '청주',
    area: '청주',
    coordinates: REGION_COORDINATES.청주,
  },
  'swinghouse-littly': {
    region: '인천',
    area: '인천',
    coordinates: REGION_COORDINATES.인천,
  },
};

interface RegionGroup {
  region: string;
  links: RegionScopedLink[];
  coordinates: SwingOneDayRecruitLink['coordinates'];
}

const normalizeRecruitLinks = (links: SwingOneDayRecruitLink[]): SwingOneDayRecruitLink[] => links
  .map(normalizeRecruitLink)
  .map(applyKnownCorrection)
  .sort((a, b) => compareRegionLabel(getLinkRegions(a)[0], getLinkRegions(b)[0]) || a.community.localeCompare(b.community, 'ko'));

function applyKnownCorrection(link: SwingOneDayRecruitLink): SwingOneDayRecruitLink {
  const correction = LINK_CORRECTIONS[link.id];
  return correction ? { ...link, ...correction } : link;
}

function normalizeCoordinateValue(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function hasValidCoordinates(value: unknown): value is SwingOneDayRecruitLink['coordinates'] {
  const maybe = value as Partial<SwingOneDayRecruitLink['coordinates']> | null | undefined;
  return normalizeCoordinateValue(maybe?.lat) !== null && normalizeCoordinateValue(maybe?.lng) !== null;
}

function getFallbackCoordinates(region?: string): SwingOneDayRecruitLink['coordinates'] {
  const regionKey = region ? getRegionLabelsFromText(region)[0] : null;
  return (regionKey && REGION_COORDINATES[regionKey]) || KOREA_CENTER;
}

function getRegionPinOffset(region: string, fallbackIndex: number): PinDisplayOffset {
  return REGION_PIN_OFFSETS[region] || FALLBACK_PIN_OFFSETS[fallbackIndex % FALLBACK_PIN_OFFSETS.length];
}

function legacyMapPositionToCoordinates(value: unknown, region?: string): SwingOneDayRecruitLink['coordinates'] {
  const maybe = value as { x?: unknown; y?: unknown } | null | undefined;
  const x = normalizeCoordinateValue(maybe?.x);
  const y = normalizeCoordinateValue(maybe?.y);
  if (x === null || y === null) return getFallbackCoordinates(region);

  // 이전 UI는 전국 지도 위 percent 좌표를 저장했다. 정확한 지점보다 지역 분류 표시가 목적이므로
  // 대한민국 대략 범위 안의 좌표로 복원해 구버전 저장값이 앱을 깨뜨리지 않게 한다.
  return {
    lat: 38.6 - (y / 100) * 5.9,
    lng: 124.6 + (x / 100) * 7.1,
  };
}

function normalizeRecruitLink(rawLink: SwingOneDayRecruitLink): SwingOneDayRecruitLink {
  const legacyLink = rawLink as SwingOneDayRecruitLink & { mapPosition?: unknown };
  if (hasValidCoordinates(legacyLink.coordinates)) {
    return {
      ...legacyLink,
      coordinates: {
        lat: Number(legacyLink.coordinates.lat),
        lng: Number(legacyLink.coordinates.lng),
      },
    };
  }

  return {
    ...legacyLink,
    coordinates: legacyMapPositionToCoordinates(legacyLink.mapPosition, legacyLink.region),
  };
}

function getRegionCenter(links: SwingOneDayRecruitLink[]): SwingOneDayRecruitLink['coordinates'] {
  if (links.length === 0) return KOREA_CENTER;
  const total = links.reduce(
    (acc, link) => ({
      lat: acc.lat + normalizeRecruitLink(link).coordinates.lat,
      lng: acc.lng + normalizeRecruitLink(link).coordinates.lng,
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: total.lat / links.length,
    lng: total.lng / links.length,
  };
}

function getRegionLabelsFromText(text: string): string[] {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];

  const labels = new Set<string>();
  REGION_ALIASES.forEach(({ region, patterns }) => {
    if (patterns.some((pattern) => pattern.test(normalized))) labels.add(region);
  });
  REGION_DISPLAY_ORDER.forEach((region) => {
    if (normalized.includes(region)) labels.add(region);
  });

  return [...labels].sort(compareRegionLabel);
}

function getLinkRegions(link: SwingOneDayRecruitLink): string[] {
  const primaryLabels = getRegionLabelsFromText(link.region);
  if (primaryLabels.length > 0) return primaryLabels;

  const labels = getRegionLabelsFromText(`${link.area}/${link.venue || ''}`);
  if (labels.length > 0) return labels;
  return [link.region.trim()].filter(Boolean);
}

function inferPrimaryRegionFromText(...parts: Array<string | null | undefined>) {
  const labels = getRegionLabelsFromText(parts.filter(Boolean).join(' / '));
  return labels[0] || '';
}

function getRegionFromKakaoAddress(address: any) {
  const candidates = [
    address?.region_1depth_name,
    address?.region_2depth_name,
    address?.region_3depth_name,
    address?.address_name,
    address?.road_address_name,
    address?.place_name,
  ].filter(Boolean).join(' ');
  return inferPrimaryRegionFromText(candidates);
}

function shouldSyncAreaToRegion(area: string, selectedRegion: string, normalizedRegion: string) {
  const trimmedArea = area.trim();
  if (!trimmedArea) return true;

  const selectedLabels = getRegionLabelsFromText(selectedRegion || normalizedRegion);
  const areaLabels = getRegionLabelsFromText(trimmedArea);
  if (!selectedLabels.length || !areaLabels.length) return false;

  return !areaLabels.some((label) => selectedLabels.includes(label));
}

function getAreaForSelectedRegion(area: string, selectedRegion: string, normalizedRegion: string) {
  const trimmedArea = area.trim();
  return shouldSyncAreaToRegion(trimmedArea, selectedRegion, normalizedRegion)
    ? (selectedRegion.trim() || normalizedRegion)
    : trimmedArea;
}

async function resolveKakaoRegionFromQuery(query: string): Promise<string> {
  const trimmedQuery = query.trim();
  const services = window.kakao?.maps?.services;
  if (!trimmedQuery || !services) return '';

  const okStatus = services.Status.OK;

  const addressRegion = await new Promise<string>((resolve) => {
    const geocoder = new services.Geocoder();
    geocoder.addressSearch(trimmedQuery, (results: any[], status: string) => {
      if (status !== okStatus || !results?.length) {
        resolve('');
        return;
      }
      resolve(getRegionFromKakaoAddress(results[0]?.address || results[0]?.road_address || results[0]));
    });
  });
  if (addressRegion) return addressRegion;

  return new Promise<string>((resolve) => {
    const places = new services.Places();
    places.keywordSearch(trimmedQuery, (results: any[], status: string) => {
      if (status !== okStatus || !results?.length) {
        resolve('');
        return;
      }
      resolve(getRegionFromKakaoAddress(results[0]));
    });
  });
}

async function resolveDraftLocation(draft: OneDayLinkDraft) {
  const selectedRegion = draft.region.trim();
  const regionText = [selectedRegion, draft.area, draft.venue, draft.community].filter(Boolean).join(' / ');
  let region = selectedRegion || inferPrimaryRegionFromText(regionText);

  if (!region) {
    region = await resolveKakaoRegionFromQuery(regionText);
  }

  const normalizedRegion = region || draft.region.trim();
  return {
    region: normalizedRegion,
    area: getAreaForSelectedRegion(draft.area, selectedRegion, normalizedRegion),
    coordinates: getFallbackCoordinates(normalizedRegion),
  };
}

function compareRegionLabel(a: string, b: string): number {
  const aIndex = REGION_SORT_INDEX.get(a);
  const bIndex = REGION_SORT_INDEX.get(b);
  if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
  if (aIndex !== undefined) return -1;
  if (bIndex !== undefined) return 1;
  return a.localeCompare(b, 'ko');
}

function getLogoImage(link: SwingOneDayRecruitLink): string | null {
  return link.logo?.thumbnail || link.logo?.micro || link.logo?.medium || link.logo?.full || link.logoSourceUrl || null;
}

function getLogoInitials(community: string): string {
  const normalized = community.replace(/\s+/g, '').trim();
  if (!normalized) return 'S';
  const ascii = normalized.match(/[A-Za-z0-9]/g)?.slice(0, 2).join('').toUpperCase();
  if (ascii) return ascii;
  return [...normalized].slice(0, 2).join('');
}

function getEditableRegionValue(link: SwingOneDayRecruitLink) {
  if (REGION_COORDINATES[link.region]) return link.region;
  return inferPrimaryRegionFromText(link.region, link.area, link.venue, link.community);
}

function rowToRecruitLink(row: OneDayRecruitLinkRow): SwingOneDayRecruitLink {
  const logo: SwingOneDayRecruitLogo | undefined = row.logo_micro || row.logo_thumbnail || row.logo_medium || row.logo_full || row.logo_storage_path
    ? {
      sourceUrl: row.logo_source_url || undefined,
      micro: row.logo_micro || undefined,
      thumbnail: row.logo_thumbnail || undefined,
      medium: row.logo_medium || undefined,
      full: row.logo_full || undefined,
      storagePath: row.logo_storage_path || undefined,
      updatedAt: row.logo_updated_at || undefined,
    }
    : undefined;

  return normalizeRecruitLink({
    id: row.id,
    community: row.community,
    venue: row.venue || '',
    region: row.region,
    area: row.area,
    coordinates: {
      lat: Number(row.lat),
      lng: Number(row.lng),
    },
    url: row.url,
    logoSourceUrl: row.logo_source_url || undefined,
    logo,
  });
}

function updateLinkList(
  links: SwingOneDayRecruitLink[],
  nextLink: SwingOneDayRecruitLink,
) {
  const normalizedNext = applyKnownCorrection(normalizeRecruitLink(nextLink));
  const found = links.some((link) => link.id === normalizedNext.id);
  const nextLinks = found
    ? links.map((link) => (link.id === normalizedNext.id ? normalizedNext : link))
    : [...links, normalizedNext];
  return normalizeRecruitLinks(nextLinks);
}

async function requestLogoMutation(payload: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    throw new Error('로그인 후 수정할 수 있습니다.');
  }

  const response = await fetch(ONE_DAY_LOGO_FUNCTION_PATH, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(result.error || `로고 처리 실패 (${response.status})`));
  }
  return result as {
    logo?: SwingOneDayRecruitLogo;
    link?: OneDayRecruitLinkRow;
    sourceUrl?: string;
  };
}

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function OneDayLinkCard({
  link,
  canEdit,
  canDelete,
  isDeleting,
  onEdit,
  onDelete,
}: {
  link: RegionScopedLink;
  canEdit: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  onEdit: (link: SwingOneDayRecruitLink) => void;
  onDelete: (link: SwingOneDayRecruitLink) => void;
}) {
  const logoImage = getLogoImage(link);
  const initials = getLogoInitials(link.community);

  return (
    <article className="oneday-recruit-link-card">
      <a
        className="oneday-recruit-link"
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        title={`${link.community} 링크 열기`}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      >
        <span className="oneday-recruit-logo" aria-hidden="true">
          {logoImage ? (
            <img
              src={logoImage}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onError={(event) => {
                event.currentTarget.remove();
              }}
            />
          ) : null}
          <span>{initials}</span>
        </span>
        <span className="oneday-recruit-link-main">
          <span className="oneday-recruit-link-title">
            <strong>{link.community}</strong>
            <em>{link.displayRegion}</em>
          </span>
          {link.venue ? <small>{link.venue}</small> : null}
          <small>{link.area}</small>
        </span>
        <span className="oneday-recruit-link-side">
          <i className="ri-external-link-line" aria-hidden="true" />
        </span>
      </a>
      {canEdit || canDelete ? (
        <span className="oneday-recruit-card-actions">
          {canEdit ? (
            <button
              type="button"
              className="oneday-recruit-edit-btn"
              aria-label={`${link.community} 링크 수정`}
              onClick={() => onEdit(link)}
              disabled={isDeleting}
            >
              <i className="ri-pencil-line" aria-hidden="true" />
              <span>수정</span>
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="oneday-recruit-delete-btn"
              aria-label={`${link.community} 링크 삭제`}
              onClick={() => onDelete(link)}
              disabled={isDeleting}
            >
              <i className="ri-delete-bin-line" aria-hidden="true" />
              <span>{isDeleting ? '삭제 중' : '삭제'}</span>
            </button>
          ) : null}
        </span>
      ) : null}
    </article>
  );
}

export default function OneDayRecruitPage() {
  const { user, isAdmin } = useAuth();
  const [dbLinks, setDbLinks] = useState<SwingOneDayRecruitLink[]>([]);
  const [isLoadingLinks, setIsLoadingLinks] = useState(true);
  const [isUsingFallbackLinks, setIsUsingFallbackLinks] = useState(false);
  const [editingLink, setEditingLink] = useState<SwingOneDayRecruitLink | null>(null);
  const [draft, setDraft] = useState<OneDayLinkDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [logoAction, setLogoAction] = useState<'saving' | 'uploading' | 'deleting' | null>(null);
  const [deletingLinkId, setDeletingLinkId] = useState<string | null>(null);
  const [linksReloadToken, setLinksReloadToken] = useState(0);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const overlaysRef = useRef<any[]>([]);
  const regionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [mapReady, setMapReady] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const canEditLinks = Boolean(user);
  const canDeleteLogo = Boolean(user && isAdmin);
  const canDeleteLinks = Boolean(user && isAdmin);
  useSetPageAction(null);

  useEffect(() => {
    const reloadLinks = () => setLinksReloadToken((value) => value + 1);
    window.addEventListener('onedayRecruitLinksChanged', reloadLinks);
    return () => window.removeEventListener('onedayRecruitLinksChanged', reloadLinks);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingLinks(true);
    supabase
      .from(ONE_DAY_LINKS_TABLE)
      .select(ONE_DAY_LINK_SELECT)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('community', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.length) {
          setDbLinks(normalizeRecruitLinks(swingOneDayRecruitLinks));
          setIsUsingFallbackLinks(true);
          return;
        }
        setDbLinks(normalizeRecruitLinks((data as OneDayRecruitLinkRow[]).map(rowToRecruitLink)));
        setIsUsingFallbackLinks(false);
      })
      .catch(() => {
        if (!cancelled) {
          setDbLinks(normalizeRecruitLinks(swingOneDayRecruitLinks));
          setIsUsingFallbackLinks(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLinks(false);
      });
    return () => {
      cancelled = true;
    };
  }, [linksReloadToken]);

  const displayLinks = useMemo(() => (
    dbLinks.length ? normalizeRecruitLinks(dbLinks) : normalizeRecruitLinks(swingOneDayRecruitLinks)
  ), [dbLinks]);

  const regionGroups = useMemo<RegionGroup[]>(() => {
    const grouped = new Map<string, RegionGroup>();
    displayLinks.forEach((link) => {
      getLinkRegions(link).forEach((region) => {
        const scopedLink: RegionScopedLink = { ...link, displayRegion: region };
        const current = grouped.get(region);
        if (current) {
          current.links.push(scopedLink);
          return;
        }
        grouped.set(region, {
          region,
          links: [scopedLink],
          coordinates: REGION_COORDINATES[region] || link.coordinates,
        });
      });
    });

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        coordinates: REGION_COORDINATES[group.region] || getRegionCenter(group.links),
      }))
      .sort((a, b) => compareRegionLabel(a.region, b.region) || b.links.length - a.links.length);
  }, [displayLinks]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const initMap = () => {
      if (cancelled) return;
      if (!window.kakao?.maps || !mapContainerRef.current) {
        attempts += 1;
        if (attempts < 40) {
          timer = setTimeout(initMap, 250);
        } else {
          setMapLoadFailed(true);
        }
        return;
      }

      window.kakao.maps.load(() => {
        if (cancelled || !mapContainerRef.current || mapRef.current) return;
        const map = new window.kakao.maps.Map(mapContainerRef.current, {
          center: new window.kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng),
          level: 13,
        });
        map.setDraggable(false);
        map.setZoomable(false);
        map.relayout();
        mapRef.current = map;
        setMapReady(true);
        setMapLoadFailed(false);
      });
    };

    timer = setTimeout(initMap, 100);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || !window.kakao?.maps) return;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();
    const coordCounts = new Map<string, number>();

    regionGroups.forEach((group, index) => {
      const coordKey = `${group.coordinates.lat.toFixed(3)},${group.coordinates.lng.toFixed(3)}`;
      const duplicateIndex = coordCounts.get(coordKey) || 0;
      coordCounts.set(coordKey, duplicateIndex + 1);
      const position = new window.kakao.maps.LatLng(group.coordinates.lat, group.coordinates.lng);
      const regionOffset = getRegionPinOffset(group.region, duplicateIndex);
      const pinOffset: PinDisplayOffset = duplicateIndex > 0
        ? {
          x: regionOffset.x + duplicateIndex * 18,
          y: regionOffset.y + duplicateIndex * 14,
        }
        : regionOffset;
      bounds.extend(position);

      const marker = document.createElement('button');
      marker.type = 'button';
      marker.className = 'oneday-recruit-kakao-pin oneday-recruit-kakao-pin--offset';
      marker.dataset.region = group.region;
      marker.dataset.lat = String(group.coordinates.lat);
      marker.dataset.lng = String(group.coordinates.lng);
      marker.dataset.offsetX = String(pinOffset.x);
      marker.dataset.offsetY = String(pinOffset.y);
      marker.style.setProperty('--pin-offset-x', `${pinOffset.x}px`);
      marker.style.setProperty('--pin-offset-y', `${pinOffset.y}px`);
      marker.title = `${group.region} 원데이 모집 링크 ${group.links.length}개`;
      marker.innerHTML = `<strong>${group.region}</strong><small>${group.links.length}</small>`;
      marker.addEventListener('click', () => {
        regionRefs.current[group.region]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content: marker,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 40 + index,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    if (regionGroups.length > 1) {
      map.setBounds(bounds, 48, 36, 48, 36);
      map.setDraggable(false);
      map.setZoomable(false);
    } else {
      map.setCenter(new window.kakao.maps.LatLng(KOREA_CENTER.lat, KOREA_CENTER.lng));
      map.setLevel(13);
    }

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [mapReady, regionGroups]);

  const openEdit = (link: SwingOneDayRecruitLink) => {
    if (!canEditLinks) {
      alert('로그인 후 수정할 수 있습니다.');
      return;
    }

    setEditingLink(link);
    setDraft({
      id: link.id,
      community: link.community,
      venue: link.venue || '',
      region: getEditableRegionValue(link),
      area: link.area,
      url: link.url,
      coordinates: link.coordinates,
      logoSourceUrl: link.logoSourceUrl || link.logo?.sourceUrl || '',
      logo: link.logo,
    });
  };

  const closeEdit = () => {
    if (isSaving) return;
    setEditingLink(null);
    setDraft(null);
  };

  const updateDraft = <K extends keyof OneDayLinkDraft>(key: K, value: OneDayLinkDraft[K]) => {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  };

  const updateDraftRegion = (nextRegion: string) => {
    setDraft((current) => {
      if (!current) return current;
      if (current.region === nextRegion) return current;
      return { ...current, region: nextRegion, area: '' };
    });
  };

  const saveEdit = async () => {
    if (!draft) return;
    if (!user) {
      alert('로그인 후 수정할 수 있습니다.');
      return;
    }

    const community = draft.community.trim();
    const url = draft.url.trim();
    if (!community || !url) {
      alert('커뮤니티명, 지역, 링크는 비울 수 없습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const location = await resolveDraftLocation(draft);
      const nextRow = {
        community,
        venue: (draft.venue || '').trim() || null,
        region: location.region,
        area: location.area,
        url,
        lat: location.coordinates.lat,
        lng: location.coordinates.lng,
      };

      if (!nextRow.region) {
        alert('지역을 선택해주세요.');
        return;
      }

      const { data, error } = await supabase
        .from(ONE_DAY_LINKS_TABLE)
        .update(nextRow)
        .eq('id', draft.id)
        .select(ONE_DAY_LINK_SELECT)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('원데이 링크 DB 행을 찾지 못했습니다.');
      const updatedLink = rowToRecruitLink(data as OneDayRecruitLinkRow);
      setDbLinks((current) => updateLinkList(current, updatedLink));
      closeEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : '저장 실패';
      alert(`수정 저장 실패: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const discoverAndSaveLogo = async () => {
    if (!draft) return;
    if (!user) {
      alert('로그인 후 수정할 수 있습니다.');
      return;
    }

    setLogoAction('saving');
    try {
      const result = await requestLogoMutation({
        action: 'discoverAndSave',
        linkId: draft.id,
        linkUrl: draft.url,
      });
      if (result.link) {
        setDbLinks((current) => updateLinkList(current, rowToRecruitLink(result.link as OneDayRecruitLinkRow)));
      }
      setDraft((current) => current ? {
        ...current,
        logo: result.logo || current.logo,
        logoSourceUrl: result.sourceUrl || current.logoSourceUrl,
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : '로고 자동 저장 실패';
      alert(`로고 자동 저장 실패: ${message}`);
    } finally {
      setLogoAction(null);
    }
  };

  const uploadLogoFile = async (file: File) => {
    if (!draft) return;
    if (!user) {
      alert('로그인 후 수정할 수 있습니다.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    setLogoAction('uploading');
    try {
      const imageBase64 = await fileToBase64(file);
      const result = await requestLogoMutation({
        action: 'uploadLogo',
        linkId: draft.id,
        fileName: file.name,
        contentType: file.type,
        imageBase64,
      });
      if (result.link) {
        setDbLinks((current) => updateLinkList(current, rowToRecruitLink(result.link as OneDayRecruitLinkRow)));
      }
      setDraft((current) => current ? {
        ...current,
        logo: result.logo || current.logo,
        logoSourceUrl: result.sourceUrl || '',
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : '로고 업로드 실패';
      alert(`로고 업로드 실패: ${message}`);
    } finally {
      setLogoAction(null);
    }
  };

  const deleteLogo = async () => {
    if (!draft?.logo) return;
    if (!canDeleteLogo) {
      alert('삭제는 관리자만 가능합니다.');
      return;
    }

    setLogoAction('deleting');
    try {
      const result = await requestLogoMutation({
        action: 'deleteLogo',
        linkId: draft.id,
      });
      if (result.link) {
        setDbLinks((current) => updateLinkList(current, rowToRecruitLink(result.link as OneDayRecruitLinkRow)));
      }
      setDraft((current) => current ? {
        ...current,
        logo: undefined,
        logoSourceUrl: '',
      } : current);
    } catch (error) {
      const message = error instanceof Error ? error.message : '로고 삭제 실패';
      alert(`로고 삭제 실패: ${message}`);
    } finally {
      setLogoAction(null);
    }
  };

  const deleteRecruitLink = async (link: SwingOneDayRecruitLink) => {
    if (!canDeleteLinks) {
      alert('삭제는 관리자만 가능합니다.');
      return;
    }

    const confirmed = window.confirm(`${link.community} 원데이 모집 링크를 삭제할까요?`);
    if (!confirmed) return;

    setDeletingLinkId(link.id);
    try {
      await requestLogoMutation({
        action: 'deleteLink',
        linkId: link.id,
      });
      setDbLinks((current) => normalizeRecruitLinks(current.filter((item) => item.id !== link.id)));
      if (draft?.id === link.id) closeEdit();
    } catch (error) {
      const message = error instanceof Error ? error.message : '링크 삭제 실패';
      alert(`링크 삭제 실패: ${message}`);
    } finally {
      setDeletingLinkId(null);
    }
  };

  return (
    <main className="oneday-recruit-page">
      <section className="oneday-recruit-inner">
        <header className="oneday-recruit-hero">
          <h1>스윙 원데이 모집</h1>
        </header>

        <div className="oneday-recruit-toolbar">
          <strong>일상의 취미생활 스윙댄스 체험</strong>
          <span>지역별 원데이 모집 링크</span>
        </div>

        {isLoadingLinks ? (
          <div className="oneday-recruit-sync">원데이 링크 확인 중</div>
        ) : null}

        {isUsingFallbackLinks ? (
          <div className="oneday-recruit-sync">DB 연결 전 기본 링크로 표시 중</div>
        ) : null}

        <section className="oneday-recruit-map-section" aria-label="지역별 원데이 모집 지도">
          <div className="oneday-recruit-kakao-map-wrap">
            <div ref={mapContainerRef} className="oneday-recruit-kakao-map" />
            {!mapReady && !mapLoadFailed ? (
              <div className="oneday-recruit-map-state">
                <i className="ri-map-2-line" aria-hidden="true" />
                <span>지도 준비 중</span>
              </div>
            ) : null}
            {mapLoadFailed ? (
              <div className="oneday-recruit-map-state">
                <i className="ri-map-pin-off-line" aria-hidden="true" />
                <span>지도를 불러오지 못했습니다</span>
              </div>
            ) : null}
          </div>

          <div className="oneday-recruit-region-list">
            {regionGroups.map((group) => (
              <section
                key={group.region}
                className="oneday-recruit-region-group"
                ref={(node) => {
                  regionRefs.current[group.region] = node;
                }}
              >
                <h2>{group.region}</h2>
                <div className="oneday-recruit-region-links">
                  {group.links.map((link) => (
                    <OneDayLinkCard
                      key={link.id}
                      link={link}
                      canEdit={canEditLinks}
                      canDelete={canDeleteLinks}
                      isDeleting={deletingLinkId === link.id}
                      onEdit={openEdit}
                      onDelete={deleteRecruitLink}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </section>

      </section>

      {editingLink && draft ? (
        <div className="oneday-recruit-edit-overlay" role="dialog" aria-modal="true" aria-label={`${editingLink.community} 링크 수정`}>
          <div className="oneday-recruit-edit-modal">
            <header>
              <strong>{editingLink.community}</strong>
              <button type="button" onClick={closeEdit} aria-label="닫기">
                <i className="ri-close-line" aria-hidden="true" />
              </button>
            </header>

            <label>
              <span>커뮤니티명</span>
              <input value={draft.community} onChange={(event) => updateDraft('community', event.target.value)} />
            </label>
            <label>
              <span>장소/거점</span>
              <input value={draft.venue || ''} onChange={(event) => updateDraft('venue', event.target.value)} />
            </label>
            <label>
              <span>지역</span>
              <input
                className="oneday-recruit-region-input"
                list="oneday-recruit-region-options-edit"
                value={draft.region}
                onChange={(event) => updateDraftRegion(event.target.value)}
                placeholder="서울, 부산, 청주..."
                autoComplete="off"
              />
              <datalist id="oneday-recruit-region-options-edit">
                {ONE_DAY_REGION_OPTIONS.map((option) => (
                  <option key={option.label} value={option.label} label={option.province} />
                ))}
              </datalist>
            </label>
            <label>
              <span>세부 지역</span>
              <input value={draft.area} onChange={(event) => updateDraft('area', event.target.value)} />
            </label>
            <label>
              <span>링크</span>
              <input value={draft.url} inputMode="url" onChange={(event) => updateDraft('url', event.target.value)} />
            </label>

            <div className="oneday-recruit-logo-editor">
              <div className="oneday-recruit-logo-preview" aria-hidden="true">
                {getLogoImage(draft) ? (
                  <img
                    src={getLogoImage(draft) || ''}
                    alt=""
                    onError={(event) => {
                      event.currentTarget.remove();
                    }}
                  />
                ) : null}
                <span>{getLogoInitials(draft.community)}</span>
              </div>
              <div className="oneday-recruit-logo-copy">
                <strong>로고 이미지</strong>
                <span>업로드하면 서버에 4개 크기로 저장됩니다.</span>
              </div>
              <div className="oneday-recruit-logo-actions">
                <input
                  ref={logoFileInputRef}
                  className="oneday-recruit-logo-upload-input"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void uploadLogoFile(file);
                    event.currentTarget.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoFileInputRef.current?.click()}
                  disabled={Boolean(logoAction) || isSaving}
                >
                  {logoAction === 'uploading' ? '업로드 중' : '이미지 업로드'}
                </button>
                <button type="button" onClick={discoverAndSaveLogo} disabled={Boolean(logoAction) || isSaving}>
                  {logoAction === 'saving' ? '저장 중' : '자동 찾기'}
                </button>
                {canDeleteLogo ? (
                  <button type="button" onClick={deleteLogo} disabled={Boolean(logoAction) || isSaving || !draft.logo}>
                    {logoAction === 'deleting' ? '삭제 중' : '로고 삭제'}
                  </button>
                ) : null}
              </div>
            </div>

            {canDeleteLinks ? (
              <button
                type="button"
                className="oneday-recruit-link-delete-btn"
                onClick={() => deleteRecruitLink(draft)}
                disabled={isSaving || Boolean(logoAction) || deletingLinkId === draft.id}
              >
                <i className="ri-delete-bin-line" aria-hidden="true" />
                <span>{deletingLinkId === draft.id ? '링크 삭제 중' : '링크 삭제'}</span>
              </button>
            ) : null}

            <footer>
              <button type="button" onClick={closeEdit} disabled={isSaving}>취소</button>
              <button type="button" onClick={saveEdit} disabled={isSaving}>
                {isSaving ? '저장 중' : '저장'}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
