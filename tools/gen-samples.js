/*!
 * tools/gen-samples.js — 生成示例课表文件（用于测试导入功能，也可给用户参考格式）
 * 运行：node tools/gen-samples.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const outDir = path.join(__dirname, '..', 'samples');
fs.mkdirSync(outDir, { recursive: true });

function buildSheet(aoa, options) {
  const opts = options || {};
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (opts.merges && opts.merges.length) ws['!merges'] = opts.merges;
  const width = aoa.reduce((max, row) => Math.max(max, row.length), 0);
  ws['!cols'] = Array.from({ length: width }, (_, i) => ({ wch: i === 0 ? 9 : (i === 1 ? 13 : 20) }));
  ws['!rows'] = aoa.map((_, i) => ({ hpt: i === 0 ? 20 : (opts.rowHeight || 22) }));
  return ws;
}

function save(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(([name, ws]) => XLSX.utils.book_append_sheet(wb, ws, name));
  const target = path.join(outDir, filename);
  /* 注意：本地内置的社区版 SheetJS 在浏览器里用 XLSX.writeFile 下载，
     Node 下它拿不到 fs，所以这里用 XLSX.write 生成 Buffer 再自己写文件。 */
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true });
  fs.writeFileSync(target, buffer);
  console.log('已生成', path.relative(path.join(__dirname, '..'), target));
}

/* ------------------------------------------------------------------
   示例 1：教务系统常见样式
   - 顶部有标题行
   - 第一列写「第N节」，第二列写上课时间
   - 连上两节的课程用一个纵向合并单元格表示
   - 单元格内用换行分隔课程名 / 教师 / 地点 / 周次
   ------------------------------------------------------------------ */
(function sampleGrid() {
  const periods = [
    ['第1节', '08:00-08:45'], ['第2节', '08:50-09:35'],
    ['第3节', '09:50-10:35'], ['第4节', '10:40-11:25'],
    ['第5节', '14:00-14:45'], ['第6节', '14:50-15:35'],
    ['第7节', '15:50-16:35'], ['第8节', '16:40-17:25'],
    ['第9节', '18:00-18:45'], ['第10节', '18:50-19:35']
  ];

  const aoa = [
    ['2026—2027 学年第一学期 课程表', '', '', '', '', '', '', '', ''],
    ['节次', '时间', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
  ];

  const lessons = [
    { day: 1, from: 1, to: 2, text: '高等数学\n张伟\n三教201' },
    { day: 1, from: 3, to: 4, text: '大学英语\nLinda\n外语楼105' },
    { day: 1, from: 7, to: 8, text: '体育（羽毛球）\n陈刚\n体育馆' },
    { day: 2, from: 1, to: 2, text: '线性代数\n李娜\n三教305' },
    { day: 2, from: 5, to: 6, text: '程序设计基础\n王强\n机房A302' },
    { day: 3, from: 1, to: 2, text: '大学物理\n刘洋\n理科楼402\n1-16单周' },
    { day: 3, from: 7, to: 8, text: '中国近现代史纲要\n赵敏\n文科楼220' },
    { day: 4, from: 1, to: 2, text: '数据结构\n王强\n三教108' },
    { day: 4, from: 5, to: 6, text: '马克思主义基本原理\n孙丽\n文科楼301' },
    { day: 5, from: 1, to: 2, text: '高等数学\n张伟\n三教201' },
    { day: 5, from: 3, to: 4, text: '大学英语\nLinda\n外语楼105' },
    { day: 5, from: 5, to: 6, text: '概率论与数理统计\n周涛\n三教210\n2-16双周' },
    { day: 6, from: 5, to: 6, text: '创新创业实践\n校外导师\n创新中心' },
    { day: 7, from: 9, to: 10, text: '晚自习\n班主任\n三教201' }
  ];

  const merges = [];
  const grid = {};

  lessons.forEach((lesson) => {
    const row = lesson.from + 1; // 标题行占第 1 行，表头占第 2 行
    const col = lesson.day + 1;
    grid[row + ':' + col] = lesson.text;
    if (lesson.to > lesson.from) {
      merges.push({ s: { r: row, c: col }, e: { r: lesson.to + 1, c: col } });
    }
  });

  periods.forEach(([label, time], index) => {
    const row = [label, time];
    for (let day = 1; day <= 7; day++) row.push(grid[(index + 2) + ':' + (day + 1)] || '');
    aoa.push(row);
  });

  save('示例-网格型课表.xlsx', [['课程表', buildSheet(aoa, { merges, rowHeight: 40 })]]);
})();

/* ------------------------------------------------------------------
   示例 2：简化的网格样式
   - 表头用「周一…周日」，第一列只有数字
   - 没有时间列
   - 单元格用「课程@地点」「课程(地点)」等一行写法
   - 连上三节的课程用合并单元格
   ------------------------------------------------------------------ */
(function sampleGridSimple() {
  const aoa = [
    ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    ['1', '英语听说@语音室2', '计算机网络\n李强 教三401', '', '', '', '', ''],
    ['2', '英语听说@语音室2', '计算机网络\n李强 教三401', '', '', '', '', ''],
    ['3', '', '', '编译原理\n(三教512)', '编译原理\n(三教512)', '', '', ''],
    ['4', '离散数学\n孙老师', '', '编译原理\n(三教512)', '编译原理\n(三教512)', '形势与政策\n直播课', '', ''],
    ['5', '', '羽毛球\n体育馆', '', '', '', '数学建模竞赛培训\n创新中心 303', ''],
    ['6', '', '羽毛球\n体育馆', '', '', '', '数学建模竞赛培训\n创新中心 303', '']
  ];

  const merges = [
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } },
    { s: { r: 3, c: 3 }, e: { r: 5, c: 3 } },
    { s: { r: 3, c: 4 }, e: { r: 5, c: 4 } },
    { s: { r: 5, c: 2 }, e: { r: 6, c: 2 } },
    { s: { r: 5, c: 6 }, e: { r: 6, c: 6 } }
  ];

  save('示例-网格型简版.xlsx', [['课表', buildSheet(aoa, { merges, rowHeight: 34 })]]);
})();

