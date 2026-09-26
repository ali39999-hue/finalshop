# معماری final.shop

> این سند، تصویر کامل معماری پلتفرم را به زبان فارسی ارائه می‌کند و خلاصهٔ
> تطبیق‌یافتهٔ اسناد مرجع است: [README](../README.md) ·
> [ADR-001](../docs/adr/ADR-001-modular-monolith-in-monorepo.md) ·
> [ADR-002](../docs/adr/ADR-002-v1-reference-stack.md) ·
> [dependency-rules](../docs/architecture/dependency-rules.md) ·
> [domain-map](../docs/architecture/domain-map.md) ·
> [monorepo-structure](../docs/architecture/monorepo-structure.md) ·
> [rls-strategy](../docs/architecture/rls-strategy.md) ·
> [threat-model](../docs/security/threat-model.md).
> در صورت تعارض، همان اسناد مرجع و ADRها حاکم‌اند.

---

## ۱. نمای کلی معماری

**final.shop — سیستم‌عامل تجارت جهانی (Global Commerce OS):** پلتفرمی
چندمستأجری، وایته‌لیبل و قابل‌کلون که فروشگاه آنلاین + CMS + صفحه‌ساز + موتور
تم + ERP را در یک محصول جمع می‌کند. پنج نقش محصول: فروشگاه آنلاین (B2C/B2B و
چندکاناله)، CMS (پیش‌نویس/انتشار/نسخه/پیش‌نمایش/زمان‌بندی/بومی‌سازی)، سازندهٔ
سایت و تم، مرکز عملیات ERP (سفارش، انبار، مالی، CRM، پشتیبانی)، و پلتفرم SaaS
(فروشگاه‌های مستقل یا فرزندِ فورک‌شده از یک هستهٔ مشترک).

معماری، **مونولیت ماژولار (modular monolith) درون یک مونوریپو** است:

- یک هستهٔ کاربردی واحد که به **ماژول‌های دامنه‌ای با مرزهای تحمیل‌شده**
  سازمان یافته است (مرزها با قواعد وابستگی + لینت + بازبینی کد حفظ می‌شوند، نه
  با مرز شبکه).
- میزبان آن **مونوریپو با npm workspaces + Turborepo** است و مرزهای پکیج از
  روز نخست وجود دارند.
- تفکیک پروسهٔ اجرایی **فقط در دو جا** مجاز است: اپ Next.js (ابتدا یک اپ با
  route groups برای فروشگاه + ادمین) و یک worker برای کارهای ناهمگام (صف‌ها،
  ایندکس‌گذاری، اعلان‌ها). اپ جداگانهٔ `api` وجود ندارد؛ لایهٔ BFF/قرارداد API
  داخل ران‌تایم Next.js شروع می‌شود و فقط با ADR از آن خارج می‌شود.
- **یک پایگاه‌دادهٔ کانونی PostgreSQL**؛ یکپارچگی ناهمگام بین‌ماژولی از طریق
  **transactional outbox → worker** انجام می‌شود.

این تصمیم (ADR-001) دو گزینهٔ رد‌شده دارد: میکروسرویس از روز صفر (پیچیدگی
عملیاتی پیش از درست‌شدن هستهٔ تراکنشی) و یک اپ Next.js بدون ساختار (پوسیدگی
مرزها و نشت منطق کسب‌وکار به کامپوننت‌ها). هزینهٔ نظم مرزها پذیرفته شده است:
نقض مرز مانعِ merge است. استخراج آیندهٔ یک ماژول به سرویس باید «مکانیکی» بماند.

---

## ۲. لایه‌ها و وابستگی‌ها

| لایه | محل | مسئولیت | نباید شامل باشد |
| --- | --- | --- | --- |
| Presentation (ارائه) | `apps/web`، `apps/admin`، `packages/ui` | UI، دسترس‌پذیری، view-model، تعامل | Prisma، قواعد کسب‌وکار، منطق مستقیم پرداخت |
| Application (کاربرد) | `packages/application` | فرمان‌ها/پرس‌وجوها، هماهنگی، مرز تراکنش | دغدغه‌های UI |
| Domain (دامنه) | `packages/domain` | قواعد، موجودیت‌ها، value objectها، ماشین‌های حالت | هرگونه وابستگی به فریم‌ورک |
| Infrastructure (زیرساخت) | `packages/infrastructure` | دیتابیس، Redis، ذخیره‌سازی، APIهای بیرونی، کلاینت جست‌وجو | تصمیم‌های سیاستیِ کسب‌وکار |
| Workers | `apps/worker` | کارهای ناهمگام، retry، ایندکس‌گذاری، اعلان‌ها | وابستگی به چرخهٔ درخواست |

