// Trang truy vấn Q1–Q5 (mục 2.3 của báo cáo).
import { api, esc, money, num, dt, date, monthLabel, badge, table, fillBar, sqlBlock, stackedBars, toast, label, VAI_TRO_LABEL, pad } from '../lib.js';
import { REVENUE_SERIES } from './overview.js';

const INFO = {
  1: ['Q1 · Tỉ lệ lấp đầy', 'Liệt kê các chuyến bay trong một khoảng ngày cùng số vé đã bán và tỉ lệ lấp đầy (số vé / số ghế), sắp xếp giảm dần theo tỉ lệ lấp đầy.'],
  2: ['Q2 · Lương tháng', 'Lương tháng = lương cơ bản theo (vị trí, bậc) + tổng thưởng các chuyến đã phục vụ trong tháng theo vai trò (G6). Tháng hiện tại được tính đến thời điểm hiện tại.'],
  3: ['Q3 · Hồ sơ hành khách', 'Thông tin một hành khách cùng toàn bộ lịch sử: các chuyến đã bay, hành lý từng chuyến, các dịch vụ đã sử dụng và tổng chi tiêu từ trước đến nay.'],
  4: ['Q4 · Doanh thu', 'Doanh thu sân bay mỗi tháng theo ba nguồn: tiền vé, phí hành lý quá cước, tiền dịch vụ (G8); kèm doanh thu tiền vé theo từng hãng hàng không.'],
  5: ['Q5 · Bảo dưỡng tàu bay', 'Các tàu bay cùng ngày bảo dưỡng tiếp theo (ngày bảo dưỡng cuối + 180 ngày); tàu bay quá hạn được tách vào danh sách riêng.'],
};

const PAGES = { 1: q1, 2: q2, 3: q3, 4: q4, 5: q5 };

export default async function queries(view, m, stale) {
  const n = Number(m[1]);
  view.innerHTML = `
    <div class="page-head"><div><h1>${INFO[n][0]}</h1><p>${INFO[n][1]}</p></div></div>
    <nav class="tabs">${[1, 2, 3, 4, 5].map((i) => `<a class="tab ${i === n ? 'active' : ''}" href="#/q/${i}">${INFO[i][0]}</a>`).join('')}</nav>
    <div id="qbody"><div class="loading">Đang tải…</div></div>`;
  // #/q/3/<MaHK> mở thẳng hồ sơ một hành khách
  await PAGES[n](view.querySelector('#qbody'), stale, n === 3 && m[2] ? Number(m[2]) : undefined);
}

// ------------------------------------------------------------------ Q1
async function q1(el, stale, params = {}) {
  const d = await api(`/queries/q1?${new URLSearchParams(params)}`);
  if (stale()) return;
  const rows = d.rows;
  const tb = rows.reduce((s, r) => s + r.SoVeDaBan, 0);
  const tg = rows.filter((r) => r.TrangThai !== 'HUY').reduce((s, r) => s + r.SoGhe, 0);
  el.innerHTML = `<div class="card">
    <div class="card-head"><form class="filters" id="f">
      <div class="field"><label>Từ ngày</label><input type="date" name="tuNgay" value="${d.params.tuNgay}"></div>
      <div class="field"><label>Đến ngày</label><input type="date" name="denNgay" value="${d.params.denNgay}"></div>
      <button class="btn primary">Thực hiện</button></form>
      <span class="spacer"></span><span class="muted small">${rows.length} chuyến · ${num(tb)} vé · lấp đầy bình quân ${num(tg ? 100 * tb / tg : 0, 1)}%</span></div>
    <div class="card-body flush">${table([
      { label: 'Chuyến', render: (r) => `<a href="#/chuyen/${r.MaChuyen}"><b>${esc(r.SoHieuChuyen)}</b></a>` },
      { label: 'Đường bay', key: 'DuongBay' },
      { label: 'Khởi hành', render: (r) => esc(dt(r.GioKHKeHoach)) },
      { label: 'Trạng thái', render: (r) => badge(r.TrangThai) },
      { label: 'Tàu bay', key: 'SoHieuMB' },
      { label: 'Số ghế', align: 'num', key: 'SoGhe' },
      { label: 'Vé đã bán', align: 'num', key: 'SoVeDaBan' },
      { label: 'Tỉ lệ lấp đầy', render: (r) => fillBar(r.TiLeLapDay) },
    ], rows, { empty: 'Không có chuyến bay trong khoảng ngày này' })}</div></div>
    ${sqlBlock(d.sql)}`;
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); q1(el, stale, Object.fromEntries(new FormData(e.target))); };
}

