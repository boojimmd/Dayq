/* ══════════════════════════════════════════════════════════════
   test_team_node.js — تست‌های DayQ Team بدون browser (Node.js + jsdom)
   اجرا: node test_team_node.js
   ══════════════════════════════════════════════════════════════ */
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const failures = [];

function check(label, cond) {
  if (cond) { pass++; console.log('✅', label); }
  else { fail++; failures.push(label); console.log('❌ FAIL:', label); }
}

// خوندن DayQ.html
const html = fs.readFileSync(path.join(__dirname, 'DayQ.html'), 'utf-8');
check('DayQ.html: فایل موجود است', html.length > 100000);

// بررسی HTML elements مهم
const checks = {
  'tmTeamRow':       'id="tmTeamRow"',
  'tmSokoCard':      'id="tmSokoCard"',
  'tmSokoPanel':     'id="tmSokoPanel"',
  'tmInboxSection':  'id="tmInboxSection"',
  'tmTodaySection':  'id="tmTodaySection"',
  'tmAnnosSection':  'id="tmAnnosSection"',
  'tmProjSection':   'id="tmProjSection"',
  'shTmJoin':        'id="shTmJoin"',
  'shTmCreate':      'id="shTmCreate"',
  'shTmCode':        'id="shTmCode"',
  'shTmAnnounce':    'id="shTmAnnounce"',
  'shTmAssign':      'id="shTmAssign"',
  'tmDetailSheet':   'id="tmDetailSheet"',
  'tmMemberBadge':   'id="tmMemberBadge"',
  'tmTodayBody':     'id="tmTodayBody"',
  'tmInboxList':     'id="tmInboxList"',
  'tmTodayAlertBadge': 'id="tmTodayAlertBadge"',
};

for (const [name, selector] of Object.entries(checks)) {
  check(`HTML Element: ${name}`, html.includes(selector));
}

// بررسی JS Functions
const jsStart = html.indexOf('<script>');
const jsEnd   = html.lastIndexOf('</script>');
const js = html.slice(jsStart + 8, jsEnd);

const jsFunctions = [
  'function tmLoad',
  'function tmSaveState',
  'function tmClearState',
  'function tmAPI',
  'function tmInit',
  'function tmApplyUI',
  'function tmSyncBackground',
  'function tmRenderInbox',
  'function tmRenderTodaySection',
  'function tmOpenCreate',
  'function tmDoCreate',
  'function tmOpenJoin',
  'function tmDoJoin',
  'function tmOpenSoko',
  'function tmCloseSoko',
  'function tmSetSokoTab',
  'function tmRenderSokoStatus',
  'function tmRenderSokoReport',
  'function tmRenderSokoProjects',
  'function tmAssignTask',
  'function tmDoAssign',
  'function tmBuildAssignMemberOpts',
  'function tmOpenTaskDetail',
  'function tmUpdateTaskStatus',
  'function tmMarkWaiting',
  'function tmToggleCheck',
  'function tmRenderAnnouncements',
  'function tmMarkAnnoRead',
  'function tmDoAnnounce',
  'function tmRegisterTeamPush',
  'function tmOpenMemberDetail',
  'function tmCheckWeeklyReport',
  'function tmCheckHolidayDeadline',
  'function tmAddCalendarMarkers',
  'function tmRenderTeamProjects',
  'function tmMarkIranHolidays',
  'function tmToggleTodayBody',
  'function tmCopyCode',
  'function tmLeaveTeam',
  'function tmCheckPending',
  'function tmInjectMorningDigest',
];

for (const fn of jsFunctions) {
  check(`JS Function: ${fn.replace('function ','').replace('(','()')}`, js.includes(fn));
}

// بررسی CSS Classes
const cssStart = html.indexOf('<style>');
const cssEnd   = html.indexOf('</style>');
const css = html.slice(cssStart + 7, cssEnd);

const cssClasses = [
  '.tc.tm-task',
  '.tm-badge',
  '.tm-panel',
  '.tm-panel.open',
  '.tm-tabs',
  '.tm-tab.active',
  '.tm-member-card',
  '.tm-member-card.blocked',
  '.tm-score-bar',
  '.tm-score-fill',
  '.tm-soko-btn',
  '.tm-cal-dot',
  '.tm-cal-event',
  '.tm-cal-holiday',
  '.tm-today-card',
  '.tm-today-body.collapsed',
  '.tm-btn',
  '.tm-btn.primary',
  '.tm-btn.danger',
  '.tm-btn.blue',
  '.tm-count-badge',
  '.tm-alert-chip',
  '.tm-status-opt',
  '.tm-log',
  '.tm-code-text',
  '.tm-read-btn',
];

