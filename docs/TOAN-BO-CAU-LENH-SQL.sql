-- TOÀN BỘ CÂU LỆNH SQL MÀ WEB "QUẢN LÝ SÂN BAY" THỰC THI
-- Web: https://quan-ly-san-bay.onrender.com/ · Mã nguồn: https://github.com/NaraDuyy/quan-ly-san-bay
-- CSDL: SQLite (module node:sqlite). Bản MySQL 8 tương đương nằm trong database/mysql/.
-- 
-- Cách đọc:
-- - Câu lệnh được xếp theo chức năng trên web, đúng thứ tự máy chủ chạy.
-- - Dấu ?  hoặc  $ten  là THAM SỐ: máy chủ truyền giá trị riêng, không ghép chuỗi vào SQL (chống SQL injection).
--   Ví dụ $now = thời điểm hiện tại 'YYYY-MM-DD HH:MM:SS', $thang = 'YYYY-MM', $homNay = 'YYYY-MM-DD'.
-- - BEGIN ... COMMIT là một transaction: nếu một câu bên trong lỗi (vi phạm ràng buộc) thì máy chủ chạy ROLLBACK.
-- - Muốn xem câu lệnh chạy thật kèm giá trị tham số: mở trang Hệ thống → Nhật ký SQL trên web.
-- - Hằng số giả định: G1 quay đầu 120 phút, G2 bảo dưỡng 180 ngày, G7 cổng 60 phút.
-- File này được sinh tự động từ mã nguồn.

-- ====================================================================================================
-- 1. KHỞI ĐỘNG MÁY CHỦ (người chạy: hệ thống)
-- ====================================================================================================

-- ---- 1.1. Mở kết nối CSDL --------------------------------------------------------------------------
PRAGMA foreign_keys = ON;

PRAGMA journal_mode = WAL;

-- ---- 1.2. Kiểm tra đã có lược đồ và dữ liệu chưa ---------------------------------------------------
SELECT 1 FROM sqlite_master WHERE type='table' AND name='CHUYENBAY';

SELECT COUNT(*) AS n FROM CHUYENBAY;

-- Chưa có bảng hoặc CHUYENBAY rỗng: chạy toàn bộ mục 11 (nạp lại dữ liệu mẫu).

-- ---- 1.3. Bảng tài khoản đăng nhập (riêng cho web, không thuộc 15 bảng của báo cáo) ----------------
CREATE TABLE IF NOT EXISTS TAIKHOAN (
  MaTK         INTEGER PRIMARY KEY AUTOINCREMENT,
  TenDangNhap  VARCHAR(32) NOT NULL UNIQUE,
  HoTen        VARCHAR(80) NOT NULL,
  VaiTro       TEXT NOT NULL CHECK (VaiTro IN ('QUAN_TRI','BAN_VE','DIEU_PHOI','KE_TOAN')),
  MatKhauHash  TEXT NOT NULL,
  KichHoat     INTEGER NOT NULL DEFAULT 1 CHECK (KichHoat IN (0, 1)),
  NgayTao      DATETIME NOT NULL
);

SELECT COUNT(*) AS n FROM TAIKHOAN;

-- Bảng rỗng: tạo 4 tài khoản mặc định (quantri, banve, dieuphoi, ketoan) trong một transaction.
BEGIN;
INSERT INTO TAIKHOAN (TenDangNhap, HoTen, VaiTro, MatKhauHash, NgayTao) VALUES (?, ?, ?, ?, ?);   -- × 4
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Đã có tài khoản và có đặt biến môi trường ADMIN_PASSWORD / DEMO_PASSWORD: đồng bộ mật khẩu.
SELECT MaTK, MatKhauHash FROM TAIKHOAN WHERE TenDangNhap = ?;

UPDATE TAIKHOAN SET MatKhauHash = ? WHERE MaTK = ?;

-- ====================================================================================================
-- 2. LƯỢC ĐỒ 15 BẢNG: CREATE TABLE, CHỈ MỤC, TRIGGER (chạy khi tạo CSDL / nạp lại dữ liệu mẫu)
-- ====================================================================================================
-- Nội dung file server/schema.sql, chạy nguyên khối bằng db.exec().

-- =====================================================================
--  CSDL HỆ THỐNG QUẢN LÝ SÂN BAY — bản cài đặt SQLite (dùng cho web demo)
--  Bám sát mục 4 (lược đồ), mục 6 (từ điển dữ liệu), mục 7 (ràng buộc)
--  và mục 8.2 (chỉ mục) của báo cáo. Bản MySQL 8 nằm ở database/mysql/.
--  ENUM của MySQL được thay bằng CHECK (... IN (...)); DATETIME lưu dạng
--  TEXT 'YYYY-MM-DD HH:MM:SS'; trigger dùng RAISE(ABORT) thay cho SIGNAL.
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- 6.1
CREATE TABLE SANBAY (
  MaSanBay   CHAR(3)      PRIMARY KEY CHECK (length(MaSanBay) = 3),
  TenSanBay  VARCHAR(100) NOT NULL,
  ThanhPho   VARCHAR(60)  NOT NULL,
  QuocGia    VARCHAR(60)  NOT NULL
);

-- ---------------------------------------------------------------- 6.2
CREATE TABLE HANGHANGKHONG (
  MaHang     VARCHAR(5)   PRIMARY KEY,
  TenHang    VARCHAR(100) NOT NULL,
  QuocGia    VARCHAR(60)  NOT NULL,
  SdtLienHe  VARCHAR(15)
);

-- ---------------------------------------------------------------- 6.3
CREATE TABLE MAYBAY (
  SoHieuMB          VARCHAR(10) PRIMARY KEY,
  MaHang            VARCHAR(5)  NOT NULL REFERENCES HANGHANGKHONG(MaHang) ON UPDATE CASCADE,
  HangSanXuat       VARCHAR(40) NOT NULL,
  Model             VARCHAR(40) NOT NULL,
  SoGhe             INTEGER     NOT NULL CONSTRAINT ck_mb_soghe CHECK (SoGhe > 0),
  NamSanXuat        INTEGER     NOT NULL,
  NgayBaoDuongCuoi  DATE        NOT NULL
);

-- ---------------------------------------------------------------- 6.4
CREATE TABLE TUYENBAY (
  MaTuyen          INTEGER PRIMARY KEY AUTOINCREMENT,
  SanBayDi         CHAR(3) NOT NULL REFERENCES SANBAY(MaSanBay) ON UPDATE CASCADE,
  SanBayDen        CHAR(3) NOT NULL REFERENCES SANBAY(MaSanBay) ON UPDATE CASCADE,
  KhoangCachKm     INTEGER NOT NULL CHECK (KhoangCachKm > 0),
  ThoiGianBayPhut  INTEGER NOT NULL CHECK (ThoiGianBayPhut > 0),
  CONSTRAINT uq_tuyen_cap UNIQUE (SanBayDi, SanBayDen),
  CONSTRAINT ck_tuyen_khac CHECK (SanBayDi <> SanBayDen)
);

-- ---------------------------------------------------------------- 6.5
CREATE TABLE CONG (
  MaCong    INTEGER PRIMARY KEY AUTOINCREMENT,
  TenCong   VARCHAR(10) NOT NULL UNIQUE,
  KhuVuc    TEXT NOT NULL CHECK (KhuVuc IN ('T1','T2')),
  LoaiCong  TEXT NOT NULL CHECK (LoaiCong IN ('NOI_DIA','QUOC_TE'))
);

-- ---------------------------------------------------------------- 6.6
CREATE TABLE CHUYENBAY (
  MaChuyen       INTEGER PRIMARY KEY AUTOINCREMENT,
  SoHieuChuyen   VARCHAR(8)  NOT NULL,
  MaTuyen        INTEGER     NOT NULL REFERENCES TUYENBAY(MaTuyen) ON UPDATE CASCADE,
  SoHieuMB       VARCHAR(10) NOT NULL REFERENCES MAYBAY(SoHieuMB)  ON UPDATE CASCADE,
  MaCong         INTEGER              REFERENCES CONG(MaCong)      ON UPDATE CASCADE,
  NgayBay        DATE        NOT NULL,
  GioKHKeHoach   DATETIME    NOT NULL,
  GioKHThucTe    DATETIME,
  GioDenKeHoach  DATETIME    NOT NULL,
  TrangThai      TEXT        NOT NULL DEFAULT 'LEN_LICH'
                 CHECK (TrangThai IN ('LEN_LICH','LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE','HUY')),
  GiaVeCoBan     DECIMAL(12,0) NOT NULL CONSTRAINT ck_cb_gia CHECK (GiaVeCoBan > 0),
  CONSTRAINT ck_cb_gio CHECK (GioDenKeHoach > GioKHKeHoach)
);

-- ---------------------------------------------------------------- 6.7
CREATE TABLE HANHKHACH (
  MaHK      INTEGER PRIMARY KEY AUTOINCREMENT,
  SoGiayTo  VARCHAR(15)  NOT NULL UNIQUE,
  HoTen     VARCHAR(80)  NOT NULL,
  NgaySinh  DATE         NOT NULL,
  QuocTich  VARCHAR(60)  NOT NULL,
  Sdt       VARCHAR(15),
  Email     VARCHAR(100)
);

-- ---------------------------------------------------------------- 6.8
CREATE TABLE VE (
  MaVe       INTEGER PRIMARY KEY AUTOINCREMENT,
  MaChuyen   INTEGER NOT NULL REFERENCES CHUYENBAY(MaChuyen) ON UPDATE CASCADE ON DELETE RESTRICT,
  MaHK       INTEGER NOT NULL REFERENCES HANHKHACH(MaHK)     ON UPDATE CASCADE ON DELETE RESTRICT,
  HangGhe    TEXT NOT NULL CHECK (HangGhe IN ('PHO_THONG','THUONG_GIA')),
  SoGhe      VARCHAR(4) NOT NULL,
  GiaVe      DECIMAL(12,0) NOT NULL CONSTRAINT ck_ve_gia CHECK (GiaVe > 0),
  NgayDat    DATETIME NOT NULL,
  TrangThai  TEXT NOT NULL DEFAULT 'DA_DAT' CHECK (TrangThai IN ('DA_DAT','DA_CHECKIN','DA_HUY')),
  CONSTRAINT uq_ve_r2 UNIQUE (MaChuyen, MaHK),   -- R2
  CONSTRAINT uq_ve_r3 UNIQUE (MaChuyen, SoGhe)   -- R3
);