// ------------------------------------------------------------------ Q2
async function q2(el, stale, params = {}) {
  const d = await api(`/queries/q2?${new URLSearchParams(params)}`);
  if (stale()) return;
  const chiTiet = {};
  for (const c of d.chiTiet) (chiTiet[c.MaNV] = chiTiet[c.MaNV] || []).push(c);
  const sum = (k) => d.rows.reduce((s, r) => s + r[k], 0);
  el.innerHTML = `<div class="card">
    <div class="card-head"><form class="filters" id="f">
      <div class="field"><label>Tháng</label><input type="month" name="thang" value="${d.params.thang}"></div>
      <button class="btn primary">Tính lương</button></form>
      <span class="spacer"></span><span class="muted small">Tổng quỹ lương tháng ${esc(monthLabel(d.params.thang))}: <b>${money(sum('LuongThang'))}</b></span></div>
    <div class="card-body flush">${table([
      { label: 'Mã NV', align: 'num', key: 'MaNV' },
      { label: 'Họ tên', render: (r) => `<b>${esc(r.HoTen)}</b>` },
      { label: 'Vị trí', render: (r) => esc(label(r.ViTri)) },
      { label: 'Bậc', align: 'num', key: 'Bac' },
      { label: 'Lương cơ bản', align: 'num', fmt: money, key: 'LuongCoBan' },
      { label: 'Số chuyến', align: 'num', key: 'SoChuyen' },
      { label: 'Chi tiết thưởng', render: (r) => (chiTiet[r.MaNV] || []).map((c) => `<span class="small">${esc(VAI_TRO_LABEL[c.VaiTro])} × ${c.SoChuyen}</span>`).join('<br>') || '<span class="muted small">—</span>' },
      { label: 'Tổng thưởng', align: 'num', fmt: money, key: 'TongThuong' },
      { label: 'Lương tháng', align: 'num', render: (r) => `<b>${money(r.LuongThang)}</b>` },
    ], d.rows, { foot: { HoTen: 'Tổng cộng', LuongCoBan: money(sum('LuongCoBan')), SoChuyen: sum('SoChuyen'), TongThuong: money(sum('TongThuong')), LuongThang: money(sum('LuongThang')) } })}</div></div>
    ${sqlBlock(d.sql)}`;
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); q2(el, stale, Object.fromEntries(new FormData(e.target))); };
}

