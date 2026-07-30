# DESIGN.md — DayQ PWA (+ Soko Team Layer)

> نسخه: 1.0 | آخرین بروزرسانی: مرداد ۱۴۰۵
> این فایل context کامل design system DayQ است برای AI agent.
> در هر session پیست کن تا agent با token‌های موجود کار کند نه hardcode.

---

## ۱. هویت و اصول

**محصول:** DayQ — تسک منیجر شخصی فارسی (PWA) با لایه تیمی (Soko)  
**مخاطب:** مدرپ‌های فارمسوتیکال + مدیران فروش ایرانی  
**جهت متن:** RTL (فارسی) — همیشه. هیچ‌گاه LTR برای محتوا ندهید.  
**فونت:** Vazirmatn — جایگزین هیچ فونت دیگری نکن.  
**پلتفرم:** PWA موبایل-اول (max-width: 430px) + دسکتاپ responsive ≥900px  
**تم:** ۱۱ تم رنگی (dark/light/pink/natural/blue/forest/sunset/cyber/royal/sand/ice)

### اصول طراحی
1. **Invisible intelligence** — هوشمندی باید حس شود، نه دیده.
2. **Persian-first** — هر تصمیم برای RTL فارسی اتخاذ شود.
3. **Mobile-first** — ابتدا ۳۹۰px، سپس desktop.
4. **Token یا هیچ** — هیچ hardcode color/size/radius بدون token.
5. **Motion = information** — انیمیشن decorative ممنوع. هر motion باید معنی داشته باشد.

---

## ۲. Color Tokens

```css
/* ── Accent (primary action) ── */
--a:    #00b87a   /* تنها رنگ primary action — فقط برای یک action اصلی per screen */
--a2:   #009060   /* accent pressed/darker */
--am:   rgba(0,184,122,.12)   /* accent muted background */
--ag:   rgba(0,184,122,.28)   /* accent glow/border */

/* ── Backgrounds ── */
--bg0:  #f0f4f8   /* app background (خارج از card) */
--bg1:  #fff      /* card / sheet surface */
--bg2:  #edf1f7   /* secondary surface / input bg */
--bg3:  #e2e8f0   /* tertiary surface */
--bg4:  #cdd5e0   /* dividers / separators */

/* ── Text ── */
--t1:  #111827    /* primary text — headings, labels */
--t2:  #4b5563    /* secondary text — metadata */
--t3:  #9ca3af    /* tertiary text — placeholder, hint */
--t4:  #d1d5db    /* disabled text */

/* ── Borders ── */
--b1:  rgba(0,0,0,.07)   /* primary border */
--b2:  rgba(0,0,0,.04)   /* subtle border */
--b3:  rgba(0,0,0,.02)   /* ghost border */

/* ── Semantic ── */
--red:   #e53e5a    --redm:  rgba(229,62,90,.11)
--amber: #d97706    --ambm:  rgba(217,119,6,.11)
--blue:  #2563eb    --bluem: rgba(37,99,235,.10)
/* green از --a استفاده کن — رنگ جداگانه نساز */
```

### قوانین رنگ
- `--a` فقط برای یک primary action per screen (دکمه save، confirm)
- `--red` برای overdue، خطا، حذف — نه decoration
- `--amber` برای warning، deadline نزدیک
- `--blue` برای لینک، info، sync state
- هیچ‌گاه gradient روی متن یا دکمه اصلی

---

## ۳. Typography

```css
--f: 'Vazirmatn', system-ui, sans-serif   /* تنها font stack */

/* Scale — همیشه از token استفاده کن، هرگز px مستقیم */
--fs-2xs: 0.60rem   /* ۹.۶px — timestamp، badge count */
--fs-xs:  0.68rem   /* ۱۰.۹px — metadata، chip label */
--fs-sm:  0.78rem   /* ۱۲.۵px — body text، task text */
--fs-md:  0.86rem   /* ۱۳.۸px — card title، button */
--fs-lg:  0.96rem   /* ۱۵.۴px — section header */
--fs-xl:  1.10rem   /* ۱۷.۶px — page title */
--fs-2xl: 1.35rem   /* ۲۱.۶px — hero number، stat */
```

### قوانین تایپوگرافی
- **هرگز** `font-size: Npx` در Soko یا component جدید — فقط `var(--fs-*)`
- `html { font-size: 93.75% }` — تغییر نده (scales با browser font settings)
- وزن‌های مجاز: 400، 500، 600، 700، 800، 900
- `line-height: 1.5` برای body text، `line-height: 1.2` برای headings، `line-height: 1` فقط برای عدد/آمار single-line
- متن فارسی نیاز به `line-height ≥ 1.4` دارد — هرگز کمتر برای multi-line

