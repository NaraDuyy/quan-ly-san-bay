// Giả định G1–G8 và các ràng buộc cài ở tầng ứng dụng (R9, tính phí).

const G = {
  QUAY_DAU_PHUT: 120,        // G1
  CHU_KY_BAO_DUONG: 180,     // G2
  MIEN_CUOC_XACH_TAY: 7,     // G3
  MIEN_CUOC_KY_GUI: 23,      // G3
  TRAN_KG: 32,               // G3
  PHI_MOI_KG: 100000,        // G4
  MAX_XACH_TAY: 1,           // G5
  MAX_KY_GUI: 3,             // G5
  KHOANG_CACH_CONG_PHUT: 60, // G7
};

// G4: phí quá cước chỉ tính cho kiện ký gửi; phần lẻ của 1 kg được làm tròn lên 1 kg.
function phiQuaCan(loaiHL, canNangKg) {
  if (loaiHL !== 'KY_GUI') return 0;
  const vuot = Number(canNangKg) - G.MIEN_CUOC_KY_GUI;
  return vuot > 0 ? Math.ceil(vuot - 1e-9) * G.PHI_MOI_KG : 0;
}

// R9: trước giờ khởi hành mỗi chuyến cần ≥ 1 điều phối mặt đất và ≥ 2 làm thủ tục.
// Kiểm tra khi chuyển TrangThai sang LAM_THU_TUC (hoặc các trạng thái sau đó).
const TRANG_THAI_CAN_TO_PHUC_VU = ['LAM_THU_TUC', 'DA_CAT_CANH', 'DA_HA_CANH', 'TRE'];

function kiemTraR9(db, maChuyen) {
  const r = db.prepare(`
    SELECT SUM(VaiTro = 'DIEU_PHOI_MAT_DAT') AS dieuPhoi,
           SUM(VaiTro = 'LAM_THU_TUC')       AS thuTuc
    FROM PHANCONG WHERE MaChuyen = ?`).get(maChuyen);
  const dieuPhoi = r.dieuPhoi || 0;
  const thuTuc = r.thuTuc || 0;
  if (dieuPhoi < 1 || thuTuc < 2) {
    return `R9: Chuyến cần tối thiểu 1 điều phối mặt đất và 2 nhân viên làm thủ tục ` +
      `(hiện có ${dieuPhoi} điều phối, ${thuTuc} làm thủ tục)`;
  }
  return null;
}

// Sơ đồ ghế quy ước: các hàng đầu là thương gia (4 ghế/hàng A C D F), còn lại phổ thông (6 ghế/hàng A–F).
function soDoGhe(soGhe) {
  const soHangTG = soGhe >= 250 ? 6 : 3;
  const thuongGia = []; const phoThong = [];
  for (let h = 1; h <= soHangTG && thuongGia.length < soGhe; h++)
    for (const x of 'ACDF') if (thuongGia.length < soGhe) thuongGia.push(`${h}${x}`);
  for (let h = soHangTG + 1; thuongGia.length + phoThong.length < soGhe; h++)
    for (const x of 'ABCDEF') if (thuongGia.length + phoThong.length < soGhe) phoThong.push(`${h}${x}`);
  return { soHangTG, thuongGia, phoThong };
}

// Định dạng thời gian cục bộ 'YYYY-MM-DD HH:MM:SS' (khớp với datetime('now','localtime')).
function fmtDateTime(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const fmtDate = (d) => fmtDateTime(d).slice(0, 10);

module.exports = { G, phiQuaCan, kiemTraR9, TRANG_THAI_CAN_TO_PHUC_VU, soDoGhe, fmtDateTime, fmtDate };