// ------------------------------------------------------------------ Q3
async function q3(el, stale, maHK = null) {
  // Không chọn hành khách -> máy chủ trả về hồ sơ của khách bay nhiều nhất
  const [ds, d] = await Promise.all([api('/tables/HANHKHACH/options'), api(`/queries/q3${maHK ? `?maHK=${maHK}` : ''}`)]);
  if (stale()) return;
  maHK = d.params.maHK;
  const hk = d.info;
  el.innerHTML = `<div class="card" style="margin-bottom:16px"><div class="card-head"><form class="filters" id="f">
      <div class="field" style="min-width:320px"><label>Hành khách</label>
        <select name="maHK">${ds.map((o) => `<option value="${o.value}" ${o.value === maHK ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></div>
      <button class="btn primary">Xem hồ sơ</button></form></div></div>
    ${hk ? `
    <div class="grid cols-main">
      <div class="card"><div class="card-head"><h2>${esc(hk.HoTen)}</h2><span class="tag">MaHK ${hk.MaHK}</span></div>
        <div class="card-body"><dl class="dl">
          <dt>Số giấy tờ</dt><dd class="mono">${esc(hk.SoGiayTo)}</dd><dt>Ngày sinh</dt><dd>${esc(date(hk.NgaySinh))}</dd>
          <dt>Quốc tịch</dt><dd>${esc(hk.QuocTich)}</dd><dt>Điện thoại</dt><dd>${esc(hk.Sdt || '—')}</dd><dt>Email</dt><dd>${esc(hk.Email || '—')}</dd>
        </dl></div></div>
      <div class="card"><div class="card-head"><h2>Tổng chi tiêu</h2></div><div class="card-body">
        <div class="summary-line"><span>Tiền vé</span><b>${money(d.tong.TienVe)}</b></div>
        <div class="summary-line"><span>Phí hành lý quá cước</span><b>${money(d.tong.PhiHanhLy)}</b></div>
        <div class="summary-line"><span>Dịch vụ nhà ga</span><b>${money(d.tong.TienDichVu)}</b></div>
        <div class="summary-line total"><span>Tổng cộng</span><span>${money(d.tong.TongChiTieu)}</span></div>
        <p class="muted small" style="margin:8px 0 0">Không tính vé đã hủy và vé thuộc chuyến bị hủy.</p></div></div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-head"><h2>Các chuyến bay (${d.chuyen.length})</h2></div><div class="card-body flush">${table([
      { label: 'Mã vé', align: 'num', key: 'MaVe' },
      { label: 'Chuyến', key: 'SoHieuChuyen' }, { label: 'Đường bay', key: 'DuongBay' },
      { label: 'Khởi hành', render: (r) => esc(dt(r.GioKHKeHoach)) },
      { label: 'Chuyến bay', render: (r) => badge(r.TrangThaiChuyen) },
      { label: 'Hạng / ghế', render: (r) => `${esc(label(r.HangGhe))} · <b>${esc(r.SoGhe)}</b>` },
      { label: 'Giá vé', align: 'num', fmt: money, key: 'GiaVe' },
      { label: 'Vé', render: (r) => badge(r.TrangThaiVe) },
      { label: 'Hành lý', align: 'num', render: (r) => `${r.SoKienHL} kiện` },
      { label: 'Phí HL', align: 'num', fmt: money, key: 'PhiHanhLy' },
    ], d.chuyen, { empty: 'Chưa có chuyến bay' })}</div></div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><div class="card-head"><h2>Hành lý từng chuyến (${d.hanhLy.length})</h2></div><div class="card-body flush">${table([
        { label: 'Vé', align: 'num', key: 'MaVe' }, { label: 'Chuyến', key: 'SoHieuChuyen' },
        { label: 'Loại', render: (r) => esc(label(r.LoaiHL)) },
        { label: 'Cân nặng', align: 'num', render: (r) => `${num(r.CanNangKg, 1)} kg` },
        { label: 'Phí quá cước', align: 'num', fmt: money, key: 'PhiQuaCan' },
      ], d.hanhLy, { empty: 'Không có hành lý' })}</div></div>
      <div class="card"><div class="card-head"><h2>Dịch vụ đã sử dụng (${d.dichVu.length})</h2></div><div class="card-body flush">${table([
        { label: 'Thời gian', render: (r) => esc(dt(r.ThoiGian)) }, { label: 'Dịch vụ', key: 'TenDV' },
        { label: 'SL', align: 'num', key: 'SoLuong' }, { label: 'Thành tiền', align: 'num', fmt: money, key: 'ThanhTien' },
      ], d.dichVu, { empty: 'Chưa sử dụng dịch vụ' })}</div></div>
    </div>
    ${sqlBlock(d.sql)}` : '<div class="card"><div class="empty">Không tìm thấy hành khách</div></div>'}`;
  el.querySelector('#f').onsubmit = (e) => { e.preventDefault(); q3(el, stale, Number(new FormData(e.target).get('maHK'))); };
}

// ------------------------------------------------------------------ Q4
async function q4(el, stale) {
  const d = await api('/queries/q4');
  if (stale()) return;
  const thang = d.rows.map((r) => r.Thang);
  const hang = [...new Map(d.theoHang.map((r) => [r.MaHang, r.TenHang])).entries()];
  const pivot = hang.map(([ma, ten]) => {
    const row = { MaHang: ma, TenHang: ten, Tong: 0, SoVe: 0 };
    for (const t of thang) {
      const x = d.theoHang.find((r) => r.MaHang === ma && r.Thang === t);
      row[t] = x?.TienVe || 0; row.Tong += row[t]; row.SoVe += x?.SoVe || 0;
    }
    return row;
  }).sort((a, b) => b.Tong - a.Tong);
  const sum = (k) => d.rows.reduce((s, r) => s + r[k], 0);
  el.innerHTML = `
    <div class="card"><div class="card-head"><div><h2>Doanh thu theo tháng và nguồn thu</h2><p>Di chuột lên cột để xem chi tiết</p></div></div>
      <div class="card-body" id="chart"></div>
      <div class="card-body flush">${table([
        { label: 'Tháng', render: (r) => `<b>${esc(monthLabel(r.Thang))}</b>` },
        { label: 'Tiền vé', align: 'num', fmt: money, key: 'TienVe' },
        { label: 'Phí hành lý quá cước', align: 'num', fmt: money, key: 'PhiHanhLy' },
        { label: 'Dịch vụ nhà ga', align: 'num', fmt: money, key: 'TienDichVu' },
        { label: 'Tổng doanh thu', align: 'num', render: (r) => `<b>${money(r.TongDoanhThu)}</b>` },
      ], d.rows, { foot: { Thang: 'Cộng', TienVe: money(sum('TienVe')), PhiHanhLy: money(sum('PhiHanhLy')), TienDichVu: money(sum('TienDichVu')), TongDoanhThu: money(sum('TongDoanhThu')) } })}</div></div>
    <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Doanh thu tiền vé theo hãng hàng không</h2><p>Hãng xác định qua tàu bay thực hiện chuyến (MAYBAY → HANGHANGKHONG)</p></div></div>
      <div class="card-body flush">${table([
        { label: 'Hãng', render: (r) => `<span class="tag">${esc(r.MaHang)}</span> ${esc(r.TenHang)}` },
        ...thang.map((t) => ({ label: monthLabel(t), align: 'num', render: (r) => money(r[t]) })),
        { label: 'Số vé', align: 'num', key: 'SoVe' },
        { label: 'Tổng', align: 'num', render: (r) => `<b>${money(r.Tong)}</b>` },
      ], pivot)}</div></div>
    ${sqlBlock(d.sql)}`;
  stackedBars(el.querySelector('#chart'), d.rows.map((r) => ({ x: r.Thang, ...r })), REVENUE_SERIES, { xLabel: monthLabel });
}

// ------------------------------------------------------------------ Q5
async function q5(el, stale) {
  const d = await api('/queries/q5');
  if (stale()) return;
  const cols = (actions) => [
    { label: 'Tàu bay', render: (r) => `<b>${esc(r.SoHieuMB)}</b><span class="fk-sub">${esc(r.TenHang)}</span>` },
    { label: 'Model', key: 'Model' }, { label: 'Số ghế', align: 'num', key: 'SoGhe' },
    { label: 'Bảo dưỡng cuối', render: (r) => esc(date(r.NgayBaoDuongCuoi)) },
    { label: 'Bảo dưỡng tiếp theo', render: (r) => `<b>${esc(date(r.NgayBaoDuongTiepTheo))}</b>` },
    { label: 'Còn lại', align: 'num', render: (r) => (r.SoNgayConLai < 0 ? `<span style="color:var(--bad)">quá ${-r.SoNgayConLai} ngày</span>` : `${r.SoNgayConLai} ngày`) },
    { label: 'Tình trạng', render: (r) => badge(r.TinhTrang) },
    { label: 'Chuyến sắp tới', align: 'num', key: 'SoChuyenSapToi' },
    ...(actions ? [{ label: '', align: 'actions', render: (r) => `<button class="btn sm" data-bd="${esc(r.SoHieuMB)}">Ghi nhận bảo dưỡng</button>` }] : []),
  ];
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px"><div class="card-head"><div><h2 style="color:var(--bad)">Tàu bay quá hạn bảo dưỡng (${d.quaHan.length})</h2>
      <p>Không được gán vào chuyến bay mới (R6). Ghi nhận bảo dưỡng sẽ cập nhật NgayBaoDuongCuoi = hôm nay.</p></div></div>
      <div class="card-body flush">${table(cols(true), d.quaHan, { empty: 'Không có tàu bay quá hạn' })}</div></div>
    <div class="card"><div class="card-head"><div><h2>Tàu bay còn hạn (${d.conHan.length})</h2><p>Sắp xếp theo ngày bảo dưỡng tiếp theo; "sắp tới hạn" = trong vòng 30 ngày</p></div></div>
      <div class="card-body flush">${table(cols(true), d.conHan)}</div></div>
    ${sqlBlock(d.sql)}`;
  el.querySelectorAll('[data-bd]').forEach((b) => {
    b.onclick = async () => {
      const t = new Date();
      try {
        await api(`/may-bay/${encodeURIComponent(b.dataset.bd)}/bao-duong`, { method: 'POST', body: { ngay: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` } });
        toast(`Đã ghi nhận bảo dưỡng tàu ${b.dataset.bd}`, 'ok');
        q5(el, stale);
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}
