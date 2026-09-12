"use client";
// Reads a product barcode through the device camera.
//
// Most shops stock from a phone rather than a desk with a USB scanner, and typing thirteen
// digits off a curved oil bottle is where wrong barcodes come from.
//
// Detection prefers the browser's own BarcodeDetector (Chrome on Android has one, backed by the
// OS) and falls back to a WebAssembly build of ZXing everywhere else — iOS Safari and Firefox
// have none. The fallback is ~1 MB, so it is imported only when the dialog opens and never
// lands in the page bundle, and its .wasm is served from our own /public: the package default
// is jsDelivr, which is slow or unreachable from some networks here, and a scanner stuck on
// "starting" is worse than none.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ScanBarcode } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Input } from "@/components/ui-kit/input";
import { Spinner } from "@/components/ui-kit/misc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody } from "@/components/ui-kit/dialog";
import { useLang } from "@/components/providers";

// Retail and trade barcodes only. QR is left out on purpose: a QR on a part is a URL or a batch
// label, never the GTIN, and every extra format costs detection time on every frame.
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] as const;
const SCAN_EVERY_MS = 200;

// What the server accepts as a barcode: EAN-8, or UPC-A / EAN-13 / GTIN-14. Code 128 can carry
// anything, so a read only counts when it has this shape — the courier's tracking label on the
// same box must not be taken for the product.
export const isBarcode = (s: string) => /^(\d{8}|\d{12,14})$/.test(s);

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type NativeDetectorCtor = {
  new (opts: { formats: string[] }): Detector;
  getSupportedFormats: () => Promise<string[]>;
};

// Built once: prepareZXingModule compares overrides shallowly, so a fresh locateFile on every
// call would read as a change and throw the compiled module away.
const ZXING_OVERRIDES = {
  locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? "/zxing/" + path : prefix + path),
};

async function createDetector(): Promise<Detector> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      const formats = FORMATS.filter((f) => supported.includes(f));
      // EAN-13 is what nearly every box here carries. A native detector without it (some
      // desktop builds ship the API with QR only) is no use, and the fallback reads it fine.
      if (formats.includes("ean_13")) return new Native({ formats });
    } catch { /* fall through to the fallback */ }
  }
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  // fireImmediately fetches and compiles the wasm now, while the permission prompt is up,
  // and turns a missing file into an error here instead of a silent failure on every frame.
  await prepareZXingModule({ overrides: ZXING_OVERRIDES, fireImmediately: true });
  return new BarcodeDetector({ formats: [...FORMATS] });
}

// One detector per page load, so reopening the dialog does not recompile the wasm. A failed
// load is not kept: a connection that dropped mid-download should not break scanning until the
// page is reloaded.
let detector: Promise<Detector> | null = null;
function loadDetector(): Promise<Detector> {
  detector ??= createDetector().catch((e) => { detector = null; throw e; });
  return detector;
}

type Status = "starting" | "live" | "denied" | "nocam" | "insecure" | "failed";

function cameraError(e: unknown): Status {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "nocam";
  return "failed";   // NotReadableError: another app holds the camera
}

