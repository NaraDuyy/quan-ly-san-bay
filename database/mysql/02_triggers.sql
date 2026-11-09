-- =====================================================================
--  TRIGGER VÀ THỦ TỤC CÀI ĐẶT RÀNG BUỘC (mục 7 của báo cáo) — MySQL 8
--  R2, R3, R7: đã khai báo bằng UNIQUE / CHECK trong 01_schema.sql
--  R1, R4, R5, R6, R8, R10: trigger, vi phạm thì SIGNAL SQLSTATE '45000'
--  R9: thủ tục sp_doi_trang_thai_chuyen (ràng buộc mang tính quy trình)
--  Chuyến ở trạng thái HUY không chiếm lịch tàu bay / cổng / nhân viên.
-- =====================================================================
USE quan_ly_san_bay;

DROP TRIGGER IF EXISTS trg_ve_bi;
DROP TRIGGER IF EXISTS trg_ve_bu;
DROP TRIGGER IF EXISTS trg_cb_bi;
DROP TRIGGER IF EXISTS trg_cb_bu;
DROP TRIGGER IF EXISTS trg_hl_bi;
DROP TRIGGER IF EXISTS trg_hl_bu;
DROP TRIGGER IF EXISTS trg_pc_bi;
DROP TRIGGER IF EXISTS trg_pc_bu;
DROP PROCEDURE IF EXISTS sp_doi_trang_thai_chuyen;

DELIMITER $$

-- R1: số vé hiệu lực của chuyến ≤ số ghế tàu bay ------------------------
CREATE TRIGGER trg_ve_bi BEFORE INSERT ON VE
FOR EACH ROW
BEGIN
  DECLARE v_so_ve INT;
  DECLARE v_so_ghe INT;
  IF NEW.TrangThai <> 'DA_HUY' THEN
    SELECT COUNT(*) INTO v_so_ve FROM VE WHERE MaChuyen = NEW.MaChuyen AND TrangThai <> 'DA_HUY';
    SELECT mb.SoGhe INTO v_so_ghe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE c.MaChuyen = NEW.MaChuyen;
    IF v_so_ve >= v_so_ghe THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R1: Chuyến bay đã bán hết số ghế của tàu bay';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_ve_bu BEFORE UPDATE ON VE
FOR EACH ROW
BEGIN
  DECLARE v_so_ve INT;
  DECLARE v_so_ghe INT;
  IF NEW.TrangThai <> 'DA_HUY' AND (OLD.TrangThai = 'DA_HUY' OR OLD.MaChuyen <> NEW.MaChuyen) THEN
    SELECT COUNT(*) INTO v_so_ve FROM VE
      WHERE MaChuyen = NEW.MaChuyen AND TrangThai <> 'DA_HUY' AND MaVe <> NEW.MaVe;
    SELECT mb.SoGhe INTO v_so_ghe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE c.MaChuyen = NEW.MaChuyen;
    IF v_so_ve >= v_so_ghe THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R1: Chuyến bay đã bán hết số ghế của tàu bay';
    END IF;
  END IF;
END$$

-- R4, R5, R6 khi thêm chuyến bay ---------------------------------------
CREATE TRIGGER trg_cb_bi BEFORE INSERT ON CHUYENBAY
FOR EACH ROW
BEGIN
  DECLARE v_bd DATE;
  -- R6: tàu bay quá 180 ngày kể từ lần bảo dưỡng cuối không nhận chuyến mới
  SELECT NgayBaoDuongCuoi INTO v_bd FROM MAYBAY WHERE SoHieuMB = NEW.SoHieuMB;
  IF DATEDIFF(NEW.NgayBay, v_bd) > 180 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R6: Tàu bay quá hạn bảo dưỡng 180 ngày tại ngày bay';
  END IF;
  IF NEW.TrangThai <> 'HUY' THEN
    -- R4: cùng tàu bay cách nhau ≥ 120 phút
    IF EXISTS (SELECT 1 FROM CHUYENBAY c
               WHERE c.SoHieuMB = NEW.SoHieuMB AND c.TrangThai <> 'HUY'
                 AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, NEW.GioKHKeHoach)) < 120) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R4: Tàu bay đã có chuyến khác cách chưa đủ 120 phút';
    END IF;
    -- R5: cùng cổng cách nhau ≥ 60 phút
    IF NEW.MaCong IS NOT NULL AND EXISTS (SELECT 1 FROM CHUYENBAY c
               WHERE c.MaCong = NEW.MaCong AND c.TrangThai <> 'HUY'
                 AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, NEW.GioKHKeHoach)) < 60) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R5: Cổng đã phục vụ chuyến khác cách chưa đủ 60 phút';
    END IF;
  END IF;
