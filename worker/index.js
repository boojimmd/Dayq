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

// ---------- خود Worker ----------
export { buildVapidHeader, encryptPayload, sendPush };

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
