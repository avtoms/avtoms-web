"use client";
// Public marketing landing page (the front door for guests). Self-contained: its own dark
// "garage-signal" theme, fonts (Unbounded display + Golos Text body + JetBrains Mono),
// and a trilingual (UZ / RU / EN) copy dictionary — it does NOT use the app's i18n/theme
// providers so it can present a distinct brand world. Submits the demo form to /api/demo.
import React, { useEffect, useRef, useState } from "react";

type Tri = { uz: string; ru: string; en: string };
type Lang = "uz" | "ru" | "en";
const tr = (v: Tri, l: Lang) => v[l];

const COPY = {
  nav_login: { uz: "Kirish", ru: "Войти", en: "Log in" },
  eyebrow: { uz: "Avtoservis uchun raqamli boshqaruv", ru: "Цифровое управление автосервисом", en: "Digital management for auto shops" },
  h1a: { uz: "Sizning avtoservisingiz —", ru: "Ваш автосервис —", en: "Your auto shop —" },
  h1b: { uz: "bitta ekranda.", ru: "на одном экране.", en: "on one screen." },
  sub: {
    uz: "Buyurtmalar, mijozlar, ombor, hisob-fakturalar va moliya — MDH bozori uchun yaratilgan platformada.",
    ru: "Заказы, клиенты, склад, счета и финансы — на платформе, созданной для стран СНГ.",
    en: "Work orders, clients, inventory, invoices and finances — on a platform built for the CIS.",
  },
  cta1: { uz: "Bepul demo olish", ru: "Получить демо", en: "Get a free demo" },
  cta2: { uz: "Tizimga kirish", ru: "Войти в систему", en: "Log in" },
  trust: { uz: "MDH avtoservislari uchun", ru: "Для автосервисов стран СНГ", en: "Made for CIS workshops" },
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
  // stats strip
  st1: { uz: "davlat raqam formati", ru: "форматов госномеров", en: "plate formats" },
  st2: { uz: "interfeys tili", ru: "языка интерфейса", en: "interface languages" },
  st3: { uz: "Telegram yordamchi", ru: "Telegram-помощник", en: "Telegram assistant" },
  st4: { uz: "soniyada qidiruv", ru: "секунда на поиск", en: "second to find a car" },
  // live flow demo
  flow_kicker: { uz: "Jonli jarayon", ru: "Живой процесс", en: "Live flow" },
  flow_title: { uz: "Buyurtma o‘zi yuradi", ru: "Заказ движется сам", en: "Watch a job flow" },
  flow_sub: {
    uz: "Qabul qilingan mashina doskada bosqichma-bosqich harakatlanadi — tayyor bo‘lishi bilan mijozga Telegram xabari ketadi.",
    ru: "Принятая машина движется по доске шаг за шагом — как только готова, клиенту уходит сообщение в Telegram.",
    en: "A job moves across the board stage by stage — the moment it’s ready, the client gets a Telegram message.",
  },
  col1: { uz: "Qabul", ru: "Приём", en: "Intake" },
  col2: { uz: "Jarayonda", ru: "В работе", en: "In progress" },
  col3: { uz: "Tayyor", ru: "Готово", en: "Ready" },
  tg_msg: { uz: "Mashinangiz tayyor! 🎉", ru: "Ваша машина готова! 🎉", en: "Your car is ready! 🎉" },
  // AI showcase
  ai_kicker: { uz: "AI yordamchi", ru: "AI-помощник", en: "AI assistant" },
  ai_title: { uz: "Ma’lumotlaringiz bilan gaplashing", ru: "Говорите со своими данными", en: "Talk to your data" },
  ai_sub: {
    uz: "Savolni oddiy tilda bering — foyda, buyurtmalar va mijozlar bo‘yicha javob jadval va tugmalar bilan keladi. Faqat o‘qiydi — 100% xavfsiz.",
    ru: "Задайте вопрос обычным языком — ответ придёт с таблицами и кнопками: прибыль, заказы, клиенты. Только чтение — 100% безопасно.",
    en: "Ask in plain words — answers come with tables and buttons: profit, jobs, clients. Read-only — 100% safe.",
  },
  ai_q: { uz: "Bu oy foyda qancha?", ru: "Какая прибыль в этом месяце?", en: "How’s profit this month?" },
  ai_a_title: { uz: "Sof foyda: 38,6 mln so‘m", ru: "Чистая прибыль: 38,6 млн сум", en: "Net profit: 38.6M UZS" },
  ai_a_sub: { uz: "O‘tgan oyga nisbatan +18%", ru: "На 18% больше, чем в прошлом месяце", en: "+18% vs last month" },
  ai_a_btn: { uz: "Moliyani ochish →", ru: "Открыть финансы →", en: "Open finances →" },
  // product window
  pw_kicker: { uz: "Mahsulot ichida", ru: "Внутри продукта", en: "Inside the product" },
  pw_title: { uz: "Servisingiz shunday ko‘rinadi", ru: "Так выглядит ваш сервис", en: "This is your shop, live" },
  pw_sub: {
    uz: "Boshqaruv paneli, jonli doska va moliya — hammasi bitta oynada.",
    ru: "Панель управления, живая доска и финансы — в одном окне.",
    en: "Dashboard, live board and finances — in one window.",
  },
  an1: { uz: "Boshqaruv", ru: "Панель", en: "Dashboard" },
  an2: { uz: "Buyurtmalar", ru: "Заказы", en: "Orders" },
  an3: { uz: "Mijozlar", ru: "Клиенты", en: "Clients" },
  an4: { uz: "Moliya", ru: "Финансы", en: "Finance" },
  an5: { uz: "Ombor", ru: "Склад", en: "Inventory" },
  ak1: { uz: "Bugungi tushum", ru: "Выручка сегодня", en: "Today’s revenue" },
  ak2: { uz: "Jarayonda", ru: "В работе", en: "In progress" },
  ak3: { uz: "Tayyor", ru: "Готово", en: "Ready" },
  // how it works
  hw_kicker: { uz: "Qanday boshlanadi", ru: "Как начать", en: "How it works" },
  hw_title: { uz: "3 qadam — va servis raqamda", ru: "3 шага — и сервис в цифре", en: "3 steps to go digital" },
  hw1t: { uz: "Demo so‘rov qoldiring", ru: "Оставьте заявку", en: "Request a demo" },
  hw1d: { uz: "30 soniya — quyidagi forma orqali.", ru: "30 секунд — через форму ниже.", en: "Takes 30 seconds via the form below." },
  hw2t: { uz: "Birga sozlaymiz", ru: "Настроим вместе", en: "We set it up with you" },
  hw2d: { uz: "Bir kunda: xizmatlar menyusi, jamoa va Telegram bot.", ru: "За один день: меню услуг, команда и Telegram-бот.", en: "One day: service menu, team and the Telegram bot." },
  hw3t: { uz: "Ishlashni boshlang", ru: "Начинайте работать", en: "Start working" },
  hw3d: { uz: "Birinchi kundanoq buyurtmalar doskada, mijozlar Telegramda.", ru: "С первого дня заказы на доске, клиенты в Telegram.", en: "From day one: jobs on the board, clients on Telegram." },
  // pricing
  pr_kicker: { uz: "Tariflar", ru: "Тарифы", en: "Plans" },
  pr_title: { uz: "Har bir servisga mos reja", ru: "План под каждый сервис", en: "A plan for every shop" },
  pr_sub: {
    uz: "Narx servis hajmiga qarab — demo paytida aniq taklif beramiz.",
    ru: "Цена зависит от размера сервиса — точное предложение на демо.",
    en: "Pricing depends on shop size — you’ll get an exact quote at the demo.",
  },
  pr_pop: { uz: "Ommabop", ru: "Популярный", en: "Popular" },
  pr_cta: { uz: "Narxni bilish", ru: "Узнать цену", en: "Get a quote" },
  // FAQ
  faq_kicker: { uz: "Savol-javob", ru: "Вопросы и ответы", en: "FAQ" },
  faq_title: { uz: "Ko‘p so‘raladigan savollar", ru: "Частые вопросы", en: "Frequently asked" },
};

