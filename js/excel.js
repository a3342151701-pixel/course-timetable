/*!
 * excel.js — Excel 导入 / 导出
 * 导入：自动识别「网格型」（行=节次、列=星期）与「列表型」（每行一条课程）两种表格，
 *       回填合并单元格，输出解析预览所需的数据。
 * 导出：当前课表导出为网格型 Excel、两种格式的示例模板、JSON 备份。
 * 依赖 vendor/xlsx.full.min.js（SheetJS，本地内置，离线可用）。
 */
(function (global) {
  'use strict';

  var XLSX = global.XLSX;

  var trim = Store.trim;
  var uniq = function (list) { return list.filter(function (v, i) { return list.indexOf(v) === i; }); };

  /* ------------------------------------------------------------ 词表 */

  var WEEKDAY_CHARS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7, '七': 7 };
  var WEEKDAY_EN = { mon: 1, tue: 2, tues: 2, wed: 3, thu: 4, thur: 4, thurs: 4, fri: 5, sat: 6, sun: 7 };

  var PERIOD_CN = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10, '十一': 11, '十二': 12, '十三': 13, '十四': 14, '十五': 15, '十六': 16 };

  var LIST_ALIASES = {
    name: ['课程名称', '课程名', '课程', '科目', '学科', '课名', '名称', 'course', 'subject'],
    startPeriod: ['开始节次', '起始节次', '开始节', '起节', '开始课节', 'startperiod', 'start'],
    endPeriod: ['结束节次', '终止节次', '结束节', '末节', 'endperiod', 'end'],
    period: ['节次', '上课节次', '课节', '第几节', '节'],
    weeks: ['周次', '上课周次', '周数', '教学周', 'weeks', 'week', '周'],
    day: ['星期', '周几', '上课星期', 'weekday', 'day'],
    location: ['地点', '教室', '上课地点', '上课教室', '教学地点', 'room', 'location', '上课室'],
    teacher: ['教师', '老师', '任课教师', '授课教师', '任课老师', '教师姓名', 'teacher'],
    time: ['上课时间', '时间', 'time'],
    note: ['备注', '说明', '备注信息', 'note']
  };

  /* 字段匹配优先级：更具体的字段排在前面 */
  var FIELD_ORDER = ['name', 'day', 'startPeriod', 'endPeriod', 'period', 'weeks', 'location', 'teacher', 'time', 'note'];

  var LOCATION_HINT_RE = /(楼|室|馆|场|厅|堂|区|教室|机房|实验|中心|校区|线上|网课|腾讯会议|钉钉|zoom)/i;
  var ROOM_CODE_RE = /^[A-Za-z]{0,4}[-－]?\d{1,4}[A-Za-z]?$/;
  var MIXED_CODE_RE = /^[\u4e00-\u9fa5A-Za-z]{0,5}[-－]?\d{1,4}\s*[号栋]?[\u4e00-\u9fa5A-Za-z]{0,3}$/;
  var NOTE_HINT_RE = /(直播|线上|网课|慕课|自习|答疑|实验|实践|考核|考试|补课|停课|调课)/;
  var TEACHER_SUFFIX_RE = /^(.*?)(老师|教师|教授|副教授|讲师|助教)$/;
  var BLANK_MARK_RE = /^[-—–~\/\\、,，.。*]+$/;
  var PLACEHOLDER_RE = /^(上午|下午|晚上|中午|早上|合计|备注|说明|时间|节次|课程|星期|日期|休息|午休)$/;

  var WEEK_TOKEN_RE = new RegExp(
    '第?\\s*(?:(?:\\d{1,2}\\s*[-~～—到至]\\s*\\d{1,2})|\\d{1,2})' +
    '(?:\\s*[,，、]\\s*(?:(?:\\d{1,2}\\s*[-~～—到至]\\s*\\d{1,2})|\\d{1,2}))*\\s*' +
    '(?:单数|双数|奇数|偶数|单|双)?\\s*周' +
    '|单周|双周|单数周|双数周|奇数周|偶数周'
  );

  /* ------------------------------------------------------------ 解析工具 */

  function normalizeHeader(text) {
    return String(text == null ? '' : text)
      .replace(/[（(][^)）]*[)）]/g, '')
      .replace(/[\s\u00a0:：*]+/g, '')
      .toLowerCase();
  }

  function matchHeader(text) {
    var t = normalizeHeader(text);
    if (!t) return '';
    var i, j, aliases, alias;
    for (i = 0; i < FIELD_ORDER.length; i++) {
      aliases = LIST_ALIASES[FIELD_ORDER[i]];
      for (j = 0; j < aliases.length; j++) {
        if (t === aliases[j]) return FIELD_ORDER[i];
      }
    }
    for (i = 0; i < FIELD_ORDER.length; i++) {
      aliases = LIST_ALIASES[FIELD_ORDER[i]];
      for (j = 0; j < aliases.length; j++) {
        alias = aliases[j];
        if (alias.length >= 2 && t.indexOf(alias) >= 0) return FIELD_ORDER[i];
      }
    }
    return '';
  }

  function parseWeekday(text, options) {
    var loose = options && options.loose;
    var t = trim(text);
    if (!t) return 0;
    t = t.replace(/[（(][^)）]*[)）]/g, '').replace(/\s/g, '');
    var m = t.match(/(?:星期|周|礼拜|禮拜)([一二三四五六日天七1-7])/);
    if (m) return WEEKDAY_CHARS[m[1]] || parseInt(m[1], 10) || 0;
    var en = t.match(/^(mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun)/i);
    if (en) return WEEKDAY_EN[en[1].toLowerCase()] || 0;
    if (loose) {
      if (/^[1-7]$/.test(t)) return parseInt(t, 10);
      if (t.length === 1 && WEEKDAY_CHARS[t]) return WEEKDAY_CHARS[t];
    }
    return 0;
  }

  function parseWeekdayList(text) {
    var t = trim(text);
    if (!t) return [];
    var tokens = t.split(/[,，、;；\/|｜\s]+/).filter(Boolean);
    var days = [];
    tokens.forEach(function (token) {
      var day = parseWeekday(token, { loose: true });
      if (day) days.push(day);
    });
    if (!days.length) {
      var single = parseWeekday(t, {});
      if (single) days.push(single);
    }
    return uniq(days).sort(function (a, b) { return a - b; });
  }

  function looksLikeTime(text) {
    return /[:：]\s*\d/.test(trim(text));
  }

  function parseNumToken(token) {
    var t = trim(token);
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    return PERIOD_CN[t] != null ? PERIOD_CN[t] : NaN;
  }

  /** 从「第1-2节 / 3、4节 / 1 / 一」等文本中解析节次范围 */
  function parsePeriodRange(text) {
    var raw = trim(text);
    if (!raw || looksLikeTime(raw)) return null;
    var body = raw.replace(/第/g, '').replace(/[（(][^)）]*[)）]/g, '');
    var numPat = '(\\d{1,2}|[一二三四五六七八九十]{1,3})';
    var rangeRe = new RegExp(numPat + '\\s*[-~～—到至]+\\s*' + numPat);
    var listRe = new RegExp(numPat + '\\s*[、,，]+\\s*' + numPat);
    var from, to;

    var m = body.match(rangeRe);
    if (!m) m = body.match(listRe);
    if (m) {
      from = parseNumToken(m[1]);
      to = parseNumToken(m[2]);
    } else {
      var single = body.match(numPat);
      if (!single) return null;
      from = to = parseNumToken(single[1]);
    }
    if (isNaN(from)) return null;
    if (isNaN(to)) to = from;
    if (from > to) { var t = from; from = to; to = t; }
    if (from < 1 || from > 30) return null;
    return { start: from, end: Math.min(to, 30) };
  }

  function extractWeekText(text) {
    var m = String(text || '').match(WEEK_TOKEN_RE);
    return m ? trim(m[0]) : '';
  }

  /**
   * 解析单个课程单元格文本，形如：
   *   "高等数学\n张老师\n三教201"、"高数@A101"、"大学英语(外语楼105)"、"程序设计 王老师 机房A302"
   */
  function parseCellText(text) {
    var out = { name: '', teacher: '', location: '', note: '', weeks: '' };
    var raw = String(text == null ? '' : text).replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
    var week = extractWeekText(raw);
    if (week) {
      out.weeks = week;
      raw = raw.replace(week, ' ');
    }

    var segments = raw.split('\n').map(trim).filter(Boolean);
    if (!segments.length) return out;

    var nameLine = segments.shift();
    var rest = [];

    var at = nameLine.match(/^(.*?)\s*[@＠]\s*(.+)$/);
    if (at) {
      nameLine = trim(at[1]);
      rest.push(trim(at[2]));
    } else {
      var paren = nameLine.match(/^(.*?)[（(]\s*([^()（）]{1,24})\s*[)）]\s*$/);
      if (paren && /[\dA-Za-z]|楼|室|馆|场|厅|区/.test(paren[2])) {
        nameLine = trim(paren[1]);
        rest.push(trim(paren[2]));
      }
    }

    var parts = nameLine.split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      var tail = parts.slice(1);
      var strongSignal = tail.some(function (part) {
        return TEACHER_SUFFIX_RE.test(part) || LOCATION_HINT_RE.test(part) ||
          ROOM_CODE_RE.test(part) || MIXED_CODE_RE.test(part);
      });
      if (strongSignal) {
        nameLine = parts[0];
        rest = rest.concat(tail);
      }
    }
    out.name = nameLine;

    var tokens = [];
    rest.concat(segments).forEach(function (segment) {
      segment.split(/[\s\/|｜·•,，、]+/).forEach(function (token) {
        token = trim(token).replace(/^[（(\[【]+/, '').replace(/[)）\]】]+$/, '');
        if (token) tokens.push(token);
      });
    });

    tokens.forEach(function (token) {
      if (/^[-—–]+$/.test(token)) return;
      var teacherMatch = token.match(TEACHER_SUFFIX_RE);
      if (teacherMatch && !out.teacher) {
        out.teacher = trim(teacherMatch[1]);
        return;
      }
      if (!out.location && (LOCATION_HINT_RE.test(token) || ROOM_CODE_RE.test(token) || MIXED_CODE_RE.test(token))) {
        out.location = token;
        return;
      }
      if (NOTE_HINT_RE.test(token)) {
        out.note = out.note ? out.note + ' ' + token : token;
        return;
      }
      if (!out.teacher && (/^[\u4e00-\u9fa5]{2,5}$/.test(token) || /^[A-Za-z][A-Za-z.\-'·]{1,19}$/.test(token)) && !PLACEHOLDER_RE.test(token)) {
        out.teacher = token;
        return;
      }
      out.note = out.note ? out.note + ' ' + token : token;
    });

    return out;
  }

  /* -------------------------------------------------------- 表格 -> 二维数组 */

  function worksheetToAoa(ws) {
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: true, raw: false });
    var rows = aoa.map(function (row) {
      return (row || []).map(function (cell) {
        return trim(cell == null ? '' : String(cell));
      });
    });

    /* 合并单元格：把左上角的值回填到整个合并区域 */
    var merges = ws['!merges'] || [];
    merges.forEach(function (m) {
      var value = rows[m.s.r] ? trim(rows[m.s.r][m.s.c]) : '';
      if (!value) return;
      for (var r = m.s.r; r <= m.e.r; r++) {
        if (!rows[r]) rows[r] = [];
        for (var c = m.s.c; c <= m.e.c; c++) {
          if (r === m.s.r && c === m.s.c) continue;
          if (!trim(rows[r][c])) rows[r][c] = value;
        }
      }
    });

    var width = 0;
    rows.forEach(function (row) { width = Math.max(width, row.length); });
    rows.forEach(function (row) {
      while (row.length < width) row.push('');
    });
    return rows;
  }

  function noDataRows(rows) {
    return rows.filter(function (row) {
      return row.some(function (cell) { return trim(cell); });
    }).length < 2;
  }

  /* ---------------------------------------------------------- 布局识别 */

  function detectGrid(rows) {
    var best = null;
    var limit = Math.min(rows.length, 15);
    for (var r = 0; r < limit; r++) {
      var columns = [];
      var row = rows[r] || [];
      for (var c = 0; c < row.length; c++) {
        var day = parseWeekday(row[c], { loose: false });
        if (day) columns.push({ c: c, day: day });
      }
      var days = uniq(columns.map(function (item) { return item.day; }));
      if (days.length >= 3) {
        var score = days.length * 10 + Math.min(9, row.filter(Boolean).length) - r;
        if (!best || score > best.score) best = { headerRow: r, columns: columns, days: days, score: score };
      }
    }
    return best;
  }

  function detectList(rows) {
    var best = null;
    var limit = Math.min(rows.length, 15);
    for (var r = 0; r < limit; r++) {
      var map = {};
      var row = rows[r] || [];
      for (var c = 0; c < row.length; c++) {
        var field = matchHeader(row[c]);
        if (field && map[field] === undefined) map[field] = c;
      }
      var hasName = map.name !== undefined;
      var hasWhen = map.day !== undefined || map.period !== undefined ||
        map.startPeriod !== undefined || map.time !== undefined;
      if (!hasName || !hasWhen) continue;
      var score = Object.keys(map).length * 5 - r;
      if (!best || score > best.score) best = { headerRow: r, map: map, score: score };
    }
    return best;
  }

  function decideMode(rows, gridDet, listDet) {
    if (gridDet && !listDet) return 'grid';
    if (listDet && !gridDet) return 'list';
    if (!gridDet && !listDet) return '';
    if (gridDet.days.length >= 5 && gridDet.headerRow <= listDet.headerRow) return 'grid';
    return gridDet.headerRow <= listDet.headerRow ? 'grid' : 'list';
  }

  /* ---------------------------------------------------------- 网格型解析 */

  function parseGrid(rows, det, config, warnings) {
    var courses = [];
    var columns = det.columns;
    var periodMap = {};
    var hasPeriodLabel = false;

    for (var r = det.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var hasContent = columns.some(function (col) { return trim(row[col.c]); });
      if (!hasContent) continue;
      periodMap[r] = null;
    }

    var rowKeys = Object.keys(periodMap).map(Number);
    var order = 0;

    rowKeys.forEach(function (r) {
      var row = rows[r] || [];
      var label = '';
      for (var c = 0; c < row.length; c++) {
        if (columns.some(function (col) { return col.c === c; })) continue;
        if (trim(row[c])) { label = trim(row[c]); break; }
      }
      order++;
      var range = parsePeriodRange(label);
      if (range) hasPeriodLabel = true;
      periodMap[r] = range || { start: order, end: order };
    });

    if (!hasPeriodLabel) {
      warnings.push('未找到明确的节次标签，已按行顺序推断为第 1 节起的连续节次，请导入后在编辑面板中核对。');
    }

    rowKeys.forEach(function (r) {
      var row = rows[r] || [];
      var range = periodMap[r];
      columns.forEach(function (col) {
        var text = trim(row[col.c]);
        if (!text || BLANK_MARK_RE.test(text)) return;
        var parsed = parseCellText(text);
        if (!parsed.name || PLACEHOLDER_RE.test(parsed.name)) return;
        var weeks = '全部';
        if (parsed.weeks) {
          var weekParsed = Store.parseWeeks(parsed.weeks, config.totalWeeks);
          weeks = weekParsed.text || parsed.weeks;
          if (weekParsed.warning) warnings.push('「' + parsed.name + '」：' + weekParsed.warning);
        }
        courses.push({
          name: parsed.name,
          day: col.day,
          startPeriod: range.start,
          endPeriod: range.end,
          weeks: weeks,
          location: parsed.location,
          teacher: parsed.teacher,
          note: parsed.note
        });
      });
    });

    return mergeAdjacent(courses);
  }

  /** 合并因纵向合并单元格而产生的连续重复课程 */
  function mergeAdjacent(courses) {
    var sorted = courses.slice().sort(function (a, b) {
      return a.day - b.day || a.startPeriod - b.startPeriod || String(a.name).localeCompare(String(b.name));
    });
    var out = [];
    sorted.forEach(function (course) {
      var prev = out[out.length - 1];
      var sameKey = prev && prev.day === course.day && prev.name === course.name &&
        prev.teacher === course.teacher && prev.location === course.location && prev.weeks === course.weeks;
      if (sameKey && course.startPeriod <= prev.endPeriod + 1) {
        prev.endPeriod = Math.max(prev.endPeriod, course.endPeriod);
        return;
      }
      out.push(Object.assign({}, course));
    });
    return out;
  }

  /* ---------------------------------------------------------- 列表型解析 */

  function cellOf(row, index) {
    return index === undefined ? '' : trim(row[index]);
  }

  function parseList(rows, det, config, warnings) {
    var map = det.map;
    var courses = [];

    for (var r = det.headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      var name = cellOf(row, map.name);
      if (!name || PLACEHOLDER_RE.test(name)) continue;
      if (BLANK_MARK_RE.test(name)) continue;

      var dayText = cellOf(row, map.day);
      var periodText = cellOf(row, map.period);
      var startText = cellOf(row, map.startPeriod);
      var endText = cellOf(row, map.endPeriod);
      var timeText = cellOf(row, map.time);

      var days = parseWeekdayList(dayText);
      var range = parsePeriodRange(periodText);

      if (!range && (startText || endText)) {
        var from = parsePeriodRange(startText);
        var to = parsePeriodRange(endText);
        var s = from ? from.start : (to ? to.start : 0);
        var e = to ? to.end : s;
        if (s) range = { start: s, end: e || s };
      }

      if (timeText) {
        if (!days.length || !range) {
          var m = timeText.match(/(?:星期|周|礼拜)([一二三四五六日天1-7])/);
          if (!days.length && m) days = [WEEKDAY_CHARS[m[1]] || parseInt(m[1], 10)];
          if (!range) {
            var tp = timeText.match(/(?:第)?\s*(\d{1,2})\s*[-~～—到至]\s*(\d{1,2})\s*(?:节|课)?/);
            if (tp) range = { start: parseInt(tp[1], 10), end: parseInt(tp[2], 10) };
          }
        }
      }

      if (!days.length) {
        warnings.push('第 ' + (r + 1) + ' 行「' + name + '」缺少星期信息，已跳过。');
        continue;
      }
      if (!range) {
        range = { start: 1, end: 1 };
        warnings.push('第 ' + (r + 1) + ' 行「' + name + '」缺少节次信息，已默认填入第 1 节。');
      }

      var weekText = cellOf(row, map.weeks);
      var weeks = '全部';
      if (weekText) {
        var parsed = Store.parseWeeks(weekText, config.totalWeeks);
        weeks = parsed.text || weekText;
        if (parsed.warning) warnings.push('第 ' + (r + 1) + ' 行：「' + parsed.warning + '」');
      }

      days.forEach(function (day) {
        courses.push({
          name: name,
          day: day,
          startPeriod: range.start,
          endPeriod: range.end,
          weeks: weeks,
          location: cellOf(row, map.location),
          teacher: cellOf(row, map.teacher),
          note: cellOf(row, map.note)
        });
      });
    }

    return mergeAdjacent(courses);
  }

  /* ------------------------------------------------------------ 主流程 */

  function decodeText(buffer, encoding) {
    try {
      return new TextDecoder(encoding, { fatal: false }).decode(buffer);
    } catch (err) {
      return '';
    }
  }

  /** CSV 常常是 GBK 编码（Excel 另存为 CSV 的默认行为），这里先按 UTF-8 试，失败再按 GBK 解 */
  function readCsvText(buffer) {
    var utf8 = decodeText(buffer, 'utf-8');
    if (utf8 && utf8.indexOf('\ufffd') === -1) return utf8;
    var gbk = decodeText(buffer, 'gbk');
    return gbk || utf8;
  }

  function readWorkbook(file) {
    return new Promise(function (resolve, reject) {
      if (!XLSX) { reject(new Error('Excel 解析库未加载（vendor/xlsx.full.min.js）')); return; }
      var isCsv = /\.(csv|txt)$/i.test(file.name || '') || /text\/(csv|plain)/i.test(file.type || '');
      var reader = new FileReader();
      reader.onload = function (event) {
        try {
          var wb;
          if (isCsv) {
            var text = readCsvText(event.target.result);
            if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
            /* raw:true 关掉 SheetJS 对纯文本的自动类型猜测，
               否则「5-6」这种节次会被当成日期 5月6日 */
            wb = XLSX.read(text, { type: 'string', raw: true });
          } else {
            wb = XLSX.read(new Uint8Array(event.target.result), { type: 'array' });
          }
          resolve(wb);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = function () { reject(reader.error || new Error('读取文件失败')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function parseSheet(wb, sheetName, options) {
    options = options || {};
    var config = options.config || Store.state.config;
    var warnings = [];
    var name = sheetName || wb.SheetNames[0];
    var ws = wb.Sheets[name];
    if (!ws) throw new Error('找不到工作表：' + name);

    var rows = worksheetToAoa(ws);
    if (noDataRows(rows)) {
      return { mode: '', autoMode: '', sheetName: name, courses: [], warnings: ['工作表内容为空。'], preview: rows.slice(0, 8) };
    }

    var gridDet = detectGrid(rows);
    var listDet = detectList(rows);
    var autoMode = decideMode(rows, gridDet, listDet);
    var mode = options.mode && options.mode !== 'auto' ? options.mode : autoMode;

    if (!mode) {
      warnings.push('未能自动识别表格结构，请在「表格格式」中手动选择网格型或列表型。');
      return { mode: '', autoMode: '', sheetName: name, courses: [], warnings: warnings, preview: rows.slice(0, 8) };
    }

    var courses;
    if (mode === 'grid') {
      if (!gridDet) {
        warnings.push('未能找到「星期一至星期日」表头行，无法按网格型解析。');
        courses = [];
      } else {
        courses = parseGrid(rows, gridDet, config, warnings);
      }
      if (mode !== autoMode) warnings.push('已按你选择的「网格型」解析。');
    } else {
      if (!listDet) {
        warnings.push('未能找到「课程名称 / 星期 / 节次」等列标题，无法按列表型解析。');
        courses = [];
      } else {
        courses = parseList(rows, listDet, config, warnings);
      }
      if (mode !== autoMode) warnings.push('已按你选择的「列表型」解析。');
    }

    /* 课程按「大节」安排：一个大节 = 两节 45 分钟的课。
       表格里只写了半节（例如只有「第4节」）的课程，会自动扩成包含它的整个大节（第3-4节）；
       超出课表范围的节次也在这里截断。 */
    var totalPeriods = (config.periods || []).length;
    var halfUnit = 0;
    var outOfRange = 0;
    courses = courses.map(function (course) {
      var aligned = (course.startPeriod - 1) % Store.UNIT_SIZE === 0 && course.endPeriod % Store.UNIT_SIZE === 0;
      var inRange = course.startPeriod >= 1 && course.endPeriod <= totalPeriods;
      if (!inRange) outOfRange++;
      else if (!aligned) halfUnit++;
      var fixed = Store.snapPeriodsToUnits(course.startPeriod, course.endPeriod, totalPeriods);
      return Object.assign({}, course, { startPeriod: fixed.start, endPeriod: fixed.end });
    });
    if (halfUnit) {
      warnings.push('有 ' + halfUnit + ' 条课程没有占满整个大节（例如只写了第 4 节），已自动扩成连着两节的大节。');
    }
    if (outOfRange) {
      warnings.push('有 ' + outOfRange + ' 条课程的节次超出当前课表范围（共 ' + totalPeriods + ' 节），已在导入时截断到课表范围内。');
    }

    return {
      mode: mode,
      autoMode: autoMode,
      sheetName: name,
      courses: courses,
      warnings: warnings,
      preview: rows.slice(0, 8),
      totalRows: rows.length
    };
  }

  /* -------------------------------------------------------------- 导出 */

  function daysToShow(config) {
    return (config.showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5]);
  }

  function buildGridAoa(courses, config) {
    var days = daysToShow(config);
    var periods = config.periods;
    var aoa = [['节次', '时间'].concat(days.map(function (d) { return Store.DAY_LABELS[d - 1]; }))];
    var merges = [];
    var occupied = [];
    var grid = {};

    function isFree(r0, r1, col) {
      return !occupied.some(function (o) {
        return o.c === col && !(r1 < o.r0 || r0 > o.r1);
      });
    }

    function setCell(r, col, text) {
      if (!grid[r]) grid[r] = {};
      grid[r][col] = grid[r][col] ? grid[r][col] + ' / ' + text : text;
    }

    courses.slice().sort(function (a, b) {
      return a.startPeriod - b.startPeriod || a.day - b.day;
    }).forEach(function (course) {
      var col = days.indexOf(course.day);
      if (col < 0) return;
      col += 2;
      var r0 = Math.max(1, course.startPeriod);
      var r1 = Math.min(periods.length, Math.max(r0, course.endPeriod));
      var lines = [course.name];
      if (course.teacher) lines.push(course.teacher);
      if (course.location) lines.push(course.location);
      if (course.weeks && course.weeks !== '全部' && course.weeks !== '1-' + config.totalWeeks) {
        lines.push(course.weeks + '周');
      }
      var text = lines.join('\n');
      if (r1 > r0 && isFree(r0, r1, col)) {
        occupied.push({ r0: r0, r1: r1, c: col });
        setCell(r0, col, text);
        merges.push({ s: { r: r0, c: col }, e: { r: r1, c: col } });
      } else {
        setCell(r0, col, text);
      }
    });

    for (var p = 0; p < periods.length; p++) {
      var period = periods[p];
      var timeText = period.start && period.end ? period.start + '-' + period.end : (period.start || '');
      var row = [period.label, timeText];
      var line = grid[p + 1] || {};
      for (var i = 0; i < days.length; i++) row.push(line[i + 2] || '');
      aoa.push(row);
    }

    return { aoa: aoa, merges: merges, days: days };
  }

  function buildListAoa(courses) {
    var aoa = [['课程名称', '星期', '开始节次', '结束节次', '周次', '地点', '教师', '备注']];
    courses.slice().sort(function (a, b) {
      return a.day - b.day || a.startPeriod - b.startPeriod;
    }).forEach(function (course) {
      aoa.push([
        course.name,
        Store.DAY_LABELS[course.day - 1] || '',
        course.startPeriod,
        course.endPeriod,
        course.weeks || '全部',
        course.location || '',
        course.teacher || '',
        course.note || ''
      ]);
    });
    return aoa;
  }

  function sheetFromAoa(aoa, options) {
    options = options || {};
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    if (options.merges && options.merges.length) ws['!merges'] = options.merges;
    var width = 0;
    aoa.forEach(function (row) { width = Math.max(width, row.length); });
    var cols = [];
    for (var c = 0; c < width; c++) cols.push({ wch: c === 0 ? 12 : (c === 1 ? 14 : 20) });
    ws['!cols'] = cols;
    if (options.rowHeight) {
      ws['!rows'] = aoa.map(function (_, index) {
        return { hpt: index === 0 ? 18 : options.rowHeight };
      });
    }
    return ws;
  }

  function saveWorkbook(wb, filename) {
    XLSX.writeFile(wb, filename, { compression: true });
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + Store.pad2(d.getMonth() + 1) + Store.pad2(d.getDate());
  }

  function exportGrid(courses, config) {
    if (!XLSX) throw new Error('Excel 解析库未加载');
    var built = buildGridAoa(courses, config);
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(built.aoa, { merges: built.merges, rowHeight: 48 }), '课程表');
    saveWorkbook(wb, '课程表-' + stamp() + '.xlsx');
  }

  function exportList(courses) {
    if (!XLSX) throw new Error('Excel 解析库未加载');
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(buildListAoa(courses), { rowHeight: 18 }), '课程列表');
    saveWorkbook(wb, '课程列表-' + stamp() + '.xlsx');
  }

  var TEMPLATE_GRID = [
    ['节次', '时间', '周一', '周二', '周三', '周四', '周五', '周六', '周日'],
    ['第1节', '08:00-08:45', '高等数学\n张老师\n三教201', '', '大学物理\n刘老师\n理科楼402', '', '', '', ''],
    ['第2节', '08:50-09:35', '高等数学\n张老师\n三教201', '线性代数\n李老师\n三教305', '大学物理\n刘老师\n理科楼402', '', '', '', ''],
    ['第3节', '09:50-10:35', '', '', '', '数据结构\n王老师\n三教108', '大学英语\nLinda\n外语楼105', '', ''],
    ['第4节', '10:40-11:25', '', '', '', '数据结构\n王老师\n三教108', '大学英语\nLinda\n外语楼105', '', ''],
    ['第5节', '14:00-14:45', '', '程序设计基础\n王老师\n机房A302', '', '', '', '', ''],
    ['第6节', '14:50-15:35', '', '程序设计基础\n王老师\n机房A302', '', '', '', '', ''],
    ['第7节', '15:50-16:35', '', '', '体育\n陈老师\n体育馆', '', '', '', ''],
    ['第8节', '16:40-17:25', '', '', '体育\n陈老师\n体育馆', '', '', '', ''],
    ['第9节', '18:00-18:45', '', '', '', '', '', '', ''],
    ['第10节', '18:50-19:35', '', '', '', '', '', '', '']
  ];

  var TEMPLATE_LIST = [
    ['课程名称', '星期', '开始节次', '结束节次', '周次', '地点', '教师', '备注'],
    ['高等数学', '周一', 1, 2, '1-16', '三教201', '张老师', '带计算器'],
    ['大学物理', '周三', 1, 2, '1-16单周', '理科楼402', '刘老师', ''],
    ['大学英语', '周一,周五', 3, 4, '1-16', '外语楼105', 'Linda', '分 A/B 班'],
    ['数据结构', '周四', 3, 4, '2-16双周', '三教108', '王老师', '']
  ];

  var TEMPLATE_NOTES = [
    ['课程表模板填写说明'],
    [''],
    ['方式一：网格型（sheet「课程表模板」）'],
    ['1. 第一行是表头，必须是「周一」到「周日」这样的写法（也支持星期一、礼拜一、Mon）。'],
    ['2. 第一列写节次，可以是「第1节」「1」「1-2节」，也支持用中文数字「第一节」。'],
    ['3. 单元格里可以写多行：第一行课程名称，后面几行分别写教师、地点、周次。'],
    ['4. 同一门课连着上两节（如 1-2 节）时，把上下两行合并成一个单元格即可，导入时会自动合成一条。'],
    ['5. 单元格里也可以用「高等数学@三教201」或「高等数学(三教201)」这种一行写法。'],
    ['6. 课程按「大节」安排：一个大节 = 连着两节 45 分钟的课（第 1-2 节、第 3-4 节……），'],
    ['   所以请把课程写在完整的大节里；只写了半节（例如只有第 4 节）的课程，导入时会自动扩成整个大节。'],
    [''],
    ['方式二：列表型（sheet「课程列表模板」）'],
    ['1. 第一行是列标题，需要包含「课程名称」，以及「星期」「节次」中的至少一个。'],
    ['2. 星期可以写「周一」，也可以写「1」；多个星期用逗号分隔，如「周一,周三」。'],
    ['3. 节次可以只写「节次」一列（如「1-2」「3、4」），也可以分成「开始节次」「结束节次」两列。'],
    ['4. 周次支持「1-16」「1-8,10-16」「1-16单周」「1-16双周」「全部」，留空表示全部周次。'],
    ['5. 列标题支持常见别名：老师/教师/任课教师、教室/地点/上课地点、备注/说明等。'],
    ['6. 节次同样按大节写（1-2、3-4、5-6……），写成单节时导入后会自动扩成整个大节。'],
    [''],
    ['说明：以上示例行仅供参考，导入自己的课表时请替换或删除示例内容。'],
    ['导出的 Excel 不包含颜色，课程颜色只在网页中显示。']
  ];

  function downloadTemplateGrid() {
    var wb = XLSX.utils.book_new();
    var aoa = TEMPLATE_GRID.map(function (row) { return row.slice(); });
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(aoa, { rowHeight: 48 }), '课程表模板');
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(TEMPLATE_NOTES, { rowHeight: 18 }), '填写说明');
    saveWorkbook(wb, '课程表模板-网格型.xlsx');
  }

  function downloadTemplateList() {
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(TEMPLATE_LIST.map(function (row) { return row.slice(); }), { rowHeight: 18 }), '课程列表模板');
    XLSX.utils.book_append_sheet(wb, sheetFromAoa(TEMPLATE_NOTES, { rowHeight: 18 }), '填写说明');
    saveWorkbook(wb, '课程表模板-列表型.xlsx');
  }

  function exportJson() {
    var payload = {
      type: 'course-timetable-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      config: Store.state.config,
      courses: Store.state.courses
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = '课程表备份-' + stamp() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function readJson(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (event) {
        try {
          var data = JSON.parse(event.target.result);
          if (Array.isArray(data)) resolve({ courses: data, config: null });
          else resolve({ courses: data.courses || data.list || [], config: data.config || null });
        } catch (err) {
          reject(new Error('JSON 备份文件解析失败：' + err.message));
        }
      };
      reader.onerror = function () { reject(reader.error || new Error('读取文件失败')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  global.Excel = {
    readWorkbook: readWorkbook,
    parseSheet: parseSheet,
    worksheetToAoa: worksheetToAoa,
    parseCellText: parseCellText,
    parseWeekday: parseWeekday,
    parseWeekdayList: parseWeekdayList,
    parsePeriodRange: parsePeriodRange,
    matchHeader: matchHeader,
    buildGridAoa: buildGridAoa,
    buildListAoa: buildListAoa,
    exportGrid: exportGrid,
    exportList: exportList,
    downloadTemplateGrid: downloadTemplateGrid,
    downloadTemplateList: downloadTemplateList,
    exportJson: exportJson,
    readJson: readJson
  };
})(window);
