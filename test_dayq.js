#!/usr/bin/env node
/**
 * DayQ Test Suite
 * run: node test_dayq.js
 * قبل از هر push اجرا کن
 */

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

let passed = 0, failed = 0, warns = 0;
const results = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      passed++;
      results.push(`  ✅ ${name}`);
    } else if (result === 'warn') {
      warns++;
      results.push(`  ⚠️  ${name}`);
    } else {
      failed++;
      results.push(`  ❌ ${name}: ${result}`);
    }
  } catch(e) {
    failed++;
    results.push(`  ❌ ${name}: ${e.message}`);
  }
}

// ══ ۱. HTML STRUCTURE ══════════════════════════════
console.log('\n① HTML Structure');
test('script tag موجوده', () => html.includes('<script>') || 'script not found');
test('style tag موجوده', () => html.includes('<style>') || 'style not found');
test('pageHome موجوده', () => html.includes('id="pageHome"') || 'pageHome missing');
test('taskList موجوده', () => html.includes('id="taskList"') || 'taskList missing');
test('qcapInp موجوده', () => html.includes('id="qcapInp"') || 'qcapInp missing');
test('nav موجوده', () => html.includes('<nav') || 'nav missing');
test('HTML raw CSS نداره', () => {
  const raw = html.match(/>["'][a-z\-]+:[^"'<>]{2,80}["']>/g);
  return raw ? `${raw.length} raw CSS string: ${raw[0]}` : true;
});

// ══ ۲. SHEETS ══════════════════════════════════════
console.log('\n② Sheets');
const requiredSheets = ["shArchive", "shBag", "shBirthday", "shCardMore", "shCatPicker", "shDelConfirm", "shDeviceSync", "shNote", "shProjDelConfirm", "shProject", "shPush", "shRemind", "shTask", "shTeamTaskDetail", "shTimer", "shTmAnnounce", "shTmAssign", "shTmChoice", "shTmCode", "shTmConfirm", "shTmCreate", "shTmDirectLogin", "shTmInfo", "shTmJoin", "shTmPending", "shTmPin", "shTmRet", "shTriage", "shWorkHours", "tmDetailSheet"];
for (const sh of requiredSheets) {
  test(`${sh} در HTML`, () => html.includes(`id="${sh}"`) || `MISSING`);
}

// ══ ۳. JAVASCRIPT FUNCTIONS ════════════════════════
console.log('\n③ Core Functions');
const coreFns = [
  'boot','loadAll','saveAll','renderTasks','renderBag','goPage',
  'openSheet','closeAll','quickCapture','nlpParse',
  'renderBirthdayPage','renderProjects','calInit',
  '_idbRestoreCheck','_idbSave','_idbGet',
  'updateMeta','setGreeting','initWeather',
  'mkCard','mkCardWrap'
];
for (const fn of coreFns) {
  test(`function ${fn}`, () => {
    const exists = html.includes(`function ${fn}(`) || html.includes(`async function ${fn}(`);
    return exists || 'MISSING';
  });
}

// ══ ۴. GLOBAL VARIABLES ════════════════════════════
console.log('\n④ Global Variables');
const globals = ['tasks','cfg','birthdays','projects','curTab','IR_HOLIDAYS','iconMap'];
for (const v of globals) {
  test(`${v} تعریف شده`, () => {
    const rx = new RegExp(`(?:const|let|var)\\s+${v}\\b`);
    return rx.test(html) || 'NOT DECLARED';
  });
}

// ══ ۵. CSS ══════════════════════════════════════════
console.log('\n⑤ CSS');
const cssContent = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
const cssVars = ['--a','--bg1','--bg2','--t1','--t2','--r2','--fs-sm','--sp3'];
for (const v of cssVars) {
  test(`CSS var ${v}`, () => cssContent.includes(v) || 'MISSING');
}
test('animation:both روی .page نیست', () => {
  const pageActive = cssContent.match(/\.page\.active\s*\{[^}]+\}/g) || [];
  const hasBoth = pageActive.some(r => r.includes('both'));
  return hasBoth ? 'WARNING: animation:both on .page.active' : true;
});
test('tc-list-anim animation', () => {
  return cssContent.includes('tc-list-anim') || 'tc-list-anim missing';
});

// ══ ۶. DUPLICATE CHECK ═════════════════════════════
console.log('\n⑥ Duplicates');
test('boot فقط یه بار', () => {
  const matches = (html.match(/\nboot\(\);/g) || []).length;
  const commented = (html.match(/\/\/ boot already/g) || []).length;
  const actual = matches - commented;
  return actual <= 1 || `boot() ${actual}x — should be 1`;
});
test('duplicate iconMap نداره', () => {
  const count = (html.match(/const iconMap/g) || []).length;
  return count <= 1 || `iconMap declared ${count}x`;
});
test('duplicate _idbRestoreCheck نداره', () => {
  const count = (html.match(/function _idbRestoreCheck/g) || []).length;
  return count <= 1 || `_idbRestoreCheck ${count}x`;
});

// ══ ۷. STORAGE KEYS ════════════════════════════════
console.log('\n⑦ Storage Keys');
const saveAllFn = html.match(/function saveAll\(\)\{[\s\S]{1,2000}?\}/)?.[0] || '';
const loadAllFn = html.match(/function loadAll\(\)\{[\s\S]{1,2000}?\}/)?.[0] || '';
const saveKeys = [...saveAllFn.matchAll(/setItem\('([^']+)'/g)].map(m=>m[1]);
const loadKeys = [...loadAllFn.matchAll(/getItem\('([^']+)'/g)].map(m=>m[1]);
test('saveAll و loadAll هر دو کامل', () => {
  const saveCount = (html.match(/setItem\(/g) || []).length;
  const loadCount = (html.match(/getItem\(/g) || []).length;
  return (saveCount >= 3 && loadCount >= 3) || `save:${saveCount} load:${loadCount}`;
});

// ══ ۸. SOKO ════════════════════════════════════════
console.log('\n⑧ Soko');
test('tmInit موجوده', () => html.includes('function tmInit(') || 'MISSING');
test('tmSyncBackground موجوده', () => html.includes('function tmSyncBackground(') || 'MISSING');
test('calDayPanel hide', () => html.includes('_cdp.style.display') || 'calDayPanel fix missing');

// ══ نتیجه ══════════════════════════════════════════
console.log('\n' + '='.repeat(50));
console.log(`RESULT: ${passed} passed, ${failed} failed, ${warns} warnings`);
console.log('='.repeat(50));
results.forEach(r => console.log(r));

if (failed > 0) {
  console.log(`\n🚫 ${failed} tests failed — push نکن!`);
  process.exit(1);
} else {
  console.log(`\n✅ همه tests pass — safe to push`);
  process.exit(0);
}
