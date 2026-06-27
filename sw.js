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
