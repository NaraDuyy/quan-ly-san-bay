import { api, esc, num, dt, date, monthLabel, badge, table, stackedBars, moneyShort, confirmBox, toast } from '../lib.js';
import { state, refreshCounts, canAction } from '../app.js';
import { clearOptionCache } from './data.js';

export const REVENUE_SERIES = [
  { key: 'TienVe', label: 'Tiền vé', color: 'var(--series-1)' },
  { key: 'PhiHanhLy', label: 'Phí hành lý quá cước', color: 'var(--series-2)' },
  { key: 'TienDichVu', label: 'Dịch vụ nhà ga', color: 'var(--series-3)' },
];

export default async function overview(view, m, stale) {
  const d = await api('/overview');
  if (stale()) return;
  const thangNay = d.doanhThu.find((r) => r.Thang === d.thang) || { TongDoanhThu: 0 };
  const thangTruoc = d.doanhThu.filter((r) => r.Thang < d.thang).at(-1);
  const k = d.kpi;

  view.innerHTML = `
    <div class="page-head"><div>
      <h1>Tổng quan khai thác</h1>
      <p>Cảng hàng không quốc tế Nội Bài (HAN) — số liệu tính đến ${esc(dt(d.now))}.</p>
    </div><div class="row">
      ${canAction('reset') ? `<select id="scale" title="Quy mô dữ liệu mẫu"><option value="kehoach">Đúng kế hoạch mục 9</option><option value="lon">Quy mô lớn (~9.000 vé)</option></select>
      <button class="btn" id="reset">↻ Nạp lại dữ liệu mẫu</button>` : ''}
      <a class="btn primary" href="#/ban-ve">✚ Bán vé</a></div></div>

    <div class="kpis">
      <div class="card kpi"><div class="label">Chuyến bay hôm nay</div><div class="value">${k.chuyenHomNay}</div><div class="sub">${k.chuyenSapToi} chuyến sắp khởi hành</div></div>
      <div class="card kpi"><div class="label">Vé đã bán tháng ${esc(monthLabel(d.thang))}</div><div class="value">${num(k.veThang)}</div><div class="sub">${k.chuyenHuyThang} chuyến hủy trong tháng</div></div>
      <div class="card kpi"><div class="label">Doanh thu tháng này</div><div class="value">${moneyShort(thangNay.TongDoanhThu)}</div>
        <div class="sub">${thangTruoc ? `Tháng trước: ${moneyShort(thangTruoc.TongDoanhThu)}` : '&nbsp;'}</div></div>
      <div class="card kpi ${k.mbQuaHan ? 'alert' : ''}"><div class="label">Tàu bay quá hạn bảo dưỡng</div><div class="value">${k.mbQuaHan}</div><div class="sub">${k.mbSapHan} tàu tới hạn trong 30 ngày</div></div>
    </div>

    <div class="grid cols-main">
      <div class="card"><div class="card-head"><div><h2>Doanh thu theo tháng</h2><p>Theo G8: tiền vé chuyến không hủy + phí quá cước + dịch vụ nhà ga</p></div>
        <span class="spacer"></span><a class="btn sm" href="#/q/4">Chi tiết Q4 →</a></div>
        <div class="card-body" id="revChart"></div></div>
      <div class="card"><div class="card-head"><div><h2>Cảnh báo bảo dưỡng</h2><p>Tàu bay quá 180 ngày không được gán chuyến mới (R6)</p></div></div>
        <div class="card-body flush">${table([
          { label: 'Tàu bay', render: (r) => `<b>${esc(r.SoHieuMB)}</b><span class="fk-sub">${esc(r.TenHang)} · ${esc(r.Model)}</span>` },
          { label: 'Tới hạn', render: (r) => esc(date(r.NgayBaoDuongTiepTheo)) },
          { label: 'Tình trạng', render: (r) => badge(r.TinhTrang, `Quá ${-r.SoNgayConLai} ngày`) },
        ], d.quaHan, { empty: 'Không có tàu bay quá hạn' })}
        <div style="padding:10px 16px"><a href="#/q/5">Xem toàn bộ lịch bảo dưỡng (Q5) →</a></div></div></div>
    </div>

    <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Chuyến sắp khởi hành</h2><p>Cột tổ phục vụ kiểm tra R9: ≥ 1 điều phối mặt đất và ≥ 2 làm thủ tục</p></div>
      <span class="spacer"></span><a class="btn sm" href="#/du-lieu/CHUYENBAY">Tất cả chuyến bay →</a></div>
      <div class="card-body flush">${table([
        { label: 'Chuyến', render: (r) => `<a href="#/chuyen/${r.MaChuyen}"><b>${esc(r.SoHieuChuyen)}</b></a>` },
        { label: 'Đường bay', render: (r) => `${esc(r.SanBayDi)} → ${esc(r.SanBayDen)}` },
        { label: 'Khởi hành', render: (r) => esc(dt(r.GioKHKeHoach)) },
        { label: 'Cổng', key: 'TenCong' },
        { label: 'Trạng thái', render: (r) => badge(r.TrangThai) },
        { label: 'Vé / ghế', align: 'num', render: (r) => `${r.SoVe} / ${r.SoGhe}` },
        { label: 'Tổ phục vụ (R9)', render: (r) => (r.DieuPhoi >= 1 && r.ThuTuc >= 2
          ? badge('CON_HAN', `Đủ · ${r.DieuPhoi} ĐP, ${r.ThuTuc} TT`) : badge('QUA_HAN', `Thiếu · ${r.DieuPhoi} ĐP, ${r.ThuTuc} TT`)) },
      ], d.sapToi, { empty: 'Không có chuyến sắp tới' })}</div></div>

    <div class="card" style="margin-top:16px"><div class="card-head"><div><h2>Khối lượng dữ liệu</h2><p>So sánh với kế hoạch dữ liệu mẫu (mục 9 của báo cáo)</p></div></div>
      <div class="card-body flush">${table([
        { label: 'Bảng', render: (r) => `<a href="#/du-lieu/${r.name}"><code>${r.name}</code></a>` },
        { label: 'Mô tả', render: (r) => esc(state.meta?.tables[r.name]?.desc || '') },
        { label: 'Kế hoạch', align: 'num', key: 'plan' },
        { label: 'Thực tế', align: 'num', key: 'count' },
      ], Object.keys(d.counts).map((name) => ({ name, plan: d.plan[name], count: d.counts[name] })))}</div></div>`;

  stackedBars(view.querySelector('#revChart'), d.doanhThu.map((r) => ({ x: r.Thang, ...r })), REVENUE_SERIES, { xLabel: monthLabel });

  const resetBtn = view.querySelector('#reset');
  if (resetBtn) resetBtn.onclick = async () => {
    if (!(await confirmBox('Toàn bộ dữ liệu hiện tại sẽ bị xóa và thay bằng dữ liệu mẫu mới (neo theo ngày hôm nay). Tiếp tục?', 'Nạp lại'))) return;
    try {
      await api('/reset', { method: 'POST', body: { scale: view.querySelector('#scale').value } });
      clearOptionCache();
      await refreshCounts();
      toast('Đã nạp lại dữ liệu mẫu', 'ok');
      overview(view, m, stale);
    } catch (e) { toast(e.message, 'error'); }
  };
}
