/* ══════════════════════════════════════════════════════════════════════
   DayQ Worker v3 — Personal Sync + Team (سکو)
   
   تغییرات نسبت به v2:
   - همه endpoint های v2 دست نخورده مونده
   - team endpoints اضافه شد (زیر /team/* و /task/*)
   - push notification برای چند عضو همزمان
   - session token برای auth
   - rate limiting برای جلوگیری از brute force

   ENV های لازم:
   - VAPID_PUBLIC_KEY
   - VAPID_PRIVATE_KEY  (Secret)
   - VAPID_SUBJECT      (mailto:...)

   KV Binding: DAYQ_KV

   ── Key scheme ──
   [Personal — دست نخورده]
   subscription              → push sub شخصی
   reminders                 → یادآورها
   sync:{code}               → داده sync شخصی

   [Team — جدید]
   team:{tc}:meta            → اطلاعات تیم + لیست اعضا
   team:{tc}:member:{uuid}   → پروفایل + PIN hash عضو
   team:{tc}:task:{id}       → هر تسک
   team:{tc}:inbox:{uuid}    → آرایه ID تسک‌های یه عضو
   team:{tc}:snapshot        → cache داشبورد مدیر
   team:{tc}:events          → رویدادهای تیمی
   team:{tc}:announcements   → اطلاعیه‌ها
   team:{tc}:log             → activity log
   team:{tc}:sub:{uuid}      → push subscription هر عضو
   session:{token}           → { uuid, teamCode, role, exp }
   auth:fail:{ip}            → { count, until }
   ══════════════════════════════════════════════════════════════════════ */

// ════════════════════════════════════════════
// ابزارهای پایه — بدون تغییر از v2
// ════════════════════════════════════════════
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

// ════════════════════════════════════════════
// VAPID — بدون تغییر از v2
// ════════════════════════════════════════════
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
  const jwt = unsigned + '.' + bytesToB64url(new Uint8Array(sigDer));
  return { Authorization: `vapid t=${jwt}, k=${publicKeyB64}` };
}
function pkcs8FromRawPrivate(rawPriv, rawPub) {
  const x = rawPub.slice(1, 33), y = rawPub.slice(33, 65);
  return concatBytes(
    new Uint8Array([0x30,0x81,0x87,0x02,0x01,0x00,0x30,0x13,0x06,0x07,0x2a,0x86,0x48,0xce,0x3d,0x02,
                    0x01,0x06,0x08,0x2a,0x86,0x48,0xce,0x3d,0x03,0x01,0x07,0x04,0x6d,0x30,0x6b,0x02,
                    0x01,0x01,0x04,0x20]),
    rawPriv,
    new Uint8Array([0xa1,0x44,0x03,0x42,0x00,0x04]),
    x, y
  );
}
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
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const padded = concatBytes(enc.encode(payloadStr), new Uint8Array([2]));
  const cekKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, padded));
  const rs = new Uint8Array([0, 0, 16, 0]);
  const header = concatBytes(salt, rs, new Uint8Array([serverPubRaw.length]), serverPubRaw);
  return concatBytes(header, ciphertext);
}
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8);
  return new Uint8Array(bits);
}
async function sendPush(subscription, payloadObj, env) {
  const body = await encryptPayload(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth);
  const vapidHeaders = await buildVapidHeader(subscription.endpoint, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT);
  return fetch(subscription.endpoint, {
    method: 'POST',
    headers: { ...vapidHeaders, 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: '86400' },
    body,
  });
}

