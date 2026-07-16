# DayQ — مدیریت روزانه فارسی

> اپ آفلاین برای برنامه‌ریزی روزانه با تقویم شمسی و NLP فارسی

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-boojimmd.github.io%2FDayq-00b87a?style=for-the-badge)](https://boojimmd.github.io/Dayq/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5a2d82?style=for-the-badge)](https://boojimmd.github.io/Dayq/)

**تک‌فایل HTML · بدون نصب · بدون اکانت · کاملاً آفلاین**

---

## ✨ NLP فارسی — ویژگی اصلی

متن آزاد فارسی رو تشخیص می‌ده:

```
ویزیت دکتر رضایی فردا ساعت ۱۰ !فوری
→  task: ویزیت دکتر رضایی  |  فردا  |  ۱۰:۰۰  |  اولویت: فوری

جلسه تیم سه‌شنبه ۱۵ مرداد #کاری
→  task با deadline، پروژه کاری

خرید هفتگی شنبه صبح !کم
→  task با روز هفته، اولویت پایین
```

---

## 👥 برای چه کسانی

- **کاربر روزمره** — لیست کار، تقویم شمسی، یادآوری تولد، مناسبت
- **کاربر آفیس** — task مشترک، پروژه، sync چنددستگاهی، گزارش
- **مدرپ و بازاریاب میدانی** — برنامه‌ریزی ویزیت، تولد مشتریان، روزهای آگاهی پزشکی

---

## 🚀 نصب

**iOS:** Safari → [boojimmd.github.io/Dayq](https://boojimmd.github.io/Dayq/) → Share → Add to Home Screen

**Android:** Chrome پیشنهاد نصب می‌ده — یا منو → Install App

بعد از نصب **کاملاً آفلاین** کار می‌کنه.

---

## 📋 ویژگی‌ها

| ویژگی | توضیح |
|---|---|
| **NLP فارسی** | تشخیص تاریخ شمسی، ساعت، اولویت از متن آزاد |
| **تقویم شمسی** | ماهانه/هفتگی/فهرست با تعطیلات رسمی |
| **پروژه‌ها** | دسته‌بندی task با نشانگر پیشرفت |
| **مناسبت‌ها** | تولد، سالگرد، یادآوری چند بازه‌ای |
| **همگام‌سازی** | با کد ۶ رقمی، بدون اکانت |
| **Push notification** | یادآوری واقعی روی گوشی |
| **آینه روز** | خلاصه و یادداشت روزانه |
| **Focus Mode** | تایمر روی یک task |
| **رابط دسکتاپ** | layout کامل برای لپ‌تاپ |
| **APK اندروید** | نصب از فایل APK |

---

## 🛠 تکنولوژی

- **Vanilla JS + HTML + CSS** — بدون framework
- **الگوریتم Borkowski** — تقویم جلالی دقیق
- **NLP فارسی** — از صفر، بدون کتابخانه
- **Cloudflare Workers** — sync و Push backend
- **Capacitor** — APK اندروید

---

## 📁 ساختار

```
DayQ.html       ← اپ کامل (single file)
sw.js           ← Service Worker
manifest.json   ← PWA manifest
worker/         ← Cloudflare Worker
test_dayq.js    ← تست Playwright
```

---

## 🧪 تست

```bash
npm install playwright
node test_dayq.js
```

---

## APK اندروید

👉 [github.com/boojimmd/dayq-apk](https://github.com/boojimmd/dayq-apk)

---

## 📝 مجوز

MIT
