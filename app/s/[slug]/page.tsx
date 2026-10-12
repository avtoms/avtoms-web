// A service centre's public page — the link the mobile app's share button sends.
//
// Whoever opens it has not signed in and may never have heard of Auto-Garaj: it arrived in
// a group chat because somebody recommended this garage. So the page answers the three
// questions that person actually has — is it any good, where is it, what does it cost — and
// only then invites them into the app.
//
// Rendered on the server so the link unfurls with a preview card in Telegram and WhatsApp,
// which is most of what a share button is for.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicGet } from "@/lib/server-api";
import { PAGE_CSS } from "./styles";

export const revalidate = 60;

type Hours = { weekday: number; opens: string; closes: string; closed: boolean; roundClock: boolean };
type Provider = {
  id: string; slug: string; name: string; shareUrl: string;
  addressUz: string; addressRu: string; aboutUz: string; aboutRu: string;
  phone: string; latitude: number; longitude: number;
  photoUrls: string[]; amenities: string[]; hours: Hours[];
  verified: boolean; rating: number; reviewCount: number; priceFrom: string; promoLabel: string;
  openNow: boolean; categoryIds: string[];
};
type Service = { id: string; nameUz: string; nameRu: string; price: string; durationMinutes: number };
type Review = { id: string; authorName: string; rating: number; text: string; textRu: string; createdAt: string; replyText: string };
type Breakdown = { average: number; total: number };

type Lang = "uz" | "ru";

// The page speaks the two languages the app does. A shared link carries ?lang=ru when the
// sender was reading Russian, and defaults to Uzbek otherwise.
const T = {
  from: { uz: "dan", ru: "от" },
  som: { uz: "so'm", ru: "сум" },
  open: { uz: "Ochiq", ru: "Открыто" },
  closed: { uz: "Yopiq", ru: "Закрыто" },
  verified: { uz: "Tasdiqlangan", ru: "Проверенный" },
  reviews: { uz: "sharh", ru: "отзывов" },
  services: { uz: "Xizmatlar va narxlar", ru: "Услуги и цены" },
  hours: { uz: "Ish vaqti", ru: "Режим работы" },
  about: { uz: "Servis haqida", ru: "О сервисе" },
  reviewsTitle: { uz: "Sharhlar", ru: "Отзывы" },
  call: { uz: "Qo'ng'iroq", ru: "Позвонить" },
  route: { uz: "Yo'nalish", ru: "Маршрут" },
  book: { uz: "Ilovada band qilish", ru: "Записаться в приложении" },
  bookNote: {
    uz: "Auto-Garaj ilovasida vaqtni tanlang — navbatsiz.",
    ru: "Выберите время в приложении Auto-Garaj — без очереди.",
  },
  minutes: { uz: "daq", ru: "мин" },
  allDay: { uz: "24 soat", ru: "круглосуточно" },
  dayOff: { uz: "Dam olish", ru: "Выходной" },
  noServices: { uz: "Narxlar hali kiritilmagan.", ru: "Цены пока не указаны." },
  tagline: { uz: "Avtoservislar katalogi", ru: "Каталог автосервисов" },
} as const;

const DAYS = {
  uz: ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"],
  ru: ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
};

const AMENITIES: Record<string, { uz: string; ru: string }> = {
  card: { uz: "Karta bilan to'lov", ru: "Оплата картой" },
  wait: { uz: "Kutish zali", ru: "Зал ожидания" },
  wifi: { uz: "Wi-Fi", ru: "Wi-Fi" },
  coffee: { uz: "Kofe", ru: "Кофе" },
  tow: { uz: "Evakuator", ru: "Эвакуатор" },
  warranty: { uz: "Kafolat", ru: "Гарантия" },
};

const t = (key: keyof typeof T, lang: Lang) => T[key][lang];

// Money arrives as a string because it is a 64-bit number; group it the way the app does.
const money = (raw: string | number) => {
  const n = Number(raw || 0);
  return n.toLocaleString("ru-RU").replace(/ /g, " ");
};

const initials = (name: string) =>
  name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

async function load(slug: string) {
  const provider = await publicGet<Provider>(`/v1/b2c/providers/${encodeURIComponent(slug)}`);
  if (!provider?.id) return null;
  // The price list and a few reviews, in parallel — neither is worth failing the page for.
  const [services, reviews] = await Promise.all([
    publicGet<{ services: Service[] }>(`/v1/b2c/providers/${provider.id}/services`),
    publicGet<{ reviews: Review[]; breakdown: Breakdown }>(`/v1/b2c/providers/${provider.id}/reviews?limit=3`),
  ]);
  return { provider, services: services?.services ?? [], reviews: reviews?.reviews ?? [] };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Auto-Garaj" };
  const { provider } = data;
  // What a person sees in the chat before they tap: the name, what it costs, how it rates.
  const bits = [provider.addressUz || provider.addressRu];
  if (provider.reviewCount > 0) bits.push(`★ ${provider.rating} · ${provider.reviewCount}`);
  if (Number(provider.priceFrom) > 0) bits.push(`${T.from.uz} ${money(provider.priceFrom)} ${T.som.uz}`);
  const description = bits.filter(Boolean).join(" · ");
  return {
    title: `${provider.name} — Auto-Garaj`,
    description,
    openGraph: {
      title: provider.name,
      description,
      type: "website",
      url: provider.shareUrl || undefined,
      images: provider.photoUrls?.length ? [provider.photoUrls[0]] : undefined,
    },
    twitter: { card: provider.photoUrls?.length ? "summary_large_image" : "summary" },
  };
}

