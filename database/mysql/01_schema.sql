-- =====================================================================
--  CSDL HỆ THỐNG QUẢN LÝ SÂN BAY — MySQL 8.0.16+ (cần CHECK được thực thi)
--  Theo mục 4 (lược đồ quan hệ), mục 6 (từ điển dữ liệu), mục 8.2 (chỉ mục).
--  Chạy theo thứ tự: 01_schema.sql -> 02_triggers.sql -> 04_seed.sql -> 03_queries.sql
-- =====================================================================

DROP DATABASE IF EXISTS quan_ly_san_bay;
CREATE DATABASE quan_ly_san_bay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE quan_ly_san_bay;

-- 6.1 ------------------------------------------------------------------
CREATE TABLE SANBAY (
  MaSanBay   CHAR(3)      NOT NULL,
  TenSanBay  VARCHAR(100) NOT NULL,
  ThanhPho   VARCHAR(60)  NOT NULL,
  QuocGia    VARCHAR(60)  NOT NULL,
  CONSTRAINT pk_sanbay PRIMARY KEY (MaSanBay)
) ENGINE = InnoDB;

-- 6.2 ------------------------------------------------------------------
CREATE TABLE HANGHANGKHONG (
  MaHang     VARCHAR(5)   NOT NULL,
  TenHang    VARCHAR(100) NOT NULL,
  QuocGia    VARCHAR(60)  NOT NULL,
  SdtLienHe  VARCHAR(15),
  CONSTRAINT pk_hang PRIMARY KEY (MaHang)
) ENGINE = InnoDB;

-- 6.3 ------------------------------------------------------------------
CREATE TABLE MAYBAY (
  SoHieuMB          VARCHAR(10)       NOT NULL,
  MaHang            VARCHAR(5)        NOT NULL,
  HangSanXuat       VARCHAR(40)       NOT NULL,
  Model             VARCHAR(40)       NOT NULL,
  SoGhe             SMALLINT UNSIGNED NOT NULL,
  NamSanXuat        SMALLINT          NOT NULL,
  NgayBaoDuongCuoi  DATE              NOT NULL,
  CONSTRAINT pk_maybay PRIMARY KEY (SoHieuMB),
  CONSTRAINT fk_mb_hang FOREIGN KEY (MaHang) REFERENCES HANGHANGKHONG (MaHang) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_mb_soghe CHECK (SoGhe > 0)
) ENGINE = InnoDB;

-- 6.4 ------------------------------------------------------------------
CREATE TABLE TUYENBAY (
  MaTuyen          INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  SanBayDi         CHAR(3)           NOT NULL,
  SanBayDen        CHAR(3)           NOT NULL,
  KhoangCachKm     SMALLINT UNSIGNED NOT NULL,
  ThoiGianBayPhut  SMALLINT UNSIGNED NOT NULL,
  CONSTRAINT pk_tuyen PRIMARY KEY (MaTuyen),
  -- MySQL không cho cột có CHECK đồng thời mang hành động tham chiếu (lỗi 3823),
  -- nên hai khóa ngoại này dùng ON UPDATE RESTRICT thay cho CASCADE.
  CONSTRAINT fk_tuyen_di  FOREIGN KEY (SanBayDi)  REFERENCES SANBAY (MaSanBay) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_tuyen_den FOREIGN KEY (SanBayDen) REFERENCES SANBAY (MaSanBay) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT uq_tuyen_cap UNIQUE (SanBayDi, SanBayDen),
  CONSTRAINT ck_tuyen_khac CHECK (SanBayDi <> SanBayDen)
) ENGINE = InnoDB;

-- 6.5 ------------------------------------------------------------------
CREATE TABLE CONG (
  MaCong    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  TenCong   VARCHAR(10)  NOT NULL,
  KhuVuc    ENUM('T1','T2') NOT NULL,
  LoaiCong  ENUM('NOI_DIA','QUOC_TE') NOT NULL,
  CONSTRAINT pk_cong PRIMARY KEY (MaCong),
  CONSTRAINT uq_cong_ten UNIQUE (TenCong)
) ENGINE = InnoDB;

