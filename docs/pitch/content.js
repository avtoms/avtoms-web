// Trilingual pitch-deck copy for AvtoNazorat (Auto-Garaj).
// Audiences: investors + President Tech Award (Uzbekistan national startup contest).
// Languages: en (investors / international jury), ru (regional), uz (Uzbek Latin, national jury).
//
// Every factual claim below is either (a) verifiable from the AvtoMS codebase at
// main/master, or (b) attributed to a public source on the market slide. Numbers only the
// founder can know (traction, financials, team, ask) are rendered as explicit fill-in
// fields, never invented.

const FACTS = {
  services: "7",
  endpoints: "169",
  tests: "259",
  migrations: "84",
  loc: "65k",
  aiTools: "15",
  langs: "3",
  plates: "9",
  reports: "9",
  states: "8",
  vehicles: "4.73M",
  vehiclesDelta: "+415k",
  passengerShare: "92.9%",
  shops: "2,030",
  partsStores: "830",
};

const en = {
  meta: { label: "EN", tagFont: "Calibri" },
  brand: "AvtoNazorat",
  product: "Auto-Garaj",

  s1: {
    eyebrow: "Digital management for auto repair shops",
    h1: "Every auto shop",
    h2: "on one screen.",
    sub: "Work orders, customers, warehouse, finance and fiscal receipts — one platform, built for Uzbekistan and the wider CIS.",
    chips: ["AI assistant", `${FACTS.langs} languages`, `${FACTS.plates} plate formats`, "Telegram-native"],
    footer: "President Tech Award · Investor Presentation",
  },

  s2: {
    kicker: "The problem",
    title: "A 4.7-million-car market still runs on paper.",
    cards: [
      { n: "01", h: "The notebook is the system", b: "Jobs, agreed prices and customer debts live in a paper notebook or a chat thread. Nothing is searchable, nothing is auditable, nothing survives a staff change." },
      { n: "02", h: "The owner flies blind", b: "No one can answer “what did I earn this month, and on which services?” without counting cash by hand at the end of the day." },
      { n: "03", h: "The customer waits in the dark", b: "No estimate to approve, no status while the car is in the shop, no receipt afterwards. Trust is rebuilt from zero on every visit." },
      { n: "04", h: "Fiscal duty is a burden", b: "The soliq chek is issued late, filled in by hand, or quietly skipped — and the shop carries the risk." },
    ],
    stats: [
      { v: FACTS.vehicles, l: "private vehicles registered" },
      { v: FACTS.vehiclesDelta, l: "added in a single year" },
      { v: FACTS.shops, l: "mapped repair shops" },
    ],
  },

  s3: {
    kicker: "The solution",
    title: "One platform. The whole shop.",
    lead: "A car arrives, a job opens, the customer approves the estimate on Telegram, mechanics work it from their phones, parts leave the warehouse, a fiscal receipt is issued — and the money lands in the books by itself.",
    pillars: [
      { h: "Work orders", b: `An ${FACTS.states}-state job lifecycle with per-item mechanic assignment and time tracking.` },
      { h: "Customers & cars", b: "Plate search, full vehicle history and a per-car service book." },
      { h: "Warehouse", b: "Products with variants, stock movements, counter sales and a shared catalogue." },
      { h: "Finance", b: "Multi-currency, customer and supplier ledgers, expenses and live P&L." },
      { h: "Fiscal receipts", b: "Uzbek chek with STIR, itemised discount, QR and OFD receipt id." },
      { h: "AI assistant", b: `${FACTS.aiTools} read-only tools over your own data, in plain language.` },
    ],
  },

  s4: {
    kicker: "How it works",
    title: "The job moves itself.",
    lead: "Six stages, each one a state the whole shop can see. Nothing is re-typed and nothing is remembered by hand.",
    steps: [
      { n: "1", h: "Intake", b: "Plate typed or found in one second. Car, owner and odometer attach themselves." },
      { n: "2", h: "Estimate", b: "Services and parts pulled from the price menu; a negotiated discount is recorded, not hidden." },
      { n: "3", h: "Approval", b: "The customer approves or declines on Telegram — or via an unguessable web link. No app to install." },
      { n: "4", h: "In progress", b: "Each line item is assigned to a mechanic, who moves it on their phone. Timers record real labour." },
      { n: "5", h: "Ready", b: "The customer is notified the moment the car is ready. Parts are written off the warehouse automatically." },
      { n: "6", h: "Receipt & close", b: "Fiscal chek issued, split or credit payment recorded, revenue booked, next service reminder scheduled." },
    ],
    note: "A background scheduler then follows up on its own: service reminders when they come due, appointment reminders 24 hours ahead.",
  },

  s5: {
    kicker: "The product",
    title: "Four front doors, one system.",
    apps: [
      { h: "Owner console", t: "Web", b: "Live dashboard, job board, warehouse, finance and nine report types. Everything the person who carries the risk needs to see." },
      { h: "Mechanic app", t: "Phone", b: "Only the jobs assigned to them, moved in two taps. Costs, margins and profit are never rendered on this screen." },
      { h: "Customer", t: "Telegram", b: "Approve an estimate, watch the job, get “your car is ready”, keep the service history. Nothing to install." },
      { h: "Admin console", t: "Platform", b: "Cross-shop control: the shared product catalogue, integrations, leads and platform-wide service performance." },
    ],
  },

  s6: {
    qText: "How’s profit this month?",
    aTitle: "Net profit: 38.6M UZS",
    aSub: "+18% vs last month",
    aBtn: "Open finances →",
    kicker: "Differentiator",
    title: "Talk to your data.",
    lead: "Ask “how is profit this month?” in plain Uzbek, Russian or English. The assistant answers with real tables and clickable buttons that navigate the app to the exact screen.",
    secTitle: "Read-only by construction",
    sec: [
      "The registry holds only List and Get tools — no create, update or delete tool exists to call.",
      "The shop is derived from the signed-in identity, never from what the model asks for.",
      "An owner is permanently pinned to their own shop; only a super-admin may read across shops.",
      "Replies are sanitised against a strict tag allowlist before they reach the screen.",
    ],
    mcpTitle: "Also an MCP server",
    mcp: "The same tool registry is exposed over Model Context Protocol (JSON-RPC), so an owner can point Claude Desktop at their shop with the same bearer token they already use.",
  },

  s7: {
    kicker: "Localisation",
    title: "Built for Uzbekistan, not translated into it.",
    items: [
      { h: "Fiscal chek", b: "Seller, STIR, cashier, itemised lines, QR and OFD receipt id." },
      { h: "Soum-first, multi-currency", b: "Each shop holds its own rate, with full rate history." },
      { h: "Nasiya", b: "Credit sales tracked on real customer ledgers and balances." },
      { h: "Company payments", b: "Bank transfer between legal entities, with counterparty ledgers." },
      { h: "SMS + Telegram", b: "PlayMobile SMS and Telegram Gateway OTP, with automatic fallback." },
      { h: "Three languages", b: "O‘zbekcha, Ўзбекча and Русский across the entire interface." },
      { h: "Nine plate formats", b: "Uzbek plates plus eight more CIS formats, rendered authentically." },
      { h: "Local car catalogue", b: "Makes and models with logos, curated centrally for every shop." },
    ],
  },

  s8: {
    kicker: "Technology",
    title: "Engineered like infrastructure.",
    lead: "Contract-first protobuf, seven Go services behind one gateway, and a deployment that updates itself.",
    tiers: [
      { h: "Clients", b: "Web console · Mechanic phone · Telegram bot · Admin console" },
      { h: "Edge", b: "Caddy — automatic TLS" },
      { h: "Gateway", b: `HTTP/JSON → gRPC · ${FACTS.endpoints} endpoints · auth, RBAC, CORS` },
      { h: "Services", b: "auth · customer · workorder · invoice · notification · reporting" },
      { h: "Data", b: "PostgreSQL, six isolated databases · NATS event bus" },
    ],
    ops: [
      "CI builds one image per service and pushes to the registry on every merge.",
      "Watchtower pulls and restarts changed services — no manual deploy step.",
      "Migrations re-run safely under an advisory lock on every restart.",
      "Prometheus, Grafana, Loki and Promtail ship with the stack.",
      "Sized for the MVP on a single VPS, with a documented path to managed Postgres and HA.",
    ],
  },

  s9: {
    kicker: "Proof",
    title: "Not a prototype. A running system.",
    stats: [
      { v: FACTS.services, l: "Go microservices" },
      { v: FACTS.endpoints, l: "REST endpoints" },
      { v: FACTS.tests, l: "automated tests" },
      { v: FACTS.migrations, l: "database migrations" },
      { v: FACTS.loc, l: "lines of code" },
      { v: FACTS.reports, l: "report types" },
    ],
    note: "Ten repositories, a shared protobuf contract, and a single-command deployment that has been running the full stack end to end.",
  },

  s10: {
    kicker: "Trust",
    title: "Security is a design decision, not a setting.",
    items: [
      { h: "Tenant isolation at the boundary", b: "Every service derives the shop from the authenticated token. Six separate databases, no cross-shop joins." },
      { h: "Roles a shop defines itself", b: "Custom roles with a per-permission matrix, rather than three fixed roles that never fit." },
      { h: "Mechanics cannot see money", b: "Cost, margin and profit are withheld from the mechanic surface by the API, not hidden by CSS." },
      { h: "Unguessable public links", b: "Invoices and approval links carry random tokens, never sequential identifiers." },
      { h: "Read-only intelligence", b: "The AI and MCP surfaces physically cannot mutate a record." },
      { h: "Audited money paths", b: "An audit log covers the operations that move money or void a receipt." },
    ],
  },

  s11: {
    kicker: "Market",
    title: "A fleet growing faster than the shops serving it.",
    stats: [
      { v: FACTS.vehicles, l: "private vehicles registered in Uzbekistan (Oct 2025)" },
      { v: FACTS.vehiclesDelta, l: "vehicles added in twelve months" },
      { v: FACTS.passengerShare, l: "of the fleet is passenger cars" },
    ],
    body: [
      { h: "The serviceable base", b: `${FACTS.shops} auto repair shops and ${FACTS.partsStores} parts stores appear in commercial business directories. The real market is materially larger and largely informal — which is precisely the segment that has never had software.` },
      { h: "Expansion is already engineered", b: `Nine CIS plate formats, three interface languages and per-shop multi-currency are in the product today. Entering Kazakhstan, Kyrgyzstan or Tajikistan is a go-to-market exercise, not a rebuild.` },
    ],
    fill: { h: "TAM / SAM / SOM", b: "To be completed with your pricing and reachable-shop assumptions." },
    src: "Sources: Statistics Agency under the President of the Republic of Uzbekistan (stat.uz), Oct 2025; commercial business directory data, 2026.",
  },

  s12: {
    kicker: "Business model",
    title: "A subscription per shop, priced by shop size.",
    tiers: [
      { n: "Start", tag: "", f: ["One location", "Up to three mechanics", "Work orders and customers", "Fiscal receipts"] },
      { n: "Business", tag: "Most popular", f: ["Unlimited mechanics", "Telegram bot and reminders", "Finance and P&L", "AI assistant"] },
      { n: "Network", tag: "", f: ["Multiple locations", "One control panel", "Custom integrations", "Priority support"] },
    ],
    levers: "Revenue expands with the customer: more mechanics, more branches, the AI tier, and custom integrations for chains.",
    fill: "Fill in: price per tier · ARPU · gross margin · CAC and payback",
  },

  s13: {
    kicker: "Traction",
    title: "Where we are today.",
    lead: "These figures come out of the product itself — it ships a lead and demo-request CRM, so the pipeline is measured, not estimated.",
    fields: [
      "Shops live on the platform",
      "Vehicles under management",
      "Work orders processed",
      "Monthly recurring revenue",
      "Month-on-month growth",
      "Demo requests in pipeline",
    ],
    fillNote: "Fill in before presenting — these are the only numbers a jury or an investor will test.",
  },

  s14: {
    kicker: "Roadmap",
    title: "What the money buys.",
    cols: [
      { h: "Now", b: ["Live OFD fiscalisation replacing the current stub", "Click, Payme and Uzum payment acceptance", "First cohort of paying shops onboarded"] },
      { h: "Next", b: ["Native iOS and Android apps for mechanics", "Consolidated reporting across branches", "Parts supplier marketplace inside the warehouse"] },
      { h: "Later", b: ["Predictive maintenance from service-book history", "Insurance and corporate fleet contracts", "Market entry across the CIS"] },
    ],
  },

  s15: {
    kicker: "Team",
    title: "Who is building this.",
    fillNote: "Add each founder: name, role, and the one line that makes them the right person for it.",
    slots: ["Founder / CEO", "Engineering", "Commercial"],
  },

  s16: {
    h1: "We built the system.",
    h2: "Now we scale it.",
    sub: "Ten repositories, seven services and a working product — looking for the capital and the partners to put it in every shop in the country.",
    askLabel: "The ask",
    askFill: "Amount · what it buys · milestone it reaches",
    contactLabel: "Contact",
    contactFill: "Name · phone · email · website",
  },
};