END$$

-- R1, R4, R5, R6 khi sửa chuyến bay ------------------------------------
CREATE TRIGGER trg_cb_bu BEFORE UPDATE ON CHUYENBAY
FOR EACH ROW
BEGIN
  DECLARE v_bd DATE;
  DECLARE v_so_ve INT;
  DECLARE v_so_ghe INT;
  IF NEW.SoHieuMB <> OLD.SoHieuMB OR NEW.NgayBay <> OLD.NgayBay THEN
    SELECT NgayBaoDuongCuoi, SoGhe INTO v_bd, v_so_ghe FROM MAYBAY WHERE SoHieuMB = NEW.SoHieuMB;
    IF DATEDIFF(NEW.NgayBay, v_bd) > 180 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R6: Tàu bay quá hạn bảo dưỡng 180 ngày tại ngày bay';
    END IF;
    SELECT COUNT(*) INTO v_so_ve FROM VE WHERE MaChuyen = NEW.MaChuyen AND TrangThai <> 'DA_HUY';
    IF v_so_ve > v_so_ghe THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R1: Tàu bay mới có ít ghế hơn số vé đã bán của chuyến';
    END IF;
  END IF;
  IF NEW.TrangThai <> 'HUY' THEN
    IF EXISTS (SELECT 1 FROM CHUYENBAY c
               WHERE c.SoHieuMB = NEW.SoHieuMB AND c.TrangThai <> 'HUY' AND c.MaChuyen <> NEW.MaChuyen
                 AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, NEW.GioKHKeHoach)) < 120) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R4: Tàu bay đã có chuyến khác cách chưa đủ 120 phút';
    END IF;
    IF NEW.MaCong IS NOT NULL AND EXISTS (SELECT 1 FROM CHUYENBAY c
               WHERE c.MaCong = NEW.MaCong AND c.TrangThai <> 'HUY' AND c.MaChuyen <> NEW.MaChuyen
                 AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, NEW.GioKHKeHoach)) < 60) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R5: Cổng đã phục vụ chuyến khác cách chưa đủ 60 phút';
    END IF;
  END IF;
END$$

-- R8: tối đa 1 kiện xách tay và 3 kiện ký gửi mỗi vé -------------------
CREATE TRIGGER trg_hl_bi BEFORE INSERT ON HANHLY
FOR EACH ROW
BEGIN
  DECLARE v_so INT;
  SELECT COUNT(*) INTO v_so FROM HANHLY WHERE MaVe = NEW.MaVe AND LoaiHL = NEW.LoaiHL;
  IF (NEW.LoaiHL = 'XACH_TAY' AND v_so >= 1) OR (NEW.LoaiHL = 'KY_GUI' AND v_so >= 3) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R8: Vé đã đủ số kiện hành lý cho phép (1 xách tay, 3 ký gửi)';
  END IF;
  -- G4: tự tính phí quá cước nếu ứng dụng không truyền (100.000 đ / kg vượt 23 kg, làm tròn lên)
  IF NEW.PhiQuaCan = 0 AND NEW.LoaiHL = 'KY_GUI' AND NEW.CanNangKg > 23 THEN
    SET NEW.PhiQuaCan = CEIL(NEW.CanNangKg - 23) * 100000;
  END IF;
END$$

CREATE TRIGGER trg_hl_bu BEFORE UPDATE ON HANHLY
FOR EACH ROW
BEGIN
  DECLARE v_so INT;
  IF NEW.MaVe <> OLD.MaVe OR NEW.LoaiHL <> OLD.LoaiHL THEN
    SELECT COUNT(*) INTO v_so FROM HANHLY WHERE MaVe = NEW.MaVe AND LoaiHL = NEW.LoaiHL AND MaHL <> NEW.MaHL;
    IF (NEW.LoaiHL = 'XACH_TAY' AND v_so >= 1) OR (NEW.LoaiHL = 'KY_GUI' AND v_so >= 3) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R8: Vé đã đủ số kiện hành lý cho phép (1 xách tay, 3 ký gửi)';
    END IF;
  END IF;