-- ---------------------------------------------------------------- 6.9
CREATE TABLE HANHLY (
  MaHL       INTEGER PRIMARY KEY AUTOINCREMENT,
  MaVe       INTEGER NOT NULL REFERENCES VE(MaVe) ON UPDATE CASCADE ON DELETE RESTRICT,
  LoaiHL     TEXT NOT NULL CHECK (LoaiHL IN ('XACH_TAY','KY_GUI')),
  CanNangKg  DECIMAL(5,2) NOT NULL CONSTRAINT ck_hl_r7 CHECK (CanNangKg > 0 AND CanNangKg <= 32), -- R7
  PhiQuaCan  DECIMAL(12,0) NOT NULL DEFAULT 0 CHECK (PhiQuaCan >= 0)
);

-- --------------------------------------------------------------- 6.10
CREATE TABLE MUCLUONG (
  ViTri       TEXT    NOT NULL CHECK (ViTri IN ('THU_TUC','AN_NINH','DIEU_PHOI','KY_THUAT','VE_SINH')),
  Bac         INTEGER NOT NULL CHECK (Bac BETWEEN 1 AND 5),
  LuongCoBan  DECIMAL(12,0) NOT NULL CHECK (LuongCoBan > 0),
  PRIMARY KEY (ViTri, Bac)
);

-- --------------------------------------------------------------- 6.11
CREATE TABLE NHANVIEN (
  MaNV         INTEGER PRIMARY KEY AUTOINCREMENT,
  CCCD         VARCHAR(12)  NOT NULL UNIQUE,
  HoTen        VARCHAR(80)  NOT NULL,
  NgaySinh     DATE         NOT NULL,
  DiaChi       VARCHAR(150) NOT NULL,
  Sdt          VARCHAR(15)  NOT NULL,
  ViTri        TEXT         NOT NULL,
  Bac          INTEGER      NOT NULL,
  ThamNienNam  INTEGER      NOT NULL DEFAULT 0 CHECK (ThamNienNam >= 0),
  FOREIGN KEY (ViTri, Bac) REFERENCES MUCLUONG(ViTri, Bac) ON UPDATE CASCADE
);

-- --------------------------------------------------------------- 6.12
CREATE TABLE THULAO (
  VaiTro           TEXT PRIMARY KEY
                   CHECK (VaiTro IN ('LAM_THU_TUC','AN_NINH_CONG','DIEU_PHOI_MAT_DAT','KY_THUAT_SAN_DO')),
  MucThuongChuyen  DECIMAL(12,0) NOT NULL CHECK (MucThuongChuyen >= 0)
);

-- --------------------------------------------------------------- 6.13
CREATE TABLE PHANCONG (
  MaChuyen  INTEGER NOT NULL REFERENCES CHUYENBAY(MaChuyen) ON UPDATE CASCADE ON DELETE RESTRICT,
  MaNV      INTEGER NOT NULL REFERENCES NHANVIEN(MaNV)      ON UPDATE CASCADE ON DELETE RESTRICT,
  VaiTro    TEXT    NOT NULL REFERENCES THULAO(VaiTro)      ON UPDATE CASCADE,
  PRIMARY KEY (MaChuyen, MaNV)
);

-- --------------------------------------------------------------- 6.14
CREATE TABLE DICHVU (
  MaDV    INTEGER PRIMARY KEY AUTOINCREMENT,
  TenDV   VARCHAR(80)   NOT NULL,
  DonGia  DECIMAL(12,0) NOT NULL CHECK (DonGia >= 0),
  MoTa    VARCHAR(200)
);

-- --------------------------------------------------------------- 6.15
CREATE TABLE SUDUNGDICHVU (
  MaSD       INTEGER PRIMARY KEY AUTOINCREMENT,
  MaHK       INTEGER  NOT NULL REFERENCES HANHKHACH(MaHK) ON UPDATE CASCADE ON DELETE RESTRICT,
  MaDV       INTEGER  NOT NULL REFERENCES DICHVU(MaDV)    ON UPDATE CASCADE ON DELETE RESTRICT,
  ThoiGian   DATETIME NOT NULL,
  SoLuong    INTEGER  NOT NULL DEFAULT 1 CHECK (SoLuong > 0),
  ThanhTien  DECIMAL(12,0) NOT NULL CHECK (ThanhTien >= 0)
);

-- =====================================================================
--  CHỈ MỤC (mục 8.2)
-- =====================================================================
CREATE INDEX ix_ve_chuyen_tt   ON VE (MaChuyen, TrangThai);
CREATE INDEX ix_ve_hk          ON VE (MaHK);
CREATE INDEX ix_cb_ngay        ON CHUYENBAY (NgayBay);
CREATE INDEX ix_cb_mb_gio      ON CHUYENBAY (SoHieuMB, GioKHKeHoach);
CREATE INDEX ix_cb_cong_gio    ON CHUYENBAY (MaCong, GioKHKeHoach);
CREATE INDEX ix_pc_nv          ON PHANCONG (MaNV);
CREATE INDEX ix_hl_ve          ON HANHLY (MaVe);
CREATE INDEX ix_sddv_hk_tg     ON SUDUNGDICHVU (MaHK, ThoiGian);
CREATE INDEX ix_sddv_dv_tg     ON SUDUNGDICHVU (MaDV, ThoiGian);

-- =====================================================================
--  TRIGGER cài đặt các ràng buộc liên bảng (mục 7)
--  Ghi chú: các chuyến ở trạng thái HUY không chiếm lịch tàu bay, cổng
--  hay nhân viên nên được bỏ qua khi kiểm tra R4, R5, R10.
-- =====================================================================

-- R1: số vé hiệu lực của chuyến ≤ số ghế tàu bay ---------------------
CREATE TRIGGER trg_ve_r1_ins BEFORE INSERT ON VE
WHEN NEW.TrangThai <> 'DA_HUY'
 AND (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = NEW.MaChuyen AND v.TrangThai <> 'DA_HUY')
     >= (SELECT mb.SoGhe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE c.MaChuyen = NEW.MaChuyen)
BEGIN
  SELECT RAISE(ABORT, 'R1: Chuyến bay đã bán hết số ghế của tàu bay');
END;

CREATE TRIGGER trg_ve_r1_upd BEFORE UPDATE OF TrangThai, MaChuyen ON VE
WHEN NEW.TrangThai <> 'DA_HUY'
 AND (OLD.TrangThai = 'DA_HUY' OR OLD.MaChuyen <> NEW.MaChuyen)
 AND (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = NEW.MaChuyen AND v.TrangThai <> 'DA_HUY' AND v.MaVe <> NEW.MaVe)
     >= (SELECT mb.SoGhe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE c.MaChuyen = NEW.MaChuyen)
BEGIN
  SELECT RAISE(ABORT, 'R1: Chuyến bay đã bán hết số ghế của tàu bay');
END;

-- R1 (bổ sung): đổi sang tàu bay ít ghế hơn số vé đã bán
CREATE TRIGGER trg_cb_r1_upd BEFORE UPDATE OF SoHieuMB ON CHUYENBAY
WHEN (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = NEW.MaChuyen AND v.TrangThai <> 'DA_HUY')
     > (SELECT SoGhe FROM MAYBAY WHERE SoHieuMB = NEW.SoHieuMB)
BEGIN
  SELECT RAISE(ABORT, 'R1: Tàu bay mới có ít ghế hơn số vé đã bán của chuyến');
END;

-- R4: hai chuyến cùng tàu bay cách nhau ≥ 120 phút --------------------
CREATE TRIGGER trg_cb_r4_ins BEFORE INSERT ON CHUYENBAY
WHEN NEW.TrangThai <> 'HUY' AND EXISTS (
  SELECT 1 FROM CHUYENBAY c
  WHERE c.SoHieuMB = NEW.SoHieuMB AND c.TrangThai <> 'HUY'
    AND abs(julianday(c.GioKHKeHoach) - julianday(NEW.GioKHKeHoach)) * 1440 < 120)
BEGIN
  SELECT RAISE(ABORT, 'R4: Tàu bay đã có chuyến khác cách chưa đủ 120 phút');
END;

CREATE TRIGGER trg_cb_r4_upd BEFORE UPDATE OF SoHieuMB, GioKHKeHoach, TrangThai ON CHUYENBAY
WHEN NEW.TrangThai <> 'HUY' AND EXISTS (
  SELECT 1 FROM CHUYENBAY c
  WHERE c.SoHieuMB = NEW.SoHieuMB AND c.TrangThai <> 'HUY' AND c.MaChuyen <> NEW.MaChuyen
    AND abs(julianday(c.GioKHKeHoach) - julianday(NEW.GioKHKeHoach)) * 1440 < 120)
BEGIN
  SELECT RAISE(ABORT, 'R4: Tàu bay đã có chuyến khác cách chưa đủ 120 phút');
END;

-- R5: hai chuyến cùng cổng cách nhau ≥ 60 phút ------------------------
CREATE TRIGGER trg_cb_r5_ins BEFORE INSERT ON CHUYENBAY
WHEN NEW.MaCong IS NOT NULL AND NEW.TrangThai <> 'HUY' AND EXISTS (
  SELECT 1 FROM CHUYENBAY c
  WHERE c.MaCong = NEW.MaCong AND c.TrangThai <> 'HUY'
    AND abs(julianday(c.GioKHKeHoach) - julianday(NEW.GioKHKeHoach)) * 1440 < 60)
BEGIN
  SELECT RAISE(ABORT, 'R5: Cổng đã phục vụ chuyến khác cách chưa đủ 60 phút');
END;

CREATE TRIGGER trg_cb_r5_upd BEFORE UPDATE OF MaCong, GioKHKeHoach, TrangThai ON CHUYENBAY
WHEN NEW.MaCong IS NOT NULL AND NEW.TrangThai <> 'HUY' AND EXISTS (
  SELECT 1 FROM CHUYENBAY c
  WHERE c.MaCong = NEW.MaCong AND c.TrangThai <> 'HUY' AND c.MaChuyen <> NEW.MaChuyen
    AND abs(julianday(c.GioKHKeHoach) - julianday(NEW.GioKHKeHoach)) * 1440 < 60)
BEGIN
  SELECT RAISE(ABORT, 'R5: Cổng đã phục vụ chuyến khác cách chưa đủ 60 phút');
END;

-- R6: tàu bay quá 180 ngày chưa bảo dưỡng không nhận chuyến mới -------
CREATE TRIGGER trg_cb_r6_ins BEFORE INSERT ON CHUYENBAY
WHEN julianday(NEW.NgayBay) - julianday((SELECT NgayBaoDuongCuoi FROM MAYBAY WHERE SoHieuMB = NEW.SoHieuMB)) > 180
BEGIN
  SELECT RAISE(ABORT, 'R6: Tàu bay quá hạn bảo dưỡng 180 ngày tại ngày bay');
END;

