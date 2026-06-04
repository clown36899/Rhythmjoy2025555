import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
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

interface OneDayRecruitRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ONE_DAY_LINKS_TABLE = 'swing_oneday_recruit_links';
const ONE_DAY_LINK_SELECT = 'id,community,venue,region,area,lat,lng,url,logo_source_url,logo_micro,logo_thumbnail,logo_medium,logo_full,logo_storage_path,logo_updated_at,sort_order,is_active';
const ONE_DAY_LOGO_FUNCTION_PATH = '/.netlify/functions/oneday-recruit-logo';

const EMPTY_FORM = {
  community: '',
  venue: '',
  region: '',
  area: '',
  url: '',
};

function compareRegionLabel(a: string, b: string): number {
  const aIndex = REGION_SORT_INDEX.get(a);
  const bIndex = REGION_SORT_INDEX.get(b);
  if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
  if (aIndex !== undefined) return -1;
  if (bIndex !== undefined) return 1;
  return a.localeCompare(b, 'ko');
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

function inferPrimaryRegionFromText(...parts: Array<string | null | undefined>) {
  return getRegionLabelsFromText(parts.filter(Boolean).join(' / '))[0] || '';
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
  const services = (window as any).kakao?.maps?.services;
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

async function resolveLocation(form: typeof EMPTY_FORM) {
  const selectedRegion = form.region.trim();
  const text = [selectedRegion, form.area, form.venue, form.community].filter(Boolean).join(' / ');
  let region = selectedRegion || inferPrimaryRegionFromText(text);
  if (!region) region = await resolveKakaoRegionFromQuery(text);
  const normalizedRegion = region || form.region.trim();
  return {
    region: normalizedRegion,
    area: getAreaForSelectedRegion(form.area, selectedRegion, normalizedRegion),
    coordinates: REGION_COORDINATES[normalizedRegion] || KOREA_CENTER,
  };
}

function getLogoInitials(community: string): string {
  const normalized = community.replace(/\s+/g, '').trim();
  if (!normalized) return 'S';
  const ascii = normalized.match(/[A-Za-z0-9]/g)?.slice(0, 2).join('').toUpperCase();
  if (ascii) return ascii;
  return [...normalized].slice(0, 2).join('');
}

function createLinkId() {
  return `oneday-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

async function requestLogoUpload(linkId: string, file: File) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('로그인 후 로고를 업로드할 수 있습니다.');

  const imageBase64 = await fileToBase64(file);
  const response = await fetch(ONE_DAY_LOGO_FUNCTION_PATH, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'uploadLogo',
      linkId,
      fileName: file.name,
      contentType: file.type,
      imageBase64,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String(result.error || `로고 업로드 실패 (${response.status})`));
  }
  return result as { link?: OneDayRecruitLinkRow };
}

export default function OneDayRecruitRegistrationModal({
  isOpen,
  onClose,
}: OneDayRecruitRegistrationModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const previewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : ''), [logoFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!isOpen) {
      setForm(EMPTY_FORM);
      setLogoFile(null);
      setIsSaving(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updateForm = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateRegion = (nextRegion: string) => {
    setForm((current) => {
      if (current.region === nextRegion) return current;
      return { ...current, region: nextRegion, area: '' };
    });
  };

  const handleClose = () => {
    if (isSaving) return;
    onClose();
  };

  const saveLink = async () => {
    if (!user) {
      alert('원데이 모집 링크 등록은 로그인 후 가능합니다.');
      return;
    }

    const community = form.community.trim();
    const url = form.url.trim();
    if (!community || !url) {
      alert('커뮤니티명과 링크는 비울 수 없습니다.');
      return;
    }

    try {
      new URL(url);
    } catch {
      alert('링크는 http:// 또는 https://로 시작하는 전체 URL이어야 합니다.');
      return;
    }

    if (logoFile && !logoFile.type.startsWith('image/')) {
      alert('로고는 이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    setIsSaving(true);
    try {
      const location = await resolveLocation(form);
      if (!location.region) {
        alert('지역을 선택해주세요.');
        return;
      }

      const linkId = createLinkId();
      const { data: lastRow } = await supabase
        .from(ONE_DAY_LINKS_TABLE)
        .select('sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const sortOrder = Number((lastRow as { sort_order?: number } | null)?.sort_order || 0) + 10;
      const insertRow = {
        id: linkId,
        community,
        venue: form.venue.trim() || null,
        region: location.region,
        area: location.area,
        lat: location.coordinates.lat,
        lng: location.coordinates.lng,
        url,
        sort_order: sortOrder,
        is_active: true,
      };

      const { data, error } = await supabase
        .from(ONE_DAY_LINKS_TABLE)
        .insert(insertRow)
        .select(ONE_DAY_LINK_SELECT)
        .single();

      if (error) throw error;
      if (!data) throw new Error('등록된 원데이 링크를 확인하지 못했습니다.');

      if (logoFile) {
        try {
          await requestLogoUpload(linkId, logoFile);
        } catch (logoError) {
          const message = logoError instanceof Error ? logoError.message : '로고 업로드 실패';
          alert(`링크는 등록됐지만 로고 업로드에 실패했습니다: ${message}`);
        }
      }

      window.dispatchEvent(new CustomEvent('onedayRecruitLinksChanged'));
      onClose();
      navigate('/oneday-recruits');
    } catch (error) {
      const message = error instanceof Error ? error.message : '등록 실패';
      alert(`원데이 등록 실패: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="oneday-recruit-edit-overlay" role="dialog" aria-modal="true" aria-label="원데이 모집 링크 등록">
      <div className="oneday-recruit-edit-modal">
        <header>
          <strong>원데이 모집 링크 등록</strong>
          <button type="button" onClick={handleClose} aria-label="닫기">
            <i className="ri-close-line" aria-hidden="true" />
          </button>
        </header>

        <label>
          <span>커뮤니티명</span>
          <input value={form.community} onChange={(event) => updateForm('community', event.target.value)} placeholder="네오스윙" />
        </label>
        <label>
          <span>장소/거점</span>
          <input value={form.venue} onChange={(event) => updateForm('venue', event.target.value)} placeholder="해피홀" />
        </label>
        <label>
          <span>지역</span>
          <input
            className="oneday-recruit-region-input"
            list="oneday-recruit-region-options-register"
            value={form.region}
            onChange={(event) => updateRegion(event.target.value)}
            placeholder="서울, 부산, 청주..."
            autoComplete="off"
          />
          <datalist id="oneday-recruit-region-options-register">
            {ONE_DAY_REGION_OPTIONS.map((option) => (
              <option key={option.label} value={option.label} label={option.province} />
            ))}
          </datalist>
        </label>
        <label>
          <span>세부 지역</span>
          <input value={form.area} onChange={(event) => updateForm('area', event.target.value)} placeholder="방배, 해피홀 인근 등" />
        </label>
        <label>
          <span>링크</span>
          <input value={form.url} inputMode="url" onChange={(event) => updateForm('url', event.target.value)} placeholder="https://..." />
        </label>

        <div className="oneday-recruit-logo-editor">
          <div className="oneday-recruit-logo-preview" aria-hidden="true">
            {previewUrl ? <img src={previewUrl} alt="" /> : null}
            <span>{getLogoInitials(form.community)}</span>
          </div>
          <div className="oneday-recruit-logo-copy">
            <strong>로고 이미지</strong>
            <span>업로드하면 서버에 4개 크기로 저장됩니다.</span>
          </div>
          <div className="oneday-recruit-logo-actions">
            <input
              ref={fileInputRef}
              className="oneday-recruit-logo-upload-input"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setLogoFile(file);
                event.currentTarget.value = '';
              }}
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
              {logoFile ? '이미지 변경' : '이미지 업로드'}
            </button>
            <button type="button" onClick={() => setLogoFile(null)} disabled={isSaving || !logoFile}>
              선택 해제
            </button>
          </div>
        </div>

        <footer>
          <button type="button" onClick={handleClose} disabled={isSaving}>취소</button>
          <button type="button" onClick={saveLink} disabled={isSaving}>
            {isSaving ? '등록 중' : '등록'}
          </button>
        </footer>
      </div>
    </div>
  );
}
