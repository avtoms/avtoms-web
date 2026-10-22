// Foydalanish shartlari / Условия использования.
//
// Linked from the mobile app's welcome screen ("Davom etish orqali siz foydalanish
// shartlariga rozilik bildirasiz") and from the App Store listing, so it has to be a plain
// public page with a stable address and no session behind it.
//
// DRAFT. It is written to describe what this product actually does — a directory and a
// booking tool, where the repair itself is a contract between the driver and the service
// centre — and the bracketed details must be filled in and the whole read by a lawyer
// before it is relied upon.
import type { Metadata } from "next";
import { SHARE_CSS } from "@/app/s/[slug]/styles";

export const revalidate = 3600;

type Lang = "uz" | "ru";
type Section = { h: string; p: string[] };

export const metadata: Metadata = {
  title: "Foydalanish shartlari — Auto-Garaj",
  description: "Auto-Garaj ilovasi va xizmatlaridan foydalanish shartlari.",
};

const UPDATED = "2026-10-22";

// The operator's own details. Filled in once and used in both languages.
const OPERATOR = {
  name: "«AUTO-GARAJ» MChJ",
  tin: "[STIR]",
  address: "[yuridik manzil]",
  email: "support@auto-garaj.com",
  phone: "[qo'llab-quvvatlash raqami]",
};

const UZ: Section[] = [
  { h: "1. Umumiy qoidalar", p: [
    `Ushbu shartlar ${OPERATOR.name} (keyingi o'rinlarda — «biz», «Operator», STIR ${OPERATOR.tin}, manzil: ${OPERATOR.address}) tomonidan taqdim etiladigan Auto-Garaj mobil ilovasi va auto-garaj.com sayti (keyingi o'rinlarda — «Xizmat») dan foydalanish tartibini belgilaydi.`,
    "Ilovadan ro'yxatdan o'tish yoki foydalanish orqali siz ushbu shartlarga rozilik bildirasiz. Rozi bo'lmasangiz, Xizmatdan foydalanmang.",
  ]},
  { h: "2. Xizmatning mohiyati", p: [
    "Auto-Garaj — avtoservislar katalogi va ularga oldindan yozilish vositasi. Biz avtomobilni ta'mirlash, yuvish, diagnostika va boshqa xizmatlarni o'zimiz ko'rsatmaymiz.",
    "Ish va uning sifati, narxi, muddati hamda kafolati bo'yicha shartnoma siz bilan tanlagan avtoservisingiz o'rtasida tuziladi. Operator bu shartnomaning tarafi emas.",
    "Katalogdagi ma'lumotlar (narx, ish vaqti, xizmatlar ro'yxati, reyting) avtoservislar tomonidan taqdim etiladi va o'zgarishi mumkin.",
  ]},
  { h: "3. Akkaunt", p: [
    "Ro'yxatdan o'tish telefon raqami va SMS orqali yuboriladigan bir martalik kod bilan amalga oshiriladi. Kodni boshqalarga bermang.",
    "Akkaunt bitta shaxsga tegishli. Siz ko'rsatgan ma'lumotlar (ism, avtomobil, davlat raqami) to'g'ri bo'lishi kerak.",
    "Akkauntingiz orqali amalga oshirilgan barcha harakatlar uchun siz javobgarsiz. Akkauntni istalgan vaqtda ilovaning «Profil» bo'limidan o'chirishingiz mumkin.",
  ]},
  { h: "4. Yozilish va bekor qilish", p: [
    "Ilova orqali yuborilgan yozuv — bu so'rov. U avtoservis tomonidan tasdiqlangandan keyin kuchga kiradi.",
    "Yozuvni ilovadan bekor qilishingiz mumkin. Avtoservis ishni boshlagandan so'ng bekor qilish uchun bevosita servis bilan bog'laning.",
    "Avtoservis o'z sabablari bilan yozuvni rad etishi yoki vaqtini o'zgartirishi mumkin; bunday holatda sizga xabar beriladi.",
  ]},
  { h: "5. Narxlar va to'lov", p: [
    "Ilovada ko'rsatilgan narxlar avtoservis tomonidan belgilanadi va taxminiy hisoblanadi. Yakuniy summa bajarilgan ishga qarab farq qilishi mumkin.",
    "To'lov ilova orqali (karta, Click, Payme) yoki bevosita avtoservisda amalga oshiriladi. Ilova orqali to'lovlar to'lov tashkilotlari orqali o'tadi; biz karta ma'lumotlarini saqlamaymiz.",
    "Pulni qaytarish, qayta hisob-kitob va sifatga oid da'volar ish bajargan avtoservis tomonidan hal qilinadi. Operator bunda vositachilik qilishi mumkin, lekin to'lov majburiyatini o'z zimmasiga olmaydi.",
  ]},
  { h: "6. Keshbek va do'st taklifi", p: [
    "Keshbek va taklif bonuslari — bu pul emas, Xizmat ichidagi chegirma birligi. Ularni naqdlashtirib yoki boshqa shaxsga o'tkazib bo'lmaydi.",
    "Bonus faqat ilova orqali to'langan va bekor qilinmagan yozuvlar uchun hisoblanadi. Yozuv bekor qilinsa, u uchun berilgan bonus qaytarib olinadi.",
    "Taklif kodi yangi foydalanuvchi uchun, birinchi yozuvdan oldin kiritiladi. Soxta akkauntlar yaratish yoki tizimni aldashga urinish aniqlansa, bonuslar bekor qilinadi va akkaunt bloklanishi mumkin.",
  ]},
  { h: "7. Sharhlar", p: [
    "Sharh faqat haqiqiy tashrif asosida qoldiriladi. Haqorat, reklama, boshqa shaxslarning shaxsiy ma'lumotlari va yolg'on ma'lumot taqiqlanadi.",
    "Operator ushbu qoidalarga zid sharhni o'chirishi mumkin. Avtoservis sharhga javob qoldirish huquqiga ega.",
  ]},
  { h: "8. Yo'l yordami (SOS)", p: [
    "SOS bo'limi orqali evakuator, akkumulyator va shunga o'xshash shoshilinch yordam chaqirish mumkin. Yordamni mustaqil ijrochilar ko'rsatadi.",
    "Ko'rsatilgan narx va yetib kelish vaqti taxminiy. Yakuniy narx joyida aniqlanadi.",
  ]},
  { h: "9. Javobgarlik", p: [
    "Operator Xizmatning uzluksiz va xatosiz ishlashini kafolatlamaydi. Texnik ishlar yoki nosozliklar tufayli vaqtincha uzilishlar bo'lishi mumkin.",
    "Operator avtoservis ko'rsatgan ish sifati, kechikish yoki yetkazilgan zarar uchun javobgar emas. Bunday da'volar bevosita avtoservisga qaratiladi.",
    "Operatorning javobgarligi qonunchilikda nazarda tutilgan hollar bilan cheklanadi.",
  ]},
  { h: "10. Taqiqlangan harakatlar", p: [
    "Xizmatni avtomatlashtirilgan vositalar bilan ommaviy so'rovlar yuborish, boshqa foydalanuvchilar ma'lumotlarini yig'ish, tizimga ruxsatsiz kirishga urinish yoki uning ishiga xalaqit berish uchun ishlatish taqiqlanadi.",
    "Qoidabuzarlik aniqlanganda akkaunt ogohlantirishsiz bloklanishi mumkin.",
  ]},
  { h: "11. Shaxsiy ma'lumotlar", p: [
    "Telefon raqami, ism, avtomobil ma'lumotlari va yozuvlar tarixi Xizmatni ko'rsatish uchun qayta ishlanadi. Yozuv ma'lumotlari siz tanlagan avtoservisga uzatiladi.",
    "Batafsil ma'lumot «Maxfiylik siyosati» hujjatida keltirilgan.",
  ]},
  { h: "12. Shartlarning o'zgarishi", p: [
    "Operator shartlarga o'zgartirish kiritishi mumkin. Yangi tahrir ushbu sahifada e'lon qilinadi va e'lon qilingan kundan kuchga kiradi.",
    "O'zgarishdan keyin Xizmatdan foydalanishda davom etish yangi shartlarga rozilik hisoblanadi.",
  ]},
  { h: "13. Qo'llaniladigan huquq va aloqa", p: [
    "Ushbu shartlarga O'zbekiston Respublikasi qonunchiligi qo'llaniladi. Nizolar muzokaralar yo'li bilan, kelishuvga erishilmasa — qonunchilikda belgilangan tartibda hal qilinadi.",
    `Savollar bo'yicha: ${OPERATOR.email}, ${OPERATOR.phone}.`,
  ]},
];