---

## ۴. Spacing

```css
/* Grid پایه: 4px */
--sp1: 4px    /* micro gap — icon از label */
--sp2: 8px    /* tight — chip internal padding */
--sp3: 12px   /* compact — card internal */
--sp4: 16px   /* base — standard padding */
--sp5: 24px   /* loose — section gap */
--sp6: 32px   /* spacious — between sections */
```

### قوانین spacing
- همیشه از `var(--sp*)` — هیچ magic number
- Soko panel padding: `--sp4` horizontal، `--sp3` vertical
- Sheet body: `padding: 13px 18px 28px`
- Card internal: `padding: var(--sp3) var(--sp4)`

---

## ۵. Border Radius

```css
--r1: 8px    /* کوچک — badge، chip کوچک */
--r2: 12px   /* متوسط — input، button، card فرعی */
--r3: 16px   /* بزرگ — card اصلی، modal body */
--r4: 22px   /* خیلی بزرگ — sheet rounded top */
--r5: 99px   /* pill — tag، status badge */
```

### قوانین radius
- `--r4 --r4 0 0` برای sheet/bottom-drawer (هرگز `24px 24px 0 0`)
- `50%` فقط برای avatar/icon دایره‌ای
- هیچ‌گاه `9999px` یا `999px` — از `--r5` استفاده کن

---

## ۶. Motion System

```css
/* Timing */
--dur-fast: 150ms   /* micro interaction — button press، checkbox */
--dur-base: 220ms   /* standard transition — sheet open، tab switch */
--dur-slow: 320ms   /* complex — page transition، panel slide */

/* Easing */
--ease:     cubic-bezier(.4, 0, .2, 1)     /* material standard */
--ease-out: cubic-bezier(.23, 1, .32, 1)   /* decelerate — element enters */
--ease-in:  cubic-bezier(.4, 0, 1, 1)      /* accelerate — element exits */
--ease-std: cubic-bezier(.42, 0, .58, 1)   /* symmetric — hover، toggle */
--spring:   cubic-bezier(.34, 1.2, .64, 1) /* slight overshoot — page transition */
--spring-sm:cubic-bezier(.34, 1.3, .64, 1) /* mini spring — chip، badge */
```

### قوانین motion
- `--spring` فقط برای page transition و primary action confirmation
- `--ease-out` برای هر چیز که وارد صفحه می‌شود
- `--ease-in` برای هر چیز که از صفحه خارج می‌شود
- هیچ‌گاه `transition: all` — همیشه property مشخص
- `prefers-reduced-motion` در هر animation جدید چک شود

---

## ۷. Layout — App Shell

```
┌─────────────── topbar (fixed، top) ────────────────┐
│ max-width:430px، padding-top: safe-area-inset-top  │
├────────────────────────────────────────────────────┤
│                                                    │
│  .page (position:absolute, scrollable)             │
│  padding: topbar-h → nav-h                        │
│                                                    │
├─────────────────── nav (fixed، bottom) ────────────┤
│ --nav-h: 54px + safe-area-inset-bottom            │
└────────────────────────────────────────────────────┘
```

### Desktop ≥900px
```
┌──── nav (right، fixed، 220px) ────┐
│                                   │
│  .page { margin-right: 220px }   │
│  position: static                 │
│                                   │
└───────────────────────────────────┘
```

### قوانین layout
- همه صفحات از `.page` class استفاده می‌کنند
- صفحه active: `.page.active { display:block; animation: pIn var(--spring) }`
- Sheet: `position:fixed; bottom:0; max-width:430px; translateY(100%)` by default
- **هرگز** overflow: hidden بدون ellipsis روی text element

---

## ۸. Pages

| ID | نام | محتوا |
|----|-----|-------|
| `pageHome` | خانه | تسک‌های امروز، quick add |
| `pageTitle` | تسک‌ها | همه تسک‌ها، فیلتر |
| `pageProjects` | پروژه‌ها | پروژه‌ها + تسک‌های هر پروژه |
| `pageCalendar` | تقویم | ماهانه/هفتگی/فهرست + sidebar |
| `pageBirthdays` | مناسبت | سالگردها و مناسبت‌های شخصی |

---

## ۹. Task Schema

