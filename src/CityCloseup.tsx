import { useEffect, useRef } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type CityPlace = {
  id: string;
  username: string;
  city: string;
  lat: number;
  lon: number;
  level: number;
  totalCoins: number;
};

function safe(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}

export default function CityCloseup({ place, visible }: { place: CityPlace | null; visible: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const focusLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!place || !hostRef.current || mapRef.current) return;
    const map = L.map(hostRef.current, {
      center: [place.lat, place.lon],
      zoom: 5,
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      preferCanvas: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 19,
      detectRetina: true,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
      updateWhenZooming: true,
      keepBuffer: 4,
    }).addTo(map);

    focusLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
      focusLayerRef.current = null;
    };
  }, [place?.id]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = focusLayerRef.current;
    if (!map || !layer || !place) return;

    layer.clearLayers();
    const radius = 70 + Math.min(place.level, 6) * 70;
    const gold = place.level >= 6;

    L.circle([place.lat, place.lon], {
      radius,
      color: gold ? '#ffd86a' : '#6de7ff',
      weight: 2,
      opacity: 0.95,
      fillColor: gold ? '#ffd86a' : '#37d8ff',
      fillOpacity: 0.1,
    }).addTo(layer);

    L.circle([place.lat, place.lon], {
      radius: Math.max(28, radius * 0.42),
      color: '#ffffff',
      weight: 1,
      opacity: 0.35,
      fillOpacity: 0,
    }).addTo(layer);

    L.circleMarker([place.lat, place.lon], {
      radius: 10 + place.level * 2.5,
      color: '#ffffff',
      weight: 2,
      fillColor: gold ? '#ffd86a' : '#63e8ff',
      fillOpacity: 0.98,
    }).addTo(layer);

    const icon = L.divIcon({
      className: 'city-name-icon',
      html: `<div><strong>@${safe(place.username)}</strong><span>${safe(place.city)}</span><small>${place.totalCoins.toLocaleString()} gift points · permanent place</small></div>`,
      iconSize: [250, 92],
      iconAnchor: [125, 122],
    });
    L.marker([place.lat, place.lon], { icon, interactive: false }).addTo(layer);

    map.setView([place.lat, place.lon], 5, { animate: false });
    window.setTimeout(() => {
      map.invalidateSize();
      map.flyTo([place.lat, place.lon], place.level >= 5 ? 18 : place.level >= 3 ? 17 : 16, { animate: true, duration: 2.1 });
    }, 100);
  }, [place]);

  return (
    <div className={visible ? 'city-closeup visible' : 'city-closeup'}>
      <div ref={hostRef} className="city-map" />
      <div className="city-scan-lines" />
      <div className="city-hud"><span>LIVE EARTH · HIGH DETAIL</span><b>{place ? `@${place.username} · ${place.city}` : ''}</b></div>
    </div>
  );
}
