// Điều hướng theo hash (#/...), thanh menu và trạng thái đăng nhập.
import { api, esc, dt, localNow, toast, modal } from './lib.js';
import overview from './pages/overview.js';
import queries from './pages/queries.js';
import data from './pages/data.js';
import sell from './pages/sell.js';
import flight from './pages/flight.js';
import constraints from './pages/constraints.js';
import design from './pages/design.js';
import accounts from './pages/accounts.js';

export const state = { meta: null, counts: {}, me: { user: null, perms: { tables: [], actions: [] }, roles: {} } };

// ------------------------------------------------------------ phân quyền phía giao diện
// (máy chủ luôn kiểm tra lại; ở đây chỉ để ẩn / khóa nút)
export const canTable = (t) => state.me.perms.tables === '*' || state.me.perms.tables.includes(t);
export const canAction = (a) => state.me.perms.actions.includes(a);
export const roleLabel = (r) => state.me.roles[r]?.label || r;
export function guestNote(text) {
  return `<div class="notice">🔒 ${esc(text)} <button type="button" class="btn sm" data-login>Đăng nhập</button></div>`;
}

const ROUTES = [
  { re: /^\/$/, page: overview, crumb: () => 'Tổng quan' },
  { re: /^\/q\/([1-5])(?:\/(\d+))?$/, page: queries, crumb: (m) => `Truy vấn · <b>Q${m[1]}</b>` },
  { re: /^\/du-lieu\/(\w+)$/, page: data, crumb: (m) => `Quản lý dữ liệu · <b>${esc(state.meta?.tables[m[1]]?.label || m[1])}</b>` },
  { re: /^\/ban-ve$/, page: sell, crumb: () => 'Nghiệp vụ · <b>Bán vé</b>' },
  { re: /^\/chuyen\/(\d+)$/, page: flight, crumb: (m) => `Chuyến bay · <b>#${m[1]}</b>` },
  { re: /^\/rang-buoc$/, page: constraints, crumb: () => 'Thiết kế · <b>Ràng buộc toàn vẹn</b>' },
  { re: /^\/thiet-ke$/, page: design, crumb: () => 'Thiết kế · <b>Báo cáo CSDL</b>' },
  { re: /^\/tai-khoan$/, page: accounts, crumb: () => 'Hệ thống · <b>Tài khoản & phân quyền</b>' },
];

function renderNav(path) {
  const t = state.meta?.tables || {};
  const groups = {};
  for (const [name, def] of Object.entries(t)) (groups[def.group] = groups[def.group] || []).push([name, def]);
  const link = (href, ico, text, extra = '') =>
    `<a class="nav-link ${path === href.slice(1) ? 'active' : ''}" href="${href}"><span class="ico">${ico}</span>${text}${extra}</a>`;
  document.getElementById('nav').innerHTML = `
    <div class="nav-group">${link('#/', '◧', 'Tổng quan')}${link('#/ban-ve', '✚', 'Bán vé')}</div>
    <div class="nav-group"><div class="nav-title">Truy vấn báo cáo</div>
      ${link('#/q/1', '①', 'Q1 · Tỉ lệ lấp đầy')}${link('#/q/2', '②', 'Q2 · Lương tháng')}
      ${link('#/q/3', '③', 'Q3 · Hồ sơ hành khách')}${link('#/q/4', '④', 'Q4 · Doanh thu')}
      ${link('#/q/5', '⑤', 'Q5 · Bảo dưỡng')}</div>
    <div class="nav-group"><div class="nav-title">Thiết kế CSDL</div>
      ${link('#/thiet-ke', '▤', 'Báo cáo thiết kế')}${link('#/rang-buoc', '⛨', 'Ràng buộc R1–R10')}</div>
    ${canAction('tai-khoan') ? `<div class="nav-group"><div class="nav-title">Hệ thống</div>${link('#/tai-khoan', '⚿', 'Tài khoản & phân quyền')}</div>` : ''}
    ${Object.entries(groups).map(([g, items]) => `<div class="nav-group"><div class="nav-title">${esc(g)}</div>
      ${items.map(([name, def]) => link(`#/du-lieu/${name}`, '·', esc(def.label), `<span class="count">${state.counts[name] ?? ''}</span>`)).join('')}</div>`).join('')}`;
}

