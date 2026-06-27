/* ══════════════════════════════════════════════════════════
   DayQ Reminder Push Worker
   روی Cloudflare Workers اجرا می‌شود — بدون هیچ بسته npm جدا،
   فقط با Web Crypto API خودِ Workers (چون نود.جی‌اس اینجا نیست)

   ENV های لازم (در پنل Cloudflare، Settings → Variables):
   - VAPID_PUBLIC_KEY   (رشتهٔ تولیدشده با web-push)
   - VAPID_PRIVATE_KEY  (رشتهٔ تولیدشده با web-push — این یکی Secret باشد)
   - VAPID_SUBJECT      (مثلاً mailto:you@example.com)

   KV لازم (در پنل Cloudflare، Settings → Bindings):
   - نام binding: DAYQ_KV
   ══════════════════════════════════════════════════════════ */

// ---------- ابزارهای پایه: base64url <-> bytes ----------
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrs) {
  const len = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ---------- VAPID: امضای JWT با کلید خصوصی P-256 ----------
async function buildVapidHeader(endpoint, publicKeyB64, privateKeyB64, subject) {
  const url = new URL(endpoint);
  const aud = url.origin;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp, sub: subject };
  const enc = (obj) => bytesToB64url(new TextEncoder().encode(JSON.stringify(obj)));
  const unsigned = enc(header) + '.' + enc(payload);

  const pkcs8 = pkcs8FromRawPrivate(b64urlToBytes(privateKeyB64), b64urlToBytes(publicKeyB64));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sigDer = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
  // Web Crypto برای ECDSA، امضای raw (r||s) برمی‌گرداند — همان چیزی که JWT لازم دارد
  const jwt = unsigned + '.' + bytesToB64url(new Uint8Array(sigDer));

  return {
    Authorization: `vapid t=${jwt}, k=${publicKeyB64}`,
  };
}

// تبدیل کلید خصوصی خام (32 بایت) + کلید عمومی خام (65 بایت، 0x04 + x + y) به فرمت PKCS8 برای importKey
function pkcs8FromRawPrivate(rawPriv, rawPub) {
  // PKCS8 wrapper برای EC P-256 private key (ساختار ثابت ASN.1)
  const x = rawPub.slice(1, 33), y = rawPub.slice(33, 65);
  const ecPrivKeySeq = concatBytes(
    new Uint8Array([0x30, 0x81, 0x87, 0x02, 0x01, 0x00, 0x30, 0x13, 0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 0x04, 0x6d, 0x30, 0x6b, 0x02, 0x01, 0x01, 0x04, 0x20]),
    rawPriv,
    new Uint8Array([0xa1, 0x44, 0x03, 0x42, 0x00, 0x04]),
    x, y
  );
  return ecPrivKeySeq;
}

// ---------- رمزنگاری بدنهٔ پیام (RFC 8291 aes128gcm) ----------
async function encryptPayload(payloadStr, p256dhB64, authB64) {
  const userPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);

  const serverKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKeyPair.publicKey));

  const userPublicKey = await crypto.subtle.importKey('raw', userPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: userPublicKey }, serverKeyPair.privateKey, 256));

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const enc = new TextEncoder();
  const ikmInfo = concatBytes(enc.encode('WebPush: info\0'), userPublic, serverPubRaw);
  const ikm = await hkdf(authSecret, sharedSecret, ikmInfo, 32);

  const cekInfo = enc.encode('Content-Encoding: aes128gcm\0');
  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonceInfo = enc.encode('Content-Encoding: nonce\0');
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  const padded = concatBytes(enc.encode(payloadStr), new Uint8Array([2])); // delimiter octet (no padding)
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));

  // header: salt(16) + rs(4, =4096) + idlen(1) + keyid(serverPubRaw 65 bytes) + ciphertext
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096 به‌صورت big-endian در 4 بایت
  const header = concatBytes(salt, rs, new Uint8Array([serverPubRaw.length]), serverPubRaw);
  return concatBytes(header, ciphertext);
}

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}

// ---------- ارسال خود پیام Push ----------
async function sendPush(subscription, payloadObj, env) {
  const body = await encryptPayload(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth);
  const vapidHeaders = await buildVapidHeader(subscription.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      ...vapidHeaders,
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: '86400',
    },
    body,
  });
  return res;
}

