/*!
 * ui.js — 界面渲染与交互
 * 课表网格、课程列表、编辑抽屉、导入预览、设置弹窗、提示消息。
 */
(function () {
  'use strict';

  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };

  var ui = {
    view: 'grid',
    highlight: '',
    listQuery: '',
    listDay: 0,
    listSort: 'time'
  };

  function config() { return Store.state.config; }
  function courses() { return Store.state.courses; }

  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* --------------------------------------------------------------- 提示 */

  function toast(message, isError) {
    var wrap = $('#toastWrap');
    var el = document.createElement('div');
    el.className = 'toast' + (isError ? ' is-error' : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 260);
    }, isError ? 4200 : 2600);
  }

  /* ------------------------------------------------------------ 周次工具 */

  function weekTextOf(course) {
    var total = config().totalWeeks;
    var text = Store.trim(course.weeks);
    if (!text || text === '全部') return '全部周次';
    var parsed = Store.parseWeeks(text, total);
    if (parsed.all) return '全部周次';
    return parsed.text + (/(单周|双周)$/.test(parsed.text) ? '' : ' 周');
  }

  function isActiveThisWeek(course) {
    var cfg = config();
    return Store.courseHasWeek(course, cfg.currentWeek, cfg.totalWeeks);
  }

  /* ------------------------------------------------------------ 课表网格 */

  function renderGrid() {
    var cfg = config();
    var grid = $('#ttGrid');
    var days = cfg.showWeekend ? [1, 2, 3, 4, 5, 6, 7] : [1, 2, 3, 4, 5];
    var periods = cfg.periods;
    var total = periods.length;
    var conflicts = Store.findConflicts(courses(), cfg.totalWeeks);
    var todayRaw = new Date().getDay();
    var today = todayRaw === 0 ? 7 : todayRaw;
    var html = [];

    grid.style.gridTemplateColumns = 'var(--period-col) repeat(' + days.length + ', minmax(var(--day-col), 1fr))';

    html.push('<div class="head corner" style="grid-row:1;grid-column:1">节次 / 星期</div>');
    days.forEach(function (day, index) {
      var count = courses().filter(function (course) {
        return course.day === day && isActiveThisWeek(course);
      }).length;
      html.push(
        '<div class="head' + (day === today ? ' today' : '') + '" style="grid-row:1;grid-column:' + (index + 2) + '">' +
          Store.DAY_LABELS[day - 1] +
          '<small>' + (count ? count + ' 节课' : '—') + '</small>' +
        '</div>'
      );
    });

    periods.forEach(function (period, index) {
      var time = period.start && period.end ? period.start + '-' + period.end : (period.start || period.end || '');
      html.push(
        '<div class="period" style="grid-row:' + (index + 2) + ';grid-column:1">' +
          '<b>' + esc(period.label) + '</b>' +
          (time ? '<small>' + esc(time) + '</small>' : '') +
        '</div>'
      );
    });

    days.forEach(function (day, dayIndex) {
      for (var p = 1; p <= total; p++) {
        html.push('<div class="cell" data-day="' + day + '" data-period="' + p + '" style="grid-row:' + (p + 1) + ';grid-column:' + (dayIndex + 2) + '"></div>');
      }
    });

    courses().forEach(function (course) {
      var dayIndex = days.indexOf(course.day);
      if (dayIndex < 0) return;
      var start = Math.min(Math.max(1, course.startPeriod), total);
      var end = Math.min(Math.max(start, course.endPeriod), total);
      var color = Store.courseColor(course);
      var active = isActiveThisWeek(course);
      var dimmed = ui.highlight && ui.highlight !== course.name;
      var classes = ['course'];
      if (end - start + 1 <= 1) classes.push('span-1');
      if (cfg.highlightWeek && !active) classes.push('is-inactive');
      if (dimmed) classes.push('is-dimmed');
      var meta = [course.location, course.teacher].filter(Boolean).join(' · ');
      var weeks = (!Store.parseWeeks(course.weeks, cfg.totalWeeks).all) ? weekTextOf(course) : '';
      var conflictList = conflicts[course.id];

      html.push(
        '<button type="button" class="' + classes.join(' ') + '" data-id="' + esc(course.id) + '"' +
          ' style="grid-row:' + (start + 1) + ' / ' + (end + 2) + ';grid-column:' + (dayIndex + 2) + ';' +
          'background:' + color.bg + ';color:' + color.fg + ';border-left-color:' + color.border + '"' +
          ' title="' + esc([course.name, meta, weekTextOf(course)].filter(Boolean).join(' ｜ ')) + '">' +
          '<span class="c-name">' + esc(course.name) + '</span>' +
          (meta ? '<span class="c-meta">' + esc(meta) + '</span>' : '') +
          (weeks ? '<span class="c-weeks">' + esc(weeks) + '</span>' : '') +
          (conflictList ? '<span class="c-warn" title="与「' + esc(conflictList.map(function (c) { return c.name; }).join('、')) + '」时间冲突">冲突</span>' : '') +
        '</button>'
      );
    });

    grid.innerHTML = html.join('');
  }

  /* -------------------------------------------------------------- 图例 */

  function renderLegend() {
    var legend = $('#legend');
    var seen = {}, order = [];
    courses().forEach(function (course) {
      if (seen[course.name]) return;
      seen[course.name] = 1;
      order.push(course);
    });
    if (!order.length) { legend.innerHTML = ''; return; }
    legend.innerHTML = order.map(function (course) {
      var color = Store.courseColor(course);
      return '<button type="button" class="legend-chip' + (ui.highlight === course.name ? ' is-active' : '') + '" data-name="' + esc(course.name) + '">' +
        '<i style="background:' + color.bg + '"></i>' + esc(course.name) + '</button>';
    }).join('');
  }

  /* ------------------------------------------------------------ 列表视图 */

  function sortCourses(list) {
    var copy = list.slice();
    if (ui.listSort === 'name') {
      copy.sort(function (a, b) {
        return String(a.name).localeCompare(String(b.name), 'zh-Hans-CN') || a.day - b.day || a.startPeriod - b.startPeriod;
      });
    } else if (ui.listSort === 'weeks') {
      copy.sort(function (a, b) {
        var wa = Store.weeksOf(a, config().totalWeeks);
        var wb = Store.weeksOf(b, config().totalWeeks);
        return (wa[0] || 0) - (wb[0] || 0) || wa.length - wb.length || a.day - b.day;
      });
    } else {
      copy.sort(function (a, b) {
        return a.day - b.day || a.startPeriod - b.startPeriod || String(a.name).localeCompare(String(b.name));
      });
    }
    return copy;
  }

  function renderList() {
    var tbody = $('#courseTbody');
    var query = ui.listQuery.trim().toLowerCase();
    var cfg = config();
    var list = courses().filter(function (course) {
      if (ui.listDay && course.day !== ui.listDay) return false;
      if (!query) return true;
      return [course.name, course.location, course.teacher, course.note, course.weeks]
        .join(' ').toLowerCase().indexOf(query) >= 0;
    });
    list = sortCourses(list);

    var conflicts = Store.findConflicts(courses(), cfg.totalWeeks);

    tbody.innerHTML = list.map(function (course) {
      var color = Store.courseColor(course);
      var periods = cfg.periods;
      var startLabel = periods[course.startPeriod - 1] ? periods[course.startPeriod - 1].label : '第' + course.startPeriod + '节';
      var endLabel = periods[course.endPeriod - 1] ? periods[course.endPeriod - 1].label : '第' + course.endPeriod + '节';
      var range = course.endPeriod > course.startPeriod
        ? startLabel + ' - ' + endLabel.replace(/^第/, '')
        : startLabel;
      var active = isActiveThisWeek(course);
      return '<tr data-id="' + esc(course.id) + '">' +
        '<td><span class="name-cell"><i style="background:' + color.bg + '"></i>' + esc(course.name) +
          (conflicts[course.id] ? ' <span class="tag" style="color:var(--danger);border-color:var(--danger)">冲突</span>' : '') +
        '</span></td>' +
        '<td>' + Store.DAY_LABELS[course.day - 1] + '</td>' +
        '<td>' + esc(range) + '</td>' +
        '<td><span class="tag' + (active ? ' this-week' : '') + '">' + esc(weekTextOf(course)) + '</span></td>' +
        '<td>' + esc(course.location || '—') + '</td>' +
        '<td>' + esc(course.teacher || '—') + '</td>' +
        '<td>' + esc(course.note || '') + '</td>' +
        '<td class="col-op">' +
          '<button type="button" class="mini" data-act="edit">编辑</button> ' +
          '<button type="button" class="mini is-danger" data-act="delete">删除</button>' +
        '</td>' +
      '</tr>';
    }).join('');

    $('#listEmpty').hidden = list.length > 0;
    $('#listCount').textContent = '共 ' + list.length + ' 条' + (list.length !== courses().length ? '（全部 ' + courses().length + ' 条）' : '');
  }

  function renderStats() {
    var cfg = config();
    var stats = Store.stats();
    $('#stats').textContent = '第 ' + cfg.currentWeek + ' / ' + cfg.totalWeeks + ' 周 · 共 ' +
      stats.courseCount + ' 条课程（' + stats.subjectCount + ' 门）· 本周 ' + stats.thisWeekCount + ' 条 · 每周 ' +
      stats.entryPeriods + ' 节课';
  }

  function renderWeekBar() {
    var cfg = config();
    var slider = $('#weekRange');
    slider.min = 1;
    slider.max = cfg.totalWeeks;
    slider.value = Math.min(cfg.currentWeek, cfg.totalWeeks);
    $('#weekLabel').textContent = '第 ' + cfg.currentWeek + ' 周';
    $('#highlightWeek').checked = cfg.highlightWeek;
  }

  function render() {
    renderWeekBar();
    renderLegend();
    renderGrid();
    renderList();
    renderStats();
  }

  /* -------------------------------------------------------------- 视图切换 */

  function setView(view) {
    ui.view = view;
    $('#viewGrid').hidden = view !== 'grid';
    $('#viewList').hidden = view !== 'list';
    $$('#viewSwitch button').forEach(function (button) {
      button.classList.toggle('is-active', button.dataset.view === view);
    });
  }

  /* -------------------------------------------------------------- 抽屉表单 */

  var formState = { id: '', autoColor: true, color: '' };

  function fillSelect(select, options, value) {
    select.innerHTML = options.map(function (option) {
      return '<option value="' + option.value + '">' + esc(option.label) + '</option>';
    }).join('');
    select.value = String(value);
  }

  function buildFormOptions() {
    var cfg = config();
    fillSelect($('#fDay'), Store.DAY_LABELS.map(function (label, index) {
      return { value: index + 1, label: label };
    }), 1);

    var periodOptions = cfg.periods.map(function (period, index) {
      var time = period.start && period.end ? '（' + period.start + '-' + period.end + '）' : '';
      return { value: index + 1, label: period.label + time };
    });
    fillSelect($('#fStart'), periodOptions, 1);
    fillSelect($('#fEnd'), periodOptions, 1);

    $('#fSwatches').innerHTML = Store.PALETTE.map(function (hex) {
      return '<button type="button" data-color="' + hex + '" style="background:' + hex + '" title="' + hex + '"></button>';
    }).join('');
  }

  function buildCopyDays(ownDay) {
    $('#fCopyDays').innerHTML = Store.DAY_LABELS.map(function (label, index) {
      var day = index + 1;
      if (day === ownDay) return '';
      return '<label><input type="checkbox" value="' + day + '">' + label + '</label>';
    }).join('');
  }

  function updateWeeksHint() {
    var cfg = config();
    var text = $('#fWeeks').value;
    var parsed = Store.parseWeeks(text, cfg.totalWeeks);
    var hint = $('#weeksHint');
    if (parsed.warning) {
      hint.textContent = parsed.warning;
      hint.style.color = 'var(--danger)';
      return;
    }
    var isAll = parsed.all;
    hint.style.color = '';
    hint.textContent = isAll
      ? '覆盖全部 ' + cfg.totalWeeks + ' 周'
      : '共 ' + parsed.weeks.length + ' 周：' + parsed.text;
  }

  function updateColorUi() {
    var bg = formState.color || Store.autoColor($('#fName').value) || Store.PALETTE[0];
    $('#fColor').value = bg;
    $$('#fSwatches button').forEach(function (button) {
      button.classList.toggle('is-active', !formState.autoColor && button.dataset.color.toUpperCase() === (formState.color || '').toUpperCase());
    });
  }

  function openDrawer(source) {
    var cfg = config();
    var course = null;
    var prefill = { day: 1, startPeriod: 1, endPeriod: 1 };

    if (typeof source === 'string') {
      course = Store.getCourse(source);
      if (!course) return;
    } else if (source && typeof source === 'object') {
      prefill.day = source.day || 1;
      prefill.startPeriod = source.period || 1;
      prefill.endPeriod = prefill.startPeriod;
    }

    formState.id = course ? course.id : '';
    formState.autoColor = course ? !Store.normalizeHex(course.color) : true;
    formState.color = course ? (Store.normalizeHex(course.color) || '') : '';

    $('#drawerTitle').textContent = course ? '编辑课程' : '添加课程';
    $('#fName').value = course ? course.name : '';
    $('#fLocation').value = course ? course.location : '';
    $('#fTeacher').value = course ? course.teacher : '';
    $('#fNote').value = course ? course.note : '';

    /* 下拉选项会因为节次设置变化而重建，所以先建选项再回填值 */
    buildFormOptions();
    $('#fDay').value = String(course ? course.day : prefill.day);
    $('#fStart').value = String(course ? course.startPeriod : prefill.startPeriod);
    $('#fEnd').value = String(course ? course.endPeriod : prefill.endPeriod);
    $('#fWeeks').value = course ? (course.weeks === '全部' ? '' : course.weeks) : '';
    buildCopyDays(course ? course.day : prefill.day);
    updateColorUi();
    updateWeeksHint();

    $('#btnDeleteCourse').hidden = !course;
    $('#drawer').hidden = false;
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('#fName').focus(); }, 30);
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#drawer').setAttribute('aria-hidden', 'true');
    $('#scrim').hidden = true;
    document.body.style.overflow = '';
  }

  function saveDrawer() {
    var cfg = config();
    var name = Store.trim($('#fName').value);
    if (!name) {
      toast('请先填写课程名称', true);
      $('#fName').focus();
      return;
    }
    var start = parseInt($('#fStart').value, 10);
    var end = parseInt($('#fEnd').value, 10);
    if (end < start) { var t = start; start = end; end = t; }

    var weeksInput = Store.trim($('#fWeeks').value);
    var parsedWeeks = Store.parseWeeks(weeksInput, cfg.totalWeeks);
    var payload = {
      name: name,
      day: parseInt($('#fDay').value, 10),
      startPeriod: start,
      endPeriod: end,
      weeks: weeksInput ? parsedWeeks.text : '全部',
      location: Store.trim($('#fLocation').value),
      teacher: Store.trim($('#fTeacher').value),
      note: Store.trim($('#fNote').value),
      color: formState.autoColor ? '' : (Store.normalizeHex(formState.color) || '')
    };

    var copyDays = $$('#fCopyDays input:checked').map(function (input) { return parseInt(input.value, 10); });

    if (formState.id) {
      Store.updateCourse(formState.id, payload, { save: false });
    } else {
      Store.addCourse(payload, { save: false });
    }
    copyDays.forEach(function (day) {
      Store.addCourse(Object.assign({}, payload, { day: day }), { save: false });
    });

    Store.save();
    closeDrawer();
    toast(formState.id ? '已保存修改' : '已添加课程' + (copyDays.length ? '（含 ' + copyDays.length + ' 个复制）' : ''));
  }

  function deleteCurrent() {
    var id = formState.id;
    var course = id ? Store.getCourse(id) : null;
    if (!course) return;
    var copyCount = $$('#fCopyDays input:checked').length;
    confirmDialog('删除课程', '确定删除「' + course.name + '」吗？' + (copyCount ? '（表单里勾选的其他星期不会被删除）' : ''), '删除').then(function (ok) {
      if (!ok) return;
      Store.removeCourse(id);
      closeDrawer();
      toast('已删除「' + course.name + '」');
    });
  }

  /* ---------------------------------------------------------------- 弹窗 */

  function openModal(html) {
    $('#modal').innerHTML = html;
    $('#modalMask').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    $('#modalMask').hidden = true;
    $('#modal').innerHTML = '';
    if ($('#drawer').hidden) document.body.style.overflow = '';
  }

  function confirmDialog(title, message, okText, danger) {
    return new Promise(function (resolve) {
      openModal(
        '<div class="modal-head"><div><h2>' + esc(title) + '</h2></div></div>' +
        '<div class="modal-body"><p style="margin:0;color:var(--text-soft)">' + esc(message).replace(/\n/g, '<br>') + '</p></div>' +
        '<div class="modal-foot"><span class="spacer"></span>' +
          '<button type="button" class="btn" data-role="cancel">取消</button>' +
          '<button type="button" class="btn ' + (danger ? 'danger' : 'primary') + '" data-role="ok">' + esc(okText || '确定') + '</button>' +
        '</div>'
      );
      var modal = $('#modal');
      function done(value) {
        modal.removeEventListener('click', handler);
        closeModal();
        resolve(value);
      }
      function handler(event) {
        var role = event.target.dataset.role;
        if (role === 'ok') done(true);
        else if (role === 'cancel' || event.target.closest('[data-close]')) done(false);
      }
      modal.addEventListener('click', handler);
    });
  }

  /* ------------------------------------------------------- 导入 Excel */

  function openImportDialog(wb, fileName) {
    var dialog = { sheet: wb.SheetNames[0], mode: 'auto', merge: 'append', courses: [] };

    var modeLabel = { auto: '自动识别', grid: '网格型', list: '列表型' };
    var modeDesc = { grid: '网格型（行=节次，列=星期）', list: '列表型（每行一条课程）' };

    openModal(
      '<div class="modal-head"><div><h2>导入 Excel 课表</h2><p>' + esc(fileName) + '</p></div>' +
        '<button type="button" class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
        '<div class="option-row"><span class="option-label">工作表</span>' +
          '<select class="input" id="impSheet">' + wb.SheetNames.map(function (name) {
            return '<option value="' + esc(name) + '">' + esc(name) + '</option>';
          }).join('') + '</select></div>' +
        '<div class="option-row"><span class="option-label">表格格式</span>' +
          '<div class="radio-group" id="impMode">' + ['auto', 'grid', 'list'].map(function (key) {
            return '<label data-mode="' + key + '"' + (key === 'auto' ? ' class="is-active"' : '') + '>' +
              '<input type="radio" name="impMode" value="' + key + '"' + (key === 'auto' ? ' checked' : '') + '>' + modeLabel[key] + '</label>';
          }).join('') + '</div></div>' +
        '<div class="option-row"><span class="option-label">导入方式</span>' +
          '<div class="radio-group" id="impMerge">' +
            '<label data-merge="append" class="is-active"><input type="radio" name="impMerge" value="append" checked>追加到现有课表</label>' +
            '<label data-merge="replace"><input type="radio" name="impMerge" value="replace">替换现有课表</label>' +
          '</div></div>' +
        '<div id="impResult"></div>' +
      '</div>' +
      '<div class="modal-foot"><span class="spacer"></span>' +
        '<button type="button" class="btn" data-close>取消</button>' +
        '<button type="button" class="btn primary" id="impConfirm">导入</button>' +
      '</div>'
    );

    var modal = $('#modal');
    var confirmBtn = $('#impConfirm');

    function refresh() {
      var parsed;
      try {
        parsed = Excel.parseSheet(wb, dialog.sheet, { mode: dialog.mode, config: config() });
      } catch (err) {
        $('#impResult').innerHTML = '<div class="notice error">解析失败：' + esc(err.message) + '</div>';
        confirmBtn.disabled = true;
        return;
      }
      dialog.courses = parsed.courses;
      confirmBtn.disabled = !parsed.courses.length;

      var html = [];
      if (!parsed.mode) {
        html.push('<div class="notice error">没有识别出课程，请确认「表格格式」选择是否正确，或参考「下载模板」中的格式整理表格。</div>');
      } else {
        html.push('<div class="notice">识别为 ' + modeDesc[parsed.mode] +
          (parsed.mode === parsed.autoMode ? '（自动判断）' : '（手动指定）') +
          '，解析出 <b>' + parsed.courses.length + '</b> 条课程。</div>');
      }

      /* 统计导入后会出现的冲突课程门数（按课程名去重，仅作提示） */
      var cfg = config();
      var pool = dialog.merge === 'replace' ? dialog.courses.slice() : courses().concat(dialog.courses);
      var flags = Store.findConflicts(pool, cfg.totalWeeks);
      var byId = {};
      pool.forEach(function (course) { byId[course.id] = course; });
      var conflicting = {};
      Object.keys(flags).forEach(function (id) {
        if (byId[id]) conflicting[byId[id].name] = 1;
      });
      var importedNames = {};
      dialog.courses.forEach(function (course) { importedNames[course.name] = 1; });
      var newConflicts = Object.keys(conflicting).filter(function (name) { return importedNames[name]; }).length;
      if (newConflicts) {
        html.push('<div class="notice warn">导入后会有 ' + newConflicts + ' 门课程出现时间冲突（同一天同一节次），可在课表中看到红色「冲突」标记。</div>');
      }

      if (parsed.warnings.length) {
        html.push('<div class="notice warn">解析提示：<ul>' + parsed.warnings.map(function (text) {
          return '<li>' + esc(text) + '</li>';
        }).join('') + '</ul></div>');
      }

      if (dialog.courses.length) {
        html.push('<div class="preview-wrap"><table class="preview-table"><thead><tr>' +
          '<th>课程</th><th>星期</th><th>节次</th><th>周次</th><th>地点</th><th>教师</th>' +
          '</tr></thead><tbody>' +
          dialog.courses.slice(0, 10).map(function (course) {
            return '<tr><td>' + esc(course.name) + '</td>' +
              '<td>' + Store.DAY_LABELS[course.day - 1] + '</td>' +
              '<td>' + course.startPeriod + (course.endPeriod > course.startPeriod ? '-' + course.endPeriod : '') + '</td>' +
              '<td>' + esc(course.weeks) + '</td>' +
              '<td>' + esc(course.location) + '</td>' +
              '<td>' + esc(course.teacher) + '</td></tr>';
          }).join('') + '</tbody></table></div>' +
          (dialog.courses.length > 10 ? '<p class="hint">仅预览前 10 条，共 ' + dialog.courses.length + ' 条。</p>' : ''));
      }

      html.push('<details style="margin-top:12px"><summary style="cursor:pointer;color:var(--text-soft);font-size:12.5px">查看原始表格前 8 行</summary>' +
        '<div class="preview-wrap" style="margin-top:8px"><table class="preview-table"><tbody>' +
        parsed.preview.filter(function (row) {
          return row.some(function (cell) { return Store.trim(cell); });
        }).map(function (row) {
          return '<tr>' + row.map(function (cell) {
            return '<td' + (Store.trim(cell) ? '' : ' class="is-empty"') + '>' + esc(cell) + '</td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></details>');

      $('#impResult').innerHTML = html.join('');
    }

    function doImport() {
      if (!dialog.courses.length) return;
      var cfg = config();
      if (dialog.merge === 'replace') Store.clearCourses({ save: false });
      var added = Store.addCourses(dialog.courses, { save: false });
      Store.save();
      var flags = Store.findConflicts(courses(), cfg.totalWeeks);
      var conflictCount = added.filter(function (course) { return flags[course.id]; }).length;
      closeModal();
      toast('已导入 ' + added.length + ' 条课程' + (conflictCount ? '，其中 ' + conflictCount + ' 条与其他课程冲突' : ''), !!conflictCount);
      setView('grid');
    }

    modal.addEventListener('change', function (event) {
      var target = event.target;
      if (target.id === 'impSheet') {
        dialog.sheet = target.value;
        refresh();
        return;
      }
      if (target.name === 'impMode') {
        dialog.mode = target.value;
        $$('#impMode label').forEach(function (label) {
          label.classList.toggle('is-active', label.dataset.mode === dialog.mode);
        });
        refresh();
        return;
      }
      if (target.name === 'impMerge') {
        dialog.merge = target.value;
        $$('#impMerge label').forEach(function (label) {
          label.classList.toggle('is-active', label.dataset.merge === dialog.merge);
        });
        refresh();
      }
    });

    modal.addEventListener('click', function (event) {
      if (event.target.closest('#impConfirm')) { doImport(); return; }
      if (event.target.closest('[data-close]')) closeModal();
    });

    refresh();
  }

  function handleExcelFile(file) {
    if (!file) return;
    toast('正在解析「' + file.name + '」…');
    Excel.readWorkbook(file).then(function (wb) {
      if (!wb.SheetNames.length) throw new Error('文件中没有工作表');
      openImportDialog(wb, file.name);
    }).catch(function (err) {
      toast('导入失败：' + (err && err.message ? err.message : err), true);
    });
  }

  /* ------------------------------------------------------------ 设置弹窗 */

  function openSettings() {
    var cfg = config();
    var rows = cfg.periods.map(function (period, index) {
      return '<tr data-index="' + index + '">' +
        '<td style="width:32%"><input class="input" data-key="label" value="' + esc(period.label) + '"></td>' +
        '<td><input class="input" data-key="start" value="' + esc(period.start) + '" placeholder="08:00"></td>' +
        '<td><input class="input" data-key="end" value="' + esc(period.end) + '" placeholder="08:45"></td>' +
        '<td style="width:44px"><button type="button" class="mini is-danger" data-remove>删</button></td>' +
      '</tr>';
    }).join('');

    openModal(
      '<div class="modal-head"><div><h2>节次与周次设置</h2><p>调整上课节次的时间，或修改学期总周数。</p></div>' +
        '<button type="button" class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
        '<div class="option-row"><span class="option-label">学期周数</span>' +
          '<input class="input" id="setTotalWeeks" type="number" min="1" max="60" value="' + cfg.totalWeeks + '" style="width:90px">' +
          '<label class="check" style="color:var(--text-soft);border:0"><input type="checkbox" id="setWeekend"' + (cfg.showWeekend ? ' checked' : '') + '>显示周六、周日</label>' +
        '</div>' +
        '<p class="field-label" style="margin-top:8px">每天节次</p>' +
        '<div class="preview-wrap"><table class="period-editor" id="periodEditor"><thead><tr>' +
          '<th>名称</th><th>开始</th><th>结束</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div style="margin-top:10px"><button type="button" class="mini" id="addPeriod">+ 增加一节</button></div>' +
      '</div>' +
      '<div class="modal-foot"><span class="spacer"></span>' +
        '<button type="button" class="btn" data-close>取消</button>' +
        '<button type="button" class="btn primary" id="saveSettings">保存</button>' +
      '</div>'
    );

    var modal = $('#modal');

    modal.addEventListener('click', function (event) {
      if (event.target.closest('[data-close]')) { closeModal(); return; }
      var removeBtn = event.target.closest('[data-remove]');
      if (removeBtn) {
        var row = removeBtn.closest('tr');
        var tbody = row.parentNode;
        if (tbody.children.length <= 1) { toast('至少要保留一节', true); return; }
        row.remove();
        return;
      }
      if (event.target.closest('#addPeriod')) {
        var tbodyEl = $('#periodEditor tbody');
        var count = tbodyEl.children.length;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><input class="input" data-key="label" value="第' + (count + 1) + '节"></td>' +
          '<td><input class="input" data-key="start" placeholder="08:00"></td>' +
          '<td><input class="input" data-key="end" placeholder="08:45"></td>' +
          '<td><button type="button" class="mini is-danger" data-remove>删</button></td>';
        tbodyEl.appendChild(tr);
        return;
      }
      if (event.target.closest('#saveSettings')) {
        var periods = $$('#periodEditor tbody tr').map(function (row, index) {
          return {
            label: Store.trim(row.querySelector('[data-key="label"]').value) || '第' + (index + 1) + '节',
            start: Store.trim(row.querySelector('[data-key="start"]').value),
            end: Store.trim(row.querySelector('[data-key="end"]').value)
          };
        });
        Store.setConfig({
          totalWeeks: Store.clampInt($('#setTotalWeeks').value, 1, 60, 16),
          showWeekend: $('#setWeekend').checked,
          periods: periods
        });
        closeModal();
        toast('设置已更新');
      }
    });
  }

  /* ------------------------------------------------------------ 事件绑定 */

  function bindEvents() {
    $('#weekRange').addEventListener('input', function (event) {
      var cfg = config();
      Store.setConfig({ currentWeek: Store.clampInt(event.target.value, 1, cfg.totalWeeks, 1) });
    });

    $('#weekPrev').addEventListener('click', function () {
      var cfg = config();
      Store.setConfig({ currentWeek: Math.max(1, cfg.currentWeek - 1) });
    });

    $('#weekNext').addEventListener('click', function () {
      var cfg = config();
      Store.setConfig({ currentWeek: Math.min(cfg.totalWeeks, cfg.currentWeek + 1) });
    });

    $('#highlightWeek').addEventListener('change', function (event) {
      Store.setConfig({ highlightWeek: event.target.checked });
    });

    $('#viewSwitch').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-view]');
      if (button) setView(button.dataset.view);
    });

    $('#btnAdd').addEventListener('click', function () { openDrawer(null); });
    $('#btnImport').addEventListener('click', function () { $('#fileExcel').click(); });
    $('#btnExport').addEventListener('click', function () {
      if (!courses().length) { toast('还没有课程可以导出', true); return; }
      try {
        Excel.exportGrid(courses(), config());
        toast('已导出网格型 Excel');
      } catch (err) {
        toast('导出失败：' + err.message, true);
      }
    });

    $('#fileExcel').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = '';
      handleExcelFile(file);
    });

    $('#fileJson').addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      event.target.value = '';
      if (!file) return;
      Excel.readJson(file).then(function (data) {
        if (!data.courses || !data.courses.length) throw new Error('备份里没有课程数据');
        return confirmDialog('导入 JSON 备份', '备份包含 ' + data.courses.length + ' 条课程，导入后将替换当前课表，确定继续吗？', '导入并替换').then(function (ok) {
          if (!ok) return;
          if (data.config) Store.setConfig(data.config, { save: false });
          Store.clearCourses({ save: false });
          var added = Store.addCourses(data.courses, { save: false });
          Store.save();
          toast('已从备份恢复 ' + added.length + ' 条课程');
        });
      }).catch(function (err) {
        toast('导入备份失败：' + err.message, true);
      });
    });

    /* 更多菜单 */
    var moreMenu = $('#moreMenu');
    $('#btnMore').addEventListener('click', function (event) {
      event.stopPropagation();
      moreMenu.hidden = !moreMenu.hidden;
      $('#btnMore').setAttribute('aria-expanded', String(!moreMenu.hidden));
    });
    document.addEventListener('click', function (event) {
      if (!moreMenu.hidden && !event.target.closest('.dropdown')) {
        moreMenu.hidden = true;
        $('#btnMore').setAttribute('aria-expanded', 'false');
      }
    });
    moreMenu.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-act]');
      if (!button) return;
      var act = button.dataset.act;
      moreMenu.hidden = true;
      if (act === 'tpl-grid') { Excel.downloadTemplateGrid(); toast('已下载网格型模板'); }
      else if (act === 'tpl-list') { Excel.downloadTemplateList(); toast('已下载列表型模板'); }
      else if (act === 'backup') { Excel.exportJson(); toast('已导出 JSON 备份'); }
      else if (act === 'restore') { $('#fileJson').click(); }
      else if (act === 'recolor') { Store.recolorAuto(); toast('已按课程名重新配色'); }
      else if (act === 'settings') { openSettings(); }
      else if (act === 'clear') {
        confirmDialog('清空全部课程', '将删除当前课表里的 ' + courses().length + ' 条课程，且无法撤销。建议先导出 JSON 备份。', '全部清空', true).then(function (ok) {
          if (!ok) return;
          Store.clearCourses();
          toast('已清空课表');
        });
      }
    });

    /* 课表网格点击 */
    $('#ttGrid').addEventListener('click', function (event) {
      var course = event.target.closest('.course');
      if (course) { openDrawer(course.dataset.id); return; }
      var cell = event.target.closest('.cell');
      if (cell) openDrawer({ day: parseInt(cell.dataset.day, 10), period: parseInt(cell.dataset.period, 10) });
    });

    /* 图例筛选 */
    $('#legend').addEventListener('click', function (event) {
      var chip = event.target.closest('.legend-chip');
      if (!chip) return;
      ui.highlight = ui.highlight === chip.dataset.name ? '' : chip.dataset.name;
      renderLegend();
      renderGrid();
    });

    /* 列表视图 */
    $('#listSearch').addEventListener('input', function (event) {
      ui.listQuery = event.target.value;
      renderList();
    });
    $('#listDay').addEventListener('change', function (event) {
      ui.listDay = parseInt(event.target.value, 10);
      renderList();
    });
    $('#listSort').addEventListener('change', function (event) {
      ui.listSort = event.target.value;
      renderList();
    });
    $('#courseTbody').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-act]');
      if (!button) return;
      var row = button.closest('tr');
      var id = row.dataset.id;
      var course = Store.getCourse(id);
      if (!course) return;
      if (button.dataset.act === 'edit') { openDrawer(id); return; }
      if (button.dataset.act === 'delete') {
        confirmDialog('删除课程', '确定删除「' + course.name + '」吗？', '删除').then(function (ok) {
          if (!ok) return;
          Store.removeCourse(id);
          toast('已删除「' + course.name + '」');
        });
      }
    });

    /* 抽屉表单 */
    $('#drawerClose').addEventListener('click', closeDrawer);
    $('#btnCancelCourse').addEventListener('click', closeDrawer);
    $('#btnSaveCourse').addEventListener('click', saveDrawer);
    $('#btnDeleteCourse').addEventListener('click', deleteCurrent);
    $('#scrim').addEventListener('click', closeDrawer);
    $('#fWeeks').addEventListener('input', updateWeeksHint);
    $('#fName').addEventListener('input', function () {
      if (formState.autoColor) updateColorUi();
    });
    $('#fColor').addEventListener('input', function (event) {
      formState.autoColor = false;
      formState.color = event.target.value.toUpperCase();
      updateColorUi();
    });
    $('#fColorAuto').addEventListener('click', function () {
      formState.autoColor = true;
      formState.color = '';
      updateColorUi();
    });
    $('#fSwatches').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-color]');
      if (!button) return;
      formState.autoColor = false;
      formState.color = button.dataset.color.toUpperCase();
      updateColorUi();
    });
    $('#fDay').addEventListener('change', function (event) {
      var checked = $$('#fCopyDays input:checked').map(function (input) { return input.value; });
      buildCopyDays(parseInt(event.target.value, 10));
      checked.forEach(function (value) {
        var input = $('#fCopyDays input[value="' + value + '"]');
        if (input) input.checked = true;
      });
    });
    $('#weekQuick').addEventListener('click', function (event) {
      var button = event.target.closest('button[data-week]');
      if (!button) return;
      var cfg = config();
      var total = cfg.totalWeeks;
      var map = {
        '全部': '',
        'odd': '1-' + total + '单周',
        'even': '1-' + total + '双周',
        'first': '1-' + Math.ceil(total / 2),
        'last': (Math.ceil(total / 2) + 1) + '-' + total
      };
      $('#fWeeks').value = map[button.dataset.week] || '';
      updateWeeksHint();
    });
    $('#courseForm').addEventListener('submit', function (event) {
      event.preventDefault();
      saveDrawer();
    });

    /* 弹窗遮罩 */
    $('#modalMask').addEventListener('click', function (event) {
      if (event.target === $('#modalMask')) closeModal();
    });

    /* 键盘 */
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      if (!$('#modalMask').hidden) { closeModal(); return; }
      if (!$('#drawer').hidden) closeDrawer();
    });
  }

  /* ------------------------------------------------------------- 启动 */

  function init() {
    var existing = Store.load();
    if (!existing) Store.seedDemo();

    Store.onChange(function () { render(); });

    buildFormOptions();
    bindEvents();
    setView('grid');
    render();

    $('#listDay').value = '0';
    $('#listSort').value = 'time';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
