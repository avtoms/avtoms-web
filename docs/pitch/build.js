// Builds the AvtoNazorat pitch deck in three languages.
// Design: "garage signal" — deep navy dominant, product blue supporting, signal amber accent.
// Motif: rounded cards with amber circular badges. Dark title/AI/proof/closing, light content.

const pptxgen = require("pptxgenjs");
const { en, ru, uz } = require("./content");

// ── Palette ───────────────────────────────────────────────────────────────────
const NAVY = "0E1729"; // dominant dark
const NAVY2 = "1A2740"; // card on dark
const NAVY3 = "24365A"; // border on dark
const BLUE = "3563E9"; // brand
const AMBER = "FFB020"; // sharp accent
const WHITE = "FFFFFF";
const ICE = "F4F6FB"; // card on light
const ICE2 = "E7ECF7"; // border on light
const INK = "0E1729";
const MUTED = "64748B";
const MUTED_D = "94A6C4"; // muted on dark

const HEAD = "Arial";
const BODY = "Calibri";

const W = 13.333;
const M = 0.6; // page margin
const CW = W - 2 * M; // content width

// ── Primitives ────────────────────────────────────────────────────────────────

// Rounded card. Kept as a function so every call gets a fresh options object
// (pptxgenjs mutates options in place).
function card(s, x, y, w, h, opts = {}) {
  s.addShape("roundRect", {
    x, y, w, h,
    rectRadius: opts.radius ?? 0.1,
    fill: { color: opts.fill ?? ICE },
    line: opts.line === null ? { type: "none" } : { color: opts.line ?? ICE2, width: 1 },
  });
}

// Amber circular badge with a number or short glyph inside — the deck's motif.
function badge(s, x, y, d, label, opts = {}) {
  s.addShape("ellipse", {
    x, y, w: d, h: d,
    fill: { color: opts.fill ?? AMBER },
    line: { type: "none" },
  });
  s.addText(label, {
    x, y, w: d, h: d,
    align: "center", valign: "middle", margin: 0,
    fontFace: HEAD, fontSize: opts.size ?? 11, bold: true,
    color: opts.color ?? NAVY,
  });
}

// Section header used on every content slide.
function header(s, kicker, title, dark = false) {
  s.addText(kicker.toUpperCase(), {
    x: M, y: 0.42, w: CW, h: 0.26, margin: 0,
    fontFace: BODY, fontSize: 11, bold: true, charSpacing: 1.6,
    color: AMBER,
  });
  s.addText(title, {
    x: M, y: 0.72, w: CW - 0.2, h: 0.92, margin: 0, valign: "top",
    fontFace: HEAD, fontSize: 27, bold: true, charSpacing: -0.4,
    color: dark ? WHITE : INK,
  });
}

function para(s, text, x, y, w, h, opts = {}) {
  s.addText(text, {
    x, y, w, h, margin: 0, valign: "top",
    fontFace: BODY, fontSize: opts.size ?? 12.5,
    color: opts.color ?? MUTED, lineSpacing: opts.lineSpacing ?? 17,
    bold: opts.bold ?? false, align: opts.align ?? "left",
  });
}

function bulletList(s, items, x, y, w, h, opts = {}) {
  s.addText(
    items.map((t, i) => ({
      text: t,
      options: { bullet: true, breakLine: i !== items.length - 1 },
    })),
    {
      x, y, w, h, margin: 0, valign: "top",
      fontFace: BODY, fontSize: opts.size ?? 10.5,
      color: opts.color ?? MUTED, paraSpaceAfter: opts.gap ?? 7,
      lineSpacing: opts.lineSpacing ?? 14,
    }
  );
}

function darkBg(s) {
  s.background = { color: NAVY };
}

// Decorative concentric "signal" rings — used only on the two dark hero slides.
function rings(s, cx, cy, r) {
  s.addShape("ellipse", {
    x: cx - r, y: cy - r, w: r * 2, h: r * 2,
    fill: { type: "none" }, line: { color: NAVY3, width: 1.5 },
  });
  s.addShape("ellipse", {
    x: cx - r * 0.66, y: cy - r * 0.66, w: r * 1.32, h: r * 1.32,
    fill: { type: "none" }, line: { color: BLUE, width: 1.5 },
  });
  s.addShape("ellipse", {
    x: cx - r * 0.3, y: cy - r * 0.3, w: r * 0.6, h: r * 0.6,
    fill: { color: AMBER }, line: { type: "none" }, transparency: 12,
  });
}

