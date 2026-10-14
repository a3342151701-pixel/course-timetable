/*!
 * tools/test-parse.js — 无浏览器环境下验证 store.js / excel.js 的解析逻辑
 * 运行：node tools/test-parse.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

global.window = global;
global.XLSX = require('../vendor/xlsx.full.min.js');
global.localStorage = {
  _data: {},
  getItem(key) { return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null; },
  setItem(key, value) { this._data[key] = String(value); },
  removeItem(key) { delete this._data[key]; }
};

require('../js/sheet.js');
require('../js/store.js');
require('../js/excel.js');

const Store = global.Store;
const Excel = global.Excel;

let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log('  ok  ' + label);
  } else {
    failed++;
    console.log('  FAIL ' + label + '\n        期望: ' + JSON.stringify(expected) + '\n        实际: ' + JSON.stringify(actual));
  }
}

function section(title) {
  console.log('\n== ' + title + ' ==');
}

/* ---------------------------------------------------------------- 周次 */

section('周次解析');
check('1-16', Store.parseWeeks('1-16', 16).weeks.length, 16);
check('1-16 显示', Store.parseWeeks('1-16', 16).text, '1-16');
check('1-8,10-16 显示', Store.parseWeeks('1-8,10-16', 16).text, '1-8,10-16');
check('单周', Store.parseWeeks('1-16单周', 16).weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
check('双周显示', Store.parseWeeks('2-16双周', 16).text, '1-16双周');
check('中文数字', Store.parseWeeks('第一至十六周', 16).weeks.length, 16);
check('顿号分隔', Store.parseWeeks('1、3、5周', 16).weeks, [1, 3, 5]);
check('空值=全部', Store.parseWeeks('', 16).all, true);
check('全部', Store.parseWeeks('全部', 16).all, true);
check('只有单周', Store.parseWeeks('单周', 16).weeks, [1, 3, 5, 7, 9, 11, 13, 15]);
check('排序去重', Store.parseWeeks('5,1,5,3', 16).weeks, [1, 3, 5]);
check('局部双周显示', Store.parseWeeks('1-8双周', 16).text, '1-8双周');
check('局部双周周次', Store.parseWeeks('1-8双周', 16).weeks, [2, 4, 6, 8]);

/* ------------------------------------------------------------ 单元格解析 */

section('单元格文本解析');
const cases = [
  ['高等数学\n张伟\n三教201', { name: '高等数学', teacher: '张伟', location: '三教201', weeks: '' }],
  ['英语听说@语音室2', { name: '英语听说', teacher: '', location: '语音室2', weeks: '' }],
  ['编译原理\n(三教512)', { name: '编译原理', teacher: '', location: '三教512', weeks: '' }],
  ['计算机网络\n李强 教三401', { name: '计算机网络', teacher: '李强', location: '教三401', weeks: '' }],
  ['大学物理\n刘洋\n理科楼402\n1-16单周', { name: '大学物理', teacher: '刘洋', location: '理科楼402', weeks: '1-16单周' }],
  ['形势与政策\n直播课', { name: '形势与政策', teacher: '', location: '', weeks: '' }],
  ['程序设计 王强 机房A302', { name: '程序设计', teacher: '王强', location: '机房A302', weeks: '' }],
  ['大学英语\nLinda\n外语楼105', { name: '大学英语', teacher: 'Linda', location: '外语楼105', weeks: '' }],
  ['学术英语写作\nSmith\n外语楼206', { name: '学术英语写作', teacher: 'Smith', location: '外语楼206', weeks: '' }]
];
cases.forEach(([input, expected]) => {
  const parsed = Excel.parseCellText(input);
  check(
    '解析「' + input.replace(/\n/g, '/') + '」',
    { name: parsed.name, teacher: parsed.teacher, location: parsed.location, weeks: parsed.weeks },
    expected
  );
});

section('星期 / 节次解析');
check('星期一', Excel.parseWeekday('星期一'), 1);
check('周日', Excel.parseWeekday('周日'), 7);
check('周天', Excel.parseWeekday('周天'), 7);
check('Monday', Excel.parseWeekday('Monday'), 1);
check('Sun', Excel.parseWeekday('Sun'), 7);
check('周一,周三', Excel.parseWeekdayList('周一,周三'), [1, 3]);
check('1、3', Excel.parseWeekdayList('1、3'), [1, 3]);
check('第1-2节', Excel.parsePeriodRange('第1-2节'), { start: 1, end: 2 });
check('3、4节', Excel.parsePeriodRange('3、4节'), { start: 3, end: 4 });
check('第一节', Excel.parsePeriodRange('第一节'), { start: 1, end: 1 });
check('纯数字 5', Excel.parsePeriodRange('5'), { start: 5, end: 5 });
check('时间不当作节次', Excel.parsePeriodRange('08:00-08:45'), null);

/* --------------------------------------------------------- 整表导入 */

const config = Store.state.config;

function loadWorkbook(file) {
  const buffer = fs.readFileSync(file);
  if (/\.csv$/i.test(file)) {
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    return XLSX.read(text, { type: 'string', raw: true });
  }
  return XLSX.read(buffer, { type: 'buffer' });
}

function parseSample(file, sheetName) {
  const workbook = loadWorkbook(path.join(__dirname, '..', 'samples', file));
  return Excel.parseSheet(workbook, sheetName || workbook.SheetNames[0], { config });
}

function summary(courses) {
  return courses.map((c) => [Store.DAY_LABELS[c.day - 1], c.startPeriod + (c.endPeriod > c.startPeriod ? '-' + c.endPeriod : ''), c.name].join(' '));
}

section('示例-网格型课表.xlsx（含标题行、合并单元格、单双周）');
const grid = parseSample('示例-网格型课表.xlsx');
check('识别模式', grid.mode, 'grid');
check('课程数量', grid.courses.length, 14);
check('课程清单', summary(grid.courses), [
  '周一 1-2 高等数学',
  '周一 3-4 大学英语',
  '周一 7-8 体育（羽毛球）',
  '周二 1-2 线性代数',
  '周二 5-6 程序设计基础',
  '周三 1-2 大学物理',
  '周三 7-8 中国近现代史纲要',
  '周四 1-2 数据结构',
  '周四 5-6 马克思主义基本原理',
  '周五 1-2 高等数学',
  '周五 3-4 大学英语',
  '周五 5-6 概率论与数理统计',
  '周六 5-6 创新创业实践',
  '周日 9-10 晚自习'
]);
check('单周课周次', grid.courses[5].weeks, '1-16单周');
check('双周课周次', grid.courses[11].weeks, '1-16双周');
check('地点解析', grid.courses[0].location, '三教201');
check('教师解析', grid.courses[0].teacher, '张伟');

section('示例-网格型简版.xlsx（无时间列、数字节次、@写法）');
const simple = parseSample('示例-网格型简版.xlsx');
check('识别模式', simple.mode, 'grid');
check('课程清单', summary(simple.courses), [
  '周一 1-2 英语听说',
  '周一 3-4 离散数学',
  '周二 1-2 计算机网络',
  '周二 5-6 羽毛球',
  '周三 3-6 编译原理',
  '周四 3-6 编译原理',
  '周五 3-4 形势与政策',
  '周六 5-6 数学建模竞赛培训'
]);
check('@ 写法地点', simple.courses[0].location, '语音室2');

section('示例-列表型课表.xlsx / 课程列表');
const list = parseSample('示例-列表型课表.xlsx', '课程列表');
check('识别模式', list.mode, 'list');
check('课程数量', list.courses.length, 11);
check('课程清单', summary(list.courses), [
  '周一 1-2 高等数学',
  '周一 3-4 大学英语',
  '周二 3-4 大学英语（口语）',
  '周三 1-2 大学物理',
  '周三 7-8 体育（羽毛球）',
  '周四 1-2 数据结构',
  '周四 5-6 马克思主义基本原理',
  '周五 1-2 计算机组成原理',
  '周五 3-4 大学英语',
  '周五 5-6 概率论与数理统计',
  '周六 5-6 创新创业实践'
]);
check('「周一,周五」拆成两条', list.courses.filter((c) => c.name === '大学英语').length, 2);
check('周次保留', list.courses.filter((c) => c.name === '大学物理')[0].weeks, '1-16单周');
check('多段周次保留', list.courses.filter((c) => c.name === '计算机组成原理')[0].weeks, '1-8,10-16');
check('备注保留', list.courses.filter((c) => c.name === '高等数学')[0].note, '带计算器');

section('示例-列表型课表.xlsx / 分列写法');
const list2 = parseSample('示例-列表型课表.xlsx', '分列写法');
check('课程清单', summary(list2.courses), [
  '周二 1-2 线性代数',
  '周二 5-6 程序设计基础',
  '周三 7-8 中国近现代史纲要',
  '周四 3-4 学术英语写作',
  '周日 1-2 军事理论'
]);

section('示例-列表型课表.csv');
const csv = parseSample('示例-列表型课表.csv');
check('识别模式', csv.mode, 'list');
check('课程清单', summary(csv.courses), [
  '周一 5-6 大学语文',
  '周三 1-2 线性代数',
  '周五 7-8 体育（篮球）'
]);

section('课程都按整大节安排（一个大节 = 两节 45 分钟）');
check('半节（第4节）扩成第3-4节', Store.snapPeriodsToUnits(4, 4, 10), { start: 3, end: 4 });
check('半节（第1节）扩成第1-2节', Store.snapPeriodsToUnits(1, 1, 10), { start: 1, end: 2 });
check('奇数节数（第3-5节）扩成第3-6节', Store.snapPeriodsToUnits(3, 5, 10), { start: 3, end: 6 });
check('整大节（第7-8节）保持不变', Store.snapPeriodsToUnits(7, 8, 10), { start: 7, end: 8 });
check('超出课表范围时截断', Store.snapPeriodsToUnits(9, 40, 10), { start: 9, end: 10 });
check('节次数量为奇数时不会排到最后一节', Store.snapPeriodsToUnits(9, 9, 9), { start: 7, end: 8 });
check('大节数量按整大节计算', [Store.unitCount(Array(10)), Store.unitCount(Array(9))], [5, 4]);
check('第4节属于第2大节', Store.unitOf(4), 2);
check('第9节属于第5大节', Store.unitOf(9), 5);
check('手动添加的单节课自动变成整大节', (function () {
  const added = Store.addCourse({ name: '测试课程', day: 1, startPeriod: 4, endPeriod: 4 }, { save: false });
  const range = [added.startPeriod, added.endPeriod];
  Store.removeCourse(added.id, { save: false });
  return range;
})(), [3, 4]);
check('修改课程时也会对齐大节', (function () {
  const added = Store.addCourse({ name: '测试课程', day: 1, startPeriod: 1, endPeriod: 2 }, { save: false });
  Store.updateCourse(added.id, { startPeriod: 5, endPeriod: 5 }, { save: false });
  const range = [Store.getCourse(added.id).startPeriod, Store.getCourse(added.id).endPeriod];
  Store.removeCourse(added.id, { save: false });
  return range;
})(), [5, 6]);
check('导入的课程全部占整大节',
  grid.courses.concat(simple.courses, list.courses, list2.courses, csv.courses)
    .every((c) => (c.startPeriod - 1) % Store.UNIT_SIZE === 0 && c.endPeriod % Store.UNIT_SIZE === 0),
  true);
check('半节的课程会给出提示', simple.warnings.some((text) => text.indexOf('大节') >= 0), true);

section('导出后可再次导入（往返一致性）');
const source = grid.courses.map((c) => Store.normalizeCourse(Object.assign({}, c, { id: undefined })));
const built = Excel.buildGridAoa(source, config);
const backWb = XLSX.read(XLSX.write({ SheetNames: ['课程表'], Sheets: { '课程表': (() => {
  const ws = XLSX.utils.aoa_to_sheet(built.aoa);
  ws['!merges'] = built.merges;
  return ws;
})() } }, { bookType: 'xlsx', type: 'buffer' }), { type: 'buffer' });
const back = Excel.parseSheet(backWb, '课程表', { config });
check('往返课程数量一致', back.courses.length, grid.courses.length);
check('往返课程清单一致', summary(back.courses), summary(grid.courses));

section('冲突检测');
const conflictPool = [
  Store.normalizeCourse({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-16' }),
  Store.normalizeCourse({ name: 'B', day: 1, startPeriod: 2, endPeriod: 3, weeks: '5-10' }),
  Store.normalizeCourse({ name: 'C', day: 1, startPeriod: 5, endPeriod: 6, weeks: '1-16' })
];
check('节次重叠且周次相交', Object.keys(Store.findConflicts(conflictPool, 16)).length, 2);
const noConflict = [
  Store.normalizeCourse({ name: 'A', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-4' }),
  Store.normalizeCourse({ name: 'B', day: 1, startPeriod: 1, endPeriod: 2, weeks: '5-8' })
];
check('周次不相交不算冲突', Object.keys(Store.findConflicts(noConflict, 16)).length, 0);

section('默认作息（大节：两节 45 分钟 + 课间 5 分钟，大节之间 15 分钟）');
const periods = config.periods;
function toMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}
function gapAt(index) { return toMinutes(periods[index].start) - toMinutes(periods[index - 1].end); }
check('第一节 08:00 开始', periods[0].start, '08:00');
check('最后一节 19:35 结束', periods[periods.length - 1].end, '19:35');
check('每个节次都是 45 分钟', periods.every((p) => toMinutes(p.end) - toMinutes(p.start) === 45), true);
check('节次时间递增', periods.every((p, i) => i === 0 || toMinutes(p.start) >= toMinutes(periods[i - 1].end)), true);
check('一个大节两节课', Store.UNIT_SIZE, 2);
check('共 5 个大节', periods.length / Store.UNIT_SIZE, 5);
check('大节内部都是 5 分钟课间', [1, 3, 5, 7, 9].map(gapAt), [5, 5, 5, 5, 5]);
check('相邻大节之间 15 分钟', [2, 6].map(gapAt), [15, 15]);
check('午休 11:25 - 14:00', [periods[3].end, periods[4].start], ['11:25', '14:00']);
check('晚上从 18:00 开始', periods[8].start, '18:00');
check('第9节属于第5大节', Store.unitOf(9), 5);
check('第4节属于第2大节', Store.unitOf(4), 2);

section('老版默认作息自动升级');
const legacyEvening = [
  ['第1节', '08:00', '08:45'], ['第2节', '08:50', '09:35'],
  ['第3节', '09:40', '10:25'], ['第4节', '10:30', '11:15'],
  ['第5节', '14:00', '14:45'], ['第6节', '14:50', '15:35'],
  ['第7节', '15:40', '16:25'], ['第8节', '16:30', '17:15'],
  ['第9节', '18:00', '18:45'], ['第10节', '19:00', '19:45']
].map(([label, start, end]) => ({ label, start, end }));
check('上一版默认升级为大节作息', Store.mergeConfig({ periods: legacyEvening }).periods[9].end, '19:35');
check('上一版默认升级后第 3 节 09:50 开始', Store.mergeConfig({ periods: legacyEvening }).periods[2].start, '09:50');
const customPeriods = [{ label: '第1节', start: '09:00', end: '09:45' }, { label: '第2节', start: '10:00', end: '10:45' }];
check('用户自定义作息保留', Store.mergeConfig({ periods: customPeriods }).periods, customPeriods);

section('周一到周日的日期（按使用者本地时间）');
check('日期文本解析', Store.normalizeDateText('2026-09-07'), '2026-09-07');
check('斜杠写法', Store.normalizeDateText('2026/9/7'), '2026-09-07');
check('不存在的日期会被拒绝', Store.normalizeDateText('2026-02-30'), '');
check('空值', Store.normalizeDateText(''), '');
const dated = Store.mergeConfig({ startDate: '2026-09-07', totalWeeks: 16, currentWeek: 3 });
check('第 1 周周一', Store.formatDate(Store.weekDates(1, dated)[0]), '2026-09-07');
check('第 2 周周一', Store.formatDate(Store.weekDates(2, dated)[0]), '2026-09-14');
check('第 3 周周一', Store.formatDate(Store.weekDates(3, dated)[0]), '2026-09-21');
check('第 3 周周日', Store.formatDate(Store.weekDates(3, dated)[6]), '2026-09-27');
check('每周都是 7 天', Store.weekDates(5, dated).length, 7);
check('跨月的一周', [Store.formatDate(Store.weekDates(5, dated)[0]), Store.formatDate(Store.weekDates(5, dated)[6])], ['2026-10-05', '2026-10-11']);
check('周一是星期一', Store.weekdayOf(Store.weekDates(1, dated)[0]), 1);
check('周日是星期日', Store.weekdayOf(Store.weekDates(1, dated)[6]), 7);
check('每一天都是连续的下一天', Store.weekDates(1, dated).every((date, index, list) => index === 0 || Store.formatDate(date) === Store.formatDate(Store.addDays(list[index - 1], 1))), true);
check('第 1 周周一就是学期开始日期', Store.formatDate(Store.termStart(dated)), '2026-09-07');
check('周次范围文本', Store.weekRangeText(3, dated), '9/21 - 9/27');
check('跨年学期也能算', Store.formatDate(Store.weekDates(3, Store.mergeConfig({ startDate: '2026-12-28' }))[6]), '2027-01-17');

section('没填学期开始日期时按今天推算');
const auto = Store.mergeConfig({ totalWeeks: 16, currentWeek: 4 });
check('当前周次里包含今天', Store.weekDates(4, auto).some((date) => Store.sameDay(date, Store.today())), true);
check('第 1 周周一总是星期一', Store.weekdayOf(Store.weekDates(1, auto)[0]), 1);
check('推出来的第 1 周周一', Store.formatDate(Store.weekDates(1, auto)[0]), Store.formatDate(Store.addDays(Store.mondayOf(Store.today()), -21)));
Store.setConfig({ startDate: '', currentWeek: 1 });
check('首次使用会自动补齐学期开始日期', Store.ensureTermStart(), true);
check('自动补齐后第 1 周周一 = 本周周一', Store.formatDate(Store.weekDates(1, Store.state.config)[0]), Store.formatDate(Store.mondayOf(Store.today())));
check('已经填过就不再改动', Store.ensureTermStart(), false);
check('设置里能改学期开始日期', (function () {
  Store.setConfig({ startDate: '2026-03-02' });
  return Store.formatDate(Store.weekDates(1, Store.state.config)[0]);
})(), '2026-03-02');

console.log('\n通过 ' + passed + ' 项，失败 ' + failed + ' 项');
process.exit(failed ? 1 : 0);
