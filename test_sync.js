/* ══════════════════════════════════════════════════════════
   test_sync.js — رگرسیون سینک چنددستگاهی DayQ
   اجرا: node test_sync.js
   نیاز: worker/index.js (برای منطق واقعی mergeById)
   ══════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');
const { mergeById } = require(path.resolve(__dirname, 'worker/index.js'));

const FILE = 'file://' + path.resolve(__dirname, 'DayQ.html');
let pass = 0, fail = 0;
const failures = [];
function check(label, cond) {
  if (cond) pass++;
  else { fail++; failures.push(label); console.log('❌ FAIL:', label); }
}

const seedTask = (over = {}) => Object.assign({
  id: 't' + Date.now() + Math.random().toString(36).slice(2, 6),
  text: 'تست', iconId: 'check', cat: 'prep', time: null, priority: 'high',
  status: 'todo', done: false, deadline: null, projectId: null,
  recur: 'none', recurBase: null, note: '', waitingFor: '', contact: '',
  fileLink: '', location: '', estimateMin: 0, phase: '', archived: false, completedAt: null
}, over);

(async () => {
  const browser = await chromium.launch();

  // ── سرور Worker ساختگی با منطق merge واقعی ──
  const store = new Map();
  async function fakeWorker(urlStr, bodyStr) {
    const body = bodyStr ? JSON.parse(bodyStr) : null;
    if (urlStr.includes('/sync/init')) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      store.set('sync:' + code, { tasks: [], projects: [] });
      return { code };
    }
    if (urlStr.includes('/sync/push')) {
      const { code, tasks, projects } = body;
      const server = store.get('sync:' + code) || { tasks: [], projects: [] };
      const merged = { tasks: mergeById(tasks, server.tasks), projects: mergeById(projects, server.projects) };
      store.set('sync:' + code, merged);
      return merged;
    }
    return {};
  }

  async function makeDevice() {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.exposeFunction('__fakeWorker', fakeWorker);
    await page.addInitScript(() => {
      window.__realFetch = window.fetch;
      window.fetch = async (url, opts) => {
        if (typeof url === 'string' && url.includes('fake-worker')) {
          const data = await window.__fakeWorker(url, opts ? opts.body : null);
          return { ok: true, json: async () => data };
        }
        return window.__realFetch(url, opts);
      };
    });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(500);
    await page.evaluate(() => { cfg.pushWorkerUrl = 'https://fake-worker.example.com'; saveCfg(); });
    return page;
  }

  // ── ۱. اتحاد دوطرفه (هیچی گم نشود) ──
  {
    const A = await makeDevice(), B = await makeDevice();
    const code = await A.evaluate(async () => { const c = await initSyncCode(); cfg.syncCode = c; saveCfg(); return c; });

    await A.evaluate(async (t) => { tasks.push(t); saveAll(); await syncNow(); }, seedTask({ id: 'phone1' }));
    await B.evaluate(async (c) => { cfg.syncCode = c; saveCfg(); await syncNow(); }, code);
    check('دستگاه دوم بعد از وصل‌شدن، تسک دستگاه اول را دارد', await B.evaluate(() => !!tasks.find(t => t.id === 'phone1')));

    await B.evaluate(async (t) => { tasks.push(t); saveAll(); await syncNow(); }, seedTask({ id: 'laptop1' }));
    await A.evaluate(async () => { await syncNow(); });
    const aIds = await A.evaluate(() => tasks.map(t => t.id).sort());
    check('دستگاه اول بعد از سینک مجدد، هر دو تسک را دارد', JSON.stringify(aIds) === JSON.stringify(['laptop1', 'phone1']));

    await A.close(); await B.close();
  }

  // ── ۲. انتشار حذف ──
  {
    const A = await makeDevice(), B = await makeDevice();
    const code = await A.evaluate(async () => { const c = await initSyncCode(); cfg.syncCode = c; saveCfg(); return c; });
    await A.evaluate(async (t) => { tasks.push(t); saveAll(); await syncNow(); }, seedTask({ id: 'delMe' }));
    await B.evaluate(async (c) => { cfg.syncCode = c; saveCfg(); await syncNow(); }, code);

    await A.evaluate(async () => { tasks = tasks.filter(t => t.id !== 'delMe'); saveAll(); await syncNow(); });
    await B.evaluate(async () => { await syncNow(); });
    check('حذف از یک دستگاه، در دستگاه دیگر هم اعمال می‌شود', await B.evaluate(() => !tasks.find(t => t.id === 'delMe')));

    await A.close(); await B.close();
  }

  // ── ۳. ویرایش جدیدتر، روی حذف قدیمی‌تر برنده است (در هر دو دستگاه) ──
  {
    const A = await makeDevice(), B = await makeDevice();
    const code = await A.evaluate(async () => { const c = await initSyncCode(); cfg.syncCode = c; saveCfg(); return c; });
    await A.evaluate(async (t) => { tasks.push(t); saveAll(); await syncNow(); }, seedTask({ id: 'shared1', text: 'اصلی' }));
    await B.evaluate(async (c) => { cfg.syncCode = c; saveCfg(); await syncNow(); }, code);

    await A.evaluate(async () => { tasks = tasks.filter(t => t.id !== 'shared1'); saveAll(); await syncNow(); });
    await B.evaluate(async () => { tasks.find(t => t.id === 'shared1').text = 'ویرایش مهم'; saveAll(); });
    await new Promise(r => setTimeout(r, 30));
    await B.evaluate(async () => { await syncNow(); });
    check('ویرایش روی لپ‌تاپ، حذف قدیمی‌تر را خنثی کرد', await B.evaluate(() => tasks.find(t => t.id === 'shared1')?.text === 'ویرایش مهم'));

    await A.evaluate(async () => { await syncNow(); });
    check('گوشی هم بعد از سینک مجدد همان نسخهٔ ویرایش‌شده را می‌بیند', await A.evaluate(() => tasks.find(t => t.id === 'shared1')?.text === 'ویرایش مهم'));

    await A.close(); await B.close();
  }

  await browser.close();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  if (fail > 0) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
  else { console.log('همه چیز سالم است. ✓'); process.exit(0); }
})();
