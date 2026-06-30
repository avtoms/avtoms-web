"use client";
// Public marketing landing page (the front door for guests). Self-contained: its own dark
// "garage-signal" theme, fonts (Unbounded display + Golos Text body + JetBrains Mono),
// and a trilingual (UZ / RU / EN) copy dictionary — it does NOT use the app's i18n/theme
// providers so it can present a distinct brand world. Submits the demo form to /api/demo.
import React, { useState } from "react";

type Tri = { uz: string; ru: string; en: string };
type Lang = "uz" | "ru" | "en";
const tr = (v: Tri, l: Lang) => v[l];

const COPY = {
  nav_login: { uz: "Kirish", ru: "Войти", en: "Log in" },
  eyebrow: { uz: "Avtoservis uchun raqamli boshqaruv", ru: "Цифровое управление автосервисом", en: "Digital management for auto shops" },
  h1a: { uz: "Sizning avtoservisingiz —", ru: "Ваш автосервис —", en: "Your auto shop —" },
  h1b: { uz: "bitta ekranda.", ru: "на одном экране.", en: "on one screen." },
  sub: {
    uz: "Buyurtmalar, mijozlar, ombor, hisob-fakturalar va moliya — O‘zbekiston uchun yaratilgan platformada.",
    ru: "Заказы, клиенты, склад, счета и финансы — на платформе, созданной для Узбекистана.",
    en: "Work orders, clients, inventory, invoices and finances — on a platform built for Uzbekistan.",
  },
  cta1: { uz: "Bepul demo olish", ru: "Получить демо", en: "Get a free demo" },
  cta2: { uz: "Tizimga kirish", ru: "Войти в систему", en: "Log in" },
  trust: { uz: "O‘zbekiston avtoservislari uchun", ru: "Для автосервисов Узбекистана", en: "Made for Uzbekistan’s workshops" },
  feat_title: { uz: "Hamma narsa bir joyda", ru: "Всё в одном месте", en: "Everything in one place" },
  feat_sub: { uz: "Servisingizni boshqarish uchun kerak bo‘lgan har bir vosita.", ru: "Каждый инструмент для управления вашим сервисом.", en: "Every tool you need to run the shop." },
  form_kicker: { uz: "Demo so‘rovi", ru: "Заявка на демо", en: "Request a demo" },
  form_title: { uz: "Mahsulotni ish jarayonida ko‘ring", ru: "Посмотрите продукт в деле", en: "See the product in action" },
  form_sub: { uz: "Formani to‘ldiring — 24 soat ichida bog‘lanamiz.", ru: "Заполните форму — свяжемся в течение 24 часов.", en: "Fill the form — we’ll reach out within 24 hours." },
  f_name: { uz: "Ismingiz", ru: "Ваше имя", en: "Your name" },
  f_shop: { uz: "Avtoservis nomi", ru: "Название автосервиса", en: "Workshop name" },
  f_phone: { uz: "Telefon raqami", ru: "Номер телефона", en: "Phone number" },
  f_city: { uz: "Shahar", ru: "Город", en: "City" },
  f_msg: { uz: "Izoh (ixtiyoriy)", ru: "Сообщение (необязательно)", en: "Message (optional)" },
  send: { uz: "So‘rov yuborish", ru: "Отправить заявку", en: "Send request" },
  sending: { uz: "Yuborilmoqda…", ru: "Отправка…", en: "Sending…" },
  ok_title: { uz: "Rahmat! 🎉", ru: "Спасибо! 🎉", en: "Thank you! 🎉" },
  ok_body: { uz: "So‘rovingiz qabul qilindi. Tez orada siz bilan bog‘lanamiz.", ru: "Заявка принята. Мы скоро свяжемся с вами.", en: "We’ve got your request and will contact you shortly." },
  err: { uz: "Xatolik yuz berdi. Qayta urinib ko‘ring.", ru: "Произошла ошибка. Попробуйте снова.", en: "Something went wrong. Please try again." },
  again: { uz: "Yana yuborish", ru: "Отправить ещё", en: "Send another" },
  footer: { uz: "Avtoservislar uchun zamonaviy boshqaruv tizimi.", ru: "Современная система управления для автосервисов.", en: "Modern management for auto repair shops." },
};

