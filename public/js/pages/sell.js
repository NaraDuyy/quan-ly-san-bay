// Nghiệp vụ bán vé kèm hành lý — toàn bộ chạy trong một transaction ở máy chủ (Phụ lục A.1).
import { api, esc, money, dt, label, seatMap, toast, fillBar } from '../lib.js';
import { refreshCounts } from '../app.js';
import { clearOptionCache } from './data.js';

// Phí quá cước G4 (giống server/rules.js) để hiển thị trước khi lưu
const phi = (loai, kg) => {
  const vuot = Number(kg) - 23;
  return loai === 'KY_GUI' && vuot > 0 ? Math.ceil(vuot - 1e-9) * 100000 : 0;
};

export default async function sell(view, m, stale) {
  const [chuyen, khach] = await Promise.all([api('/chuyen-mo-ban'), api('/tables/HANHKHACH/options')]);
  if (stale()) return;
  const s = { chuyen: null, chiTiet: null, ghe: null, bags: [{ LoaiHL: 'XACH_TAY', CanNangKg: 7 }], moi: false };

  view.innerHTML = `
    <div class="page-head"><div><h1>Bán vé</h1>
      <p>Chọn chuyến, ghế và hành khách. Vé và hành lý được ghi trong <b>một transaction</b>: nếu một kiện hành lý vi phạm (R7, R8) hoặc ghế đã bán (R3) thì toàn bộ bị hủy.</p></div></div>
    <div class="grid cols-main">
      <div class="stack">
        <div class="card"><div class="card-head"><div><h2>1. Chọn chuyến bay</h2><p>${chuyen.length} chuyến còn mở bán (chưa khởi hành, không hủy)</p></div></div>
          <div class="flight-list" id="flights">${chuyen.map((c) => `
            <button type="button" class="flight-item" data-id="${c.MaChuyen}">
              <span><b>${esc(c.SoHieuChuyen)}</b><span class="fk-sub">${esc(dt(c.GioKHKeHoach))}</span></span>
              <span><span class="route">${esc(c.SanBayDi)} → ${esc(c.SanBayDen)}</span><span class="fk-sub">Từ ${money(c.GiaVeCoBan)}</span></span>
              <span style="width:140px">${fillBar(100 * c.SoVe / c.SoGhe)}</span>
            </button>`).join('') || '<div class="empty">Không có chuyến nào đang mở bán</div>'}</div></div>
        <div class="card"><div class="card-head"><div><h2>2. Chọn ghế</h2><p id="seatHint">Chọn chuyến bay trước</p></div></div>
          <div class="card-body" id="seats"></div></div>
      </div>
      <form class="card" id="form" novalidate style="align-self:start">
        <div class="card-head"><h2>3. Hành khách & hành lý</h2></div>
        <div class="card-body stack">
          <div class="row"><label class="row small"><input type="radio" name="kieu" value="cu" checked> Khách đã có</label>
            <label class="row small"><input type="radio" name="kieu" value="moi"> Khách mới</label></div>
          <div id="khachCu" class="field"><label>Hành khách</label>
            <select name="MaHK">${khach.map((k) => `<option value="${k.value}">${esc(k.label)}</option>`).join('')}</select></div>
          <div id="khachMoi" class="form-grid" hidden>
            <div class="field"><label>Họ tên *</label><input name="HoTen" maxlength="80"></div>
            <div class="field"><label>Số giấy tờ *</label><input name="SoGiayTo" maxlength="15" placeholder="CCCD / hộ chiếu"></div>
            <div class="field"><label>Ngày sinh *</label><input name="NgaySinh" type="date"></div>
            <div class="field"><label>Quốc tịch</label><input name="QuocTich" value="Việt Nam"></div>
            <div class="field"><label>Điện thoại</label><input name="Sdt" maxlength="15"></div>
            <div class="field"><label>Email</label><input name="Email" type="email"></div>
          </div>
          <div class="form-grid">
            <div class="field"><label>Ghế đã chọn</label><input id="gheChon" readonly placeholder="Chọn trên sơ đồ"></div>
            <div class="field"><label>Giá vé (VND)</label><input name="GiaVe" type="number" step="1000" min="1"></div>
          </div>
          <div><div class="row" style="margin-bottom:8px"><h3>Hành lý</h3><span class="spacer"></span>
            <span class="muted small">Miễn cước 7 kg xách tay, 23 kg/kiện ký gửi · tối đa 32 kg/kiện</span></div>
            <div id="bags"></div><button type="button" class="btn sm" id="addBag">+ Thêm kiện</button></div>
          <div id="summary"></div>
          <div class="form-error" id="err" hidden></div>
          <button class="btn primary" style="justify-content:center" id="submit">Xác nhận bán vé</button>
        </div>
      </form>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  const form = $('#form');

  function giaGoiY() {
    if (!s.chuyen || !s.ghe) return '';
    return s.ghe.biz ? Math.round(s.chuyen.GiaVeCoBan * 2.5) : s.chuyen.GiaVeCoBan;
  }

  function renderSummary() {
    const gia = Number(form.GiaVe.value) || 0;
    const tongPhi = s.bags.reduce((a, b) => a + phi(b.LoaiHL, b.CanNangKg), 0);
    $('#summary').innerHTML = `
      <div class="summary-line"><span>Vé ${s.ghe ? `ghế ${esc(s.ghe.id)} · ${label(s.ghe.biz ? 'THUONG_GIA' : 'PHO_THONG')}` : ''}</span><b>${money(gia)}</b></div>
      <div class="summary-line"><span>Phí hành lý quá cước (G4)</span><b>${money(tongPhi)}</b></div>
      <div class="summary-line total"><span>Tổng thanh toán</span><span>${money(gia + tongPhi)}</span></div>`;
  }

  function renderBags() {
    $('#bags').innerHTML = s.bags.map((b, i) => `<div class="bag-row">
      <select data-i="${i}" data-k="LoaiHL"><option value="XACH_TAY" ${b.LoaiHL === 'XACH_TAY' ? 'selected' : ''}>Xách tay</option>
        <option value="KY_GUI" ${b.LoaiHL === 'KY_GUI' ? 'selected' : ''}>Ký gửi</option></select>
      <input type="number" step="0.1" min="0.1" data-i="${i}" data-k="CanNangKg" value="${b.CanNangKg}" aria-label="Cân nặng (kg)">
      <span class="num small">${phi(b.LoaiHL, b.CanNangKg) ? `<b style="color:var(--warn)">+${money(phi(b.LoaiHL, b.CanNangKg))}</b>` : 'Miễn cước'}</span>
      <button type="button" class="btn sm link danger" data-rm="${i}">Bỏ</button></div>`).join('') || '<p class="muted small">Không có hành lý</p>';
    $('#bags').querySelectorAll('[data-k]').forEach((x) => {
      x.oninput = () => { s.bags[x.dataset.i][x.dataset.k] = x.value; if (x.tagName === 'SELECT') renderBags(); else { renderSummary(); x.parentElement.children[2].innerHTML = phi(s.bags[x.dataset.i].LoaiHL, x.value) ? `<b style="color:var(--warn)">+${money(phi(s.bags[x.dataset.i].LoaiHL, x.value))}</b>` : 'Miễn cước'; } };
    });
    $('#bags').querySelectorAll('[data-rm]').forEach((x) => { x.onclick = () => { s.bags.splice(x.dataset.rm, 1); renderBags(); }; });
    renderSummary();
  }

  async function chonChuyen(id) {
    s.chuyen = chuyen.find((c) => c.MaChuyen === id);
    s.ghe = null; $('#gheChon').value = ''; form.GiaVe.value = '';
    view.querySelectorAll('.flight-item').forEach((b) => b.classList.toggle('active', Number(b.dataset.id) === id));
    s.chiTiet = await api(`/chuyen/${id}`);
    const g = s.chiTiet.ghe;
    $('#seatHint').textContent = `${s.chiTiet.chuyen.SoHieuMB} · ${s.chiTiet.chuyen.Model} · còn ${g.thuongGia.length + g.phoThong.length - g.daBan.length} / ${g.thuongGia.length + g.phoThong.length} ghế trống`;
    renderSeats();
    renderSummary();
  }

  function renderSeats() {
    $('#seats').innerHTML = seatMap(s.chiTiet.ghe, { selected: s.ghe?.id });
    $('#seats').querySelectorAll('.seat[data-seat]').forEach((b) => {
      b.onclick = () => {
        s.ghe = { id: b.dataset.seat, biz: b.dataset.biz === '1' };
        $('#gheChon').value = `${s.ghe.id} (${label(s.ghe.biz ? 'THUONG_GIA' : 'PHO_THONG')})`;
        form.GiaVe.value = giaGoiY();
        renderSeats(); renderSummary();
      };
    });
  }

  view.querySelectorAll('.flight-item').forEach((b) => { b.onclick = () => chonChuyen(Number(b.dataset.id)); });
  form.querySelectorAll('[name=kieu]').forEach((r) => {
    r.onchange = () => { s.moi = r.value === 'moi' && r.checked; $('#khachMoi').hidden = !s.moi; $('#khachCu').hidden = s.moi; };
  });
  form.GiaVe.oninput = renderSummary;
  $('#addBag').onclick = () => { s.bags.push({ LoaiHL: 'KY_GUI', CanNangKg: 20 }); renderBags(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $('#err'); err.hidden = true;
    const f = Object.fromEntries(new FormData(form));
    const body = {
      MaChuyen: s.chuyen?.MaChuyen, SoGhe: s.ghe?.id, HangGhe: s.ghe?.biz ? 'THUONG_GIA' : 'PHO_THONG', GiaVe: f.GiaVe,
      HanhLy: s.bags,
      ...(s.moi ? { KhachMoi: { HoTen: f.HoTen, SoGiayTo: f.SoGiayTo, NgaySinh: f.NgaySinh, QuocTich: f.QuocTich, Sdt: f.Sdt, Email: f.Email } } : { MaHK: f.MaHK }),
    };
    $('#submit').disabled = true;
    try {
      const r = await api('/ban-ve', { method: 'POST', body });
      toast(`Đã bán vé #${r.maVe} — tổng ${money(r.tongTien)}`, 'ok');
      s.chuyen.SoVe++;
      clearOptionCache(); refreshCounts();
      const keepId = s.chuyen.MaChuyen;
      s.bags = [{ LoaiHL: 'XACH_TAY', CanNangKg: 7 }]; renderBags();
      await chonChuyen(keepId);
      view.querySelector(`.flight-item[data-id="${keepId}"] .fill`).outerHTML = fillBar(100 * s.chuyen.SoVe / s.chuyen.SoGhe);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
    } finally { $('#submit').disabled = false; }
  };

  renderBags();
  if (chuyen.length) chonChuyen(chuyen[0].MaChuyen);
}

