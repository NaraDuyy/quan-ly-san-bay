// Nhật ký SQL: hiển thị lần lượt các câu lệnh SQL vừa chạy trên CSDL, tự cập nhật mỗi giây.
// Mở trang này ở một tab, thao tác ở tab khác của cùng trình duyệt.
import { api, esc, num, highlightSql } from '../lib.js';

const POLL_MS = 1000;
const MAX_GROUPS = 300;
// Câu kiểm tra phiên chạy ở đầu mọi yêu cầu khi đã đăng nhập — ẩn mặc định cho gọn
const SESSION_CHECK = /FROM TAIKHOAN WHERE MaTK = \? AND KichHoat = 1/;
const PREFS_KEY = 'sqllog-prefs';

const KIND = {
  read: { cls: 'k-read', label: 'Đọc' },
  write: { cls: 'k-write', label: 'Ghi' },
  tx: { cls: 'k-tx', label: 'Giao tác' },
  other: { cls: 'k-other', label: 'Khác' },
  note: { cls: 'k-other', label: 'Ghi chú' },
};

function loadPrefs() {
  const d = { hideSession: true, writesOnly: false, all: false };
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

export default async function sqllog(view, m, stale) {
  const prefs = loadPrefs();
  let after = 0;
  let paused = false;
  let canAll = false;
  let clearedAt = 0; // xóa màn hình: chỉ ẩn phía giao diện, nhật ký trên máy chủ vẫn còn
  const groups = []; // [{ req, action, method, path, user, time, mine, items: [] }]

  view.innerHTML = `
    <div class="page-head"><div><h1>Nhật ký SQL</h1>
      <p>Các câu lệnh SQL vừa chạy trên CSDL, theo đúng thứ tự thời gian. Mở trang này ở <b>một tab</b>, thao tác (đăng nhập, bán vé, sửa dữ liệu…)
      ở <b>tab khác của cùng trình duyệt</b> — câu lệnh hiện ra ngay. Mã băm mật khẩu được che; mật khẩu gốc không bao giờ đi vào SQL.</p></div>
      <a class="btn" href="#/nhat-ky-sql" target="_blank" rel="noopener">↗ Mở ở tab mới</a></div>

    <div class="card sqllog-bar"><div class="card-body row" style="padding-top:12px;padding-bottom:12px">
      <label class="row small"><input type="checkbox" id="hideSession" ${prefs.hideSession ? 'checked' : ''}> Ẩn câu kiểm tra phiên đăng nhập</label>
      <label class="row small"><input type="checkbox" id="writesOnly" ${prefs.writesOnly ? 'checked' : ''}> Chỉ thao tác thay đổi dữ liệu (POST / PUT / DELETE)</label>
      <label class="row small" id="allWrap" hidden><input type="checkbox" id="all" ${prefs.all ? 'checked' : ''}> Mọi người dùng (Quản trị)</label>
      <span class="spacer"></span>
      <span class="live" id="live"><i></i>Đang theo dõi</span>
      <button class="btn sm" id="pause" type="button">⏸ Tạm dừng</button>
      <button class="btn sm" id="clear" type="button">Xóa màn hình</button>
    </div></div>

    <div id="log" class="sqllog"><div class="empty">Chưa có câu lệnh nào. Hãy thao tác ở tab khác — ví dụ đăng nhập hoặc mở một truy vấn.</div></div>`;

  const $ = (s) => view.querySelector(s);
  const logEl = $('#log');

  function visible(g) {
    if (g.items.at(-1).id <= clearedAt) return false;
    if (prefs.writesOnly && g.method === 'GET') return false;
    if (!prefs.all && !g.mine) return false;
    return true;
  }
  const visibleItems = (g) => g.items.filter((e) => e.id > clearedAt && !(prefs.hideSession && SESSION_CHECK.test(e.sql)));

  function groupHtml(g) {
    const items = visibleItems(g);
    if (!items.length) return '';
    const ms = items.reduce((s, e) => s + (e.ms || 0), 0);
    const failed = items.some((e) => e.error);
    return `<section class="sq-group ${failed ? 'failed' : ''}" data-req="${g.req}">
      <header><span class="sq-time">${clock(g.time)}</span><b>${esc(g.action)}</b>
        <code class="muted">${esc(g.method)} ${esc(g.path)}</code>
        <span class="spacer"></span>
        <span class="muted small">${g.user ? esc(g.user) : 'khách'} · ${items.length} câu · ${ms.toFixed(1)} ms</span></header>
      <ol>${items.map((e) => {
        const k = KIND[e.kind] || KIND.other;
        const p = paramsText(e.params);
        return `<li class="${e.error ? 'err' : ''}"><span class="sq-kind ${k.cls}">${k.label}</span>
          <div class="sq-body"><pre>${highlightSql(dedent(e.sql))}</pre>
          <div class="sq-meta">${p ? `<span>Tham số: <code>${esc(p)}</code></span>` : ''}<span>${resultText(e)}</span>
          ${e.ms !== undefined ? `<span class="muted">${e.ms.toFixed(2)} ms</span>` : ''}</div></div></li>`;
      }).join('')}</ol></section>`;
  }

  function render() {
    const nearBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 120;
    const html = groups.filter(visible).map(groupHtml).join('');
    logEl.innerHTML = html || '<div class="empty">Chưa có câu lệnh nào. Hãy thao tác ở tab khác — ví dụ đăng nhập hoặc mở một truy vấn.</div>';
    if (nearBottom) window.scrollTo(0, document.body.scrollHeight);
  }

  function add(entries) {
    for (const e of entries) {
      let g = groups.at(-1);
      if (!g || g.req !== e.req) {
        g = { req: e.req, action: e.action, method: e.method, path: e.path, user: e.user, time: e.time, mine: e.mine, items: [] };
        groups.push(g);
      }
      if (e.user) g.user = e.user; // đăng nhập: người dùng chỉ biết sau câu SELECT đầu tiên
      g.items.push(e);
    }
    if (groups.length > MAX_GROUPS) groups.splice(0, groups.length - MAX_GROUPS);
  }

  async function poll() {
    if (stale()) return;
    if (!paused) {
      try {
        const r = await api(`/sql-log?after=${after}${prefs.all ? '&all=1' : ''}`);
        if (stale()) return;
        canAll = r.canAll;
        $('#allWrap').hidden = !canAll;
        if (r.last < after) { groups.length = 0; after = 0; } // máy chủ khởi động lại
        if (r.entries.length) { add(r.entries); after = r.entries.at(-1).id; render(); }
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

  await poll();
}