CREATE TRIGGER trg_cb_r6_upd BEFORE UPDATE OF SoHieuMB, NgayBay ON CHUYENBAY
WHEN julianday(NEW.NgayBay) - julianday((SELECT NgayBaoDuongCuoi FROM MAYBAY WHERE SoHieuMB = NEW.SoHieuMB)) > 180
BEGIN
  SELECT RAISE(ABORT, 'R6: Tàu bay quá hạn bảo dưỡng 180 ngày tại ngày bay');
END;

-- R8: tối đa 1 kiện xách tay và 3 kiện ký gửi mỗi vé ------------------
CREATE TRIGGER trg_hl_r8_ins BEFORE INSERT ON HANHLY
WHEN (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = NEW.MaVe AND h.LoaiHL = NEW.LoaiHL)
     >= CASE NEW.LoaiHL WHEN 'XACH_TAY' THEN 1 ELSE 3 END
BEGIN
  SELECT RAISE(ABORT, 'R8: Vé đã đủ số kiện hành lý cho phép (1 xách tay, 3 ký gửi)');
END;

CREATE TRIGGER trg_hl_r8_upd BEFORE UPDATE OF MaVe, LoaiHL ON HANHLY
WHEN (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = NEW.MaVe AND h.LoaiHL = NEW.LoaiHL AND h.MaHL <> NEW.MaHL)
     >= CASE NEW.LoaiHL WHEN 'XACH_TAY' THEN 1 ELSE 3 END
BEGIN
  SELECT RAISE(ABORT, 'R8: Vé đã đủ số kiện hành lý cho phép (1 xách tay, 3 ký gửi)');
END;

-- R10: nhân viên không phục vụ hai chuyến cách nhau dưới 120 phút ------
CREATE TRIGGER trg_pc_r10_ins BEFORE INSERT ON PHANCONG
WHEN EXISTS (
  SELECT 1 FROM PHANCONG p
  JOIN CHUYENBAY c   ON c.MaChuyen = p.MaChuyen
  JOIN CHUYENBAY moi ON moi.MaChuyen = NEW.MaChuyen
  WHERE p.MaNV = NEW.MaNV AND c.TrangThai <> 'HUY'
    AND abs(julianday(c.GioKHKeHoach) - julianday(moi.GioKHKeHoach)) * 1440 < 120)
BEGIN
  SELECT RAISE(ABORT, 'R10: Nhân viên đã được phân công chuyến khác cách chưa đủ 120 phút');
END;

CREATE TRIGGER trg_pc_r10_upd BEFORE UPDATE OF MaChuyen, MaNV ON PHANCONG
WHEN EXISTS (
  SELECT 1 FROM PHANCONG p
  JOIN CHUYENBAY c   ON c.MaChuyen = p.MaChuyen
  JOIN CHUYENBAY moi ON moi.MaChuyen = NEW.MaChuyen
  WHERE p.MaNV = NEW.MaNV AND c.TrangThai <> 'HUY'
    AND NOT (p.MaChuyen = OLD.MaChuyen AND p.MaNV = OLD.MaNV)
    AND abs(julianday(c.GioKHKeHoach) - julianday(moi.GioKHKeHoach)) * 1440 < 120)
BEGIN
  SELECT RAISE(ABORT, 'R10: Nhân viên đã được phân công chuyến khác cách chưa đủ 120 phút');
END;

-- ====================================================================================================
-- 3. ĐĂNG NHẬP, PHIÊN, TÀI KHOẢN
-- ====================================================================================================

-- ---- 3.1. Kiểm tra phiên đăng nhập: chạy ở MỌI yêu cầu API khi trình duyệt có cookie sb_sid --------
SELECT * FROM TAIKHOAN WHERE MaTK = ? AND KichHoat = 1;

-- Trang Nhật ký SQL tự hỏi máy chủ mỗi giây nhưng KHÔNG chạy câu này (dùng thông tin phiên trong bộ nhớ).

-- ---- 3.2. Đăng nhập --------------------------------------------------------------------------------
SELECT * FROM TAIKHOAN WHERE TenDangNhap = ?;

-- So khớp mật khẩu bằng scrypt ở máy chủ, tạo phiên trong bộ nhớ: KHÔNG dùng SQL.
-- Đăng xuất cũng không chạy SQL (chỉ xóa phiên trong bộ nhớ).

-- ---- 3.3. Tự đổi mật khẩu --------------------------------------------------------------------------
UPDATE TAIKHOAN SET MatKhauHash = ? WHERE MaTK = ?;

-- ---- 3.4. Quản lý tài khoản (chỉ Quản trị) — sau mỗi thao tác đều tải lại danh sách ----------------
SELECT MaTK, TenDangNhap, HoTen, VaiTro, KichHoat, NgayTao FROM TAIKHOAN ORDER BY MaTK;

-- Tạo tài khoản:
INSERT INTO TAIKHOAN (TenDangNhap, HoTen, VaiTro, MatKhauHash, NgayTao) VALUES (?, ?, ?, ?, ?);

-- Sửa (họ tên, vai trò, khóa / mở khóa, đặt lại mật khẩu):
SELECT * FROM TAIKHOAN WHERE MaTK = ?;

SELECT COUNT(*) AS n FROM TAIKHOAN WHERE VaiTro = 'QUAN_TRI' AND KichHoat = 1 AND MaTK <> ?;   -- luôn giữ ít nhất 1 Quản trị

UPDATE TAIKHOAN SET HoTen = ?, VaiTro = ?, KichHoat = ?, MatKhauHash = ? WHERE MaTK = ?;

-- Xóa:
SELECT * FROM TAIKHOAN WHERE MaTK = ?;

SELECT COUNT(*) AS n FROM TAIKHOAN WHERE VaiTro = 'QUAN_TRI' AND KichHoat = 1 AND MaTK <> ?;

DELETE FROM TAIKHOAN WHERE MaTK = ?;

-- Quên mật khẩu quản trị (dòng lệnh: npm run dat-mat-khau -- quantri <mật khẩu mới>):
UPDATE TAIKHOAN SET MatKhauHash = ?, KichHoat = 1 WHERE TenDangNhap = ?;