// ── Slides ────────────────────────────────────────────────────────────────────

function slideTitle(p, d) {
  const s = p.addSlide();
  darkBg(s);
  rings(s, 10.5, 3.9, 2.25);

  // Brand lockup
  s.addShape("ellipse", { x: M, y: 0.62, w: 0.3, h: 0.3, fill: { color: AMBER }, line: { type: "none" } });
  s.addText(d.brand, {
    x: M + 0.42, y: 0.6, w: 4, h: 0.34, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 15, bold: true, color: WHITE, charSpacing: -0.2,
  });
  s.addText(d.product, {
    x: M + 0.42, y: 0.94, w: 4, h: 0.24, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 10, color: MUTED_D, charSpacing: 0.8,
  });

  s.addText(d.s1.eyebrow, {
    x: M, y: 2.12, w: 7.6, h: 0.3, margin: 0,
    fontFace: BODY, fontSize: 12.5, bold: true, color: AMBER, charSpacing: 0.6,
  });
  s.addText(d.s1.h1, {
    x: M, y: 2.5, w: 8.2, h: 0.82, margin: 0, valign: "top",
    fontFace: HEAD, fontSize: 44, bold: true, color: WHITE, charSpacing: -1.2,
  });
  s.addText(d.s1.h2, {
    x: M, y: 3.3, w: 8.2, h: 0.82, margin: 0, valign: "top",
    fontFace: HEAD, fontSize: 44, bold: true, color: AMBER, charSpacing: -1.2,
  });
  para(s, d.s1.sub, M, 4.32, 7.5, 1.0, { size: 13.5, color: MUTED_D, lineSpacing: 19 });

  // Chip row
  let cx = M;
  d.s1.chips.forEach((c) => {
    const w = 0.105 * c.length + 0.5;
    s.addShape("roundRect", {
      x: cx, y: 5.5, w, h: 0.42, rectRadius: 0.21,
      fill: { color: NAVY2 }, line: { color: NAVY3, width: 1 },
    });
    s.addText(c, {
      x: cx, y: 5.5, w, h: 0.42, margin: 0, align: "center", valign: "middle",
      fontFace: BODY, fontSize: 10.5, bold: true, color: WHITE,
    });
    cx += w + 0.16;
  });

  s.addText(d.s1.footer, {
    x: M, y: 6.62, w: 8, h: 0.3, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 10.5, color: MUTED_D, charSpacing: 0.5,
  });

  s.addNotes(`${d.s1.eyebrow}. ${d.s1.sub}`);
}

