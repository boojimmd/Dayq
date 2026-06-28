/* ══════════════════════════════════════════════════════
   test_dayq.js — رگرسیون اصلی DayQ
   اجرا: node test_dayq.js
   هدف: قبل از شروع هر تغییر جدید، این را اجرا کن.
   اگر چیزی FAIL داد، یعنی یک فیچر قبلی جایی خراب شده —
   دقیقاً همان مشکلی که با «این‌عصر» و «ساعت‌های قابل‌تنظیم» افتاد.
   ══════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'DayQ.html');
let pass = 0, fail = 0;
const failures = [];

function check(label, cond) {
  if (cond) { pass++; }
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

  // ── ۱. بوت بدون خطا (دسکتاپ عریض، دقیقاً سناریوی باگ ویندوز) ──
  {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE);
    await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(600);
    check('بوت بدون خطای JS', errors.length === 0);

    // مرکزسازی روی صفحهٔ عریض
    const rects = await page.evaluate(() => ({
      app: document.getElementById('app').getBoundingClientRect(),
      topbar: document.querySelector('.topbar').getBoundingClientRect(),
      pg: document.querySelector('.page.active').getBoundingClientRect(),
    }));
    const expLeft = (1920 - 600) / 2;
    check('عرض ویندوز: #app وسط‌چین', Math.abs(rects.app.left - expLeft) < 2);
    check('عرض ویندوز: topbar وسط‌چین', Math.abs(rects.topbar.left - expLeft) < 2);
    check('عرض ویندوز: صفحهٔ اصلی وسط‌چین', Math.abs(rects.pg.left - expLeft) < 2);

    // باز/بسته‌شدن شیت با کلیک واقعی (همان باگ اصلی ویندوز)
    await page.evaluate((t) => { tasks.push(t); saveAll(); renderTasks(); }, seedTask({ id: 'reg1' }));
    await page.click('[data-id="reg1"]');
    await page.waitForTimeout(350);
    const openOk = await page.evaluate(() => document.getElementById('shNote').classList.contains('open'));
    check('شیت با کلیک باز می‌شود', openOk);
    await page.click('#shNote .sh-x');
    await page.waitForTimeout(350);
    const closedOk = await page.evaluate(() => !document.getElementById('shNote').classList.contains('open'));
    check('شیت با کلیک X بسته می‌شود', closedOk);

    await page.close();
  }

  // ── ۲. تست‌های عمومی روی ویوپورت موبایل ──
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(FILE);
    await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(500);

    // Escape با فوکوس روی input باید ببندد
    await page.evaluate((t) => { tasks.push(t); saveAll(); renderTasks(); }, seedTask({ id: 'reg2' }));
    await page.click('[data-id="reg2"]');
    await page.waitForTimeout(300);
    await page.focus('#editTaskTxt').catch(() => {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    check('Escape با فوکوس روی input می‌بندد', await page.evaluate(() => !document.getElementById('shNote').classList.contains('open')));

    // حذف از منوی کارت (بدون confirm بومی)
    await page.evaluate((t) => { tasks.push(t); saveAll(); renderTasks(); }, seedTask({ id: 'regDel' }));
    await page.click('[data-id="regDel"] .tc-more');
    await page.waitForTimeout(200);
    await page.click('.card-more-row.danger');
    await page.waitForTimeout(200);
    await page.click('#shDelConfirm .btn.danger');
    await page.waitForTimeout(200);
    check('حذف از منوی کارت بدون confirm بومی', await page.evaluate(() => !tasks.find(t => t.id === 'regDel')));

    // تب‌بندی نوار پایین — pill فعال
    const homeActive = await page.evaluate(() => document.querySelector('.ni.active')?.querySelector('.ni-lbl')?.textContent);
    check('نوار پایین: خانه فعال با لیبل', !!homeActive);

    // ظرفیت روز
    await page.evaluate(() => {
      tasks.push(Object.assign({}, tasks[0], { id: 'regCap', estimateMin: 60, deadline: mrTodayKey() }));
      cfg.workEndTime = '23:59'; saveCfg(); saveAll(); renderTasks();
    });
    await page.waitForTimeout(200);
    const capShown = await page.evaluate(() => document.getElementById('capBanner').style.display === 'block');
    check('بنر ظرفیت با تسک تخمین‌دار نمایش داده می‌شود', capShown);

    await page.close();
  }

  // ── ۳. پروژه‌ها: چرخهٔ کامل ──
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(FILE);
    await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      projects.push({ id: 'pReg', name: 'پروژهٔ تست', color: '#00b87a', deadline: null, notes: '', createdAt: Date.now(), archived: false });
      tasks.push(Object.assign({}, tasks[0] || {}, { id: 'regP1', text: 'کار پروژه', projectId: 'pReg', phase: 'فاز ۱', status: 'todo', done: false, archived: false }));
      saveProjects(); saveAll();
    });
    await page.evaluate(() => goPage('Projects'));
    await page.waitForTimeout(300);
    const hasPhaseHdr = await page.evaluate(() => !!document.querySelector('.proj-phase-hdr'));
    check('سربرگ فاز در پروژه دیده می‌شود', hasPhaseHdr);

    // بستن پروژه (آرشیو) و چک رفتنش به بخش بسته‌شده
    await page.evaluate(() => { editingProjId = 'pReg'; closeProject(); });
    await page.waitForTimeout(200);
    const archivedRow = await page.evaluate(() => !!document.querySelector('.proj-archived-row'));
    check('پروژهٔ بسته‌شده در بخش جدا دیده می‌شود', archivedRow);
    const stillActive = await page.evaluate(() => !document.querySelector(`.proj-card[data-pid="pReg"]`));
    check('پروژهٔ بسته دیگر در لیست فعال نیست', stillActive);

    await page.close();
  }

  // ── ۴. آرشیو خودکار تسک قدیمی ──
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(FILE);
    await page.waitForTimeout(400);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(500);

    await page.evaluate((t) => {
      const old = Object.assign({}, t, { id: 'regOld', status: 'done', done: true, completedAt: Date.now() - 40 * 86400000 });
      const recent = Object.assign({}, t, { id: 'regRecent', status: 'done', done: true, completedAt: Date.now() - 2 * 86400000 });
      tasks.push(old, recent); saveAll();
    }, seedTask());
    const archivedCount = await page.evaluate(() => runAutoArchive());
    check('فقط تسک قدیمی آرشیو می‌شود', archivedCount === 1);
    const oldArchived = await page.evaluate(() => tasks.find(t => t.id === 'regOld')?.archived === true);
    const recentNot = await page.evaluate(() => tasks.find(t => t.id === 'regRecent')?.archived === false);
    check('تسک قدیمی archived=true شد', oldArchived);
    check('تسک تازه دست‌نخورده ماند', recentNot);

    await page.close();
  }

  // ── موتور تقسیم چندتسکی (nlpSplitSegments) — رگرسیون ضدحذف‌تصادفی ──
  {
    const page = await browser.newPage();
    await page.goto(FILE);
    await page.waitForTimeout(300);

    const exists = await page.evaluate(() => typeof nlpSplitSegments === 'function');
    check('تابع nlpSplitSegments وجود دارد (نباید دوباره حذف شود)', exists);

    if (exists) {
      const r1 = await page.evaluate((txt) => nlpSplitSegments(txt), 'زنگ به رضا فردا، جلسه با علی پسفردا ساعت ۳');
      check('تقسیم پایهٔ دو تسک با ویرگول کار می‌کند', r1.length === 2);

      const r2 = await page.evaluate((txt) => nlpSplitSegments(txt), 'تماس با رضا فردا');
      check('یک‌جمله بدون ویرگول، تقسیم نمی‌شود', r2.length === 1);

      // وصل‌بودن به quickCapture
      await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
      await page.reload();
      await page.waitForTimeout(500);
      await page.fill('#qcapInp', 'زنگ به رضا فردا، جلسه با علی پسفردا ساعت ۳');
      await page.click('#qcapGo');
      await page.waitForTimeout(200);
      const taskCount = await page.evaluate(() => tasks.length);
      check('quickCapture با ویرگول واقعاً ۲ تسک می‌سازد (نه ۱)', taskCount === 2);
    }

    await page.close();
  }

  // ── فیکس: چند کار پشت‌سرهم با Quick Capture، همه باید تاریخ امروز بگیرند ──
  {
    const page = await browser.newPage();
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForTimeout(500);
    for (const c of ['کار یک', 'کار دو', 'کار سه']) {
      await page.fill('#qcapInp', c);
      await page.click('#qcapGo');
      await page.waitForTimeout(80);
    }
    const todayCount = await page.evaluate(() => tasks.filter(t => t.deadline === mrTodayKey()).length);
    check('چند کار پشت‌سرهم بدون تاریخ صریح، همه امروز می‌گیرند (نه فقط اولی)', todayCount === 3);
    await page.close();
  }

  // ── فیکس: \b با حروف فارسی کار نمی‌کند — باعث ادغام غلط می‌شد ──
  {
    const page = await browser.newPage();
    await page.goto(FILE);
    await page.waitForTimeout(300);
    const realSentence = 'زنگ بزنم به دکتر، تا فردا داسپورت رضا رو بگیرم ، تا سه روز دیگه برم داروخانه، شنبه هفت بعد آمار رو بفرستم مرکز، ساعت سه فردا ماشین هماهنگ بشه، پس فردا فایل ها آماده باشه تا ساعت ۲ ظهر';
    const r = await page.evaluate((txt) => nlpSplitSegments(txt), realSentence);
    check('جملهٔ واقعی پیچیده درست به ۶ بخش تقسیم می‌شود (نه ۴، باگ \\\\b)', r.length === 6);
    await page.close();
  }

  // ── عملکرد: رندر ۲۰۰ تسک باید زیر ۱۵۰ میلی‌ثانیه بماند (DocumentFragment) ──
  {
    const page = await browser.newPage();
    await page.goto(FILE);
    await page.waitForLoadState('load');
    await page.evaluate(() => localStorage.setItem('dq5_onboarded', '1'));
    await page.reload();
    await page.waitForLoadState('load');
    await page.evaluate(() => {
      tasks = [];
      for (let i = 0; i < 200; i++) {
        tasks.push({ id: 'perf' + i, text: 'تسک ' + i, iconId: 'check', cat: 'prep', time: null, priority: 'high', status: 'todo', done: false, deadline: mrTodayKey(), projectId: null, recur: 'none', recurBase: null, note: '', waitingFor: '', contact: '', fileLink: '', location: '', estimateMin: 0, phase: '', archived: false, completedAt: null });
      }
      saveAll();
    });
    const dur = await page.evaluate(() => {
      const t0 = performance.now();
      renderTasks();
      return performance.now() - t0;
    });
    check('رندر ۲۰۰ تسک زیر ۱۵۰ میلی‌ثانیه است (نه ~۳۰۰ مثل قبل از DocumentFragment)', dur < 150);
    await page.close();
  }

  await browser.close();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  if (fail > 0) {
    console.log('موارد ناموفق:');
    failures.forEach(f => console.log('  - ' + f));
    process.exit(1);
  } else {
    console.log('همه چیز سالم است. ✓');
    process.exit(0);
  }
})();