-- ====================================================================================================
-- 4. TRANG TỔNG QUAN (#/)
-- ====================================================================================================

-- ---- 4.1. Số bản ghi của 15 bảng (bảng "Khối lượng dữ liệu") ---------------------------------------
SELECT COUNT(*) AS n FROM SANBAY;
SELECT COUNT(*) AS n FROM HANGHANGKHONG;
SELECT COUNT(*) AS n FROM MAYBAY;
SELECT COUNT(*) AS n FROM TUYENBAY;
SELECT COUNT(*) AS n FROM CONG;
SELECT COUNT(*) AS n FROM CHUYENBAY;
SELECT COUNT(*) AS n FROM HANHKHACH;
SELECT COUNT(*) AS n FROM VE;
SELECT COUNT(*) AS n FROM HANHLY;
SELECT COUNT(*) AS n FROM MUCLUONG;
SELECT COUNT(*) AS n FROM NHANVIEN;
SELECT COUNT(*) AS n FROM THULAO;
SELECT COUNT(*) AS n FROM PHANCONG;
SELECT COUNT(*) AS n FROM DICHVU;
SELECT COUNT(*) AS n FROM SUDUNGDICHVU;

-- ---- 4.2. Biểu đồ doanh thu 3 nguồn: chạy lại hai câu của Q4 (mục 5.4) -----------------------------

-- ---- 4.3. Bốn chỉ số -------------------------------------------------------------------------------
SELECT
  (SELECT COUNT(*) FROM CHUYENBAY WHERE NgayBay = date($now)) AS chuyenHomNay,
  (SELECT COUNT(*) FROM CHUYENBAY WHERE GioKHKeHoach > $now AND TrangThai <> 'HUY') AS chuyenSapToi,
  (SELECT COUNT(*) FROM CHUYENBAY WHERE strftime('%Y-%m', NgayBay) = $thang AND TrangThai = 'HUY') AS chuyenHuyThang,
  (SELECT COUNT(*) FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
     WHERE strftime('%Y-%m', c.NgayBay) = $thang AND v.TrangThai <> 'DA_HUY') AS veThang,
  (SELECT COUNT(*) FROM MAYBAY WHERE date(NgayBaoDuongCuoi, '+180 days') < date($now)) AS mbQuaHan,
  (SELECT COUNT(*) FROM MAYBAY WHERE date(NgayBaoDuongCuoi, '+180 days') BETWEEN date($now) AND date($now, '+30 days')) AS mbSapHan;

-- ---- 4.4. Chuyến sắp khởi hành (kèm số vé và tổ phục vụ R9) ----------------------------------------
SELECT c.MaChuyen, c.SoHieuChuyen, t.SanBayDi, t.SanBayDen, c.GioKHKeHoach, c.TrangThai, cg.TenCong, mb.SoGhe,
  (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY') AS SoVe,
  (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'DIEU_PHOI_MAT_DAT') AS DieuPhoi,
  (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'LAM_THU_TUC') AS ThuTuc
FROM CHUYENBAY c JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
LEFT JOIN CONG cg ON cg.MaCong = c.MaCong
WHERE c.GioKHKeHoach > $now ORDER BY c.GioKHKeHoach LIMIT 8;

-- ---- 4.5. Cảnh báo tàu bay quá hạn bảo dưỡng: chạy lại câu của Q5 (mục 5.5) ------------------------

-- ====================================================================================================
-- 5. TRUY VẤN BÁO CÁO Q1–Q5 (#/q/1 … #/q/5)
-- ====================================================================================================

-- ---- 5.1. Q1 · Tỉ lệ lấp đầy chuyến bay trong khoảng ngày ------------------------------------------
SELECT c.MaChuyen, c.SoHieuChuyen,
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
ORDER BY TiLeLapDay DESC, c.GioKHKeHoach;

-- ---- 5.2. Q2 · Lương tháng = lương cơ bản + thưởng chuyến (G6) -------------------------------------
-- Thưởng chỉ tính cho chuyến không hủy, thuộc tháng cần tính
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
ORDER BY LuongThang DESC;

-- Cột "Chi tiết thưởng" (vai trò × số chuyến):
SELECT p.MaNV, p.VaiTro, COUNT(*) AS SoChuyen, SUM(tl.MucThuongChuyen) AS Thuong
FROM PHANCONG p JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen JOIN THULAO tl ON tl.VaiTro = p.VaiTro
WHERE strftime('%Y-%m', c.NgayBay) = $thang AND c.TrangThai <> 'HUY' AND c.GioKHKeHoach <= $now
GROUP BY p.MaNV, p.VaiTro;

-- ---- 5.3. Q3 · Hồ sơ hành khách --------------------------------------------------------------------
-- Chưa chọn khách: lấy khách có nhiều vé nhất
SELECT MaHK FROM VE GROUP BY MaHK ORDER BY COUNT(*) DESC, MaHK LIMIT 1;

SELECT * FROM HANHKHACH WHERE MaHK = $maHK;

-- Tổng chi tiêu: vé còn hiệu lực trên chuyến không hủy + phí hành lý của các vé đó + dịch vụ
SELECT
  (SELECT COALESCE(SUM(v.GiaVe), 0) FROM VE v JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
    WHERE v.MaHK = $maHK AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS TienVe,
  (SELECT COALESCE(SUM(h.PhiQuaCan), 0) FROM HANHLY h JOIN VE v ON v.MaVe = h.MaVe
    JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
    WHERE v.MaHK = $maHK AND v.TrangThai <> 'DA_HUY' AND c.TrangThai <> 'HUY') AS PhiHanhLy,
  (SELECT COALESCE(SUM(s.ThanhTien), 0) FROM SUDUNGDICHVU s WHERE s.MaHK = $maHK) AS TienDichVu;

SELECT v.MaVe, c.SoHieuChuyen, t.SanBayDi || ' → ' || t.SanBayDen AS DuongBay,
       c.GioKHKeHoach, c.TrangThai AS TrangThaiChuyen, v.HangGhe, v.SoGhe, v.GiaVe,
       v.TrangThai AS TrangThaiVe,
       (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = v.MaVe)               AS SoKienHL,
       (SELECT COALESCE(SUM(h.PhiQuaCan), 0) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS PhiHanhLy
FROM VE v
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
JOIN TUYENBAY t  ON t.MaTuyen = c.MaTuyen
WHERE v.MaHK = $maHK
ORDER BY c.GioKHKeHoach DESC;

SELECT h.MaHL, h.MaVe, c.SoHieuChuyen, h.LoaiHL, h.CanNangKg, h.PhiQuaCan
FROM HANHLY h
JOIN VE v        ON v.MaVe = h.MaVe
JOIN CHUYENBAY c ON c.MaChuyen = v.MaChuyen
WHERE v.MaHK = $maHK
ORDER BY c.GioKHKeHoach DESC, h.MaHL;

SELECT s.MaSD, s.ThoiGian, d.TenDV, s.SoLuong, s.ThanhTien
FROM SUDUNGDICHVU s
JOIN DICHVU d ON d.MaDV = s.MaDV
WHERE s.MaHK = $maHK
ORDER BY s.ThoiGian DESC;

-- ---- 5.4. Q4 · Doanh thu theo tháng, 3 nguồn (G8) --------------------------------------------------
WITH tien_ve AS (
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
ORDER BY t.Thang;

-- Doanh thu tiền vé theo hãng:
SELECT strftime('%Y-%m', c.NgayBay) AS Thang, h.MaHang, h.TenHang,
       COUNT(v.MaVe) AS SoVe, SUM(v.GiaVe) AS TienVe
FROM VE v
JOIN CHUYENBAY c      ON c.MaChuyen = v.MaChuyen
JOIN MAYBAY mb        ON mb.SoHieuMB = c.SoHieuMB
JOIN HANGHANGKHONG h  ON h.MaHang = mb.MaHang
WHERE c.TrangThai <> 'HUY' AND v.TrangThai <> 'DA_HUY'
GROUP BY Thang, h.MaHang
ORDER BY Thang, TienVe DESC;

-- ---- 5.5. Q5 · Lịch bảo dưỡng tàu bay (G2: 180 ngày) -----------------------------------------------
SELECT mb.SoHieuMB, h.TenHang, mb.Model, mb.SoGhe, mb.NgayBaoDuongCuoi,
       date(mb.NgayBaoDuongCuoi, '+180 days') AS NgayBaoDuongTiepTheo,
       CAST(julianday(date(mb.NgayBaoDuongCuoi, '+180 days')) - julianday($homNay) AS INTEGER) AS SoNgayConLai,
       CASE WHEN date(mb.NgayBaoDuongCuoi, '+180 days') < $homNay THEN 'QUA_HAN'
            WHEN date(mb.NgayBaoDuongCuoi, '+180 days') <= date($homNay, '+30 days') THEN 'SAP_TOI_HAN'
            ELSE 'CON_HAN' END AS TinhTrang,
       (SELECT COUNT(*) FROM CHUYENBAY c WHERE c.SoHieuMB = mb.SoHieuMB
          AND c.GioKHKeHoach > $now AND c.TrangThai <> 'HUY') AS SoChuyenSapToi
FROM MAYBAY mb
JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
ORDER BY NgayBaoDuongTiepTheo;

-- ====================================================================================================
-- 6. CHI TIẾT CHUYẾN BAY (#/chuyen/<mã>)
-- ====================================================================================================

-- ---- 6.1. Xem chuyến -------------------------------------------------------------------------------
SELECT c.*, t.SanBayDi, t.SanBayDen, t.ThoiGianBayPhut, t.KhoangCachKm,
       sd.ThanhPho AS ThanhPhoDi, sn.ThanhPho AS ThanhPhoDen,
       mb.Model, mb.SoGhe, mb.MaHang, h.TenHang, cg.TenCong, cg.KhuVuc
FROM CHUYENBAY c
JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen
JOIN SANBAY sd ON sd.MaSanBay = t.SanBayDi JOIN SANBAY sn ON sn.MaSanBay = t.SanBayDen
JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB JOIN HANGHANGKHONG h ON h.MaHang = mb.MaHang
LEFT JOIN CONG cg ON cg.MaCong = c.MaCong
WHERE c.MaChuyen = ?;

-- Danh sách vé (sơ đồ ghế tô xám ghế đã bán):
SELECT v.*, hk.HoTen, hk.SoGiayTo,
  (SELECT COUNT(*) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS SoKienHL,
  (SELECT COALESCE(SUM(PhiQuaCan), 0) FROM HANHLY h WHERE h.MaVe = v.MaVe) AS PhiHanhLy
FROM VE v JOIN HANHKHACH hk ON hk.MaHK = v.MaHK
WHERE v.MaChuyen = ? ORDER BY v.MaVe;

-- Tổ phục vụ mặt đất:
SELECT p.MaNV, p.VaiTro, nv.HoTen, nv.ViTri, nv.Sdt, tl.MucThuongChuyen
FROM PHANCONG p JOIN NHANVIEN nv ON nv.MaNV = p.MaNV JOIN THULAO tl ON tl.VaiTro = p.VaiTro
WHERE p.MaChuyen = ? ORDER BY p.VaiTro, nv.HoTen;

-- R9 — đủ tổ phục vụ chưa (tầng ứng dụng: cần ≥ 1 điều phối mặt đất và ≥ 2 làm thủ tục):
SELECT SUM(VaiTro = 'DIEU_PHOI_MAT_DAT') AS dieuPhoi,
       SUM(VaiTro = 'LAM_THU_TUC')       AS thuTuc
FROM PHANCONG WHERE MaChuyen = ?;

-- ---- 6.2. Đổi trạng thái chuyến (Quản trị, Điều phối) ----------------------------------------------
SELECT * FROM CHUYENBAY WHERE MaChuyen = ?;

-- Chuyển sang LAM_THU_TUC / DA_CAT_CANH / DA_HA_CANH / TRE từ trạng thái trước đó: kiểm tra R9 trước
SELECT SUM(VaiTro = 'DIEU_PHOI_MAT_DAT') AS dieuPhoi,
       SUM(VaiTro = 'LAM_THU_TUC')       AS thuTuc
FROM PHANCONG WHERE MaChuyen = ?;

BEGIN;
UPDATE CHUYENBAY SET TrangThai = ?, GioKHThucTe = ? WHERE MaChuyen = ?;

-- Chỉ khi hủy chuyến (TrangThai = HUY): các vé còn hiệu lực chuyển sang DA_HUY
UPDATE VE SET TrangThai = 'DA_HUY' WHERE MaChuyen = ? AND TrangThai <> 'DA_HUY';
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sau đó chạy lại các câu của mục 6.1 để hiển thị chuyến.

-- ---- 6.3. Phân công / gỡ nhân viên: dùng INSERT / DELETE của bảng PHANCONG (mục 9), trigger R10 kiểm tra trùng lịch ----

-- ====================================================================================================
-- 7. BÁN VÉ (#/ban-ve) — Quản trị, Bán vé
-- ====================================================================================================

-- ---- 7.1. Danh sách chuyến còn mở bán --------------------------------------------------------------
SELECT c.MaChuyen, c.SoHieuChuyen, t.SanBayDi, t.SanBayDen, c.GioKHKeHoach, c.GiaVeCoBan, c.TrangThai, mb.SoGhe,
  (SELECT COUNT(*) FROM VE v WHERE v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY') AS SoVe
FROM CHUYENBAY c JOIN TUYENBAY t ON t.MaTuyen = c.MaTuyen JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
WHERE c.GioKHKeHoach > $now AND c.TrangThai IN ('LEN_LICH','LAM_THU_TUC','TRE')
ORDER BY c.GioKHKeHoach;

-- Chọn chuyến: chạy các câu của mục 6.1 để vẽ sơ đồ ghế. Ô chọn khách: câu "options" của HANHKHACH (mục 9).

-- ---- 7.2. Xác nhận bán vé --------------------------------------------------------------------------
SELECT c.*, mb.SoGhe AS TongGhe FROM CHUYENBAY c JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB WHERE MaChuyen = ?;

-- Khách mới, vé và mọi kiện hành lý nằm trong MỘT transaction (tính nguyên tử):
BEGIN;
-- Chỉ khi nhập khách mới: tìm theo số giấy tờ, chưa có thì thêm
SELECT MaHK FROM HANHKHACH WHERE SoGiayTo = ?;

INSERT INTO HANHKHACH (SoGiayTo, HoTen, NgaySinh, QuocTich, Sdt, Email) VALUES (?, ?, ?, ?, ?, ?);

-- Trigger R1 (hết ghế), UNIQUE R2 (khách đã có vé), UNIQUE R3 (trùng ghế) kiểm tra ở câu này:
INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat, TrangThai) VALUES (?, ?, ?, ?, ?, ?, 'DA_DAT');

-- Mỗi kiện một câu; CHECK R7 (≤ 32 kg) và trigger R8 (số kiện) kiểm tra ở đây. PhiQuaCan tính theo G4 ở máy chủ.
INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, ?, ?, ?);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ====================================================================================================
-- 8. GHI NHẬN BẢO DƯỠNG (nút ở Q5) — Quản trị, Điều phối
-- ====================================================================================================
UPDATE MAYBAY SET NgayBaoDuongCuoi = ? WHERE SoHieuMB = ?;

-- ====================================================================================================
-- 9. QUẢN LÝ DỮ LIỆU 15 BẢNG (menu Danh mục / Khai thác / Hành khách / Nhân sự / Dịch vụ)
-- ====================================================================================================
-- Câu lệnh được máy chủ sinh từ danh sách cột của từng bảng (server/meta.js). Mỗi bảng có:
-- - Danh sách: đếm tổng + lấy 1 trang (mặc định 20 dòng/trang; OFFSET = (trang - 1) × 20). Khóa ngoại được JOIN để
--   hiện tên thay vì mã. Bấm tiêu đề cột thì đổi ORDER BY; ô tìm kiếm thêm điều kiện WHERE ... LIKE $q ($q = '%từ khóa%').
-- - Ô chọn: danh sách giá trị cho khóa ngoại ở bảng khác.
-- - Thêm / Sửa / Xóa: một câu trong transaction. Sửa chỉ SET các cột thực sự thay đổi (dưới đây ghi đủ cột).
-- Sau Thêm / Sửa / Xóa, trang tải lại danh sách và chạy lại 15 câu đếm ở mục 4.1 (số trên menu).

-- ---- 9.0. Đếm số bản ghi 15 bảng (khi mở web, sau mỗi lần ghi): 15 câu như mục 4.1 -----------------

-- ---- 9.1. SANBAY — Sân bay -------------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM SANBAY m;

SELECT m.*
FROM SANBAY m
ORDER BY m.MaSanBay ASC, m.MaSanBay LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaSanBay AS TEXT) LIKE $q
--       OR CAST(m.TenSanBay AS TEXT) LIKE $q
--       OR CAST(m.ThanhPho AS TEXT) LIKE $q
--       OR CAST(m.QuocGia AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaSanBay AS value, m.MaSanBay || ' – ' || m.ThanhPho AS label FROM SANBAY m ORDER BY m.MaSanBay LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO SANBAY (MaSanBay, TenSanBay, ThanhPho, QuocGia)
VALUES ($MaSanBay, $TenSanBay, $ThanhPho, $QuocGia);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM SANBAY WHERE MaSanBay = $pk_MaSanBay;

BEGIN;
UPDATE SANBAY SET MaSanBay = $MaSanBay, TenSanBay = $TenSanBay, ThanhPho = $ThanhPho, QuocGia = $QuocGia
WHERE MaSanBay = $pk_MaSanBay;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM SANBAY WHERE MaSanBay = $pk_MaSanBay;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.2. HANGHANGKHONG — Hãng hàng không ----------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM HANGHANGKHONG m;

SELECT m.*
FROM HANGHANGKHONG m
ORDER BY m.MaHang ASC, m.MaHang LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaHang AS TEXT) LIKE $q
--       OR CAST(m.TenHang AS TEXT) LIKE $q
--       OR CAST(m.QuocGia AS TEXT) LIKE $q
--       OR CAST(m.SdtLienHe AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaHang AS value, m.MaHang || ' – ' || m.TenHang AS label FROM HANGHANGKHONG m ORDER BY m.MaHang LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO HANGHANGKHONG (MaHang, TenHang, QuocGia, SdtLienHe)
VALUES ($MaHang, $TenHang, $QuocGia, $SdtLienHe);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM HANGHANGKHONG WHERE MaHang = $pk_MaHang;

BEGIN;
UPDATE HANGHANGKHONG SET MaHang = $MaHang, TenHang = $TenHang, QuocGia = $QuocGia, SdtLienHe = $SdtLienHe
WHERE MaHang = $pk_MaHang;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM HANGHANGKHONG WHERE MaHang = $pk_MaHang;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.3. MAYBAY — Tàu bay -------------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM MAYBAY m
LEFT JOIN HANGHANGKHONG f0 ON f0.MaHang = m.MaHang;

SELECT m.*,
       f0.MaHang || ' – ' || f0.TenHang AS "MaHang__label"
FROM MAYBAY m
LEFT JOIN HANGHANGKHONG f0 ON f0.MaHang = m.MaHang
ORDER BY m.SoHieuMB ASC, m.SoHieuMB LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.SoHieuMB AS TEXT) LIKE $q
--       OR CAST(m.MaHang AS TEXT) LIKE $q
--       OR CAST(m.HangSanXuat AS TEXT) LIKE $q
--       OR CAST(m.Model AS TEXT) LIKE $q
--       OR CAST(m.SoGhe AS TEXT) LIKE $q
--       OR CAST(m.NamSanXuat AS TEXT) LIKE $q
--       OR CAST(m.NgayBaoDuongCuoi AS TEXT) LIKE $q
--       OR f0.MaHang || ' – ' || f0.TenHang LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.SoHieuMB AS value, m.SoHieuMB || ' (' || m.Model || ')' AS label FROM MAYBAY m ORDER BY m.SoHieuMB LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO MAYBAY (SoHieuMB, MaHang, HangSanXuat, Model, SoGhe, NamSanXuat, NgayBaoDuongCuoi)
VALUES ($SoHieuMB, $MaHang, $HangSanXuat, $Model, $SoGhe, $NamSanXuat, $NgayBaoDuongCuoi);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM MAYBAY WHERE SoHieuMB = $pk_SoHieuMB;

BEGIN;
UPDATE MAYBAY SET SoHieuMB = $SoHieuMB, MaHang = $MaHang, HangSanXuat = $HangSanXuat, Model = $Model, SoGhe = $SoGhe, NamSanXuat = $NamSanXuat, NgayBaoDuongCuoi = $NgayBaoDuongCuoi
WHERE SoHieuMB = $pk_SoHieuMB;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM MAYBAY WHERE SoHieuMB = $pk_SoHieuMB;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.4. TUYENBAY — Đường bay ---------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM TUYENBAY m
LEFT JOIN SANBAY f0 ON f0.MaSanBay = m.SanBayDi
LEFT JOIN SANBAY f1 ON f1.MaSanBay = m.SanBayDen;

SELECT m.*,
       f0.MaSanBay || ' – ' || f0.ThanhPho AS "SanBayDi__label",
       f1.MaSanBay || ' – ' || f1.ThanhPho AS "SanBayDen__label"
FROM TUYENBAY m
LEFT JOIN SANBAY f0 ON f0.MaSanBay = m.SanBayDi
LEFT JOIN SANBAY f1 ON f1.MaSanBay = m.SanBayDen
ORDER BY m.MaTuyen ASC, m.MaTuyen LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaTuyen AS TEXT) LIKE $q
--       OR CAST(m.SanBayDi AS TEXT) LIKE $q
--       OR CAST(m.SanBayDen AS TEXT) LIKE $q
--       OR CAST(m.KhoangCachKm AS TEXT) LIKE $q
--       OR CAST(m.ThoiGianBayPhut AS TEXT) LIKE $q
--       OR f0.MaSanBay || ' – ' || f0.ThanhPho LIKE $q
--       OR f1.MaSanBay || ' – ' || f1.ThanhPho LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaTuyen AS value, m.SanBayDi || ' → ' || m.SanBayDen AS label FROM TUYENBAY m ORDER BY m.MaTuyen LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO TUYENBAY (SanBayDi, SanBayDen, KhoangCachKm, ThoiGianBayPhut)
VALUES ($SanBayDi, $SanBayDen, $KhoangCachKm, $ThoiGianBayPhut);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM TUYENBAY WHERE MaTuyen = $pk_MaTuyen;

BEGIN;
UPDATE TUYENBAY SET SanBayDi = $SanBayDi, SanBayDen = $SanBayDen, KhoangCachKm = $KhoangCachKm, ThoiGianBayPhut = $ThoiGianBayPhut
WHERE MaTuyen = $pk_MaTuyen;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM TUYENBAY WHERE MaTuyen = $pk_MaTuyen;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.5. CONG — Cổng ------------------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM CONG m;

SELECT m.*
FROM CONG m
ORDER BY m.MaCong ASC, m.MaCong LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaCong AS TEXT) LIKE $q
--       OR CAST(m.TenCong AS TEXT) LIKE $q
--       OR CAST(m.KhuVuc AS TEXT) LIKE $q
--       OR CAST(m.LoaiCong AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaCong AS value, m.TenCong || ' (' || m.KhuVuc || ')' AS label FROM CONG m ORDER BY m.MaCong LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO CONG (TenCong, KhuVuc, LoaiCong)
VALUES ($TenCong, $KhuVuc, $LoaiCong);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM CONG WHERE MaCong = $pk_MaCong;

BEGIN;
UPDATE CONG SET TenCong = $TenCong, KhuVuc = $KhuVuc, LoaiCong = $LoaiCong
WHERE MaCong = $pk_MaCong;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM CONG WHERE MaCong = $pk_MaCong;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.6. CHUYENBAY — Chuyến bay -------------------------------------------------------------------
-- Trigger R4 (tàu bay), R5 (cổng), R6 (bảo dưỡng), R1 (đổi sang tàu ít ghế hơn) kiểm tra khi INSERT / UPDATE.
-- Tạo mới ở trạng thái khác LEN_LICH hoặc sửa TrangThai: kiểm tra R9 (câu ở mục 6.2) trước.
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM CHUYENBAY m
LEFT JOIN TUYENBAY f0 ON f0.MaTuyen = m.MaTuyen
LEFT JOIN MAYBAY f1 ON f1.SoHieuMB = m.SoHieuMB
LEFT JOIN CONG f2 ON f2.MaCong = m.MaCong;

SELECT m.*,
       f0.SanBayDi || ' → ' || f0.SanBayDen AS "MaTuyen__label",
       f1.SoHieuMB || ' (' || f1.Model || ')' AS "SoHieuMB__label",
       f2.TenCong || ' (' || f2.KhuVuc || ')' AS "MaCong__label"
FROM CHUYENBAY m
LEFT JOIN TUYENBAY f0 ON f0.MaTuyen = m.MaTuyen
LEFT JOIN MAYBAY f1 ON f1.SoHieuMB = m.SoHieuMB
LEFT JOIN CONG f2 ON f2.MaCong = m.MaCong
ORDER BY m.GioKHKeHoach DESC, m.MaChuyen LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaChuyen AS TEXT) LIKE $q
--       OR CAST(m.SoHieuChuyen AS TEXT) LIKE $q
--       OR CAST(m.MaTuyen AS TEXT) LIKE $q
--       OR CAST(m.SoHieuMB AS TEXT) LIKE $q
--       OR CAST(m.MaCong AS TEXT) LIKE $q
--       OR CAST(m.NgayBay AS TEXT) LIKE $q
--       OR CAST(m.GioKHKeHoach AS TEXT) LIKE $q
--       OR CAST(m.GioKHThucTe AS TEXT) LIKE $q
--       OR CAST(m.GioDenKeHoach AS TEXT) LIKE $q
--       OR CAST(m.TrangThai AS TEXT) LIKE $q
--       OR CAST(m.GiaVeCoBan AS TEXT) LIKE $q
--       OR f0.SanBayDi || ' → ' || f0.SanBayDen LIKE $q
--       OR f1.SoHieuMB || ' (' || f1.Model || ')' LIKE $q
--       OR f2.TenCong || ' (' || f2.KhuVuc || ')' LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaChuyen AS value, m.SoHieuChuyen || ' · ' || substr(m.GioKHKeHoach, 1, 16) AS label FROM CHUYENBAY m ORDER BY m.GioKHKeHoach DESC LIMIT 2000;

-- Bỏ trống giờ đến: tính từ thời gian bay của đường bay:
SELECT ThoiGianBayPhut FROM TUYENBAY WHERE MaTuyen = ?;

SELECT datetime(?, '+' || ? || ' minutes') AS g;

-- Thêm:
BEGIN;
INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioKHThucTe, GioDenKeHoach, TrangThai, GiaVeCoBan)
VALUES ($SoHieuChuyen, $MaTuyen, $SoHieuMB, $MaCong, $NgayBay, $GioKHKeHoach, $GioKHThucTe, $GioDenKeHoach, $TrangThai, $GiaVeCoBan);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM CHUYENBAY WHERE MaChuyen = $pk_MaChuyen;

BEGIN;
UPDATE CHUYENBAY SET SoHieuChuyen = $SoHieuChuyen, MaTuyen = $MaTuyen, SoHieuMB = $SoHieuMB, MaCong = $MaCong, NgayBay = $NgayBay, GioKHKeHoach = $GioKHKeHoach, GioKHThucTe = $GioKHThucTe, GioDenKeHoach = $GioDenKeHoach, TrangThai = $TrangThai, GiaVeCoBan = $GiaVeCoBan
WHERE MaChuyen = $pk_MaChuyen;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM CHUYENBAY WHERE MaChuyen = $pk_MaChuyen;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.7. HANHKHACH — Hành khách -------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM HANHKHACH m;

SELECT m.*
FROM HANHKHACH m
ORDER BY m.MaHK ASC, m.MaHK LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaHK AS TEXT) LIKE $q
--       OR CAST(m.SoGiayTo AS TEXT) LIKE $q
--       OR CAST(m.HoTen AS TEXT) LIKE $q
--       OR CAST(m.NgaySinh AS TEXT) LIKE $q
--       OR CAST(m.QuocTich AS TEXT) LIKE $q
--       OR CAST(m.Sdt AS TEXT) LIKE $q
--       OR CAST(m.Email AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaHK AS value, m.HoTen || ' · ' || m.SoGiayTo AS label FROM HANHKHACH m ORDER BY m.HoTen LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO HANHKHACH (SoGiayTo, HoTen, NgaySinh, QuocTich, Sdt, Email)
VALUES ($SoGiayTo, $HoTen, $NgaySinh, $QuocTich, $Sdt, $Email);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM HANHKHACH WHERE MaHK = $pk_MaHK;

BEGIN;
UPDATE HANHKHACH SET SoGiayTo = $SoGiayTo, HoTen = $HoTen, NgaySinh = $NgaySinh, QuocTich = $QuocTich, Sdt = $Sdt, Email = $Email
WHERE MaHK = $pk_MaHK;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM HANHKHACH WHERE MaHK = $pk_MaHK;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.8. VE — Vé ----------------------------------------------------------------------------------
-- Trigger R1, UNIQUE R2 và R3 kiểm tra khi INSERT / UPDATE.
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM VE m
LEFT JOIN CHUYENBAY f0 ON f0.MaChuyen = m.MaChuyen
LEFT JOIN HANHKHACH f1 ON f1.MaHK = m.MaHK;

SELECT m.*,
       f0.SoHieuChuyen || ' · ' || substr(f0.GioKHKeHoach, 1, 16) AS "MaChuyen__label",
       f1.HoTen || ' · ' || f1.SoGiayTo AS "MaHK__label"
FROM VE m
LEFT JOIN CHUYENBAY f0 ON f0.MaChuyen = m.MaChuyen
LEFT JOIN HANHKHACH f1 ON f1.MaHK = m.MaHK
ORDER BY m.MaVe DESC, m.MaVe LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaVe AS TEXT) LIKE $q
--       OR CAST(m.MaChuyen AS TEXT) LIKE $q
--       OR CAST(m.MaHK AS TEXT) LIKE $q
--       OR CAST(m.HangGhe AS TEXT) LIKE $q
--       OR CAST(m.SoGhe AS TEXT) LIKE $q
--       OR CAST(m.GiaVe AS TEXT) LIKE $q
--       OR CAST(m.NgayDat AS TEXT) LIKE $q
--       OR CAST(m.TrangThai AS TEXT) LIKE $q
--       OR f0.SoHieuChuyen || ' · ' || substr(f0.GioKHKeHoach, 1, 16) LIKE $q
--       OR f1.HoTen || ' · ' || f1.SoGiayTo LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaVe AS value, 'Vé #' || m.MaVe || ' · ghế ' || m.SoGhe AS label FROM VE m ORDER BY m.MaVe DESC LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat, TrangThai)
VALUES ($MaChuyen, $MaHK, $HangGhe, $SoGhe, $GiaVe, $NgayDat, $TrangThai);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM VE WHERE MaVe = $pk_MaVe;

BEGIN;
UPDATE VE SET MaChuyen = $MaChuyen, MaHK = $MaHK, HangGhe = $HangGhe, SoGhe = $SoGhe, GiaVe = $GiaVe, NgayDat = $NgayDat, TrangThai = $TrangThai
WHERE MaVe = $pk_MaVe;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM VE WHERE MaVe = $pk_MaVe;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.9. HANHLY — Hành lý -------------------------------------------------------------------------
-- PhiQuaCan do máy chủ tính theo G4. CHECK R7 và trigger R8 kiểm tra khi INSERT / UPDATE.
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM HANHLY m
LEFT JOIN VE f0 ON f0.MaVe = m.MaVe;

SELECT m.*,
       'Vé #' || f0.MaVe || ' · ghế ' || f0.SoGhe AS "MaVe__label"
FROM HANHLY m
LEFT JOIN VE f0 ON f0.MaVe = m.MaVe
ORDER BY m.MaHL DESC, m.MaHL LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaHL AS TEXT) LIKE $q
--       OR CAST(m.MaVe AS TEXT) LIKE $q
--       OR CAST(m.LoaiHL AS TEXT) LIKE $q
--       OR CAST(m.CanNangKg AS TEXT) LIKE $q
--       OR CAST(m.PhiQuaCan AS TEXT) LIKE $q
--       OR 'Vé #' || f0.MaVe || ' · ghế ' || f0.SoGhe LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Thêm:
BEGIN;
INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan)
VALUES ($MaVe, $LoaiHL, $CanNangKg, $PhiQuaCan);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM HANHLY WHERE MaHL = $pk_MaHL;

