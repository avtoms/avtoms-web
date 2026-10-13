// A campaign's public page — where a shared promo code lands.
//
// Somebody forwarded this because of the number on it, so the number is the page: what the
// discount is, where it works, until when, and what the small print says. The code is
// spelled out in full because the person may well type it rather than tap anything.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicGet } from "@/lib/server-api";
import { SHARE_CSS } from "@/app/s/[slug]/styles";

export const revalidate = 60;

type Promo = {
  code: string; providerId: string; discountPercent: number; maxDiscount: string;
  titleUz: string; titleRu: string; descriptionUz: string; descriptionRu: string;
  conditionsUz: string[]; conditionsRu: string[];
  validFrom: string; validUntil: string; firstBookingOnly: boolean; active: boolean;
};
type Provider = { name: string; slug: string; addressUz: string; addressRu: string };

type Lang = "uz" | "ru";
const T = {
  code: { uz: "Promokod", ru: "Промокод" },
  until: { uz: "gacha amal qiladi", ru: "действует до" },
  conditions: { uz: "Shartlar", ru: "Условия" },
  at: { uz: "Qayerda", ru: "Где действует" },
  anywhere: { uz: "Ilovadagi barcha servislarda", ru: "Во всех сервисах приложения" },
  use: { uz: "Ilovada ishlatish", ru: "Использовать в приложении" },
  useNote: {
    uz: "Kodni to'lov sahifasida kiriting.",
    ru: "Введите код на странице оплаты.",
  },
  expired: { uz: "Aksiya tugagan", ru: "Акция завершена" },
  firstOnly: { uz: "Faqat birinchi yozuvga", ru: "Только на первую запись" },
  tagline: { uz: "Avtoservislar katalogi", ru: "Каталог автосервисов" },
  maxDiscount: { uz: "Maksimal chegirma", ru: "Максимальная скидка" },
  som: { uz: "so'm", ru: "сум" },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];

const money = (raw: string | number) => Number(raw || 0).toLocaleString("ru-RU").replace(/ /g, " ");

const formatDate = (iso: string, lang: Lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(lang === "ru" ? "ru-RU" : "uz-UZ", { day: "numeric", month: "long" });
};

async function load(code: string) {
  const promo = await publicGet<Promo>(`/v1/b2c/promos/${encodeURIComponent(code)}`);
  if (!promo?.code) return null;
  // Whose campaign it is, when it belongs to one shop rather than the whole catalogue.
  const provider = promo.providerId
    ? await publicGet<Provider>(`/v1/b2c/providers/${promo.providerId}`)
    : null;
  return { promo, provider };
}

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const data = await load(code);
  if (!data) return { title: "Auto-Garaj" };
  const { promo, provider } = data;
  const title = promo.titleUz || `−${promo.discountPercent}%`;
  const where = provider?.name ?? T.anywhere.uz;
  return {
    title: `${title} — Auto-Garaj`,
    description: `${T.code.uz} ${promo.code} · ${where}`,
    openGraph: { title, description: `${T.code.uz} ${promo.code} · ${where}`, type: "website" },
  };
}

export default async function PromoPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { code } = await params;
  const { lang: raw } = await searchParams;
  const lang: Lang = raw === "ru" ? "ru" : "uz";
  const data = await load(code);
  if (!data) notFound();
  const { promo, provider } = data;

  const title = (lang === "ru" ? promo.titleRu : promo.titleUz) || `−${promo.discountPercent}%`;
  const description = (lang === "ru" ? promo.descriptionRu : promo.descriptionUz) || "";
  const conditions = (lang === "ru" ? promo.conditionsRu : promo.conditionsUz) ?? [];
  const until = formatDate(promo.validUntil, lang);
  const over = !promo.active || (promo.validUntil !== "" && new Date(promo.validUntil) < new Date());

  return (
    <main className="sp sp-narrow">
      <style>{SHARE_CSS}</style>

      <header className="sp-promo-hero">
        <span className="sp-promo-figure">−{promo.discountPercent}%</span>
        <h1>{title}</h1>
        {until && !over && <p className="sp-promo-until">{until} {t("until", lang)}</p>}
        {over && <p className="sp-promo-until">{t("expired", lang)}</p>}
      </header>

      <section className="sp-card sp-codecard">
        <span className="sp-muted">{t("code", lang)}</span>
        <b className="sp-code">{promo.code}</b>
      </section>

      <section className="sp-cta">
        <b>{t("use", lang)}</b>
        <p>{t("useNote", lang)}</p>
      </section>

      {description && (
        <section className="sp-card"><p>{description}</p></section>
      )}

      <section className="sp-card">
        <h2>{t("at", lang)}</h2>
        {provider ? (
          <a className="sp-provider" href={`/s/${provider.slug}${lang === "ru" ? "?lang=ru" : ""}`}>
            <b>{provider.name}</b>
            <span className="sp-muted">{(lang === "ru" ? provider.addressRu : provider.addressUz)}</span>
          </a>
        ) : (
          <p className="sp-muted">{t("anywhere", lang)}</p>
        )}
      </section>

      {(conditions.length > 0 || promo.firstBookingOnly || Number(promo.maxDiscount) > 0) && (
        <section className="sp-card">
          <h2>{t("conditions", lang)}</h2>
          <ul className="sp-bullets">
            {promo.firstBookingOnly && <li>{t("firstOnly", lang)}</li>}
            {Number(promo.maxDiscount) > 0 && (
              <li>{t("maxDiscount", lang)} — {money(promo.maxDiscount)} {t("som", lang)}</li>
            )}
            {conditions.map((c) => <li key={c}>{c}</li>)}
          </ul>
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