**جهت‌های مجاز وابستگی:**

```text
Presentation → Application → Domain
Workers      → Application → Domain
Infrastructure پیاده‌سازِ portهای تعریف‌شده در Domain/Application (فقط به درون)
```

- لایهٔ Domain **TypeScript خالص** است: بدون Next.js، بدون React، بدون Prisma،
  بدون HTTP، بدون Redis.
- Presentation فقط از طریق قراردادهای تایپ‌شدهٔ فرمان/پرس‌وجو با Application
  حرف می‌زند و هرگز کلاینت‌های Infrastructure را import نمی‌کند یا سراغ جدول‌ها
  نمی‌رود.
- هیچ‌چیز جز composition root (سیم‌کشی اپ) و Workers مجاز به import کردن
  Infrastructure نیست.
- منطق کسب‌وکار **هرگز** در کامپوننت‌های React یا route handlerها قرار نمی‌گیرد.

---

## ۳. نقشهٔ دامنه

هفده دامنهٔ `docs/architecture/domain-map.md`، واژگان مشترک مرز ماژول‌ها و
نام‌گذاری است. تغییر مرزها نیازمند ADR است.

| # | دامنه | هدف | موجودیت‌های اصلی |
| --- | --- | --- | --- |
| ۱ | Tenancy | جداسازی مستأجر، ساختار سازمانی | `Organization`, `Membership`, `Role`, `Permission`, `Domain`, `Storefront`, `Branch` |
| ۲ | Identity & Access | احراز/مجوز هویت، حسابرسی | `Membership`, `Role`, `Permission`, `AuditEvent`, `ApiKey` |
| ۳ | Catalog | محصولات و ساختار | `Product`, `Variant`, `Collection`, `Category`, `Attribute`, `Asset`, `ProductRevision` |
| ۴ | Pricing | حل قطعیِ قیمت | `PriceList`, `PriceRule`, `Promotion`, `Coupon`, `DiscountAllocation` |
| ۵ | Inventory | موجودی و رزرو | `StockLocation`, `InventoryItem`, `Reservation`, `Transfer`, `Adjustment` |
| ۶ | Cart & Checkout | سبد ← Quote ← Checkout ← سفارش | `Cart`, `CartLine`, `Quote`, `Checkout`, `Address` |
| ۷ | Order | چرخهٔ عمر سفارش | `Order`, `OrderLine`, `Customer` |
| ۸ | Fulfillment | ارسال و مرجوعی | `Shipment`, `Fulfillment`, `TrackingEvent`, `Return`, `RMA` |
| ۹ | Payment | پرداخت مستقل از ارائه‌دهنده | `PaymentIntent`, `PaymentAttempt`, `Capture`, `Refund`, `ProviderEvent` |
| ۱۰ | Finance | پول مبتنی بر دفتر کل | `Account`, `Journal`, `JournalLine`, `TaxLine`, `Settlement`, `Reconciliation` |
| ۱۱ | CMS | صفحات و محتوا | `Page`, `PageRevision`, `Template`, `Pattern`, `AssetFolder` |
| ۱۲ | Builder | صفحه‌ساز آگاه از تجارت | `BlockDefinition`, `BlockInstanceSchema`, `Binding`, `DataSource` |
| ۱۳ | Theme | ران‌تایم سیستم طراحی | `Theme`, `ThemeRevision`, `Tokens`, `ComponentVariants` |
| ۱۴ | Clone / Fork | تکثیر فروشگاه و نسب | `CloneProfile`, `Snapshot`, `CloneManifest`, `Override`, `SyncJob` |
| ۱۵ | CRM / Support | عملیات مشتری | `Customer`, `Segment`, `Note`, `Ticket` |
| ۱۶ | Analytics / Search | هوش مشتق‌شده | `Event`, `Index`, `Dashboard` |
| ۱۷ | Platform | توسعه‌پذیری | `Plugin`, `App`, `Webhook`, `FeatureFlag`, `Job` |

