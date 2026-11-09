// Các truy vấn Q1–Q5 (mục 2.3 và 8.1 của báo cáo). SQL được trả kèm kết quả để hiển thị trên web.
// $now = thời điểm hiện tại (giờ địa phương) do ứng dụng truyền vào.
const { fmtDateTime, fmtDate, G } = require('./rules');

const SQL = {
  Q1: `SELECT c.MaChuyen, c.SoHieuChuyen,
       t.SanBayDi || ' → ' || t.SanBayDen AS DuongBay,
       c.GioKHKeHoach, c.TrangThai, mb.SoHieuMB, mb.SoGhe,
       COUNT(v.MaVe) AS SoVeDaBan,
       ROUND(100.0 * COUNT(v.MaVe) / mb.SoGhe, 2) AS TiLeLapDay
FROM CHUYENBAY c
JOIN MAYBAY mb   ON mb.SoHieuMB = c.SoHieuMB
JOIN TUYENBAY t  ON t.MaTuyen = c.MaTuyen
LEFT JOIN VE v   ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY'
WHERE c.NgayBay BETWEEN $tuNgay AND $denNgay
GROUP BY c.MaChuyen
ORDER BY TiLeLapDay DESC, c.GioKHKeHoach`,

  Q2: `-- Thưởng chỉ tính cho chuyến không hủy, thuộc tháng cần tính
-- và đã khởi hành tính đến thời điểm hiện tại ($now)
SELECT nv.MaNV, nv.HoTen, nv.ViTri, nv.Bac, ml.LuongCoBan,
       COALESCE(pc.SoChuyen, 0)   AS SoChuyen,
       COALESCE(pc.TongThuong, 0) AS TongThuong,
       ml.LuongCoBan + COALESCE(pc.TongThuong, 0) AS LuongThang
FROM NHANVIEN nv
JOIN MUCLUONG ml ON ml.ViTri = nv.ViTri AND ml.Bac = nv.Bac
LEFT JOIN (
  SELECT p.MaNV, COUNT(*) AS SoChuyen, SUM(tl.MucThuongChuyen) AS TongThuong
  FROM PHANCONG p
  JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen
  JOIN THULAO tl   ON tl.VaiTro = p.VaiTro
  WHERE strftime('%Y-%m', c.NgayBay) = $thang
    AND c.TrangThai <> 'HUY'
    AND c.GioKHKeHoach <= $now
  GROUP BY p.MaNV
) pc ON pc.MaNV = nv.MaNV
ORDER BY LuongThang DESC`,

  Q3_info: `SELECT * FROM HANHKHACH WHERE MaHK = $maHK`,
  Q3_chuyen: `SELECT v.MaVe, c.SoHieuChuyen, t.SanBayDi || ' → ' || t.SanBayDen AS DuongBay,
       c.GioKHKeHoach, c.TrangThai AS TrangThaiChuyen, v.HangGhe, v.SoGhe, v.GiaVe,
       v.TrangThai AS TrangThaiVe,
       (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = v.MaVe)               AS SoKienHL,
       (SELECT COALESCE(SUM(h.PhiQuaCan), 0) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS PhiHanhLy
FROM VE v
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
JOIN TUYENBAY t  ON t.MaTuyen = c.MaTuyen
WHERE v.MaHK = $maHK
ORDER BY c.GioKHKeHoach DESC`,
  Q3_hanhly: `SELECT h.MaHL, h.MaVe, c.SoHieuChuyen, h.LoaiHL, h.CanNangKg, h.PhiQuaCan
FROM HANHLY h
JOIN VE v        ON v.MaVe = h.MaVe
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
WHERE v.MaHK = $maHK
ORDER BY c.GioKHKeHoach DESC, h.MaHL`,
  Q3_dichvu: `SELECT s.MaSD, s.ThoiGian, d.TenDV, s.SoLuong, s.ThanhTien
FROM SUDUNGDICHVU s
JOIN DICHVU d ON d.MaDV = s.MaDV
WHERE s.MaHK = $maHK
ORDER BY s.ThoiGian DESC`,
  Q3_tong: `-- Tổng chi tiêu: vé còn hiệu lực trên chuyến không hủy + phí hành lý của các vé đó + dịch vụ
SELECT
  (SELECT COALESCE(SUM(v.GiaVe), 0) FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
    WHERE v.MaHK = $maHK AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS TienVe,
  (SELECT COALESCE(SUM(h.PhiQuaCan), 0) FROM HANHLY h JOIN VE v ON v.MaVe = h.MaVe
    JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
    WHERE v.MaHK = $maHK AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS PhiHanhLy,
  (SELECT COALESCE(SUM(s.ThanhTien), 0) FROM SUDUNGDICHVU s WHERE s.MaHK = $maHK) AS TienDichVu`,

  Q4: `WITH tien_ve AS (
  SELECT strftime('%Y-%m', c.NgayBay) AS Thang, SUM(v.GiaVe) AS TienVe
  FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
  WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
  GROUP BY Thang
), phi_hl AS (
  SELECT strftime('%Y-%m', c.NgayBay) AS Thang, SUM(h.PhiQuaCan) AS PhiHanhLy
  FROM HANHLY h JOIN VE v ON v.MaVe = h.MaVe JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
  WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
  GROUP BY Thang
), tien_dv AS (
  SELECT strftime('%Y-%m', ThoiGian) AS Thang, SUM(ThanhTien) AS TienDichVu
  FROM SUDUNGDICHVU GROUP BY Thang
), thang AS (
  SELECT Thang FROM tien_ve UNION SELECT Thang FROM phi_hl UNION SELECT Thang FROM tien_dv
)
SELECT t.Thang,
       COALESCE(a.TienVe, 0)     AS TienVe,
       COALESCE(b.PhiHanhLy, 0)  AS PhiHanhLy,
       COALESCE(d.TienDichVu, 0) AS TienDichVu,
       COALESCE(a.TienVe, 0) + COALESCE(b.PhiHanhLy, 0) + COALESCE(d.TienDichVu, 0) AS TongDoanhThu
FROM thang t
LEFT JOIN tien_ve a ON a.Thang = t.Thang
LEFT JOIN phi_hl  b ON b.Thang = t.Thang
LEFT JOIN tien_dv d ON d.Thang = t.Thang
ORDER BY t.Thang`,
  Q4_hang: `SELECT strftime('%Y-%m', c.NgayBay) AS Thang, h.MaHang, h.TenHang,
       COUNT(v.MaVe) AS SoVe, SUM(v.GiaVe) AS TienVe
FROM VE v
JOIN CHUYENBAY c      ON c.MaChuyen = v.MaChuyen
JOIN MAYBAY mb        ON mb.SoHieuMB = c.SoHieuMB
JOIN HANGHANGKHONG h  ON h.MaHang = mb.MaHang
WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
GROUP BY Thang, h.MaHang
ORDER BY Thang, TienVe DESC`,

  Q5: `SELECT mb.SoHieuMB, h.TenHang, mb.Model, mb.SoGhe, mb.NgayBaoDuongCuoi,
       date(mb.NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days') AS NgayBaoDuongTiepTheo,
       CAST(julianday(date(mb.NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days')) - julianday($homNay) AS INTEGER) AS SoNgayConLai,
       CASE WHEN date(mb.NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days') < $homNay THEN 'QUA_HAN'
            WHEN date(mb.NgayBaoDuongCuoi, '+${G.CHU_KY_BAO_DUONG} days') <= date($homNay, '+30 days') THEN 'SAP_TOI_HAN'
            ELSE 'CON_HAN' END AS TinhTrang,
       (SELECT COUNT(*) FROM CHUYENBAY c WHERE c.SoHieuMB = mb.SoHieuMB
          AND c.GioKHKeHoach > $now AND c.TrangThai <> 'HUY') AS SoChuyenSapToi
FROM MAYBAY mb
JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
ORDER BY NgayBaoDuongTiepTheo`,
};

