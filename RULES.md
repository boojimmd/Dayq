# DayQ — قوانین تغییر کد

> هر بار که یک قانون نقض شد، اپ freeze شد یا crash کرد.
> این فایل باید قبل از هر push مرور بشه.

---

## ① CSS — خطرناک‌ترین لایه

### ممنوع مطلق (freeze ایجاد میکنن)
```css
/* ❌ layout property بدون media query */
.some-page { display: grid; grid-template-columns: 1fr 280px; }

/* ❌ height:auto روی element داخل CSS grid */
.grid-child { min-height: auto; height: auto; }

/* ❌ void offsetWidth در JS (forced reflow روی DOM بزرگ) */
void element.offsetWidth;

/* ❌ animation fill:both روی page یا container اصلی */
.page.active { animation: pIn 0.3s ease both; }
```

### درست
```css
/* ✅ mobile-first، desktop در media query */
.some-page { display: block; }
@media(min-width:900px) {
  .some-page { display: grid; grid-template-columns: 1fr 280px; }
}

/* ✅ animation فقط با forwards */
.page.active { animation: pIn 0.26s var(--spring) forwards; }
```

### قوانین CSS
- رنگ، font، border → آزاد (کم‌ریسک)
- هر `display`, `height`, `overflow`, `grid`, `position` → media query لازم داره
- `!important` جدید → فقط با دلیل documented
- همیشه از CSS tokens استفاده کن: `var(--r2)` نه `12px`

---

## ② JS — boot() ممنوع‌الورود

### boot() هرگز لمس نشه مگر:
- یه bug واضح در boot خودش باشه
- تغییر حداکثر ۵ خط
- قبل و بعد test شده باشه

### ممنوع در boot
```javascript
// ❌ goPage() در boot — page cycle conflict
goPage('Home');

// ❌ forced reflow
void element.offsetWidth;

// ❌ setInterval جدید در boot
setInterval(someFn, interval);

// ❌ اضافه کردن event listener بدون بررسی duplicate
qi.addEventListener('keydown', handler); // اگه دوبار run بشه double میشه
```

### قوانین JS
- هر function جدید → try/catch داشته باشه اگه async هست
- هر IDB operation → `.catch()` داشته باشه
- هر `localStorage.setItem` → داخل try/catch
- setTimeout های boot → حداکثر ۳ تا

---

## ③ HTML/Structure

### صفحه‌ها
- هر page جدید → داخل `<div class="page" id="pageXxx">` باشه
- هر sheet → `sh-handle + sh-head + sh-body` داشته باشه
- هر modal → card container داخل overlay داشته باشه (نه مستقیم روی overlay)

### ممنوع
```html
<!-- ❌ style inline طولانی -->
<div style="display:flex;flex-direction:column;gap:8px;padding:16px;...">

<!-- ✅ class استفاده کن -->
<div class="sh-body">
```

---

## ④ قوانین Push

### هر push یک لایه
```
یک commit = یک نوع تغییر
css:  → فقط CSS، هیچ JS
js:   → فقط JS منطق، هیچ CSS
fix:  → bug fix، حداکثر ۱۵ خط تغییر
feat: → feature جدید، جداگانه test شده
```

### قبل از push چک‌لیست
- [ ] فقط یک لایه تغییر داده شده؟
- [ ] CSS grid/display → media query داره؟
- [ ] animation → `forwards` نه `both`؟
- [ ] boot() دست نخورده؟
- [ ] تغییر روی موبایل ≤900px هم منطقی‌ه؟

---

## ⑤ لایه‌های ریسک

| لایه | ریسک | احتیاط |
|------|------|---------|
| CSS color/font/border | 🟢 کم | آزاد |
| CSS spacing/padding | 🟢 کم | آزاد |
| CSS display/grid/height | 🔴 بالا | media query اجباری |
| CSS animation | 🟡 متوسط | forwards نه both |
| JS renderTasks() | 🟡 متوسط | تست با data خالی |
| JS boot() | 🔴 بالا | حداکثر ۵ خط تغییر |
| JS goPage() | 🔴 بالا | side effect زیاد |
| HTML page structure | 🟡 متوسط | depth counting قبل/بعد |

---

## ⑥ commit‌های stable برای revert

| commit | وضعیت | توضیح |
|--------|--------|-------|
| `552ca7539c` | ✅ stable | قبل از UI changes |
| `7bf36b7164` | ✅ stable | early session reference |

---

## ⑦ باگ‌های شناخته‌شده (رفع نشده)

- **duplicate boot()**: دو بار صدا زده میشه — هنوز resolve نشده، comment workaround هست
- **tasks نمایش نمیدن**: اگه localStorage خالی بود و IDB نبود → ممکنه blank بشه
- **iOS Safari overflow:hidden**: هر `position:fixed` داخل overflow:hidden container — از nav گرفته شده

---

*آخرین بروزرسانی: session 2026-08-29*