**سلسله‌مراتب مستأجر:** `Platform → Organization (مستأجر) → Store A/B/فروشگاه فرزند → Storefront / Branch / Domain / تیم‌ونقش‌ها`. در نسخهٔ اول، مستأجرِ کسب‌وکار یک
Organization با یک یا چند Store است. `Branch` واحد مکان/انبار/واحد کسب‌وکار است
و **مرز امنیتی نیست**. حل دامنه: `Host → Domain → Storefront → Store → Tenant`
و نتیجه پیش از هر پرس‌وجو در context درخواست می‌نشیند.

**قواعد P0 منتخب:** هیچ پرس‌وجویی بدون context معتبر مستأجر؛ شمارِ حوادث
بین‌مستأجری = صفر؛ فروش بیش از موجودی ممنوع (رزرو اتمیک با TTL و تست همروندی
اجباری)؛ `resolvePrice(context)` قطعی با `PriceBreakdown` کامل و snapshot قیمت
در مرز checkout؛ invariant دفتر کل متوازن؛ ایندکس جست‌وجو حالت مشتق‌شده است.

---

## ۴. مرزبندی ماژول‌ها و قواعد ارتباط بین‌ماژولی

- **تنها راه ارتباط بین ماژول‌ها:** فرمان‌ها/پرس‌وجوهای لایهٔ Applicationِ
  ماژولِ مالک، یا **رویدادهای دامنه از طریق outbox تراکنشی**.
- **ممنوعیت مطلق:** import کردن repositoryهای ماژول دیگر یا کوئری مستقیم
  جدول‌های آن. این قاعده استخراج آیندهٔ ماژول به سرویس را «مکانیکی» نگه
  می‌دارد.
- سطح عمومی هر بستهٔ دامنه‌ای (`commerce`, `finance`, `auth`, `builder`,
  `theme`) فقط **barrel** است (`index.ts`)؛ import عمیق از بسته‌های دیگر نقض
  لینت است.
- کد مرجع/بیرونی فقط در **آداپتور**های پشت port ایزوله می‌شود (در
  `packages/infrastructure` یا بستهٔ آداپتور اختصاصی) تا جایگزینی بدون دست‌زدن
  به هسته ممکن باشد.
- هر وابستگی جدید نیازمند بازبینی مجوز/امنیت/نگه‌داری + ثبت در Reference
  Ledger (اطلس §37) + ADR در صورت بارِ معماری است. در فضاهای پول/دفتر کل،
  جداسازی مستأجر، auth/session و ماشین‌های حالت سفارش/پرداخت **هیچ‌چیز از
  مخازن مرجع کپی نمی‌شود**.
- قابلیت‌های برش‌عرضی: **Clone/Fork/وراثت** (مقادیر مؤثر =
  `ParentBase + ChildOverrides + LocalRuntimeContext` با وضعیت هر فیلد
  `inherited | overridden | detached`؛ وراثت فقط برای Theme، Template،
  Pattern، برخی Settings و Templateهای کاتالوگ — هرگز برای سفارش، پرداخت،
  دفتر کل یا دادهٔ مشتری)، **ماشین‌های حالت صریح** (سفارش، پرداخت، refunds،
  رزرو، مرجوعی، publish، clone)، و **outbox** برای هر جهشِ تغذیه‌کنندهٔ حالت
  مشتق (ایندکس جست‌وجو، وب‌هوک، ایمیل).

---

## ۵. چندمستأجری و استراتژی RLS

تهدید **T-01 (دسترسی بین‌مستأجری / IDOR) از نوع P0** است و سوئیت تست
بین‌مستأجریِ آن مانعِ انتشار است. جداسازی **دو لایهٔ اجباری** دارد:

| لایه | مکانیزم | محل |
| --- | --- | --- |
| ۱ — اصلی | نگهبان context مستأجر + repositoryهای tenant-scoped: هر پرس‌وجو `orgId` را از context احراز هویت می‌گیرد، هرگز از ورودی کلاینت | `packages/domain` (`assertTenantContext`, `requireSameTenant`)، `packages/application`، `packages/infrastructure` |
| ۲ — دفاع در عمق | Row-Level Security پیش‌فرض‌ممنوعِ PostgreSQL، کلید‌شده بر GUC محلیِ تراکنش | `packages/infrastructure/prisma/rls/*` + `runInTenantTransaction` |

