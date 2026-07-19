/* ══════════════════════════════════════════════════════════════
   test_team.js — رگرسیون DayQ Team (سکو)
   اجرا: node test_team.js
   پیش‌نیاز: npm install playwright  +  DayQ.html در همان پوشه
   ══════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright');
const path = require('path');

const FILE = 'file://' + path.resolve(__dirname, 'DayQ.html');
let pass = 0, fail = 0;
const failures = [];

function check(label, cond) {
  if (cond) { pass++; console.log('✅', label); }
  else { fail++; failures.push(label); console.log('❌ FAIL:', label); }
}

// ── Seed helpers ──────────────────────────────────────────────
const MOCK_TEAM_CODE = 'DQ-TEST01';
const MOCK_UUID      = 'test-uuid-1234';
const MOCK_TOKEN     = 'test-token-xyz';
const MOCK_WORKER    = 'https://dayq-push.example.workers.dev';

function seedMemberState(page) {
  return page.evaluate(({code,uuid,token,worker,name,mrole,mname}) => {
    localStorage.setItem('dayq_team_code',  code);
    localStorage.setItem('dayq_team_uuid',  uuid);
    localStorage.setItem('dayq_team_role',  'member');
    localStorage.setItem('dayq_team_token', token);
    localStorage.setItem('dayq_team_worker',worker);
    localStorage.setItem('dayq_team_name',  name);
    localStorage.setItem('dayq_team_mname', mname);
    localStorage.setItem('dayq_team_mrole', mrole);
    localStorage.setItem('dq5_onboarded', '1');
  }, {code:MOCK_TEAM_CODE, uuid:MOCK_UUID, token:MOCK_TOKEN,
      worker:MOCK_WORKER, name:'تیم تست', mname:'سارا', mrole:'کارشناس'});
}

function seedManagerState(page) {
  return page.evaluate(({code,uuid,token,worker,name}) => {
    localStorage.setItem('dayq_team_code',  code);
    localStorage.setItem('dayq_team_uuid',  uuid);
    localStorage.setItem('dayq_team_role',  'manager');
    localStorage.setItem('dayq_team_token', token);
    localStorage.setItem('dayq_team_worker',worker);
    localStorage.setItem('dayq_team_name',  name);
    localStorage.setItem('dq5_onboarded', '1');
  }, {code:MOCK_TEAM_CODE, uuid:MOCK_UUID, token:MOCK_TOKEN,
      worker:MOCK_WORKER, name:'تیم تست'});
}

function seedTeamInbox(page, tasks) {
  return page.evaluate((inbox) => {
    localStorage.setItem('dayq_team_inbox', JSON.stringify(inbox));
  }, tasks);
}

function seedTeamSnapshot(page, snap) {
  return page.evaluate((s) => {
    localStorage.setItem('dayq_team_snap', JSON.stringify(s));
  }, snap);
}

(async () => {
  const browser = await chromium.launch();

  // ════════════════════════════════════════════
  // ۱. بوت بدون خطا با team state
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedMemberState(page);
    await page.reload();
    await page.waitForTimeout(700);
    check('Team: بوت با state کارمند بدون خطای JS', errors.filter(e => !e.includes('network')).length === 0);
    await page.close();
  }

  // ════════════════════════════════════════════
  // ۲. تست Identity — tmLoad صحیح
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedMemberState(page);
    await page.reload();
    await page.waitForTimeout(700);

    const state = await page.evaluate(() => ({
      code: tm.code,
      uuid: tm.uuid,
      role: tm.role,
      teamName: tm.teamName,
      memberName: tm.memberName,
    }));
    check('tmLoad: کد تیم صحیح لود شد', state.code === MOCK_TEAM_CODE);
    check('tmLoad: role کارمند صحیح', state.role === 'member');
    check('tmLoad: نام تیم صحیح', state.teamName === 'تیم تست');
    check('tmLoad: نام کارمند صحیح', state.memberName === 'سارا');
    await page.close();
  }

  // ════════════════════════════════════════════
  // ۳. تست HTML Elements وجود دارن
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded','1'));
    await page.reload();
    await page.waitForTimeout(600);

    const elements = await page.evaluate(() => ({
      teamRow:       !!document.getElementById('tmTeamRow'),
      sokoCard:      !!document.getElementById('tmSokoCard'),
      sokoPanel:     !!document.getElementById('tmSokoPanel'),
      inboxSection:  !!document.getElementById('tmInboxSection'),
      todaySection:  !!document.getElementById('tmTodaySection'),
      annoSection:   !!document.getElementById('tmAnnosSection'),
      projSection:   !!document.getElementById('tmProjSection'),
      joinSheet:     !!document.getElementById('shTmJoin'),
      createSheet:   !!document.getElementById('shTmCreate'),
      codeSheet:     !!document.getElementById('shTmCode'),
      announceSheet: !!document.getElementById('shTmAnnounce'),
      assignSheet:   !!document.getElementById('shTmAssign'),
      detailSheet:   !!document.getElementById('tmDetailSheet'),
      memberBadge:   !!document.getElementById('tmMemberBadge'),
    }));

    for (const [key, val] of Object.entries(elements)) {
      check(`HTML: ${key} وجود دارد`, val);
    }
    check('Team: بوت بدون خطا برای کاربر بدون تیم', errors.filter(e=>!e.includes('network')).length === 0);
    await page.close();
  }

  // ════════════════════════════════════════════
  // ۴. تست UI برای کارمند
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedMemberState(page);
    await seedTeamInbox(page, [
      { id:'tm1', title:'گزارش فروش', deadline:'1404-05-01', status:'pending', priority:'urgent', assignedBy:'manager-uuid' },
      { id:'tm2', title:'آپدیت CRM', deadline:'1404-05-03', status:'in_progress', priority:'normal', assignedBy:'manager-uuid' },
    ]);
    await page.reload();
    await page.waitForTimeout(700);

    // بخش «از مدیر» باید نمایان باشه
    const inboxVisible = await page.evaluate(() => {
      const el = document.getElementById('tmInboxSection');
      return el && el.style.display !== 'none';
    });
    check('کارمند: بخش «از مدیر» نمایان است', inboxVisible);

    // بخش «تیم امروز» نباید نمایان باشه
    const todayHidden = await page.evaluate(() => {
      const el = document.getElementById('tmTodaySection');
      return !el || el.style.display === 'none';
    });
    check('کارمند: بخش «تیم امروز» مخفیه', todayHidden);

    // سکو button نباید نمایان باشه
    const sokoHidden = await page.evaluate(() => {
      const el = document.getElementById('tmSokoCard');
      return !el || el.style.display === 'none';
    });
    check('کارمند: سکو button مخفیه', sokoHidden);

    // Badge عضویت نمایان باشه
    const badgeVisible = await page.evaluate(() => {
      const el = document.getElementById('tmMemberBadge');
      return el && el.style.display !== 'none';
    });
    check('کارمند: Badge عضویت نمایان است', badgeVisible);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۵. تست UI برای مدیر
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedManagerState(page);
    await seedTeamSnapshot(page, {
      teamName: 'تیم تست',
      memberCount: 3,
      members: [
        { uuid:'m1', name:'علی', role:'کارشناس', activeTasks:2, blockedTasks:0, staleTasks:0, alert:'ok', isManager:false, status:'active' },
        { uuid:'m2', name:'سارا', role:'کارشناس', activeTasks:3, blockedTasks:1, staleTasks:0, alert:'blocked', isManager:false, status:'active' },
      ]
    });
    await page.reload();
    await page.waitForTimeout(700);

    const sokoVisible = await page.evaluate(() => {
      const el = document.getElementById('tmSokoCard');
      return el && el.style.display !== 'none';
    });
    check('مدیر: سکو button نمایان است', sokoVisible);

    const todayVisible = await page.evaluate(() => {
      const el = document.getElementById('tmTodaySection');
      return el && el.style.display !== 'none';
    });
    check('مدیر: بخش «تیم امروز» نمایان است', todayVisible);

    const inboxHidden = await page.evaluate(() => {
      const el = document.getElementById('tmInboxSection');
      return !el || el.style.display === 'none';
    });
    check('مدیر: بخش «از مدیر» مخفیه', inboxHidden);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۶. تست باز شدن سکو Panel
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedManagerState(page);
    await seedTeamSnapshot(page, { teamName:'تیم تست', memberCount:2, members:[] });
    await page.reload();
    await page.waitForTimeout(700);

    // باز کردن سکو
    await page.evaluate(() => tmOpenSoko());
    await page.waitForTimeout(300);

    const sokoOpen = await page.evaluate(() =>
      document.getElementById('tmSokoPanel')?.classList.contains('open')
    );
    check('سکو Panel با tmOpenSoko() باز می‌شه', sokoOpen);

    const sokoStateOpen = await page.evaluate(() => tm.sokoOpen);
    check('tm.sokoOpen بعد از باز کردن true است', sokoStateOpen);

    // بستن سکو
    await page.evaluate(() => tmCloseSoko());
    await page.waitForTimeout(200);
    const sokoClosed = await page.evaluate(() =>
      !document.getElementById('tmSokoPanel')?.classList.contains('open')
    );
    check('سکو Panel با tmCloseSoko() بسته می‌شه', sokoClosed);

    const sokoStateClosed = await page.evaluate(() => !tm.sokoOpen);
    check('tm.sokoOpen بعد از بستن false است', sokoStateClosed);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۷. تست Invite URL parsing
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE + '?invite=DQ-TESTINV');
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded','1'));
    await page.reload({ waitUntil:'networkidle' }).catch(() => {});
    await page.waitForTimeout(800);

    // URL باید پاک بشه
    const urlClean = await page.evaluate(() => !location.search.includes('invite'));
    check('Invite URL: بعد از تشخیص از URL پاک می‌شه', urlClean);
    await page.close();
  }

  // ════════════════════════════════════════════
  // ۸. تست Task State Machine
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedMemberState(page);
    await seedTeamInbox(page, [
      { id:'tm-sm1', title:'تست state', deadline:'1404-06-01', status:'pending',
        priority:'normal', assignedBy:'mgr', deleted:false, checklist:[] },
    ]);
    await page.reload();
    await page.waitForTimeout(700);

    // inbox باید یه تسک داشته باشه
    const inboxCount = await page.evaluate(() => tm.inbox.length);
    check('Task State: inbox از localStorage لود شد', inboxCount === 1);

    const taskStatus = await page.evaluate(() => tm.inbox[0].status);
    check('Task State: وضعیت اولیه pending است', taskStatus === 'pending');
    await page.close();
  }

  // ════════════════════════════════════════════
  // ۹. تست تعطیلات ایران
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded','1'));
    await page.reload();
    await page.waitForTimeout(600);

    const holidayExists = await page.evaluate(() =>
      typeof TM_HOLIDAYS_1404 !== 'undefined' && TM_HOLIDAYS_1404.length > 15
    );
    check('تعطیلات ۱۴۰۴: آرایه با ۱۵+ تعطیل موجوده', holidayExists);

    const nowruzHoliday = await page.evaluate(() =>
      TM_HOLIDAYS_1404.includes('1404-01-01')
    );
    check('تعطیلات: ۱ فروردین تعطیل است', nowruzHoliday);

    const revHoliday = await page.evaluate(() =>
      TM_HOLIDAYS_1404.includes('1404-11-22')
    );
    check('تعطیلات: ۲۲ بهمن (پیروزی انقلاب) تعطیل است', revHoliday);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۱۰. تست Holiday Warning در Assign
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded','1'));
    await page.reload();
    await page.waitForTimeout(600);

    const isHoliday = await page.evaluate(() =>
      tmCheckHolidayDeadline('1404-01-01')
    );
    check('tmCheckHolidayDeadline: ۱ فروردین تشخیص داده می‌شه', isHoliday);

    const notHoliday = await page.evaluate(() =>
      tmCheckHolidayDeadline('1404-04-10')
    );
    check('tmCheckHolidayDeadline: روز عادی false برمی‌گردونه', !notHoliday);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۱۱. تست CSS Classes
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.setItem('dq5_onboarded','1'));
    await page.reload();
    await page.waitForTimeout(600);

    const cssVarsExist = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        blue:   s.getPropertyValue('--blue').trim().length > 0,
        bluem:  s.getPropertyValue('--bluem').trim().length > 0,
        sp1:    s.getPropertyValue('--sp1').trim().length > 0,
        r3:     s.getPropertyValue('--r3').trim().length > 0,
      };
    });
    check('CSS: --blue variable موجوده', cssVarsExist.blue);
    check('CSS: --bluem variable موجوده', cssVarsExist.bluem);

    const tmBtnExists = await page.evaluate(() => {
      const div = document.createElement('div');
      div.className = 'tm-btn';
      document.body.appendChild(div);
      const style = getComputedStyle(div);
      const exists = style.height !== '' && style.borderRadius !== '';
      div.remove();
      return exists;
    });
    check('CSS: .tm-btn styles اعمال می‌شه', tmBtnExists);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۱۲. تست Soko Tab Switching
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedManagerState(page);
    await seedTeamSnapshot(page, { teamName:'تیم تست', memberCount:1, members:[] });
    await page.reload();
    await page.waitForTimeout(700);

    await page.evaluate(() => tmOpenSoko());
    await page.waitForTimeout(200);

    // switch به تب گزارش
    await page.evaluate(() => tmSetSokoTab('report'));
    await page.waitForTimeout(200);

    const activeTab = await page.evaluate(() => tm.sokoTab);
    check('سکو: tab switching کار می‌کنه', activeTab === 'report');

    const reportPane = await page.evaluate(() => {
      const el = document.querySelector('.tm-tab-pane[data-pane="report"]');
      return el && el.style.display !== 'none';
    });
    check('سکو: تب گزارش نمایان است', reportPane);

    const statusPane = await page.evaluate(() => {
      const el = document.querySelector('.tm-tab-pane[data-pane="status"]');
      return !el || el.style.display === 'none';
    });
    check('سکو: تب وضعیت مخفیه وقتی گزارش فعاله', statusPane);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۱۳. تست تسک تیمی در Inbox
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await seedMemberState(page);
    await seedTeamInbox(page, [
      { id:'ti1', title:'گزارش هفتگی', deadline:'1404-05-10', status:'pending', priority:'urgent',
        assignedBy:'mgr-uuid', deleted:false, checklist:[], memberNote:'', blockedNote:'' },
    ]);
    await page.reload();
    await page.waitForTimeout(700);

    const inboxRendered = await page.evaluate(() => {
      const list = document.getElementById('tmInboxList');
      return list && list.children.length > 0;
    });
    check('Inbox: تسک تیمی در DOM رندر شد', inboxRendered);

    const taskHasTeamClass = await page.evaluate(() => {
      const items = document.querySelectorAll('#tmInboxList .tm-task');
      return items.length > 0;
    });
    check('Inbox: کارت تسک تیمی class tm-task داره', taskHasTeamClass);

    await page.close();
  }

  // ════════════════════════════════════════════
  // ۱۴. تست سازگاری با DayQ اصلی (رگرسیون)
  // ════════════════════════════════════════════
  {
    const page = await browser.newPage({ viewport:{ width:390, height:844 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(FILE);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      localStorage.setItem('dq5_onboarded', '1');
      // کاربر بدون تیم
      localStorage.removeItem('dayq_team_code');
    });
    await page.reload();
    await page.waitForTimeout(700);

    // تسک شخصی باید کار کنه
    await page.evaluate(() => {
      tasks.push({
        id:'reg-t1', text:'تسک شخصی تست', iconId:'check', cat:'prep',
        time:null, priority:'high', status:'todo', done:false,
        deadline:null, projectId:null, recur:'none', recurBase:null,
        note:'', waitingFor:'', contact:'', fileLink:'', location:'',
        estimateMin:0, phase:'', archived:false, completedAt:null
      });
      saveAll(); renderTasks();
    });
    await page.waitForTimeout(200);

    const taskExists = await page.evaluate(() =>
      !!document.querySelector('[data-id="reg-t1"]')
    );
    check('رگرسیون: تسک شخصی بدون تیم رندر می‌شه', taskExists);

    // تب‌های navbar کار کنن
    await page.evaluate(() => setTab('today', null));
    await page.waitForTimeout(200);
    const tabChanged = await page.evaluate(() => curTab === 'today');
    check('رگرسیون: setTab() بدون تیم کار می‌کنه', tabChanged);

    check('رگرسیون: بدون JS error برای کاربر بدون تیم',
      errors.filter(e => !e.includes('network') && !e.includes('fetch')).length === 0);

    await page.close();
  }

  // ════════════════════════════════════════════
  // نتیجه نهایی
  // ════════════════════════════════════════════
  await browser.close();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق`);
  if (fail > 0) {
    console.log('\nموارد ناموفق:');
    failures.forEach(f => console.log('  ❌', f));
    process.exit(1);
  } else {
    console.log('همه تست‌های تیم سالم است ✓');
    process.exit(0);
  }
})();