BEGIN;
UPDATE HANHLY SET MaVe = $MaVe, LoaiHL = $LoaiHL, CanNangKg = $CanNangKg, PhiQuaCan = $PhiQuaCan
WHERE MaHL = $pk_MaHL;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM HANHLY WHERE MaHL = $pk_MaHL;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.10. MUCLUONG — Mức lương --------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM MUCLUONG m;

SELECT m.*
FROM MUCLUONG m
ORDER BY m.ViTri ASC, m.ViTri, m.Bac LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.ViTri AS TEXT) LIKE $q
--       OR CAST(m.Bac AS TEXT) LIKE $q
--       OR CAST(m.LuongCoBan AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Thêm:
BEGIN;
INSERT INTO MUCLUONG (ViTri, Bac, LuongCoBan)
VALUES ($ViTri, $Bac, $LuongCoBan);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM MUCLUONG WHERE ViTri = $pk_ViTri AND Bac = $pk_Bac;

BEGIN;
UPDATE MUCLUONG SET ViTri = $ViTri, Bac = $Bac, LuongCoBan = $LuongCoBan
WHERE ViTri = $pk_ViTri AND Bac = $pk_Bac;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM MUCLUONG WHERE ViTri = $pk_ViTri AND Bac = $pk_Bac;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.11. NHANVIEN — Nhân viên --------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM NHANVIEN m;

SELECT m.*
FROM NHANVIEN m
ORDER BY m.MaNV ASC, m.MaNV LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaNV AS TEXT) LIKE $q
--       OR CAST(m.CCCD AS TEXT) LIKE $q
--       OR CAST(m.HoTen AS TEXT) LIKE $q
--       OR CAST(m.NgaySinh AS TEXT) LIKE $q
--       OR CAST(m.DiaChi AS TEXT) LIKE $q
--       OR CAST(m.Sdt AS TEXT) LIKE $q
--       OR CAST(m.ViTri AS TEXT) LIKE $q
--       OR CAST(m.Bac AS TEXT) LIKE $q
--       OR CAST(m.ThamNienNam AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaNV AS value, m.HoTen || ' · ' || m.ViTri AS label FROM NHANVIEN m ORDER BY m.HoTen LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO NHANVIEN (CCCD, HoTen, NgaySinh, DiaChi, Sdt, ViTri, Bac, ThamNienNam)
VALUES ($CCCD, $HoTen, $NgaySinh, $DiaChi, $Sdt, $ViTri, $Bac, $ThamNienNam);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM NHANVIEN WHERE MaNV = $pk_MaNV;

BEGIN;
UPDATE NHANVIEN SET CCCD = $CCCD, HoTen = $HoTen, NgaySinh = $NgaySinh, DiaChi = $DiaChi, Sdt = $Sdt, ViTri = $ViTri, Bac = $Bac, ThamNienNam = $ThamNienNam
WHERE MaNV = $pk_MaNV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM NHANVIEN WHERE MaNV = $pk_MaNV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.12. THULAO — Thù lao ------------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM THULAO m;

SELECT m.*
FROM THULAO m
ORDER BY m.VaiTro ASC, m.VaiTro LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.VaiTro AS TEXT) LIKE $q
--       OR CAST(m.MucThuongChuyen AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.VaiTro AS value, m.VaiTro AS label FROM THULAO m ORDER BY m.VaiTro LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO THULAO (VaiTro, MucThuongChuyen)
VALUES ($VaiTro, $MucThuongChuyen);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM THULAO WHERE VaiTro = $pk_VaiTro;

BEGIN;
UPDATE THULAO SET VaiTro = $VaiTro, MucThuongChuyen = $MucThuongChuyen
WHERE VaiTro = $pk_VaiTro;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM THULAO WHERE VaiTro = $pk_VaiTro;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.13. PHANCONG — Phân công --------------------------------------------------------------------
-- Trigger R10 (nhân viên trùng lịch dưới 120 phút) kiểm tra khi INSERT / UPDATE.
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM PHANCONG m
LEFT JOIN CHUYENBAY f0 ON f0.MaChuyen = m.MaChuyen
LEFT JOIN NHANVIEN f1 ON f1.MaNV = m.MaNV;

SELECT m.*,
       f0.SoHieuChuyen || ' · ' || substr(f0.GioKHKeHoach, 1, 16) AS "MaChuyen__label",
       f1.HoTen || ' · ' || f1.ViTri AS "MaNV__label"
FROM PHANCONG m
LEFT JOIN CHUYENBAY f0 ON f0.MaChuyen = m.MaChuyen
LEFT JOIN NHANVIEN f1 ON f1.MaNV = m.MaNV
ORDER BY m.MaChuyen DESC, m.MaChuyen, m.MaNV LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaChuyen AS TEXT) LIKE $q
--       OR CAST(m.MaNV AS TEXT) LIKE $q
--       OR CAST(m.VaiTro AS TEXT) LIKE $q
--       OR f0.SoHieuChuyen || ' · ' || substr(f0.GioKHKeHoach, 1, 16) LIKE $q
--       OR f1.HoTen || ' · ' || f1.ViTri LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Thêm:
BEGIN;
INSERT INTO PHANCONG (MaChuyen, MaNV, VaiTro)
VALUES ($MaChuyen, $MaNV, $VaiTro);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM PHANCONG WHERE MaChuyen = $pk_MaChuyen AND MaNV = $pk_MaNV;

