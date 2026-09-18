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
      zoom: 4,
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      preferCanvas: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
    }).addTo(map);
    focusLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      focusLayerRef.current = null;
    };
  }, [place]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = focusLayerRef.current;
    if (!map || !layer || !place) return;
    layer.clearLayers();
    const radius = 80 + Math.min(place.level, 6) * 65;
    L.circle([place.lat, place.lon], {
      radius,
      color: place.level >= 6 ? '#ffd86a' : '#6de7ff',
      weight: 2,
      opacity: 0.9,
      fillColor: place.level >= 6 ? '#ffd86a' : '#37d8ff',
      fillOpacity: 0.12,
    }).addTo(layer);
    L.circleMarker([place.lat, place.lon], {
      radius: 10 + place.level * 2,
      color: '#ffffff',
      weight: 2,
      fillColor: place.level >= 6 ? '#ffd86a' : '#63e8ff',
      fillOpacity: 0.95,
    }).addTo(layer);
    const icon = L.divIcon({
      className: 'city-name-icon',
      html: `<div><strong>@${safe(place.username)}</strong><span>${safe(place.city)}</span><small>${place.totalCoins.toLocaleString()} gift points</small></div>`,
      iconSize: [220, 84],
      iconAnchor: [110, 110],
    });
    L.marker([place.lat, place.lon], { icon, interactive: false }).addTo(layer);
    map.setView([place.lat, place.lon], 4, { animate: false });
    window.setTimeout(() => {
      map.invalidateSize();
      map.flyTo([place.lat, place.lon], place.level >= 5 ? 16 : 15, { animate: true, duration: 2.15 });
    }, 90);
  }, [place]);

  return (
    <div className={visible ? 'city-closeup visible' : 'city-closeup'}>
      <div ref={hostRef} className="city-map" />
      <div className="city-scan-lines" />
      <div className="city-hud"><span>LIVE EARTH · CITY VIEW</span><b>{place?.city || ''}</b></div>
    </div>
  );
}