const ru = {
  meta: { label: "RU", tagFont: "Calibri" },
  brand: "AvtoNazorat",
  product: "Auto-Garaj",

  s1: {
    eyebrow: "Цифровое управление автосервисом",
    h1: "Весь автосервис —",
    h2: "на одном экране.",
    sub: "Заказы, клиенты, склад, финансы и фискальные чеки — одна платформа, созданная для Узбекистана и стран СНГ.",
    chips: ["AI-помощник", `${FACTS.langs} языка`, `${FACTS.plates} форматов госномеров`, "Работает в Telegram"],
    footer: "President Tech Award · Презентация для инвесторов",
  },

  s2: {
    kicker: "Проблема",
    title: "Рынок из 4,7 млн машин до сих пор живёт на бумаге.",
    cards: [
      { n: "01", h: "Тетрадь вместо системы", b: "Заказы, согласованные цены и долги клиентов лежат в бумажной тетради или в переписке. Ничего нельзя найти, проверить или передать новому сотруднику." },
      { n: "02", h: "Владелец работает вслепую", b: "Никто не ответит на вопрос «сколько я заработал за месяц и на каких услугах», не пересчитав кассу вручную в конце дня." },
      { n: "03", h: "Клиент остаётся в неведении", b: "Смету не согласовать, статус машины неизвестен, чека нет. Доверие приходится выстраивать заново при каждом визите." },
      { n: "04", h: "Фискальная нагрузка", b: "Чек выписывается с опозданием, заполняется вручную или не выписывается вовсе — а риск несёт сервис." },
    ],
    stats: [
      { v: "4,73 млн", l: "автомобилей у населения" },
      { v: "+415 тыс.", l: "прибавилось за год" },
      { v: "2 030", l: "автосервисов в справочниках" },
    ],
  },

  s3: {
    kicker: "Решение",
    title: "Одна платформа. Весь сервис.",
    lead: "Машина приехала, заказ открылся, клиент согласовал смету в Telegram, мастера ведут работу с телефона, запчасти списались со склада, выписан фискальный чек — и деньги сами встали в учёт.",
    pillars: [
      { h: "Заказ-наряды", b: `Жизненный цикл из ${FACTS.states} статусов, мастер на каждую позицию и учёт времени.` },
      { h: "Клиенты и авто", b: "Поиск по госномеру, полная история машины и сервисная книжка." },
      { h: "Склад", b: "Товары с вариантами, движения остатков, продажи и общий каталог." },
      { h: "Финансы", b: "Мультивалютность, лицевые счета клиентов и поставщиков, расходы и P&L." },
      { h: "Фискальные чеки", b: "Узбекский чек: СТИР, позиции, скидка, QR и номер чека ОФД." },
      { h: "AI-помощник", b: `${FACTS.aiTools} инструментов только на чтение — обычным языком.` },
    ],
  },

  s4: {
    kicker: "Как это работает",
    title: "Заказ движется сам.",
    lead: "Шесть этапов, и каждый — статус, который видит весь сервис. Ничего не переписывается вручную и ничего не держится в голове.",
    steps: [
      { n: "1", h: "Приём", b: "Госномер набран или найден за секунду. Машина, владелец и пробег подтягиваются сами." },
      { n: "2", h: "Смета", b: "Услуги и запчасти берутся из прайса; согласованная скидка фиксируется, а не прячется." },
      { n: "3", h: "Согласование", b: "Клиент подтверждает или отклоняет в Telegram либо по защищённой ссылке. Приложение не нужно." },
      { n: "4", h: "В работе", b: "Каждая позиция закреплена за мастером, который ведёт её с телефона. Таймер считает реальное время." },
      { n: "5", h: "Готово", b: "Клиент получает уведомление сразу, как машина готова. Запчасти списываются со склада автоматически." },
      { n: "6", h: "Чек и закрытие", b: "Выписан фискальный чек, учтена оплата (в том числе частями или в долг), выручка проведена, назначено напоминание." },
    ],
    note: "Дальше планировщик работает сам: напоминания о ТО по сроку и напоминания о записи за 24 часа.",
  },

  s5: {
    kicker: "Продукт",
    title: "Четыре входа, одна система.",
    apps: [
      { h: "Панель владельца", t: "Веб", b: "Живая сводка, доска заказов, склад, финансы и девять видов отчётов. Всё, что должен видеть тот, кто несёт риск." },
      { h: "Приложение мастера", t: "Телефон", b: "Только свои работы, статус в два нажатия. Себестоимость, наценка и прибыль на этот экран не выдаются вовсе." },
      { h: "Клиент", t: "Telegram", b: "Согласовать смету, следить за работой, получить «машина готова», хранить историю. Ставить нечего." },
      { h: "Админ-панель", t: "Платформа", b: "Управление всеми сервисами: общий каталог товаров, интеграции, заявки и сводная аналитика по платформе." },
    ],
  },

  s6: {
    qText: "Какая прибыль в этом месяце?",
    aTitle: "Чистая прибыль: 38,6 млн сум",
    aSub: "На 18% больше, чем в прошлом месяце",
    aBtn: "Открыть финансы →",
    kicker: "Отличие",
    title: "Говорите со своими данными.",
    lead: "Спросите «какая прибыль в этом месяце?» обычным языком — по-узбекски, по-русски или по-английски. Ответ придёт с реальными таблицами и кнопками, которые открывают нужный экран.",
    secTitle: "Только чтение — по устройству",
    sec: [
      "В реестре только инструменты List и Get — инструмента на создание, изменение или удаление просто не существует.",
      "Сервис определяется по данным авторизации, а не по тому, что запросила модель.",
      "Владелец жёстко закреплён за своим сервисом; читать по всем может только супер-администратор.",
      "Ответ очищается по строгому списку разрешённых тегов, прежде чем попасть на экран.",
    ],
    mcpTitle: "И ещё MCP-сервер",
    mcp: "Тот же набор инструментов отдаётся по Model Context Protocol (JSON-RPC): владелец может подключить Claude Desktop к своему сервису тем же токеном, которым уже пользуется.",
  },

  s7: {
    kicker: "Локализация",
    title: "Сделано для Узбекистана, а не переведено на узбекский.",
    items: [
      { h: "Фискальный чек", b: "Продавец, СТИР, кассир, позиции, QR и номер чека ОФД." },
      { h: "Сум и мультивалютность", b: "У каждого сервиса свой курс и полная история курсов." },
      { h: "Насия", b: "Продажи в долг ведутся на реальных лицевых счетах клиентов." },
      { h: "Расчёты между компаниями", b: "Перечисление между юрлицами и взаиморасчёты с контрагентами." },
      { h: "SMS и Telegram", b: "SMS через PlayMobile и OTP через Telegram Gateway с автоматическим запасным каналом." },
      { h: "Три языка", b: "O‘zbekcha, Ўзбекча и Русский во всём интерфейсе." },
      { h: "Девять форматов номеров", b: "Узбекские госномера и ещё восемь форматов СНГ в достоверном виде." },
      { h: "Каталог автомобилей", b: "Марки и модели с логотипами, которые ведутся централизованно." },
    ],
  },

  s8: {
    kicker: "Технологии",
    title: "Построено как инфраструктура.",
    lead: "Контракты на protobuf, семь сервисов на Go за одним шлюзом и развёртывание, которое обновляет себя само.",
    tiers: [
      { h: "Клиенты", b: "Веб-панель · Телефон мастера · Telegram-бот · Админ-панель" },
      { h: "Периметр", b: "Caddy — TLS-сертификаты автоматически" },
      { h: "Шлюз", b: `HTTP/JSON → gRPC · ${FACTS.endpoints} эндпоинтов · авторизация, права, CORS` },
      { h: "Сервисы", b: "auth · customer · workorder · invoice · notification · reporting" },
      { h: "Данные", b: "PostgreSQL, шесть изолированных баз · шина событий NATS" },
    ],
    ops: [
      "CI собирает образ на каждый сервис и публикует его при каждом слиянии.",
      "Watchtower сам забирает и перезапускает обновившиеся сервисы — ручного деплоя нет.",
      "Миграции безопасно переигрываются под блокировкой при каждом рестарте.",
      "Prometheus, Grafana, Loki и Promtail поставляются вместе со стеком.",
      "Рассчитано на MVP на одном VPS, с описанным переходом на управляемый Postgres и HA.",
    ],
  },

  s9: {
    kicker: "Доказательство",
    title: "Это не прототип. Это работающая система.",
    stats: [
      { v: FACTS.services, l: "микросервисов на Go" },
      { v: FACTS.endpoints, l: "REST-эндпоинтов" },
      { v: FACTS.tests, l: "автоматических тестов" },
      { v: FACTS.migrations, l: "миграций базы данных" },
      { v: FACTS.loc, l: "строк кода" },
      { v: FACTS.reports, l: "видов отчётов" },
    ],
    note: "Десять репозиториев, общий protobuf-контракт и развёртывание одной командой, на котором стек уже работает целиком.",
  },

  s10: {
    kicker: "Доверие",
    title: "Безопасность заложена в конструкцию.",
    items: [
      { h: "Изоляция на границе сервиса", b: "Каждый сервис берёт принадлежность к автосервису из токена. Шесть отдельных баз, никаких запросов между ними." },
      { h: "Роли, которые сервис задаёт сам", b: "Произвольные роли с матрицей прав вместо трёх фиксированных, которые никогда не подходят." },
      { h: "Мастер не видит денег", b: "Себестоимость, наценку и прибыль не отдаёт API — это не спрятано стилями, этого там просто нет." },
      { h: "Ссылки, которые не подобрать", b: "У счетов и согласований случайные токены, а не порядковые номера." },
      { h: "Аналитика только на чтение", b: "AI и MCP физически не могут изменить ни одну запись." },
      { h: "Аудит денежных операций", b: "Журнал аудита покрывает операции, которые двигают деньги или аннулируют чек." },
    ],
  },

  s11: {
    kicker: "Рынок",
    title: "Автопарк растёт быстрее, чем сервисы для него.",
    stats: [
      { v: "4,73 млн", l: "автомобилей у населения Узбекистана (окт. 2025)" },
      { v: "+415 тыс.", l: "машин прибавилось за двенадцать месяцев" },
      { v: "92,9%", l: "автопарка — легковые автомобили" },
    ],
    body: [
      { h: "Обслуживаемая база", b: `В коммерческих справочниках значатся ${FACTS.shops} автосервисов и ${FACTS.partsStores} магазинов запчастей. Реальный рынок заметно больше и в основном неформальный — а это и есть сегмент, у которого никогда не было софта.` },
      { h: "Выход за пределы страны уже заложен", b: "Девять форматов номеров СНГ, три языка интерфейса и мультивалютность у каждого сервиса уже в продукте. Выход в Казахстан, Кыргызстан или Таджикистан — задача продаж, а не переписывания системы." },
    ],
    fill: { h: "TAM / SAM / SOM", b: "Заполнить исходя из вашей цены и числа достижимых автосервисов." },
    src: "Источники: Агентство статистики при Президенте Республики Узбекистан (stat.uz), окт. 2025; данные коммерческих бизнес-справочников, 2026.",
  },

  s12: {
    kicker: "Бизнес-модель",
    title: "Подписка на сервис — по размеру сервиса.",
    tiers: [
      { n: "Старт", tag: "", f: ["Один филиал", "До трёх мастеров", "Заказы и клиенты", "Фискальные чеки"] },
      { n: "Бизнес", tag: "Популярный", f: ["Без лимита мастеров", "Telegram-бот и напоминания", "Финансы и P&L", "AI-помощник"] },
      { n: "Сеть", tag: "", f: ["Несколько филиалов", "Единая панель контроля", "Индивидуальные интеграции", "Приоритетная поддержка"] },
    ],
    levers: "Выручка растёт вместе с клиентом: больше мастеров, больше филиалов, тариф с AI и индивидуальные интеграции для сетей.",
    fill: "Заполнить: цена по тарифам · ARPU · валовая маржа · CAC и срок окупаемости",
  },

  s13: {
    kicker: "Трекшн",
    title: "Где мы сейчас.",
    lead: "Эти цифры берутся из самого продукта — в нём есть CRM заявок и демо-запросов, поэтому воронка измеряется, а не оценивается.",
    fields: [
      "Автосервисов на платформе",
      "Автомобилей в системе",
      "Обработано заказ-нарядов",
      "Ежемесячная выручка (MRR)",
      "Рост месяц к месяцу",
      "Заявок на демо в воронке",
    ],
    fillNote: "Заполните до выступления — только эти цифры жюри и инвестор будут проверять.",
  },

  s14: {
    kicker: "Дорожная карта",
    title: "Что даст инвестиция.",
    cols: [
      { h: "Сейчас", b: ["Боевая фискализация ОФД вместо текущей заглушки", "Приём оплат Click, Payme и Uzum", "Подключение первой когорты платящих сервисов"] },
      { h: "Дальше", b: ["Нативные приложения для мастеров на iOS и Android", "Сводная отчётность по сети филиалов", "Маркетплейс поставщиков запчастей внутри склада"] },
      { h: "Потом", b: ["Предиктивное ТО на основе сервисной истории", "Контракты со страховыми и корпоративными автопарками", "Выход на рынки СНГ"] },
    ],
  },

  s15: {
    kicker: "Команда",
    title: "Кто это строит.",
    fillNote: "Добавьте по каждому: имя, роль и одну строку о том, почему именно он подходит.",
    slots: ["Основатель / CEO", "Разработка", "Коммерция"],
  },

  s16: {
    h1: "Система построена.",
    h2: "Дальше — масштаб.",
    sub: "Десять репозиториев, семь сервисов и работающий продукт. Ищем капитал и партнёров, чтобы поставить его в каждый автосервис страны.",
    askLabel: "Запрос",
    askFill: "Сумма · на что · какой рубеж закрывает",
    contactLabel: "Контакты",
    contactFill: "Имя · телефон · e-mail · сайт",
  },
};

