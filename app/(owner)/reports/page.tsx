"use client";
// The Reports page is gone: four of its eight tiles never returned a row, because they were
// fed by an event projection that only knew what had crossed the broker since it shipped.
// Everything it did well now lives on Statistics, computed live over the whole history.
// Kept as a redirect so existing links and bookmarks land somewhere useful.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui-kit/misc";

export default function ReportsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/statistics"); }, [router]);
  return <div className="grid min-h-[40vh] place-items-center"><Spinner className="size-6" /></div>;
}