/* ------------------------------------------------------------------
   示例 3：列表型（每行一条课程）
   - 第 1 张表用「节次」一列写 1-2，「星期」一列可以写多个星期
   - 第 2 张表用「开始节次 / 结束节次」两列，列名更口语化
   ------------------------------------------------------------------ */
(function sampleList() {
  const aoa = [
    ['2026 年秋季学期课程列表', '', '', '', '', '', ''],
    ['课程名称', '星期', '节次', '周次', '上课地点', '任课教师', '备注'],
    ['高等数学', '周一', '1-2', '1-16', '三教201', '张伟', '带计算器'],
    ['大学英语', '周一,周五', '3-4', '1-16', '外语楼105', 'Linda', '分 A/B 班'],
    ['体育（羽毛球）', '周三', '7-8', '1-16', '体育馆', '陈刚', '自备球拍'],
    ['大学物理', '周三', '1-2', '1-16单周', '理科楼402', '刘洋', ''],
    ['数据结构', '周四', '1-2', '2-16双周', '三教108', '王强', '实验课在机房'],
    ['概率论与数理统计', '周五', '5', '1-16', '三教210', '周涛', '单双周交替'],
    ['马克思主义基本原理', '周四', '5-6', '全部', '文科楼301', '孙丽', '需要写读书报告'],
    ['计算机组成原理', '周五', '1-2', '1-8,10-16', '三教401', '李强', '第九周停课'],
    ['创新创业实践', '周六', '5-6', '1-16', '创新中心303', '校外导师', '需要组队'],
    ['大学英语（口语）', '周二', '3', '3-14', '语音室2', 'Linda', '两周一次']
  ];

  const second = [
    ['课程', '星期', '开始节次', '结束节次', '周次', '地点', '老师'],
    ['中国近现代史纲要', '周三', 7, 8, '1-16', '文科楼220', '赵敏'],
    ['线性代数', '周二', 1, 2, '1-16', '三教305', '李娜'],
    ['程序设计基础', '周二', 5, 6, '1-16', '机房A302', '王强'],
    ['学术英语写作', '周四', 3, 4, '1-8', '外语楼206', 'Smith'],
    ['军事理论', '周日', 1, 2, '1-4', '大礼堂', '教导处']
  ];

  save('示例-列表型课表.xlsx', [
    ['课程列表', buildSheet(aoa, { rowHeight: 22 })],
    ['分列写法', buildSheet(second, { rowHeight: 22 })]
  ]);
})();

/* ------------------------------------------------------------------
   示例 4：CSV（列表型，UTF-8 带 BOM）
   ------------------------------------------------------------------ */
(function sampleCsv() {
  const lines = [
    '课程名称,星期,节次,周次,地点,教师',
    '大学语文,周一,5-6,1-16,文科楼105,林老师',
    '线性代数,周三,1-2,1-16,三教305,李娜',
    '体育（篮球）,周五,7-8,1-16,篮球场,陈刚'
  ];
  const target = path.join(outDir, '示例-列表型课表.csv');
  fs.writeFileSync(target, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
  console.log('已生成', path.relative(path.join(__dirname, '..'), target));
})();

/* ------------------------------------------------------------------
   示例 5：花名册（给「随机点名」页导入用）
   - 第 1 张表是常见的班级花名册：序号 / 学号 / 姓名 / 性别
   - 第 2 张表只有一列姓名
   - 另外生成一份 CSV 花名册（学号在姓名左边，用来测试自动找姓名列）
   ------------------------------------------------------------------ */
const ROSTER_NAMES = [
  ['张伟', '男'], ['李娜', '女'], ['王强', '男'], ['刘洋', '男'], ['陈刚', '男'],
  ['赵敏', '女'], ['孙丽', '女'], ['周涛', '男'], ['吴倩', '女'], ['郑凯', '男'],
  ['冯雪', '女'], ['林浩', '男'], ['黄婷', '女'], ['徐鹏', '男'], ['马颖', '女'],
  ['朱磊', '男'], ['胡静', '女'], ['郭扬', '男'], ['何薇', '女'], ['高翔', '男']
];

(function sampleRoster() {
  const classSheet = [['2026 级计算机科学与技术 1 班 花名册', '', '', ''], ['序号', '学号', '姓名', '性别']];
  ROSTER_NAMES.forEach(([name, sex], index) => {
    classSheet.push([index + 1, '2026' + String(index + 1).padStart(4, '0'), name, sex]);
  });

  const simpleSheet = [['姓名']].concat(ROSTER_NAMES.map(([name]) => [name]));

  save('示例-花名册.xlsx', [
    ['班级花名册', buildSheet(classSheet, { rowHeight: 20 })],
    ['只有姓名', buildSheet(simpleSheet, { rowHeight: 20 })]
  ]);

  const lines = ['学号,姓名,性别'].concat(
    ROSTER_NAMES.map(([name, sex], index) => '2026' + String(index + 1).padStart(4, '0') + ',' + name + ',' + sex)
  );
  const target = path.join(outDir, '示例-花名册.csv');
  fs.writeFileSync(target, '\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
  console.log('已生成', path.relative(path.join(__dirname, '..'), target));
})();
