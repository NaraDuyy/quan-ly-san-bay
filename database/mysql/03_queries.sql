-- =====================================================================
--  TRUY VẤN Q1–Q5 (mục 2.3 và 8.1 của báo cáo) — MySQL 8
--  Đổi giá trị các biến @... để chạy với tham số khác.
-- =====================================================================
USE quan_ly_san_bay;

-- ---------------------------------------------------------------------
-- Q1. Chuyến bay trong khoảng ngày cùng số vé đã bán và tỉ lệ lấp đầy,
--     sắp xếp giảm dần theo tỉ lệ lấp đầy.
-- ---------------------------------------------------------------------
SET @tu_ngay  = DATE_FORMAT(CURDATE() - INTERVAL 2 MONTH, '%Y-%m-01');
SET @den_ngay = LAST_DAY(CURDATE());

SELECT c.MaChuyen, c.SoHieuChuyen,
       CONCAT(t.SanBayDi, ' → ', t.SanBayDen) AS DuongBay,
       c.GioKHKeHoach, c.TrangThai, mb.SoHieuMB, mb.SoGhe,
       COUNT(v.MaVe)                              AS SoVeDaBan,
       ROUND(100 * COUNT(v.MaVe) / mb.SoGhe, 2)   AS TiLeLapDay
FROM CHUYENBAY c
JOIN MAYBAY mb  ON mb.SoHieuMB = c.SoHieuMB
JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen
LEFT JOIN VE v  ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY'
WHERE c.NgayBay BETWEEN @tu_ngay AND @den_ngay
GROUP BY c.MaChuyen, c.SoHieuChuyen, t.SanBayDi, t.SanBayDen, c.GioKHKeHoach, c.TrangThai, mb.SoHieuMB, mb.SoGhe
ORDER BY TiLeLapDay DESC, c.GioKHKeHoach;

-- ---------------------------------------------------------------------
-- Q2. Lương tháng = lương cơ bản (vị trí, bậc) + tổng thưởng chuyến theo vai trò (G6).
--     Tham số hóa theo (năm, tháng); với tháng hiện tại chỉ tính các chuyến đã khởi hành.
-- ---------------------------------------------------------------------
SET @nam = YEAR(CURDATE());
SET @thang = MONTH(CURDATE());

SELECT nv.MaNV, nv.HoTen, nv.ViTri, nv.Bac, ml.LuongCoBan,
       COALESCE(pc.SoChuyen, 0)                    AS SoChuyen,
       COALESCE(pc.TongThuong, 0)                  AS TongThuong,
       ml.LuongCoBan + COALESCE(pc.TongThuong, 0)  AS LuongThang
FROM NHANVIEN nv
JOIN MUCLUONG ml ON ml.ViTri = nv.ViTri AND ml.Bac = nv.Bac
LEFT JOIN (
  SELECT p.MaNV, COUNT(*) AS SoChuyen, SUM(tl.MucThuongChuyen) AS TongThuong
  FROM PHANCONG p
  JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen
  JOIN THULAO tl   ON tl.VaiTro = p.VaiTro
  WHERE YEAR(c.NgayBay) = @nam AND MONTH(c.NgayBay) = @thang
    AND c.TrangThai <> 'HUY'
    AND c.GioKHKeHoach <= NOW()
  GROUP BY p.MaNV
) pc ON pc.MaNV = nv.MaNV
ORDER BY LuongThang DESC;

-- ---------------------------------------------------------------------
-- Q3. Hồ sơ một hành khách và toàn bộ lịch sử.
-- ---------------------------------------------------------------------
SET @ma_hk = 1;

SELECT * FROM HANHKHACH WHERE MaHK = @ma_hk;

-- (1) Các chuyến đã bay
SELECT v.MaVe, c.SoHieuChuyen, CONCAT(t.SanBayDi, ' → ', t.SanBayDen) AS DuongBay,
       c.GioKHKeHoach, c.TrangThai AS TrangThaiChuyen, v.HangGhe, v.SoGhe, v.GiaVe, v.TrangThai AS TrangThaiVe
FROM VE v
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
JOIN TUYENBAY t  ON t.MaTuyen = c.MaTuyen
WHERE v.MaHK = @ma_hk
ORDER BY c.GioKHKeHoach DESC;

