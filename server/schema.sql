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