// Pricing tiers — deliberately number-free (quotes are given at the demo), so nothing on
// the page can go stale or mislead.
const TIERS: { name: Tri; popular?: boolean; feats: Tri[] }[] = [
  {
    name: { uz: "Start", ru: "Старт", en: "Start" },
    feats: [
      { uz: "1 filial", ru: "1 филиал", en: "1 location" },
      { uz: "3 tagacha usta", ru: "До 3 мастеров", en: "Up to 3 mechanics" },
      { uz: "Buyurtmalar + mijozlar", ru: "Заказы и клиенты", en: "Orders & clients" },
      { uz: "Fiskal cheklar", ru: "Фискальные чеки", en: "Fiscal receipts" },
    ],
  },
  {
    name: { uz: "Biznes", ru: "Бизнес", en: "Business" },
    popular: true,
    feats: [
      { uz: "Cheklanmagan ustalar", ru: "Без лимита мастеров", en: "Unlimited mechanics" },
      { uz: "Telegram bot + eslatmalar", ru: "Telegram-бот и напоминания", en: "Telegram bot & reminders" },
      { uz: "Moliya va foyda hisoboti", ru: "Финансы и P&L", en: "Finance & P&L" },
      { uz: "AI yordamchi", ru: "AI-помощник", en: "AI assistant" },
    ],
  },
  {
    name: { uz: "Tarmoq", ru: "Сеть", en: "Network" },
    feats: [
      { uz: "Bir nechta filial", ru: "Несколько филиалов", en: "Multiple locations" },
      { uz: "Yagona nazorat paneli", ru: "Единая панель контроля", en: "One control panel" },
      { uz: "Individual integratsiyalar", ru: "Индивидуальные интеграции", en: "Custom integrations" },
      { uz: "Ustuvor qo‘llab-quvvatlash", ru: "Приоритетная поддержка", en: "Priority support" },
    ],
  },
];

// FAQ — truthful answers about how the product actually works today.
const FAQS: { q: Tri; a: Tri }[] = [
  {
    q: { uz: "Qancha vaqtda ishga tushadi?", ru: "Как быстро всё запускается?", en: "How fast is the setup?" },
    a: {
      uz: "Bir kun ichida. Xizmatlar menyusi, jamoa va Telegram botni birga sozlaymiz — ertasiga ishlaysiz.",
      ru: "За один день. Вместе настроим меню услуг, команду и Telegram-бота — на следующий день работаете.",
      en: "One day. We set up your service menu, team and the Telegram bot together — you work the next day.",
    },
  },
  {
    q: { uz: "Ustalar uchun qiyin emasmi?", ru: "Не сложно ли мастерам?", en: "Is it hard for mechanics?" },
    a: {
      uz: "Yo‘q. Usta telefonida ochadi, faqat o‘ziga biriktirilgan ishlarni ko‘radi va 2 tugma bilan holatni yuritadi.",
      ru: "Нет. Мастер открывает с телефона, видит только свои работы и ведёт статус в два нажатия.",
      en: "No. A mechanic opens it on the phone, sees only their own jobs and updates status in two taps.",
    },
  },
  {
    q: { uz: "Mijozlarga ilova kerakmi?", ru: "Клиентам нужно приложение?", en: "Do clients need an app?" },
    a: {
      uz: "Kerak emas. Smeta tasdiqlash, “mashina tayyor” xabari va eslatmalar — hammasi Telegram orqali.",
      ru: "Нет. Согласование сметы, «машина готова» и напоминания — всё через Telegram.",
      en: "No. Estimate approval, “car is ready” and reminders all happen in Telegram.",
    },
  },
  {
    q: { uz: "Ma’lumotlarim xavfsizmi?", ru: "Мои данные в безопасности?", en: "Is my data safe?" },
    a: {
      uz: "Har servis faqat o‘z ma’lumotini ko‘radi. Usta narx va foydani ko‘rmaydi. AI yordamchi faqat o‘qiydi — hech narsani o‘zgartira olmaydi.",
      ru: "Каждый сервис видит только свои данные. Мастер не видит цены и прибыль. AI-помощник только читает — ничего не меняет.",
      en: "Each shop sees only its own data. Mechanics can’t see prices or profit. The AI assistant is read-only.",
    },
  },
  {
    q: { uz: "Qaysi davlatlarda ishlaydi?", ru: "В каких странах работает?", en: "Which countries are supported?" },
    a: {
      uz: "O‘zbekiston va butun MDH: 9 davlat raqam formati, 3 til (o‘zbek lotin, кирилл, русский).",
      ru: "Узбекистан и все страны СНГ: 9 форматов госномеров, 3 языка интерфейса.",
      en: "Uzbekistan and the wider CIS: 9 plate formats, 3 interface languages.",
    },
  },
];

// Authentic CIS passenger-plate formats (same order as the flag cycle), each with a popular
// local car. `tab` is the coloured region/country band; `side` is where it sits (Russia &
// Kazakhstan carry the region band on the RIGHT, most others on the left, Belarus none —
// region after the dash). Sources: Wikipedia "Vehicle registration plates of <country>".
type PlateSpec = { code: string; tab: string; side: "left" | "right" | "none"; main: string; car: string };
const CIS: PlateSpec[] = [
  { code: "uz", tab: "01", side: "left", main: "A 777 AA", car: "Chevrolet Spark" }, // region + L + 3d + 2L
  { code: "ru", tab: "77", side: "right", main: "А 123 ВС", car: "Lada Vesta" },     // L + 3d + 2L | region (Cyrillic)
  { code: "kz", tab: "02", side: "right", main: "123 ABC", car: "Toyota Camry" },    // 3d + 3L | region
  { code: "kg", tab: "01", side: "left", main: "234 ABC", car: "Honda Fit" },        // region(KG) + 3d + 3L
  { code: "tj", tab: "TJ", side: "left", main: "1234 SH 01", car: "Opel Astra" },    // TJ band + 4d + 2L + region
  { code: "by", tab: "", side: "none", main: "1234 AB-7", car: "VW Passat" },        // 4d + 2L - region
  { code: "am", tab: "34", side: "left", main: "SS 045", car: "Nissan Tiida" },      // region + 2L + 3d
  { code: "az", tab: "10", side: "left", main: "AA 123", car: "Mercedes E" },        // region(AZ) + 2L + 3d
  { code: "md", tab: "MD", side: "left", main: "ABC 123", car: "Dacia Logan" },      // MD band + 3L + 3d
];

// Plate renders a license plate in the brand chip style: the coloured region/country band on
// the correct side, then the white field with the registration characters.
function Plate({ spec, big }: { spec: PlateSpec; big?: boolean }) {
  const tab = spec.tab ? (
    <span style={{ background: "#15296b", color: "#fff", padding: big ? "7px 9px" : "4px 7px", fontSize: big ? 15 : 12, display: "inline-flex", alignItems: "center", lineHeight: 1 }}>{spec.tab}</span>
  ) : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "stretch", border: "1.5px solid #cfd6e6", borderRadius: big ? 7 : 5, overflow: "hidden", background: "#fff", fontFamily: "var(--mono)", fontWeight: 700, boxShadow: big ? "0 2px 8px rgba(0,0,0,.3)" : "none", lineHeight: 1, flexShrink: 0 }}>
      {spec.side === "left" && tab}
      <span style={{ color: "#16203a", padding: big ? "7px 11px" : "4px 9px", fontSize: big ? 17 : 12.5, letterSpacing: ".06em", display: "inline-flex", alignItems: "center" }}>{spec.main}</span>
      {spec.side === "right" && tab}
    </span>
  );
}

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
    desc: { uz: "QR-kodli rasmiy cheklar — mahalliy soliq talablariga mos.", ru: "Официальные чеки с QR — по местным налоговым требованиям.", en: "Official QR receipts, compliant with local tax rules." },
  },
  {
    icon: <PlateIcon />,
    title: { uz: "Davlat raqami bo‘yicha qidiruv", ru: "Поиск по госномеру", en: "Search by plate number" },
    desc: { uz: "Mashinani raqami va modeli bilan bir soniyada toping.", ru: "Найдите авто по номеру и модели за секунду.", en: "Find any car by plate and model in a second." },
  },
];