function renderUser() {
  const u = state.me.user;
  document.getElementById('userBox').innerHTML = u
    ? `<div class="user"><span class="avatar">${esc((u.HoTen.trim().split(/\s+/).pop()[0] || '?').toUpperCase())}</span>
         <span><b>${esc(u.HoTen)}</b><small>${esc(u.TenDangNhap)} · ${esc(roleLabel(u.VaiTro))}</small></span></div>
       <div class="row"><button class="btn-ghost" id="pwBtn" type="button">Đổi mật khẩu</button><button class="btn-ghost" id="logoutBtn" type="button">Đăng xuất</button></div>`
    : `<div class="user guest"><span class="avatar">?</span><span><b>Khách</b><small>Chỉ xem, không sửa được dữ liệu</small></span></div>
       <button class="btn-login" id="loginBtn" type="button">Đăng nhập</button>`;
  document.getElementById('loginBtn')?.addEventListener('click', openLogin);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);
  document.getElementById('pwBtn')?.addEventListener('click', openChangePassword);
}

async function loadMe() {
  state.me = await api('/auth/me');
  renderUser();
}

export function openLogin() {
  modal({
    title: 'Đăng nhập',
    submitText: 'Đăng nhập',
    body: `<div class="stack">
      <div class="field"><label>Tên đăng nhập</label><input name="username" autocomplete="username" required autocapitalize="none"></div>
      <div class="field"><label>Mật khẩu</label><input name="password" type="password" autocomplete="current-password" required></div>
      <p class="muted small" style="margin:0">Khách chưa đăng nhập vẫn xem được mọi trang. Đăng nhập để thêm, sửa, xóa dữ liệu theo vai trò được cấp.</p>
    </div>`,
    onSubmit: async (form) => {
      const r = await api('/auth/login', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      state.me = { ...state.me, ...r };
      renderUser();
      toast(`Xin chào ${r.user.HoTen} (${roleLabel(r.user.VaiTro)})`, 'ok');
      route();
    },
  });
}

async function logout() {
  await api('/auth/logout', { method: 'POST' });
  await loadMe();
  toast('Đã đăng xuất');
  if (currentPath() === '/tai-khoan') location.hash = '#/'; else route();
}

function openChangePassword() {
  modal({
    title: 'Đổi mật khẩu',
    body: `<div class="stack">
      <div class="field"><label>Mật khẩu hiện tại</label><input name="oldPassword" type="password" autocomplete="current-password" required></div>
      <div class="field"><label>Mật khẩu mới</label><input name="newPassword" type="password" autocomplete="new-password" minlength="8" required><span class="hint">Ít nhất 8 ký tự</span></div>
      <div class="field"><label>Nhập lại mật khẩu mới</label><input name="again" type="password" autocomplete="new-password" required></div>
    </div>`,
    onSubmit: async (form) => {
      const f = Object.fromEntries(new FormData(form));
      if (f.newPassword !== f.again) throw new Error('Hai lần nhập mật khẩu mới không khớp');
      await api('/auth/password', { method: 'POST', body: { oldPassword: f.oldPassword, newPassword: f.newPassword } });
      toast('Đã đổi mật khẩu', 'ok');
    },
  });
}

export async function refreshCounts() {
  const r = await api('/tables');
  state.meta = r; state.counts = r.counts;
  renderNav(currentPath());
}

const currentPath = () => (location.hash.slice(1) || '/');
let renderSeq = 0;

export async function route() {
  const path = currentPath();
  const seq = ++renderSeq;
  const view = document.getElementById('view');
  document.getElementById('sidebar').classList.remove('open');
  const r = ROUTES.find((x) => x.re.test(path));
  if (!r) { location.hash = '#/'; return; }
  const m = path.match(r.re);
  renderNav(path);
  document.getElementById('crumbs').innerHTML = r.crumb(m);
  view.innerHTML = '<div class="loading">Đang tải…</div>';
  try {
    await r.page(view, m, () => seq !== renderSeq);
  } catch (e) {
    if (seq === renderSeq) view.innerHTML = `<div class="card"><div class="empty">Lỗi: ${esc(e.message)}</div></div>`;
  }
  window.scrollTo(0, 0);
}

function tick() { document.getElementById('clock').textContent = dt(localNow()); }

document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
document.getElementById('themeToggle').onclick = () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const next = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch (e) { /* bỏ qua */ }
};
// Nút "Đăng nhập" trong các thông báo dành cho khách
document.getElementById('view').addEventListener('click', (e) => { if (e.target.closest('[data-login]')) openLogin(); });
// Hết phiên hoặc thiếu quyền: cập nhật lại trạng thái đăng nhập
window.addEventListener('auth-changed', () => loadMe().then(() => renderNav(currentPath())));

window.addEventListener('hashchange', route);
tick(); setInterval(tick, 30000);
Promise.all([loadMe(), refreshCounts()]).then(route).catch((e) => { toast(e.message, 'error'); route(); });
