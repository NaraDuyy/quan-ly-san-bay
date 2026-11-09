// Siêu dữ liệu 15 bảng (theo từ điển dữ liệu mục 6) — dùng để sinh màn hình quản trị
// và API CRUD tổng quát. Kiểu cột: text | int | money | decimal | date | datetime | enum.

const ENUMS = {
  KhuVuc: ['T1', 'T2'],
  LoaiCong: ['NOI_DIA', 'QUOC_TE'],
  TrangThaiChuyen: ['LEN_LICH', 'LAM_THU_TUC', 'DA_CAT_CANH', 'DA_HA_CANH', 'TRE', 'HUY'],
  HangGhe: ['PHO_THONG', 'THUONG_GIA'],
  TrangThaiVe: ['DA_DAT', 'DA_CHECKIN', 'DA_HUY'],
  LoaiHL: ['XACH_TAY', 'KY_GUI'],
  ViTri: ['THU_TUC', 'AN_NINH', 'DIEU_PHOI', 'KY_THUAT', 'VE_SINH'],
  VaiTro: ['LAM_THU_TUC', 'AN_NINH_CONG', 'DIEU_PHOI_MAT_DAT', 'KY_THUAT_SAN_DO'],
};

// Nhãn hiển thị khi một bảng được tham chiếu qua khóa ngoại ({a} = bí danh bảng)
const DISPLAY = {
  SANBAY: "{a}.MaSanBay || ' – ' || {a}.ThanhPho",
  HANGHANGKHONG: "{a}.MaHang || ' – ' || {a}.TenHang",
  MAYBAY: "{a}.SoHieuMB || ' (' || {a}.Model || ')'",
  TUYENBAY: "{a}.SanBayDi || ' → ' || {a}.SanBayDen",
  CONG: "{a}.TenCong || ' (' || {a}.KhuVuc || ')'",
  CHUYENBAY: "{a}.SoHieuChuyen || ' · ' || substr({a}.GioKHKeHoach, 1, 16)",
  HANHKHACH: "{a}.HoTen || ' · ' || {a}.SoGiayTo",
  VE: "'Vé #' || {a}.MaVe || ' · ghế ' || {a}.SoGhe",
  NHANVIEN: "{a}.HoTen || ' · ' || {a}.ViTri",
  THULAO: '{a}.VaiTro',
  DICHVU: '{a}.TenDV',
};
// Thứ tự gợi ý trong danh sách chọn khóa ngoại
const OPTION_ORDER = {
  CHUYENBAY: '{a}.GioKHKeHoach DESC',
  VE: '{a}.MaVe DESC',
  HANHKHACH: '{a}.HoTen',
  NHANVIEN: '{a}.HoTen',
};

const col = (name, label, type, extra = {}) => ({ name, label, type, ...extra });