for (const cls of cssClasses) {
  check(`CSS Class: ${cls}`, css.includes(cls));
}

// بررسی CSS Variables استفاده شده
const teamCssSection = css.slice(css.indexOf('DayQ Team — سکو'));
const varsUsed = ['var(--blue)', 'var(--bluem)', 'var(--sp1)', 'var(--r2)', 'var(--dur-fast)', 'var(--t1)', 'var(--bg1)'];
for (const v of varsUsed) {
  check(`CSS: از ${v} استفاده شده`, teamCssSection.includes(v));
}

// بررسی اینکه هیچ hardcode رنگی نداریم (در CSS تیم)
const hardcodeColors = ['#2563eb', '#00b87a', '#e53e5a', '#d97706', '#f0f4f8', '#111827'];
for (const color of hardcodeColors) {
  const inTeamCSS = teamCssSection.includes(color);
  check(`CSS: رنگ hardcode ${color} در team CSS نیست`, !inTeamCSS);
}

// بررسی Storage Keys
const storageKeys = [
  "'dayq_team_code'",
  "'dayq_team_uuid'",
  "'dayq_team_role'",
  "'dayq_team_token'",
  "'dayq_team_worker'",
  "'dayq_team_name'",
  "'dayq_team_inbox'",
  "'dayq_team_snap'",
];
for (const key of storageKeys) {
  check(`Storage Key: ${key.replace(/'/g,'')}`, js.includes(key));
}

// بررسی Worker Endpoints
const endpoints = [
  "'/team/create'",
  "'/team/join'",
  "'/team/approve'",
  "'/team/session'",
  "'/team/subscribe'",
  "'/team/snapshot'",
  "'/task/assign'",
  "'/task/broadcast'",
  "'/task/update'",
  "'/announcement'",
  "'/team/calendar'",
  "'/report/weekly'",
];
for (const ep of endpoints) {
  check(`API Endpoint: ${ep.replace(/'/g,'')}`, js.includes(ep));
}

// بررسی تعطیلات ایران
const holidays = ['1404-01-01','1404-01-13','1404-11-22','1404-12-29'];
for (const h of holidays) {
  check(`Holiday: ${h}`, js.includes(`'${h}'`));
}

// بررسی Bug Fixes
const bugfixChecks = [
  ['Fix: tm.sokoOpen = true', "tm.sokoOpen = true"],
  ['Fix: null-safe tmApplyUI', "try { _orig.apply"],
  ['Fix: Worker validation in tmDoCreate', "cfg.pushWorkerUrl"],
  ['Fix: Lazy DOM init', "_tmDOMReady"],
  ['Fix: Debounced calendar markers', "_calMarkerTimer"],
];
for (const [label, code] of bugfixChecks) {
  check(label, js.includes(code));
}

// بررسی اینکه boot() یه بار صدا زده می‌شه
const bootCount = (js.match(/^boot\(\);/m) || []).length;
check('boot() فقط یه بار در انتهای script صدا می‌شه', bootCount === 1);

// بررسی tmInit در boot()
const bootFn = js.slice(js.indexOf('function boot()'), js.indexOf('function boot()') + 2000);
check('tmInit() در boot() صدا زده می‌شه', bootFn.includes('tmInit()'));

// بررسی Worker v3
const workerHtml = fs.existsSync(path.join(__dirname, '../dayq-worker/index.js'))
  ? fs.readFileSync(path.join(__dirname, '../dayq-worker/index.js'), 'utf-8')
  : null;
if (workerHtml) {
  check('Worker v3: موجود است', true);
  check('Worker v3: /team/create endpoint', workerHtml.includes("'/team/create'") || workerHtml.includes('"/team/create"'));
} else {
  console.log('⚠️  Worker file برای test در دسترس نیست (از GitHub push شده)');
}

// نتیجه
console.log(`\n${'═'.repeat(50)}`);
console.log(`نتیجه: ${pass} موفق، ${fail} ناموفق از مجموع ${pass+fail}`);
if (fail > 0) {
  console.log('\nموارد ناموفق:');
  failures.forEach(f => console.log('  ❌', f));
  process.exit(1);
} else {
  console.log('🎉 همه تست‌ها پاس شدن!');
  process.exit(0);
}
