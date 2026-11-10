// Quản lý tài khoản và phân quyền — chỉ vai trò Quản trị.
import { api, esc, dt, table, badge, toast, modal, confirmBox } from '../lib.js';
import { state, canAction, roleLabel, guestNote } from '../app.js';

const ACTION_LABEL = {
  'ban-ve': 'Bán vé', 'trang-thai': 'Đổi trạng thái chuyến', 'bao-duong': 'Ghi nhận bảo dưỡng',
  reset: 'Nạp lại dữ liệu mẫu', 'tai-khoan': 'Quản lý tài khoản',
};

export default async function accounts(view, m, stale) {
  if (!canAction('tai-khoan')) {
    view.innerHTML = `<div class="page-head"><div><h1>Tài khoản & phân quyền</h1></div></div>
      ${guestNote('Chỉ tài khoản Quản trị được quản lý tài khoản.')}`;
    return;
  }
  const rows = await api('/accounts');
  if (stale()) return;
  render(rows);

  function render(rows) {
    const roles = state.me.roles;
    const tablesOf = (r) => (r.tables === '*' ? '<span class="tag">Tất cả 15 bảng</span>'
      : r.tables.map((t) => `<a href="#/du-lieu/${t}"><span class="tag">${esc(state.meta.tables[t]?.label || t)}</span></a>`).join(' '));
    view.innerHTML = `
      <div class="page-head"><div><h1>Tài khoản & phân quyền</h1>
        <p>Khách chưa đăng nhập chỉ được xem. Mỗi tài khoản có một vai trò; vai trò quyết định các bảng được thêm / sửa / xóa và các nghiệp vụ được làm.</p></div>
        <button class="btn primary" id="add">✚ Thêm tài khoản</button></div>

      <div class="card"><div class="card-head"><h2>Tài khoản (${rows.length})</h2></div>
        <div class="card-body flush">${table([
          { label: 'Tên đăng nhập', render: (r) => `<b class="mono">${esc(r.TenDangNhap)}</b>${r.MaTK === state.me.user.MaTK ? ' <span class="muted small">(bạn)</span>' : ''}` },
          { label: 'Họ tên', key: 'HoTen' },
          { label: 'Vai trò', render: (r) => esc(roleLabel(r.VaiTro)) },
          { label: 'Trạng thái', render: (r) => (r.KichHoat ? badge('CON_HAN', 'Hoạt động') : badge('QUA_HAN', 'Đã khóa')) },
          { label: 'Ngày tạo', render: (r) => esc(dt(r.NgayTao)) },
          { label: '', align: 'actions', render: (r) => `<button class="btn sm link" data-edit="${r.MaTK}">Sửa</button>
            ${r.MaTK === state.me.user.MaTK ? '' : `<button class="btn sm link danger" data-del="${r.MaTK}">Xóa</button>`}` },
        ], rows)}</div></div>

      <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Bảng phân quyền theo vai trò</h2>
        <p>Mọi vai trò (và khách) đều xem được tất cả các trang, truy vấn Q1–Q5 và thử vi phạm ràng buộc.</p></div></div>
        <div class="card-body flush">${table([
          { label: 'Vai trò', render: (r) => `<b>${esc(r.label)}</b><span class="fk-sub">${esc(r.desc)}</span>` },
          { label: 'Được thêm / sửa / xóa', render: (r) => `<div class="perm-list">${tablesOf(r)}</div>` },
          { label: 'Nghiệp vụ', render: (r) => r.actions.map((a) => `<span class="tag">${esc(ACTION_LABEL[a] || a)}</span>`).join(' ') || '<span class="muted">—</span>' },
          { label: 'Số tài khoản', align: 'num', render: (r) => (r.key === '_' ? '—' : rows.filter((x) => x.VaiTro === r.key).length) },
        ], [...Object.entries(roles).map(([key, r]) => ({ key, ...r })),
          { key: '_', label: 'Khách (chưa đăng nhập)', desc: 'Chỉ xem', tables: [], actions: [] }])}</div></div>`;

    view.querySelector('#add').onclick = () => openForm();
    view.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => openForm(rows.find((r) => r.MaTK === Number(b.dataset.edit))); });
    view.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = async () => {
        const r = rows.find((x) => x.MaTK === Number(b.dataset.del));
        if (!(await confirmBox(`Xóa tài khoản "${r.TenDangNhap}"? Người dùng này sẽ bị đăng xuất ngay.`))) return;
        try { render(await api(`/accounts/${r.MaTK}`, { method: 'DELETE' })); toast('Đã xóa tài khoản', 'ok'); } catch (e) { toast(e.message, 'error'); }
      };
    });
  }

  function openForm(row = null) {
    const roles = state.me.roles;
    modal({
      title: row ? `Sửa tài khoản ${row.TenDangNhap}` : 'Thêm tài khoản',
      body: `<div class="form-grid">
        <div class="field"><label>Tên đăng nhập</label>${row ? `<input readonly value="${esc(row.TenDangNhap)}">`
          : '<input name="TenDangNhap" required maxlength="32" autocapitalize="none" placeholder="vd: nv.banve2"><span class="hint">Chữ thường không dấu, số, dấu chấm, gạch</span>'}</div>
        <div class="field"><label>Họ tên</label><input name="HoTen" required maxlength="80" value="${esc(row?.HoTen || '')}"></div>
        <div class="field"><label>Vai trò</label><select name="VaiTro">${Object.entries(roles).map(([k, r]) =>
          `<option value="${k}" ${row?.VaiTro === k ? 'selected' : ''}>${esc(r.label)}</option>`).join('')}</select></div>
        <div class="field"><label>${row ? 'Mật khẩu mới' : 'Mật khẩu'}</label><input name="MatKhau" type="password" autocomplete="new-password" minlength="8" ${row ? '' : 'required'}>
          <span class="hint">${row ? 'Bỏ trống nếu không đổi. ' : ''}Ít nhất 8 ký tự</span></div>
        ${row ? `<div class="field wide"><label class="row"><input type="checkbox" name="KichHoat" ${row.KichHoat ? 'checked' : ''}> Cho phép đăng nhập</label>
          <span class="hint">Khóa tài khoản hoặc đổi mật khẩu sẽ đăng xuất các phiên đang mở của tài khoản đó.</span></div>` : ''}
        <div class="field wide"><span class="hint" id="roleDesc"></span></div>
      </div>`,
      onSubmit: async (form) => {
        const f = Object.fromEntries(new FormData(form));
        const rows = row
          ? await api(`/accounts/${row.MaTK}`, { method: 'PUT', body: { HoTen: f.HoTen, VaiTro: f.VaiTro, KichHoat: !!f.KichHoat, ...(f.MatKhau ? { MatKhau: f.MatKhau } : {}) } })
          : await api('/accounts', { method: 'POST', body: f });
        toast(row ? 'Đã cập nhật tài khoản' : 'Đã thêm tài khoản', 'ok');
        render(rows);
      },
    });
    const sel = document.querySelector('#modalRoot select[name=VaiTro]');
    const desc = document.querySelector('#roleDesc');
    const sync = () => { desc.textContent = `Quyền: ${roles[sel.value].desc}`; };
    sel.onchange = sync; sync();
  }
}
