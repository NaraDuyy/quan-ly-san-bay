// Màn hình quản trị tổng quát cho 15 bảng: tìm kiếm, sắp xếp, phân trang, thêm / sửa / xóa.
import { api, esc, money, num, dt, date, label, badge, toast, modal, confirmBox, VAI_TRO_LABEL } from '../lib.js';
import { state, refreshCounts, canTable, roleLabel, guestNote } from '../app.js';

const BADGE_COLS = new Set(['TrangThai']);
const optionCache = {};
async function options(table) {
  if (!optionCache[table]) optionCache[table] = api(`/tables/${table}/options`).catch((e) => { delete optionCache[table]; throw e; });
  return optionCache[table];
}
export const clearOptionCache = () => { for (const k of Object.keys(optionCache)) delete optionCache[k]; };

const enumLabel = (c, v) => (c.name === 'VaiTro' ? VAI_TRO_LABEL[v] : label(v));

function cellHtml(name, c, r) {
  const v = r[c.name];
  if (v === null || v === undefined || v === '') return '<span class="muted">—</span>';
  if (c.fk) {
    const lbl = r[`${c.name}__label`];
    const link = c.fk === 'CHUYENBAY' ? `#/chuyen/${v}` : null;
    const main = link ? `<a href="${link}">${esc(lbl ?? v)}</a>` : esc(lbl ?? v);
    return `${main}<span class="fk-sub">${esc(c.name)} = ${esc(v)}</span>`;
  }
  if (name === 'CHUYENBAY' && c.name === 'MaChuyen') return `<a href="#/chuyen/${v}"><b>${v}</b></a>`;
  if (c.type === 'enum') return BADGE_COLS.has(c.name) ? badge(v) : esc(enumLabel(c, v));
  if (c.type === 'money') return esc(money(v));
  if (c.type === 'decimal') return esc(num(v, 2));
  if (c.type === 'datetime') return `<span class="nowrap">${esc(dt(v))}</span>`;
  if (c.type === 'date') return `<span class="nowrap">${esc(date(v))}</span>`;
  return esc(v);
}