const FEATURES: { icon: React.ReactNode; title: Tri; desc: Tri }[] = [
  {
    icon: <BoardIcon />,
    title: { uz: "Jonli buyurtmalar doskasi", ru: "Живая доска заказов", en: "Live work-order board" },
    desc: { uz: "Qoralamadan yopilishigacha — Jira uslubidagi doskada har bir ishni kuzating.", ru: "От черновика до закрытия — следите за каждым заказом на доске в стиле Jira.", en: "From draft to closed — track every job on a Jira-style board." },
  },
  {
    icon: <BellIcon />,
    title: { uz: "Telegram orqali eslatmalar", ru: "Напоминания в Telegram", en: "Telegram reminders" },
    desc: { uz: "Moy yoki TX muddati kelganda mijozga avtomatik xabar boradi.", ru: "Клиенту автоматически приходит сообщение, когда подходит срок ТО.", en: "Clients get an automatic message when service is due." },
  },
  {
    icon: <ChartIcon />,
    title: { uz: "Moliya va foyda hisoboti", ru: "Финансы и отчёт о прибыли", en: "Finances & P&L" },
    desc: { uz: "Daromad, xarajat va sof foyda — real vaqt rejimida.", ru: "Выручка, расходы и чистая прибыль — в реальном времени.", en: "Revenue, expenses and net profit in real time." },
  },
  {
    icon: <BoxIcon />,
    title: { uz: "Ombor va ehtiyot qismlar", ru: "Склад и запчасти", en: "Parts & inventory" },
    desc: { uz: "Qoldiq, yetkazib beruvchilar va kam qolgan tovarlar nazorati.", ru: "Контроль остатков, поставщиков и заканчивающихся позиций.", en: "Track stock, suppliers and low-stock parts." },
  },
  {
    icon: <ReceiptIcon />,
    title: { uz: "Fiskal hisob-fakturalar", ru: "Фискальные счета", en: "Fiscal invoices" },
    desc: { uz: "QR-kodli rasmiy cheklar — O‘zbekiston soliq talablariga mos.", ru: "Официальные чеки с QR — по требованиям налоговой Узбекистана.", en: "Official QR receipts, compliant with Uzbek tax rules." },
  },
  {
    icon: <PlateIcon />,
    title: { uz: "Davlat raqami bo‘yicha qidiruv", ru: "Поиск по госномеру", en: "Search by plate number" },
    desc: { uz: "Mashinani raqami va modeli bilan bir soniyada toping.", ru: "Найдите авто по номеру и модели за секунду.", en: "Find any car by plate and model in a second." },
  },
];

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("uz");
  return (
    <div className="lp">
      <LandingStyle />
      <div className="lp-bg" aria-hidden />
      <div className="lp-glow" aria-hidden />

      {/* ── top bar ── */}
      <header className="lp-wrap lp-nav">
        <a href="#top" className="lp-brand">
          <span className="lp-mark"><WrenchIcon /></span>
          <span className="lp-brand-name">Auto-Garaj</span>
        </a>
        <div className="lp-nav-right">
          <LangSwitch lang={lang} setLang={setLang} />
          <a href="/login" className="lp-btn lp-btn-ghost">{tr(COPY.nav_login, lang)}</a>
        </div>
      </header>

      {/* ── hero ── */}
      <section id="top" className="lp-wrap lp-hero">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow lp-rise" style={{ animationDelay: "40ms" }}>
            <span className="lp-eyebrow-dot" /> {tr(COPY.eyebrow, lang)}
          </span>
          <h1 className="lp-h1 lp-rise" style={{ animationDelay: "120ms" }}>
            {tr(COPY.h1a, lang)} <span className="lp-h1-accent">{tr(COPY.h1b, lang)}</span>
          </h1>
          <p className="lp-sub lp-rise" style={{ animationDelay: "220ms" }}>{tr(COPY.sub, lang)}</p>
          <div className="lp-hero-cta lp-rise" style={{ animationDelay: "320ms" }}>
            <a href="#demo" className="lp-btn lp-btn-primary">{tr(COPY.cta1, lang)} <ArrowIcon /></a>
            <a href="/login" className="lp-btn lp-btn-line">{tr(COPY.cta2, lang)}</a>
          </div>
          <div className="lp-trust lp-rise" style={{ animationDelay: "420ms" }}>
            <span className="lp-flag" /> {tr(COPY.trust, lang)}
          </div>
        </div>
        <div className="lp-hero-art lp-rise" style={{ animationDelay: "260ms" }}>
          <HeroCard lang={lang} />
        </div>
      </section>

      {/* ── features ── */}
      <section className="lp-wrap lp-features">
        <div className="lp-sec-head">
          <h2 className="lp-h2">{tr(COPY.feat_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.feat_sub, lang)}</p>
        </div>
        <div className="lp-grid">
          {FEATURES.map((f, i) => (
            <div className="lp-card" key={i}>
              <div className="lp-card-ico">{f.icon}</div>
              <div className="lp-card-title">{tr(f.title, lang)}</div>
              <div className="lp-card-desc">{tr(f.desc, lang)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── demo form ── */}
      <section id="demo" className="lp-wrap lp-demo">
        <div className="lp-demo-copy">
          <span className="lp-kicker">{tr(COPY.form_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.form_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.form_sub, lang)}</p>
          <div className="lp-tape" aria-hidden />
        </div>
        <DemoForm lang={lang} />
      </section>

      <footer className="lp-wrap lp-footer">
        <div className="lp-foot-brand"><span className="lp-mark sm"><WrenchIcon /></span> Auto-Garaj</div>
        <div className="lp-foot-text">{tr(COPY.footer, lang)}</div>
        <div className="lp-foot-meta">© 2026 · O‘zbekiston</div>
      </footer>
    </div>
  );
}

function LangSwitch({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const opts: { k: Lang; label: string }[] = [
    { k: "uz", label: "UZ" },
    { k: "ru", label: "RU" },
    { k: "en", label: "EN" },
  ];
  return (
    <div className="lp-lang" role="tablist" aria-label="Language">
      {opts.map((o) => (
        <button key={o.k} role="tab" aria-selected={lang === o.k} onClick={() => setLang(o.k)}
          className={"lp-lang-btn" + (lang === o.k ? " on" : "")}>{o.label}</button>
      ))}
    </div>
  );
}

// Product motif: a work-order card echoing the real console (plate · model · client +
// status pill), floating over a faint board column — ties the brand to the product.
function HeroCard({ lang }: { lang: Lang }) {
  const status: Tri = { uz: "Jarayonda", ru: "В работе", en: "In progress" };
  const total: Tri = { uz: "1 250 000 so‘m", ru: "1 250 000 сум", en: "1,250,000 UZS" };
  const client: Tri = { uz: "Islom A.", ru: "Ислом А.", en: "Islom A." };
  return (
    <div className="lp-art">
      <div className="lp-art-col" aria-hidden>
        <span className="lp-art-bar" /><span className="lp-art-bar w2" /><span className="lp-art-bar w3" />
      </div>
      <div className="lp-wo">
        <div className="lp-wo-top">
          <span className="lp-wo-id">Z-0142</span>
          <span className="lp-wo-pill"><span className="lp-pulse" /> {tr(status, lang)}</span>
        </div>
        <div className="lp-plate"><span className="lp-plate-reg">01</span><span className="lp-plate-main">A 356 BC</span></div>
        <div className="lp-wo-model">Chevrolet Spark</div>
        <div className="lp-wo-foot">
          <span className="lp-wo-client"><UserIcon /> {tr(client, lang)}</span>
          <span className="lp-wo-total">{tr(total, lang)}</span>
        </div>
      </div>
    </div>
  );
}

function DemoForm({ lang }: { lang: Lang }) {
  const [f, setF] = useState({ name: "", shop: "", phone: "+998 ", city: "", message: "" });
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "busy") return;
    if (!f.name.trim() || f.phone.replace(/\D/g, "").length < 9) { setState("err"); return; }
    setState("busy");
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, lang }),
      });
      setState(res.ok ? "ok" : "err");
    } catch {
      setState("err");
    }
  };

  if (state === "ok") {
    return (
      <div className="lp-form lp-form-done">
        <div className="lp-done-mark"><CheckIcon /></div>
        <div className="lp-done-title">{tr(COPY.ok_title, lang)}</div>
        <div className="lp-done-body">{tr(COPY.ok_body, lang)}</div>
        <button className="lp-btn lp-btn-line" onClick={() => { setF({ name: "", shop: "", phone: "+998 ", city: "", message: "" }); setState("idle"); }}>{tr(COPY.again, lang)}</button>
      </div>
    );
  }

  return (
    <form className="lp-form" onSubmit={submit} noValidate>
      <label className="lp-field">
        <span className="lp-label">{tr(COPY.f_name, lang)}</span>
        <input className="lp-input" value={f.name} onChange={set("name")} autoComplete="name" required />
      </label>
      <label className="lp-field">
        <span className="lp-label">{tr(COPY.f_shop, lang)}</span>
        <input className="lp-input" value={f.shop} onChange={set("shop")} autoComplete="organization" />
      </label>
      <div className="lp-row2">
        <label className="lp-field">
          <span className="lp-label">{tr(COPY.f_phone, lang)}</span>
          <input className="lp-input lp-mono" value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" required />
        </label>
        <label className="lp-field">
          <span className="lp-label">{tr(COPY.f_city, lang)}</span>
          <input className="lp-input" value={f.city} onChange={set("city")} autoComplete="address-level2" />
        </label>
      </div>
      <label className="lp-field">
        <span className="lp-label">{tr(COPY.f_msg, lang)}</span>
        <textarea className="lp-input lp-textarea" value={f.message} onChange={set("message")} rows={3} />
      </label>
      {state === "err" && <div className="lp-err">{tr(COPY.err, lang)}</div>}
      <button type="submit" className="lp-btn lp-btn-primary lp-submit" disabled={state === "busy"}>
        {state === "busy" ? tr(COPY.sending, lang) : <>{tr(COPY.send, lang)} <ArrowIcon /></>}
      </button>
    </form>
  );
}