کارکرد لایهٔ دوم:

1. هر جدولِ tenant-scoped یک `orgId` نرمال‌سازی‌نشده (denormalized) دارد.
2. `runInTenantTransaction(db, orgId, fn)` تراکنش را باز می‌کند و
   `set_config('app.tenant_id', $orgId, is_local => true)` را ست می‌کند؛ این
   تنظیم با عمر تراکنش می‌میرد و connection pool نشتش را نشت نمی‌دهد.
3. سیاست‌ها به شکل
   `USING ("orgId" = current_setting('app.tenant_id', true))`‌اند؛ GUC خالی
   یعنی **هیچ سطری برنمی‌گردد** (default deny).
4. `Organization` و `User` بیرون RLS‌اند (platform-scoped) و کنترلشان با لایهٔ
   کاربرد و roleهای رزرو است.

فایل‌های RLS در `packages/infrastructure/prisma/rls/` شماره‌دارند:
`001-tenant-rls.sql` تا `007-cms-rls.sql` طبق تغییرات مستند در
rls-strategy.md (جدول‌های W1 تا W7)، و `008-builder-theme-rls.sql` برای
جدول‌های builder/theme (W8) با همان الگو. ترتیب اعمال: ابتدا
`prisma migrate deploy`، سپس اسکریپت‌های RLS (idempotent).

**نقش‌ها و اتصال:**

- نقش مالک/migration (کاربر compose) فقط برای migration و bootstrap اسکریپت
  RLS — RLS را دور می‌زند.
- نقش اجرایی `finalshop_app` (NOLOGIN، حداقل‌دسترسی DML، مشمول RLS) — اپ باید
  با همین نقش متصل شود؛ اتصال با نقش مالک، لایهٔ ۲ را خاموش ولی بی‌سروصدا
  می‌کند.
- عملیات پلتفرمی (جست‌وجوی بین‌مستأجری، ابزار پشتیبانی): نقش صریح جداگانه +
  فرمان‌های audited؛ هرگز از مسیر اجرایی مستأجر.

**گیت تست:** سوئیت یکپارچه‌ای که با `finalshop_app` متصل می‌شود باید ثابت کند
(a) مستأجر فقط سطرهای خودش را می‌خواند، (b) نوشتن با `orgId` بیگانه در
`WITH CHECK` شکست می‌خورد، (c) GUC خالی صفر سطر برمی‌گرداند. استقرارهای
pool/serverless باید از transaction-mode pooling استفاده کنند.

---

## ۶. جریان داده: فرمان‌ها، پرس‌وجوها، رویدادها

```text
کلاینت/ادمین → Presentation (قرارداد تایپ‌شده)
  → فرمان Application: اعتبارسنجی Zod → نگهبان مجوز (requirePermission)
  → نگهبان مستأجر (assertTenantContext / requireSameTenant)
  → تراکنش runInTenantTransaction (ست GUC)
  → ناوری‌های Domain (ماشین‌های حالت، invariantها)
  → Repository (tenant-scoped) → PostgreSQL
  → رویداد AuditEvent (هر فرمان حساس یک رکورد)
  → رویداد Outbox (در همان تراکنش) → Worker → ایندکس/وب‌هوک/ایمیل
```

- **فرمان‌محوری:** هر جهش، فرمانی zod-validate‌شده، محافظت‌شده با مجوز،
  دارای نگهبان مستأجر و **audited** است (IAM-004: هر فرمان یک رویداد حسابرسی
  می‌نویسد؛ `buildAuditEvent`).
- **ایدمپوتنسی:** کلید ایدمپوتنسی روی POSTهای حساس (`IdempotencyRecord`) —
  replay درخواستِ تکمیل‌شده نتیجهٔ خودش را برمی‌گرداند، استفادهٔ مجدد از کلید
  با payload متفاوت رد می‌شود، تکرارِ در جریان علامت‌گذاری می‌شود (CHK-002).
  ایدمپوتنسی روی create/capture/refund الزامی است (T-11).
