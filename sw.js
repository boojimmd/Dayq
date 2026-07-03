/* sw.js — Service Worker برای DayQ
   فقط یک کار دارد: وقتی پیام Push رسید، نشانش بده.
   هیچ کش/آفلاینی اینجا نیست — آن منطق در خود صفحهٔ اصلی DayQ است. */

self.addEventListener('push', (event) => {
  let data = { title: 'DayQ', body: 'یادآوری' };
  try { data = event.data.json(); } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'DayQ', {
      body: data.body || '',
      tag: 'dayq-reminder-' + Date.now(),
      requireInteraction: true,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const c of clients) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ── Web Share Target ──
   وقتی کاربر از اپ دیگری متن یا لینکی share می‌کند،
   مرورگر یک GET به index.html?share_text=... می‌فرستد.
   SW مطمئن می‌شود پنجرهٔ DayQ باز و focus شود. */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const hasShareParams =
    url.searchParams.has('share_text') ||
    url.searchParams.has('share_title') ||
    url.searchParams.has('share_url');

  if (!hasShareParams) return; // درخواست‌های عادی را رد کن

  event.respondWith(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // اگر پنجرهٔ DayQ باز است، همان را focus کن
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          // پارامترها را به پنجره بفرست
          client.postMessage({
            type: 'SHARE_TARGET',
            title: url.searchParams.get('share_title') || '',
            text:  url.searchParams.get('share_text')  || '',
            url:   url.searchParams.get('share_url')   || '',
          });
          return Response.redirect('./index.html', 302);
        }
      }
      // پنجره باز نیست — باز کن با URL کامل تا app خودش بخواند
      return Response.redirect(url.pathname + url.search, 302);
    })
  );
});
