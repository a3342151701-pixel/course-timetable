/*!
 * store.js — 课程表数据模型
 * 负责：数据结构与规范化、localStorage 持久化、周次解析、配色分配、冲突检测。
 * 无构建依赖，直接以普通 script 加载，暴露全局 Store。
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'course-timetable/v1';

  var DAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  /* 默认作息：每天 5 个大节，每个大节连上两节 45 分钟的课。
     大节内部两节课之间休息 5 分钟，大节与大节之间休息 15 分钟。
     08:00 开始，晚上 18:00 开始，最后一节 19:35 下课。 */
  var DEFAULT_PERIODS = [
    { label: '第1节', start: '08:00', end: '08:45' },
    { label: '第2节', start: '08:50', end: '09:35' },
    { label: '第3节', start: '09:50', end: '10:35' },
    { label: '第4节', start: '10:40', end: '11:25' },
    { label: '第5节', start: '14:00', end: '14:45' },
    { label: '第6节', start: '14:50', end: '15:35' },
    { label: '第7节', start: '15:50', end: '16:35' },
    { label: '第8节', start: '16:40', end: '17:25' },
    { label: '第9节', start: '18:00', end: '18:45' },
    { label: '第10节', start: '18:50', end: '19:35' }
  ];

  /* 一个大节包含几节课：第 1-2 节是一个大节，第 3-4 节是一个大节，依此类推 */
  var UNIT_SIZE = 2;

  /* 历史版本的默认作息：只用来认出「用户从没改过节次」的老数据，认出就自动升级成上面的新作息。
     以后每次调整默认时间，把上一版默认追加到这里就行。 */
  var LEGACY_DEFAULT_PERIODS = [
    /* 10 节版：上午/下午/晚上内部都是课间 5 分钟，晚上 18:00-18:45、19:00-19:45 */
    [
      { label: '第1节', start: '08:00', end: '08:45' },
      { label: '第2节', start: '08:50', end: '09:35' },
      { label: '第3节', start: '09:40', end: '10:25' },
      { label: '第4节', start: '10:30', end: '11:15' },
      { label: '第5节', start: '14:00', end: '14:45' },
      { label: '第6节', start: '14:50', end: '15:35' },
      { label: '第7节', start: '15:40', end: '16:25' },
      { label: '第8节', start: '16:30', end: '17:15' },
      { label: '第9节', start: '18:00', end: '18:45' },
      { label: '第10节', start: '19:00', end: '19:45' }
    ],
    /* 10 节版：晚上 2 节 18:00-19:35 */
    [
      { label: '第1节', start: '08:00', end: '08:45' },
      { label: '第2节', start: '08:50', end: '09:35' },
      { label: '第3节', start: '09:40', end: '10:25' },
      { label: '第4节', start: '10:30', end: '11:15' },
      { label: '第5节', start: '14:00', end: '14:45' },
      { label: '第6节', start: '14:50', end: '15:35' },
      { label: '第7节', start: '15:40', end: '16:25' },
      { label: '第8节', start: '16:30', end: '17:15' },
      { label: '第9节', start: '18:00', end: '18:45' },
      { label: '第10节', start: '18:50', end: '19:35' }
    ],
    /* 12 节版：晚上 4 节 19:00-22:30 */
    [
      { label: '第1节', start: '08:00', end: '08:45' },
      { label: '第2节', start: '08:55', end: '09:40' },
      { label: '第3节', start: '10:00', end: '10:45' },
      { label: '第4节', start: '10:55', end: '11:40' },
      { label: '第5节', start: '14:00', end: '14:45' },
      { label: '第6节', start: '14:55', end: '15:40' },
      { label: '第7节', start: '16:00', end: '16:45' },
      { label: '第8节', start: '16:55', end: '17:40' },
      { label: '第9节', start: '19:00', end: '19:45' },
      { label: '第10节', start: '19:55', end: '20:40' },
      { label: '第11节', start: '20:50', end: '21:35' },
      { label: '第12节', start: '21:45', end: '22:30' }
    ]
  ];

  /* 每种课程使用不同的背景色：按课程名稳定映射到调色板 */
  var PALETTE = [
    '#FDE2E2', '#FCE6C9', '#FAF3C0', '#E3F3CB',
    '#CDEBDC', '#CFE9F4', '#D6E2FB', '#E4DCFA',
    '#F4D9F1', '#FAD9E3', '#E9EDD8', '#D8EDE9',
    '#FBE9DA', '#DDE7EC', '#EFE2F7', '#E6EAD6'
  ];

  var CN_DIGITS = { '零': 0, '〇': 0, '一': 1, '壹': 1, '二': 2, '两': 2, '贰': 2, '三': 3, '叁': 3, '四': 4, '肆': 4, '五': 5, '伍': 5, '六': 6, '陆': 6, '七': 7, '柒': 7, '八': 8, '捌': 8, '九': 9, '玖': 9, '十': 10 };

  var ALL_WORDS_RE = /^(全部|所有|全|每周|全周|整学期|全学期|all|\*|-|—)$/i;

  /* ---------------------------------------------------------------- 基础工具 */

  function uid() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function clampInt(value, min, max, dflt) {
    var n = parseInt(value, 10);
    if (isNaN(n)) n = dflt;
    if (typeof n !== 'number' || isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function trim(value) {
    return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').trim();
  }

  function uniq(list) {
    var seen = {}, out = [];
    list.forEach(function (item) {
      var key = String(item);
      if (!seen[key]) { seen[key] = 1; out.push(item); }
    });
    return out;
  }

  function range(from, to) {
    var out = [];
    for (var i = from; i <= to; i++) out.push(i);
    return out;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ------------------------------------------------------------ 周次解析 */

  function cnToNum(token) {
    if (!token) return NaN;
    if (/^\d+$/.test(token)) return parseInt(token, 10);
    var text = token.replace(/\s/g, '');
    if (text === '十') return 10;
    var m = text.match(/^(.)?十(.)?$/);
    if (m) {
      var tens = m[1] ? CN_DIGITS[m[1]] : 1;
      var ones = m[2] ? CN_DIGITS[m[2]] : 0;
      if (tens === undefined || ones === undefined) return NaN;
      return tens * 10 + ones;
    }
    var num = 0;
    for (var i = 0; i < text.length; i++) {
      var d = CN_DIGITS[text[i]];
      if (d === undefined) return NaN;
      num = num * 10 + d;
    }
    return num;
  }

  /**
   * 解析周次文本，支持：全部 / 1-16 / 1-8,10-16 / 1,3,5 / 1-16单周 / 双周 / 第一至十六周 …
   * 返回 { all, weeks:[1,2,…], text, parity, warning }
   */
  function parseWeeks(text, maxWeek) {
    maxWeek = clampInt(maxWeek, 1, 60, 20);
    var raw = trim(text);
    var result = { all: false, weeks: [], text: '全部', parity: '', warning: '' };

    if (!raw) {
      result.all = true;
      result.weeks = range(1, maxWeek);
      return result;
    }

    var parity = '';
    if (/单周|单数周|奇数周|odd/i.test(raw)) parity = 'odd';
    else if (/双周|双数周|偶数周|even/i.test(raw)) parity = 'even';
    result.parity = parity;

    var compact = raw.replace(/\s/g, '');
    if (ALL_WORDS_RE.test(compact) || /全部|所有|全周|每周|整学期|全学期/.test(compact)) {
      result.all = true;
      result.weeks = range(1, maxWeek).filter(function (n) { return matchParity(n, parity); });
      result.text = parity ? '1-' + maxWeek + (parity === 'odd' ? '单周' : '双周') : '全部';
      if (parity) result.all = result.weeks.length === maxWeek;
      return result;
    }

    var cleaned = compact
      .replace(/第/g, '')
      .replace(/周次|周数|周/g, '/')
      .replace(/单周|双周|单数周|双数周|奇数周|偶数周/gi, '/')
      .replace(/odd|even/gi, '/')
      .replace(/[（(【\[）)】\]]/g, '/');

    var weeks = [];
    var matched = 0;
    var numGroup = '(\\d{1,2}|[\\u4e00-\\u9fa5]{1,3})';
    var rangeRe = new RegExp(numGroup + '\\s*[-~～—到至]+\\s*' + numGroup, 'g');

    /* 先取出区间写法（1-16 / 一至十六），再把剩下的单个数字取出来 */
    var remainder = cleaned.replace(rangeRe, function (all, fromToken, toToken) {
      var from = cnToNum(fromToken);
      var to = cnToNum(toToken);
      if (isNaN(from) || isNaN(to)) return '/';
      if (from > to) { var t = from; from = to; to = t; }
      matched++;
      for (var n = Math.max(1, from); n <= Math.min(to, maxWeek); n++) weeks.push(n);
      return '/';
    });

    remainder.split(/[^0-9\u4e00-\u9fa5]+/).filter(Boolean).forEach(function (token) {
      var num = cnToNum(token);
      if (isNaN(num)) return;
      matched++;
      if (num >= 1 && num <= maxWeek) weeks.push(num);
    });

    weeks = uniq(weeks).sort(function (a, b) { return a - b; });

    if (!matched) {
      /* 只有单/双周这类信息，或无法识别的文本：按全部周次处理并给出提示 */
      weeks = range(1, maxWeek).filter(function (n) { return matchParity(n, parity); });
      if (!parity) {
        weeks = range(1, maxWeek);
        result.warning = '未能识别周次“' + raw + '”，已按全部周次处理';
      }
    } else if (parity) {
      weeks = weeks.filter(function (n) { return matchParity(n, parity); });
    }

    if (!weeks.length) {
      weeks = range(1, maxWeek);
      result.warning = '周次“' + raw + '”超出学期范围，已按全部周次处理';
    }

    result.weeks = weeks;
    result.text = weeksToText(weeks, maxWeek);
    result.all = weeks.length === maxWeek && weeks[0] === 1 && weeks[weeks.length - 1] === maxWeek;
    return result;
  }

  function matchParity(week, parity) {
    if (!parity) return true;
    return parity === 'odd' ? week % 2 === 1 : week % 2 === 0;
  }

  /** 把周次数组压缩为紧凑文本：1-16 / 1-8,10-16 / 1-16单周 */
  function weeksToText(weeks, maxWeek) {
    var list = uniq(weeks.filter(function (n) { return n >= 1; })).sort(function (a, b) { return a - b; });
    if (!list.length || !maxWeek) return '全部';
    if (list.length === maxWeek && list[0] === 1 && list[maxWeek - 1] === maxWeek) return '1-' + maxWeek;

    var evens = list.filter(function (n) { return n % 2 === 0; }).length;
    if (maxWeek > 1) {
      if (evens === 0 && list.length === Math.ceil(maxWeek / 2) && list[0] === 1) return '1-' + maxWeek + '单周';
      if (evens === list.length && list.length === Math.floor(maxWeek / 2) && list[0] === 2) return '1-' + maxWeek + '双周';
    }

    /* 局部单双周：如 [2,4,6,8] → 1-8双周 */
    var sameParity = list.every(function (n) { return n % 2 === list[0] % 2; });
    if (sameParity && list.length > 1 && list[list.length - 1] - list[0] === 2 * (list.length - 1)) {
      var suffix = list[0] % 2 === 1 ? '单周' : '双周';
      var from = list[0] === 1 || list[0] === 2 ? 1 : list[0];
      return from + '-' + list[list.length - 1] + suffix;
    }

    var chunks = [];
    var start = list[0], prev = list[0];
    for (var i = 1; i <= list.length; i++) {
      var cur = list[i];
      if (cur === prev + 1) { prev = cur; continue; }
      chunks.push(start === prev ? String(start) : start + '-' + prev);
      start = prev = cur;
    }
    return uniq(chunks).join(',');
  }

  function weeksOf(course, maxWeek) {
    return parseWeeks(course && course.weeks, maxWeek).weeks;
  }

  function courseHasWeek(course, week, maxWeek) {
    var weeks = weeksOf(course, maxWeek);
    for (var i = 0; i < weeks.length; i++) if (weeks[i] === week) return true;
    return false;
  }

  /* ------------------------------------------------------------- 颜色 */

  function hashString(text) {
    var hash = 5381;
    for (var i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
    return Math.abs(hash);
  }

  function autoColor(name) {
    return PALETTE[hashString(String(name || '').replace(/\s/g, '')) % PALETTE.length];
  }

  function normalizeHex(hex) {
    var text = String(hex || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(text)) {
      return '#' + text[1] + text[1] + text[2] + text[2] + text[3] + text[3];
    }
    return /^#[0-9a-f]{6}$/i.test(text) ? text.toUpperCase() : '';
  }

  function hexToRgb(hex) {
    var text = normalizeHex(hex) || '#FFFFFF';
    return {
      r: parseInt(text.slice(1, 3), 16),
      g: parseInt(text.slice(3, 5), 16),
      b: parseInt(text.slice(5, 7), 16)
    };
  }

  function luminance(hex) {
    var rgb = hexToRgb(hex);
    var channels = [rgb.r, rgb.g, rgb.b].map(function (c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function textOn(hex) {
    return luminance(hex) > 0.45 ? '#1e2430' : '#ffffff';
  }

  function shade(hex, amount) {
    /* amount < 0 变暗，> 0 变亮 */
    var rgb = hexToRgb(hex);
    var mix = amount < 0 ? 0 : 255;
    var ratio = Math.abs(amount);
    var out = [rgb.r, rgb.g, rgb.b].map(function (c) {
      return Math.round(c + (mix - c) * ratio);
    });
    return '#' + out.map(function (c) {
      var s = c.toString(16).toUpperCase();
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }

  /* --------------------------------------------------------- 课程规范化 */

  function normalizeCourse(input) {
    var src = input || {};
    var start = clampInt(src.startPeriod, 1, 60, 1);
    var end = clampInt(src.endPeriod != null ? src.endPeriod : src.startPeriod, 1, 60, start);
    if (end < start) { var t = start; start = end; end = t; }
    return {
      id: src.id || uid(),
      name: trim(src.name),
      day: clampInt(src.day, 1, 7, 1),
      startPeriod: start,
      endPeriod: end,
      weeks: trim(src.weeks) || '全部',
      location: trim(src.location),
      teacher: trim(src.teacher),
      color: normalizeHex(src.color),
      note: trim(src.note)
    };
  }

  function defaultConfig() {
    return {
      totalWeeks: 16,
      currentWeek: 1,
      showWeekend: true,
      highlightWeek: true,
      periods: DEFAULT_PERIODS.map(function (p) { return { label: p.label, start: p.start, end: p.end }; })
    };
  }

  /** 两组节次的名称和上下课时间是否完全一致 */
  function periodsEqual(list, reference) {
    if (!Array.isArray(list) || !Array.isArray(reference) || list.length !== reference.length) return false;
    for (var i = 0; i < list.length; i++) {
      var a = list[i] || {};
      var b = reference[i];
      if (trim(a.label) !== b.label || trim(a.start) !== b.start || trim(a.end) !== b.end) return false;
    }
    return true;
  }

  /** 这组节次是不是某个历史版本的默认作息（说明用户从没改过节次） */
  function isLegacyPeriods(list) {
    for (var i = 0; i < LEGACY_DEFAULT_PERIODS.length; i++) {
      if (periodsEqual(list, LEGACY_DEFAULT_PERIODS[i])) return true;
    }
    return false;
  }

  function mergeConfig(input) {
    var base = defaultConfig();
    var src = input || {};
    var periods = Array.isArray(src.periods) && src.periods.length ? src.periods : base.periods;
    /* 老版本的默认作息自动换成新作息；用户自己调过的时间原样保留 */
    if (isLegacyPeriods(periods)) periods = base.periods;
    return {
      totalWeeks: clampInt(src.totalWeeks, 1, 60, base.totalWeeks),
      currentWeek: clampInt(src.currentWeek, 1, 60, 1),
      showWeekend: src.showWeekend !== false,
      highlightWeek: src.highlightWeek !== false,
      periods: periods.map(function (p, index) {
        return {
          label: trim(p && p.label) || '第' + (index + 1) + '节',
          start: trim(p && p.start) || '',
          end: trim(p && p.end) || ''
        };
      })
    };
  }

  /* ------------------------------------------------------- 状态与持久化 */

  var state = {
    courses: [],
    config: defaultConfig()
  };

  var listeners = [];

  function onChange(fn) {
    listeners.push(fn);
  }

  function emit() {
    listeners.slice().forEach(function (fn) {
      try { fn(state); } catch (err) { console.error(err); }
    });
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      var config = mergeConfig(data.config);
      var courses = (data.courses || data.list || []).map(normalizeCourse).filter(function (c) { return c.name; });
      state.config = config;
      state.courses = courses.map(function (c) {
        return clampCourse(c, config);
      });
      return true;
    } catch (err) {
      console.warn('读取本地数据失败：', err);
      return false;
    }
  }

  /* 课程按整个大节安排：只占第 4 节的课会被扩成第 3-4 节（整个大节），
     跨大节的课（如第 4-5 节）会扩成第 3-6 节。 */
  function snapPeriodsToUnits(start, end, total) {
    total = clampInt(total, 1, 60, UNIT_SIZE);
    var maxUnit = Math.max(1, Math.floor(total / UNIT_SIZE));
    var first = Math.min(Math.max(1, Math.ceil(clampInt(start, 1, total, 1) / UNIT_SIZE)), maxUnit);
    var last = Math.min(Math.max(first, Math.ceil(clampInt(end, first * UNIT_SIZE, total, first * UNIT_SIZE) / UNIT_SIZE)), maxUnit);
    return { start: (first - 1) * UNIT_SIZE + 1, end: Math.min(last * UNIT_SIZE, total) };
  }

  /* 当前课表一共有几个完整的大节（节次数量为奇数时，多出来的最后一节不算大节） */
  function unitCount(periods) {
    var list = periods || state.config.periods;
    return Math.max(1, Math.floor(list.length / UNIT_SIZE));
  }

  function clampCourse(course, config) {
    var total = (config || state.config).periods.length;
    var next = normalizeCourse(course);
    next.day = clampInt(next.day, 1, 7, 1);
    var snapped = snapPeriodsToUnits(next.startPeriod, next.endPeriod, total);
    next.startPeriod = snapped.start;
    next.endPeriod = snapped.end;
    return next;
  }

  function save(options) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        config: state.config,
        courses: state.courses
      }));
    } catch (err) {
      console.warn('保存失败（可能是浏览器禁用了本地存储）：', err);
    }
    if (!options || options.emit !== false) emit();
  }

  /* --------------------------------------------------------- 增删改查 */

  function getCourse(id) {
    for (var i = 0; i < state.courses.length; i++) if (state.courses[i].id === id) return state.courses[i];
    return null;
  }

  function addCourse(input, options) {
    var course = clampCourse(input);
    if (!course.name) return null;
    state.courses.push(course);
    if (!options || options.save !== false) save();
    return course;
  }

  function addCourses(list, options) {
    var added = [];
    (list || []).forEach(function (item) {
      var course = clampCourse(item);
      if (!course.name) return;
      state.courses.push(course);
      added.push(course);
    });
    if (!options || options.save !== false) save();
    return added;
  }

  function updateCourse(id, patch, options) {
    var course = getCourse(id);
    if (!course) return null;
    var next = clampCourse(Object.assign({}, course, patch, { id: course.id }));
    if (!next.name) return null;
    Object.assign(course, next);
    if (!options || options.save !== false) save();
    return course;
  }

  function removeCourse(id, options) {
    var before = state.courses.length;
    state.courses = state.courses.filter(function (c) { return c.id !== id; });
    if (state.courses.length !== before && (!options || options.save !== false)) save();
    return state.courses.length !== before;
  }

  function clearCourses(options) {
    state.courses = [];
    if (!options || options.save !== false) save();
  }

  function setConfig(patch, options) {
    state.config = mergeConfig(Object.assign({}, state.config, patch));
    state.courses = state.courses.map(function (c) { return clampCourse(c, state.config); });
    if (!options || options.save !== false) save();
    return state.config;
  }

  function courseColor(course) {
    var bg = normalizeHex(course && course.color) || autoColor(course && course.name);
    return {
      bg: bg,
      fg: textOn(bg),
      border: shade(bg, -0.28),
      strong: shade(bg, -0.55)
    };
  }

  /* 重新按课程名分配自动配色（清掉手动指定） */
  function recolorAuto(options) {
    state.courses.forEach(function (course) { course.color = ''; });
    if (!options || options.save !== false) save();
  }

  /* ---------------------------------------------------------- 冲突检测 */

  function overlaps(a, b, maxWeek) {
    if (a.day !== b.day) return false;
    if (a.startPeriod > b.endPeriod || b.startPeriod > a.endPeriod) return false;
    var wa = weeksOf(a, maxWeek), wb = weeksOf(b, maxWeek);
    for (var i = 0; i < wa.length; i++) {
      for (var j = 0; j < wb.length; j++) if (wa[i] === wb[j]) return true;
    }
    return false;
  }

  /** 返回 { courseId: [与之冲突的课程名…] } */
  function findConflicts(courses, maxWeek) {
    var list = courses || state.courses;
    var flags = {};
    for (var i = 0; i < list.length; i++) {
      for (var j = i + 1; j < list.length; j++) {
        if (!overlaps(list[i], list[j], maxWeek)) continue;
        push(flags, list[i].id, list[j]);
        push(flags, list[j].id, list[i]);
      }
    }
    return flags;
  }

  function push(flags, id, other) {
    if (!flags[id]) flags[id] = [];
    if (flags[id].indexOf(other) === -1) flags[id].push(other);
  }

  /* ------------------------------------------------------------- 统计 */

  function stats() {
    var names = {};
    var periods = 0;
    state.courses.forEach(function (c) {
      names[c.name] = 1;
      periods += c.endPeriod - c.startPeriod + 1;
    });
    var thisWeek = state.courses.filter(function (c) {
      return courseHasWeek(c, state.config.currentWeek, state.config.totalWeeks);
    }).length;
    return {
      courseCount: state.courses.length,
      subjectCount: Object.keys(names).length,
      entryPeriods: periods,
      thisWeekCount: thisWeek
    };
  }

  /* -------------------------------------------------------- 示例数据 */

  function seedDemo() {
    /* 课程按大节安排：每条课程都占满两节（一个大节）或它的整数倍 */
    state.courses = [
      { name: '高等数学', day: 1, startPeriod: 1, endPeriod: 2, weeks: '1-16', location: '三教 201', teacher: '张老师' },
      { name: '大学英语', day: 1, startPeriod: 3, endPeriod: 4, weeks: '1-16', location: '外语楼 105', teacher: 'Linda' },
      { name: '线性代数', day: 2, startPeriod: 1, endPeriod: 2, weeks: '1-8', location: '三教 305', teacher: '李老师' },
      { name: '程序设计基础', day: 2, startPeriod: 5, endPeriod: 6, weeks: '1-16', location: '机房 A302', teacher: '王老师' },
      { name: '大学物理', day: 3, startPeriod: 3, endPeriod: 4, weeks: '1-16单周', location: '理科楼 402', teacher: '刘老师' },
      { name: '体育（羽毛球）', day: 3, startPeriod: 7, endPeriod: 8, weeks: '1-16', location: '体育馆', teacher: '陈老师' },
      { name: '数据结构', day: 4, startPeriod: 1, endPeriod: 2, weeks: '1-16', location: '三教 108', teacher: '王老师' },
      { name: '思想政治', day: 4, startPeriod: 5, endPeriod: 6, weeks: '3-14', location: '文科楼 220', teacher: '赵老师' },
      { name: '大学英语', day: 5, startPeriod: 3, endPeriod: 4, weeks: '1-16', location: '外语楼 105', teacher: 'Linda' }
    ].map(function (c) { return clampCourse(c); });
    save();
  }

  /* 某个节次属于第几个大节（periodIndex 从 1 开始） */
  function unitOf(periodIndex) {
    return Math.floor((clampInt(periodIndex, 1, 60, 1) - 1) / UNIT_SIZE) + 1;
  }

  /* ------------------------------------------------------------- 导出 */

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    DAY_LABELS: DAY_LABELS,
    DEFAULT_PERIODS: DEFAULT_PERIODS,
    PALETTE: PALETTE,
    UNIT_SIZE: UNIT_SIZE,
    unitOf: unitOf,
    unitCount: unitCount,
    snapPeriodsToUnits: snapPeriodsToUnits,
    state: state,
    onChange: onChange,
    emit: emit,
    load: load,
    save: save,
    seedDemo: seedDemo,
    uid: uid,
    trim: trim,
    pad2: pad2,
    clampInt: clampInt,
    normalizeCourse: normalizeCourse,
    mergeConfig: mergeConfig,
    clampCourse: clampCourse,
    parseWeeks: parseWeeks,
    weeksToText: weeksToText,
    weeksOf: weeksOf,
    courseHasWeek: courseHasWeek,
    getCourse: getCourse,
    addCourse: addCourse,
    addCourses: addCourses,
    updateCourse: updateCourse,
    removeCourse: removeCourse,
    clearCourses: clearCourses,
    setConfig: setConfig,
    recolorAuto: recolorAuto,
    autoColor: autoColor,
    courseColor: courseColor,
    normalizeHex: normalizeHex,
    textOn: textOn,
    shade: shade,
    overlaps: overlaps,
    findConflicts: findConflicts,
    stats: stats
  };
})(window);