END$$

-- R10: nhân viên không phục vụ hai chuyến cách nhau dưới 120 phút ------
CREATE TRIGGER trg_pc_bi BEFORE INSERT ON PHANCONG
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM PHANCONG p
             JOIN CHUYENBAY c   ON c.MaChuyen = p.MaChuyen
             JOIN CHUYENBAY moi ON moi.MaChuyen = NEW.MaChuyen
             WHERE p.MaNV = NEW.MaNV AND c.TrangThai <> 'HUY'
               AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, moi.GioKHKeHoach)) < 120) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R10: Nhân viên đã được phân công chuyến khác cách chưa đủ 120 phút';
  END IF;
END$$

CREATE TRIGGER trg_pc_bu BEFORE UPDATE ON PHANCONG
FOR EACH ROW
BEGIN
  IF NEW.MaChuyen <> OLD.MaChuyen OR NEW.MaNV <> OLD.MaNV THEN
    IF EXISTS (SELECT 1 FROM PHANCONG p
               JOIN CHUYENBAY c   ON c.MaChuyen = p.MaChuyen
               JOIN CHUYENBAY moi ON moi.MaChuyen = NEW.MaChuyen
               WHERE p.MaNV = NEW.MaNV AND c.TrangThai <> 'HUY'
                 AND NOT (p.MaChuyen = OLD.MaChuyen AND p.MaNV = OLD.MaNV)
                 AND ABS(TIMESTAMPDIFF(MINUTE, c.GioKHKeHoach, moi.GioKHKeHoach)) < 120) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R10: Nhân viên đã được phân công chuyến khác cách chưa đủ 120 phút';
    END IF;
  END IF;
END$$

-- R9: chuyển trạng thái chuyến; từ LAM_THU_TUC trở đi cần ≥ 1 điều phối mặt đất
-- và ≥ 2 làm thủ tục. Hủy chuyến thì hủy luôn các vé còn hiệu lực. -------
CREATE PROCEDURE sp_doi_trang_thai_chuyen(
  IN p_ma_chuyen INT UNSIGNED,
  IN p_trang_thai VARCHAR(20)
)
BEGIN
  DECLARE v_cu VARCHAR(20);
  DECLARE v_dieu_phoi INT;
  DECLARE v_thu_tuc INT;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;

  START TRANSACTION;
  SELECT TrangThai INTO v_cu FROM CHUYENBAY WHERE MaChuyen = p_ma_chuyen FOR UPDATE;
  IF v_cu IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Không tìm thấy chuyến bay';
  END IF;

  IF p_trang_thai IN ('LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE')
     AND v_cu NOT IN ('LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE') THEN
    SELECT SUM(VaiTro = 'DIEU_PHOI_MAT_DAT'), SUM(VaiTro = 'LAM_THU_TUC')
      INTO v_dieu_phoi, v_thu_tuc
      FROM PHANCONG WHERE MaChuyen = p_ma_chuyen;
    IF COALESCE(v_dieu_phoi, 0) < 1 OR COALESCE(v_thu_tuc, 0) < 2 THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'R9: Chuyến cần tối thiểu 1 điều phối mặt đất và 2 nhân viên làm thủ tục';
    END IF;
  END IF;

  UPDATE CHUYENBAY
     SET TrangThai = p_trang_thai,
         GioKHThucTe = IF(p_trang_thai = 'DA_CAT_CANH' AND GioKHThucTe IS NULL, NOW(), GioKHThucTe)
   WHERE MaChuyen = p_ma_chuyen;
  IF p_trang_thai = 'HUY' THEN
    UPDATE VE SET TrangThai = 'DA_HUY' WHERE MaChuyen = p_ma_chuyen AND TrangThai <> 'DA_HUY';
  END IF;
  COMMIT;
END$$

DELIMITER ;
