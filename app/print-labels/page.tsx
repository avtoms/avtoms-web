"use client";
// Shelf labels: a sheet of them, one per variant — name, variant, price, and the article number
// as a QR code the phone scanner reads back. Opened in a new tab from the warehouse, which
// leaves the list in session storage; printed with the browser's own dialog.
import React, { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useLang } from "@/components/providers";
import { money } from "@/lib/format";
import { LABELS_KEY, type LabelItem } from "@/lib/stock";

export default function PrintLabelsPage() {
  const { t } = useLang();
  const [items, setItems] = useState<LabelItem[] | null>(null);
  useEffect(() => {
    try { setItems(JSON.parse(sessionStorage.getItem(LABELS_KEY) || "[]") as LabelItem[]); } catch { setItems([]); }
  }, []);

  if (items === null) return null;
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#111", background: "#fff", minHeight: "100vh" }}>
      <style>{`
        .lbl-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #e4e4e7; }
        .lbl-bar button { background: #1d4ed8; color: #fff; border: 0; border-radius: 9px; padding: 9px 18px; font-weight: 600; font-size: 14px; cursor: pointer; }
        .lbl-grid { display: grid; grid-template-columns: repeat(auto-fill, 58mm); gap: 4mm; padding: 8mm; }
        .lbl { width: 58mm; height: 40mm; border: 1px dashed #d4d4d8; border-radius: 2mm; padding: 2.5mm 3mm; display: flex; gap: 2.5mm; box-sizing: border-box; break-inside: avoid; }
        .lbl .txt { min-width: 0; flex: 1; display: flex; flex-direction: column; }
        .lbl .n { font-size: 9.5pt; font-weight: 700; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .lbl .v { font-size: 8pt; color: #52525b; margin-top: 1mm; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .lbl .p { margin-top: auto; font-size: 14pt; font-weight: 800; font-family: ui-monospace, monospace; }
        .lbl .s { font-size: 7pt; color: #71717a; font-family: ui-monospace, monospace; }
        @media print { .lbl-bar { display: none; } .lbl-grid { padding: 0; } .lbl { border-color: #eee; } @page { margin: 6mm; } }
      `}</style>
      <div className="lbl-bar">
        <span style={{ fontSize: 14, fontWeight: 600 }}>{t("whx_labels")} · {items.length}</span>
        {items.length > 0 && <button onClick={() => window.print()}>{t("print")}</button>}
      </div>
      {items.length === 0 ? (
        <p style={{ padding: 20, color: "#71717a" }}>{t("empty")}</p>
      ) : (
        <div className="lbl-grid">
          {items.map((it, i) => (
            <div key={i} className="lbl">
              <div className="txt">
                <div className="n">{it.name}</div>
                {it.variant && <div className="v">{it.variant}</div>}
                {it.price > 0 && <div className="p">{money(it.price)}</div>}
                <div className="s">{it.sku}{it.barcode ? ` · ${it.barcode}` : ""}</div>
              </div>
              {it.sku && <QRCodeSVG value={it.sku} size={70} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