const TABLES = {
  SANBAY: {
    label: 'Sân bay', group: 'Danh mục', desc: 'Danh mục sân bay, làm điểm đầu/cuối của đường bay',
    pk: ['MaSanBay'],
    columns: [
      col('MaSanBay', 'Mã IATA', 'text', { required: true, maxLength: 3, hint: 'HAN, SGN, DAD…' }),
      col('TenSanBay', 'Tên sân bay', 'text', { required: true, maxLength: 100 }),
      col('ThanhPho', 'Thành phố', 'text', { required: true, maxLength: 60 }),
      col('QuocGia', 'Quốc gia', 'text', { required: true, maxLength: 60 }),
    ],
  },
  HANGHANGKHONG: {
    label: 'Hãng hàng không', group: 'Danh mục', desc: 'Hãng hàng không khai thác tại sân bay',
    pk: ['MaHang'],
    columns: [
      col('MaHang', 'Mã hãng', 'text', { required: true, maxLength: 5 }),
      col('TenHang', 'Tên hãng', 'text', { required: true, maxLength: 100 }),
      col('QuocGia', 'Quốc gia', 'text', { required: true, maxLength: 60 }),
      col('SdtLienHe', 'SĐT liên hệ', 'text', { maxLength: 15 }),
    ],
  },
  MAYBAY: {
    label: 'Tàu bay', group: 'Khai thác', desc: 'Tàu bay của hãng, gắn lịch bảo dưỡng (G2: chu kỳ 180 ngày)',
    pk: ['SoHieuMB'],
    columns: [
      col('SoHieuMB', 'Số hiệu', 'text', { required: true, maxLength: 10, hint: 'VN-A868…' }),
      col('MaHang', 'Hãng', 'text', { required: true, fk: 'HANGHANGKHONG' }),
      col('HangSanXuat', 'Hãng sản xuất', 'text', { required: true, maxLength: 40 }),
      col('Model', 'Model', 'text', { required: true, maxLength: 40 }),
      col('SoGhe', 'Số ghế', 'int', { required: true, min: 1 }),
      col('NamSanXuat', 'Năm SX', 'int', { required: true }),
      col('NgayBaoDuongCuoi', 'Bảo dưỡng cuối', 'date', { required: true }),
    ],
  },
  TUYENBAY: {
    label: 'Đường bay', group: 'Danh mục', desc: 'Đường bay giữa hai sân bay',
    pk: ['MaTuyen'], auto: 'MaTuyen',
    columns: [
      col('MaTuyen', 'Mã tuyến', 'int', { auto: true }),
      col('SanBayDi', 'Sân bay đi', 'text', { required: true, fk: 'SANBAY' }),
      col('SanBayDen', 'Sân bay đến', 'text', { required: true, fk: 'SANBAY' }),
      col('KhoangCachKm', 'Khoảng cách (km)', 'int', { required: true, min: 1 }),
      col('ThoiGianBayPhut', 'Thời gian bay (phút)', 'int', { required: true, min: 1 }),
    ],
  },
  CONG: {
    label: 'Cổng', group: 'Danh mục', desc: 'Cổng ra tàu bay trong nhà ga',
    pk: ['MaCong'], auto: 'MaCong',
    columns: [
      col('MaCong', 'Mã cổng', 'int', { auto: true }),
      col('TenCong', 'Tên cổng', 'text', { required: true, maxLength: 10 }),
      col('KhuVuc', 'Nhà ga', 'enum', { required: true, options: ENUMS.KhuVuc }),
      col('LoaiCong', 'Loại cổng', 'enum', { required: true, options: ENUMS.LoaiCong }),
    ],
  },
  CHUYENBAY: {
    label: 'Chuyến bay', group: 'Khai thác', desc: 'Chuyến bay cụ thể trên một đường bay — thực thể trung tâm',
    pk: ['MaChuyen'], auto: 'MaChuyen', defaultSort: 'GioKHKeHoach', defaultDir: 'desc',
    columns: [
      col('MaChuyen', 'Mã', 'int', { auto: true }),
      col('SoHieuChuyen', 'Số hiệu', 'text', { required: true, maxLength: 8 }),
      col('MaTuyen', 'Đường bay', 'int', { required: true, fk: 'TUYENBAY' }),
      col('SoHieuMB', 'Tàu bay', 'text', { required: true, fk: 'MAYBAY' }),
      col('MaCong', 'Cổng', 'int', { fk: 'CONG' }),
      col('NgayBay', 'Ngày bay', 'date', { hint: 'Bỏ trống để lấy theo giờ khởi hành' }),
      col('GioKHKeHoach', 'Giờ KH kế hoạch', 'datetime', { required: true }),
      col('GioKHThucTe', 'Giờ KH thực tế', 'datetime'),
      col('GioDenKeHoach', 'Giờ đến kế hoạch', 'datetime', { hint: 'Bỏ trống để tính theo thời gian bay' }),
      col('TrangThai', 'Trạng thái', 'enum', { required: true, options: ENUMS.TrangThaiChuyen, default: 'LEN_LICH' }),
      col('GiaVeCoBan', 'Giá vé cơ bản', 'money', { required: true, min: 1 }),
    ],
  },
  HANHKHACH: {
    label: 'Hành khách', group: 'Hành khách', desc: 'Người mua vé và sử dụng dịch vụ',
    pk: ['MaHK'], auto: 'MaHK',
    columns: [
      col('MaHK', 'Mã HK', 'int', { auto: true }),
      col('SoGiayTo', 'Số giấy tờ', 'text', { required: true, maxLength: 15 }),
      col('HoTen', 'Họ tên', 'text', { required: true, maxLength: 80 }),
      col('NgaySinh', 'Ngày sinh', 'date', { required: true }),
      col('QuocTich', 'Quốc tịch', 'text', { required: true, maxLength: 60, default: 'Việt Nam' }),
      col('Sdt', 'SĐT', 'text', { maxLength: 15 }),
      col('Email', 'Email', 'text', { maxLength: 100 }),
    ],
  },
  VE: {
    label: 'Vé', group: 'Hành khách', desc: 'Vé của một hành khách trên một chuyến (R1, R2, R3)',
    pk: ['MaVe'], auto: 'MaVe', defaultSort: 'MaVe', defaultDir: 'desc',
    columns: [
      col('MaVe', 'Mã vé', 'int', { auto: true }),
      col('MaChuyen', 'Chuyến bay', 'int', { required: true, fk: 'CHUYENBAY' }),
      col('MaHK', 'Hành khách', 'int', { required: true, fk: 'HANHKHACH' }),
      col('HangGhe', 'Hạng ghế', 'enum', { required: true, options: ENUMS.HangGhe, default: 'PHO_THONG' }),
      col('SoGhe', 'Số ghế', 'text', { required: true, maxLength: 4 }),
      col('GiaVe', 'Giá vé', 'money', { required: true, min: 1 }),
      col('NgayDat', 'Ngày đặt', 'datetime', { hint: 'Bỏ trống = thời điểm hiện tại' }),
      col('TrangThai', 'Trạng thái', 'enum', { required: true, options: ENUMS.TrangThaiVe, default: 'DA_DAT' }),
    ],
  },
  HANHLY: {
    label: 'Hành lý', group: 'Hành khách', desc: 'Kiện hành lý gắn với một vé (R7, R8; phí theo G4)',
    pk: ['MaHL'], auto: 'MaHL', defaultSort: 'MaHL', defaultDir: 'desc',
    columns: [
      col('MaHL', 'Mã HL', 'int', { auto: true }),
      col('MaVe', 'Vé', 'int', { required: true, fk: 'VE' }),
      col('LoaiHL', 'Loại', 'enum', { required: true, options: ENUMS.LoaiHL }),
      col('CanNangKg', 'Cân nặng (kg)', 'decimal', { required: true, step: 0.1 }),
      col('PhiQuaCan', 'Phí quá cước', 'money', { computed: true, hint: 'Tự tính theo G4' }),
    ],
  },
  MUCLUONG: {
    label: 'Mức lương', group: 'Nhân sự', desc: 'Khung lương cơ bản theo (vị trí, bậc)',
    pk: ['ViTri', 'Bac'],
    columns: [
      col('ViTri', 'Vị trí', 'enum', { required: true, options: ENUMS.ViTri }),
      col('Bac', 'Bậc', 'int', { required: true, min: 1, max: 5 }),
      col('LuongCoBan', 'Lương cơ bản', 'money', { required: true, min: 1 }),
    ],
  },
  NHANVIEN: {
    label: 'Nhân viên', group: 'Nhân sự', desc: 'Nhân viên mặt đất của sân bay',
    pk: ['MaNV'], auto: 'MaNV',
    columns: [
      col('MaNV', 'Mã NV', 'int', { auto: true }),
      col('CCCD', 'CCCD', 'text', { required: true, maxLength: 12 }),
      col('HoTen', 'Họ tên', 'text', { required: true, maxLength: 80 }),
      col('NgaySinh', 'Ngày sinh', 'date', { required: true }),
      col('DiaChi', 'Địa chỉ', 'text', { required: true, maxLength: 150, wide: true }),
      col('Sdt', 'SĐT', 'text', { required: true, maxLength: 15 }),
      col('ViTri', 'Vị trí', 'enum', { required: true, options: ENUMS.ViTri }),
      col('Bac', 'Bậc', 'int', { required: true, min: 1, max: 5 }),
      col('ThamNienNam', 'Thâm niên (năm)', 'int', { required: true, min: 0, default: 0 }),
    ],
  },
  THULAO: {
    label: 'Thù lao', group: 'Nhân sự', desc: 'Mức thưởng mỗi chuyến theo vai trò (G6)',
    pk: ['VaiTro'],
    columns: [
      col('VaiTro', 'Vai trò', 'enum', { required: true, options: ENUMS.VaiTro }),
      col('MucThuongChuyen', 'Thưởng / chuyến', 'money', { required: true, min: 0 }),
    ],
  },
  PHANCONG: {
    label: 'Phân công', group: 'Nhân sự', desc: 'Phân công nhân viên phục vụ một chuyến với một vai trò (R10)',
    pk: ['MaChuyen', 'MaNV'], defaultSort: 'MaChuyen', defaultDir: 'desc',
    columns: [
      col('MaChuyen', 'Chuyến bay', 'int', { required: true, fk: 'CHUYENBAY' }),
      col('MaNV', 'Nhân viên', 'int', { required: true, fk: 'NHANVIEN' }),
      col('VaiTro', 'Vai trò', 'enum', { required: true, options: ENUMS.VaiTro }),
    ],
  },
  DICHVU: {
    label: 'Dịch vụ', group: 'Dịch vụ', desc: 'Dịch vụ trong nhà ga',
    pk: ['MaDV'], auto: 'MaDV',
    columns: [
      col('MaDV', 'Mã DV', 'int', { auto: true }),
      col('TenDV', 'Tên dịch vụ', 'text', { required: true, maxLength: 80 }),
      col('DonGia', 'Đơn giá', 'money', { required: true, min: 0 }),
      col('MoTa', 'Mô tả', 'text', { maxLength: 200, wide: true }),
    ],
  },
  SUDUNGDICHVU: {
    label: 'Sử dụng dịch vụ', group: 'Dịch vụ', desc: 'Lượt sử dụng dịch vụ của hành khách',
    pk: ['MaSD'], auto: 'MaSD', defaultSort: 'ThoiGian', defaultDir: 'desc',
    columns: [
      col('MaSD', 'Mã', 'int', { auto: true }),
      col('MaHK', 'Hành khách', 'int', { required: true, fk: 'HANHKHACH' }),
      col('MaDV', 'Dịch vụ', 'int', { required: true, fk: 'DICHVU' }),
      col('ThoiGian', 'Thời gian', 'datetime', { hint: 'Bỏ trống = thời điểm hiện tại' }),
      col('SoLuong', 'Số lượng', 'int', { required: true, min: 1, default: 1 }),
      col('ThanhTien', 'Thành tiền', 'money', { computed: true, hint: 'SoLuong × đơn giá tại thời điểm dùng' }),
    ],
  },
};

// Kế hoạch số bản ghi ở mục 9 của báo cáo
const PLAN = {
  SANBAY: 6, HANGHANGKHONG: 3, MAYBAY: 8, TUYENBAY: 10, CONG: 8, CHUYENBAY: 60, HANHKHACH: 40, VE: 300,
  HANHLY: 350, MUCLUONG: 25, NHANVIEN: 20, THULAO: 4, PHANCONG: 240, DICHVU: 5, SUDUNGDICHVU: 120,
};

module.exports = { TABLES, ENUMS, DISPLAY, OPTION_ORDER, PLAN };