const uz = {
  meta: { label: "UZ", tagFont: "Calibri" },
  brand: "AvtoNazorat",
  product: "Auto-Garaj",

  s1: {
    eyebrow: "Avtoservis uchun raqamli boshqaruv",
    h1: "Butun avtoservis —",
    h2: "bitta ekranda.",
    sub: "Buyurtmalar, mijozlar, ombor, moliya va fiskal cheklar — O‘zbekiston va MDH bozori uchun yaratilgan yagona platforma.",
    chips: ["AI yordamchi", `${FACTS.langs} til`, `${FACTS.plates} raqam formati`, "Telegram orqali"],
    footer: "President Tech Award · Investorlar uchun taqdimot",
  },

  s2: {
    kicker: "Muammo",
    title: "4,7 million avtomobillik bozor daftarda yuritiladi.",
    cards: [
      { n: "01", h: "Tizim o‘rniga daftar", b: "Buyurtmalar, kelishilgan narxlar va mijoz qarzlari qog‘oz daftarda yoki yozishmada qoladi. Qidirib bo‘lmaydi, tekshirib bo‘lmaydi, xodim ketsa hammasi yo‘qoladi." },
      { n: "02", h: "Egasi ko‘r-ko‘rona ishlaydi", b: "«Bu oy qancha ishladim va qaysi xizmatdan?» degan savolga kun oxirida kassani qo‘lda sanamasdan javob berib bo‘lmaydi." },
      { n: "03", h: "Mijoz xabarsiz qoladi", b: "Smeta tasdiqlanmaydi, mashina qaysi bosqichda ekani noma’lum, chek yo‘q. Ishonch har safar noldan quriladi." },
      { n: "04", h: "Fiskal yuk", b: "Soliq cheki kechikib yoziladi, qo‘lda to‘ldiriladi yoki umuman yozilmaydi — xavf esa servis zimmasida qoladi." },
    ],
    stats: [
      { v: "4,73 mln", l: "aholidagi avtomobil" },
      { v: "+415 ming", l: "bir yilda qo‘shildi" },
      { v: "2 030", l: "ma’lumotnomadagi avtoservis" },
    ],
  },

  s3: {
    kicker: "Yechim",
    title: "Bitta platforma. Butun servis.",
    lead: "Mashina keldi, buyurtma ochildi, mijoz smetani Telegramda tasdiqladi, ustalar telefonidan ishladi, ehtiyot qismlar ombordan yechildi, fiskal chek berildi — pul esa hisobga o‘zi tushdi.",
    pillars: [
      { h: "Buyurtmalar", b: `${FACTS.states} bosqichli jarayon, har bir ishga usta biriktirish va vaqt hisobi.` },
      { h: "Mijozlar va avtolar", b: "Davlat raqami bo‘yicha qidiruv, to‘liq tarix va servis kitobchasi." },
      { h: "Ombor", b: "Variantli tovarlar, qoldiq harakati, sotuv va umumiy katalog." },
      { h: "Moliya", b: "Ko‘p valyuta, mijoz va yetkazib beruvchi hisoblari, xarajatlar va foyda hisoboti." },
      { h: "Fiskal cheklar", b: "O‘zbek cheki: STIR, pozitsiyalar, chegirma, QR va OFD chek raqami." },
      { h: "AI yordamchi", b: `${FACTS.aiTools} ta faqat o‘qiydigan vosita — oddiy tilda.` },
    ],
  },

  s4: {
    kicker: "Qanday ishlaydi",
    title: "Buyurtma o‘zi yuradi.",
    lead: "Olti bosqich, va har biri — butun servis ko‘rib turadigan holat. Hech narsa qayta yozilmaydi va yodda saqlanmaydi.",
    steps: [
      { n: "1", h: "Qabul", b: "Davlat raqami bir soniyada terildi yoki topildi. Mashina, egasi va probeg o‘zi biriktiriladi." },
      { n: "2", h: "Smeta", b: "Xizmat va ehtiyot qismlar narxlar menyusidan olinadi; kelishilgan chegirma yashirilmay qayd etiladi." },
      { n: "3", h: "Tasdiqlash", b: "Mijoz Telegramda yoki himoyalangan havola orqali tasdiqlaydi yoki rad etadi. Ilova o‘rnatish shart emas." },
      { n: "4", h: "Jarayonda", b: "Har bir ish ustaga biriktiriladi va u telefonidan yuritadi. Taymer haqiqiy vaqtni hisoblaydi." },
      { n: "5", h: "Tayyor", b: "Mashina tayyor bo‘lishi bilan mijozga xabar ketadi. Ehtiyot qismlar ombordan avtomatik yechiladi." },
      { n: "6", h: "Chek va yopish", b: "Fiskal chek berildi, to‘lov (bo‘lib yoki nasiyaga) qayd etildi, tushum o‘tkazildi, keyingi eslatma belgilandi." },
    ],
    note: "Keyin rejalashtiruvchi o‘zi ishlaydi: muddati kelgan texnik ko‘rik eslatmalari va navbatdan 24 soat oldingi eslatmalar.",
  },

  s5: {
    kicker: "Mahsulot",
    title: "To‘rt eshik, bitta tizim.",
    apps: [
      { h: "Ega paneli", t: "Veb", b: "Jonli boshqaruv paneli, buyurtmalar doskasi, ombor, moliya va to‘qqiz xil hisobot. Xavfni ko‘taradigan odam ko‘rishi kerak bo‘lgan hamma narsa." },
      { h: "Usta ilovasi", t: "Telefon", b: "Faqat o‘ziga biriktirilgan ishlar, holat ikki bosishda. Tannarx, ustama va foyda bu ekranga umuman berilmaydi." },
      { h: "Mijoz", t: "Telegram", b: "Smetani tasdiqlash, ishni kuzatish, «mashinangiz tayyor» xabari va tarix. O‘rnatadigan narsa yo‘q." },
      { h: "Admin panel", t: "Platforma", b: "Barcha servislar ustidan nazorat: umumiy tovar katalogi, integratsiyalar, arizalar va platforma bo‘yicha tahlil." },
    ],
  },

  s6: {
    qText: "Bu oy foyda qancha?",
    aTitle: "Sof foyda: 38,6 mln so‘m",
    aSub: "O‘tgan oyga nisbatan +18%",
    aBtn: "Moliyani ochish →",
    kicker: "Farq",
    title: "Ma’lumotlaringiz bilan gaplashing.",
    lead: "«Bu oy foyda qancha?» deb oddiy tilda so‘rang — o‘zbekcha, ruscha yoki inglizcha. Javob haqiqiy jadvallar va kerakli ekranni ochadigan tugmalar bilan keladi.",
    secTitle: "Tuzilishiga ko‘ra faqat o‘qiydi",
    sec: [
      "Ro‘yxatda faqat List va Get vositalari bor — yaratish, o‘zgartirish yoki o‘chirish vositasi umuman mavjud emas.",
      "Servis modelning so‘rovidan emas, tizimga kirgan foydalanuvchi ma’lumotidan aniqlanadi.",
      "Ega doimo o‘z servisiga bog‘langan; servislar bo‘ylab faqat super-administrator o‘qiy oladi.",
      "Javob ekranga chiqishidan oldin qat’iy ruxsat etilgan teglar ro‘yxati bo‘yicha tozalanadi.",
    ],
    mcpTitle: "Bundan tashqari MCP server",
    mcp: "Xuddi shu vositalar to‘plami Model Context Protocol (JSON-RPC) orqali ochilgan: ega o‘zi ishlatayotgan token bilan Claude Desktop’ni o‘z servisiga ulashi mumkin.",
  },

  s7: {
    kicker: "Mahalliylashtirish",
    title: "O‘zbekiston uchun qilingan, tarjima qilingan emas.",
    items: [
      { h: "Fiskal chek", b: "Sotuvchi, STIR, kassir, pozitsiyalar, QR va OFD chek raqami." },
      { h: "So‘m va ko‘p valyuta", b: "Har bir servisning o‘z kursi va to‘liq kurs tarixi bor." },
      { h: "Nasiya", b: "Qarzga sotuv haqiqiy mijoz hisoblarida yuritiladi." },
      { h: "Kompaniyalar hisob-kitobi", b: "Yuridik shaxslar o‘rtasida pul o‘tkazma va kontragentlar bilan hisob-kitob." },
      { h: "SMS va Telegram", b: "PlayMobile orqali SMS va Telegram Gateway orqali OTP, zaxira kanali bilan." },
      { h: "Uch til", b: "O‘zbekcha, Ўзбекча va Русский — butun interfeys bo‘ylab." },
      { h: "To‘qqiz raqam formati", b: "O‘zbek davlat raqamlari va yana sakkizta MDH formati aniq ko‘rinishda." },
      { h: "Avtomobillar katalogi", b: "Markalar va modellar logotiplari bilan, markazlashgan holda yuritiladi." },
    ],
  },

  s8: {
    kicker: "Texnologiya",
    title: "Infratuzilma sifatida qurilgan.",
    lead: "Protobuf shartnomalari, bitta shlyuz ortidagi yettita Go xizmati va o‘zini o‘zi yangilaydigan joylashtirish.",
    tiers: [
      { h: "Mijozlar", b: "Veb panel · Usta telefoni · Telegram bot · Admin panel" },
      { h: "Chegara", b: "Caddy — TLS sertifikatlari avtomatik" },
      { h: "Shlyuz", b: `HTTP/JSON → gRPC · ${FACTS.endpoints} endpoint · avtorizatsiya, huquqlar, CORS` },
      { h: "Xizmatlar", b: "auth · customer · workorder · invoice · notification · reporting" },
      { h: "Ma’lumotlar", b: "PostgreSQL, oltita alohida baza · NATS hodisalar shinasi" },
    ],
    ops: [
      "CI har bir xizmat uchun image yig‘adi va har bir birlashtirishda chop etadi.",
      "Watchtower yangilangan xizmatlarni o‘zi tortib qayta ishga tushiradi — qo‘lda deploy yo‘q.",
      "Migratsiyalar har qayta ishga tushishda qulf ostida xavfsiz qayta o‘ynatiladi.",
      "Prometheus, Grafana, Loki va Promtail stek bilan birga keladi.",
      "MVP uchun bitta VPS’ga mo‘ljallangan, boshqariladigan Postgres va HA’ga o‘tish yo‘li hujjatlashtirilgan.",
    ],
  },

  s9: {
    kicker: "Isbot",
    title: "Bu prototip emas. Bu ishlayotgan tizim.",
    stats: [
      { v: FACTS.services, l: "Go mikroxizmati" },
      { v: FACTS.endpoints, l: "REST endpoint" },
      { v: FACTS.tests, l: "avtomatik test" },
      { v: FACTS.migrations, l: "baza migratsiyasi" },
      { v: FACTS.loc, l: "qator kod" },
      { v: FACTS.reports, l: "hisobot turi" },
    ],
    note: "O‘nta repozitoriy, umumiy protobuf shartnomasi va bitta buyruq bilan joylashtirish — stek allaqachon to‘liq ishlab turibdi.",
  },

  s10: {
    kicker: "Ishonch",
    title: "Xavfsizlik sozlama emas, konstruksiyaning o‘zi.",
    items: [
      { h: "Xizmat chegarasida ajratish", b: "Har bir xizmat servis mansubligini tokendan oladi. Oltita alohida baza, ular orasida so‘rov yo‘q." },
      { h: "Servis o‘zi belgilaydigan rollar", b: "Hech qachon to‘g‘ri kelmaydigan uchta qat’iy rol o‘rniga huquqlar matritsasi bilan ixtiyoriy rollar." },
      { h: "Usta pulni ko‘rmaydi", b: "Tannarx, ustama va foydani API bermaydi — bu uslub bilan yashirilgan emas, u yerda umuman yo‘q." },
      { h: "Topib bo‘lmaydigan havolalar", b: "Hisob-fakturalar va tasdiqlash havolalarida tasodifiy token, tartib raqami emas." },
      { h: "Faqat o‘qiydigan tahlil", b: "AI va MCP birorta yozuvni jismonan o‘zgartira olmaydi." },
      { h: "Pul harakati auditi", b: "Audit jurnali pulni harakatlantiradigan yoki chekni bekor qiladigan amallarni qamrab oladi." },
    ],
  },

  s11: {
    kicker: "Bozor",
    title: "Avtopark servislardan tez o‘smoqda.",
    stats: [
      { v: "4,73 mln", l: "O‘zbekiston aholisidagi avtomobil (2025-yil okt.)" },
      { v: "+415 ming", l: "o‘n ikki oyda qo‘shilgan avtomobil" },
      { v: "92,9%", l: "avtoparkning yengil avtomobillar ulushi" },
    ],
    body: [
      { h: "Xizmat ko‘rsatiladigan baza", b: `Tijorat ma’lumotnomalarida ${FACTS.shops} ta avtoservis va ${FACTS.partsStores} ta ehtiyot qism do‘koni qayd etilgan. Haqiqiy bozor sezilarli darajada kattaroq va asosan norasmiy — aynan shu qatlamda hech qachon dasturiy ta’minot bo‘lmagan.` },
      { h: "Chet bozorga chiqish allaqachon tayyor", b: "MDHning to‘qqizta raqam formati, uchta interfeys tili va har bir servis uchun ko‘p valyuta mahsulotda bor. Qozog‘iston, Qirg‘iziston yoki Tojikistonga chiqish — sotuv masalasi, tizimni qayta yozish emas." },
    ],
    fill: { h: "TAM / SAM / SOM", b: "O‘z narxingiz va erishish mumkin bo‘lgan servislar soni asosida to‘ldiriladi." },
    src: "Manbalar: O‘zbekiston Respublikasi Prezidenti huzuridagi Statistika agentligi (stat.uz), 2025-yil okt.; tijorat biznes-ma’lumotnomalari, 2026-yil.",
  },

  s12: {
    kicker: "Biznes model",
    title: "Har bir servisga obuna — servis hajmiga qarab.",
    tiers: [
      { n: "Start", tag: "", f: ["Bitta filial", "Uchtagacha usta", "Buyurtmalar va mijozlar", "Fiskal cheklar"] },
      { n: "Biznes", tag: "Ommabop", f: ["Cheklanmagan ustalar", "Telegram bot va eslatmalar", "Moliya va foyda hisoboti", "AI yordamchi"] },
      { n: "Tarmoq", tag: "", f: ["Bir nechta filial", "Yagona nazorat paneli", "Individual integratsiyalar", "Ustuvor qo‘llab-quvvatlash"] },
    ],
    levers: "Tushum mijoz bilan birga o‘sadi: ko‘proq usta, ko‘proq filial, AI tarifi va tarmoqlar uchun individual integratsiyalar.",
    fill: "To‘ldiriladi: tariflar narxi · ARPU · yalpi marja · CAC va qoplanish muddati",
  },

  s13: {
    kicker: "Natijalar",
    title: "Bugungi holat.",
    lead: "Bu raqamlar mahsulotning o‘zidan olinadi — unda arizalar va demo so‘rovlari CRM’i bor, shuning uchun voronka taxmin qilinmaydi, o‘lchanadi.",
    fields: [
      "Platformadagi avtoservislar",
      "Tizimdagi avtomobillar",
      "Yopilgan buyurtmalar",
      "Oylik takroriy tushum (MRR)",
      "Oydan oyga o‘sish",
      "Voronkadagi demo so‘rovlari",
    ],
    fillNote: "Taqdimotdan oldin to‘ldiring — hakamlar va investor tekshiradigan yagona raqamlar shular.",
  },

  s14: {
    kicker: "Yo‘l xaritasi",
    title: "Investitsiya nima beradi.",
    cols: [
      { h: "Hozir", b: ["Hozirgi vaqtinchalik yechim o‘rniga jonli OFD fiskalizatsiyasi", "Click, Payme va Uzum orqali to‘lov qabul qilish", "Birinchi to‘lovchi servislar guruhini ulash"] },
      { h: "Keyin", b: ["Ustalar uchun iOS va Android ilovalari", "Filiallar bo‘yicha yig‘ma hisobot", "Ombor ichida ehtiyot qism yetkazib beruvchilar marketplace’i"] },
      { h: "Kelgusida", b: ["Servis tarixiga asoslangan bashoratli texnik ko‘rik", "Sug‘urta va korporativ avtopark shartnomalari", "MDH bozorlariga chiqish"] },
    ],
  },

  s15: {
    kicker: "Jamoa",
    title: "Buni kim quryapti.",
    fillNote: "Har biri uchun qo‘shing: ism, rol va nega aynan u mos ekani haqida bir qator.",
    slots: ["Ta’sischi / CEO", "Dasturlash", "Tijorat"],
  },

  s16: {
    h1: "Tizim qurildi.",
    h2: "Endi — miqyos.",
    sub: "O‘nta repozitoriy, yettita xizmat va ishlayotgan mahsulot. Uni mamlakatdagi har bir servisga olib kirish uchun kapital va hamkorlar izlayapmiz.",
    askLabel: "So‘rov",
    askFill: "Summa · nimaga · qaysi bosqichni yopadi",
    contactLabel: "Aloqa",
    contactFill: "Ism · telefon · e-mail · sayt",
  },
};

module.exports = { en, ru, uz, FACTS };