function q1(db, p) {
  const now = new Date();
  const tuNgay = p.tuNgay || fmtDate(new Date(now.getFullYear(), now.getMonth() - 2, 1));
  const denNgay = p.denNgay || fmtDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const rows = db.prepare(SQL.Q1).all({ $tuNgay: tuNgay, $denNgay: denNgay });
  return { params: { tuNgay, denNgay }, sql: SQL.Q1, rows };
}

function q2(db, p) {
  const now = new Date();
  const thang = /^\d{4}-\d{2}$/.test(p.thang || '') ? p.thang : fmtDate(now).slice(0, 7);
  const rows = db.prepare(SQL.Q2).all({ $thang: thang, $now: fmtDateTime(now) });
  const chiTiet = db.prepare(`
    SELECT p.MaNV, p.VaiTro, COUNT(*) AS SoChuyen, SUM(tl.MucThuongChuyen) AS Thuong
    FROM PHANCONG p JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen JOIN THULAO tl ON tl.VaiTro = p.VaiTro
    WHERE strftime('%Y-%m', c.NgayBay) = $thang AND c.TrangThai <> 'HUY' AND c.GioKHKeHoach <= $now
    GROUP BY p.MaNV, p.VaiTro`).all({ $thang: thang, $now: fmtDateTime(now) });
  return { params: { thang }, sql: SQL.Q2, rows, chiTiet };
}

function q3(db, p) {
  const maHK = parseInt(p.maHK, 10) ||
    db.prepare('SELECT MaHK FROM VE GROUP BY MaHK ORDER BY COUNT(*) DESC, MaHK LIMIT 1').get()?.MaHK;
  const info = db.prepare(SQL.Q3_info).get({ $maHK: maHK });
  if (!info) return { params: { maHK }, info: null };
  const P = { $maHK: maHK };
  const tong = db.prepare(SQL.Q3_tong).get(P);
  tong.TongChiTieu = tong.TienVe + tong.PhiHanhLy + tong.TienDichVu;
  return {
    params: { maHK }, info,
    chuyen: db.prepare(SQL.Q3_chuyen).all(P),
    hanhLy: db.prepare(SQL.Q3_hanhly).all(P),
    dichVu: db.prepare(SQL.Q3_dichvu).all(P),
    tong,
    sql: [SQL.Q3_chuyen, SQL.Q3_hanhly, SQL.Q3_dichvu, SQL.Q3_tong].join(';\n\n') + ';',
  };
}

function q4(db) {
  return {
    rows: db.prepare(SQL.Q4).all(),
    theoHang: db.prepare(SQL.Q4_hang).all(),
    sql: SQL.Q4 + ';\n\n-- Doanh thu tiền vé theo hãng\n' + SQL.Q4_hang + ';',
  };
}

function q5(db) {
  const now = new Date();
  const rows = db.prepare(SQL.Q5).all({ $homNay: fmtDate(now), $now: fmtDateTime(now) });
  return {
    sql: SQL.Q5,
    quaHan: rows.filter((r) => r.TinhTrang === 'QUA_HAN'),
    conHan: rows.filter((r) => r.TinhTrang !== 'QUA_HAN'),
  };
}

module.exports = { SQL, q1, q2, q3, q4, q5 };
