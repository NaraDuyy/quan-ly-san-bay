// Tiện ích dùng chung: gọi API, định dạng, nhãn, bảng, modal, toast, SQL, biểu đồ.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

// ------------------------------------------------------------ định dạng
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('vi-VN') + ' đ');
export const num = (v, d = 0) => (v === null || v === undefined ? '' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d }));
export const moneyShort = (v) => {
  const n = Number(v);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' tr';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 }) + 'k';
  return String(n);
};
export function date(s) {
  if (!s) return '';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
export function dt(s) {
  if (!s) return '';
  return `${date(s)} ${String(s).slice(11, 16)}`;
}
export const time = (s) => (s ? String(s).slice(11, 16) : '');
export const monthLabel = (ym) => { const [y, m] = ym.split('-'); return `T${Number(m)}/${y}`; };
export const pad = (n) => String(n).padStart(2, '0');
export function localNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// ------------------------------------------------------------ nhãn enum
export const LABELS = {
  LEN_LICH: 'Lên lịch', LAM_THU_TUC: 'Làm thủ tục', DA_CAT_CANH: 'Đã cất cánh', DA_HA_CANH: 'Đã hạ cánh', TRE: 'Trễ', HUY: 'Hủy',
  DA_DAT: 'Đã đặt', DA_CHECKIN: 'Đã check-in', DA_HUY: 'Đã hủy',
  PHO_THONG: 'Phổ thông', THUONG_GIA: 'Thương gia',
  XACH_TAY: 'Xách tay', KY_GUI: 'Ký gửi',
  NOI_DIA: 'Nội địa', QUOC_TE: 'Quốc tế', T1: 'Nhà ga T1', T2: 'Nhà ga T2',
  THU_TUC: 'Thủ tục', AN_NINH: 'An ninh', DIEU_PHOI: 'Điều phối', KY_THUAT: 'Kỹ thuật', VE_SINH: 'Vệ sinh',
  AN_NINH_CONG: 'An ninh cổng', DIEU_PHOI_MAT_DAT: 'Điều phối mặt đất', KY_THUAT_SAN_DO: 'Kỹ thuật sân đỗ',
  QUA_HAN: 'Quá hạn', SAP_TOI_HAN: 'Sắp tới hạn', CON_HAN: 'Còn hạn',
};
// LAM_THU_TUC vừa là trạng thái chuyến vừa là vai trò -> nhãn vai trò riêng
export const VAI_TRO_LABEL = { LAM_THU_TUC: 'Làm thủ tục', AN_NINH_CONG: 'An ninh cổng', DIEU_PHOI_MAT_DAT: 'Điều phối mặt đất', KY_THUAT_SAN_DO: 'Kỹ thuật sân đỗ' };
export const label = (v) => LABELS[v] ?? v;

const TONE = {
  DA_HA_CANH: 'ok', DA_CHECKIN: 'ok', CON_HAN: 'ok',
  LEN_LICH: 'info', DA_DAT: 'info', LAM_THU_TUC: 'info', DA_CAT_CANH: 'info',
  TRE: 'warn', SAP_TOI_HAN: 'warn',
  HUY: 'bad', DA_HUY: 'bad', QUA_HAN: 'bad',
};
export const badge = (v, text) => (v ? `<span class="badge ${TONE[v] || ''}">${esc(text ?? label(v))}</span>` : '');

export function fillBar(pct) {
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="fill"><div class="fill-bar"><span style="width:${p}%"></span></div><span class="num">${num(pct, 1)}%</span></div>`;
}

// ------------------------------------------------------------ bảng
// columns: [{ key, label, align: 'num', render(row) -> html, fmt(value) -> text }]
export function table(columns, rows, { empty = 'Không có dữ liệu', foot = null, cls = '' } = {}) {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  const cell = (c, r) => {
    if (c.render) return c.render(r);
    const v = r[c.key];
    return esc(c.fmt ? c.fmt(v, r) : v);
  };
  return `<div class="table-wrap"><table class="tbl ${cls}">
    <thead><tr>${columns.map((c) => `<th class="${c.align || ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td class="${c.align || ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${columns.map((c) => `<td class="${c.align || ''}">${foot[c.key] ?? ''}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div>`;
}

// ------------------------------------------------------------ SQL
const KW = /\b(SELECT|FROM|WHERE|JOIN|LEFT|ON|AND|OR|NOT|GROUP BY|ORDER BY|HAVING|AS|WITH|UNION|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|COALESCE|ROUND|CAST|INTEGER|DESC|ASC|IN|BETWEEN|IS|NULL|EXISTS|LIMIT|INSERT|INTO|VALUES|UPDATE|SET|DELETE|date|julianday|strftime|DISTINCT)\b/g;
export function sqlBlock(sql, title = 'Câu lệnh SQL') {
  const html = esc(sql).split('\n').map((line) => {
    const i = line.indexOf('--');
    const code = i >= 0 ? line.slice(0, i) : line;
    const cmt = i >= 0 ? `<span class="cmt">${line.slice(i)}</span>` : '';
    return code
      .replace(/(&#39;[^&]*?&#39;)/g, '<span class="str">$1</span>')
      .replace(/(\$\w+)/g, '<span class="prm">$1</span>')
      .replace(KW, '<span class="kw">$1</span>') + cmt;
  }).join('\n');
  return `<details class="sql"><summary>${esc(title)}</summary><pre>${html}</pre></details>`;
}

// ------------------------------------------------------------ toast & modal
export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

// Mở modal; onSubmit(formEl) trả về Promise — lỗi được hiển thị trong modal.
export function modal({ title, body, submitText = 'Lưu', onSubmit, wide = false }) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-backdrop"><form class="modal" ${wide ? 'style="width:820px"' : ''} novalidate>
    <div class="modal-head"><h2>${esc(title)}</h2><button type="button" class="x" aria-label="Đóng">×</button></div>
    <div class="modal-body"><div class="form-error" hidden></div>${body}</div>
    <div class="modal-foot"><button type="button" class="btn cancel">Hủy</button>${onSubmit ? `<button class="btn primary" type="submit">${esc(submitText)}</button>` : ''}</div>
  </form></div>`;
  const form = root.querySelector('form');
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  root.querySelector('.x').onclick = close;
  root.querySelector('.cancel').onclick = close;
  root.querySelector('.modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.classList.contains('modal-backdrop')) close(); });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const errBox = form.querySelector('.form-error');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; errBox.hidden = true;
    try { await onSubmit(form); close(); } catch (err) { errBox.textContent = err.message; errBox.hidden = false; } finally { btn.disabled = false; }
  };
  setTimeout(() => form.querySelector('input:not([readonly]), select')?.focus(), 30);
  return { form, close };
}

export function confirmBox(message, okText = 'Xóa') {
  return new Promise((resolve) => {
    let ok = false;
    const m = modal({ title: 'Xác nhận', body: `<p>${esc(message)}</p>`, submitText: okText, onSubmit: async () => { ok = true; } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.form)) { obs.disconnect(); resolve(ok); } });
    obs.observe(document.getElementById('modalRoot'), { childList: true });
  });
}

// ------------------------------------------------------------ biểu đồ cột chồng
// series: [{ key, label, color: 'var(--series-1)' }]; rows: [{ x, [key]: value }]
export function stackedBars(container, rows, series, { xLabel = (x) => x, height = 260 } = {}) {
  const W = 640; const H = height; const m = { t: 10, r: 8, b: 28, l: 56 };
  const totals = rows.map((r) => series.reduce((s, k) => s + (Number(r[k.key]) || 0), 0));
  const max = Math.max(1, ...totals);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v) => m.t + (H - m.t - m.b) * (1 - v / top);
  const band = (W - m.l - m.r) / rows.length;
  const bw = Math.min(64, band * 0.5);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Biểu đồ cột chồng"><g class="axis">`;
  for (let v = 0; v <= top + 1e-6; v += step) {
    svg += `<line class="gridline" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${moneyShort(v)}</text>`;
  }
  svg += '</g>';
  rows.forEach((r, i) => {
    const cx = m.l + band * i + band / 2;
    let acc = 0;
    svg += `<g class="col" data-i="${i}">`;
    const segs = series.filter((s) => Number(r[s.key]) > 0);
    segs.forEach((s, j) => {
      const v = Number(r[s.key]);
      const y1 = y(acc + v); const y0 = y(acc);
      const gap = j > 0 ? 2 : 0; // khe 2px giữa các đoạn
      const h = Math.max(0, y0 - y1 - gap);
      const isTop = j === segs.length - 1;
      svg += isTop
        ? `<path class="bar" fill="${s.color}" d="${roundTop(cx - bw / 2, y1, bw, h, 4)}"/>`
        : `<rect class="bar" fill="${s.color}" x="${cx - bw / 2}" y="${y1}" width="${bw}" height="${h}"/>`;
      acc += v;
    });
    svg += `<rect class="hit" x="${m.l + band * i}" y="${m.t}" width="${band}" height="${H - m.t - m.b}"/>`;
    svg += `</g><text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle" style="fill:var(--text-3);font-size:11px">${esc(xLabel(r.x))}</text>`;
  });
  svg += '</svg>';
  container.innerHTML = `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join('')}</div>
    <div class="chart">${svg}<div class="tooltip"></div></div>`;
  const tip = container.querySelector('.tooltip');
  const chart = container.querySelector('.chart');
  chart.querySelectorAll('g.col').forEach((g) => {
    g.addEventListener('mousemove', (e) => {
      const r = rows[Number(g.dataset.i)];
      tip.innerHTML = `<div class="t-title">${esc(xLabel(r.x))}</div>${series.map((s) =>
        `<div class="t-row"><i style="background:${s.color}"></i><span>${esc(s.label)}</span><span>${money(r[s.key] || 0)}</span></div>`).join('')}
        <div class="t-row t-total"><span>Tổng</span><span>${money(totals[Number(g.dataset.i)])}</span></div>`;
      const box = chart.getBoundingClientRect();
      let left = e.clientX - box.left + 14;
      if (left + 200 > box.width) left = e.clientX - box.left - 214;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, e.clientY - box.top - 40) + 'px';
      tip.classList.add('show');
    });
    g.addEventListener('mouseleave', () => tip.classList.remove('show'));
  });
}
function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
function roundTop(x, y, w, h, r) {
  r = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ------------------------------------------------------------ sơ đồ ghế
// ghe: { soHangTG, thuongGia: [...], phoThong: [...], daBan: [...] }
export function seatMap(ghe, { selected = null, readonly = false } = {}) {
  const taken = new Set(ghe.daBan);
  const all = [...ghe.thuongGia, ...ghe.phoThong];
  const rows = new Map();
  for (const s of all) {
    const r = parseInt(s, 10);
    if (!rows.has(r)) rows.set(r, new Set());
    rows.get(r).add(s.replace(/^\d+/, ''));
  }
  const letters = ['F', 'E', 'D', null, 'C', 'B', 'A'];
  let html = '<div class="fuselage">';
  for (const [r, set] of rows) {
    const biz = r <= ghe.soHangTG;
    html += `<div class="seat-col"><span class="rowno">${r}</span>`;
    for (const L of letters) {
      if (L === null) { html += '<div class="aisle"></div>'; continue; }
      const id = `${r}${L}`;
      if (!set.has(L)) { html += '<span class="seat gap"></span>'; continue; }
      const cls = ['seat', biz ? 'biz' : '', taken.has(id) ? 'taken' : '', selected === id ? 'sel' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-seat="${id}" data-biz="${biz ? 1 : 0}" title="Ghế ${id}${taken.has(id) ? ' — đã bán' : ''}" ${taken.has(id) || readonly ? 'disabled' : ''}>${L}</button>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return `<div class="seatmap ${readonly ? 'readonly' : ''}">${html}</div>
    <div class="seat-legend"><span><span class="seat"></span>Phổ thông trống</span><span><span class="seat biz"></span>Thương gia trống</span>
    <span><span class="seat taken"></span>Đã bán</span>${readonly ? '' : '<span><span class="seat sel"></span>Đang chọn</span>'}</div>`;
}