export default async function data(view, m, stale) {
  const name = m[1];
  const t = state.meta?.tables[name];
  if (!t) { view.innerHTML = '<div class="card"><div class="empty">Không có bảng này</div></div>'; return; }
  const q = { page: 1, size: 20, sort: t.defaultSort || t.pk[0], dir: t.defaultDir || 'asc', q: '' };
  const editable = canTable(name);

  view.innerHTML = `
    <div class="page-head"><div><h1>${esc(t.label)} <code class="muted" style="font-size:14px">${name}</code></h1><p>${esc(t.desc)}</p></div>
      ${editable ? '<button class="btn primary" id="add">✚ Thêm mới</button>' : ''}</div>
    ${editable ? '' : state.me.user
      ? `<div class="notice">🔒 Vai trò ${esc(roleLabel(state.me.user.VaiTro))} chỉ được xem bảng này.</div>`
      : guestNote('Bạn đang xem với tư cách khách. Đăng nhập để thêm, sửa, xóa dữ liệu.')}
    <div class="card">
      <div class="card-head"><input class="search" id="q" type="search" placeholder="Tìm kiếm…"><span class="spacer"></span>
        <span class="muted small">Khóa chính: <code>${t.pk.join(', ')}</code></span></div>
      <div class="card-body flush" id="tbl"><div class="loading">Đang tải…</div></div>
      <div class="pager" id="pager"></div>
    </div>`;

  async function load() {
    const res = await api(`/tables/${name}?${new URLSearchParams(q)}`);
    if (stale()) return;
    const cols = t.columns;
    const arrow = (c) => (q.sort === c ? `<span class="arrow">${q.dir === 'asc' ? '▲' : '▼'}</span>` : '');
    view.querySelector('#tbl').innerHTML = res.rows.length ? `<div class="table-wrap"><table class="tbl">
      <thead><tr>${cols.map((c) => `<th class="sortable ${['int', 'money', 'decimal'].includes(c.type) && !c.fk ? 'num' : ''}" data-sort="${c.name}">${esc(c.label)}${arrow(c.name)}</th>`).join('')}${editable ? '<th></th>' : ''}</tr></thead>
      <tbody>${res.rows.map((r, i) => `<tr>${cols.map((c) => `<td class="${['int', 'money', 'decimal'].includes(c.type) && !c.fk ? 'num' : ''}">${cellHtml(name, c, r)}</td>`).join('')}
        ${editable ? `<td class="actions"><button class="btn sm link" data-edit="${i}">Sửa</button><button class="btn sm link danger" data-del="${i}">Xóa</button></td>` : ''}</tr>`).join('')}</tbody>
    </table></div>` : '<div class="empty">Không có bản ghi nào</div>';
    const pages = Math.max(1, Math.ceil(res.total / q.size));
    view.querySelector('#pager').innerHTML = `<span>${res.total} bản ghi</span><span class="spacer"></span>
      <select id="size">${[10, 20, 50, 100].map((s) => `<option ${s === q.size ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <button class="btn sm" id="prev" ${q.page <= 1 ? 'disabled' : ''}>‹ Trước</button>
      <span>Trang ${q.page} / ${pages}</span>
      <button class="btn sm" id="next" ${q.page >= pages ? 'disabled' : ''}>Sau ›</button>`;

    view.querySelectorAll('th[data-sort]').forEach((th) => {
      th.onclick = () => {
        if (q.sort === th.dataset.sort) q.dir = q.dir === 'asc' ? 'desc' : 'asc';
        else { q.sort = th.dataset.sort; q.dir = 'asc'; }
        q.page = 1; load();
      };
    });
    view.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openForm(res.rows[b.dataset.edit]); });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const row = res.rows[b.dataset.del];
        const pk = Object.fromEntries(t.pk.map((k) => [k, row[k]]));
        if (!(await confirmBox(`Xóa bản ghi ${t.pk.map((k) => `${k} = ${row[k]}`).join(', ')} khỏi bảng ${name}?`))) return;
        try {
          await api(`/tables/${name}`, { method: 'DELETE', body: { pk } });
          toast('Đã xóa bản ghi', 'ok'); clearOptionCache(); refreshCounts(); load();
        } catch (e) { toast(e.message, 'error'); }
      };
    });
    view.querySelector('#size').onchange = (e) => { q.size = Number(e.target.value); q.page = 1; load(); };
    view.querySelector('#prev').onclick = () => { q.page--; load(); };
    view.querySelector('#next').onclick = () => { q.page++; load(); };
  }

  async function openForm(row = null) {
    const edit = !!row;
    const fields = await Promise.all(t.columns.map(async (c) => {
      if (c.auto && !edit) return '';
      const v = row ? row[c.name] : (c.default ?? '');
      const readonly = c.auto || c.computed || (edit && t.pk.includes(c.name));
      const req = c.required && !readonly ? ' <span class="req">*</span>' : '';
      let input;
      if (readonly) {
        const shown = c.type === 'money' ? money(v) : c.fk ? (row?.[`${c.name}__label`] ?? v) : c.type === 'enum' ? enumLabel(c, v) : (v ?? '');
        input = `<input readonly value="${esc(c.computed && !edit ? 'Tự tính khi lưu' : shown)}">`;
      } else if (c.fk) {
        const opts = await options(c.fk);
        input = `<select name="${c.name}" ${c.required ? 'required' : ''}><option value="">— Chọn —</option>
          ${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
      } else if (c.type === 'enum') {
        input = `<select name="${c.name}" ${c.required ? 'required' : ''}>${c.required ? '' : '<option value="">—</option>'}
          ${c.options.map((o) => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(enumLabel(c, o))}</option>`).join('')}</select>`;
      } else {
        const type = { int: 'number', money: 'number', decimal: 'number', date: 'date', datetime: 'datetime-local' }[c.type] || 'text';
        const val = c.type === 'datetime' && v ? String(v).slice(0, 16).replace(' ', 'T') : v;
        const attrs = [
          c.maxLength ? `maxlength="${c.maxLength}"` : '', c.min !== undefined ? `min="${c.min}"` : '', c.max !== undefined ? `max="${c.max}"` : '',
          c.type === 'decimal' ? `step="${c.step || 0.01}"` : c.type === 'money' ? 'step="1000"' : '',
        ].join(' ');
        input = `<input type="${type}" name="${c.name}" value="${esc(val ?? '')}" ${attrs}>`;
      }
      return `<div class="field ${c.wide ? 'wide' : ''}"><label>${esc(c.label)} <code class="muted">${c.name}</code>${req}</label>${input}
        ${c.hint ? `<span class="hint">${esc(c.hint)}</span>` : ''}</div>`;
    }));
    modal({
      title: `${edit ? 'Sửa' : 'Thêm'} ${t.label.toLowerCase()}`,
      body: `<div class="form-grid">${fields.join('')}</div>`,
      onSubmit: async (form) => {
        const body = Object.fromEntries(new FormData(form));
        if (edit) {
          await api(`/tables/${name}`, { method: 'PUT', body: { pk: Object.fromEntries(t.pk.map((k) => [k, row[k]])), data: body } });
          toast('Đã cập nhật', 'ok');
        } else {
          await api(`/tables/${name}`, { method: 'POST', body });
          toast('Đã thêm bản ghi', 'ok');
          refreshCounts();
        }
        clearOptionCache();
        load();
      },
    });
  }

  let timer;
  view.querySelector('#q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(() => { q.q = e.target.value; q.page = 1; load(); }, 250); };
  if (editable) view.querySelector('#add').onclick = () => openForm();
  await load();
}