-- (2) Hành lý từng chuyến
SELECT h.MaHL, h.MaVe, c.SoHieuChuyen, h.LoaiHL, h.CanNangKg, h.PhiQuaCan
FROM HANHLY h
JOIN VE v        ON v.MaVe = h.MaVe
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
WHERE v.MaHK = @ma_hk
ORDER BY c.GioKHKeHoach DESC, h.MaHL;

-- (3) Dịch vụ đã sử dụng
SELECT s.MaSD, s.ThoiGian, d.TenDV, s.SoLuong, s.ThanhTien
FROM SUDUNGDICHVU s
JOIN DICHVU d ON d.MaDV = s.MaDV
WHERE s.MaHK = @ma_hk
ORDER BY s.ThoiGian DESC;

-- Tổng chi tiêu = vé hiệu lực trên chuyến không hủy + phí hành lý các vé đó + dịch vụ
SELECT x.TienVe, x.PhiHanhLy, x.TienDichVu, x.TienVe + x.PhiHanhLy + x.TienDichVu AS TongChiTieu
FROM (
  SELECT
    (SELECT COALESCE(SUM(v.GiaVe), 0) FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
       WHERE v.MaHK = @ma_hk AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS TienVe,
    (SELECT COALESCE(SUM(h.PhiQuaCan), 0) FROM HANHLY h JOIN VE v ON v.MaVe = h.MaVe
       JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
       WHERE v.MaHK = @ma_hk AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS PhiHanhLy,
    (SELECT COALESCE(SUM(s.ThanhTien), 0) FROM SUDUNGDICHVU s WHERE s.MaHK = @ma_hk) AS TienDichVu
) x;

-- ---------------------------------------------------------------------
-- Q4. Doanh thu mỗi tháng theo ba nguồn (G8) và tiền vé theo hãng.
-- ---------------------------------------------------------------------
WITH tien_ve AS (
  SELECT DATE_FORMAT(c.NgayBay, '%Y-%m') AS Thang, SUM(v.GiaVe) AS TienVe
  FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
  WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
  GROUP BY Thang
), phi_hl AS (
  SELECT DATE_FORMAT(c.NgayBay, '%Y-%m') AS Thang, SUM(h.PhiQuaCan) AS PhiHanhLy
  FROM HANHLY h JOIN VE v ON v.MaVe = h.MaVe JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
  WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
  GROUP BY Thang
), tien_dv AS (
  SELECT DATE_FORMAT(ThoiGian, '%Y-%m') AS Thang, SUM(ThanhTien) AS TienDichVu
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
ORDER BY t.Thang;

SELECT DATE_FORMAT(c.NgayBay, '%Y-%m') AS Thang, h.MaHang, h.TenHang,
       COUNT(v.MaVe) AS SoVe, SUM(v.GiaVe) AS TienVe
FROM VE v
JOIN CHUYENBAY c     ON c.MaChuyen = v.MaChuyen
JOIN MAYBAY mb       ON mb.SoHieuMB = c.SoHieuMB
JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
GROUP BY Thang, h.MaHang, h.TenHang
ORDER BY Thang, TienVe DESC;

-- ---------------------------------------------------------------------
-- Q5. Ngày bảo dưỡng tiếp theo = NgayBaoDuongCuoi + 180 ngày;
--     tàu bay quá hạn tách thành danh sách riêng.
-- ---------------------------------------------------------------------
-- Danh sách quá hạn
SELECT mb.SoHieuMB, h.TenHang, mb.Model, mb.NgayBaoDuongCuoi,
       DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY)                      AS NgayBaoDuongTiepTheo,
       DATEDIFF(CURDATE(), DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY)) AS SoNgayQuaHan
FROM MAYBAY mb JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
WHERE DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY) < CURDATE()
ORDER BY NgayBaoDuongTiepTheo;

-- Danh sách còn hạn (kèm cảnh báo sắp tới hạn trong 30 ngày)
SELECT mb.SoHieuMB, h.TenHang, mb.Model, mb.NgayBaoDuongCuoi,
       DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY)                      AS NgayBaoDuongTiepTheo,
       DATEDIFF(DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY), CURDATE()) AS SoNgayConLai,
       CASE WHEN DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY) <= CURDATE() + INTERVAL 30 DAY
            THEN 'SAP_TOI_HAN' ELSE 'CON_HAN' END                           AS TinhTrang
FROM MAYBAY mb JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
WHERE DATE_ADD(mb.NgayBaoDuongCuoi, INTERVAL 180 DAY) >= CURDATE()
ORDER BY NgayBaoDuongTiepTheo;