- **ماشین‌های حالت صریح:** سفارش (PENDING_PAYMENT → CONFIRMED/CANCELLED، سپس
  مراحل FULFILLING/PARTIALLY_FULFILLED/COMPLETED)، پرداخت، refund
  (REQUESTED → APPROVED → EXECUTED)، رزرو موجودی (ACTIVE/COMMITTED/RELEASED/
  EXPIRED)، مرجوعی (REQUESTED → APPROVED → RECEIVED → COMPLETED)، publish و
  clone — هرکدام با جدول گذار (`from[]`, `to`, `command`, `guard`,
  `sideEffects`, `auditEvent`).
- **مسیر پول:** پول با اعداد صحیح BigInt در واحدهای خرد (minor units) با
  رounding نیم‌به‌بالا (HALF_UP) و تخصیص largest-remainder و رجیستری ISO-4217
  (`packages/domain/money`)؛ **هرگز float**. refundها ≤ captured (per intent)
  و ثبت‌های دفترکلِ دوطرفه با Σ بدهکار = Σ بستانکار؛ بازگشت کالا به
  refundِ EXECUTED الزاماً گره می‌خورد. تسویه: خالص = ناخالص − کارمزد،
  تطبیق‌پذیری با گردش نقدی دفتر کل.
- **حالت مشتق:** ایندکس جست‌وجو (Meilisearch)، وب‌هوک‌ها و ایمیل‌ها فقط از
  رویدادهای outbox تغذیه می‌شوند؛ هیچ کشی منبعِ حقیقت قیمت/موجودی/پرداخت/
  دفتر کل نیست. Redis فقط کش/قفل/حالت گذرا.
- **کلون:** به‌طور پیش‌فرض دادهٔ مالی، سفارش‌ها، پرداخت‌ها، مشتریان و secretها
  **هرگز** کلون نمی‌شوند؛ پروفایل‌های کلون whitelist می‌کنند چه چیزی کپی شود
  (T-08).

---

## ۷. تصمیم‌های فناورانه (ADR-002)

| لایه | انتخاب | یادداشت |
| --- | --- | --- |
| زبان | TypeScript همه‌جا | strict؛ `tsconfig.base.json` مشترک |
| Web + Admin | Next.js (App Router, RSC) | ابتدا یک اپ با route groups؛ جداسازی فقط در صورت نیاز |
| مونوریپو | npm workspaces + Turborepo | npm چون shim پن‌ام روی ماشین‌های توسعه فعلی خراب است؛ جابه‌جایی بعدی ممکن است |
| UI | shadcn/ui + Radix Primitives | منبع یگانهٔ حقیقت design token در `packages/theme`؛ React Aria برای a11y پیچیده |
| Data fetching (کلاینت) | TanStack Query | صفحات عملیاتی/ادمین؛ در حد امکان RSC |
| اعتبارسنجی | Zod | مرز فرمان/پرس‌وجو، فرم‌ها، مانیفست افزونه‌ها |
| پایگاه‌داده | PostgreSQL (کانونی) + Prisma | Drizzle به‌عنوان جایگزین در W1، پیش از سخت‌شدن migrationها، ارزیابی شد |
| کش/صف | Redis + BullMQ | **فقط کش، قفل و حالت گذرا** — هرگز دادهٔ کانونی کسب‌وکار |
| جست‌وجو | Meilisearch | ایندکس مشتق‌شده از رویدادهای outbox؛ OpenSearch تا مقیاسِ لازم به تعویق افتاد |
| Workflow پایدار | Temporal — به تعویق افتاد | اول BullMQ؛ Temporal فقط با workflowهای جبرانی چندمرحله‌ای (W12+) |
| پرداخت | آداپتور مستقل از ارائه‌دهنده، Stripe اول | ایدمپوتنسی + inbox وب‌هوکِ امضاشده الزامی |
| پول | کرنل پول اعشاری داخلی | بدون ممیز شناور؛ dinero.js/currency.js فقط مرجع الگو |
| ایمیل | React Email + Resend | سرویس اعلانِ آداپتورمحور |
| تست | Vitest, Testing Library, MSW, Playwright, axe-core, k6 | گیت‌های سفرهای طلایی + بصری + a11y + بار |
| امنیت | OWASP ASVS، Semgrep, Gitleaks, Trivy | گیت‌های CI از W1 |
| رصد | OpenTelemetry + Sentry | همبستگی با requestId/tenantId/actorId/commandId/workflowId |