// ════════════════════════════════════════════
// Jalali + ICS — بدون تغییر از v2
// ════════════════════════════════════════════
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
function _icsEscape(s){ return String(s||'').replace(/\\/g,'\\\\').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/\n/g,'\\n'); }
function buildIcsFeed(tasks){
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DayQ//FA','CALSCALE:GREGORIAN'];
  for(const t of (tasks||[])){
    if(!t||t.deleted||!t.deadline) continue;
    const [jy,jm,jd]=t.deadline.split('-').map(n=>parseInt(n,10));
    if(!jy||!jm||!jd) continue;
    const [gy,gm,gd]=jalaliToGregorian(jy,jm,jd);
    const pad=n=>String(n).padStart(2,'0');
    lines.push('BEGIN:VEVENT','UID:'+t.id+'@dayq.app',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').split('.')[0]+'Z',
      'SUMMARY:'+_icsEscape(t.text));
    if(t.time&&/^\d{1,2}:\d{2}$/.test(t.time)){
      const [hh,mm]=t.time.split(':').map(n=>parseInt(n,10));
      let eh=hh,em=mm+30; if(em>=60){em-=60;eh+=1;} if(eh>=24)eh-=24;
      lines.push('DTSTART:'+`${gy}${pad(gm)}${pad(gd)}T${pad(hh)}${pad(mm)}00`,
        'DTEND:'+`${gy}${pad(gm)}${pad(gd)}T${pad(eh)}${pad(em)}00`);
    } else {
      const nd=new Date(gy,gm-1,gd+1);
      lines.push('DTSTART;VALUE=DATE:'+`${gy}${pad(gm)}${pad(gd)}`,
        'DTEND;VALUE=DATE:'+`${nd.getFullYear()}${pad(nd.getMonth()+1)}${pad(nd.getDate())}`);
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
function mergeById(localArr, serverArr) {
  const map = new Map();
  for (const item of (serverArr||[])) map.set(item.id, item);
  for (const item of (localArr||[])) {
    const existing = map.get(item.id);
    if (!existing||(item.updatedAt||0)>=(existing.updatedAt||0)) map.set(item.id, item);
  }
  return [...map.values()];
}

// ════════════════════════════════════════════
// ابزارهای جدید — Team
// ════════════════════════════════════════════

// ── Hash ساده برای PIN (در Worker نمی‌شه bcrypt — از SHA-256 استفاده می‌کنیم) ──
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(pin + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return bytesToB64url(new Uint8Array(hashBuffer));
}

// ── تولید کد تصادفی امن ──
function randomCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف گیج‌کننده
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

function randomUUID() {
  return crypto.randomUUID();
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToB64url(bytes);
}

// ── Rate limiting برای auth ──
async function checkRateLimit(ip, env) {
  const key = `auth:fail:${ip}`;
  const raw = await env.DAYQ_KV.get(key);
  if (!raw) return true; // ok
  const data = JSON.parse(raw);
  if (data.until && Date.now() < data.until) return false; // locked
  return true;
}

async function recordFailedAttempt(ip, env) {
  const key = `auth:fail:${ip}`;
  const raw = await env.DAYQ_KV.get(key);
  const data = raw ? JSON.parse(raw) : { count: 0 };
  data.count = (data.count || 0) + 1;
  if (data.count >= 5) {
    data.until = Date.now() + 30 * 60 * 1000; // 30 دقیقه lockout
    data.count = 0;
  }
  await env.DAYQ_KV.put(key, JSON.stringify(data), { expirationTtl: 3600 });
}

async function clearFailedAttempts(ip, env) {
  await env.DAYQ_KV.delete(`auth:fail:${ip}`);
}

// ── Session ──
async function createSession(uuid, teamCode, role, env) {
  const token = randomToken();
  const session = { uuid, teamCode, role, exp: Date.now() + 7 * 24 * 3600 * 1000 };
  await env.DAYQ_KV.put(`session:${token}`, JSON.stringify(session), { expirationTtl: 7 * 24 * 3600 });
  return token;
}

async function validateSession(token, env) {
  if (!token) return null;
  const raw = await env.DAYQ_KV.get(`session:${token}`);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (Date.now() > session.exp) {
    await env.DAYQ_KV.delete(`session:${token}`);
    return null;
  }
  return session;
}

// ── Snapshot rebuild ──
async function rebuildSnapshot(teamCode, env) {
  const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
  if (!metaRaw) return;
  const meta = JSON.parse(metaRaw);
  
  const snapshot = {
    teamName: meta.teamName,
    memberCount: meta.members.length,
    members: [],
    updatedAt: Date.now()
  };

  for (const m of meta.members) {
    if (m.status === 'removed') continue;
    
    // خوندن inbox این عضو
    const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${m.uuid}`);
    const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
    
    // خوندن تسک‌ها
    const tasks = [];
    for (const taskId of inbox) {
      const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
      if (taskRaw) tasks.push(JSON.parse(taskRaw));
    }

    // محاسبه workload
    const activeTasks = tasks.filter(t => t.status !== 'done' && !t.deleted);
    const blockedTasks = tasks.filter(t => t.status === 'blocked');
    const staleTasks = tasks.filter(t => {
      if (t.status === 'done' || t.deleted) return false;
      const twoDaysAgo = Date.now() - 2 * 24 * 3600 * 1000;
      return (t.lastActivityAt || t.assignedAt || 0) < twoDaysAgo;
    });

    // آخرین فعالیت
    const lastActivity = tasks.reduce((max, t) => Math.max(max, t.lastActivityAt || 0), 0);

    snapshot.members.push({
      uuid: m.uuid,
      name: m.name,
      role: m.role,
      status: m.status, // active / inactive
      activeTasks: activeTasks.length,
      blockedTasks: blockedTasks.length,
      staleTasks: staleTasks.length,
      lastActivityAt: lastActivity,
      // مدیر می‌بینه کارمند چه وضعیتی داره
      alert: blockedTasks.length > 0 ? 'blocked' :
             staleTasks.length > 0 ? 'stale' :
             activeTasks.length >= 5 ? 'overloaded' : 'ok'
    });
  }

  await env.DAYQ_KV.put(`team:${teamCode}:snapshot`, JSON.stringify(snapshot), { expirationTtl: 7 * 24 * 3600 });
}

// ── Push به یه عضو خاص ──
async function pushToMember(teamCode, memberUuid, payload, env) {
  const subRaw = await env.DAYQ_KV.get(`team:${teamCode}:sub:${memberUuid}`);
  if (!subRaw) return;
  const sub = JSON.parse(subRaw);
  try { await sendPush(sub, payload, env); } catch(e) {}
}

// ── Push به مدیر ──
async function pushToManager(teamCode, payload, env) {
  const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
  if (!metaRaw) return;
  const meta = JSON.parse(metaRaw);
  await pushToMember(teamCode, meta.managerUuid, payload, env);
}

// ── Activity log ──
async function addToLog(teamCode, entry, env) {
  const key = `team:${teamCode}:log`;
  const raw = await env.DAYQ_KV.get(key);
  const log = raw ? JSON.parse(raw) : [];
  log.unshift({ ...entry, at: Date.now() });
  // فقط ۲۰۰ رویداد آخر نگه داشته می‌شه
  if (log.length > 200) log.splice(200);
  await env.DAYQ_KV.put(key, JSON.stringify(log), { expirationTtl: 30 * 24 * 3600 });
}

// ── Helper: Response JSON ──
function jsonRes(data, status = 200, cors = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors }
  });
}
function errRes(msg, status = 400, cors = {}) {
  return jsonRes({ error: msg }, status, cors);
}

// ════════════════════════════════════════════
// Worker main
// ════════════════════════════════════════════
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-DayQ-Token',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    const path = url.pathname;
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';

    // ══════════════════════════════════════
    // ── PERSONAL endpoints (v2 — بدون تغییر) ──
    // ══════════════════════════════════════

    if (path === '/subscribe' && req.method === 'POST') {
      const sub = await req.json();
      await env.DAYQ_KV.put('subscription', JSON.stringify(sub));
      return new Response('ok', { headers: cors });
    }

    if (path === '/reminders' && req.method === 'POST') {
      const list = await req.json();
      await env.DAYQ_KV.put('reminders', JSON.stringify(list));
      return new Response('ok', { headers: cors });
    }

    if (path === '/test' && req.method === 'POST') {
      const subRaw = await env.DAYQ_KV.get('subscription');
      if (!subRaw) return new Response('no subscription saved', { status: 400, headers: cors });
      const sub = JSON.parse(subRaw);
      const r = await sendPush(sub, { title: 'DayQ', body: 'پیام تست — Push کار می‌کند ✓' }, env);
      return new Response('sent, status ' + r.status, { headers: cors });
    }

    if (path === '/sync/init' && req.method === 'POST') {
      let code;
      for (let i = 0; i < 5; i++) {
        code = String(Math.floor(100000 + Math.random() * 900000));
        const exists = await env.DAYQ_KV.get('sync:' + code);
        if (!exists) break;
      }
      await env.DAYQ_KV.put('sync:' + code, JSON.stringify({
        tasks: [], projects: [], birthdays: [], cfg: {}, updatedAt: Date.now()
      }));
      return new Response(JSON.stringify({ code }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (path === '/sync/push' && req.method === 'POST') {
      const body = await req.json();
      const { code } = body;
      if (!code || !/^\d{6}$/.test(code))
        return errRes('کد سینک نامعتبر', 400, cors);
      const raw = await env.DAYQ_KV.get('sync:' + code);
      const server = raw ? JSON.parse(raw) : { tasks: [], projects: [], birthdays: [], cfg: {} };
      const mergedTasks = mergeById(body.tasks||[], server.tasks||[]);
      const mergedProjects = mergeById(body.projects||[], server.projects||[]);
      const mergedBirthdays = mergeById(body.birthdays||[], server.birthdays||[]);
      let mergedCfg = server.cfg || {};
      if (body.cfg && (body.cfg.updatedAt||0) >= (mergedCfg.updatedAt||0)) mergedCfg = body.cfg;
      const merged = { tasks: mergedTasks, projects: mergedProjects, birthdays: mergedBirthdays, cfg: mergedCfg, updatedAt: Date.now() };
      await env.DAYQ_KV.put('sync:' + code, JSON.stringify(merged));
      return new Response(JSON.stringify(merged), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (path.startsWith('/calendar/') && path.endsWith('.ics') && req.method === 'GET') {
      const code = path.replace('/calendar/', '').replace('.ics', '');
      if (!/^\d{6}$/.test(code)) return new Response('کد نامعتبر', { status: 400, headers: cors });
      const raw = await env.DAYQ_KV.get('sync:' + code);
      const server = raw ? JSON.parse(raw) : { tasks: [] };
      return new Response(buildIcsFeed(server.tasks), {
        headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' }
      });
    }

    // ══════════════════════════════════════
    // ── TEAM endpoints (جدید — v3) ──
    // ══════════════════════════════════════

    // ── ایجاد تیم (مدیر) ──
    if (path === '/team/create' && req.method === 'POST') {
      const { name, managerName, managerRole, pin } = await req.json();
      if (!name || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
        return errRes('اطلاعات ناقص یا PIN نامعتبر', 400, cors);

      const teamCode = 'DQ-' + randomCode(7);
      const managerUuid = randomUUID();
      const salt = randomCode(16);
      const pinHash = await hashPin(pin, salt);

      const meta = {
        teamCode,
        teamName: name,
        managerUuid,
        createdAt: Date.now(),
        members: [{
          uuid: managerUuid,
          name: managerName || 'مدیر',
          role: managerRole || 'مدیر',
          isManager: true,
          status: 'active',
          joinedAt: Date.now()
        }]
      };

      const memberData = {
        uuid: managerUuid,
        teamCode,
        name: managerName || 'مدیر',
        role: managerRole || 'مدیر',
        isManager: true,
        pinHash,
        salt,
        status: 'active'
      };

      await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(meta));
      await env.DAYQ_KV.put(`team:${teamCode}:member:${managerUuid}`, JSON.stringify(memberData));
      await env.DAYQ_KV.put(`team:${teamCode}:inbox:${managerUuid}`, JSON.stringify([]));

      const token = await createSession(managerUuid, teamCode, 'manager', env);

      return jsonRes({ teamCode, managerUuid, token, workerUrl: url.origin }, 201, cors);
    }

    // ── درخواست join (کارمند) ──
    if (path === '/team/join' && req.method === 'POST') {
      const { teamCode, name, role, pin } = await req.json();
      if (!teamCode || !name || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
        return errRes('اطلاعات ناقص', 400, cors);

      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return errRes('کد تیم نامعتبر است', 404, cors);
      const meta = JSON.parse(metaRaw);

      const memberUuid = randomUUID();
      const salt = randomCode(16);
      const pinHash = await hashPin(pin, salt);

      // ذخیره درخواست در pending list
      const pendingKey = `team:${teamCode}:pending:${memberUuid}`;
      await env.DAYQ_KV.put(pendingKey, JSON.stringify({
        uuid: memberUuid, name, role, pinHash, salt, requestedAt: Date.now()
      }), { expirationTtl: 7 * 24 * 3600 }); // ۷ روز expire

      // اضافه کردن به pendingUuids در meta
      const metaForPending = JSON.parse(await env.DAYQ_KV.get(`team:${teamCode}:meta`));
      if (!metaForPending.pendingUuids) metaForPending.pendingUuids = [];
      metaForPending.pendingUuids.push(memberUuid);
      await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(metaForPending));

      // push به مدیر
      await pushToManager(teamCode, {
        title: 'DayQ — درخواست عضویت',
        body: `${name} (${role}) می‌خواد به تیم بپیونده`,
        data: { type: 'join_request', teamCode, memberUuid, name, role }
      }, env);

      return jsonRes({ memberUuid, status: 'pending', message: 'درخواست ارسال شد — منتظر تأیید مدیر' }, 200, cors);
    }

    // ── تأیید یا رد عضو (مدیر) ──
    if (path === '/team/approve' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { memberUuid, action } = await req.json(); // action: 'approve' | 'reject'
      const { teamCode } = session;
      const pendingKey = `team:${teamCode}:pending:${memberUuid}`;
      const pendingRaw = await env.DAYQ_KV.get(pendingKey);
      if (!pendingRaw) return errRes('درخواست یافت نشد', 404, cors);
      const pending = JSON.parse(pendingRaw);

      await env.DAYQ_KV.delete(pendingKey);

      // حذف از pendingUuids در meta
      const metaForClean = JSON.parse(await env.DAYQ_KV.get(`team:${teamCode}:meta`));
      if (metaForClean.pendingUuids) {
        metaForClean.pendingUuids = metaForClean.pendingUuids.filter(id => id !== memberUuid);
        await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(metaForClean));
      }

      if (action === 'reject') {
        await pushToMember(teamCode, memberUuid, {
          title: 'DayQ', body: 'درخواست عضویت شما رد شد'
        }, env);
        return jsonRes({ status: 'rejected' }, 200, cors);
      }

      // approve
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      const meta = JSON.parse(metaRaw);
      meta.members.push({
        uuid: memberUuid, name: pending.name, role: pending.role,
        isManager: false, status: 'active', joinedAt: Date.now()
      });
      await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(meta));
      await env.DAYQ_KV.put(`team:${teamCode}:member:${memberUuid}`, JSON.stringify({
        uuid: memberUuid, teamCode, name: pending.name, role: pending.role,
        isManager: false, pinHash: pending.pinHash, salt: pending.salt, status: 'active'
      }));
      await env.DAYQ_KV.put(`team:${teamCode}:inbox:${memberUuid}`, JSON.stringify([]));

      // push به کارمند
      await pushToMember(teamCode, memberUuid, {
        title: 'DayQ — خوش اومدی!',
        body: `عضویت در تیم ${meta.teamName} تأیید شد`,
        data: { type: 'approved', teamCode, workerUrl: url.origin }
      }, env);

      await addToLog(teamCode, { type: 'member_joined', name: pending.name }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ status: 'approved', memberUuid }, 200, cors);
    }

    // ── ورود مستقیم با کد + PIN (بدون UUID) ──
    if (path === '/team/login' && req.method === 'POST') {
      const allowed = await checkRateLimit(ip, env);
      if (!allowed) return errRes('تعداد تلاش بیش از حد', 429, cors);
      const { teamCode, pin, uuid: loginUuid } = await req.json();
      if (!teamCode || !pin) return errRes('کد تیم و PIN اجباریه', 400, cors);
      const metaRaw = await env.DAYQ_KV.get("team:"+teamCode+":meta");
      if (!metaRaw) return errRes('کد تیم نامعتبره', 404, cors);
      const meta = JSON.parse(metaRaw);
      // اگه uuid اومد: فقط همون چک بشه
      // اگه نیومد: اول members (غیرمدیر)، بعد مدیر — جلوگیری از PIN collision
      const membersToCheck = loginUuid
        ? meta.members.filter(m => m.uuid === loginUuid)
        : [
            ...meta.members.filter(m => !m.isManager && m.status !== 'removed'),
            ...meta.members.filter(m => m.isManager)
          ];
      for (const m of membersToCheck) {
        if (m.status === "removed") continue;
        const memberRaw = await env.DAYQ_KV.get("team:"+teamCode+":member:"+m.uuid);
        if (!memberRaw) continue;
        const member = JSON.parse(memberRaw);
        const pinHash = await hashPin(pin, member.salt);
        if (pinHash === member.pinHash) {
          await clearFailedAttempts(ip, env);
          const role = member.isManager ? "manager" : "member";
          const token = await createSession(m.uuid, teamCode, role, env);
          return jsonRes({ token, role, uuid: m.uuid, name: m.name, memberRole: m.role, teamName: meta.teamName, workerUrl: url.origin }, 200, cors);
        }
      }
      await recordFailedAttempt(ip, env);
      return errRes("PIN نادرست", 401, cors);
    }

    // ── لاگین (ساخت session) ──
    if (path === '/team/session' && req.method === 'POST') {
      // rate limit
      const allowed = await checkRateLimit(ip, env);
      if (!allowed) return errRes('تعداد تلاش بیش از حد — ۳۰ دقیقه صبر کن', 429, cors);

      const { teamCode, uuid, pin } = await req.json();
      if (!teamCode || !uuid || !pin) return errRes('اطلاعات ناقص', 400, cors);

      const memberRaw = await env.DAYQ_KV.get(`team:${teamCode}:member:${uuid}`);
      if (!memberRaw) {
        await recordFailedAttempt(ip, env);
        return errRes('اطلاعات نادرست', 401, cors);
      }
      const member = JSON.parse(memberRaw);
      const pinHash = await hashPin(pin, member.salt);
      if (pinHash !== member.pinHash) {
        await recordFailedAttempt(ip, env);
        return errRes('PIN نادرست', 401, cors);
      }

      await clearFailedAttempts(ip, env);
      const role = member.isManager ? 'manager' : 'member';
      const token = await createSession(uuid, teamCode, role, env);
      return jsonRes({ token, role, name: member.name, teamCode }, 200, cors);
    }

    // ── لاگ‌اوت ──
    if (path === '/team/session' && req.method === 'DELETE') {
      const token = req.headers.get('X-DayQ-Token');
      if (token) await env.DAYQ_KV.delete(`session:${token}`);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── ثبت push subscription عضو ──
    if (path === '/team/subscribe' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);
      const sub = await req.json();
      await env.DAYQ_KV.put(`team:${session.teamCode}:sub:${session.uuid}`, JSON.stringify(sub));
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── assign تسک (مدیر) ──
    if (path === '/task/assign' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { assignedTo, title, priority, deadline, category, checklist, needsVerify, broadcastId } = await req.json();
      const { teamCode } = session;

      if (!title || !deadline || !assignedTo)
        return errRes('عنوان، ددلاین و مخاطب اجباریه', 400, cors);

      const taskId = randomUUID();
      const task = {
        id: taskId, teamCode, title, priority: priority || 'normal',
        deadline, category: category || '', checklist: checklist || [],
        needsVerify: !!needsVerify, broadcastId: broadcastId || null,
        assignedTo, assignedBy: session.uuid,
        assignedAt: Date.now(), lastActivityAt: Date.now(),
        status: 'pending', blockedNote: '', managerNote: '',
        memberNote: '', reassignHistory: [], verifiedAt: null, deleted: false
      };

      await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));

      // اضافه کردن به inbox کارمند
      const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${assignedTo}`);
      const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
      inbox.push(taskId);
      await env.DAYQ_KV.put(`team:${teamCode}:inbox:${assignedTo}`, JSON.stringify(inbox));

      // push به کارمند
      await pushToMember(teamCode, assignedTo, {
        title: 'DayQ — تسک جدید',
        body: title + (priority === 'urgent' ? ' 🔴' : ''),
        data: { type: 'new_task', taskId, teamCode }
      }, env);

      await addToLog(teamCode, { type: 'task_assigned', taskId, title, assignedTo }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ taskId }, 201, cors);
    }

    // ── broadcast تسک (مدیر — به همه) ──
    if (path === '/task/broadcast' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { title, priority, deadline, category, checklist, needsVerify } = await req.json();
      const { teamCode } = session;
      if (!title || !deadline) return errRes('عنوان و ددلاین اجباریه', 400, cors);

      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      const meta = JSON.parse(metaRaw);
      const broadcastId = randomUUID();
      const createdTasks = [];

      for (const m of meta.members) {
        if (m.isManager || m.status !== 'active') continue;
        const taskId = randomUUID();
        const task = {
          id: taskId, teamCode, title, priority: priority||'normal',
          deadline, category: category||'', checklist: checklist||[],
          needsVerify: !!needsVerify, broadcastId,
          assignedTo: m.uuid, assignedBy: session.uuid,
          assignedAt: Date.now(), lastActivityAt: Date.now(),
          status: 'pending', blockedNote: '', managerNote: '',
          memberNote: '', reassignHistory: [], verifiedAt: null, deleted: false
        };
        await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));
        const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${m.uuid}`);
        const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
        inbox.push(taskId);
        await env.DAYQ_KV.put(`team:${teamCode}:inbox:${m.uuid}`, JSON.stringify(inbox));
        await pushToMember(teamCode, m.uuid, {
          title: 'DayQ — تسک همگانی', body: title, data: { type: 'broadcast_task', taskId, teamCode }
        }, env);
        createdTasks.push(taskId);
      }

      await addToLog(teamCode, { type: 'broadcast', broadcastId, title, count: createdTasks.length }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ broadcastId, taskIds: createdTasks }, 201, cors);
    }

    // ── آپدیت تسک (کارمند یا مدیر) ──
    if (path === '/task/update' && req.method === 'PUT') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);

      const { taskId, status, memberNote, blockedNote, checklistUpdates } = await req.json();
      const { teamCode, uuid, role } = session;

      const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
      if (!taskRaw) return errRes('تسک یافت نشد', 404, cors);
      const task = JSON.parse(taskRaw);

      // کارمند فقط تسک خودش رو می‌تونه آپدیت کنه
      if (role === 'member' && task.assignedTo !== uuid)
        return errRes('دسترسی نامعتبر', 403, cors);

      const oldStatus = task.status;
      if (status) task.status = status;
      if (memberNote !== undefined) task.memberNote = memberNote;
      if (blockedNote !== undefined) task.blockedNote = blockedNote;
      if (checklistUpdates) task.checklist = checklistUpdates;
      task.lastActivityAt = Date.now();

      await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));

      // push به مدیر اگه وضعیت تغییر کرد
      if (status && status !== oldStatus) {
        const emoji = status === 'done' ? '✅' : status === 'blocked' ? '🔴' : '⏳';
        await pushToManager(teamCode, {
          title: 'DayQ — آپدیت تسک',
          body: `${emoji} ${task.title}`,
          data: { type: 'task_update', taskId, teamCode, status }
        }, env);

        // اگه منتظرم → push فوری به مدیر
        if (status === 'waiting') {
          await pushToManager(teamCode, {
            title: 'DayQ — منتظرم ⏳',
            body: `${task.title}: ${blockedNote || memberNote || ''}`,
            data: { type: 'waiting', taskId, teamCode }
          }, env);
        }
      }

      await addToLog(teamCode, {
        type: 'task_update', taskId, title: task.title,
        by: uuid, oldStatus, newStatus: status || oldStatus
      }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── reassign (مدیر) ──
    if (path === '/task/reassign' && req.method === 'PUT') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { taskId, newAssignee, reason } = await req.json();
      const { teamCode } = session;

      const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
      if (!taskRaw) return errRes('تسک یافت نشد', 404, cors);
      const task = JSON.parse(taskRaw);
      const oldAssignee = task.assignedTo;

      // حذف از inbox قبلی
      const oldInboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${oldAssignee}`);
      const oldInbox = oldInboxRaw ? JSON.parse(oldInboxRaw) : [];
      await env.DAYQ_KV.put(`team:${teamCode}:inbox:${oldAssignee}`, JSON.stringify(oldInbox.filter(id => id !== taskId)));

      // اضافه به inbox جدید
      const newInboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${newAssignee}`);
      const newInbox = newInboxRaw ? JSON.parse(newInboxRaw) : [];
      newInbox.push(taskId);
      await env.DAYQ_KV.put(`team:${teamCode}:inbox:${newAssignee}`, JSON.stringify(newInbox));

      // آپدیت تسک
      task.reassignHistory.push({ from: oldAssignee, to: newAssignee, reason: reason||'', at: Date.now() });
      task.assignedTo = newAssignee;
      task.status = 'pending';
      task.lastActivityAt = Date.now();
      await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));

      await pushToMember(teamCode, newAssignee, {
        title: 'DayQ — تسک منتقل شد',
        body: task.title, data: { type: 'reassigned', taskId, teamCode }
      }, env);

      await addToLog(teamCode, { type: 'task_reassigned', taskId, from: oldAssignee, to: newAssignee }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── تأیید تسک توسط مدیر (needs-verify) ──
    if (path === '/task/verify' && req.method === 'PUT') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { taskId, managerNote } = await req.json();
      const { teamCode } = session;

      const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
      if (!taskRaw) return errRes('تسک یافت نشد', 404, cors);
      const task = JSON.parse(taskRaw);
      task.status = 'done';
      task.verifiedAt = Date.now();
      task.managerNote = managerNote || '';
      task.lastActivityAt = Date.now();
      await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));

      await pushToMember(teamCode, task.assignedTo, {
        title: 'DayQ — تأیید شد ✅',
        body: task.title + ' توسط مدیر تأیید شد',
        data: { type: 'task_verified', taskId, teamCode }
      }, env);

      await addToLog(teamCode, { type: 'task_verified', taskId, title: task.title }, env);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── inbox کارمند ──
    if (path === '/task/inbox' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);
      const { teamCode, uuid } = session;

      const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${uuid}`);
      const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
      const tasks = [];
      for (const taskId of inbox) {
        const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
        if (taskRaw) {
          const t = JSON.parse(taskRaw);
          if (!t.deleted) tasks.push(t);
        }
      }
      return jsonRes({ tasks }, 200, cors);
    }

    // ── snapshot داشبورد مدیر ──
    if (path === '/team/snapshot' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);
      const { teamCode } = session;
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:snapshot`);
      if (!raw) {
        await rebuildSnapshot(teamCode, env);
        const fresh = await env.DAYQ_KV.get(`team:${teamCode}:snapshot`);
        return jsonRes(fresh ? JSON.parse(fresh) : {}, 200, cors);
      }
      return jsonRes(JSON.parse(raw), 200, cors);
    }

    // ── activity feed (مدیر) ──
    if (path === '/team/feed' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);
      const { teamCode } = session;
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:log`);
      const log = raw ? JSON.parse(raw) : [];
      // فقط امروز
      const today = new Date(); today.setHours(0,0,0,0);
      const todayLog = log.filter(e => e.at >= today.getTime());
      return jsonRes({ feed: todayLog }, 200, cors);
    }

    // ── اطلاعیه (مدیر) ──
    if (path === '/announcement' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { text, pinToCalendar } = await req.json();
      const { teamCode } = session;
      if (!text || text.length > 300) return errRes('متن اطلاعیه نامعتبر', 400, cors);

      const annoId = randomUUID();
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:announcements`);
      const announcements = raw ? JSON.parse(raw) : [];
      announcements.unshift({
        id: annoId, text, pinToCalendar: !!pinToCalendar,
        createdAt: Date.now(), readBy: []
      });
      if (announcements.length > 50) announcements.splice(50);
      await env.DAYQ_KV.put(`team:${teamCode}:announcements`, JSON.stringify(announcements));

      // push به همه اعضا
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      const meta = JSON.parse(metaRaw);
      for (const m of meta.members) {
        if (m.isManager || m.status !== 'active') continue;
        await pushToMember(teamCode, m.uuid, {
          title: 'DayQ — اطلاعیه 📢', body: text,
          data: { type: 'announcement', annoId, teamCode }
        }, env);
      }

      return jsonRes({ annoId }, 201, cors);
    }

    // ── خوندن اطلاعیه (کارمند) ──
    if (path === '/announcement/read' && req.method === 'PUT') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);
      const { annoId } = await req.json();
      const { teamCode, uuid } = session;
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:announcements`);
      if (!raw) return jsonRes({ ok: true }, 200, cors);
      const announcements = JSON.parse(raw);
      const anno = announcements.find(a => a.id === annoId);
      if (anno && !anno.readBy.includes(uuid)) anno.readBy.push(uuid);
      await env.DAYQ_KV.put(`team:${teamCode}:announcements`, JSON.stringify(announcements));
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── گرفتن اطلاعیه‌ها (کارمند و مدیر) ──
    if (path === '/announcements' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);
      const { teamCode } = session;
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:announcements`);
      return jsonRes({ announcements: raw ? JSON.parse(raw) : [] }, 200, cors);
    }

    // ── رویداد تیمی (مدیر) ──
    if (path === '/event/create' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { title, date, time } = await req.json();
      const { teamCode } = session;
      if (!title || !date) return errRes('عنوان و تاریخ اجباریه', 400, cors);

      const eventId = randomUUID();
      const raw = await env.DAYQ_KV.get(`team:${teamCode}:events`);
      const events = raw ? JSON.parse(raw) : [];
      events.push({ id: eventId, title, date, time: time||'', createdAt: Date.now() });
      await env.DAYQ_KV.put(`team:${teamCode}:events`, JSON.stringify(events));
      return jsonRes({ eventId }, 201, cors);
    }

    // ── رویدادها + اطلاعیه‌های تیمی (کارمند و مدیر) ──
    if (path === '/team/calendar' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session) return errRes('دسترسی نامعتبر', 403, cors);
      const { teamCode } = session;
      const eventsRaw = await env.DAYQ_KV.get(`team:${teamCode}:events`);
      const annosRaw = await env.DAYQ_KV.get(`team:${teamCode}:announcements`);
      return jsonRes({
        events: eventsRaw ? JSON.parse(eventsRaw) : [],
        announcements: (annosRaw ? JSON.parse(annosRaw) : []).filter(a => a.pinToCalendar)
      }, 200, cors);
    }

    // ── غیرفعال / فعال کردن عضو (مدیر) ──
    if (path === '/member/status' && req.method === 'PUT') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { memberUuid, status } = await req.json(); // active | inactive
      const { teamCode } = session;
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      const meta = JSON.parse(metaRaw);
      const m = meta.members.find(x => x.uuid === memberUuid);
      if (!m) return errRes('عضو یافت نشد', 404, cors);
      m.status = status;
      await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(meta));
      const memberRaw = await env.DAYQ_KV.get(`team:${teamCode}:member:${memberUuid}`);
      if (memberRaw) {
        const member = JSON.parse(memberRaw);
        member.status = status;
        await env.DAYQ_KV.put(`team:${teamCode}:member:${memberUuid}`, JSON.stringify(member));
      }
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── حذف عضو (مدیر) ──
    if (path === '/member/remove' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { memberUuid } = await req.json();
      const { teamCode } = session;

      // تسک‌های ناتموم رو unassigned کن
      const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${memberUuid}`);
      const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
      for (const taskId of inbox) {
        const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
        if (taskRaw) {
          const task = JSON.parse(taskRaw);
          if (task.status !== 'done') {
            task.assignedTo = null; // unassigned
            task.status = 'pending';
            await env.DAYQ_KV.put(`team:${teamCode}:task:${taskId}`, JSON.stringify(task));
          }
        }
      }

      // علامت‌گذاری به عنوان removed در meta (نه حذف — برای گزارش)
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      const meta = JSON.parse(metaRaw);
      const m = meta.members.find(x => x.uuid === memberUuid);
      if (m) m.status = 'removed';
      await env.DAYQ_KV.put(`team:${teamCode}:meta`, JSON.stringify(meta));

      // delete subscription و session
      await env.DAYQ_KV.delete(`team:${teamCode}:sub:${memberUuid}`);
      await rebuildSnapshot(teamCode, env);
      return jsonRes({ ok: true }, 200, cors);
    }

    // ── reset PIN عضو (مدیر) ──
    if (path === '/member/pin-reset' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { memberUuid } = await req.json();
      const { teamCode } = session;
      const tempPin = String(Math.floor(1000 + Math.random() * 9000));
      const salt = randomCode(16);
      const pinHash = await hashPin(tempPin, salt);

      const memberRaw = await env.DAYQ_KV.get(`team:${teamCode}:member:${memberUuid}`);
      if (!memberRaw) return errRes('عضو یافت نشد', 404, cors);
      const member = JSON.parse(memberRaw);
      member.pinHash = pinHash;
      member.salt = salt;
      member.mustChangePIN = true;
      await env.DAYQ_KV.put(`team:${teamCode}:member:${memberUuid}`, JSON.stringify(member));

      await pushToMember(teamCode, memberUuid, {
        title: 'DayQ — PIN موقت',
        body: `PIN موقت شما: ${tempPin} — بعد از ورود تغییر بده`,
        data: { type: 'pin_reset', tempPin, teamCode }
      }, env);

      return jsonRes({ tempPin }, 200, cors); // مدیر هم می‌بینه تا بتونه حضوری بده
    }

    // ── reset کد تیم (مدیر) ──
    if (path === '/team/reset-code' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { teamCode } = session;
      const newCode = 'DQ-' + randomCode(7);

      // کپی همه داده‌ها به کد جدید
      const keysToMove = ['meta', 'snapshot', 'events', 'announcements', 'log'];
      for (const k of keysToMove) {
        const raw = await env.DAYQ_KV.get(`team:${teamCode}:${k}`);
        if (raw) {
          await env.DAYQ_KV.put(`team:${newCode}:${k}`, raw);
          await env.DAYQ_KV.delete(`team:${teamCode}:${k}`);
        }
      }
      // اعضا و inboxها
      const metaRaw = await env.DAYQ_KV.get(`team:${newCode}:meta`);
      if (metaRaw) {
        const meta = JSON.parse(metaRaw);
        meta.teamCode = newCode;
        for (const m of meta.members) {
          for (const prefix of ['member', 'inbox', 'sub', 'task']) {
            // برای task ها باید inbox رو بخونیم
            if (prefix === 'task') continue;
            const raw = await env.DAYQ_KV.get(`team:${teamCode}:${prefix}:${m.uuid}`);
            if (raw) {
              let data = raw;
              if (prefix === 'member') {
                const parsed = JSON.parse(raw);
                parsed.teamCode = newCode;
                data = JSON.stringify(parsed);
              }
              await env.DAYQ_KV.put(`team:${newCode}:${prefix}:${m.uuid}`, data);
              await env.DAYQ_KV.delete(`team:${teamCode}:${prefix}:${m.uuid}`);
            }
          }
          // inbox tasks
          const inboxRaw = await env.DAYQ_KV.get(`team:${newCode}:inbox:${m.uuid}`);
          if (inboxRaw) {
            const inbox = JSON.parse(inboxRaw);
            for (const taskId of inbox) {
              const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
              if (taskRaw) {
                const task = JSON.parse(taskRaw);
                task.teamCode = newCode;
                await env.DAYQ_KV.put(`team:${newCode}:task:${taskId}`, JSON.stringify(task));
                await env.DAYQ_KV.delete(`team:${teamCode}:task:${taskId}`);
              }
            }
          }
        }
        await env.DAYQ_KV.put(`team:${newCode}:meta`, JSON.stringify(meta));
      }

      // push به همه
      const metaFinal = metaRaw ? JSON.parse(metaRaw) : null;
      if (metaFinal) {
        for (const m of metaFinal.members) {
          if (m.status !== 'active') continue;
          await pushToMember(newCode, m.uuid, {
            title: 'DayQ — کد تیم تغییر کرد',
            body: `کد جدید: ${newCode}`,
            data: { type: 'team_code_reset', newCode }
          }, env);
        }
      }

      // session مدیر رو آپدیت کن
      const newToken = await createSession(session.uuid, newCode, 'manager', env);
      return jsonRes({ newCode, newToken }, 200, cors);
    }

    // ── گزارش هفتگی ──
    if (path === '/report/weekly' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { teamCode } = session;
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return errRes('تیم یافت نشد', 404, cors);
      const meta = JSON.parse(metaRaw);

      // ۷ روز اخیر
      const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
      const report = { period: '۷ روز اخیر', members: [], totals: { assigned: 0, done: 0, missed: 0, inProgress: 0 } };

      for (const m of meta.members) {
        if (m.status === 'removed') continue;
        const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${m.uuid}`);
        const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
        let assigned = 0, done = 0, missed = 0, inProgress = 0;
        for (const taskId of inbox) {
          const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
          if (!taskRaw) continue;
          const task = JSON.parse(taskRaw);
          if ((task.assignedAt||0) < weekAgo) continue; // فقط این هفته
          assigned++;
          if (task.status === 'done') done++;
          else if (task.status === 'in_progress') inProgress++;
          else if (task.deadline) {
            // بررسی miss: ددلاین گذشته و done نشده
            const [jy,jm,jd] = task.deadline.split('-').map(Number);
            const [gy,gm,gd] = jalaliToGregorian(jy,jm,jd);
            const deadlineTs = new Date(gy,gm-1,gd).getTime();
            if (deadlineTs < Date.now()) missed++;
          }
        }
        report.members.push({ name: m.name, role: m.role, assigned, done, missed, inProgress,
          score: assigned > 0 ? Math.round((done/assigned)*100) : 0 });
        report.totals.assigned += assigned;
        report.totals.done += done;
        report.totals.missed += missed;
        report.totals.inProgress += inProgress;
      }

      report.members.sort((a,b) => b.score - a.score);
      return jsonRes(report, 200, cors);
    }

    // ── گزارش ماهانه ──
    if (path === '/report/monthly' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { teamCode } = session;
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return errRes('تیم یافت نشد', 404, cors);
      const meta = JSON.parse(metaRaw);

      const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
      const report = { period: '۳۰ روز اخیر', members: [], totals: { assigned: 0, done: 0, missed: 0 } };

      for (const m of meta.members) {
        if (m.status === 'removed') continue;
        const inboxRaw = await env.DAYQ_KV.get(`team:${teamCode}:inbox:${m.uuid}`);
        const inbox = inboxRaw ? JSON.parse(inboxRaw) : [];
        let assigned = 0, done = 0, missed = 0;
        for (const taskId of inbox) {
          const taskRaw = await env.DAYQ_KV.get(`team:${teamCode}:task:${taskId}`);
          if (!taskRaw) continue;
          const task = JSON.parse(taskRaw);
          if ((task.assignedAt||0) < monthAgo) continue;
          assigned++;
          if (task.status === 'done') done++;
          else if (task.deadline) {
            const [jy,jm,jd] = task.deadline.split('-').map(Number);
            const [gy,gm,gd] = jalaliToGregorian(jy,jm,jd);
            if (new Date(gy,gm-1,gd).getTime() < Date.now()) missed++;
          }
        }
        report.members.push({ name: m.name, role: m.role, assigned, done, missed,
          score: assigned > 0 ? Math.round((done/assigned)*100) : 0 });
        report.totals.assigned += assigned;
        report.totals.done += done;
        report.totals.missed += missed;
      }

      report.members.sort((a,b) => b.score - a.score);
      return jsonRes(report, 200, cors);
    }

    // ── pending members (مدیر) ──
    if (path === '/team/pending' && req.method === 'GET') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);

      const { teamCode } = session;
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return jsonRes({ pending: [] }, 200, cors);
      const meta = JSON.parse(metaRaw);

      const pending = [];
      // جستجو در KV برای pending:* — نمی‌شه با KV list کرد مگر با prefix
      // راه‌حل: meta یه pending list هم داشته باشه
      // این رو در /team/join اضافه می‌کنیم — فعلاً از meta.pendingUuids استفاده می‌کنیم
      for (const uuid of (meta.pendingUuids || [])) {
        const raw = await env.DAYQ_KV.get(`team:${teamCode}:pending:${uuid}`);
        if (raw) pending.push(JSON.parse(raw));
      }
      return jsonRes({ pending }, 200, cors);
    }

    
    // ── Push notify — اپ درخواست میده ──
    if (path === '/task/notify' && req.method === 'POST') {
      const token = req.headers.get('X-DayQ-Token');
      const session = await validateSession(token, env);
      if (!session || session.role !== 'manager')
        return errRes('دسترسی نامعتبر', 403, cors);
      const { to, title, body } = await req.json();
      const { teamCode } = session;
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return errRes('تیم یافت نشد', 404, cors);
      const meta = JSON.parse(metaRaw);
      const targets = to === 'all'
        ? meta.members.filter(m => !m.isManager).map(m => m.uuid)
        : [to];
      await Promise.all(targets.map(uuid =>
        pushToMember(teamCode, uuid, { title, body, data: { type: 'task_notify' } }, env)
      ));
      return jsonRes({ ok: true, sent: targets.length }, 200, cors);
    }

    // ── DEBUG: check member ──
    if (path === '/debug/member' && req.method === 'POST') {
      const { teamCode, uuid } = await req.json();
      const memberRaw = await env.DAYQ_KV.get(`team:${teamCode}:member:${uuid}`);
      if (!memberRaw) return jsonRes({ found: false, msg: 'member record not found' }, 200, cors);
      const member = JSON.parse(memberRaw);
      return jsonRes({
        found: true,
        name: member.name,
        isManager: member.isManager,
        status: member.status,
        hasPinHash: !!member.pinHash,
        hasSalt: !!member.salt,
        saltLen: (member.salt||'').length,
      }, 200, cors);
    }

    // ── DEBUG: list all members ──
    if (path === '/debug/members' && req.method === 'POST') {
      const { teamCode } = await req.json();
      const metaRaw = await env.DAYQ_KV.get(`team:${teamCode}:meta`);
      if (!metaRaw) return jsonRes({ error: 'team not found' }, 404, cors);
      const meta = JSON.parse(metaRaw);
      const result = [];
      for (const m of meta.members) {
        const raw = await env.DAYQ_KV.get(`team:${teamCode}:member:${m.uuid}`);
        const rec = raw ? JSON.parse(raw) : null;
        result.push({
          uuid: m.uuid, name: m.name, isManager: m.isManager, status: m.status,
          hasRecord: !!rec, hasPinHash: !!(rec?.pinHash), hasSalt: !!(rec?.salt)
        });
      }
      return jsonRes({ members: result, pendingUuids: meta.pendingUuids }, 200, cors);
    }

    return new Response('DayQ Worker v3 — Personal + Team', { headers: cors });
  },

  // ── Scheduled: یادآورها + stale task alert ──
  async scheduled(event, env) {
    // ── Personal reminders (بدون تغییر) ──
    const subRaw = await env.DAYQ_KV.get('subscription');
    const remindersRaw = await env.DAYQ_KV.get('reminders');
    if (subRaw && remindersRaw) {
      const sub = JSON.parse(subRaw);
      let reminders = JSON.parse(remindersRaw);
      const now = Date.now();
      const due = reminders.filter(r => r.fireAt <= now);
      for (const r of due) {
        try { await sendPush(sub, { title: 'DayQ یادآوری', body: r.text }, env); } catch(e) {}
      }
      if (due.length) await env.DAYQ_KV.put('reminders', JSON.stringify(reminders.filter(r => r.fireAt > now)));
    }

    // ── Team: stale task detection ──
    // هر تیم رو بررسی کن — این نیاز به list KV keys داره
    // Cloudflare KV list با prefix امکان‌پذیره
    // ولی در scheduled محدودیت زمانی داریم — فقط snapshots رو rebuild می‌کنیم
    // در نسخه بعدی: iterate over all team codes
  },
};
