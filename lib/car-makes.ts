"use client";
// Shared, lazily-cached lookup of brand logos by make name. The car catalog is small,
// global reference data, so we fetch it once per session and share it across every CarImage.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CarMake } from "@/lib/types";

let cache: Map<string, string> | null = null; // normalized make name → logoUrl
let inflight: Promise<Map<string, string>> | null = null;

const norm = (s: string) => s.trim().toLowerCase();

function load(): Promise<Map<string, string>> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = api
      .listCarMakes()
      .then((makes: CarMake[]) => {
        const m = new Map<string, string>();
        for (const make of makes) if (make.logoUrl) m.set(norm(make.name), make.logoUrl);
        cache = m;
        return m;
      })
      .catch(() => {
        cache = new Map();
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

// Call after editing a make so the next lookup re-fetches fresh logos.
export function invalidateCarMakeLogos() {
  cache = null;
  inflight = null;
}

// Returns the uploaded brand logo URL for a make name, or undefined while loading / when none.
export function useCarMakeLogo(make?: string): string | undefined {
  const [map, setMap] = useState<Map<string, string> | null>(cache);
  useEffect(() => {
    if (!cache) {
      let alive = true;
      load().then((m) => alive && setMap(m));
      return () => {
        alive = false;
      };
    }
  }, []);
  if (!make) return undefined;
  return (map ?? cache)?.get(norm(make));
}
