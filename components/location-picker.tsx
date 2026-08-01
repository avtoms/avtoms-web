"use client";

// Pick where a service actually is, on a map, and keep the coordinates.
//
// The address field next to this one is what prints on a customer's check — a line a person
// reads. It cannot tell anybody where to drive, and parsing one back into a point is a job
// nobody should be doing. So the point is captured directly: click the map, or drag the pin.
//
// Leaflet with OpenStreetMap tiles, deliberately: no API key, no account, no billing, and
// nothing to expire quietly six months from now. The volume here is one operator registering
// shops, which is well inside OSM's terms.

import { useEffect, useRef, useState } from "react";
// Static, not awaited alongside the library: Next collects CSS at build time, and a
// dynamically imported stylesheet is not a module it can type or bundle.
import "leaflet/dist/leaflet.css";
import { Crosshair, MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Tashkent. Where the map opens when no pin has been placed — a world view would make the
// operator zoom in from orbit every single time.
const DEFAULT_CENTER: [number, number] = [41.3111, 69.2797];
const DEFAULT_ZOOM = 11;
const PLACED_ZOOM = 16;

// 0/0 is the agreed "not placed": it is in the Gulf of Guinea, so it can never be a real
// service, and it saves carrying a separate flag.
export const hasPoint = (lat?: number, lng?: number) =>
  typeof lat === "number" && typeof lng === "number" && (lat !== 0 || lng !== 0);

// Six decimals is about 10 cm. Beyond that is noise, and the extra digits make the readout
// unreadable at a glance.
const fmt = (n: number) => n.toFixed(6);

export function LocationPicker({ lat, lng, onChange, className }: {
  lat?: number;
  lng?: number;
  onChange: (lat: number, lng: number) => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<import("leaflet").Map | null>(null);
  const marker = useRef<import("leaflet").Marker | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  // onChange is called from Leaflet handlers that are bound once, so it is read through a ref
  // rather than closed over — otherwise the map would keep calling the first render's version.
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!host.current || map.current) return;
    let cancelled = false;

    // Imported at run time, not build time: Leaflet touches `window` on load, which breaks a
    // server render outright.
    void (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !host.current) return;

      const m = L.map(host.current, { attributionControl: true, zoomControl: true })
        .setView(hasPoint(lat, lng) ? [lat!, lng!] : DEFAULT_CENTER,
          hasPoint(lat, lng) ? PLACED_ZOOM : DEFAULT_ZOOM);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m);

      // A divIcon rather than Leaflet's default marker: the default points at PNG files by
      // relative URL, which every bundler breaks, and the classic symptom is an invisible pin
      // with no error anywhere. Inline SVG has nothing to go missing.
      const icon = L.divIcon({
        className: "",
        html: `<svg width="30" height="40" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                 <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="#e5484d"/>
                 <circle cx="12" cy="12" r="4.5" fill="#fff"/>
               </svg>`,
        iconSize: [30, 40],
        iconAnchor: [15, 40], // the point of the pin, not its middle
      });

      const place = (la: number, ln: number) => {
        if (marker.current) marker.current.setLatLng([la, ln]);
        else {
          marker.current = L.marker([la, ln], { icon, draggable: true }).addTo(m);
          marker.current.on("dragend", () => {
            const p = marker.current!.getLatLng();
            cb.current(p.lat, p.lng);
          });
        }
        cb.current(la, ln);
      };

      m.on("click", (e: import("leaflet").LeafletMouseEvent) => place(e.latlng.lat, e.latlng.lng));
      if (hasPoint(lat, lng)) place(lat!, lng!);

      map.current = m;
      // The map is built inside a drawer that animates open. Leaflet measures its container
      // once at construction, so a map created mid-animation renders a grey strip with the
      // tiles in the wrong places until something makes it measure again.
      setTimeout(() => m.invalidateSize(), 60);
      setTimeout(() => m.invalidateSize(), 400);
    })();

    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
    // Built once. Later coordinate changes are pushed in by the effect below rather than by
    // tearing the map down and rebuilding it under the operator's cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow a point set from outside — the "my location" button, or an edit dialog loading a
  // shop that already has one.
  useEffect(() => {
    if (!map.current || !hasPoint(lat, lng)) return;
    const p: [number, number] = [lat!, lng!];
    if (marker.current) marker.current.setLatLng(p);
    map.current.setView(p, Math.max(map.current.getZoom(), PLACED_ZOOM));
  }, [lat, lng]);

  const locate = () => {
    if (!navigator.geolocation) { setError("Brauzer joylashuvni qo'llab-quvvatlamaydi"); return; }
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange(pos.coords.latitude, pos.coords.longitude);
      },
      // Denied permission is the common case and is not a failure worth a red banner, but it
      // does need saying — otherwise the button looks broken.
      () => { setLocating(false); setError("Joylashuvni aniqlab bo'lmadi — xaritadan tanlang"); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const clear = () => {
    marker.current?.remove();
    marker.current = null;
    onChange(0, 0);
  };

  const placed = hasPoint(lat, lng);
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div ref={host} className="h-[240px] w-full overflow-hidden rounded-[11px] border border-border" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} disabled={locating}
          className="inline-flex appearance-none items-center gap-1.5 rounded-[9px] border border-border bg-card px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground hover:bg-secondary disabled:opacity-60">
          <Crosshair className="size-3.5" />{locating ? "Aniqlanmoqda…" : "Mening joylashuvim"}
        </button>
        {placed ? (
          <>
            {/* The numbers, visible. A pin the operator cannot read back is a pin they cannot
                check against anything, and this is the value that actually gets stored. */}
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground">
              <MapPin className="size-3.5 text-destructive" />{fmt(lat!)}, {fmt(lng!)}
            </span>
            <button type="button" onClick={clear}
              className="inline-flex appearance-none items-center gap-1 border-0 bg-transparent p-0 text-[12.5px] font-semibold text-muted-foreground hover:text-destructive">
              <X className="size-3.5" />Tozalash
            </button>
          </>
        ) : (
          <span className="text-[12px] text-muted-foreground">Xaritani bosing yoki nishonni suring</span>
        )}
      </div>
      {error && <span className="text-[12px] text-destructive">{error}</span>}
    </div>
  );
}
