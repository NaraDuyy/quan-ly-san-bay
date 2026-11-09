// Điều hướng theo hash (#/...) và thanh menu.
import { api, esc, dt, localNow, toast } from './lib.js';
import overview from './pages/overview.js';
import queries from './pages/queries.js';
import data from './pages/data.js';
import sell from './pages/sell.js';
import flight from './pages/flight.js';
import constraints from './pages/constraints.js';
import design from './pages/design.js';

export const state = { meta: null, counts: {} };

const ROUTES = [
  { re: /^\/$/, page: overview, crumb: () => 'Tổng quan' },
  { re: /^\/q\/([1-5])(?:\/(\d+))?$/, page: queries, crumb: (m) => `Truy vấn · <b>Q${m[1]}</b>` },
  { re: /^\/du-lieu\/(\w+)$/, page: data, crumb: (m) => `Quản lý dữ liệu · <b>${esc(state.meta?.tables[m[1]]?.label || m[1])}</b>` },
  { re: /^\/ban-ve$/, page: sell, crumb: () => 'Nghiệp vụ · <b>Bán vé</b>' },
  { re: /^\/chuyen\/(\d+)$/, page: flight, crumb: (m) => `Chuyến bay · <b>#${m[1]}</b>` },
  { re: /^\/rang-buoc$/, page: constraints, crumb: () => 'Thiết kế · <b>Ràng buộc toàn vẹn</b>' },
  { re: /^\/thiet-ke$/, page: design, crumb: () => 'Thiết kế · <b>Báo cáo CSDL</b>' },
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
    ${Object.entries(groups).map(([g, items]) => `<div class="nav-group"><div class="nav-title">${esc(g)}</div>
      ${items.map(([name, def]) => link(`#/du-lieu/${name}`, '·', esc(def.label), `<span class="count">${state.counts[name] ?? ''}</span>`)).join('')}</div>`).join('')}`;
}

export async function refreshCounts() {
  const r = await api('/tables');
  state.meta = r; state.counts = r.counts;
  renderNav(currentPath());
}

const currentPath = () => (location.hash.slice(1) || '/');
let renderSeq = 0;

async function route() {
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

window.addEventListener('hashchange', route);
tick(); setInterval(tick, 30000);
refreshCounts().then(route).catch((e) => { toast(e.message, 'error'); route(); });