BEGIN;
UPDATE PHANCONG SET MaChuyen = $MaChuyen, MaNV = $MaNV, VaiTro = $VaiTro
WHERE MaChuyen = $pk_MaChuyen AND MaNV = $pk_MaNV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM PHANCONG WHERE MaChuyen = $pk_MaChuyen AND MaNV = $pk_MaNV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.14. DICHVU — Dịch vụ ------------------------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM DICHVU m;

SELECT m.*
FROM DICHVU m
ORDER BY m.MaDV ASC, m.MaDV LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaDV AS TEXT) LIKE $q
--       OR CAST(m.TenDV AS TEXT) LIKE $q
--       OR CAST(m.DonGia AS TEXT) LIKE $q
--       OR CAST(m.MoTa AS TEXT) LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- Ô chọn khi bảng khác tham chiếu tới bảng này:
SELECT m.MaDV AS value, m.TenDV AS label FROM DICHVU m ORDER BY m.MaDV LIMIT 2000;

-- Thêm:
BEGIN;
INSERT INTO DICHVU (TenDV, DonGia, MoTa)
VALUES ($TenDV, $DonGia, $MoTa);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM DICHVU WHERE MaDV = $pk_MaDV;

BEGIN;
UPDATE DICHVU SET TenDV = $TenDV, DonGia = $DonGia, MoTa = $MoTa
WHERE MaDV = $pk_MaDV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM DICHVU WHERE MaDV = $pk_MaDV;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ---- 9.15. SUDUNGDICHVU — Sử dụng dịch vụ ----------------------------------------------------------
-- Danh sách (trang 1):
SELECT COUNT(*) AS n FROM SUDUNGDICHVU m
LEFT JOIN HANHKHACH f0 ON f0.MaHK = m.MaHK
LEFT JOIN DICHVU f1 ON f1.MaDV = m.MaDV;