هستهٔ تجارتِ اختصاصی است: استفاده از Medusa/Saleor/Vendure به‌عنوان هستهٔ
کامرس و WordPress/Gutenberg به‌عنوان هستهٔ CMS **رد شده** — این‌ها فقط مرجع
الگو و مرزها هستند (اطلس §1 و §4).

---

## ۸. زیرساخت توسعه

`infra/docker/docker-compose.dev.yml` سرویس‌های دادهٔ محلی را بالا می‌آورد:

| سرویس | ایمیج | نقش |
| --- | --- | --- |
| PostgreSQL | `postgres:17-alpine` | پایگاه‌دادهٔ کانونی (میزبان RLS) |
| Redis | `redis:7-alpine` | کش/قفل/حالت گذرا + صف BullMQ |
| Meilisearch | `getmeili/meilisearch:v1.12` | ایندکس جست‌وجوی مشتق‌شده |
| MinIO | `minio/minio:latest` | object storage (مدیا/assetها) |

```bash
docker compose -f infra/docker/docker-compose.dev.yml up -d
npm install     # حل workspace (turbo + typescript در ریشه)
npm run build   # پایپ‌لاین build توربو
```

ابزارها: Node ≥ 20، npm 11 workspaces، Turborepo، TypeScript strict.
(طبق monorepo-structure.md، prisma migrationها از W1 در کنار
`packages/infrastructure` زندگی می‌کنند؛ `infra/observability/` برای
OpenTelemetry از W11+ برنامه‌ریزی شده است.)

---

## ۹. امنیت

**دارایی‌های محافظت‌شده (به ترتیب اهمیت):** ۱) جداسازی دادهٔ مستأجر — باارزش‌ترین
invariant؛ نشت آن پایان محصول است. ۲) یکپارچگی مالی. ۳) PII مشتری. ۴) یکپارچگی
محتوا (نسخه‌ها/rollback). ۵) secretهای پلتفرم (هرگز توسط clone کپی نمی‌شوند).

**مرزهای اعتماد:** اینترنت ← لبه (CDN/WAF) ← اپ‌های Next.js ← لایهٔ Application
← PostgreSQL/Redis/Storage؛ به‌همراه وب‌هوک ارائه‌دهندگان پرداخت، کاربران ادمین
مستأجر، افزونه‌های نصب‌شده و دستیارهای AI (فقط پیشنهاددهنده).

**تهدیدهای کلیدی از threat-model (۱۲ تهدید):**

| شناسه | تهدید | دفاع اصلی |
| --- | --- | --- |
| T-01 | دسترسی بین‌مستأجری (IDOR) — **P0** | نگهبان context + repoهای scoped + RLS؛ سوئیت تست بین‌مستأجری مانع انتشار |
| T-02 | حملات AuthN (session fixation, CSRF) | الگوهای کتابخانهٔ مدرن + چیت‌شیت‌های OWASP + بازبینی قبل از adoption |
| T-03 | جعل/replay وب‌هوک | امضا (HMAC-SHA256 + تلورانس زمان) + inbox ایدمپوتنت |
| T-04 | SSRF | allowlist خروج؛ هیچ URL خامِ کاربر در fetch سمت سرور |
| T-05 | XSS از مسیر تم/بلاک/CSS | فقط بلاک‌های schema-driven؛ CSS محدود و scoped؛ بدون تزریق HTML دلخواه |
| T-07 | Mass assignment | Zod در هر مرز + DTO صریح + مجوزِ field-scope |
| T-08 | نشت secret در کلون/سندباکس | secretها فقط در secret manager؛ پروفایل‌های کلون آن‌ها را حذف می‌کنند |
| T-11 | شکست invariant مالی | کلید ایدمپوتنسی + دفتر کل متوازن + حسابرسی + reconciliation + تست همروندی |
| T-12 | افراط AI | AI پیشنهاد می‌دهد، انسان تأیید می‌کند؛ مرز تأیید روی فرمان‌های حساس |

(فهرست کامل شامل T-06 open redirect، T-09 افراط افزونه، T-10 سوءاستفاده/DoS
است — به threat-model مراجعه کنید.)

**گیت‌های امنیتی CI:** Semgrep (قواعد اختصاصی دامنهٔ tenant-scope و پول)،
Gitleaks (pre-commit + CI)، Trivy + Renovate، تست مجوز برای مسیر authz هر
فرمان، بازبینی چک‌لیست OWASP ASVS در هر انتشار، و break-glass کوتاه‌مدتِ
کاملاً audited.