/* ── icons (inline, theme-independent) ── */
function WrenchIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.3L3 18l3 3 6.4-6.4a4 4 0 0 0 5.3-5.4l-2.6 2.6-2.3-.6-.6-2.3 2.5-2.6Z" /></svg>; }
function ArrowIcon() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>; }
function CheckIcon() { return <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>; }
function UserIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>; }
function BoardIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="6" height="18" rx="1.5" /><rect x="10.5" y="3" width="6" height="12" rx="1.5" /><rect x="18" y="3" width="3" height="8" rx="1.2" /></svg>; }
function BellIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>; }
function ChartIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19V5M4 19h16" /><path d="M8 16l3-4 3 2 4-6" /></svg>; }
function BoxIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8l9 5 9-5Z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></svg>; }
function ReceiptIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3v18l2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1Z" /><path d="M9 8h6M9 12h6" /></svg>; }
function PlateIcon() { return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2" /><path d="M6 10v4M10 10v4M14 10h2M18 10h.5M14 14h4" /></svg>; }

function LandingStyle() {
  return (
    <style>{`
.lp {
  --bg: oklch(0.155 0.013 65); --bg2: oklch(0.205 0.015 65);
  --panel: oklch(0.225 0.015 66); --panel2: oklch(0.265 0.017 66);
  --ink: oklch(0.975 0.012 85); --ink2: oklch(0.80 0.014 80); --ink3: oklch(0.63 0.016 75);
  --line: oklch(0.33 0.014 65); --line2: oklch(0.42 0.016 65);
  --amber: oklch(0.84 0.145 80); --amber2: oklch(0.72 0.19 52); --ok: oklch(0.80 0.15 155);
  --disp: 'Unbounded', system-ui, sans-serif; --body: 'Golos Text', system-ui, sans-serif; --mono: 'JetBrains Mono', monospace;
  position: relative; min-height: 100vh; width: 100%; overflow-x: hidden;
  background: var(--bg); color: var(--ink); font-family: var(--body);
  -webkit-font-smoothing: antialiased; scroll-behavior: smooth;
}
.lp ::selection { background: var(--amber); color: oklch(0.2 0.02 70); }
.lp-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(120% 90% at 88% -10%, oklch(0.83 0.14 78 / 0.16), transparent 60%),
    radial-gradient(90% 70% at -10% 110%, oklch(0.70 0.18 50 / 0.12), transparent 55%),
    linear-gradient(180deg, var(--bg), var(--bg2));
}
.lp-bg::after { content: ""; position: absolute; inset: 0; opacity: 0.4;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 64px 64px; mask-image: radial-gradient(120% 80% at 50% 0%, #000 30%, transparent 78%); }
.lp-glow { position: fixed; top: -18vh; right: -10vw; width: 60vw; height: 60vw; max-width: 760px; max-height: 760px; z-index: 0; pointer-events: none;
  background: radial-gradient(circle, oklch(0.82 0.15 76 / 0.22), transparent 62%); filter: blur(20px);
  animation: lp-drift 16s ease-in-out infinite alternate; }
@keyframes lp-drift { from { transform: translate(0,0) scale(1); } to { transform: translate(-5vw, 5vh) scale(1.12); } }

.lp-wrap { position: relative; z-index: 1; width: 100%; max-width: 1120px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.lp-rise { opacity: 0; animation: lp-rise .7s cubic-bezier(.2,.7,.2,1) forwards; }

/* nav */
.lp-nav { display: flex; align-items: center; justify-content: space-between; padding-top: 22px; padding-bottom: 22px; }
.lp-brand { display: inline-flex; align-items: center; gap: 11px; text-decoration: none; color: var(--ink); }
.lp-mark { width: 38px; height: 38px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, var(--amber), var(--amber2)); color: oklch(0.2 0.03 65);
  box-shadow: 0 6px 20px oklch(0.7 0.18 60 / 0.3); }
.lp-mark.sm { width: 28px; height: 28px; border-radius: 8px; }
.lp-brand-name { font-family: var(--disp); font-weight: 800; font-size: 19px; letter-spacing: -0.02em; }
.lp-nav-right { display: flex; align-items: center; gap: 14px; }
.lp-lang { display: inline-flex; padding: 4px; gap: 2px; background: oklch(1 0 0 / 0.05); border: 1px solid var(--line); border-radius: 999px; }
.lp-lang-btn { border: none; background: transparent; color: var(--ink3); font-family: var(--mono); font-weight: 600; font-size: 12.5px; letter-spacing: .04em; padding: 6px 11px; border-radius: 999px; cursor: pointer; transition: color .15s, background .15s; }
.lp-lang-btn:hover { color: var(--ink2); }
.lp-lang-btn.on { background: var(--ink); color: oklch(0.18 0.02 70); }

/* buttons */
.lp-btn { display: inline-flex; align-items: center; gap: 8px; font-family: var(--body); font-weight: 700; font-size: 15px; text-decoration: none; cursor: pointer; border-radius: 12px; padding: 12px 20px; border: 1px solid transparent; transition: transform .08s, filter .15s, background .15s, border-color .15s, box-shadow .15s; white-space: nowrap; }
.lp-btn:active { transform: scale(.975); }
.lp-btn-primary { background: linear-gradient(135deg, var(--amber), var(--amber2)); color: oklch(0.2 0.03 60); box-shadow: 0 10px 30px oklch(0.7 0.18 58 / 0.28); }
.lp-btn-primary:hover { filter: brightness(1.06); box-shadow: 0 14px 38px oklch(0.7 0.18 58 / 0.38); }
.lp-btn-line { background: transparent; color: var(--ink); border-color: var(--line2); }
.lp-btn-line:hover { border-color: var(--amber); color: var(--amber); }
.lp-btn-ghost { background: oklch(1 0 0 / 0.05); color: var(--ink2); border-color: var(--line); padding: 9px 16px; font-size: 14px; }
.lp-btn-ghost:hover { color: var(--ink); border-color: var(--line2); }

/* hero */
.lp-hero { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 48px; align-items: center; padding-top: 56px; padding-bottom: 72px; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; color: var(--amber); letter-spacing: .01em; text-transform: uppercase; }
.lp-eyebrow-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--amber); box-shadow: 0 0 0 4px oklch(0.82 0.15 76 / 0.18); }
.lp-h1 { font-family: var(--disp); font-weight: 800; font-size: clamp(34px, 6vw, 60px); line-height: 1.02; letter-spacing: -0.035em; margin: 18px 0 0; }
.lp-h1-accent { background: linear-gradient(120deg, var(--amber), var(--amber2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp-sub { font-size: clamp(15.5px, 2vw, 18.5px); line-height: 1.55; color: var(--ink2); margin: 20px 0 0; max-width: 38ch; }
.lp-hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.lp-trust { display: inline-flex; align-items: center; gap: 9px; margin-top: 26px; font-size: 13.5px; color: var(--ink3); }
.lp-flag { width: 20px; height: 14px; border-radius: 3px; flex-shrink: 0; background: linear-gradient(180deg, oklch(0.7 0.13 220) 0 33%, #fff 33% 39%, oklch(0.72 0.15 150) 39% 67%, #fff 67% 73%, oklch(0.66 0.18 25) 73% 100%); box-shadow: 0 0 0 1px var(--line); }

/* hero art */
.lp-hero-art { display: flex; justify-content: center; }
.lp-art { position: relative; width: 100%; max-width: 380px; }
.lp-art-col { position: absolute; inset: -18px -14px -22px -14px; border-radius: 22px; background: oklch(1 0 0 / 0.03); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; padding: 18px; transform: rotate(-3deg); }
.lp-art-bar { height: 12px; border-radius: 6px; background: oklch(1 0 0 / 0.06); }
.lp-art-bar.w2 { width: 70%; } .lp-art-bar.w3 { width: 45%; }
.lp-wo { position: relative; background: linear-gradient(160deg, var(--panel2), var(--panel)); border: 1px solid var(--line2); border-radius: 18px; padding: 20px; box-shadow: var(--shadow-lg, 0 30px 70px oklch(0.05 0.02 60 / 0.55)); animation: lp-float 6s ease-in-out infinite; }
@keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
.lp-wo-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.lp-wo-id { font-family: var(--mono); font-weight: 700; font-size: 14px; color: var(--ink2); }
.lp-wo-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--amber); background: oklch(0.82 0.15 76 / 0.14); border: 1px solid oklch(0.82 0.15 76 / 0.3); padding: 4px 10px; border-radius: 999px; }
.lp-pulse { width: 7px; height: 7px; border-radius: 99px; background: var(--amber); animation: lp-blink 1.4s ease-in-out infinite; }
@keyframes lp-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.lp-plate { display: inline-flex; align-items: stretch; border-radius: 7px; overflow: hidden; border: 1.5px solid oklch(0.85 0.01 90); background: #fff; font-family: var(--mono); font-weight: 700; box-shadow: 0 2px 8px oklch(0 0 0 / 0.3); }
.lp-plate-reg { background: oklch(0.32 0.08 250); color: #fff; padding: 7px 8px; font-size: 15px; }
.lp-plate-main { color: oklch(0.2 0.02 250); padding: 7px 12px; font-size: 17px; letter-spacing: .06em; }
.lp-wo-model { font-family: var(--disp); font-weight: 600; font-size: 18px; color: var(--ink); margin-top: 13px; letter-spacing: -0.01em; }
.lp-wo-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 15px; border-top: 1px dashed var(--line2); }
.lp-wo-client { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink3); }
.lp-wo-total { font-family: var(--mono); font-weight: 700; font-size: 14.5px; color: var(--ok); }

/* features */
.lp-features { padding-top: 36px; padding-bottom: 40px; }
.lp-sec-head { max-width: 620px; }
.lp-kicker { font-family: var(--mono); font-size: 12.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--amber); }
.lp-h2 { font-family: var(--disp); font-weight: 700; font-size: clamp(26px, 3.6vw, 38px); letter-spacing: -0.03em; line-height: 1.08; margin: 10px 0 0; }
.lp-sec-sub { font-size: 16px; color: var(--ink2); margin: 12px 0 0; line-height: 1.5; }
.lp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 34px; }
.lp-card { position: relative; background: oklch(1 0 0 / 0.035); border: 1px solid var(--line); border-radius: 16px; padding: 22px; transition: transform .16s, border-color .16s, background .16s; overflow: hidden; }
.lp-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, var(--amber), var(--amber2)); opacity: 0; transition: opacity .16s; }
.lp-card:hover { transform: translateY(-4px); border-color: var(--line2); background: oklch(1 0 0 / 0.06); }
.lp-card:hover::before { opacity: 1; }
.lp-card-ico { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--amber); background: oklch(0.82 0.15 76 / 0.12); border: 1px solid oklch(0.82 0.15 76 / 0.22); margin-bottom: 16px; }
.lp-card-title { font-family: var(--disp); font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
.lp-card-desc { font-size: 14px; line-height: 1.5; color: var(--ink2); margin-top: 8px; }

/* demo */
.lp-demo { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 48px; align-items: center; padding-top: 56px; padding-bottom: 64px; }
.lp-demo-copy { position: relative; }
.lp-tape { margin-top: 26px; height: 14px; border-radius: 4px; background: repeating-linear-gradient(45deg, var(--amber) 0 14px, oklch(0.2 0.02 70) 14px 28px); opacity: .85; max-width: 230px; }
.lp-form { background: linear-gradient(165deg, var(--panel2), var(--panel)); border: 1px solid var(--line2); border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 30px 70px oklch(0.04 0.02 60 / 0.45); }
.lp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lp-field { display: flex; flex-direction: column; gap: 7px; }
.lp-label { font-size: 13px; font-weight: 600; color: var(--ink2); }
.lp-input { width: 100%; background: oklch(0.16 0.012 65); border: 1.5px solid var(--line2); border-radius: 11px; color: var(--ink); font-family: var(--body); font-size: 15px; padding: 12px 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
.lp-input::placeholder { color: var(--ink3); }
.lp-input:focus { border-color: var(--amber); box-shadow: 0 0 0 3px oklch(0.82 0.15 76 / 0.18); }
.lp-mono { font-family: var(--mono); letter-spacing: .02em; }
.lp-textarea { resize: vertical; min-height: 78px; }
.lp-submit { justify-content: center; margin-top: 6px; padding: 14px; font-size: 16px; }
.lp-err { font-size: 13.5px; color: oklch(0.8 0.13 28); background: oklch(0.6 0.2 25 / 0.14); border: 1px solid oklch(0.6 0.2 25 / 0.3); padding: 9px 12px; border-radius: 10px; }
.lp-form-done { align-items: center; text-align: center; gap: 12px; padding: 40px 26px; }
.lp-done-mark { width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: oklch(0.2 0.03 60); background: linear-gradient(135deg, var(--amber), var(--amber2)); box-shadow: 0 12px 32px oklch(0.7 0.18 58 / 0.34); animation: lp-pop .4s cubic-bezier(.2,1.3,.4,1); }
@keyframes lp-pop { from { transform: scale(.6); opacity: 0; } to { transform: none; opacity: 1; } }
.lp-done-title { font-family: var(--disp); font-weight: 700; font-size: 24px; }
.lp-done-body { font-size: 15px; color: var(--ink2); line-height: 1.5; max-width: 34ch; }

/* footer */
.lp-footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; padding-top: 28px; padding-bottom: 40px; margin-top: 24px; border-top: 1px solid var(--line); }
.lp-foot-brand { display: inline-flex; align-items: center; gap: 9px; font-family: var(--disp); font-weight: 700; font-size: 16px; }
.lp-foot-text { font-size: 13.5px; color: var(--ink3); flex: 1; min-width: 220px; }
.lp-foot-meta { font-family: var(--mono); font-size: 12.5px; color: var(--ink3); }

@media (max-width: 900px) {
  .lp-hero { grid-template-columns: 1fr; gap: 40px; padding-top: 32px; padding-bottom: 48px; }
  .lp-hero-art { order: -1; }
  .lp-demo { grid-template-columns: 1fr; gap: 28px; }
  .lp-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 560px) {
  .lp-grid { grid-template-columns: 1fr; }
  .lp-row2 { grid-template-columns: 1fr; }
  .lp-wrap { padding-left: 18px; padding-right: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-rise, .lp-glow, .lp-wo, .lp-pulse, .lp-done-mark { animation: none; }
  .lp-rise { opacity: 1; transform: none; }
}
`}</style>
  );
}
