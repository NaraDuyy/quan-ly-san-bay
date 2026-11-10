// Chi tiết một chuyến bay: đổi trạng thái (R9), tổ phục vụ (R10), danh sách vé, sơ đồ ghế.
import { api, esc, money, dt, label, badge, table, seatMap, toast, confirmBox, VAI_TRO_LABEL } from '../lib.js';
import { state, refreshCounts, canTable, canAction, guestNote } from '../app.js';
import { clearOptionCache } from './data.js';

const VAI_TRO_THEO_VI_TRI = { THU_TUC: 'LAM_THU_TUC', AN_NINH: 'AN_NINH_CONG', DIEU_PHOI: 'DIEU_PHOI_MAT_DAT', KY_THUAT: 'KY_THUAT_SAN_DO' };

export default async function flight(view, m, stale) {
  const id = Number(m[1]);
  const [d, nhanVien] = await Promise.all([api(`/chuyen/${id}`), api('/tables/NHANVIEN?size=500&sort=HoTen')]);
  if (stale()) return;
  render(d, nhanVien.rows);

  function render(d, nv) {
    const c = d.chuyen;
    const trangThai = state.meta.tables.CHUYENBAY.columns.find((x) => x.name === 'TrangThai').options;
    const daPhanCong = new Set(d.toPhucVu.map((p) => p.MaNV));
    const veHL = d.ve.filter((v) => v.TrangThai !== 'DA_HUY');
    const doiTrangThai = canAction('trang-thai');
    const phanCong = canTable('PHANCONG');
    view.innerHTML = `
      <div class="page-head"><div><h1>Chuyến ${esc(c.SoHieuChuyen)} ${badge(c.TrangThai)}</h1>
        <p>${esc(c.TenHang)} · tàu bay ${esc(c.SoHieuMB)} (${esc(c.Model)}, ${c.SoGhe} ghế) · mã chuyến ${c.MaChuyen}</p></div>
        <a class="btn" href="#/du-lieu/CHUYENBAY">← Danh sách chuyến bay</a></div>

      <div class="grid cols-main">
        <div class="card"><div class="card-body" style="padding-top:18px">
          <div class="route-big">
            <div><div class="code">${esc(c.SanBayDi)}</div><div class="city">${esc(c.ThanhPhoDi)}</div></div>
            <div class="line"></div>
            <div style="text-align:right"><div class="code">${esc(c.SanBayDen)}</div><div class="city">${esc(c.ThanhPhoDen)}</div></div>
          </div>
          <dl class="dl" style="margin-top:18px">
            <dt>Khởi hành kế hoạch</dt><dd>${esc(dt(c.GioKHKeHoach))}</dd>
            <dt>Khởi hành thực tế</dt><dd>${esc(dt(c.GioKHThucTe) || '—')}</dd>
            <dt>Đến kế hoạch</dt><dd>${esc(dt(c.GioDenKeHoach))}</dd>
            <dt>Đường bay</dt><dd>${c.KhoangCachKm} km · ${c.ThoiGianBayPhut} phút</dd>
            <dt>Cổng</dt><dd>${c.TenCong ? `${esc(c.TenCong)} · ${esc(label(c.KhuVuc))}` : '<span class="muted">Chưa gán</span>'}</dd>
            <dt>Giá vé cơ bản</dt><dd>${money(c.GiaVeCoBan)}</dd>
            <dt>Vé hiệu lực</dt><dd>${veHL.length} / ${c.SoGhe} (${(100 * veHL.length / c.SoGhe).toFixed(1)}%)</dd>
          </dl></div></div>

        <div class="card"><div class="card-head"><div><h2>Trạng thái khai thác</h2>
          <p>Chuyển sang <i>Làm thủ tục</i> trở đi cần đủ tổ phục vụ (R9). Hủy chuyến sẽ hủy toàn bộ vé.</p></div></div>
          <div class="card-body stack">
            ${doiTrangThai ? `<div class="row"><select id="tt">${trangThai.map((t) => `<option value="${t}" ${t === c.TrangThai ? 'selected' : ''}>${esc(label(t))}</option>`).join('')}</select>
              <button class="btn primary" id="doiTT">Cập nhật</button></div>`
              : `<div>Trạng thái hiện tại: ${badge(c.TrangThai)} <span class="muted small">· chỉ vai trò Điều phối / Quản trị được đổi</span></div>`}
            <div>${d.r9 ? `<span class="badge bad">Chưa đạt R9</span><p class="small" style="color:var(--bad);margin:6px 0 0">${esc(d.r9)}</p>`
              : '<span class="badge ok">Đạt R9 — đủ tổ phục vụ tối thiểu</span>'}</div>
          </div></div>
      </div>

      <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Tổ phục vụ mặt đất (${d.toPhucVu.length})</h2>
        <p>Một nhân viên không được phục vụ hai chuyến cách nhau dưới 120 phút (R10). Thưởng chuyến theo G6.</p></div></div>
        <div class="card-body flush">${table([
          { label: 'Mã NV', align: 'num', key: 'MaNV' },
          { label: 'Họ tên', render: (r) => `<b>${esc(r.HoTen)}</b>` },
          { label: 'Vị trí', render: (r) => esc(label(r.ViTri)) },
          { label: 'Vai trò trên chuyến', render: (r) => esc(VAI_TRO_LABEL[r.VaiTro]) },
          { label: 'Thưởng chuyến', align: 'num', render: (r) => money(r.MucThuongChuyen) },
          ...(phanCong ? [{ label: '', align: 'actions', render: (r) => `<button class="btn sm link danger" data-rm="${r.MaNV}">Gỡ</button>` }] : []),
        ], d.toPhucVu, { empty: 'Chưa phân công nhân viên' })}</div>
        ${phanCong ? `<form class="card-body filters" id="pc" style="padding-top:14px;border-top:1px solid var(--border)">
          <div class="field" style="min-width:260px"><label>Nhân viên</label><select name="MaNV" required>
            ${nv.filter((n) => !daPhanCong.has(n.MaNV) && VAI_TRO_THEO_VI_TRI[n.ViTri]).map((n) =>
              `<option value="${n.MaNV}" data-vt="${VAI_TRO_THEO_VI_TRI[n.ViTri]}">${esc(n.HoTen)} · ${esc(label(n.ViTri))}</option>`).join('')}</select></div>
          <div class="field"><label>Vai trò</label><select name="VaiTro">${Object.entries(VAI_TRO_LABEL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          <button class="btn primary">+ Phân công</button>
        </form>` : `<div class="card-body" style="padding-top:14px">${state.me.user ? '<span class="muted small">Chỉ vai trò Điều phối / Quản trị được phân công nhân viên.</span>' : guestNote('Đăng nhập với vai trò Điều phối để phân công nhân viên.')}</div>`}</div>

      <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Sơ đồ ghế</h2><p>Ghế xám là ghế đã bán (vé chưa hủy)</p></div>
        <span class="spacer"></span>${c.TrangThai !== 'HUY' ? '<a class="btn sm" href="#/ban-ve">✚ Bán vé</a>' : ''}</div>
        <div class="card-body">${seatMap(d.ghe, { readonly: true })}</div></div>

      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Danh sách vé (${d.ve.length})</h2></div>
        <div class="card-body flush">${table([
          { label: 'Mã vé', align: 'num', key: 'MaVe' },
          { label: 'Hành khách', render: (r) => `<a href="#/q/3/${r.MaHK}">${esc(r.HoTen)}</a><span class="fk-sub">${esc(r.SoGiayTo)}</span>` },
          { label: 'Hạng', render: (r) => esc(label(r.HangGhe)) },
          { label: 'Ghế', render: (r) => `<b>${esc(r.SoGhe)}</b>` },
          { label: 'Giá vé', align: 'num', render: (r) => money(r.GiaVe) },
          { label: 'Đặt lúc', render: (r) => esc(dt(r.NgayDat)) },
          { label: 'Hành lý', align: 'num', render: (r) => `${r.SoKienHL} kiện${r.PhiHanhLy ? ` · <span style="color:var(--warn)">${money(r.PhiHanhLy)}</span>` : ''}` },
          { label: 'Trạng thái', render: (r) => badge(r.TrangThai) },
        ], d.ve, { empty: 'Chưa bán vé nào' })}</div></div>`;

    const pc = view.querySelector('#pc');
    if (pc) {
    const syncVT = () => { const o = pc.MaNV.selectedOptions[0]; if (o) pc.VaiTro.value = o.dataset.vt; };
    pc.MaNV.onchange = syncVT; syncVT();
    pc.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api('/tables/PHANCONG', { method: 'POST', body: { MaChuyen: c.MaChuyen, MaNV: pc.MaNV.value, VaiTro: pc.VaiTro.value } });
        toast('Đã phân công nhân viên', 'ok'); reload();
      } catch (ex) { toast(ex.message, 'error'); }
    };
    }
    view.querySelectorAll('[data-rm]').forEach((b) => {
      b.onclick = async () => {
        if (!(await confirmBox('Gỡ nhân viên này khỏi tổ phục vụ chuyến?', 'Gỡ'))) return;
        try {
          await api('/tables/PHANCONG', { method: 'DELETE', body: { pk: { MaChuyen: c.MaChuyen, MaNV: Number(b.dataset.rm) } } });
          toast('Đã gỡ phân công', 'ok'); reload();
        } catch (ex) { toast(ex.message, 'error'); }
      };
    });
    if (doiTrangThai) view.querySelector('#doiTT').onclick = async () => {
      const tt = view.querySelector('#tt').value;
      if (tt === 'HUY' && c.TrangThai !== 'HUY' && !(await confirmBox('Hủy chuyến bay sẽ chuyển toàn bộ vé sang trạng thái Đã hủy. Tiếp tục?', 'Hủy chuyến'))) return;
      try {
        const nd = await api(`/chuyen/${c.MaChuyen}/trang-thai`, { method: 'POST', body: { TrangThai: tt } });
        toast(`Đã chuyển trạng thái: ${label(tt)}`, 'ok'); render(nd, nv);
      } catch (ex) { toast(ex.message, 'error'); view.querySelector('#tt').value = c.TrangThai; }
    };
  }

  async function reload() {
    clearOptionCache(); refreshCounts();
    render(await api(`/chuyen/${id}`), (await api('/tables/NHANVIEN?size=500&sort=HoTen')).rows);
  }
}
