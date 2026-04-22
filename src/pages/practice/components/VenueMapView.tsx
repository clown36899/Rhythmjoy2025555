import { useEffect, useRef, useState } from "react";
import "./VenueMapView.css";

declare global {
    interface Window { kakao: any; }
}

interface Venue {
    id: string;
    name: string;
    address: string;
    images?: any;
}

interface Props {
    venues: Venue[];
    onVenueClick: (venueId: string) => void;
}

const coordCache: Record<string, { lat: number; lng: number }> = {};

function getThumbnail(venue: Venue): string {
    if (!venue.images) return "";
    try {
        const imgs = typeof venue.images === "string" ? JSON.parse(venue.images) : venue.images;
        if (Array.isArray(imgs) && imgs.length > 0) {
            const first = imgs[0];
            return first.url || first.thumbnail || (typeof first === "string" ? first : "");
        }
    } catch { /* ignore */ }
    return "";
}

export default function VenueMapView({ venues, onVenueClick }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const overlaysRef = useRef<any[]>([]);
    const initialViewRef = useRef<{ center: any; level: number } | null>(null);
    const [mapReady, setMapReady] = useState(false);
    const [geocoding, setGeocoding] = useState(false);

    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;
        if (!window.kakao?.maps) return;
        window.kakao.maps.load(() => {
            if (!containerRef.current) return;
            mapRef.current = new window.kakao.maps.Map(containerRef.current, {
                center: new window.kakao.maps.LatLng(37.5665, 126.9780),
                level: 8,
            });
            setMapReady(true);
        });
    }, []);

    useEffect(() => {
        if (!mapReady) return;
        placeMarkers();
    }, [mapReady, venues.map(v => v.id).join(",")]);

    const geocodeAddress = (geocoder: any, address: string): Promise<{ lat: number; lng: number }> =>
        new Promise((resolve, reject) => {
            if (coordCache[address]) { resolve(coordCache[address]); return; }
            geocoder.addressSearch(address, (result: any[], status: any) => {
                if (status === window.kakao.maps.services.Status.OK) {
                    const c = { lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) };
                    coordCache[address] = c;
                    resolve(c);
                } else {
                    reject();
                }
            });
        });

    const placeMarkers = async () => {
        overlaysRef.current.forEach(o => o.setMap(null));
        overlaysRef.current = [];
        if (venues.length === 0) return;

        setGeocoding(true);
        const geocoder = new window.kakao.maps.services.Geocoder();
        const bounds = new window.kakao.maps.LatLngBounds();
        let placed = 0;
        const coordCounts: Record<string, number> = {};

        for (const venue of venues) {
            if (!venue.address) continue;
            try {
                const coord = await geocodeAddress(geocoder, venue.address);
                const coordKey = `${coord.lat.toFixed(5)},${coord.lng.toFixed(5)}`;
                const offset = coordCounts[coordKey] || 0;
                coordCounts[coordKey] = offset + 1;

                const pos = new window.kakao.maps.LatLng(
                    coord.lat + offset * 0.0001,
                    coord.lng + offset * 0.0001
                );

                const thumb = getThumbnail(venue);
                const el = document.createElement("div");
                el.className = "vmv-marker-container";
                el.setAttribute("data-venue-id", venue.id);
                el.innerHTML = `
                    <div class="vmv-marker-wrapper">
                        <div class="vmv-marker-icon">
                            <div class="vmv-marker">
                                <div class="vmv-marker-inner">
                                    ${thumb
                                        ? `<img src="${thumb}" alt="${venue.name}" />`
                                        : `<i class="ri-map-pin-2-fill"></i>`
                                    }
                                </div>
                            </div>
                            <div class="vmv-marker-tail"></div>
                        </div>
                        <div class="vmv-marker-label"><span>${venue.name}</span></div>
                    </div>
                `;
                el.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onVenueClick(venue.id);
                });

                const overlay = new window.kakao.maps.CustomOverlay({
                    position: pos,
                    content: el,
                    yAnchor: 1,
                    zIndex: 10 + offset,
                });
                overlay.setMap(mapRef.current);
                overlaysRef.current.push(overlay);
                bounds.extend(pos);
                placed++;
            } catch { /* geocode failed */ }
        }
        setGeocoding(false);

        if (placed > 1) {
            mapRef.current.setBounds(bounds, 30, 30, 30, 30);
        } else if (placed === 1) {
            mapRef.current.setLevel(5);
        }

        // 초기 뷰 저장 (리셋용)
        setTimeout(() => {
            initialViewRef.current = {
                center: mapRef.current.getCenter(),
                level: mapRef.current.getLevel(),
            };
        }, 100);
    };

    const handleReset = () => {
        if (!mapRef.current || !initialViewRef.current) return;
        mapRef.current.setCenter(initialViewRef.current.center);
        mapRef.current.setLevel(initialViewRef.current.level);
    };

    return (
        <div className="vmv-wrapper">
            <div ref={containerRef} className="vmv-map" />
            <button className="vmv-reset-btn" onClick={handleReset} title="초기 위치로">
                <i className="ri-focus-3-line"></i>
            </button>
            {geocoding && (
                <div className="vmv-geocoding-badge">
                    <i className="ri-loader-4-line"></i> 위치 로딩 중...
                </div>
            )}
        </div>
    );
}