export function BarcodeScanner({ open, onClose, onDetected }: {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
}) {
  const { t } = useLang();
  const [status, setStatus] = useState<Status>("starting");
  const [manual, setManual] = useState("");
  const [manualBad, setManualBad] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // The latest callbacks, read at the moment of a hit. Depending on them instead would restart
  // the camera — and re-prompt on some browsers — every time the parent re-rendered.
  const cbs = useRef({ onClose, onDetected });
  useEffect(() => { cbs.current = { onClose, onDetected }; });

  // The dialog's content mounts a frame after `open` flips (the portal waits for the client),
  // so the stream may exist before the <video> does. Whichever arrives second joins them.
  const attach = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    const s = streamRef.current;
    if (el && s && el.srcObject !== s) {
      el.srcObject = s;
      el.play().catch(() => { /* autoplay of a muted inline video is allowed; nothing to do */ });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatus("starting"); setManual(""); setManualBad(false);
    // The camera API exists only in a secure context (https or localhost). Over plain http it
    // is simply undefined, so say why rather than report "no camera".
    if (!window.isSecureContext) { setStatus("insecure"); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setStatus("nocam"); return; }

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Every exit path goes through here. A track left running keeps the camera light on and
    // the camera locked for every other app until the tab is closed.
    const release = () => {
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
    };

    (async () => {
      // Started before the permission prompt so the download overlaps it rather than queueing.
      const det = loadDetector();
      det.catch(() => { /* awaited below */ });
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (e) {
        if (!stopped) setStatus(cameraError(e));
        return;
      }
      // Closed while the prompt was up: the camera came on for nobody.
      if (stopped) { stream.getTracks().forEach((tr) => tr.stop()); return; }
      streamRef.current = stream;
      attach(videoRef.current);

      let d: Detector;
      try { d = await det; } catch {
        if (!stopped) { release(); setStatus("failed"); }
        return;
      }
      if (stopped) return;
      setStatus("live");

      // A timeout chain rather than an interval: the wasm decoder can take longer than the
      // period on a cheap phone, and an interval would stack detections on top of each other.
      const tick = async () => {
        if (stopped) return;
        const v = videoRef.current;
        if (v && v.readyState >= 2 && v.videoWidth > 0) {
          try {
            const found = await d.detect(v);
            if (stopped) return;
            const code = found.map((b) => b.rawValue.trim()).find(isBarcode);
            if (code) {
              stopped = true;
              release();
              navigator.vibrate?.(60);
              cbs.current.onDetected(code);
              cbs.current.onClose();
              return;
            }
          } catch { /* a frame that cannot be read (mid-resize, not painted yet) is skipped */ }
        }
        timer = setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    })();

    return () => { stopped = true; release(); };
  }, [open, attach]);

  const submitManual = () => {
    const code = manual.replace(/\D/g, "");
    if (!isBarcode(code)) { setManualBad(true); return; }
    onDetected(code);
    onClose();
  };

  const problem =
    status === "denied" ? t("scan_denied")
    : status === "nocam" ? t("scan_no_camera")
    : status === "insecure" ? t("scan_insecure")
    : status === "failed" ? t("scan_failed")
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* No autofocus: it would land on the manual box and, on a phone, raise the keyboard
          over the very picture the user is trying to aim. */}
      <DialogContent className="max-w-[520px]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ScanBarcode className="size-5" /> {t("scan_title")}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          {problem ? (
            <div className="flex items-start gap-2.5 rounded-[12px] border border-border bg-warning-soft p-3.5 text-[13.5px] text-foreground">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>{problem}</span>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-[14px] bg-black">
              <video ref={attach} playsInline muted autoPlay className="aspect-[4/3] w-full object-cover" />
              {/* An aiming box. The detector reads the whole picture; the box only tells the
                  user where to hold the code, which is most of what makes a read quick. */}
              <div className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[34%] -translate-y-1/2 rounded-[12px] border-2 border-white/80" />
              {status === "starting" && (
                <div className="absolute inset-0 grid place-items-center bg-black/40 text-[13px] text-white">
                  <span className="flex items-center gap-2"><Spinner /> {t("scan_starting")}</span>
                </div>
              )}
            </div>
          )}
          {status === "live" && <p className="text-center text-[13px] text-muted-foreground">{t("scan_aim")}</p>}

          <form
            className="flex flex-col gap-1.5"
            // The scanner can sit inside another form's React tree; the submit is ours alone.
            onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); submitManual(); }}
          >
            <span className="text-[12.5px] font-semibold text-muted-foreground">{t("scan_manual")}</span>
            <div className="flex gap-2">
              <Input
                value={manual}
                inputMode="numeric"
                autoComplete="off"
                placeholder={t("scan_manual_ph")}
                className="font-mono"
                onChange={(e) => { setManual(e.target.value.replace(/\D/g, "")); setManualBad(false); }}
              />
              <Button type="submit" disabled={!manual}>{t("confirm")}</Button>
            </div>
            {manualBad && <span className="text-[12px] text-destructive">{t("scan_bad_code")}</span>}
          </form>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