```javascript
{
  id: 't' + Date.now() + random,
  text: string,           // عنوان تسک
  iconId: string,         // از ICONS array
  cat: string,            // category key
  time: string | null,    // 'HH:MM'
  priority: 'low' | 'normal' | 'med' | 'high' | 'urgent',
  status: 'todo' | 'doing' | 'done',
  done: boolean,
  deadline: 'YYYY-MM-DD', // Jalali
  projectId: string | null,
  recur: 'none' | 'daily' | 'weekly' | 'monthly',
  recurBase: string | null, // Jalali date
  recurParentId: string | null
}
```

### قوانین Task
- `deadline` همیشه Jalali format: `'1405-05-08'`
- `recur !== 'none'` → اگه instance ناتمام وجود داشت، instance جدید نساز (carry-forward)
- priority رنگ: `urgent`=red، `high`=red، `med`=amber، `normal`=accent، `low`=t3

---

## ۱۰. Components

### Task Card (`.tc-card`)
```
┌─────────────────────────────────────────┐
│ [icon] [text]              [checkbox]   │ ← RTL
│        [cat chip] [time] [deadline]    │
└─────────────────────────────────────────┘
```
- `border-radius: var(--r3)`
- `background: var(--bg1)`
- `border: 1px solid var(--b1)`
- Swipe right → done | Swipe left → delete
- Overdue deadline: `color: var(--red)`
- Priority indicator: colored dot سمت چپ (RTL)

### Sheet / Bottom Drawer (`.sheet`)
```css
position: fixed; bottom: 0; left: 50%;
transform: translateX(-50%) translateY(100%);
width: 100%; max-width: 430px;
border-radius: var(--r4) var(--r4) 0 0;
background: var(--bg1);
```
- `sh-handle` → drag indicator در بالا
- `sh-head` → header با title + close button
- `sh-body` → content، `overflow-y: auto`
- `sh-sub` → primary action button در پایین

### Button (`.tm-btn`)
```css
height: 36px; min-width: 60px;
padding: 0 var(--sp3);
border-radius: var(--r2);
font-size: var(--fs-sm); font-weight: 600;
transition: background var(--dur-fast), transform var(--dur-fast);
```
- `.primary` → `background: var(--a); color: white`
- Default → `border: 1px solid var(--b1); background: var(--bg2)`
- `:active` → `transform: scale(.95)`
- Touch target حداقل: `36px` (ترجیحاً ۴۴px برای اصلی‌ها)

### Nav Bar (`.nav`)
```
5 tab: [من] [تسک‌ها] [+افزودن] [تقویم] [خانه]
position: fixed; bottom: 0
```
- Active tab: `color: var(--a)`
- Plus button: `background: var(--a); border-radius: 50%`

---

## ۱۱. Soko — Team Layer

### Architecture
```
مدیر ─── Worker (Cloudflare) ─── KV Store
            │
         کارمند
```

### Soko Panel (`.tm-panel`)
```
position: fixed; inset: 0;
right: 220px (desktop);
background: var(--bg1);
z-index: 1000;
```
- باز شدن: `translateX(100%) → translateX(0)` با `--dur-slow --ease-out`
- تب‌ها: status / گزارش / پروژه‌ها

### Member Card
```
┌──────────────────────────────────────┐
│ [نام]              [نقش]             │ ← RTL
│ [N تسک] [وضعیت]                     │
│ [+ تسک] [📋 تسک‌ها] [💬]            │
└──────────────────────────────────────┘
```

### Task Assign Sheet (`#shTmAssign`)
- فیلدهای required: `title`، `deadline`، `assignedTo`
- priority: انتخاب از `low|normal|high|urgent`
- broadcast toggle برای ارسال به همه

### Soko Sheets
| Sheet | کاربرد |
|-------|--------|
| `shTmChoice` | انتخاب: ساخت تیم یا join |
| `shTmCreate` | ساخت تیم جدید |
| `shTmJoin` | join با کد |
| `shTmInfo` | اطلاعات تیم + member management |
| `shTmAssign` | assign تسک |
| `shTmPending` | درخواست‌های عضویت |
| `shTeamTaskDetail` | جزئیات تسک (کارمند) |
| `shTaskThread` | comment thread (مدیر) |
| `shTmAnnounce` | اعلان تیمی |

---

## ۱۲. RTL Rules

