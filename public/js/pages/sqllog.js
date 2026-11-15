// Nhật ký SQL: hiển thị lần lượt MỌI câu lệnh SQL vừa chạy trên CSDL, tự cập nhật mỗi giây.
// Mở trang này ở một tab, thao tác ở tab khác của cùng trình duyệt.
import { api, esc, num, highlightSql } from '../lib.js';

const POLL_MS = 1000;
const MAX_GROUPS = 500;
// Câu kiểm tra phiên chạy ở đầu mọi yêu cầu khi đã đăng nhập — có thể ẩn cho gọn
const SESSION_CHECK = /FROM TAIKHOAN WHERE MaTK = \? AND KichHoat = 1/;
const PREFS_KEY = 'sqllog-prefs-v2';
const EMPTY = '<div class="empty">Chưa có câu lệnh nào. Hãy thao tác ở tab khác — ví dụ đăng nhập hoặc mở một truy vấn.</div>';

const KIND = {
  read: { cls: 'k-read', label: 'Đọc' },
  write: { cls: 'k-write', label: 'Ghi' },
  tx: { cls: 'k-tx', label: 'Giao tác' },
  other: { cls: 'k-other', label: 'Lược đồ' },
  note: { cls: 'k-other', label: 'Ghi chú' },
};

function loadPrefs() {
  const d = { hideSession: false, writesOnly: false, all: false };
  try { return { ...d, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') }; } catch (e) { return d; }
}
function savePrefs(p) { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* bỏ qua */ } }

// Bỏ thụt lề chung của câu SQL nhiều dòng
function dedent(sql) {
  const lines = sql.replace(/\t/g, '  ').split('\n');
  const ind = Math.min(...lines.slice(1).filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length), Infinity);
  return [lines[0], ...lines.slice(1).map((l) => (Number.isFinite(ind) ? l.slice(ind) : l))].join('\n');
}
const clock = (t) => new Date(t).toLocaleTimeString('vi-VN', { hour12: false }) + '.' + String(t % 1000).padStart(3, '0');

function paramsText(p) {
  if (Array.isArray(p)) return p.length ? p.map((v) => JSON.stringify(v)).join(', ') : '';
  const e = Object.entries(p || {});
  return e.length ? e.map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(', ') : '';
}
function resultText(e) {
  if (e.error) return `<span class="r-err">✗ ${esc(e.error)}</span>`;
  if (!e.result) return '';
  if ('rows' in e.result) return `→ ${num(e.result.rows)} dòng`;
  if ('changes' in e.result) return `→ ${num(e.result.changes)} dòng thay đổi${e.result.lastId && /^INSERT/i.test(e.sql) ? ` · mã mới ${e.result.lastId}` : ''}`;
  return '';
}
const userLabel = (x) => (x.system ? 'hệ thống' : x.user || 'khách');