**رمزنگاری پول:** تمام مقادیر مالی با **BigInt در واحدهای خرد** (مثلاً سنت/ریال)
نمایش داده می‌شوند (`packages/domain/money`)؛ تبدیل/تخصیص با HALF_UP و
largest-remainder؛ رجیستری ISO-4217 برای اعشار ارزها؛ **ممنوعیت مطلق float و
`Number`** در مسیر پول؛ ثبت‌های دفتر کل همیشه متوازن و exactly-once per intent.

---

## ۱۰. وضعیت فعلی موج‌ها

| موج | محور | وضعیت |
| --- | --- | --- |
| W0 | چشم‌انداز، ADRها، threat model، نقشهٔ دامنه | بسته ✅ |
| W1 | هستهٔ پلتفرم: Tenant/Org/Store/IAM/RBAC | بسته ✅ (کرنل) |
| W2 | کرنل کامرس: catalog/product/variant | بسته ✅ (کرنل) |
| W3 | موتور قیمت‌گذاری + رزرو موجودی | بسته ✅ (کرنل) |
| W4 | سبد + ماشین حالت checkout + سفارش‌ها | بسته ✅ (کرنل) |
| W5 | پرداخت + مالیات + دفتر کل | بسته ✅ (کرنل) |
| W6 | fulfillment + مرجوعی | بسته ✅ (کرنل) |
| W7 | هستهٔ CMS (صفحات، revisions, media) | بسته ✅ (کرنل) |
| W8 | تم + صفحه‌ساز (بلاک‌ها، inspector) | **نیمه‌کاره** 🚧 |
| W9–W16 | Clone/Fork، ERP، جست‌وجو/SEO، Analytics، افزونه‌ها، هاردنینگ، انتشار | برنامه‌ریزی‌شده |

**وضعیت دقیق W8:** کد کرنل builder/theme در هر سه لایهٔ اصلی موجود است —
`packages/domain/src/builder` (رجیستری بلاک/سکشن + اعتبارسنجی + توصیفگرهای
inspector) و `packages/domain/src/theme` (توکن‌ها)، فرمان‌ها و portها در
`packages/application` (`builder-theme-commands.ts`, `builder-theme-ports.ts`)،
مخازن در `packages/infrastructure` (`builder-theme-repositories.ts`) و فایل
`packages/infrastructure/prisma/rls/008-builder-theme-rls.sql` روی دیسک هست؛
اما اقلام TASKS.md برای W8 (BLD-001…005، THEME-001…002) هنوز تیک نخورده‌اند و
موج بسته نشده است — بستن موج مستلزم شواهد کامل (migration + تست‌ها + امنیت +
راستی‌آزمایی اجرا) است.

**هشدارهای وضعیت فعلی:**

- `apps/web`، `apps/admin`، `apps/worker` **جای‌گاه خالی**‌اند (فقط
  package.json) — هنوز اپ Next.js وجود ندارد.
- `packages/infrastructure/prisma/migrations/` **هنوز وجود ندارد** — migration
  پایهٔ Prisma در انتظار است؛ فقط `schema.prisma` و اسکریپت‌های `rls/*.sql`
  موجودند.
- بسته‌های ریشه‌ای `i18n`، `builder`، `commerce`، `config`، `finance`،
  `theme`، `ui` **placeholder**اند، مگر جایی که کد معادل در `packages/domain`
  (شامل ماژول‌های `builder/` و `theme/`) و لایه‌های application/
  infrastructure موجود است.
- اقلام باز مجاورِ کرنل (از TASKS.md): اتصال ارائه‌دهندهٔ auth (sessionهای
  تغذیه‌کنندهٔ context مستأجر)، تحمیل مرزها با ESLint، تأیید دامنه با
  DNS-token، آداپتور Stripe، مدل‌های Customer/Channel، سیم‌کشی scheduler
  worker، E2E سطح مرورگر.

موج‌ها با «وابستگی‌ها» بسته می‌شوند، نه با صفحه‌های UI؛ هر بستنِ موج فقط با
شواهد کامل: migration + تست + E2E + دسترس‌پذیری + امنیت + راستی‌آزمایی اجرا.
«کامپایل می‌شود» یا «رندر می‌شود» یعنی «تمام‌شده» نیست.