-- 6.6 ------------------------------------------------------------------
CREATE TABLE CHUYENBAY (
  MaChuyen       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  SoHieuChuyen   VARCHAR(8)    NOT NULL,
  MaTuyen        INT UNSIGNED  NOT NULL,
  SoHieuMB       VARCHAR(10)   NOT NULL,
  MaCong         INT UNSIGNED  NULL,
  NgayBay        DATE          NOT NULL,
  GioKHKeHoach   DATETIME      NOT NULL,
  GioKHThucTe    DATETIME      NULL,
  GioDenKeHoach  DATETIME      NOT NULL,
  TrangThai      ENUM('LEN_LICH','LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE','HUY') NOT NULL DEFAULT 'LEN_LICH',
  GiaVeCoBan     DECIMAL(12,0) NOT NULL,
  CONSTRAINT pk_chuyen PRIMARY KEY (MaChuyen),
  CONSTRAINT fk_cb_tuyen FOREIGN KEY (MaTuyen)  REFERENCES TUYENBAY (MaTuyen) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cb_mb    FOREIGN KEY (SoHieuMB) REFERENCES MAYBAY (SoHieuMB)  ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cb_cong  FOREIGN KEY (MaCong)   REFERENCES CONG (MaCong)      ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_cb_gia CHECK (GiaVeCoBan > 0),
  CONSTRAINT ck_cb_gio CHECK (GioDenKeHoach > GioKHKeHoach)
) ENGINE = InnoDB;

-- 6.7 ------------------------------------------------------------------
CREATE TABLE HANHKHACH (
  MaHK      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  SoGiayTo  VARCHAR(15)  NOT NULL,
  HoTen     VARCHAR(80)  NOT NULL,
  NgaySinh  DATE         NOT NULL,
  QuocTich  VARCHAR(60)  NOT NULL,
  Sdt       VARCHAR(15),
  Email     VARCHAR(100),
  CONSTRAINT pk_hk PRIMARY KEY (MaHK),
  CONSTRAINT uq_hk_giayto UNIQUE (SoGiayTo)
) ENGINE = InnoDB;

-- 6.8 ------------------------------------------------------------------
CREATE TABLE VE (
  MaVe       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  MaChuyen   INT UNSIGNED  NOT NULL,
  MaHK       INT UNSIGNED  NOT NULL,
  HangGhe    ENUM('PHO_THONG','THUONG_GIA') NOT NULL,
  SoGhe      VARCHAR(4)    NOT NULL,
  GiaVe      DECIMAL(12,0) NOT NULL,
  NgayDat    DATETIME      NOT NULL,
  TrangThai  ENUM('DA_DAT','DA_CHECKIN','DA_HUY') NOT NULL DEFAULT 'DA_DAT',
  CONSTRAINT pk_ve PRIMARY KEY (MaVe),
  CONSTRAINT fk_ve_chuyen FOREIGN KEY (MaChuyen) REFERENCES CHUYENBAY (MaChuyen) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ve_hk     FOREIGN KEY (MaHK)     REFERENCES HANHKHACH (MaHK)     ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT uq_ve_r2 UNIQUE (MaChuyen, MaHK),   -- R2
  CONSTRAINT uq_ve_r3 UNIQUE (MaChuyen, SoGhe),  -- R3
  CONSTRAINT ck_ve_gia CHECK (GiaVe > 0)
) ENGINE = InnoDB;

-- 6.9 ------------------------------------------------------------------
CREATE TABLE HANHLY (
  MaHL       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  MaVe       INT UNSIGNED  NOT NULL,
  LoaiHL     ENUM('XACH_TAY','KY_GUI') NOT NULL,
  CanNangKg  DECIMAL(5,2)  NOT NULL,
  PhiQuaCan  DECIMAL(12,0) NOT NULL DEFAULT 0,
  CONSTRAINT pk_hl PRIMARY KEY (MaHL),
  CONSTRAINT fk_hl_ve FOREIGN KEY (MaVe) REFERENCES VE (MaVe) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_hl_r7 CHECK (CanNangKg > 0 AND CanNangKg <= 32),  -- R7
  CONSTRAINT ck_hl_phi CHECK (PhiQuaCan >= 0)
) ENGINE = InnoDB;

-- 6.10 -----------------------------------------------------------------
CREATE TABLE MUCLUONG (
  ViTri       ENUM('THU_TUC','AN_NINH','DIEU_PHOI','KY_THUAT','VE_SINH') NOT NULL,
  Bac         TINYINT UNSIGNED NOT NULL,
  LuongCoBan  DECIMAL(12,0)    NOT NULL,
  CONSTRAINT pk_mucluong PRIMARY KEY (ViTri, Bac),
  CONSTRAINT ck_ml_bac CHECK (Bac BETWEEN 1 AND 5)
) ENGINE = InnoDB;

