/* sw.js — Service Worker برای DayQ */

const APP_URL = '/Dayq/';

self.addEventListener('push', (event) => {
  let data = { title: 'DayQ', body: 'یادآوری', url: APP_URL };
  try { data = { ...data, ...event.data.json() }; } catch (e) {}

  event.waitUntil(
    self.registration.showNotification(data.title || 'DayQ', {
      body: data.body || '',
      tag: data.tag || 'dayq-' + Date.now(),
      requireInteraction: true,
      data: { url: data.url || APP_URL, extra: data.data || {} },
      icon: '/Dayq/icon-192.png',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : APP_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // اگر تب باز هست، focus کن
      for (const c of clients) {
        if (c.url.includes('/Dayq') && 'focus' in c) {
          c.postMessage({ type: 'NOTIF_CLICK', url: targetUrl, data: event.notification.data?.extra || {} });
          return c.focus();
        }
      }
      // تب باز نیست — باز کن
      return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

/* ── Web Share Target ── */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const hasShareParams =
    url.searchParams.has('share_text') ||
    url.searchParams.has('share_title') ||
    url.searchParams.has('share_url');

  if (!hasShareParams) return;

  event.respondWith(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      for (const client of clients) {
        if ('focus' in client) {
          client.focus();
          client.postMessage({
            type: 'SHARE_TARGET',
            title: url.searchParams.get('share_title') || '',
            text:  url.searchParams.get('share_text')  || '',
            url:   url.searchParams.get('share_url')   || '',
          });
          return Response.redirect(APP_URL, 302);
        }
      }
      return Response.redirect(APP_URL + url.search, 302);
    })
  );
});