// ---------- تبدیل تاریخ شمسی به میلادی (برای فید ICS) ----------
const CAL_DAYS_IN_MONTH = [31,31,31,31,31,31,30,30,30,30,30,29];
function isJalaliLeap(jy) {
  return ((((((jy-(jy>474?473:473))%2820)+2820)%2820+474+38)*682)%2816)<682;
}
function _jalDaysInYear(jy){ return isJalaliLeap(jy)?366:365; }
function _jalToDays(jy,jm,jd){
  let days=0;
  const y=jy-1, cycles=Math.floor(y/2820), rem=y%2820;
  days=cycles*1029983;
  for(let i=1;i<=rem;i++) days+=_jalDaysInYear(i);
  for(let m=1;m<jm;m++) days+=CAL_DAYS_IN_MONTH[m-1];
  return days+jd;
}
function jalaliToGregorian(jy,jm,jd){
  const diff=_jalToDays(jy,jm,jd)-_jalToDays(1403,1,1);
  const g=new Date(2024,2,20);
  g.setDate(g.getDate()+diff);
  return [g.getFullYear(), g.getMonth()+1, g.getDate()];
}

// ---------- ساخت فید ICS از روی تسک‌های سینک‌شده ----------
function _icsEscape(s){
  return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
function buildIcsFeed(tasks){
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DayQ//FA','CALSCALE:GREGORIAN'];
  for(const t of (tasks||[])){
    if(!t || t.deleted || !t.deadline) continue;
    const [jy,jm,jd] = t.deadline.split('-').map(n=>parseInt(n,10));
    if(!jy||!jm||!jd) continue;
    const [gy,gm,gd] = jalaliToGregorian(jy,jm,jd);
    const pad=n=>String(n).padStart(2,'0');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:'+t.id+'@dayq.app');
    lines.push('DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z');
    lines.push('SUMMARY:'+_icsEscape(t.text));
    if(t.time && /^\d{1,2}:\d{2}$/.test(t.time)){
      const [hh,mm]=t.time.split(':').map(n=>parseInt(n,10));
      const dtStart = `${gy}${pad(gm)}${pad(gd)}T${pad(hh)}${pad(mm)}00`;
      let eh=hh, em=mm+30; if(em>=60){em-=60;eh+=1;} if(eh>=24)eh-=24;
      const dtEnd = `${gy}${pad(gm)}${pad(gd)}T${pad(eh)}${pad(em)}00`;
      lines.push('DTSTART:'+dtStart);
      lines.push('DTEND:'+dtEnd);
    } else {
      const dtStart = `${gy}${pad(gm)}${pad(gd)}`;
      const nextDay = new Date(gy,gm-1,gd+1);
      const dtEnd = `${nextDay.getFullYear()}${pad(nextDay.getMonth()+1)}${pad(nextDay.getDate())}`;
      lines.push('DTSTART;VALUE=DATE:'+dtStart);
      lines.push('DTEND;VALUE=DATE:'+dtEnd);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- منطق Merge برای سینک چنددستگاهی ----------
// قانون: برای هر آیتم، آن نسخه‌ای که updatedAt بزرگ‌تر دارد می‌ماند.
// چون «حذف» هم فقط یک تغییر با updatedAt جدید است (نه پاک‌شدن فیزیکی)،
// این قانون به‌خودی‌خود تضمین می‌کند که یک ویرایش *جدیدتر* همیشه روی
// یک حذف *قدیمی‌تر* برنده باشد — بدون نیاز به استثنای جدا.
function mergeById(localArr, serverArr) {
  const map = new Map();
  for (const item of (serverArr || [])) map.set(item.id, item);
  for (const item of (localArr || [])) {
    const existing = map.get(item.id);
    if (!existing || (item.updatedAt || 0) >= (existing.updatedAt || 0)) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

// ---------- خود Worker ----------
export { buildVapidHeader, encryptPayload, sendPush, mergeById, buildIcsFeed, jalaliToGregorian };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    if (url.pathname === '/subscribe' && req.method === 'POST') {
      const sub = await req.json();
      await env.DAYQ_KV.put('subscription', JSON.stringify(sub));
      return new Response('ok', { headers: cors });
    }

    if (url.pathname === '/reminders' && req.method === 'POST') {
      const list = await req.json(); // [{id, text, fireAt}]
      await env.DAYQ_KV.put('reminders', JSON.stringify(list));
      return new Response('ok', { headers: cors });
    }

    if (url.pathname === '/test' && req.method === 'POST') {
      const subRaw = await env.DAYQ_KV.get('subscription');
      if (!subRaw) return new Response('no subscription saved', { status: 400, headers: cors });
      const sub = JSON.parse(subRaw);
      const r = await sendPush(sub, { title: 'DayQ', body: 'پیام تست — اگر این را می‌بینی، Push کار می‌کند ✓' }, env);
      return new Response('sent, status ' + r.status, { headers: cors });
    }

    if (url.pathname === '/sync/init' && req.method === 'POST') {
      // یک کد ۶ رقمی تصادفی بساز که قبلاً استفاده نشده
      let code;
      for (let i = 0; i < 5; i++) {
        code = String(Math.floor(100000 + Math.random() * 900000));
        const exists = await env.DAYQ_KV.get('sync:' + code);
        if (!exists) break;
      }
      await env.DAYQ_KV.put('sync:' + code, JSON.stringify({ tasks: [], projects: [], updatedAt: Date.now() }));
      return new Response(JSON.stringify({ code }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname === '/sync/push' && req.method === 'POST') {
      const body = await req.json(); // {code, tasks, projects}
      const { code } = body;
      if (!code || !/^\d{6}$/.test(code)) {
        return new Response(JSON.stringify({ error: 'کد سینک نامعتبر است' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      const raw = await env.DAYQ_KV.get('sync:' + code);
      const server = raw ? JSON.parse(raw) : { tasks: [], projects: [] };

      const mergedTasks = mergeById(body.tasks, server.tasks);
      const mergedProjects = mergeById(body.projects, server.projects);

      const merged = { tasks: mergedTasks, projects: mergedProjects, updatedAt: Date.now() };
      await env.DAYQ_KV.put('sync:' + code, JSON.stringify(merged));
      return new Response(JSON.stringify(merged), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (url.pathname.startsWith('/calendar/') && url.pathname.endsWith('.ics') && req.method === 'GET') {
      const code = url.pathname.replace('/calendar/', '').replace('.ics', '');
      if (!/^\d{6}$/.test(code)) {
        return new Response('کد سینک نامعتبر است', { status: 400, headers: cors });
      }
      const raw = await env.DAYQ_KV.get('sync:' + code);
      const server = raw ? JSON.parse(raw) : { tasks: [] };
      const ics = buildIcsFeed(server.tasks);
      return new Response(ics, {
        headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' }
      });
    }

    if (url.pathname === '/test-icloud' && req.method === 'GET') {
      const appleId = env.ICLOUD_APPLE_ID;
      const appPassword = env.ICLOUD_APP_PASSWORD;
      if (!appleId || !appPassword) {
        return new Response('ICLOUD_APPLE_ID یا ICLOUD_APP_PASSWORD در Variables تنظیم نشده', { status: 400, headers: cors });
      }
      const authHeader = 'Basic ' + btoa(appleId + ':' + appPassword);
      const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:current-user-principal/></d:prop>
</d:propfind>`;
      try {
        const res = await fetch('https://caldav.icloud.com/', {
          method: 'PROPFIND',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'text/xml; charset=utf-8',
            'Depth': '0',
          },
          body: propfindBody,
        });
        const text = await res.text();
        return new Response(JSON.stringify({
          status: res.status,
          statusText: res.statusText,
          bodySnippet: text.slice(0, 500),
        }, null, 2), { headers: { ...cors, 'Content-Type': 'application/json' } });
      } catch (e) {
        return new Response('خطای شبکه: ' + e.message, { status: 500, headers: cors });
      }
    }

    return new Response('DayQ push worker', { headers: cors });
  },

  async scheduled(event, env) {
    const subRaw = await env.DAYQ_KV.get('subscription');
    const remindersRaw = await env.DAYQ_KV.get('reminders');
    if (!subRaw || !remindersRaw) return;

    const sub = JSON.parse(subRaw);
    let reminders = JSON.parse(remindersRaw);
    const now = Date.now();
    const due = reminders.filter(r => r.fireAt <= now);
    if (!due.length) return;

    for (const r of due) {
      try {
        await sendPush(sub, { title: 'DayQ یادآوری', body: r.text }, env);
      } catch (e) { /* یک یادآوری ناموفق، باقی را متوقف نکند */ }
    }
    const remaining = reminders.filter(r => r.fireAt > now);
    await env.DAYQ_KV.put('reminders', JSON.stringify(remaining));
  },
};