const RU: Section[] = [
  { h: "1. Общие положения", p: [
    `Настоящие условия определяют порядок использования мобильного приложения Auto-Garaj и сайта auto-garaj.com (далее — «Сервис»), предоставляемых ${OPERATOR.name} (далее — «мы», «Оператор», ИНН ${OPERATOR.tin}, адрес: ${OPERATOR.address}).`,
    "Регистрируясь или пользуясь приложением, вы принимаете эти условия. Если вы с ними не согласны — не пользуйтесь Сервисом.",
  ]},
  { h: "2. Суть Сервиса", p: [
    "Auto-Garaj — каталог автосервисов и инструмент предварительной записи. Мы сами не выполняем ремонт, мойку, диагностику и прочие работы.",
    "Договор о работе, её качестве, цене, сроках и гарантии заключается между вами и выбранным автосервисом. Оператор стороной этого договора не является.",
    "Данные в каталоге (цены, режим работы, перечень услуг, рейтинг) предоставляются автосервисами и могут меняться.",
  ]},
  { h: "3. Аккаунт", p: [
    "Регистрация производится по номеру телефона и одноразовому коду из SMS. Не передавайте код другим.",
    "Аккаунт принадлежит одному человеку. Указанные вами данные (имя, автомобиль, госномер) должны быть достоверными.",
    "Вы отвечаете за все действия, совершённые через ваш аккаунт. Удалить аккаунт можно в любой момент в разделе «Профиль».",
  ]},
  { h: "4. Запись и отмена", p: [
    "Запись, отправленная через приложение, — это заявка. Она вступает в силу после подтверждения автосервисом.",
    "Запись можно отменить в приложении. После того как автосервис начал работу, отмену согласуйте напрямую с ним.",
    "Автосервис вправе отклонить запись или перенести время, о чём вы получите уведомление.",
  ]},
  { h: "5. Цены и оплата", p: [
    "Цены в приложении устанавливает автосервис, они являются ориентировочными. Итоговая сумма зависит от фактически выполненной работы.",
    "Оплата производится через приложение (карта, Click, Payme) либо непосредственно в автосервисе. Платежи проходят через платёжные организации; данные карты мы не храним.",
    "Возврат средств, перерасчёт и претензии по качеству решает выполнивший работу автосервис. Оператор может выступить посредником, но не принимает на себя платёжных обязательств.",
  ]},
  { h: "6. Кешбэк и приглашение друга", p: [
    "Кешбэк и бонусы за приглашение — не деньги, а внутренняя скидочная единица Сервиса. Их нельзя обналичить или передать другому лицу.",
    "Бонус начисляется только за оплаченные через приложение и не отменённые записи. При отмене записи начисленный за неё бонус списывается.",
    "Код приглашения вводится новым пользователем до первой записи. При создании фиктивных аккаунтов или попытке обойти правила бонусы аннулируются, а аккаунт может быть заблокирован.",
  ]},
  { h: "7. Отзывы", p: [
    "Отзыв оставляется только по итогам реального визита. Оскорбления, реклама, персональные данные третьих лиц и заведомо ложные сведения запрещены.",
    "Оператор вправе удалить отзыв, нарушающий эти правила. Автосервис вправе ответить на отзыв.",
  ]},
  { h: "8. Помощь на дороге (SOS)", p: [
    "Через раздел SOS можно вызвать эвакуатор, прикуривание аккумулятора и другую срочную помощь. Помощь оказывают независимые исполнители.",
    "Указанные цена и время прибытия являются ориентировочными. Итоговая стоимость определяется на месте.",
  ]},
  { h: "9. Ответственность", p: [
    "Оператор не гарантирует непрерывную и безошибочную работу Сервиса. Возможны временные перерывы на технические работы или из-за сбоев.",
    "Оператор не отвечает за качество выполненных автосервисом работ, задержки или причинённый ущерб. Такие претензии адресуются непосредственно автосервису.",
    "Ответственность Оператора ограничена случаями, предусмотренными законодательством.",
  ]},
  { h: "10. Запрещённые действия", p: [
    "Запрещено использовать Сервис для массовых автоматических запросов, сбора данных других пользователей, попыток несанкционированного доступа или нарушения его работы.",
    "При выявлении нарушения аккаунт может быть заблокирован без предупреждения.",
  ]},
  { h: "11. Персональные данные", p: [
    "Номер телефона, имя, данные автомобиля и история записей обрабатываются для оказания Сервиса. Данные записи передаются выбранному вами автосервису.",
    "Подробности изложены в «Политике конфиденциальности».",
  ]},
  { h: "12. Изменение условий", p: [
    "Оператор вправе изменять условия. Новая редакция публикуется на этой странице и вступает в силу со дня публикации.",
    "Продолжение использования Сервиса после изменения означает согласие с новой редакцией.",
  ]},
  { h: "13. Применимое право и связь", p: [
    "К настоящим условиям применяется законодательство Республики Узбекистан. Споры решаются путём переговоров, а при недостижении согласия — в установленном законом порядке.",
    `Вопросы: ${OPERATOR.email}, ${OPERATOR.phone}.`,
  ]},
];

const TITLE = { uz: "Foydalanish shartlari", ru: "Условия использования" };
const UPDATED_LABEL = { uz: "Oxirgi yangilanish", ru: "Последнее обновление" };

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: raw } = await searchParams;
  const lang: Lang = raw === "ru" ? "ru" : "uz";
  const sections = lang === "ru" ? RU : UZ;

  return (
    <main className="sp sp-narrow sp-doc">
      <style>{SHARE_CSS}</style>

      <header className="sp-promo-hero sp-invite">
        <h1>{TITLE[lang]}</h1>
        <p className="sp-promo-until">{UPDATED_LABEL[lang]}: {UPDATED}</p>
      </header>

      <section className="sp-card">
        {sections.map((s) => (
          <article key={s.h} className="sp-clause">
            <h2>{s.h}</h2>
            {s.p.map((line) => <p key={line}>{line}</p>)}
          </article>
        ))}
      </section>

      <footer className="sp-footer">
        <a href="/">Auto-Garaj</a>
        <a className="sp-lang" href={`?lang=${lang === "uz" ? "ru" : "uz"}`}>
          {lang === "uz" ? "Русский" : "O'zbekcha"}
        </a>
      </footer>
    </main>
  );
}