function slideProblem(p, d) {
  const s = p.addSlide();
  header(s, d.s2.kicker, d.s2.title);

  const cw = 5.85, ch = 1.55;
  d.s2.cards.forEach((c, i) => {
    const x = M + (i % 2) * (cw + 0.43);
    const y = 1.68 + Math.floor(i / 2) * (ch + 0.2);
    card(s, x, y, cw, ch);
    badge(s, x + 0.28, y + 0.26, 0.42, c.n, { size: 10.5 });
    s.addText(c.h, {
      x: x + 0.84, y: y + 0.24, w: cw - 1.1, h: 0.32, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 13, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, c.b, x + 0.84, y + 0.62, cw - 1.14, ch - 0.78, { size: 10.5, lineSpacing: 14 });
  });

  // Stats strip
  const sy = 5.35;
  card(s, M, sy, CW, 1.15, { fill: NAVY, line: null, radius: 0.12 });
  const sw = CW / 3;
  d.s2.stats.forEach((st, i) => {
    s.addText(st.v, {
      x: M + i * sw, y: sy + 0.16, w: sw, h: 0.5, margin: 0, align: "center", valign: "middle",
      fontFace: HEAD, fontSize: 26, bold: true, color: AMBER, charSpacing: -0.6,
    });
    s.addText(st.l, {
      x: M + i * sw + 0.2, y: sy + 0.66, w: sw - 0.4, h: 0.34, margin: 0, align: "center", valign: "top",
      fontFace: BODY, fontSize: 10.5, color: MUTED_D,
    });
  });

  s.addNotes(d.s2.title);
}

function slideSolution(p, d) {
  const s = p.addSlide();
  header(s, d.s3.kicker, d.s3.title);
  para(s, d.s3.lead, M, 1.52, 11.4, 0.9, { size: 13, color: MUTED, lineSpacing: 18 });

  const cw = (CW - 2 * 0.35) / 3, ch = 1.5;
  d.s3.pillars.forEach((pl, i) => {
    const x = M + (i % 3) * (cw + 0.35);
    const y = 2.72 + Math.floor(i / 3) * (ch + 0.24);
    card(s, x, y, cw, ch);
    s.addShape("ellipse", {
      x: x + 0.26, y: y + 0.26, w: 0.2, h: 0.2,
      fill: { color: AMBER }, line: { type: "none" },
    });
    s.addText(pl.h, {
      x: x + 0.58, y: y + 0.2, w: cw - 0.8, h: 0.32, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 13, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, pl.b, x + 0.26, y + 0.6, cw - 0.52, ch - 0.74, { size: 10.5, lineSpacing: 14 });
  });

  s.addNotes(d.s3.lead);
}

function slideFlow(p, d) {
  const s = p.addSlide();
  header(s, d.s4.kicker, d.s4.title);
  para(s, d.s4.lead, M, 1.5, 11.4, 0.6, { size: 12.5, lineSpacing: 17 });

  const cw = (CW - 2 * 0.35) / 3, ch = 1.62;
  d.s4.steps.forEach((st, i) => {
    const x = M + (i % 3) * (cw + 0.35);
    const y = 2.34 + Math.floor(i / 3) * (ch + 0.22);
    card(s, x, y, cw, ch);
    badge(s, x + 0.26, y + 0.24, 0.4, st.n, { size: 12 });
    s.addText(st.h, {
      x: x + 0.76, y: y + 0.22, w: cw - 0.98, h: 0.32, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 13.5, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, st.b, x + 0.26, y + 0.66, cw - 0.52, ch - 0.8, { size: 10, lineSpacing: 13 });
  });

  const ny = 6.0;
  card(s, M, ny, CW, 0.78, { fill: NAVY, line: null, radius: 0.1 });
  s.addShape("ellipse", { x: M + 0.3, y: ny + 0.29, w: 0.2, h: 0.2, fill: { color: AMBER }, line: { type: "none" } });
  s.addText(d.s4.note, {
    x: M + 0.62, y: ny + 0.1, w: CW - 0.9, h: 0.58, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, color: WHITE, lineSpacing: 14,
  });

  s.addNotes(d.s4.lead);
}

function slideApps(p, d) {
  const s = p.addSlide();
  header(s, d.s5.kicker, d.s5.title);

  const cw = 5.85, ch = 1.78;
  d.s5.apps.forEach((a, i) => {
    const x = M + (i % 2) * (cw + 0.43);
    const y = 1.88 + Math.floor(i / 2) * (ch + 0.28);
    card(s, x, y, cw, ch);
    s.addText(a.h, {
      x: x + 0.32, y: y + 0.26, w: cw - 2.0, h: 0.36, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 16, bold: true, color: INK, charSpacing: -0.3,
    });
    // Surface pill
    const pw = 0.1 * a.t.length + 0.52;
    s.addShape("roundRect", {
      x: x + cw - 0.32 - pw, y: y + 0.28, w: pw, h: 0.32, rectRadius: 0.16,
      fill: { color: AMBER }, line: { type: "none" },
    });
    s.addText(a.t, {
      x: x + cw - 0.32 - pw, y: y + 0.28, w: pw, h: 0.32, margin: 0,
      align: "center", valign: "middle",
      fontFace: BODY, fontSize: 10, bold: true, color: NAVY,
    });
    para(s, a.b, x + 0.32, y + 0.76, cw - 0.64, ch - 0.94, { size: 11, lineSpacing: 15 });
  });

  s.addNotes(d.s5.title);
}

function slideAI(p, d) {
  const s = p.addSlide();
  darkBg(s);
  header(s, d.s6.kicker, d.s6.title, true);
  para(s, d.s6.lead, M, 1.52, 11.4, 0.82, { size: 12.5, color: MUTED_D, lineSpacing: 17 });

  // Left: conversation mock
  const lx = M, lw = 5.85, ly = 2.52, lh = 4.14;
  card(s, lx, ly, lw, lh, { fill: NAVY2, line: NAVY3, radius: 0.12 });

  s.addShape("roundRect", {
    x: lx + 1.5, y: ly + 0.36, w: lw - 1.85, h: 0.52, rectRadius: 0.16,
    fill: { color: NAVY3 }, line: { type: "none" },
  });
  s.addText(d.s6.qText, {
    x: lx + 1.5, y: ly + 0.36, w: lw - 2.1, h: 0.52, margin: 0,
    align: "right", valign: "middle",
    fontFace: BODY, fontSize: 11.5, color: WHITE,
  });

  // Answer card
  s.addShape("roundRect", {
    x: lx + 0.35, y: ly + 1.12, w: lw - 0.7, h: 1.66, rectRadius: 0.12,
    fill: { color: NAVY }, line: { color: NAVY3, width: 1 },
  });
  s.addText(d.s6.aTitle, {
    x: lx + 0.62, y: ly + 1.34, w: lw - 1.24, h: 0.48, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 21, bold: true, color: AMBER, charSpacing: -0.5,
  });
  s.addText(d.s6.aSub, {
    x: lx + 0.62, y: ly + 1.84, w: lw - 1.24, h: 0.3, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, color: MUTED_D,
  });
  s.addShape("roundRect", {
    x: lx + 0.62, y: ly + 2.2, w: 2.4, h: 0.4, rectRadius: 0.1,
    fill: { color: BLUE }, line: { type: "none" },
  });
  s.addText(d.s6.aBtn, {
    x: lx + 0.62, y: ly + 2.2, w: 2.4, h: 0.4, margin: 0, align: "center", valign: "middle",
    fontFace: BODY, fontSize: 10.5, bold: true, color: WHITE,
  });

  s.addText(d.s6.mcpTitle, {
    x: lx + 0.35, y: ly + 3.0, w: lw - 0.7, h: 0.3, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 12, bold: true, color: WHITE,
  });
  para(s, d.s6.mcp, lx + 0.35, ly + 3.32, lw - 0.7, 0.72, { size: 10, color: MUTED_D, lineSpacing: 13 });

  // Right: the security guarantee
  const rx = M + lw + 0.43, rw = 5.85;
  card(s, rx, ly, rw, lh, { fill: NAVY2, line: NAVY3, radius: 0.12 });
  s.addShape("ellipse", {
    x: rx + 0.35, y: ly + 0.34, w: 0.36, h: 0.36,
    fill: { color: AMBER }, line: { type: "none" },
  });
  s.addText(d.s6.secTitle, {
    x: rx + 0.85, y: ly + 0.32, w: rw - 1.2, h: 0.4, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 15, bold: true, color: WHITE, charSpacing: -0.2,
  });
  bulletList(s, d.s6.sec, rx + 0.4, ly + 0.98, rw - 0.8, lh - 1.3, {
    size: 11, color: MUTED_D, gap: 11, lineSpacing: 15,
  });

  s.addNotes(d.s6.lead);
}

function slideLocal(p, d) {
  const s = p.addSlide();
  header(s, d.s7.kicker, d.s7.title);

  const cw = (CW - 3 * 0.28) / 4, ch = 2.06;
  d.s7.items.forEach((it, i) => {
    const x = M + (i % 4) * (cw + 0.28);
    const y = 1.75 + Math.floor(i / 4) * (ch + 0.24);
    card(s, x, y, cw, ch);
    s.addShape("ellipse", {
      x: x + 0.24, y: y + 0.26, w: 0.18, h: 0.18,
      fill: { color: AMBER }, line: { type: "none" },
    });
    s.addText(it.h, {
      x: x + 0.24, y: y + 0.5, w: cw - 0.44, h: 0.58, margin: 0, valign: "top",
      fontFace: HEAD, fontSize: 11.5, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, it.b, x + 0.24, y + 1.14, cw - 0.48, ch - 1.28, { size: 9.5, lineSpacing: 12.5 });
  });

  s.addNotes(d.s7.title);
}

function slideArch(p, d) {
  const s = p.addSlide();
  header(s, d.s8.kicker, d.s8.title);
  para(s, d.s8.lead, M, 1.5, 11.4, 0.56, { size: 12.5, lineSpacing: 17 });

  // Stack
  const sx = M, sw = 7.3, bh = 0.74, gap = 0.14;
  const y0 = 2.18;
  d.s8.tiers.forEach((t, i) => {
    const y = y0 + i * (bh + gap);
    const dark = i === 2 || i === 3; // gateway + services carry the weight
    card(s, sx, y, sw, bh, {
      fill: dark ? NAVY : ICE,
      line: dark ? null : ICE2,
      radius: 0.1,
    });
    s.addText(t.h, {
      x: sx + 0.26, y, w: 1.55, h: bh, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 11.5, bold: true,
      color: dark ? AMBER : INK, charSpacing: -0.1,
    });
    s.addText(t.b, {
      x: sx + 1.88, y, w: sw - 2.14, h: bh, margin: 0, valign: "middle",
      fontFace: BODY, fontSize: 10.5,
      color: dark ? MUTED_D : MUTED, lineSpacing: 13,
    });
  });

  // Ops column
  const ox = M + sw + 0.4, ow = CW - sw - 0.4;
  const oh = 5 * bh + 4 * gap;
  card(s, ox, y0, ow, oh, { fill: NAVY, line: null, radius: 0.12 });
  s.addShape("ellipse", {
    x: ox + 0.34, y: y0 + 0.36, w: 0.32, h: 0.32,
    fill: { color: AMBER }, line: { type: "none" },
  });
  s.addText("CI / CD", {
    x: ox + 0.78, y: y0 + 0.34, w: ow - 1.1, h: 0.36, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 14, bold: true, color: WHITE, charSpacing: -0.2,
  });
  bulletList(s, d.s8.ops, ox + 0.36, y0 + 0.94, ow - 0.72, oh - 1.2, {
    size: 10.5, color: MUTED_D, gap: 10, lineSpacing: 14,
  });

  s.addNotes(d.s8.lead);
}

function slideProof(p, d) {
  const s = p.addSlide();
  darkBg(s);
  header(s, d.s9.kicker, d.s9.title, true);

  const cw = (CW - 2 * 0.4) / 3, ch = 1.78;
  d.s9.stats.forEach((st, i) => {
    const x = M + (i % 3) * (cw + 0.4);
    const y = 2.05 + Math.floor(i / 3) * (ch + 0.24);
    card(s, x, y, cw, ch, { fill: NAVY2, line: NAVY3, radius: 0.12 });
    s.addText(st.v, {
      x: x + 0.3, y: y + 0.3, w: cw - 0.6, h: 0.82, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 46, bold: true, color: AMBER, charSpacing: -1.6,
    });
    s.addText(st.l, {
      x: x + 0.3, y: y + 1.16, w: cw - 0.6, h: 0.42, margin: 0, valign: "top",
      fontFace: BODY, fontSize: 11.5, color: MUTED_D, lineSpacing: 14,
    });
  });

  s.addText(d.s9.note, {
    x: M, y: 6.06, w: CW, h: 0.6, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11.5, color: MUTED_D, lineSpacing: 15,
  });

  s.addNotes(d.s9.note);
}

function slideSecurity(p, d) {
  const s = p.addSlide();
  header(s, d.s10.kicker, d.s10.title);

  const cw = 5.85, ch = 1.42;
  d.s10.items.forEach((it, i) => {
    const x = M + (i % 2) * (cw + 0.43);
    const y = 1.72 + Math.floor(i / 2) * (ch + 0.2);
    card(s, x, y, cw, ch);
    s.addShape("ellipse", {
      x: x + 0.28, y: y + 0.3, w: 0.24, h: 0.24,
      fill: { color: AMBER }, line: { type: "none" },
    });
    s.addText(it.h, {
      x: x + 0.68, y: y + 0.24, w: cw - 0.96, h: 0.34, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 12.5, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, it.b, x + 0.68, y + 0.62, cw - 0.96, ch - 0.76, { size: 10, lineSpacing: 13 });
  });

  s.addNotes(d.s10.title);
}

function slideMarket(p, d) {
  const s = p.addSlide();
  header(s, d.s11.kicker, d.s11.title);

  // Stat row
  const cw = (CW - 2 * 0.35) / 3;
  d.s11.stats.forEach((st, i) => {
    const x = M + i * (cw + 0.35);
    card(s, x, 1.56, cw, 1.24, { fill: NAVY, line: null, radius: 0.12 });
    s.addText(st.v, {
      x: x + 0.26, y: 1.68, w: cw - 0.52, h: 0.56, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 28, bold: true, color: AMBER, charSpacing: -0.8,
    });
    s.addText(st.l, {
      x: x + 0.26, y: 2.26, w: cw - 0.52, h: 0.44, margin: 0, valign: "top",
      fontFace: BODY, fontSize: 10, color: MUTED_D, lineSpacing: 12.5,
    });
  });

  // Two argument cards
  const bw = 5.85, bh = 1.94;
  d.s11.body.forEach((b, i) => {
    const x = M + i * (bw + 0.43);
    card(s, x, 3.02, bw, bh);
    s.addText(b.h, {
      x: x + 0.3, y: 3.2, w: bw - 0.6, h: 0.34, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 13, bold: true, color: INK, charSpacing: -0.2,
    });
    para(s, b.b, x + 0.3, 3.6, bw - 0.6, bh - 0.76, { size: 10.5, lineSpacing: 14 });
  });

  // Fill-in band
  card(s, M, 5.18, CW, 0.92, { fill: WHITE, line: AMBER, radius: 0.1 });
  s.addText(d.s11.fill.h, {
    x: M + 0.3, y: 5.18, w: 3.0, h: 0.92, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 14, bold: true, color: INK,
  });
  s.addText(d.s11.fill.b, {
    x: M + 3.3, y: 5.18, w: CW - 3.6, h: 0.92, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, italic: true, color: MUTED,
  });

  s.addText(d.s11.src, {
    x: M, y: 6.24, w: CW, h: 0.5, margin: 0, valign: "top",
    fontFace: BODY, fontSize: 8.5, color: MUTED, lineSpacing: 11,
  });

  s.addNotes(d.s11.src);
}

function slideModel(p, d) {
  const s = p.addSlide();
  header(s, d.s12.kicker, d.s12.title);

  const cw = (CW - 2 * 0.35) / 3, ch = 3.0, y = 1.78;
  d.s12.tiers.forEach((t, i) => {
    const x = M + i * (cw + 0.35);
    const hot = !!t.tag;
    card(s, x, y, cw, ch, {
      fill: hot ? NAVY : ICE,
      line: hot ? null : ICE2,
      radius: 0.12,
    });
    if (hot) {
      const pw = 0.098 * t.tag.length + 0.5;
      s.addShape("roundRect", {
        x: x + cw - 0.28 - pw, y: y + 0.28, w: pw, h: 0.3, rectRadius: 0.15,
        fill: { color: AMBER }, line: { type: "none" },
      });
      s.addText(t.tag, {
        x: x + cw - 0.28 - pw, y: y + 0.28, w: pw, h: 0.3, margin: 0,
        align: "center", valign: "middle",
        fontFace: BODY, fontSize: 9, bold: true, color: NAVY,
      });
    }
    s.addText(t.n, {
      x: x + 0.3, y: y + 0.26, w: cw - 1.4, h: 0.44, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 19, bold: true,
      color: hot ? WHITE : INK, charSpacing: -0.4,
    });
    bulletList(s, t.f, x + 0.3, y + 0.92, cw - 0.6, ch - 1.2, {
      size: 11, color: hot ? MUTED_D : MUTED, gap: 10, lineSpacing: 14,
    });
  });

  para(s, d.s12.levers, M, 5.02, CW, 0.5, { size: 12, lineSpacing: 16 });

  card(s, M, 5.66, CW, 0.72, { fill: WHITE, line: AMBER, radius: 0.1 });
  s.addText(d.s12.fill, {
    x: M + 0.3, y: 5.66, w: CW - 0.6, h: 0.72, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, italic: true, color: MUTED,
  });

  s.addNotes(d.s12.levers);
}

function slideTraction(p, d) {
  const s = p.addSlide();
  header(s, d.s13.kicker, d.s13.title);
  para(s, d.s13.lead, M, 1.5, 11.4, 0.6, { size: 12.5, lineSpacing: 17 });

  const cw = (CW - 2 * 0.35) / 3, ch = 1.6;
  d.s13.fields.forEach((f, i) => {
    const x = M + (i % 3) * (cw + 0.35);
    const y = 2.34 + Math.floor(i / 3) * (ch + 0.26);
    card(s, x, y, cw, ch, { fill: WHITE, line: AMBER, radius: 0.12 });
    s.addText(f, {
      x: x + 0.28, y: y + 0.22, w: cw - 0.56, h: 0.56, margin: 0, valign: "top",
      fontFace: BODY, fontSize: 10.5, bold: true, color: MUTED, lineSpacing: 13,
    });
    s.addText("—", {
      x: x + 0.28, y: y + 0.82, w: cw - 0.56, h: 0.6, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 30, bold: true, color: ICE2,
    });
  });

  card(s, M, 5.9, CW, 0.76, { fill: NAVY, line: null, radius: 0.1 });
  s.addShape("ellipse", { x: M + 0.3, y: 6.18, w: 0.2, h: 0.2, fill: { color: AMBER }, line: { type: "none" } });
  s.addText(d.s13.fillNote, {
    x: M + 0.62, y: 5.9, w: CW - 0.9, h: 0.76, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, color: WHITE, lineSpacing: 14,
  });

  s.addNotes(d.s13.fillNote);
}

function slideRoadmap(p, d) {
  const s = p.addSlide();
  header(s, d.s14.kicker, d.s14.title);

  const cw = (CW - 2 * 0.35) / 3, ch = 4.4, y = 1.72;
  d.s14.cols.forEach((c, i) => {
    const x = M + i * (cw + 0.35);
    card(s, x, y, cw, ch, {
      fill: i === 0 ? NAVY : ICE,
      line: i === 0 ? null : ICE2,
      radius: 0.12,
    });
    badge(s, x + 0.3, y + 0.3, 0.4, String(i + 1), { size: 12 });
    s.addText(c.h, {
      x: x + 0.8, y: y + 0.28, w: cw - 1.1, h: 0.44, margin: 0, valign: "middle",
      fontFace: HEAD, fontSize: 17, bold: true,
      color: i === 0 ? WHITE : INK, charSpacing: -0.3,
    });
    bulletList(s, c.b, x + 0.3, y + 1.0, cw - 0.6, ch - 1.3, {
      size: 11, color: i === 0 ? MUTED_D : MUTED, gap: 12, lineSpacing: 15,
    });
  });

  s.addNotes(d.s14.title);
}

function slideTeam(p, d) {
  const s = p.addSlide();
  header(s, d.s15.kicker, d.s15.title);

  const cw = (CW - 2 * 0.35) / 3, ch = 3.5, y = 1.92;
  d.s15.slots.forEach((sl, i) => {
    const x = M + i * (cw + 0.35);
    card(s, x, y, cw, ch, { fill: ICE, line: ICE2, radius: 0.12 });
    s.addShape("ellipse", {
      x: x + cw / 2 - 0.55, y: y + 0.42, w: 1.1, h: 1.1,
      fill: { color: WHITE }, line: { color: AMBER, width: 1.5 },
    });
    s.addText(sl, {
      x: x + 0.3, y: y + 1.74, w: cw - 0.6, h: 0.4, margin: 0,
      align: "center", valign: "middle",
      fontFace: HEAD, fontSize: 14, bold: true, color: INK,
    });
    // blank ruled lines for name + one-liner
    [0, 1, 2].forEach((k) => {
      s.addShape("rect", {
        x: x + 0.5, y: y + 2.32 + k * 0.36, w: cw - 1.0, h: 0.012,
        fill: { color: ICE2 }, line: { type: "none" },
      });
    });
  });

  card(s, M, 5.72, CW, 0.76, { fill: WHITE, line: AMBER, radius: 0.1 });
  s.addText(d.s15.fillNote, {
    x: M + 0.3, y: 5.72, w: CW - 0.6, h: 0.76, margin: 0, valign: "middle",
    fontFace: BODY, fontSize: 11, italic: true, color: MUTED,
  });

  s.addNotes(d.s15.fillNote);
}

function slideClose(p, d) {
  const s = p.addSlide();
  darkBg(s);
  rings(s, 11.1, 2.5, 1.85);

  s.addText(d.s16.h1, {
    x: M, y: 1.5, w: 8.6, h: 0.82, margin: 0, valign: "top",
    fontFace: HEAD, fontSize: 40, bold: true, color: WHITE, charSpacing: -1.1,
  });
  s.addText(d.s16.h2, {
    x: M, y: 2.26, w: 8.6, h: 0.82, margin: 0, valign: "top",
    fontFace: HEAD, fontSize: 40, bold: true, color: AMBER, charSpacing: -1.1,
  });
  para(s, d.s16.sub, M, 3.26, 8.4, 0.9, { size: 13, color: MUTED_D, lineSpacing: 18 });

  const cw = 5.85, ch = 1.32, y = 4.72;
  [
    { l: d.s16.askLabel, v: d.s16.askFill },
    { l: d.s16.contactLabel, v: d.s16.contactFill },
  ].forEach((b, i) => {
    const x = M + i * (cw + 0.43);
    card(s, x, y, cw, ch, { fill: NAVY2, line: NAVY3, radius: 0.12 });
    s.addText(b.l.toUpperCase(), {
      x: x + 0.32, y: y + 0.26, w: cw - 0.64, h: 0.3, margin: 0, valign: "middle",
      fontFace: BODY, fontSize: 10, bold: true, charSpacing: 1.4, color: AMBER,
    });
    s.addText(b.v, {
      x: x + 0.32, y: y + 0.64, w: cw - 0.64, h: 0.8, margin: 0, valign: "top",
      fontFace: BODY, fontSize: 12.5, italic: true, color: MUTED_D, lineSpacing: 17,
    });
  });

  s.addShape("ellipse", { x: M, y: 6.66, w: 0.26, h: 0.26, fill: { color: AMBER }, line: { type: "none" } });
  s.addText(`${d.brand} · ${d.product}`, {
    x: M + 0.38, y: 6.6, w: 8, h: 0.38, margin: 0, valign: "middle",
    fontFace: HEAD, fontSize: 13, bold: true, color: WHITE,
  });

  s.addNotes(`${d.s16.h1} ${d.s16.h2} — ${d.s16.sub}`);
}

// ── Build ─────────────────────────────────────────────────────────────────────

function build(d, outfile) {
  const p = new pptxgen();
  p.layout = "LAYOUT_WIDE"; // 13.333 x 7.5
  p.author = "AvtoNazorat";
  p.company = "AvtoNazorat";
  p.title = `${d.brand} — ${d.s1.eyebrow}`;

  slideTitle(p, d);
  slideProblem(p, d);
  slideSolution(p, d);
  slideFlow(p, d);
  slideApps(p, d);
  slideAI(p, d);
  slideLocal(p, d);
  slideArch(p, d);
  slideProof(p, d);
  slideSecurity(p, d);
  slideMarket(p, d);
  slideModel(p, d);
  slideTraction(p, d);
  slideRoadmap(p, d);
  slideTeam(p, d);
  slideClose(p, d);

  return p.writeFile({ fileName: outfile });
}

(async () => {
  await build(en, "AvtoNazorat-Pitch-EN.pptx");
  await build(ru, "AvtoNazorat-Pitch-RU.pptx");
  await build(uz, "AvtoNazorat-Pitch-UZ.pptx");
  console.log("built 3 decks");
})();
