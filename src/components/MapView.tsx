"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { SITE } from "@/lib/site";
import type { MapPoint } from "./map-utils";

export default function MapView({
  points, me, onPick, picked, draggable = false, fitAll = false, className = "h-[65vh]",
}: {
  points: MapPoint[];
  me?: [number, number] | null;
  onPick?: (lat: number, lng: number) => void;
  picked?: [number, number] | null;
  // The picked pin can be dragged (reported through onPick).
  draggable?: boolean;
  // Fit the view to every point, however many (e.g. all stores of one chain).
  fitAll?: boolean;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const meLayer = useRef<L.LayerGroup | null>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    const m = L.map(el.current!, { center: SITE.center, zoom: 11 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    meLayer.current = L.layerGroup().addTo(m);
    m.on("click", (e) => onPickRef.current?.(e.latlng.lat, e.latlng.lng));
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const group = layer.current!;
    group.clearLayers();
    for (const p of points) {
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<span style="display:grid;place-items:center;width:32px;height:32px;font-size:17px;background:var(--surface);border:2px solid var(--accent);border-radius:50%;box-shadow:0 1px 4px rgb(0 0 0/.25)">${p.icon}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
          popupAnchor: [0, -14],
        }),
      })
        .bindPopup(p.popupHtml, { maxWidth: 260 })
        .addTo(group);
    }
    // Fit to markers only when the set of points is small and local (e.g. brand page), unless asked to.
    if (points.length > 0 && (fitAll || points.length <= 30) && map.current) {
      // No animation: removing the map mid-animation (e.g. searching another brand) makes Leaflet throw.
      map.current.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { maxZoom: 15, padding: [30, 30], animate: false });
    }
  }, [points, fitAll]);

  useEffect(() => {
    const group = meLayer.current!;
    group.clearLayers();
    const spot = picked ?? me;
    if (!spot) return;
    if (picked && draggable) {
      L.marker(spot, {
        draggable: true,
        icon: L.divIcon({
          className: "",
          html: '<span style="display:block;width:22px;height:22px;background:#3b82f6;border:3px solid #2563eb;border-radius:50%;box-shadow:0 1px 4px rgb(0 0 0/.35)"></span>',
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      })
        .on("dragend", (e) => {
          const { lat, lng } = (e.target as L.Marker).getLatLng();
          onPickRef.current?.(lat, lng);
        })
        .addTo(group);
    } else {
      L.circleMarker(spot, { radius: 9, color: "#2563eb", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 3 }).addTo(group);
    }
    // Don't jump around while someone fine-tunes the pin: only move when it's off screen or zoomed far out.
    const m = map.current;
    if (m && (m.getZoom() < 14 || !m.getBounds().contains(spot))) m.setView(spot, Math.max(m.getZoom(), 14), { animate: false });
  }, [me, picked, draggable]);

  return <div ref={el} className={`w-full overflow-hidden rounded-2xl border border-border ${onPick ? "cursor-crosshair" : ""} ${className}`} />;
}
