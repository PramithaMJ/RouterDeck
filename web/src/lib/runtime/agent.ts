/**
 * The agent is injected as the very first script of a router page that we
 * render inside a sandboxed iframe (sandbox="allow-scripts", opaque origin,
 * network blocked by CSP).
 *
 * The router's own JavaScript then runs normally: it fills in current values,
 * validates input, hashes login passwords and signs forms (postSecurityFlag).
 * We never re-implement that logic. We just "click" its buttons and capture
 * the exact request the router UI would have sent.
 *
 * Written in ES5 on purpose: it runs inside arbitrary, old router pages.
 * `__CHANNEL__` is replaced with a random nonce per page.
 */
export const AGENT_SOURCE = String.raw`(function () {
  'use strict';
  var CHANNEL = '__CHANNEL__';
  var PARENT = window.parent;
  var alerts = [];
  var pending = null;

  function note(m) { alerts.push(String(m == null ? '' : m)); }
  window.alert = note;
  window.confirm = function (m) { note(m); return true; };
  window.prompt = function () { return null; };
  window.open = function () { return null; };
  window.print = function () {};
  try { Object.defineProperty(document, 'cookie', { configurable: true, get: function () { return ''; }, set: function () {} }); } catch (e) {}
  function memStore() {
    var d = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem: function (k, v) { d[k] = String(v); },
      removeItem: function (k) { delete d[k]; },
      clear: function () { d = {}; },
      key: function (i) { return Object.keys(d)[i] || null; },
      get length() { return Object.keys(d).length; }
    };
  }
  try { window.localStorage.length; } catch (e) {
    try { Object.defineProperty(window, 'localStorage', { configurable: true, value: memStore() }); } catch (e2) {}
    try { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: memStore() }); } catch (e3) {}
  }

  HTMLFormElement.prototype.submit = function () { pending = { form: this, submitter: null }; };
  if (HTMLFormElement.prototype.requestSubmit) {
    HTMLFormElement.prototype.requestSubmit = function (s) { pending = { form: this, submitter: s || null }; };
  }
  // Bubble phase on window: runs after the form's own onsubmit handler.
  window.addEventListener('submit', function (e) {
    if (!e.defaultPrevented) pending = { form: e.target, submitter: e.submitter || null };
    e.preventDefault();
  }, false);

  function clean(s) { return String(s == null ? '' : s).replace(/ /g, ' ').replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim(); }
  function text(el) { return clean(el ? (el.innerText != null ? el.innerText : el.textContent) : ''); }

  function labelFor(el) {
    try {
      if (el.id) {
        var l = document.querySelector('label[for="' + el.id + '"]');
        if (l) return text(l);
      }
      var t = (el.type || '').toLowerCase();
      if (t === 'radio' || t === 'checkbox') {
        var n = el.nextSibling, s = '';
        while (n && s.length < 60) {
          if (n.nodeType === 1 && (n.tagName === 'INPUT' || n.tagName === 'BR' || n.tagName === 'SELECT')) break;
          s += n.textContent || '';
          n = n.nextSibling;
        }
        if (clean(s)) return clean(s);
      }
      var tr = el.closest ? el.closest('tr') : null;
      if (tr && tr.cells && tr.cells.length > 1 && !tr.cells[0].contains(el)) return text(tr.cells[0]).replace(/:$/, '');
    } catch (e) {}
    return '';
  }

  function rowLabel(el) {
    try {
      var tr = el.closest ? el.closest('tr') : null;
      if (tr && tr.cells && tr.cells.length > 1 && !tr.cells[0].contains(el)) {
        var first = text(tr.cells[0]).replace(/:$/, '');
        if (first) return first;
      }
      // Column layout: labels sit in a header row above the inputs.
      var td = el.closest ? el.closest('td,th') : null;
      if (tr && td && tr.parentElement) {
        var idx = td.cellIndex, prev = tr.previousElementSibling;
        while (prev) {
          if (prev.cells && prev.cells[idx] && !prev.cells[idx].querySelector('input,select,textarea')) {
            var h = text(prev.cells[idx]).replace(/:$/, '');
            if (h) return h;
          }
          prev = prev.previousElementSibling;
        }
      }
      var lab = el.closest ? el.closest('label') : null;
      if (lab) return text(lab);
    } catch (e) {}
    return '';
  }

  function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
  }

  function fieldInfo(el) {
    var t = (el.type || el.tagName || '').toLowerCase();
    var o = { name: el.name || '', id: el.id || '', type: t, value: el.value == null ? '' : String(el.value), disabled: !!el.disabled, visible: isVisible(el), label: labelFor(el), group: rowLabel(el), maxLength: el.maxLength > 0 ? el.maxLength : undefined, readOnly: !!el.readOnly };
    if (t === 'checkbox' || t === 'radio') o.checked = !!el.checked;
    if (el.tagName === 'SELECT') {
      o.options = [];
      for (var i = 0; i < el.options.length; i++) {
        var op = el.options[i];
        o.options.push({ value: op.value, label: clean(op.text), selected: !!op.selected });
      }
    }
    if (t === 'submit' || t === 'button' || t === 'reset' || el.tagName === 'BUTTON') o.text = clean(el.value || el.textContent);
    return o;
  }

  function snapshot() {
    var forms = [];
    for (var i = 0; i < document.forms.length; i++) {
      var f = document.forms[i], fields = [];
      for (var j = 0; j < f.elements.length; j++) {
        var el = f.elements[j];
        if (el.tagName === 'FIELDSET' || el.tagName === 'OBJECT' || el.tagName === 'OUTPUT') continue;
        fields.push(fieldInfo(el));
      }
      forms.push({ index: i, name: f.getAttribute('name') || f.id || '', action: f.getAttribute('action') || '', method: (f.getAttribute('method') || 'get').toLowerCase(), fields: fields });
    }
    var tables = [];
    var tlist = document.getElementsByTagName('table');
    for (var k = 0; k < tlist.length; k++) {
      var tb = tlist[k], rows = [];
      if (tb.querySelector('table')) {
        // Layout table: keep only rows that don't contain nested tables.
      }
      for (var r = 0; r < tb.rows.length; r++) {
        var row = tb.rows[r];
        if (row.closest('table') !== tb) continue;
        if (row.querySelector('table')) continue;
        var cells = [];
        for (var c = 0; c < row.cells.length; c++) cells.push(text(row.cells[c]));
        var inputs = [];
        var ins = row.querySelectorAll('input,select,button');
        for (var q = 0; q < ins.length; q++) inputs.push({ name: ins[q].name || '', type: (ins[q].type || '').toLowerCase(), value: ins[q].value == null ? '' : String(ins[q].value), checked: !!ins[q].checked });
        var header = row.cells.length > 0 && row.cells[0].tagName === 'TH';
        if (cells.join('').length || inputs.length) rows.push({ cells: cells, inputs: inputs, header: header, visible: isVisible(row) });
      }
      if (rows.length) tables.push({ index: k, id: tb.id || '', rows: rows });
    }
    var body = document.body ? text(document.body) : '';
    return { title: document.title || '', text: body.slice(0, 40000), forms: forms, tables: tables, alerts: alerts.slice() };
  }

  function getForm(spec) {
    if (typeof spec === 'number') return document.forms[spec] || null;
    return document.forms[spec] || document.getElementById(spec) || null;
  }

  function elementsNamed(form, name) {
    var out = [];
    for (var i = 0; i < form.elements.length; i++) if (form.elements[i].name === name) out.push(form.elements[i]);
    return out;
  }

  function fire(el, type) {
    var ev;
    try { ev = new Event(type, { bubbles: true, cancelable: true }); } catch (e) { ev = document.createEvent('Event'); ev.initEvent(type, true, true); }
    el.dispatchEvent(ev);
  }

  function setField(form, name, value) {
    var els = elementsNamed(form, name);
    if (!els.length) throw new Error('Field "' + name + '" not found in form "' + (form.getAttribute('name') || '') + '"');
    var first = els[0], t = (first.type || '').toLowerCase();
    if (t === 'radio') {
      for (var i = 0; i < els.length; i++) if (String(els[i].value) === String(value)) { if (!els[i].checked) els[i].click(); fire(els[i], 'change'); return; }
      throw new Error('Option "' + value + '" not available for "' + name + '"');
    }
    if (t === 'checkbox') {
      for (var j = 0; j < els.length; j++) {
        var want = Object.prototype.toString.call(value) === '[object Array]' ? value.indexOf(els[j].value) >= 0 : !!value;
        if (els[j].checked !== want) els[j].click();
      }
      return;
    }
    if (first.tagName === 'SELECT') {
      var found = false;
      for (var k = 0; k < first.options.length; k++) if (String(first.options[k].value) === String(value)) found = true;
      if (!found) throw new Error('Option "' + value + '" not available for "' + name + '"');
      first.value = String(value);
      fire(first, 'change');
      return;
    }
    first.focus && first.focus();
    first.value = String(value);
    fire(first, 'input');
    fire(first, 'keyup');
    fire(first, 'change');
    fire(first, 'blur');
  }

  function findButton(form, spec) {
    var cands = [];
    for (var i = 0; i < form.elements.length; i++) {
      var el = form.elements[i], t = (el.type || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'image' || el.tagName === 'BUTTON') cands.push(el);
    }
    var extra = document.querySelectorAll('button, input[type=button], input[type=submit]');
    for (var e = 0; e < extra.length; e++) if (cands.indexOf(extra[e]) < 0 && !extra[e].form) cands.push(extra[e]);
    for (var j = 0; j < cands.length; j++) {
      var b = cands[j];
      if (b.name === spec || b.id === spec || clean(b.value) === spec || clean(b.textContent) === spec) return b;
    }
    return null;
  }

  function serialize(form, submitter) {
    var fd;
    try { fd = submitter ? new FormData(form, submitter) : new FormData(form); }
    catch (e) { fd = new FormData(form); if (submitter && submitter.name) fd.append(submitter.name, submitter.value); }
    var pairs = [];
    fd.forEach(function (v, k) { if (typeof v === 'string') pairs.push([k, v]); });
    return pairs;
  }

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function submit(m) {
    var form = getForm(m.form);
    if (!form) throw new Error('Form "' + m.form + '" not found');
    alerts = []; pending = null;
    var values = m.values || {};
    var order = m.order || Object.keys(values);
    for (var i = 0; i < order.length; i++) setField(form, order[i], values[order[i]]);
    if (m.button) {
      var btn = findButton(form, m.button);
      if (!btn) throw new Error('Button "' + m.button + '" not found');
      btn.click();
    } else {
      pending = { form: form, submitter: null };
    }
    var start = Date.now();
    function poll() {
      if (pending || Date.now() - start > 1500) {
        if (!pending) return { submitted: false, alerts: alerts.slice() };
        var f = pending.form;
        return {
          submitted: true,
          form: f.getAttribute('name') || '',
          action: f.getAttribute('action') || '',
          method: (f.getAttribute('method') || 'get').toLowerCase(),
          pairs: serialize(f, pending.submitter),
          alerts: alerts.slice()
        };
      }
      return wait(25).then(poll);
    }
    return wait(0).then(poll);
  }

  function fill(m) {
    var form = getForm(m.form);
    if (!form) throw new Error('Form "' + m.form + '" not found');
    var values = m.values || {};
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) setField(form, keys[i], values[keys[i]]);
    return wait(40).then(snapshot);
  }

  function readGlobals(names) {
    var out = {};
    for (var i = 0; i < names.length; i++) {
      try { out[names[i]] = JSON.parse(JSON.stringify(window[names[i]])); } catch (e) { out[names[i]] = null; }
    }
    return out;
  }

  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || m.channel !== CHANNEL || ev.source !== PARENT || !m.id) return;
    function reply(ok, data) { PARENT.postMessage({ channel: CHANNEL, id: m.id, ok: ok, data: data }, '*'); }
    try {
      var r;
      if (m.op === 'snapshot') r = snapshot();
      else if (m.op === 'submit') r = submit(m);
      else if (m.op === 'globals') r = readGlobals(m.names || []);
      else if (m.op === 'fill') r = fill(m);
      else throw new Error('Unknown op ' + m.op);
      Promise.resolve(r).then(function (d) { reply(true, d); }, function (err) { reply(false, String((err && err.message) || err)); });
    } catch (err) { reply(false, String((err && err.message) || err)); }
  });

  var sentReady = false;
  function ready() { if (sentReady) return; sentReady = true; setTimeout(function () { PARENT.postMessage({ channel: CHANNEL, type: 'ready' }, '*'); }, 60); }
  window.addEventListener('load', ready);
  window.addEventListener('error', function (e) { /* router scripts may throw in the sandbox; keep going */ });
})();`;