-- 6.11 -----------------------------------------------------------------
CREATE TABLE NHANVIEN (
  MaNV         INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  CCCD         VARCHAR(12)      NOT NULL,
  HoTen        VARCHAR(80)      NOT NULL,
  NgaySinh     DATE             NOT NULL,
  DiaChi       VARCHAR(150)     NOT NULL,
  Sdt          VARCHAR(15)      NOT NULL,
  ViTri        ENUM('THU_TUC','AN_NINH','DIEU_PHOI','KY_THUAT','VE_SINH') NOT NULL,
  Bac          TINYINT UNSIGNED NOT NULL,
  ThamNienNam  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT pk_nv PRIMARY KEY (MaNV),
  CONSTRAINT uq_nv_cccd UNIQUE (CCCD),
  CONSTRAINT fk_nv_luong FOREIGN KEY (ViTri, Bac) REFERENCES MUCLUONG (ViTri, Bac) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 6.12 -----------------------------------------------------------------
CREATE TABLE THULAO (
  VaiTro           ENUM('LAM_THU_TUC','AN_NINH_CONG','DIEU_PHOI_MAT_DAT','KY_THUAT_SAN_DO') NOT NULL,
  MucThuongChuyen  DECIMAL(12,0) NOT NULL,
  CONSTRAINT pk_thulao PRIMARY KEY (VaiTro)
) ENGINE = InnoDB;

-- 6.13 -----------------------------------------------------------------
CREATE TABLE PHANCONG (
  MaChuyen  INT UNSIGNED NOT NULL,
  MaNV      INT UNSIGNED NOT NULL,
  VaiTro    ENUM('LAM_THU_TUC','AN_NINH_CONG','DIEU_PHOI_MAT_DAT','KY_THUAT_SAN_DO') NOT NULL,
  CONSTRAINT pk_phancong PRIMARY KEY (MaChuyen, MaNV),
  CONSTRAINT fk_pc_chuyen FOREIGN KEY (MaChuyen) REFERENCES CHUYENBAY (MaChuyen) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pc_nv     FOREIGN KEY (MaNV)     REFERENCES NHANVIEN (MaNV)      ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pc_vaitro FOREIGN KEY (VaiTro)   REFERENCES THULAO (VaiTro)      ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE = InnoDB;

-- 6.14 -----------------------------------------------------------------
CREATE TABLE DICHVU (
  MaDV    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  TenDV   VARCHAR(80)   NOT NULL,
  DonGia  DECIMAL(12,0) NOT NULL,
  MoTa    VARCHAR(200),
  CONSTRAINT pk_dv PRIMARY KEY (MaDV),
  CONSTRAINT ck_dv_gia CHECK (DonGia >= 0)
) ENGINE = InnoDB;

-- 6.15 -----------------------------------------------------------------
CREATE TABLE SUDUNGDICHVU (
  MaSD       INT UNSIGNED      NOT NULL AUTO_INCREMENT,
  MaHK       INT UNSIGNED      NOT NULL,
  MaDV       INT UNSIGNED      NOT NULL,
  ThoiGian   DATETIME          NOT NULL,
  SoLuong    SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  ThanhTien  DECIMAL(12,0)     NOT NULL,
  CONSTRAINT pk_sddv PRIMARY KEY (MaSD),
  CONSTRAINT fk_sd_hk FOREIGN KEY (MaHK) REFERENCES HANHKHACH (MaHK) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_sd_dv FOREIGN KEY (MaDV) REFERENCES DICHVU (MaDV)    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT ck_sd_sl CHECK (SoLuong > 0),
  CONSTRAINT ck_sd_tien CHECK (ThanhTien >= 0)
) ENGINE = InnoDB;

-- =====================================================================
--  CHỈ MỤC (mục 8.2)
-- =====================================================================
CREATE INDEX ix_ve_chuyen_tt ON VE (MaChuyen, TrangThai);           -- Q1, R1
CREATE INDEX ix_ve_hk        ON VE (MaHK);                          -- Q3
CREATE INDEX ix_cb_ngay      ON CHUYENBAY (NgayBay);                -- Q1, Q4
CREATE INDEX ix_cb_mb_gio    ON CHUYENBAY (SoHieuMB, GioKHKeHoach); -- R4, R6
CREATE INDEX ix_cb_cong_gio  ON CHUYENBAY (MaCong, GioKHKeHoach);   -- R5
CREATE INDEX ix_pc_nv        ON PHANCONG (MaNV);                    -- Q2, R10
CREATE INDEX ix_hl_ve        ON HANHLY (MaVe);                      -- Q3, Q4, R8
CREATE INDEX ix_sd_hk_tg     ON SUDUNGDICHVU (MaHK, ThoiGian);      -- Q3
CREATE INDEX ix_sd_dv_tg     ON SUDUNGDICHVU (MaDV, ThoiGian);      -- Q4