// useReveal makes every .lp-reveal element rise into view once it scrolls into the viewport
// (adds the .in class; CSS does the animation). Elements are revealed once and left alone.
function useReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll(".lp-reveal"));
    if (els.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      }
    }, { threshold: 0.15 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export default function LandingPage() {
  const [lang, setLang] = useState<Lang>("uz");
  // One shared cycle drives BOTH the CIS flag and the example plate, so the plate always
  // matches the flag currently shown (UZ flag → Uzbek plate, RU flag → Russian plate, …).
  const [ci, setCi] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setCi((x) => (x + 1) % CIS.length), 2400);
    return () => clearInterval(iv);
  }, []);
  const country = CIS[ci];
  useReveal();
  // The nav frosts into glass once the page scrolls.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 14);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div className="lp">
      <LandingStyle />
      <div className="lp-bg" aria-hidden />
      <div className="lp-aurora a1" aria-hidden />
      <div className="lp-aurora a2" aria-hidden />
      <div className="lp-glow" aria-hidden />

      {/* ── top bar (sticky; frosts into glass on scroll) ── */}
      <header className={"lp-navbar" + (scrolled ? " st" : "")}>
        <div className="lp-wrap lp-nav">
          <a href="#top" className="lp-brand">
            <span className="lp-mark"><WrenchIcon /></span>
            <span className="lp-brand-name">Auto-Garaj</span>
          </a>
          <div className="lp-nav-right">
            <LangSwitch lang={lang} setLang={setLang} />
            <a href="/login" className="lp-btn lp-btn-ghost">{tr(COPY.nav_login, lang)}</a>
          </div>
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
            <CisFlag code={country.code} /> {tr(COPY.trust, lang)}
          </div>
        </div>
        <div className="lp-hero-art lp-rise" style={{ animationDelay: "260ms" }}>
          <HeroCard lang={lang} country={country} />
        </div>
      </section>

      {/* ── plate marquee (auto-scrolling brand motif) ── */}
      <div className="lp-marquee" aria-hidden>
        <div className="lp-marquee-track">
          {[...CIS, ...CIS].map((c, i) => (
            <span className="lp-chip" key={i}>
              <span className={"fi fi-" + c.code} style={{ width: 20, height: 14, borderRadius: 2, flexShrink: 0, boxShadow: "0 0 0 1px var(--line)" }} />
              <Plate spec={c} />
              <span className="lp-chip-model">{c.car}</span>
            </span>
          ))}
        </div>
      </div>

      {/* ── stats strip (counters animate on scroll) ── */}
      <section className="lp-wrap lp-stats lp-reveal">
        <div className="lp-stat"><span className="lp-stat-n"><Counter to={9} /></span><span className="lp-stat-l">{tr(COPY.st1, lang)}</span></div>
        <div className="lp-stat"><span className="lp-stat-n"><Counter to={3} /></span><span className="lp-stat-l">{tr(COPY.st2, lang)}</span></div>
        <div className="lp-stat"><span className="lp-stat-n"><Counter to={24} suffix="/7" /></span><span className="lp-stat-l">{tr(COPY.st3, lang)}</span></div>
        <div className="lp-stat"><span className="lp-stat-n"><Counter to={1} prefix="<" /></span><span className="lp-stat-l">{tr(COPY.st4, lang)}</span></div>
      </section>

      {/* ── product window: a full app-console mock in a browser frame ── */}
      <section className="lp-wrap lp-product">
        <div className="lp-sec-head lp-reveal" style={{ margin: "0 auto", textAlign: "center" }}>
          <span className="lp-kicker">{tr(COPY.pw_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.pw_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.pw_sub, lang)}</p>
        </div>
        <div className="lp-reveal" style={{ transitionDelay: "140ms" }}><AppWindow lang={lang} /></div>
      </section>

      {/* ── live flow demo: a job card moves across the board, then Telegram fires ── */}
      <section className="lp-wrap lp-flow">
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">{tr(COPY.flow_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.flow_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.flow_sub, lang)}</p>
        </div>
        <FlowDemo lang={lang} country={country} />
      </section>

      {/* ── features ── */}
      <section className="lp-wrap lp-features">
        <div className="lp-sec-head lp-reveal">
          <h2 className="lp-h2">{tr(COPY.feat_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.feat_sub, lang)}</p>
        </div>
        <div className="lp-grid">
          {FEATURES.map((f, i) => (
            <div className="lp-card lp-reveal" key={i} style={{ transitionDelay: `${(i % 3) * 90}ms` }}>
              <div className="lp-card-ico">{f.icon}</div>
              <div className="lp-card-title">{tr(f.title, lang)}</div>
              <div className="lp-card-desc">{tr(f.desc, lang)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works: 3 steps with a connecting line ── */}
      <section className="lp-wrap lp-how">
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">{tr(COPY.hw_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.hw_title, lang)}</h2>
        </div>
        <div className="lp-steps">
          {[
            { t: COPY.hw1t, d: COPY.hw1d }, { t: COPY.hw2t, d: COPY.hw2d }, { t: COPY.hw3t, d: COPY.hw3d },
          ].map((s, i) => (
            <div className="lp-step lp-reveal" key={i} style={{ transitionDelay: `${i * 130}ms` }}>
              <span className="lp-step-n">{i + 1}</span>
              <div className="lp-step-t">{tr(s.t, lang)}</div>
              <div className="lp-step-d">{tr(s.d, lang)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── AI assistant showcase (typed question → thinking → answer) ── */}
      <section className="lp-wrap lp-ai">
        <div className="lp-demo-copy lp-reveal">
          <span className="lp-kicker">{tr(COPY.ai_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.ai_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.ai_sub, lang)}</p>
        </div>
        <div className="lp-reveal" style={{ transitionDelay: "120ms" }}><AiDemo lang={lang} /></div>
      </section>

      {/* ── pricing (number-free tiers; exact quote at the demo) ── */}
      <section className="lp-wrap lp-pricing">
        <div className="lp-sec-head lp-reveal" style={{ margin: "0 auto", textAlign: "center" }}>
          <span className="lp-kicker">{tr(COPY.pr_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.pr_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.pr_sub, lang)}</p>
        </div>
        <div className="lp-tiers">
          {TIERS.map((tier, i) => (
            <div className={"lp-tier lp-reveal" + (tier.popular ? " pop" : "")} key={i} style={{ transitionDelay: `${i * 110}ms` }}>
              {tier.popular && <span className="lp-tier-badge">{tr(COPY.pr_pop, lang)}</span>}
              <div className="lp-tier-name">{tr(tier.name, lang)}</div>
              <ul className="lp-tier-feats">
                {tier.feats.map((f, j) => <li key={j}><span className="lp-tier-check">✓</span>{tr(f, lang)}</li>)}
              </ul>
              <a href="#demo" className={"lp-btn " + (tier.popular ? "lp-btn-primary" : "lp-btn-line")} style={{ justifyContent: "center" }}>{tr(COPY.pr_cta, lang)}</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-wrap lp-faq">
        <div className="lp-sec-head lp-reveal">
          <span className="lp-kicker">{tr(COPY.faq_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.faq_title, lang)}</h2>
        </div>
        <div className="lp-faqs">
          {FAQS.map((f, i) => (
            <details className="lp-qa lp-reveal" key={i} style={{ transitionDelay: `${i * 70}ms` }}>
              <summary>{tr(f.q, lang)}<span className="lp-qa-plus" aria-hidden>+</span></summary>
              <p>{tr(f.a, lang)}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ── demo form ── */}
      <section id="demo" className="lp-wrap lp-demo">
        <div className="lp-demo-copy lp-reveal">
          <span className="lp-kicker">{tr(COPY.form_kicker, lang)}</span>
          <h2 className="lp-h2">{tr(COPY.form_title, lang)}</h2>
          <p className="lp-sec-sub">{tr(COPY.form_sub, lang)}</p>
          <div className="lp-tape" aria-hidden />
        </div>
        <div className="lp-reveal" style={{ transitionDelay: "120ms" }}><DemoForm lang={lang} /></div>
      </section>

      <footer className="lp-wrap lp-footer">
        <div className="lp-foot-brand"><span className="lp-mark sm"><WrenchIcon /></span> Auto-Garaj</div>
        <div className="lp-foot-text">{tr(COPY.footer, lang)}</div>
        <div className="lp-foot-meta">© 2026 · СНГ / CIS</div>
      </footer>
    </div>
  );
}

// The CIS has member states rather than one flag, so the "regional" mark cycles through the
// member-country flags — a small animated nod to the whole СНГ market. Real SVG flags come
// from the flag-icons library (accurate emblems, self-hosted — no emoji/CDN inconsistency).
// The regional mark shows the flag of the country whose plate is currently on display
// (driven by the shared cycle in LandingPage), with a small flip on each change.
function CisFlag({ code }: { code: string }) {
  return <span key={code} className={"lp-flag fi fi-" + code} title={code.toUpperCase()} />;
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
// The whole art block tilts gently toward the cursor (3D parallax); it resets on leave
// and does nothing on touch devices (no mousemove).
function HeroCard({ lang, country }: { lang: Lang; country: PlateSpec }) {
  const status: Tri = { uz: "Jarayonda", ru: "В работе", en: "In progress" };
  const total: Tri = { uz: "1 250 000 so‘m", ru: "1 250 000 сум", en: "1,250,000 UZS" };
  const client: Tri = { uz: "Islom N.", ru: "Ислом Н.", en: "Islom N." };
  const ref = useRef<HTMLDivElement | null>(null);
  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${(x * 9).toFixed(2)}deg) rotateX(${(-y * 9).toFixed(2)}deg)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <div className="lp-art lp-tilt" ref={ref} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="lp-art-col" aria-hidden>
        <span className="lp-art-bar" /><span className="lp-art-bar w2" /><span className="lp-art-bar w3" />
      </div>
      <div className="lp-wo">
        <div className="lp-wo-top">
          <span className="lp-wo-id">Z-0142</span>
          <span className="lp-wo-pill"><span className="lp-pulse" /> {tr(status, lang)}</span>
        </div>
        {/* Plate + car cycle through the CIS countries in sync with the trust-line flag. */}
        <div key={country.code} className="lp-platefade" style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <div><Plate spec={country} big /></div>
          <div className="lp-wo-model">{country.car}</div>
        </div>
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

// Counter animates a number from 0 to `to` (ease-out cubic, ~1.1s) the first time it
// scrolls into view. Renders the final value immediately for reduced-motion users.
function Counter({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - t0) / 1100);
        setV(to * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={ref}>{prefix}{Math.round(v)}{suffix}</span>;
}

// FlowDemo is the product story in one loop: a live job card hops Intake → In progress →
// Ready on a mini kanban board; when it reaches Ready, the client's Telegram toast pops.
// Stage 0/1/2 = column the card sits in; stage 3 keeps it in Ready while the toast shows.
function FlowDemo({ lang, country }: { lang: Lang; country: PlateSpec }) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setStage((s) => (s + 1) % 4), 2000);
    return () => clearInterval(iv);
  }, []);
  const col = Math.min(stage, 2);
  const cols: { key: number; label: Tri }[] = [
    { key: 0, label: COPY.col1 }, { key: 1, label: COPY.col2 }, { key: 2, label: COPY.col3 },
  ];
  return (
    <div className="lp-flowboard lp-reveal" style={{ transitionDelay: "100ms" }}>
      {cols.map((c) => (
        <div key={c.key} className={"lp-fcol" + (col === c.key ? " on" : "")}>
          <div className="lp-fcol-head">
            <span className={"lp-fcol-dot d" + c.key} /> {tr(c.label, lang)}
          </div>
          <span className="lp-fghost" /><span className="lp-fghost g2" />
          {col === c.key && (
            <div key={stage} className="lp-fcard">
              <div className="lp-fcard-top">
                <span className="lp-wo-id">Z-0142</span>
                {c.key === 2 ? <span className="lp-fdone"><CheckIcon /></span> : <span className="lp-pulse" />}
              </div>
              <div><Plate spec={country} /></div>
              <div className="lp-fcard-model">{country.car}</div>
            </div>
          )}
        </div>
      ))}
      {/* Telegram toast fires as the job lands in Ready */}
      <div className={"lp-tgtoast" + (stage === 3 ? " show" : "")} aria-hidden>
        <span className="lp-tgtoast-ico"><BellIcon /></span>
        <span>
          <b>Telegram</b>
          <span className="lp-tgtoast-msg">{tr(COPY.tg_msg, lang)}</span>
        </span>
      </div>
    </div>
  );
}

// AiDemo loops a tiny scripted conversation: the question types itself, the assistant
// "thinks", then the KPI answer pops in — a living preview of the in-app AI chat.
function AiDemo({ lang }: { lang: Lang }) {
  const q = tr(COPY.ai_q, lang);
  const [n, setN] = useState(0); // typed characters
  const [phase, setPhase] = useState<"typing" | "thinking" | "answer">("typing");
  // restart the script when the language changes
  useEffect(() => { setN(0); setPhase("typing"); }, [lang]);
  useEffect(() => {
    if (phase === "typing") {
      if (n >= q.length) { const t = setTimeout(() => setPhase("thinking"), 350); return () => clearTimeout(t); }
      const t = setTimeout(() => setN((x) => x + 1), 42);
      return () => clearTimeout(t);
    }
    if (phase === "thinking") {
      const t = setTimeout(() => setPhase("answer"), 900);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setN(0); setPhase("typing"); }, 4200);
    return () => clearTimeout(t);
  }, [phase, n, q.length]);
  return (
    <div className="lp-aiwin">
      <div className="lp-aiwin-head"><span className="lp-aiwin-spark">✦</span> Auto-Garaj AI</div>
      <div className="lp-aiwin-body">
        <div className="lp-aibub q">{q.slice(0, n)}<span className="lp-caret" /></div>
        {phase === "thinking" && (
          <div className="lp-aibub a lp-aidots"><span /><span /><span /></div>
        )}
        {phase === "answer" && (
          <div className="lp-aibub a lp-aianswer">
            <div className="lp-ai-kpi">{tr(COPY.ai_a_title, lang)}</div>
            <div className="lp-ai-up">{tr(COPY.ai_a_sub, lang)}</div>
            <span className="lp-ai-btn">{tr(COPY.ai_a_btn, lang)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// AppWindow is a full console mock in a browser frame: sidebar nav, KPI row and a kanban
// board with real plate chips. Pure markup — a living "screenshot" that is always crisp,
// theme-matched and translated (unlike a PNG).
function AppWindow({ lang }: { lang: Lang }) {
  const nav = [COPY.an1, COPY.an2, COPY.an3, COPY.an4, COPY.an5];
  const cards: { plate: PlateSpec; col: number }[] = [
    { plate: CIS[0], col: 0 }, { plate: CIS[1], col: 0 },
    { plate: CIS[2], col: 1 }, { plate: CIS[3], col: 1 }, { plate: CIS[5], col: 1 },
    { plate: CIS[7], col: 2 },
  ];
  const cols = [COPY.col1, COPY.col2, COPY.col3];
  return (
    <div className="lp-appwin">
      <div className="lp-appbar">
        <span className="lp-appdot r" /><span className="lp-appdot y" /><span className="lp-appdot g" />
        <span className="lp-appurl">app.auto-garaj.uz</span>
      </div>
      <div className="lp-appbody">
        <aside className="lp-appside">
          <span className="lp-appside-logo"><WrenchIcon /></span>
          {nav.map((n, i) => (
            <span key={i} className={"lp-appnav" + (i === 1 ? " on" : "")}>{tr(n, lang)}</span>
          ))}
        </aside>
        <div className="lp-appmain">
          <div className="lp-appkpis">
            <div className="lp-appkpi"><span className="lp-appkpi-l">{tr(COPY.ak1, lang)}</span><span className="lp-appkpi-v ok">4 250 000</span></div>
            <div className="lp-appkpi"><span className="lp-appkpi-l">{tr(COPY.ak2, lang)}</span><span className="lp-appkpi-v">7</span></div>
            <div className="lp-appkpi"><span className="lp-appkpi-l">{tr(COPY.ak3, lang)}</span><span className="lp-appkpi-v">3</span></div>
          </div>
          <div className="lp-appboard">
            {cols.map((c, ci) => (
              <div key={ci} className="lp-appcol">
                <span className="lp-appcol-h"><span className={"lp-fcol-dot d" + ci} />{tr(c, lang)}</span>
                {cards.filter((k) => k.col === ci).map((k, i) => (
                  <div key={i} className="lp-appcard">
                    <Plate spec={k.plate} />
                    <span className="lp-appcard-car">{k.plate.car}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
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
/* Hide the page scrollbar on the marketing landing only (the page still scrolls via wheel /
   trackpad / keys). Scoped with :has(.lp) so the app keeps its normal scrollbar. */
html:has(.lp) { scrollbar-width: none; -ms-overflow-style: none; }
html:has(.lp)::-webkit-scrollbar { width: 0; height: 0; display: none; }
.lp {
  --bg: oklch(0.155 0.022 258); --bg2: oklch(0.195 0.028 258);
  --panel: oklch(0.225 0.03 258); --panel2: oklch(0.27 0.034 258);
  --ink: oklch(0.975 0.01 250); --ink2: oklch(0.80 0.02 250); --ink3: oklch(0.63 0.025 252);
  --line: oklch(0.33 0.03 258); --line2: oklch(0.44 0.04 258);
  --amber: oklch(0.66 0.16 256); --amber2: oklch(0.74 0.14 226); --ok: oklch(0.78 0.14 168);
  --glow1: oklch(0.62 0.18 258); --glow2: oklch(0.70 0.15 222);
  --disp: var(--ff-unbounded), system-ui, sans-serif; --body: var(--ff-golos), system-ui, sans-serif; --mono: var(--ff-mono), monospace;
  position: relative; min-height: 100vh; width: 100%; overflow-x: hidden;
  background: var(--bg); color: var(--ink); font-family: var(--body);
  -webkit-font-smoothing: antialiased; scroll-behavior: smooth;
}
.lp ::selection { background: var(--amber); color: oklch(0.98 0 0); }
.lp-bg { position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background:
    radial-gradient(120% 90% at 88% -10%, oklch(0.62 0.18 258 / 0.20), transparent 60%),
    radial-gradient(90% 70% at -10% 110%, oklch(0.70 0.15 222 / 0.16), transparent 55%),
    linear-gradient(180deg, var(--bg), var(--bg2));
}
.lp-bg::after { content: ""; position: absolute; inset: 0; opacity: 0.45;
  background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 60px 60px; mask-image: radial-gradient(125% 80% at 50% 0%, #000 28%, transparent 80%);
  animation: lp-grid 22s linear infinite; }
@keyframes lp-grid { to { background-position: 60px 60px, 60px 60px; } }
/* aurora blobs — slow, organic colour movement */
.lp-aurora { position: fixed; z-index: 0; pointer-events: none; border-radius: 50%; filter: blur(70px); opacity: 0.5; mix-blend-mode: screen; }
.lp-aurora.a1 { top: -12vh; right: -8vw; width: 52vw; height: 52vw; max-width: 680px; max-height: 680px;
  background: radial-gradient(circle, var(--glow1) 0%, transparent 65%); animation: lp-aur1 18s ease-in-out infinite alternate; }
.lp-aurora.a2 { bottom: -16vh; left: -10vw; width: 46vw; height: 46vw; max-width: 600px; max-height: 600px;
  background: radial-gradient(circle, var(--glow2) 0%, transparent 65%); animation: lp-aur2 21s ease-in-out infinite alternate; }
@keyframes lp-aur1 { from { transform: translate(0,0) scale(1); } to { transform: translate(-6vw, 7vh) scale(1.18); } }
@keyframes lp-aur2 { from { transform: translate(0,0) scale(1.05); } to { transform: translate(7vw, -5vh) scale(0.92); } }
.lp-glow { position: fixed; top: 30%; left: 50%; width: 40vw; height: 40vw; max-width: 460px; max-height: 460px; z-index: 0; pointer-events: none;
  transform: translate(-50%,-50%); background: radial-gradient(circle, oklch(0.62 0.18 258 / 0.12), transparent 60%); filter: blur(30px);
  animation: lp-drift 16s ease-in-out infinite alternate; }
@keyframes lp-drift { from { transform: translate(-50%,-50%) scale(1); } to { transform: translate(-46%,-54%) scale(1.15); } }

.lp-wrap { position: relative; z-index: 1; width: 100%; max-width: 1120px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
@keyframes lp-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
.lp-rise { opacity: 0; animation: lp-rise .7s cubic-bezier(.2,.7,.2,1) forwards; }

/* scroll-reveal */
.lp-reveal { opacity: 0; transform: translateY(26px); transition: opacity .75s ease, transform .75s cubic-bezier(.2,.7,.2,1); }
.lp-reveal.in { opacity: 1; transform: none; }

/* nav */
.lp-navbar { position: sticky; top: 0; z-index: 40; border-bottom: 1px solid transparent; transition: background .3s, border-color .3s, backdrop-filter .3s; }
.lp-navbar.st { background: oklch(0.155 0.022 258 / 0.72); backdrop-filter: blur(14px); border-bottom-color: var(--line); }
.lp-nav { display: flex; align-items: center; justify-content: space-between; padding-top: 16px; padding-bottom: 16px; }
.lp-brand { display: inline-flex; align-items: center; gap: 11px; text-decoration: none; color: var(--ink); }
.lp-mark { width: 38px; height: 38px; border-radius: 11px; display: inline-flex; align-items: center; justify-content: center;
  background: linear-gradient(145deg, var(--amber), var(--amber2)); color: oklch(0.99 0.01 250);
  box-shadow: 0 6px 20px oklch(0.62 0.18 258 / 0.3); }
.lp-mark.sm { width: 28px; height: 28px; border-radius: 8px; }
.lp-brand-name { font-family: var(--disp); font-weight: 800; font-size: 19px; letter-spacing: -0.02em; }
.lp-nav-right { display: flex; align-items: center; gap: 14px; }
.lp-lang { display: inline-flex; padding: 4px; gap: 2px; background: oklch(1 0 0 / 0.05); border: 1px solid var(--line); border-radius: 999px; }
.lp-lang-btn { border: none; background: transparent; color: var(--ink3); font-family: var(--mono); font-weight: 600; font-size: 12.5px; letter-spacing: .04em; padding: 6px 11px; border-radius: 999px; cursor: pointer; transition: color .15s, background .15s; }
.lp-lang-btn:hover { color: var(--ink2); }
.lp-lang-btn.on { background: var(--ink); color: oklch(0.20 0.03 258); }

/* buttons */
.lp-btn { display: inline-flex; align-items: center; gap: 8px; font-family: var(--body); font-weight: 700; font-size: 15px; text-decoration: none; cursor: pointer; border-radius: 12px; padding: 12px 20px; border: 1px solid transparent; transition: transform .08s, filter .15s, background .15s, border-color .15s, box-shadow .15s; white-space: nowrap; }
.lp-btn:active { transform: scale(.975); }
.lp-btn-primary { position: relative; overflow: hidden; background: linear-gradient(135deg, var(--amber), var(--amber2)); color: oklch(0.99 0.01 250); box-shadow: 0 10px 30px oklch(0.62 0.18 258 / 0.28); }
.lp-btn-primary::after { content: ""; position: absolute; top: 0; left: -60%; width: 45%; height: 100%; transform: skewX(-20deg); background: linear-gradient(90deg, transparent, oklch(1 0 0 / 0.35), transparent); animation: lp-sweep 3.4s ease-in-out infinite; }
@keyframes lp-sweep { 0% { left: -60%; } 55%, 100% { left: 130%; } }
.lp-btn-primary:hover { filter: brightness(1.08); box-shadow: 0 16px 42px oklch(0.62 0.18 258 / 0.45); transform: translateY(-1px); }
.lp-btn-line { background: transparent; color: var(--ink); border-color: var(--line2); }
.lp-btn-line:hover { border-color: var(--amber); color: var(--amber); }
.lp-btn-ghost { background: oklch(1 0 0 / 0.05); color: var(--ink2); border-color: var(--line); padding: 9px 16px; font-size: 14px; }
.lp-btn-ghost:hover { color: var(--ink); border-color: var(--line2); }

/* hero */
.lp-hero { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 48px; align-items: center; padding-top: 56px; padding-bottom: 72px; }
.lp-eyebrow { display: inline-flex; align-items: center; gap: 9px; font-size: 13px; font-weight: 600; color: var(--amber); letter-spacing: .01em; text-transform: uppercase; }
.lp-eyebrow-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--amber); box-shadow: 0 0 0 4px oklch(0.66 0.16 256 / 0.18); }
.lp-h1 { font-family: var(--disp); font-weight: 800; font-size: clamp(34px, 6vw, 60px); line-height: 1.02; letter-spacing: -0.035em; margin: 18px 0 0; }
.lp-h1-accent { background: linear-gradient(100deg, var(--amber) 0%, var(--amber2) 35%, oklch(0.9 0.05 230) 50%, var(--amber2) 65%, var(--amber) 100%); background-size: 250% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: lp-shimmer 5s linear infinite; }
@keyframes lp-shimmer { to { background-position: -250% 0; } }
.lp-sub { font-size: clamp(15.5px, 2vw, 18.5px); line-height: 1.55; color: var(--ink2); margin: 20px 0 0; max-width: 38ch; }
.lp-hero-cta { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 30px; }
.lp-trust { display: inline-flex; align-items: center; gap: 9px; margin-top: 26px; font-size: 13.5px; color: var(--ink3); }
.lp-flag { width: 21px; height: 14px; border-radius: 3px; flex-shrink: 0; background-size: cover; box-shadow: 0 0 0 1px var(--line), inset 0 0 6px oklch(0 0 0 / 0.25); animation: lp-flagin .5s ease; }
@keyframes lp-flagin { from { opacity: 0; transform: rotateY(70deg) scale(.85); } to { opacity: 1; transform: none; } }

/* hero art */
.lp-hero-art { display: flex; justify-content: center; }
.lp-art { position: relative; width: 100%; max-width: 380px; }
.lp-tilt { transition: transform .25s ease-out; transform-style: preserve-3d; will-change: transform; }
.lp-art-col { position: absolute; inset: -18px -14px -22px -14px; border-radius: 22px; background: oklch(1 0 0 / 0.03); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; padding: 18px; transform: rotate(-3deg); }
.lp-art-bar { height: 12px; border-radius: 6px; background: oklch(1 0 0 / 0.06); }
.lp-art-bar.w2 { width: 70%; } .lp-art-bar.w3 { width: 45%; }
.lp-wo { position: relative; background: linear-gradient(160deg, var(--panel2), var(--panel)); border: 1px solid var(--line2); border-radius: 18px; padding: 20px; box-shadow: var(--shadow-lg, 0 30px 70px oklch(0.06 0.03 262 / 0.55)); animation: lp-float 6s ease-in-out infinite; }
@keyframes lp-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
.lp-wo-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.lp-wo-id { font-family: var(--mono); font-weight: 700; font-size: 14px; color: var(--ink2); }
.lp-wo-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: var(--amber); background: oklch(0.66 0.16 256 / 0.14); border: 1px solid oklch(0.66 0.16 256 / 0.3); padding: 4px 10px; border-radius: 999px; }
.lp-pulse { width: 7px; height: 7px; border-radius: 99px; background: var(--amber); animation: lp-blink 1.4s ease-in-out infinite; }
@keyframes lp-blink { 0%,100% { opacity: 1; } 50% { opacity: .3; } }
.lp-plate { display: inline-flex; align-items: stretch; border-radius: 7px; overflow: hidden; border: 1.5px solid oklch(0.85 0.01 90); background: #fff; font-family: var(--mono); font-weight: 700; box-shadow: 0 2px 8px oklch(0 0 0 / 0.3); }
.lp-plate-reg { background: oklch(0.32 0.08 250); color: #fff; padding: 7px 8px; font-size: 15px; }
.lp-plate-main { color: oklch(0.2 0.02 250); padding: 7px 12px; font-size: 17px; letter-spacing: .06em; }
.lp-wo-model { font-family: var(--disp); font-weight: 600; font-size: 18px; color: var(--ink); letter-spacing: -0.01em; }
@keyframes lp-platein { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } }
.lp-platefade { animation: lp-platein .45s ease; margin: 13px 0; }
.lp-wo-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; padding-top: 15px; border-top: 1px dashed var(--line2); }
.lp-wo-client { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--ink3); }
.lp-wo-total { font-family: var(--mono); font-weight: 700; font-size: 14.5px; color: var(--ok); }

/* plate marquee */
.lp-marquee { position: relative; z-index: 1; margin: 8px 0 18px; padding: 14px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent); }
.lp-marquee-track { display: inline-flex; align-items: center; gap: 14px; white-space: nowrap; animation: lp-scroll 38s linear infinite; will-change: transform; }
.lp-marquee:hover .lp-marquee-track { animation-play-state: paused; }
@keyframes lp-scroll { to { transform: translateX(-50%); } }
.lp-chip { display: inline-flex; align-items: center; gap: 9px; padding: 7px 13px; border: 1px solid var(--line); border-radius: 999px; background: oklch(1 0 0 / 0.035); }
.lp-chip-plate { font-family: var(--mono); font-weight: 700; font-size: 13px; color: var(--ink2); letter-spacing: .03em; }
.lp-chip-plate b { color: var(--amber2); margin-right: 5px; }
.lp-chip-model { font-family: var(--disp); font-weight: 500; font-size: 12.5px; color: var(--ink3); }

/* stats strip */
.lp-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; padding-top: 34px; padding-bottom: 8px; }
.lp-stat { text-align: center; padding: 20px 10px; border: 1px solid var(--line); border-radius: 16px; background: oklch(1 0 0 / 0.03); }
.lp-stat-n { display: block; font-family: var(--disp); font-weight: 800; font-size: clamp(30px, 4.4vw, 44px); letter-spacing: -0.03em;
  background: linear-gradient(120deg, var(--amber), var(--amber2)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lp-stat-l { display: block; margin-top: 6px; font-size: 13px; color: var(--ink3); }

/* live flow demo */
.lp-flow { padding-top: 44px; padding-bottom: 12px; }
.lp-flowboard { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 30px; }
.lp-fcol { min-height: 216px; border: 1px solid var(--line); border-radius: 16px; background: oklch(1 0 0 / 0.03); padding: 14px; display: flex; flex-direction: column; gap: 10px; transition: border-color .3s, box-shadow .3s, background .3s; }
.lp-fcol.on { border-color: oklch(0.66 0.16 256 / 0.55); background: oklch(1 0 0 / 0.05); box-shadow: 0 0 0 1px oklch(0.66 0.16 256 / 0.16), 0 18px 46px oklch(0.06 0.03 262 / 0.4); }
.lp-fcol-head { display: flex; align-items: center; gap: 8px; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); }
.lp-fcol-dot { width: 8px; height: 8px; border-radius: 99px; }
.lp-fcol-dot.d0 { background: var(--amber2); } .lp-fcol-dot.d1 { background: var(--amber); } .lp-fcol-dot.d2 { background: var(--ok); }
.lp-fghost { height: 34px; border-radius: 10px; background: oklch(1 0 0 / 0.045); border: 1px dashed var(--line); }
.lp-fghost.g2 { opacity: .55; }
.lp-fcard { border: 1px solid var(--line2); border-radius: 13px; background: linear-gradient(160deg, var(--panel2), var(--panel)); padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 14px 34px oklch(0.05 0.03 262 / 0.45); animation: lp-pop .38s cubic-bezier(.2,1.3,.4,1); }
.lp-fcard-top { display: flex; align-items: center; justify-content: space-between; }
.lp-fcard-model { font-family: var(--disp); font-weight: 600; font-size: 14px; color: var(--ink); }
.lp-fdone { color: var(--ok); display: inline-flex; }
.lp-fdone svg { width: 18px; height: 18px; }
.lp-tgtoast { position: absolute; right: 10px; bottom: -14px; z-index: 2; display: flex; align-items: center; gap: 10px; padding: 11px 15px; border-radius: 14px; background: linear-gradient(160deg, var(--panel2), var(--panel)); border: 1px solid oklch(0.78 0.14 168 / 0.5); box-shadow: 0 18px 44px oklch(0.05 0.03 262 / 0.6); opacity: 0; transform: translateY(12px) scale(.94); transition: opacity .35s, transform .35s cubic-bezier(.2,1.3,.4,1); pointer-events: none; }
.lp-tgtoast.show { opacity: 1; transform: none; }
.lp-tgtoast-ico { width: 34px; height: 34px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; color: var(--ok); background: oklch(0.78 0.14 168 / 0.14); border: 1px solid oklch(0.78 0.14 168 / 0.3); flex-shrink: 0; }
.lp-tgtoast b { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink3); font-family: var(--mono); }
.lp-tgtoast-msg { font-size: 14px; font-weight: 700; color: var(--ink); }

/* AI showcase */
.lp-ai { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 48px; align-items: center; padding-top: 52px; padding-bottom: 20px; }
.lp-aiwin { border: 1px solid var(--line2); border-radius: 20px; background: linear-gradient(165deg, var(--panel2), var(--panel)); box-shadow: 0 30px 70px oklch(0.05 0.03 262 / 0.45); overflow: hidden; }
.lp-aiwin-head { display: flex; align-items: center; gap: 9px; padding: 13px 18px; border-bottom: 1px solid var(--line); font-family: var(--disp); font-weight: 600; font-size: 14px; color: var(--ink2); }
.lp-aiwin-spark { color: var(--amber2); font-size: 16px; }
.lp-aiwin-body { padding: 20px 18px 24px; display: flex; flex-direction: column; gap: 12px; min-height: 210px; }
.lp-aibub { max-width: 85%; padding: 10px 14px; border-radius: 14px; font-size: 14.5px; line-height: 1.45; }
.lp-aibub.q { align-self: flex-end; background: linear-gradient(135deg, var(--amber), var(--amber2)); color: oklch(0.99 0.01 250); border-bottom-right-radius: 4px; font-weight: 600; min-height: 40px; }
.lp-aibub.a { align-self: flex-start; background: oklch(1 0 0 / 0.05); border: 1px solid var(--line); border-bottom-left-radius: 4px; }
.lp-caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -0.15em; background: oklch(0.99 0.01 250); animation: lp-blink 0.9s step-end infinite; }
.lp-aidots { display: inline-flex; gap: 5px; padding: 14px 16px; }
.lp-aidots span { width: 7px; height: 7px; border-radius: 99px; background: var(--ink3); animation: lp-blink 1.1s ease-in-out infinite; }
.lp-aidots span:nth-child(2) { animation-delay: .18s; } .lp-aidots span:nth-child(3) { animation-delay: .36s; }
.lp-aianswer { animation: lp-pop .38s cubic-bezier(.2,1.3,.4,1); display: flex; flex-direction: column; gap: 6px; }
.lp-ai-kpi { font-family: var(--disp); font-weight: 700; font-size: 17px; color: var(--ink); letter-spacing: -0.01em; }
.lp-ai-up { font-family: var(--mono); font-size: 13px; font-weight: 700; color: var(--ok); }
.lp-ai-btn { align-self: flex-start; margin-top: 4px; font-size: 13px; font-weight: 700; color: var(--amber2); background: oklch(0.66 0.16 256 / 0.12); border: 1px solid oklch(0.66 0.16 256 / 0.3); padding: 7px 12px; border-radius: 10px; }

/* product window */
.lp-product { padding-top: 52px; padding-bottom: 8px; }
.lp-appwin { margin-top: 34px; border: 1px solid var(--line2); border-radius: 18px; overflow: hidden; background: linear-gradient(170deg, var(--panel2), var(--panel)); box-shadow: 0 40px 90px oklch(0.05 0.03 262 / 0.55), 0 0 0 1px oklch(0.66 0.16 256 / 0.08); }
.lp-appbar { display: flex; align-items: center; gap: 7px; padding: 11px 15px; border-bottom: 1px solid var(--line); background: oklch(1 0 0 / 0.03); }
.lp-appdot { width: 11px; height: 11px; border-radius: 99px; }
.lp-appdot.r { background: oklch(0.65 0.19 25); } .lp-appdot.y { background: oklch(0.8 0.15 90); } .lp-appdot.g { background: oklch(0.72 0.17 150); }
.lp-appurl { margin-left: 12px; flex: 1; max-width: 300px; text-align: center; font-family: var(--mono); font-size: 11.5px; color: var(--ink3); background: oklch(1 0 0 / 0.05); border: 1px solid var(--line); border-radius: 8px; padding: 4px 12px; }
.lp-appbody { display: grid; grid-template-columns: 190px 1fr; min-height: 380px; }
.lp-appside { border-right: 1px solid var(--line); padding: 16px 12px; display: flex; flex-direction: column; gap: 5px; background: oklch(1 0 0 / 0.02); }
.lp-appside-logo { width: 32px; height: 32px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(145deg, var(--amber), var(--amber2)); color: #fff; margin-bottom: 12px; }
.lp-appnav { font-size: 13px; font-weight: 600; color: var(--ink3); padding: 8px 11px; border-radius: 9px; }
.lp-appnav.on { color: var(--amber2); background: oklch(0.66 0.16 256 / 0.13); }
.lp-appmain { padding: 16px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.lp-appkpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.lp-appkpi { border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; background: oklch(1 0 0 / 0.03); }
.lp-appkpi-l { display: block; font-size: 11.5px; color: var(--ink3); }
.lp-appkpi-v { display: block; margin-top: 4px; font-family: var(--mono); font-weight: 700; font-size: 20px; color: var(--ink); }
.lp-appkpi-v.ok { color: var(--ok); }
.lp-appboard { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; flex: 1; }
.lp-appcol { border: 1px solid var(--line); border-radius: 12px; padding: 11px; background: oklch(1 0 0 / 0.02); display: flex; flex-direction: column; gap: 9px; min-width: 0; }
.lp-appcol-h { display: flex; align-items: center; gap: 7px; font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
.lp-appcard { border: 1px solid var(--line); border-radius: 10px; background: oklch(1 0 0 / 0.045); padding: 9px 10px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; transition: transform .15s, border-color .15s; }
.lp-appcard:hover { transform: translateY(-2px); border-color: oklch(0.66 0.16 256 / 0.45); }
.lp-appcard-car { font-size: 12px; font-weight: 600; color: var(--ink2); }

/* how it works */
.lp-how { padding-top: 48px; padding-bottom: 8px; }
.lp-steps { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 32px; }
.lp-steps::before { content: ""; position: absolute; top: 24px; left: 12%; right: 12%; height: 2px; background: linear-gradient(90deg, var(--amber), var(--amber2), var(--ok)); opacity: .45; }
.lp-step { position: relative; text-align: center; padding: 0 12px; }
.lp-step-n { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; font-family: var(--disp); font-weight: 800; font-size: 19px; color: oklch(0.99 0.01 250); background: linear-gradient(145deg, var(--amber), var(--amber2)); box-shadow: 0 10px 26px oklch(0.62 0.18 258 / 0.35), 0 0 0 6px oklch(0.155 0.022 258); }
.lp-step-t { margin-top: 14px; font-family: var(--disp); font-weight: 600; font-size: 17px; }
.lp-step-d { margin-top: 7px; font-size: 14px; line-height: 1.5; color: var(--ink2); }

/* pricing */
.lp-pricing { padding-top: 52px; padding-bottom: 12px; }
.lp-tiers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 34px; align-items: stretch; }
.lp-tier { position: relative; display: flex; flex-direction: column; gap: 16px; border: 1px solid var(--line); border-radius: 18px; background: oklch(1 0 0 / 0.03); padding: 24px; transition: transform .16s, border-color .16s; }
.lp-tier:hover { transform: translateY(-5px); border-color: var(--line2); }
.lp-tier.pop { border-color: oklch(0.66 0.16 256 / 0.55); background: linear-gradient(170deg, oklch(0.66 0.16 256 / 0.10), oklch(1 0 0 / 0.03) 55%); box-shadow: 0 24px 60px oklch(0.06 0.03 262 / 0.5); }
.lp-tier-badge { position: absolute; top: -12px; left: 24px; font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: oklch(0.99 0.01 250); background: linear-gradient(135deg, var(--amber), var(--amber2)); padding: 4px 12px; border-radius: 999px; box-shadow: 0 8px 20px oklch(0.62 0.18 258 / 0.4); }
.lp-tier-name { font-family: var(--disp); font-weight: 700; font-size: 22px; letter-spacing: -0.02em; }
.lp-tier-feats { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; flex: 1; }
.lp-tier-feats li { display: flex; align-items: baseline; gap: 9px; font-size: 14.5px; color: var(--ink2); }
.lp-tier-check { color: var(--ok); font-weight: 800; }

/* FAQ */
.lp-faq { padding-top: 48px; padding-bottom: 8px; }
.lp-faqs { margin-top: 28px; max-width: 760px; display: flex; flex-direction: column; gap: 10px; }
.lp-qa { border: 1px solid var(--line); border-radius: 14px; background: oklch(1 0 0 / 0.03); overflow: hidden; transition: border-color .2s; }
.lp-qa[open] { border-color: oklch(0.66 0.16 256 / 0.45); }
.lp-qa summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; cursor: pointer; list-style: none; padding: 16px 18px; font-family: var(--disp); font-weight: 600; font-size: 15.5px; color: var(--ink); }
.lp-qa summary::-webkit-details-marker { display: none; }
.lp-qa-plus { font-family: var(--mono); font-size: 19px; color: var(--amber2); transition: transform .25s; flex-shrink: 0; }
.lp-qa[open] .lp-qa-plus { transform: rotate(45deg); }
.lp-qa p { margin: 0; padding: 0 18px 16px; font-size: 14.5px; line-height: 1.6; color: var(--ink2); max-width: 62ch; }

/* features */
.lp-features { padding-top: 36px; padding-bottom: 40px; }
.lp-sec-head { max-width: 620px; }
.lp-kicker { font-family: var(--mono); font-size: 12.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--amber); }
.lp-h2 { font-family: var(--disp); font-weight: 700; font-size: clamp(26px, 3.6vw, 38px); letter-spacing: -0.03em; line-height: 1.08; margin: 10px 0 0; }
.lp-sec-sub { font-size: 16px; color: var(--ink2); margin: 12px 0 0; line-height: 1.5; }
.lp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 34px; }
.lp-card { position: relative; background: oklch(1 0 0 / 0.035); border: 1px solid var(--line); border-radius: 16px; padding: 22px; transition: transform .16s, border-color .16s, background .16s; overflow: hidden; }
.lp-card::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 2px; background: linear-gradient(90deg, var(--amber), var(--amber2)); opacity: 0; transition: opacity .16s; }
.lp-card:hover { transform: translateY(-5px); border-color: oklch(0.66 0.16 256 / 0.5); background: oklch(1 0 0 / 0.06); box-shadow: 0 18px 44px oklch(0.06 0.03 262 / 0.5), 0 0 0 1px oklch(0.66 0.16 256 / 0.12); }
.lp-card:hover::before { opacity: 1; }
.lp-card:hover .lp-card-ico { transform: scale(1.06) rotate(-4deg); }
.lp-card-ico { transition: transform .2s cubic-bezier(.2,1.3,.4,1); }
.lp-card-ico { width: 46px; height: 46px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; color: var(--amber); background: oklch(0.66 0.16 256 / 0.12); border: 1px solid oklch(0.66 0.16 256 / 0.22); margin-bottom: 16px; }
.lp-card-title { font-family: var(--disp); font-weight: 600; font-size: 17px; letter-spacing: -0.01em; }
.lp-card-desc { font-size: 14px; line-height: 1.5; color: var(--ink2); margin-top: 8px; }

/* demo */
.lp-demo { display: grid; grid-template-columns: 0.92fr 1.08fr; gap: 48px; align-items: center; padding-top: 56px; padding-bottom: 64px; }
.lp-demo-copy { position: relative; }
.lp-tape { margin-top: 26px; height: 14px; border-radius: 4px; background: repeating-linear-gradient(45deg, var(--amber) 0 14px, oklch(0.20 0.03 258) 14px 28px); opacity: .85; max-width: 230px; }
.lp-form { background: linear-gradient(165deg, var(--panel2), var(--panel)); border: 1px solid var(--line2); border-radius: 20px; padding: 26px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 30px 70px oklch(0.05 0.03 262 / 0.45); }
.lp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.lp-field { display: flex; flex-direction: column; gap: 7px; }
.lp-label { font-size: 13px; font-weight: 600; color: var(--ink2); }
.lp-input { width: 100%; background: oklch(0.16 0.012 65); border: 1.5px solid var(--line2); border-radius: 11px; color: var(--ink); font-family: var(--body); font-size: 15px; padding: 12px 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
.lp-input::placeholder { color: var(--ink3); }
.lp-input:focus { border-color: var(--amber); box-shadow: 0 0 0 3px oklch(0.66 0.16 256 / 0.18); }
.lp-mono { font-family: var(--mono); letter-spacing: .02em; }
.lp-textarea { resize: vertical; min-height: 78px; }
.lp-submit { justify-content: center; margin-top: 6px; padding: 14px; font-size: 16px; }
.lp-err { font-size: 13.5px; color: oklch(0.8 0.13 28); background: oklch(0.6 0.2 25 / 0.14); border: 1px solid oklch(0.6 0.2 25 / 0.3); padding: 9px 12px; border-radius: 10px; }
.lp-form-done { align-items: center; text-align: center; gap: 12px; padding: 40px 26px; }
.lp-done-mark { width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; color: oklch(0.99 0.01 250); background: linear-gradient(135deg, var(--amber), var(--amber2)); box-shadow: 0 12px 32px oklch(0.62 0.18 258 / 0.34); animation: lp-pop .4s cubic-bezier(.2,1.3,.4,1); }
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
  .lp-demo, .lp-ai { grid-template-columns: 1fr; gap: 28px; }
  .lp-grid { grid-template-columns: 1fr 1fr; }
  .lp-stats { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 760px) {
  .lp-appbody { grid-template-columns: 1fr; }
  .lp-appside { flex-direction: row; align-items: center; overflow-x: auto; border-right: none; border-bottom: 1px solid var(--line); padding: 10px 12px; }
  .lp-appside-logo { margin-bottom: 0; flex-shrink: 0; }
  .lp-appnav { white-space: nowrap; }
  .lp-appboard, .lp-appkpis { grid-template-columns: 1fr; }
  .lp-steps { grid-template-columns: 1fr; gap: 26px; }
  .lp-steps::before { display: none; }
  .lp-tiers { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .lp-flowboard { grid-template-columns: 1fr; }
  .lp-fcol { min-height: 0; }
  .lp-fghost.g2 { display: none; }
  .lp-tgtoast { position: static; margin-top: 4px; }
}
@media (max-width: 560px) {
  .lp-grid { grid-template-columns: 1fr; }
  .lp-row2 { grid-template-columns: 1fr; }
  .lp-wrap { padding-left: 18px; padding-right: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .lp-rise, .lp-glow, .lp-wo, .lp-pulse, .lp-done-mark, .lp-aurora, .lp-bg::after,
  .lp-h1-accent, .lp-btn-primary::after, .lp-marquee-track, .lp-flag,
  .lp-fcard, .lp-aianswer, .lp-aidots span, .lp-caret { animation: none !important; }
  .lp-rise, .lp-reveal { opacity: 1; transform: none; transition: none; }
  .lp-tilt { transition: none; }
  .lp-h1-accent { background-position: 0 0; }
}
`}</style>
  );
}
