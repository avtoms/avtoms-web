// Styling for the public service-centre page.
//
// Self-contained, like the public receipt page: whoever opens a shared link is outside the
// console entirely, and the page should not drag the app's theme providers, fonts switcher
// and layout chrome in behind it. The palette is the app's own so the page still looks like
// Auto-Garaj to somebody who installs it afterwards.
export const SHARE_CSS = `
.sp {
  --brand: #2F5FD0; --ink: #1F2433; --muted: #6F7787; --line: #E3E7EF;
  --ground: #F4F6FA; --surface: #fff; --ok: #1E9E5A; --ok-soft: #E6F6EC;
  --warn-soft: #FDF1DF; --warn: #D9840B;
  max-width: 560px; margin: 0 auto; padding: 0 0 48px;
  background: var(--ground); color: var(--ink); min-height: 100vh;
  font-family: var(--ff-manrope, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif);
  font-size: 15px; line-height: 1.5;
}
.sp * { box-sizing: border-box; }
.sp h1 { font-size: 24px; font-weight: 800; letter-spacing: -.3px; margin: 8px 0 0; }
.sp h2 { font-size: 15px; font-weight: 800; margin: 0 0 12px; }
.sp p { margin: 0; }

.sp-hero { position: relative; background: var(--surface); overflow: hidden; }
.sp-hero-bg { position: absolute; inset: 0 0 auto; height: 160px;
  background: linear-gradient(135deg, #2F5FD0, #1A367A); }
.sp-gallery { position: relative; display: grid; gap: 2px; }
.sp-gallery img { width: 100%; height: 200px; object-fit: cover; display: block; background: #E3E7EF; }
/* On a phone the first photograph is the one that matters; the others follow it in a
   strip, which is how a person looks at a place anyway — the front, then the inside. */
.sp-gallery.n2 { grid-template-columns: 1fr 1fr; }
.sp-gallery.n3 { grid-template-columns: 2fr 1fr; grid-template-rows: 99px 99px; }
.sp-gallery.n3 img:first-child { grid-row: 1 / 3; height: 200px; }
.sp-gallery.n3 img { height: 99px; }
.sp-hero-mark { position: relative; height: 160px; display: grid; place-items: center;
  font-size: 56px; font-weight: 800; color: rgba(255,255,255,.9); letter-spacing: 2px; }
.sp-hero-body { position: relative; padding: 16px; }

.sp-badges { display: flex; gap: 6px; flex-wrap: wrap; }
.sp-badge { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 99px;
  background: #EEF1F6; color: var(--muted); }
.sp-badge.ok { background: var(--ok-soft); color: var(--ok); }
.sp-badge.grey { background: #EEF1F6; color: var(--muted); }
.sp-badge.brand { background: #EAF0FC; color: var(--brand); }
.sp-badge.promo { background: var(--warn-soft); color: var(--warn); }

.sp-meta { display: flex; gap: 12px; flex-wrap: wrap; align-items: baseline;
  margin-top: 6px; color: var(--muted); font-size: 14px; }
.sp-meta b { color: var(--ink); }
.sp-rating { color: var(--ink); font-weight: 700; }
.sp-rating small { color: var(--muted); font-weight: 500; }
.sp-address { margin-top: 8px; color: var(--muted); font-size: 14px; }

.sp-actions { display: grid; grid-auto-flow: column; gap: 8px; padding: 12px 16px 0; }
.sp-btn { display: block; text-align: center; padding: 11px 12px; border-radius: 12px;
  background: var(--surface); border: 1px solid var(--line); color: var(--ink);
  font-weight: 700; font-size: 14px; text-decoration: none; }
.sp-btn:active { background: var(--ground); }

.sp-cta { margin: 12px 16px; padding: 14px 16px; border-radius: 16px;
  background: linear-gradient(135deg, #2F5FD0, #254CB0); color: #fff; }
.sp-cta b { display: block; font-size: 15px; }
.sp-cta p { font-size: 13px; opacity: .85; margin-top: 4px; }

.sp-card { margin: 0 16px 12px; padding: 16px; border-radius: 16px; background: var(--surface);
  box-shadow: 0 1px 2px rgba(31,36,51,.06), 0 1px 6px rgba(31,36,51,.05); }
.sp-muted { color: var(--muted); font-size: 14px; }

.sp-list { list-style: none; margin: 0; padding: 0; }
.sp-list li { display: flex; justify-content: space-between; gap: 12px; align-items: baseline;
  padding: 10px 0; border-top: 1px solid #EEF1F6; font-size: 14px; }
.sp-list li:first-child { border-top: 0; padding-top: 0; }
.sp-list li small { color: var(--muted); }
.sp-list li b { white-space: nowrap; }
.sp-list li.now { color: var(--brand); }
.sp-list li.now b { color: var(--brand); }

.sp-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.sp-chip { font-size: 12.5px; padding: 5px 10px; border-radius: 99px;
  background: var(--ground); color: var(--muted); }

.sp-review { padding: 12px 0; border-top: 1px solid #EEF1F6; }
.sp-review:first-of-type { border-top: 0; padding-top: 0; }
.sp-review p { font-size: 14px; margin-top: 6px; }
.sp-review-head { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.sp-avatar { width: 30px; height: 30px; border-radius: 50%; background: #EAF0FC;
  color: var(--brand); font-size: 12px; font-weight: 800; display: grid; place-items: center; }
.sp-stars { margin-left: auto; color: #F2B100; font-size: 13px; letter-spacing: 1px; }
.sp-stars .dim { color: var(--line); }
.sp-reply { margin-top: 8px; padding: 8px 10px; border-radius: 10px;
  background: var(--ground); color: var(--muted); font-size: 13px; }

.sp-footer { display: flex; align-items: center; gap: 10px; padding: 20px 16px;
  color: var(--muted); font-size: 13px; }
.sp-footer a { color: var(--brand); font-weight: 700; text-decoration: none; }
.sp-footer .sp-lang { margin-left: auto; }

/* ── Opened on a computer ───────────────────────────────────────────────────────────
   The same page, given the room a browser window has: a wide gallery, the detail in one
   column and the things you act on — call, route, book — held beside it where they stay
   visible while you read the price list. Below 900px none of this applies and the phone
   layout above stands. */
@media (min-width: 900px) {
  .sp { max-width: 1060px; padding-bottom: 64px; font-size: 16px; }
  .sp-hero { border-radius: 0 0 20px 20px; }
  .sp-gallery img { height: 320px; }
  .sp-gallery.n3 { grid-template-columns: 2fr 1fr; grid-template-rows: 159px 159px; }
  .sp-gallery.n3 img:first-child { height: 320px; }
  .sp-gallery.n3 img { height: 159px; }
  .sp-hero-mark { height: 240px; font-size: 76px; }
  .sp-hero-body { padding: 24px 28px; }
  .sp h1 { font-size: 34px; }
  .sp-address { font-size: 15px; }

  .sp-grid { display: grid; grid-template-columns: minmax(0, 1fr) 330px; gap: 20px;
    align-items: start; padding: 20px 12px 0; }
  .sp-main { grid-column: 1; grid-row: 1; display: grid; gap: 16px; }
  /* Held in view while the reader scrolls the price list: the three things they came to
     do are the three things that must not scroll away. */
  .sp-aside { grid-column: 2; grid-row: 1; position: sticky; top: 20px;
    background: var(--surface); border-radius: 16px; padding: 4px 0 12px;
    box-shadow: 0 1px 2px rgba(31,36,51,.06), 0 1px 6px rgba(31,36,51,.05); }
  .sp-card { margin: 0; }
  .sp-actions { padding: 12px 12px 0; }
  .sp-cta { margin: 12px; }
  .sp-footer { padding: 28px 16px 8px; }
}

@media (prefers-color-scheme: dark) {
  .sp { --ink: #ECEFF6; --muted: #9AA1B1; --line: #2A3142; --ground: #10141F;
        --surface: #171C28; --ok-soft: #12351F; --warn-soft: #3A2A10; }
  .sp-list li, .sp-review { border-top-color: #222838; }
  .sp-badge { background: #222838; }
  .sp-badge.brand { background: #1B2740; }
}

/* ── The pages a promo code and an invitation land on ───────────────────────────────
   Narrower than a service centre's page: there is one thing to read and one thing to do,
   and a column the width of a paperback is easier to read than one the width of a desk. */
.sp-narrow { max-width: 480px; }
.sp-promo-hero { padding: 32px 20px 24px; text-align: center;
  background: linear-gradient(135deg, #2F5FD0, #1A367A); color: #fff; }
.sp-promo-hero h1 { font-size: 24px; margin-top: 8px; }
.sp-promo-figure { font-size: 56px; font-weight: 800; letter-spacing: -2px; line-height: 1; }
.sp-promo-until { margin-top: 8px; font-size: 14px; opacity: .85; }
.sp-invite { padding-top: 40px; }
.sp-kicker { font-size: 12px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase;
  opacity: .75; }

/* The code itself: large, spaced, and selectable, because somebody is about to type it. */
.sp-codecard { margin-top: 16px; text-align: center; }
.sp-code { display: block; margin-top: 6px; font-family: var(--ff-mono, ui-monospace, Menlo, monospace);
  font-size: 30px; font-weight: 700; letter-spacing: .14em; color: var(--brand);
  user-select: all; }

.sp-bullets, .sp-steps { margin: 0; padding-left: 20px; font-size: 14px; }
.sp-bullets li, .sp-steps li { padding: 4px 0; }
.sp-steps li::marker { color: var(--brand); font-weight: 700; }
.sp-note { margin-top: 10px; font-size: 13px; }

.sp-provider { display: block; text-decoration: none; color: inherit; }
.sp-provider b { display: block; color: var(--brand); }
.sp-provider span { font-size: 14px; }

@media (min-width: 900px) {
  .sp-narrow { max-width: 560px; }
  .sp-narrow .sp-card { margin: 0 16px 12px; }
  .sp-promo-hero { border-radius: 0 0 20px 20px; padding: 48px 24px 36px; }
  .sp-promo-figure { font-size: 72px; }
  .sp-promo-hero h1 { font-size: 30px; }
}
`;
