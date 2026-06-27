/* ══════════════════════════════════════════════════════════
   test_ics.js — رگرسیون فید تقویم ICS
   اجرا: node test_ics.js
   ══════════════════════════════════════════════════════════ */
const path = require('path');

(async () => {
  const { buildIcsFeed, jalaliToGregorian } = await import(path.resolve(__dirname, 'worker/index.js'));

  let pass = 0, fail = 0;
  const failures = [];
  function check(label, cond) {
    if (cond) pass++;
    else { fail++; failures.push(label); console.log('❌ FAIL:', label); }
  }

  // لنگر شناخته‌شده
  {
    const [gy, gm, gd] = jalaliToGregorian(1403, 1, 1);
    check('لنگر تاریخ درست است (۱۴۰۳/۱/۱ = ۲۰۲۴-۰۳-۲۰)', gy === 2024 && gm === 3 && gd === 20);
  }

  // تسک با ساعت
  {
    const tasks = [{ id: 't1', text: 'تماس با رضا', deadline: '1405-04-06', time: '14:00', deleted: false }];
    const ics = buildIcsFeed(tasks);
    check('VCALENDAR درست شروع می‌شود', ics.startsWith('BEGIN:VCALENDAR'));
    check('UID شامل id تسک است', ics.includes('UID:t1@dayq.app'));
    check('SUMMARY متن فارسی دارد', ics.includes('SUMMARY:تماس با رضا'));
    check('DTSTART با ساعت دارد', /DTSTART:\d{8}T140000/.test(ics));
    check('DTEND نیم‌ساعت بعد است', /DTEND:\d{8}T143000/.test(ics));
  }

  // تسک بدون ساعت (تمام‌روز)
  {
    const tasks = [{ id: 't2', text: 'گزارش هفتگی', deadline: '1405-04-06', time: null, deleted: false }];
    const ics = buildIcsFeed(tasks);
    check('تسک بدون ساعت → VALUE=DATE', ics.includes('DTSTART;VALUE=DATE:'));
  }

  // حذف‌شده یا بدون تاریخ نباید بیاید
  {
    const tasks = [
      { id: 't3', text: 'حذف‌شده', deadline: '1405-04-06', deleted: true },
      { id: 't4', text: 'بدون تاریخ', deadline: null }
    ];
    const ics = buildIcsFeed(tasks);
    check('تسک حذف‌شده در فید نیست', !ics.includes('t3@dayq'));
    check('تسک بدون تاریخ در فید نیست', !ics.includes('t4@dayq'));
    check('فید خالی هم معتبر است', ics.includes('END:VCALENDAR'));
  }

  // ── endpoint کامل با KV ساختگی ──
  {
    const worker = (await import(path.resolve(__dirname, 'worker/index.js'))).default;
    class FakeKV {
      constructor() { this.store = new Map(); }
      async get(k) { return this.store.has(k) ? this.store.get(k) : null; }
      async put(k, v) { this.store.set(k, v); }
    }
    const env = { DAYQ_KV: new FakeKV() };
    await env.DAYQ_KV.put('sync:482901', JSON.stringify({
      tasks: [{ id: 'tx', text: 'ویزیت دکتر رضایی', deadline: '1405-04-06', time: '10:00', deleted: false }]
    }));

    let res = await worker.fetch(new Request('https://x/calendar/482901.ics'), env);
    check('endpoint وضعیت ۲۰۰ می‌دهد', res.status === 200);
    check('Content-Type درست است', res.headers.get('Content-Type').includes('text/calendar'));
    const body = await res.text();
    check('محتوای تسک در پاسخ هست', body.includes('ویزیت دکتر رضایی'));

    res = await worker.fetch(new Request('https://x/calendar/abc.ics'), env);
    check('کد نامعتبر رد می‌شود (400)', res.status === 400);
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  if (fail > 0) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
  else { console.log('همه چیز سالم است. ✓'); process.exit(0); }
})();