// Lưu nhật ký đang hiển thị ra file CSV (mở được bằng Excel)
function downloadCsv(items) {
  if (!items.length) return;
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const ts = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`; };
  const res = (e) => (e.result ? ('rows' in e.result ? `${e.result.rows} dòng` : `${e.result.changes} dòng thay đổi`) : '');
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['STT', 'Thời điểm thực hiện', 'Thời gian chạy (ms)', 'Số lần chạy', 'Thao tác', 'Yêu cầu', 'Người dùng', 'Loại',
    'Câu lệnh SQL', 'Tham số', 'Kết quả', 'Lỗi'];
  const rows = items.map((e, i) => [i + 1, ts(e.time), e.ms !== undefined ? e.ms.toFixed(3) : '', e.count || 1, e.action,
    `${e.method} ${e.path}`, userLabel(e), (KIND[e.kind] || KIND.other).label, e.sql.replace(/\s+/g, ' '), paramsText(e.params), res(e), e.error || '']);
  // BOM ở đầu để Excel nhận đúng tiếng Việt (UTF-8)
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const d = new Date();
  a.download = `nhat-ky-sql-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default async function sqllog(view, m, stale) {
  const prefs = loadPrefs();
  let after = 0;
  let paused = false;
  let clearedAt = 0; // xóa màn hình: chỉ ẩn phía giao diện, nhật ký trên máy chủ vẫn còn
  const groups = []; // [{ req, action, method, path, user, time, mine, system, items: [] }]

  view.innerHTML = `
    <div class="page-head"><div><h1>Nhật ký SQL</h1>
      <p><b>Mọi câu lệnh SQL</b> chạy trên CSDL, theo đúng thứ tự thời gian — kể cả câu do máy chủ tự chạy (khởi động, tạo bảng, nạp dữ liệu mẫu).
      Mở trang này ở <b>một tab</b>, thao tác (đăng nhập, bán vé, sửa dữ liệu…) ở <b>tab khác của cùng trình duyệt</b> — câu lệnh hiện ra ngay.
      Câu lặp lại liên tiếp khi nạp dữ liệu mẫu được gộp thành <b>× N lần</b>. Mã băm mật khẩu được che; mật khẩu gốc không bao giờ đi vào SQL.</p></div>
      <a class="btn" href="#/nhat-ky-sql" target="_blank" rel="noopener">↗ Mở ở tab mới</a></div>

    <div class="card sqllog-bar"><div class="card-body row" style="padding-top:12px;padding-bottom:12px">
      <label class="row small"><input type="checkbox" id="hideSession" ${prefs.hideSession ? 'checked' : ''}> Ẩn câu kiểm tra phiên đăng nhập</label>
      <label class="row small"><input type="checkbox" id="writesOnly" ${prefs.writesOnly ? 'checked' : ''}> Chỉ thao tác thay đổi dữ liệu (POST / PUT / DELETE)</label>
      <label class="row small" id="allWrap" hidden><input type="checkbox" id="all" ${prefs.all ? 'checked' : ''}> Mọi người dùng (Quản trị)</label>
      <span class="spacer"></span>
      <span class="live" id="live"><i></i>Đang theo dõi</span>
      <button class="btn sm" id="pause" type="button">⏸ Tạm dừng</button>
      <button class="btn sm" id="clear" type="button">Xóa màn hình</button>
      <button class="btn sm" id="csv" type="button">⬇ Tải CSV</button>
    </div></div>

    <div id="log" class="sqllog">${EMPTY}</div>`;

  const $ = (s) => view.querySelector(s);
  const logEl = $('#log');

  function visible(g) {
    if (!g.items.some((e) => e.id > clearedAt)) return false;
    if (prefs.writesOnly && g.method === 'GET') return false;
    if (!prefs.all && !g.mine && !g.system) return false;
    return true;
  }
  const visibleItems = (g) => g.items.filter((e) => e.id > clearedAt && !(prefs.hideSession && SESSION_CHECK.test(e.sql)));

  function itemHtml(e) {
    const k = KIND[e.kind] || KIND.other;
    const p = paramsText(e.params);
    const lp = e.count > 1 && e.lastParams ? paramsText(e.lastParams) : '';
    return `<li class="${e.error ? 'err' : ''}"><span class="sq-kind ${k.cls}">${k.label}</span>
      <div class="sq-body"><pre>${highlightSql(dedent(e.sql))}</pre>
      <div class="sq-meta">${e.count > 1 ? `<span class="sq-count">× ${num(e.count)} lần</span>` : ''}
        ${p ? `<span>Tham số${lp ? ' (lần đầu)' : ''}: <code>${esc(p)}</code></span>` : ''}
        ${lp ? `<span>Tham số (lần cuối): <code>${esc(lp)}</code></span>` : ''}
        <span>${resultText(e)}</span>
        <span class="muted">🕒 ${clock(e.time)}${e.ms !== undefined ? ` · ${e.ms.toFixed(2)} ms` : ''}</span></div></div></li>`;
  }

  function groupHtml(g) {
    const items = visibleItems(g);
    if (!items.length) return '';
    const ms = items.reduce((s, e) => s + (e.ms || 0), 0);
    const nSql = items.filter((e) => e.kind !== 'note').reduce((s, e) => s + (e.count || 1), 0);
    const nNote = items.filter((e) => e.kind === 'note').length;
    return `<section class="sq-group ${items.some((e) => e.error) ? 'failed' : ''} ${g.system ? 'system' : ''}" data-req="${g.req}">
      <header><span class="sq-time">${clock(g.time)}</span><b>${esc(g.action)}</b>
        <code class="muted">${esc(g.method)} ${esc(g.path)}</code>
        <span class="spacer"></span>
        <span class="muted small">${esc(userLabel(g))} · ${num(nSql)} câu SQL${nNote ? ` · ${nNote} ghi chú` : ''} · ${ms.toFixed(1)} ms</span></header>
      <ol>${items.map(itemHtml).join('')}</ol></section>`;
  }

  function render() {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    logEl.innerHTML = groups.filter(visible).map(groupHtml).join('') || EMPTY;
    if (nearBottom) window.scrollTo(0, document.body.scrollHeight);
  }

  function add(entries) {
    for (const e of entries) {
      let g = groups.at(-1);
      if (!g || g.req !== e.req) g = groups.find((x) => x.req === e.req);
      if (!g) {
        g = { req: e.req, action: e.action, method: e.method, path: e.path, user: e.user, time: e.time, mine: e.mine, system: e.system, items: [] };
        groups.push(g);
      }
      if (e.user) g.user = e.user; // đăng nhập: người dùng chỉ biết sau khi so khớp mật khẩu
      // Dòng gộp "× N lần" được gửi lại với id mới nhưng cùng key — cập nhật thay vì thêm
      const i = g.items.findIndex((x) => x.key === e.key);
      if (i >= 0) g.items[i] = e; else g.items.push(e);
    }
    if (groups.length > MAX_GROUPS) groups.splice(0, groups.length - MAX_GROUPS);
  }

  async function poll() {
    if (stale()) return;
    if (!paused) {
      try {
        const r = await api(`/sql-log?after=${after}${prefs.all ? '&all=1' : ''}`);
        if (stale()) return;
        $('#allWrap').hidden = !r.canAll;
        if (r.last < after) { groups.length = 0; after = 0; } // máy chủ khởi động lại
        if (r.entries.length) { add(r.entries); after = Math.max(after, ...r.entries.map((e) => e.id)); render(); }
        $('#live').classList.remove('off');
      } catch (e) {
        $('#live').classList.add('off');
      }
    }
    setTimeout(poll, POLL_MS);
  }

  const onPref = (key) => (e) => {
    prefs[key] = e.target.checked; savePrefs(prefs);
    if (key === 'all') { groups.length = 0; after = 0; }
    render();
  };
  $('#hideSession').onchange = onPref('hideSession');
  $('#writesOnly').onchange = onPref('writesOnly');
  $('#all').onchange = onPref('all');
  $('#pause').onclick = () => {
    paused = !paused;
    $('#pause').textContent = paused ? '▶ Tiếp tục' : '⏸ Tạm dừng';
    $('#live').classList.toggle('paused', paused);
    $('#live').lastChild.textContent = paused ? 'Đã tạm dừng' : 'Đang theo dõi';
  };
  $('#clear').onclick = () => { clearedAt = after; render(); };
  $('#csv').onclick = () => downloadCsv(groups.filter(visible).flatMap(visibleItems));

  await poll();
}