export default async function ProviderPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { slug } = await params;
  const { lang: raw } = await searchParams;
  const lang: Lang = raw === "ru" ? "ru" : "uz";
  const data = await load(slug);
  if (!data) notFound();
  const { provider, services, reviews } = data;

  const address = (lang === "ru" ? provider.addressRu : provider.addressUz) || provider.addressUz || provider.addressRu;
  const about = (lang === "ru" ? provider.aboutRu : provider.aboutUz) || "";
  const today = new Date().getDay();
  const mapHref = provider.latitude
    ? `https://yandex.uz/maps/?pt=${provider.longitude},${provider.latitude}&z=17&l=map`
    : `https://yandex.uz/maps/?text=${encodeURIComponent(provider.name + " " + address)}`;

  return (
    <main className="sp">
      <style>{PAGE_CSS}</style>

      <header className="sp-hero">
        <div className="sp-hero-bg" aria-hidden="true" />
        {provider.photoUrls?.length ? (
          // eslint-disable-next-line @next/next/no-img-element -- a remote photo of unknown
          // origin; next/image would need every shop's host allow-listed up front.
          <img className="sp-hero-photo" src={provider.photoUrls[0]} alt="" />
        ) : (
          <div className="sp-hero-mark" aria-hidden="true">{initials(provider.name)}</div>
        )}
        <div className="sp-hero-body">
          <div className="sp-badges">
            <span className={`sp-badge ${provider.openNow ? "ok" : "grey"}`}>
              {provider.openNow ? t("open", lang) : t("closed", lang)}
            </span>
            {provider.verified && <span className="sp-badge brand">✓ {t("verified", lang)}</span>}
            {provider.promoLabel && <span className="sp-badge promo">{provider.promoLabel}</span>}
          </div>
          <h1>{provider.name}</h1>
          <div className="sp-meta">
            {provider.reviewCount > 0 && (
              <span className="sp-rating">★ {provider.rating} <small>· {provider.reviewCount} {t("reviews", lang)}</small></span>
            )}
            {Number(provider.priceFrom) > 0 && (
              <span>{t("from", lang)} <b>{money(provider.priceFrom)}</b> {t("som", lang)}</span>
            )}
          </div>
          {address && <p className="sp-address">{address}</p>}
        </div>
      </header>

      <div className="sp-actions">
        {provider.phone && (
          <a className="sp-btn" href={`tel:${provider.phone.replace(/\s/g, "")}`}>{t("call", lang)}</a>
        )}
        <a className="sp-btn" href={mapHref} target="_blank" rel="noreferrer noopener">{t("route", lang)}</a>
      </div>

      <section className="sp-cta">
        <div>
          <b>{t("book", lang)}</b>
          <p>{t("bookNote", lang)}</p>
        </div>
      </section>

      {services.length > 0 ? (
        <section className="sp-card">
          <h2>{t("services", lang)}</h2>
          <ul className="sp-list">
            {services.map((s) => (
              <li key={s.id}>
                <span>
                  {(lang === "ru" ? s.nameRu : s.nameUz) || s.nameUz}
                  {s.durationMinutes > 0 && <small> · {s.durationMinutes} {t("minutes", lang)}</small>}
                </span>
                <b>{money(s.price)} {t("som", lang)}</b>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="sp-card"><h2>{t("services", lang)}</h2><p className="sp-muted">{t("noServices", lang)}</p></section>
      )}

      {provider.hours?.length > 0 && (
        <section className="sp-card">
          <h2>{t("hours", lang)}</h2>
          <ul className="sp-list">
            {[...provider.hours].sort((a, b) => a.weekday - b.weekday).map((h) => (
              <li key={h.weekday} className={h.weekday === today ? "now" : ""}>
                <span>{DAYS[lang][h.weekday]}</span>
                <b>{h.closed ? t("dayOff", lang) : h.roundClock ? t("allDay", lang) : `${h.opens} – ${h.closes}`}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(about || provider.amenities?.length > 0) && (
        <section className="sp-card">
          <h2>{t("about", lang)}</h2>
          {about && <p>{about}</p>}
          {provider.amenities?.length > 0 && (
            <div className="sp-chips">
              {provider.amenities.map((a) => (
                <span key={a} className="sp-chip">{AMENITIES[a]?.[lang] ?? a}</span>
              ))}
            </div>
          )}
        </section>
      )}

      {reviews.length > 0 && (
        <section className="sp-card">
          <h2>{t("reviewsTitle", lang)}</h2>
          {reviews.map((r) => (
            <article key={r.id} className="sp-review">
              <div className="sp-review-head">
                <span className="sp-avatar">{initials(r.authorName || "?")}</span>
                <b>{r.authorName}</b>
                <span className="sp-stars">{"★".repeat(r.rating)}<span className="dim">{"★".repeat(5 - r.rating)}</span></span>
              </div>
              <p>{(lang === "ru" ? r.textRu : r.text) || r.text}</p>
              {r.replyText && <p className="sp-reply">{r.replyText}</p>}
            </article>
          ))}
        </section>
      )}

      <footer className="sp-footer">
        <a href="/">Auto-Garaj</a>
        <span>{t("tagline", lang)}</span>
        <a className="sp-lang" href={`?lang=${lang === "uz" ? "ru" : "uz"}`}>
          {lang === "uz" ? "Русский" : "O'zbekcha"}
        </a>
      </footer>
    </main>
  );
}