SELECT m.*,
       f0.HoTen || ' · ' || f0.SoGiayTo AS "MaHK__label",
       f1.TenDV AS "MaDV__label"
FROM SUDUNGDICHVU m
LEFT JOIN HANHKHACH f0 ON f0.MaHK = m.MaHK
LEFT JOIN DICHVU f1 ON f1.MaDV = m.MaDV
ORDER BY m.ThoiGian DESC, m.MaSD LIMIT 20 OFFSET 0;

-- Tìm kiếm: thêm vào cả hai câu trên
--   WHERE (CAST(m.MaSD AS TEXT) LIKE $q
--       OR CAST(m.MaHK AS TEXT) LIKE $q
--       OR CAST(m.MaDV AS TEXT) LIKE $q
--       OR CAST(m.ThoiGian AS TEXT) LIKE $q
--       OR CAST(m.SoLuong AS TEXT) LIKE $q
--       OR CAST(m.ThanhTien AS TEXT) LIKE $q
--       OR f0.HoTen || ' · ' || f0.SoGiayTo LIKE $q
--       OR f1.TenDV LIKE $q)
-- Lọc theo cột (ví dụ mở từ trang khác, ?f_<Cột>=giá trị): thêm  AND m.<Cột> = $f_<Cột>

-- ThanhTien = SoLuong × đơn giá hiện hành (mục 5.4: chỉ sửa số lượng thì giữ đơn giá cũ):
SELECT DonGia FROM DICHVU WHERE MaDV = ?;

-- Thêm:
BEGIN;
INSERT INTO SUDUNGDICHVU (MaHK, MaDV, ThoiGian, SoLuong, ThanhTien)
VALUES ($MaHK, $MaDV, $ThoiGian, $SoLuong, $ThanhTien);
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Sửa: đọc bản ghi cũ, rồi cập nhật các cột thay đổi
SELECT * FROM SUDUNGDICHVU WHERE MaSD = $pk_MaSD;

