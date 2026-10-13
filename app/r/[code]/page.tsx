// An invitation — where a shared referral code lands.
//
// The person opening this was invited by a friend, and what they need to know is what they
// are being invited to and what to do with the code. The code is large and spelled out:
// they will be typing it on the sign-up screen, probably while holding the phone in one
// hand, so it has to be readable at a glance and hard to mistype.
import type { Metadata } from "next";
import { SHARE_CSS } from "@/app/s/[slug]/styles";

export const revalidate = 3600;

type Lang = "uz" | "ru";
const T = {
  kicker: { uz: "Taklifnoma", ru: "Приглашение" },
  title: { uz: "Auto-Garaj'ga qo'shiling", ru: "Присоединяйтесь к Auto-Garaj" },
  sub: {
    uz: "Yaqin atrofdagi avtoservisni toping, navbatsiz yoziling va har to'lovdan keshbek oling.",
    ru: "Найдите автосервис рядом, запишитесь без очереди и получайте кешбэк с каждой оплаты.",
  },
  codeLabel: { uz: "Sizning taklif kodingiz", ru: "Ваш код приглашения" },
  how: { uz: "Nima qilish kerak", ru: "Что делать" },
  step1: { uz: "Auto-Garaj ilovasini o'rnating", ru: "Установите приложение Auto-Garaj" },
  step2: { uz: "Telefon raqami bilan ro'yxatdan o'ting", ru: "Зарегистрируйтесь по номеру телефона" },
  step3: { uz: "Bonuslar bo'limida shu kodni kiriting", ru: "Введите этот код в разделе бонусов" },
  note: {
    uz: "Kod faqat birinchi yozuvdan oldin kiritiladi.",
    ru: "Код вводится только до первой записи.",
  },
  browse: { uz: "Servislarni ko'rish", ru: "Посмотреть сервисы" },
  tagline: { uz: "Avtoservislar katalogi", ru: "Каталог автосервисов" },
} as const;
const t = (k: keyof typeof T, l: Lang) => T[k][l];

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  return {
    title: `${T.title.uz} — Auto-Garaj`,
    description: `${T.codeLabel.uz}: ${code.toUpperCase()}`,
    openGraph: { title: T.title.uz, description: T.sub.uz, type: "website" },
  };
}

export default async function ReferralPage({
  params, searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const { code } = await params;
  const { lang: raw } = await searchParams;
  const lang: Lang = raw === "ru" ? "ru" : "uz";
  // Shown the way it is typed, and the way the service compares it: case does not matter.
  const shown = code.toUpperCase();

  return (
    <main className="sp sp-narrow">
      <style>{SHARE_CSS}</style>

      <header className="sp-promo-hero sp-invite">
        <span className="sp-kicker">{t("kicker", lang)}</span>
        <h1>{t("title", lang)}</h1>
        <p className="sp-promo-until">{t("sub", lang)}</p>
      </header>

      <section className="sp-card sp-codecard">
        <span className="sp-muted">{t("codeLabel", lang)}</span>
        <b className="sp-code">{shown}</b>
      </section>

      <section className="sp-card">
        <h2>{t("how", lang)}</h2>
        <ol className="sp-steps">
          <li>{t("step1", lang)}</li>
          <li>{t("step2", lang)}</li>
          <li>{t("step3", lang)}</li>
        </ol>
        <p className="sp-muted sp-note">{t("note", lang)}</p>
      </section>

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
