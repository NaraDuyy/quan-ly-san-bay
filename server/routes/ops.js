// Nghiệp vụ: tổng quan, chi tiết chuyến, bán vé kèm hành lý (transaction), đổi trạng thái (R9),
// ghi nhận bảo dưỡng, cùng các truy vấn Q1–Q5.
const express = require('express');
const { tx } = require('../db');
const { HttpError } = require('./crud');
const { TABLES, PLAN } = require('../meta');
const Q = require('../queries');
const { reseed, SCALES } = require('../seed');
const { G, phiQuaCan, kiemTraR9, TRANG_THAI_CAN_TO_PHUC_VU, soDoGhe, fmtDateTime, fmtDate } = require('../rules');

module.exports = function opsRouter(db) {
  const r = express.Router();

  // ------------------------------------------------------------ tổng quan
  r.get('/overview', (req, res) => {
    const now = new Date();
    const $now = fmtDateTime(now);
    const thang = fmtDate(now).slice(0, 7);
    const counts = {};
    for (const name of Object.keys(TABLES)) counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
    const doanhThu = Q.q4(db).rows;
    const kpi = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM CHUYENBAY WHERE NgayBay = date($now)) AS chuyenHomNay,
        (SELECT COUNT(*) FROM CHUYENBAY WHERE GioKHKeHoach > $now AND TrangThai <> 'HUY') AS chuyenSapToi,
        (SELECT COUNT(*) FROM CHUYENBAY WHERE strftime('%Y-%m', NgayBay) = $thang AND TrangThai = 'HUY') AS chuyenHuyThang,
        (SELECT COUNT(*) FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
           WHERE strftime('%Y-%m', c.NgayBay) = $thang AND v.TrangThai <> 'DA_HUY') AS veThang,
        (SELECT COUNT(*) FROM MAYBAY WHERE date(NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days') < date($now)) AS mbQuaHan,
        (SELECT COUNT(*) FROM MAYBAY WHERE date(NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days') BETWEEN date($now) AND date($now, '+30 days')) AS mbSapHan`)
      .get({ $now, $thang: thang });
    const sapToi = db.prepare(`
      SELECT c.MaChuyen, c.SoHieuChuyen, t.SanBayDi, t.SanBayDen, c.GioKHKeHoach, c.TrangThai, cg.TenCong, mb.SoGhe,
        (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY') AS SoVe,
        (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'DIEU_PHOI_MAT_DAT') AS DieuPhoi,
        (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'LAM_THU_TUC') AS ThuTuc
      FROM CHUYENBAY c JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
      LEFT JOIN CONG cg ON cg.MaCong = c.MaCong
      WHERE c.GioKHKeHoach > $now ORDER BY c.GioKHKeHoach LIMIT 8`).all({ $now });
    res.json({ now: $now, thang, counts, plan: PLAN, kpi, doanhThu, sapToi, quaHan: Q.q5(db).quaHan });
  });

  // ------------------------------------------------------------ Q1–Q5
  r.get('/queries/q1', (req, res) => res.json(Q.q1(db, req.query)));
  r.get('/queries/q2', (req, res) => res.json(Q.q2(db, req.query)));
  r.get('/queries/q3', (req, res) => res.json(Q.q3(db, req.query)));
  r.get('/queries/q4', (req, res) => res.json(Q.q4(db, req.query)));
  r.get('/queries/q5', (req, res) => res.json(Q.q5(db, req.query)));

  // ------------------------------------------------------------ chuyến bay
  function chiTietChuyen(maChuyen) {
    const c = db.prepare(`
      SELECT c.*, t.SanBayDi, t.SanBayDen, t.ThoiGianBayPhut, t.KhoangCachKm,
             sd.ThanhPho AS ThanhPhoDi, sn.ThanhPho AS ThanhPhoDen,
             mb.Model, mb.SoGhe, mb.MaHang, h.TenHang, cg.TenCong, cg.KhuVuc
      FROM CHUYENBAY c
      JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen
      JOIN SANBAY sd ON sd.MaSanBay = t.SanBayDi JOIN SANBAY sn ON sn.MaSanBay = t.SanBayDen
      JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
      LEFT JOIN CONG cg ON cg.MaCong = c.MaCong
      WHERE c.MaChuyen = ?`).get(maChuyen);
    if (!c) throw new HttpError(404, 'Không tìm thấy chuyến bay');
    const ve = db.prepare(`
      SELECT v.*, hk.HoTen, hk.SoGiayTo,
        (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS SoKienHL,
        (SELECT COALESCE(SUM(PhiQuaCan), 0) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS PhiHanhLy
      FROM VE v JOIN HANHKHACH hk ON hk.MaHK = v.MaHK
      WHERE v.MaChuyen = ? ORDER BY v.MaVe`).all(maChuyen);
    const toPhucVu = db.prepare(`
      SELECT p.MaNV, p.VaiTro, nv.HoTen, nv.ViTri, nv.Sdt, tl.MucThuongChuyen
      FROM PHANCONG p JOIN NHANVIEN nv ON nv.MaNV = p.MaNV JOIN THULAO tl ON tl.VaiTro = p.VaiTro
      WHERE p.MaChuyen = ? ORDER BY p.VaiTro, nv.HoTen`).all(maChuyen);
    const soDo = soDoGhe(c.SoGhe);
    return {
      chuyen: c, ve, toPhucVu, r9: kiemTraR9(db, maChuyen),
      ghe: { ...soDo, daBan: ve.filter((v) => v.TrangThai !== 'DA_HUY').map((v) => v.SoGhe) },
    };
  }
  r.get('/chuyen/:id', (req, res) => res.json(chiTietChuyen(Number(req.params.id))));

  // Danh sách chuyến còn bán vé (chưa khởi hành, không hủy)
  r.get('/chuyen-mo-ban', (req, res) => {
    res.json(db.prepare(`
      SELECT c.MaChuyen, c.SoHieuChuyen, t.SanBayDi, t.SanBayDen, c.GioKHKeHoach, c.GiaVeCoBan, c.TrangThai, mb.SoGhe,
        (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY') AS SoVe
      FROM CHUYENBAY c JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
      WHERE c.GioKHKeHoach > $now AND c.TrangThai IN ('LEN_LICH','LAM_THU_TUC','TRE')
      ORDER BY c.GioKHKeHoach`).all({ $now: fmtDateTime(new Date()) }));
  });

  // Đổi trạng thái chuyến — R9 kiểm tra ở tầng ứng dụng
  r.post('/chuyen/:id/trang-thai', (req, res) => {
    const maChuyen = Number(req.params.id);
    const { TrangThai } = req.body;
    const c = db.prepare('SELECT * FROM CHUYENBAY WHERE MaChuyen = ?').get(maChuyen);
    if (!c) throw new HttpError(404, 'Không tìm thấy chuyến bay');
    if (!TABLES.CHUYENBAY.columns.find((x) => x.name === 'TrangThai').options.includes(TrangThai))
      throw new HttpError(400, 'Trạng thái không hợp lệ');
    if (TRANG_THAI_CAN_TO_PHUC_VU.includes(TrangThai) && !TRANG_THAI_CAN_TO_PHUC_VU.includes(c.TrangThai)) {
      const err = kiemTraR9(db, maChuyen);
      if (err) throw new HttpError(400, err);
    }
    const gioThucTe = TrangThai === 'DA_CAT_CANH' && !c.GioKHThucTe ? fmtDateTime(new Date()) : c.GioKHThucTe;
    tx(db, () => {
      db.prepare('UPDATE CHUYENBAY SET TrangThai = ?, GioKHThucTe = ? WHERE MaChuyen = ?').run(TrangThai, gioThucTe, maChuyen);
      // Chuyến bị hủy thì các vé còn hiệu lực chuyển sang DA_HUY
      if (TrangThai === 'HUY') db.prepare("UPDATE VE SET TrangThai = 'DA_HUY' WHERE MaChuyen = ? AND TrangThai <> 'DA_HUY'").run(maChuyen);
    });
    res.json(chiTietChuyen(maChuyen));
  });

  // ------------------------------------------------------------ bán vé (A.1: bọc trong transaction)
  r.post('/ban-ve', (req, res) => {
    const b = req.body || {};
    const maChuyen = Number(b.MaChuyen);
    const c = db.prepare(`SELECT c.*, mb.SoGhe AS TongGhe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE MaChuyen = ?`).get(maChuyen);
    if (!c) throw new HttpError(400, 'Chưa chọn chuyến bay');
    if (c.TrangThai === 'HUY' || c.GioKHKeHoach <= fmtDateTime(new Date())) throw new HttpError(400, 'Chuyến bay đã hủy hoặc đã khởi hành');
    const hangGhe = b.HangGhe === 'THUONG_GIA' ? 'THUONG_GIA' : 'PHO_THONG';
    const soDo = soDoGhe(c.TongGhe);
    if (!b.SoGhe) throw new HttpError(400, 'Chưa chọn số ghế');
    if (!(hangGhe === 'THUONG_GIA' ? soDo.thuongGia : soDo.phoThong).includes(b.SoGhe))
      throw new HttpError(400, `Ghế ${b.SoGhe} không thuộc hạng ${hangGhe === 'THUONG_GIA' ? 'thương gia' : 'phổ thông'}`);
    const giaVe = Math.round(Number(b.GiaVe) || (hangGhe === 'THUONG_GIA' ? c.GiaVeCoBan * 2.5 : c.GiaVeCoBan));
    const hanhLy = Array.isArray(b.HanhLy) ? b.HanhLy : [];

    const ketQua = tx(db, () => {
      let maHK = Number(b.MaHK) || null;
      if (!maHK) {
        const k = b.KhachMoi || {};
        if (!k.SoGiayTo || !k.HoTen || !k.NgaySinh) throw new HttpError(400, 'Khách mới cần số giấy tờ, họ tên và ngày sinh');
        const cu = db.prepare('SELECT MaHK FROM HANHKHACH WHERE SoGiayTo = ?').get(k.SoGiayTo.trim());
        maHK = cu ? cu.MaHK : Number(db.prepare(
          'INSERT INTO HANHKHACH (SoGiayTo, HoTen, NgaySinh, QuocTich, Sdt, Email) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(k.SoGiayTo.trim(), k.HoTen.trim(), k.NgaySinh, k.QuocTich || 'Việt Nam', k.Sdt || null, k.Email || null).lastInsertRowid);
      }
      const maVe = Number(db.prepare(
        "INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat, TrangThai) VALUES (?, ?, ?, ?, ?, ?, 'DA_DAT')",
      ).run(maChuyen, maHK, hangGhe, b.SoGhe, giaVe, fmtDateTime(new Date())).lastInsertRowid);
      let tongPhi = 0;
      for (const h of hanhLy) {
        const loai = h.LoaiHL === 'XACH_TAY' ? 'XACH_TAY' : 'KY_GUI';
        const kg = Math.round(Number(h.CanNangKg) * 100) / 100;
        if (!Number.isFinite(kg)) throw new HttpError(400, 'Cân nặng hành lý không hợp lệ');
        const phi = phiQuaCan(loai, kg);
        tongPhi += phi;
        db.prepare('INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, ?, ?, ?)').run(maVe, loai, kg, phi);
      }
      return { maVe, maHK, giaVe, tongPhi, tongTien: giaVe + tongPhi };
    });
    res.status(201).json({ ok: true, ...ketQua });
  });

  // ------------------------------------------------------------ nạp lại dữ liệu mẫu
  r.post('/reset', (req, res) => {
    const scale = SCALES[req.body?.scale] ? req.body.scale : 'kehoach';
    reseed(db, scale);
    res.json({ ok: true, scale });
  });

  // ------------------------------------------------------------ bảo dưỡng tàu bay
  r.post('/may-bay/:soHieu/bao-duong', (req, res) => {
    const ngay = /^\d{4}-\d{2}-\d{2}$/.test(req.body?.ngay || '') ? req.body.ngay : fmtDate(new Date());
    const info = db.prepare('UPDATE MAYBAY SET NgayBaoDuongCuoi = ? WHERE SoHieuMB = ?').run(ngay, req.params.soHieu);
    if (!info.changes) throw new HttpError(404, 'Không tìm thấy tàu bay');
    res.json({ ok: true, ngay });
  });

  return r;
};