BEGIN;
UPDATE SUDUNGDICHVU SET MaHK = $MaHK, MaDV = $MaDV, ThoiGian = $ThoiGian, SoLuong = $SoLuong, ThanhTien = $ThanhTien
WHERE MaSD = $pk_MaSD;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- Xóa (khóa ngoại ON DELETE RESTRICT chặn nếu bản ghi đang được tham chiếu):
BEGIN;
DELETE FROM SUDUNGDICHVU WHERE MaSD = $pk_MaSD;
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ====================================================================================================
-- 10. NHẬT KÝ SQL (#/nhat-ky-sql)
-- ====================================================================================================
-- Trang này KHÔNG chạy câu SQL nào: nhật ký được giữ trong bộ nhớ máy chủ và trả về cho trình duyệt mỗi giây.

-- ====================================================================================================
-- 11. NẠP LẠI DỮ LIỆU MẪU (nút ở Tổng quan, chỉ Quản trị; cũng chạy khi khởi động mà CSDL rỗng)
-- ====================================================================================================

-- ---- 11.1. Xóa 15 bảng (giữ lại TAIKHOAN) ----------------------------------------------------------
PRAGMA foreign_keys = OFF;

SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'TAIKHOAN';

BEGIN;
DROP TABLE IF EXISTS "SANBAY";
DROP TABLE IF EXISTS "HANGHANGKHONG";
DROP TABLE IF EXISTS "MAYBAY";
DROP TABLE IF EXISTS "TUYENBAY";
DROP TABLE IF EXISTS "CONG";
DROP TABLE IF EXISTS "CHUYENBAY";
DROP TABLE IF EXISTS "HANHKHACH";
DROP TABLE IF EXISTS "VE";
DROP TABLE IF EXISTS "HANHLY";
DROP TABLE IF EXISTS "MUCLUONG";
DROP TABLE IF EXISTS "NHANVIEN";
DROP TABLE IF EXISTS "THULAO";
DROP TABLE IF EXISTS "PHANCONG";
DROP TABLE IF EXISTS "DICHVU";
DROP TABLE IF EXISTS "SUDUNGDICHVU";
DROP TABLE IF EXISTS "sqlite_sequence";   -- nếu có
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

PRAGMA foreign_keys = ON;

-- ---- 11.2. Tạo lại lược đồ: toàn bộ mục 2 ----------------------------------------------------------

-- ---- 11.3. Chèn dữ liệu mẫu theo thứ tự cha trước con (mỗi dòng dữ liệu một lần chạy) --------------
BEGIN;
INSERT INTO SANBAY (MaSanBay,TenSanBay,ThanhPho,QuocGia) VALUES ($MaSanBay,$TenSanBay,$ThanhPho,$QuocGia);   -- × 6
INSERT INTO HANGHANGKHONG (MaHang,TenHang,QuocGia,SdtLienHe) VALUES ($MaHang,$TenHang,$QuocGia,$SdtLienHe);   -- × 3
INSERT INTO MAYBAY (SoHieuMB,MaHang,HangSanXuat,Model,SoGhe,NamSanXuat,NgayBaoDuongCuoi) VALUES ($SoHieuMB,$MaHang,$HangSanXuat,$Model,$SoGhe,$NamSanXuat,$NgayBaoDuongCuoi);   -- × 8
INSERT INTO TUYENBAY (MaTuyen,SanBayDi,SanBayDen,KhoangCachKm,ThoiGianBayPhut) VALUES ($MaTuyen,$SanBayDi,$SanBayDen,$KhoangCachKm,$ThoiGianBayPhut);   -- × 10
INSERT INTO CONG (MaCong,TenCong,KhuVuc,LoaiCong) VALUES ($MaCong,$TenCong,$KhuVuc,$LoaiCong);   -- × 8
INSERT INTO CHUYENBAY (MaChuyen,SoHieuChuyen,MaTuyen,SoHieuMB,MaCong,NgayBay,GioKHKeHoach,GioKHThucTe,GioDenKeHoach,TrangThai,GiaVeCoBan) VALUES ($MaChuyen,$SoHieuChuyen,$MaTuyen,$SoHieuMB,$MaCong,$NgayBay,$GioKHKeHoach,$GioKHThucTe,$GioDenKeHoach,$TrangThai,$GiaVeCoBan);   -- × 60
INSERT INTO HANHKHACH (MaHK,SoGiayTo,HoTen,NgaySinh,QuocTich,Sdt,Email) VALUES ($MaHK,$SoGiayTo,$HoTen,$NgaySinh,$QuocTich,$Sdt,$Email);   -- × 40
INSERT INTO VE (MaVe,MaChuyen,MaHK,HangGhe,SoGhe,GiaVe,NgayDat,TrangThai) VALUES ($MaVe,$MaChuyen,$MaHK,$HangGhe,$SoGhe,$GiaVe,$NgayDat,$TrangThai);   -- × 300
INSERT INTO HANHLY (MaHL,MaVe,LoaiHL,CanNangKg,PhiQuaCan) VALUES ($MaHL,$MaVe,$LoaiHL,$CanNangKg,$PhiQuaCan);   -- × 350
INSERT INTO MUCLUONG (ViTri,Bac,LuongCoBan) VALUES ($ViTri,$Bac,$LuongCoBan);   -- × 25
INSERT INTO NHANVIEN (MaNV,CCCD,HoTen,NgaySinh,DiaChi,Sdt,ViTri,Bac,ThamNienNam) VALUES ($MaNV,$CCCD,$HoTen,$NgaySinh,$DiaChi,$Sdt,$ViTri,$Bac,$ThamNienNam);   -- × 20
INSERT INTO THULAO (VaiTro,MucThuongChuyen) VALUES ($VaiTro,$MucThuongChuyen);   -- × 4
INSERT INTO PHANCONG (MaChuyen,MaNV,VaiTro) VALUES ($MaChuyen,$MaNV,$VaiTro);   -- × 240
INSERT INTO DICHVU (MaDV,TenDV,DonGia,MoTa) VALUES ($MaDV,$TenDV,$DonGia,$MoTa);   -- × 5
INSERT INTO SUDUNGDICHVU (MaSD,MaHK,MaDV,ThoiGian,SoLuong,ThanhTien) VALUES ($MaSD,$MaHK,$MaDV,$ThoiGian,$SoLuong,$ThanhTien);   -- × 120
COMMIT;   -- lỗi ở bất kỳ câu nào: ROLLBACK;

-- ====================================================================================================
-- PHỤ LỤC. API KIỂM TRA RÀNG BUỘC (không có trang trên menu; dùng cho kiểm thử tự động npm test)
-- ====================================================================================================
-- GET /api/constraints/audit: đếm số bản ghi vi phạm R1–R10 trong dữ liệu hiện có (kết quả đúng phải là 0).
-- R1:
SELECT COUNT(*) AS n FROM (SELECT c.MaChuyen FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
  JOIN VE v ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY' GROUP BY c.MaChuyen HAVING COUNT(*) > MAX(m.SoGhe));

-- R2:
SELECT COUNT(*) AS n FROM (SELECT 1 FROM VE GROUP BY MaChuyen, MaHK HAVING COUNT(*) > 1);

-- R3:
SELECT COUNT(*) AS n FROM (SELECT 1 FROM VE GROUP BY MaChuyen, SoGhe HAVING COUNT(*) > 1);

-- R4:
SELECT COUNT(*) AS n FROM CHUYENBAY a JOIN CHUYENBAY b ON a.SoHieuMB = b.SoHieuMB AND a.MaChuyen < b.MaChuyen
WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < 120;

-- R5:
SELECT COUNT(*) AS n FROM CHUYENBAY a JOIN CHUYENBAY b ON a.MaCong = b.MaCong AND a.MaChuyen < b.MaChuyen
WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < 60;

-- R6:
SELECT COUNT(*) AS n FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
WHERE c.GioKHKeHoach > $now AND c.TrangThai <> 'HUY' AND julianday(c.NgayBay) - julianday(m.NgayBaoDuongCuoi) > 180;

-- R7:
SELECT COUNT(*) AS n FROM HANHLY WHERE CanNangKg <= 0 OR CanNangKg > 32;

-- R8:
SELECT COUNT(*) AS n FROM (SELECT 1 FROM HANHLY GROUP BY MaVe, LoaiHL
  HAVING COUNT(*) > CASE LoaiHL WHEN 'XACH_TAY' THEN 1 ELSE 3 END);

-- R9:
SELECT COUNT(*) AS n FROM CHUYENBAY c WHERE c.TrangThai IN ('LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE')
  AND ((SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'DIEU_PHOI_MAT_DAT') < 1
    OR (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'LAM_THU_TUC') < 2);

-- R10:
SELECT COUNT(*) AS n FROM PHANCONG p1 JOIN PHANCONG p2 ON p1.MaNV = p2.MaNV AND p1.MaChuyen < p2.MaChuyen
JOIN CHUYENBAY a ON a.MaChuyen = p1.MaChuyen JOIN CHUYENBAY b ON b.MaChuyen = p2.MaChuyen
WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < 120;

-- POST /api/constraints/<R>/test: dựng thao tác vi phạm trong BEGIN ... ROLLBACK (luôn hủy, không bao giờ lưu).
-- Câu cuối của mỗi kịch bản phải bị CSDL (hoặc tầng ứng dụng) chặn.

-- ---- Thử vi phạm R1 --------------------------------------------------------------------------------
BEGIN;
SELECT c.MaChuyen, c.NgayBay, COUNT(v.MaVe) AS n, mb.MaHang FROM CHUYENBAY c
  JOIN VE v ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY' JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
  WHERE c.TrangThai <> 'HUY' GROUP BY c.MaChuyen ORDER BY n DESC LIMIT 1;

SELECT MaHK FROM HANHKHACH WHERE MaHK NOT IN (SELECT MaHK FROM VE WHERE MaChuyen = ?) LIMIT 1;

INSERT INTO MAYBAY VALUES ('TEST-R1', ?, 'Test', 'Test', ?, 2020, ?);   -- tàu tạm có số ghế = số vé đã bán

UPDATE CHUYENBAY SET SoHieuMB = 'TEST-R1' WHERE MaChuyen = ?;

INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', 'Z99', 1000000, ?);   -- bị chặn: R1
ROLLBACK;

-- ---- Thử vi phạm R2 --------------------------------------------------------------------------------
BEGIN;
SELECT * FROM VE WHERE TrangThai <> 'DA_HUY' LIMIT 1;

INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', 'Z98', 1000000, ?);   -- bị chặn: R2
ROLLBACK;

-- ---- Thử vi phạm R3 --------------------------------------------------------------------------------
BEGIN;
SELECT * FROM VE WHERE TrangThai <> 'DA_HUY' LIMIT 1;

SELECT MaHK FROM HANHKHACH WHERE MaHK NOT IN (SELECT MaHK FROM VE WHERE MaChuyen = ?) LIMIT 1;

INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', ?, 1000000, ?);   -- bị chặn: R3
ROLLBACK;

-- ---- Thử vi phạm R4 --------------------------------------------------------------------------------
BEGIN;
SELECT c.* FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
  WHERE c.TrangThai <> 'HUY' AND julianday(c.NgayBay) - julianday(m.NgayBaoDuongCuoi) <= 180
  ORDER BY c.GioKHKeHoach DESC LIMIT 1;

SELECT datetime(?, '+60 minutes') AS g;

INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioDenKeHoach, TrangThai, GiaVeCoBan)
VALUES (?, 1, ?, ?, date(?), ?, datetime(?, '+120 minutes'), 'LEN_LICH', 1500000);   -- bị chặn: R4
ROLLBACK;

-- ---- Thử vi phạm R5 --------------------------------------------------------------------------------
BEGIN;
SELECT * FROM CHUYENBAY WHERE TrangThai <> 'HUY' AND MaCong IS NOT NULL ORDER BY GioKHKeHoach DESC LIMIT 1;

SELECT datetime(?, '+30 minutes') AS g;

SELECT SoHieuMB FROM MAYBAY m
WHERE m.SoHieuMB <> ? AND julianday(?) - julianday(m.NgayBaoDuongCuoi) <= 180
  AND NOT EXISTS (SELECT 1 FROM CHUYENBAY c WHERE c.SoHieuMB = m.SoHieuMB AND c.TrangThai <> 'HUY'
                    AND abs(julianday(c.GioKHKeHoach) - julianday(?)) * 1440 < 120)
LIMIT 1;

INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioDenKeHoach, TrangThai, GiaVeCoBan)
VALUES (?, 1, ?, ?, date(?), ?, datetime(?, '+120 minutes'), 'LEN_LICH', 1500000);   -- bị chặn: R5
ROLLBACK;

-- ---- Thử vi phạm R6 --------------------------------------------------------------------------------
BEGIN;
SELECT * FROM MAYBAY ORDER BY NgayBaoDuongCuoi LIMIT 1;

SELECT datetime(date(?, '+185 days'), '+10 hours') AS g;

INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioDenKeHoach, TrangThai, GiaVeCoBan)
VALUES (?, 1, ?, ?, date(?), ?, datetime(?, '+120 minutes'), 'LEN_LICH', 1500000);   -- bị chặn: R6
ROLLBACK;

-- ---- Thử vi phạm R7 --------------------------------------------------------------------------------
BEGIN;
SELECT MaVe FROM VE WHERE TrangThai <> 'DA_HUY' AND MaVe NOT IN (SELECT MaVe FROM HANHLY WHERE LoaiHL = 'KY_GUI' GROUP BY MaVe HAVING COUNT(*) >= 3) LIMIT 1;

INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, 'KY_GUI', 35, 1200000);   -- bị chặn: R7
ROLLBACK;

-- ---- Thử vi phạm R8 --------------------------------------------------------------------------------
BEGIN;
SELECT MaVe FROM HANHLY WHERE LoaiHL = 'XACH_TAY' LIMIT 1;

INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, 'XACH_TAY', 5, 0);   -- bị chặn: R8
ROLLBACK;

-- ---- Thử vi phạm R9 --------------------------------------------------------------------------------
BEGIN;
SELECT * FROM CHUYENBAY WHERE TrangThai = 'LEN_LICH' ORDER BY GioKHKeHoach LIMIT 1;

SELECT * FROM CHUYENBAY WHERE TrangThai <> 'HUY' ORDER BY GioKHKeHoach DESC LIMIT 1;   -- chỉ khi câu trên không có kết quả

DELETE FROM PHANCONG WHERE MaChuyen = ? AND VaiTro = 'LAM_THU_TUC';

SELECT SUM(VaiTro = 'DIEU_PHOI_MAT_DAT') AS dieuPhoi,
       SUM(VaiTro = 'LAM_THU_TUC')       AS thuTuc
FROM PHANCONG WHERE MaChuyen = ?;   -- tầng ứng dụng thấy thiếu người: chặn R9
ROLLBACK;

-- ---- Thử vi phạm R10 -------------------------------------------------------------------------------
BEGIN;
SELECT p.MaNV, c.GioKHKeHoach, c.SoHieuMB, c.SoHieuChuyen FROM PHANCONG p
  JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen WHERE c.TrangThai <> 'HUY' ORDER BY c.GioKHKeHoach DESC LIMIT 1;

SELECT datetime(?, '+90 minutes') AS g;

SELECT SoHieuMB FROM MAYBAY m
WHERE m.SoHieuMB <> ? AND julianday(?) - julianday(m.NgayBaoDuongCuoi) <= 180
  AND NOT EXISTS (SELECT 1 FROM CHUYENBAY c WHERE c.SoHieuMB = m.SoHieuMB AND c.TrangThai <> 'HUY'
                    AND abs(julianday(c.GioKHKeHoach) - julianday(?)) * 1440 < 120)
LIMIT 1;

INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioDenKeHoach, TrangThai, GiaVeCoBan)
VALUES (?, 1, ?, ?, date(?), ?, datetime(?, '+120 minutes'), 'LEN_LICH', 1500000);

INSERT INTO PHANCONG (MaChuyen, MaNV, VaiTro) VALUES (?, ?, 'LAM_THU_TUC');   -- bị chặn: R10
ROLLBACK;