```css
/* همیشه */
direction: rtl;
font-family: 'Vazirmatn', system-ui, sans-serif;

/* برای input های کد/عدد */
direction: ltr; /* فقط برای: کد تیم، PIN، timestamp */
text-align: right;

/* Margin/Padding در RTL */
/* استفاده از logical properties ترجیح داده می‌شود */
margin-inline-start: X  /* به جای margin-right */
margin-inline-end: X    /* به جای margin-left */
```

### قوانین RTL
- `text-align: right` default — `text-align: center` فقط برای UI element (badge، button)
- `text-align: left` ممنوع برای محتوای فارسی
- فلش‌ها و iconها باید در context RTL flip شوند (chevron-right → به چپ اشاره کند)
- تاریخ Jalali: همیشه با `mrToJalali()` convert کن

---

## ۱۳. Accessibility

```css
/* Focus visible — اضافه شده */
.tm-*:focus-visible,
.sh-sub:focus-visible,
button:focus-visible {
  outline: 2px solid var(--a);
  outline-offset: 2px;
}
```

### قوانین Accessibility
- Touch target حداقل: 36px (ترجیحاً 44px)
- هیچ action مهمی فقط با gesture — باید fallback button داشته باشد
- Error state: `color: var(--red)` + text message — نه فقط رنگ
- Placeholder color: `var(--t4)` (نه `var(--t3)` — خیلی تاریک)
- هر input مهم `required` attribute داشته باشد

---

## ۱۴. Calendar

### Structure
```
#pageCalendar.page.active (desktop: display:grid; grid-template-columns:1fr 280px)
  ├── .cal-page (column 1: grid-column:1)
  │     ├── .cal-page-top (header + nav)
  │     ├── .cal-view-toggle (ماهانه/هفتگی/فهرست)
  │     ├── #calTeamFilter (فیلتر تیمی، hidden by default)
  │     ├── #monthViewWrap (grid-column:1; grid-row:2)
  │     ├── #weekView (display:none by default)
  │     └── #calListView (display:none by default)
  └── #calDayPanelDesktop (column 2: position:fixed; left:0; width:280px)
```

### Holiday Rendering
- جمعه‌ها: `is-friday` class → `color: var(--red)`
- تعطیلات رسمی: `is-holiday` class → background کمرنگ + نام تعطیل
- `dateKey` format: `'YYYY-MM-DD'` Jalali

---

## ۱۵. Do / Don't

### ✅ Do
- از `var(--sp*)` برای همه spacing
- از `var(--fs-*)` برای همه font-size
- از `var(--r*)` برای border-radius
- `:focus-visible` برای همه interactive element
- `try/catch` برای همه `tmAPI` call
- `required` برای input‌های اجباری
- Persian text با Vazirmatn
- Jalali date با `mrToJalali()`

### ❌ Don't
- **هرگز** `transition: all` → فقط property مشخص
- **هرگز** gradient text یا gradient روی button اصلی
- **هرگز** `font-size: Npx` در component جدید
- **هرگز** `border-radius: 24px` → از `var(--r4)` استفاده کن
- **هرگز** `hardcode color` → همیشه از `var(--*)` token
- **هرگز** `text-align: left` برای محتوای فارسی
- **هرگز** `direction: ltr` بدون دلیل صریح
- **هرگز** `!important` در component جدید
- **هرگز** nested cards
- **هرگز** AI purple/violet gradient

---

## ۱۶. Theme System

```javascript
// 11 themes — همه از CSS data-theme attribute
['dark','light','pink','natural','blue','forest','sunset','cyber','royal','sand','ice']

// هر theme فقط color tokens را override می‌کند
// spacing, motion, radius ثابت می‌مانند
```

---

## ۱۷. API / Worker

```
Base URL: tm.workerUrl (از localStorage)
Auth: X-DayQ-Token header
Format: JSON

Key endpoints:
POST /team/create    → { teamCode, token, managerUuid }
POST /team/join      → { memberUuid, status:'pending' }
GET  /team/pending   → { pending: [...] }     [manager only]
POST /team/approve   → { status: 'approved' } [manager only]
POST /team/login     → { token, role, uuid }
POST /task/assign    → { taskId }             [manager only]
GET  /task/inbox     → { tasks: [...] }
GET  /task/member?uuid=X → { tasks: [...] }  [manager only]
PUT  /task/update    → { ok: true }
GET  /team/snapshot  → { members: [...] }     [manager only]
POST /task/comment   → { ok: true }
GET  /report/weekly  → { members: [...] }     [manager only]
```

---

*این فایل از CSS tokens و HTML structure پروژه DayQ استخراج شده — مرداد ۱۴۰۵*
