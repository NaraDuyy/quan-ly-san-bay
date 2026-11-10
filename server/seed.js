// Sinh dữ liệu mẫu theo mục 9 của báo cáo ("Kế hoạch dữ liệu mẫu").
//
//   node server/seed.js                     -> tạo lại data/sanbay.db với khối lượng đúng kế hoạch
//   node server/seed.js --scale=lon         -> bộ dữ liệu lớn hơn (tỉ lệ lấp đầy thực tế hơn)
//   node server/seed.js --mysql=<file.sql>  -> xuất thêm script INSERT cho MySQL 8
//
// Dữ liệu được neo theo ngày chạy: 3 tháng gần nhất (2 tháng trước + tháng hiện tại),
// nên chuyến đã bay / sắp bay và tàu bay quá hạn bảo dưỡng luôn khớp với "hôm nay".
// Mọi bản ghi đều tuân thủ R1–R10; trigger của CSDL kiểm tra lại khi INSERT.

const fs = require('node:fs');
const path = require('node:path');
const { open, createSchema, tx, DB_FILE } = require('./db');
const { G, phiQuaCan, soDoGhe, fmtDateTime, fmtDate } = require('./rules');

const SCALES = {
  // đúng bảng kế hoạch ở mục 9
  kehoach: { chuyen: 60, hanhKhach: 40, ve: 300, hanhLy: 350, phanCong: 240, suDung: 120 },
  lon: { chuyen: 150, hanhKhach: 600, ve: 9000, hanhLy: 11000, phanCong: 640, suDung: 1500 },
};

// ---------------------------------------------------------------- RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(2026);
const randInt = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const chance = (p) => rnd() < p;
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function weightedPick(items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = rnd() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}
const digits = (n) => Array.from({ length: n }, () => randInt(0, 9)).join('');
const roundTo = (v, step) => Math.round(v / step) * step;
const addMin = (d, m) => new Date(d.getTime() + m * 60000);
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const minutesBetween = (a, b) => Math.abs(a - b) / 60000;

// ---------------------------------------------------------- danh mục
const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM_NAM = ['Văn', 'Đức', 'Minh', 'Quang', 'Thanh', 'Hải', 'Gia', 'Tuấn', 'Hữu'];
const DEM_NU = ['Thị', 'Thu', 'Ngọc', 'Minh', 'Thanh', 'Phương', 'Khánh', 'Bảo'];
const TEN_NAM = ['An', 'Bình', 'Dũng', 'Hải', 'Hiếu', 'Hùng', 'Khánh', 'Long', 'Minh', 'Nam', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Trung', 'Tuấn', 'Việt', 'Đạt'];
const TEN_NU = ['Anh', 'Châu', 'Giang', 'Hà', 'Hạnh', 'Hương', 'Lan', 'Linh', 'Mai', 'Ngân', 'Quỳnh', 'Tâm', 'Thảo', 'Trang', 'Uyên', 'Vy', 'Yến', 'Nhung'];
const TEN_HAN = ['Kim Min-jun', 'Lee Seo-yeon', 'Park Ji-ho', 'Choi Yu-na', 'Jung Hyun-woo', 'Kang Soo-ah', 'Yoon Ha-eun', 'Lim Do-yoon', 'Han Ji-min', 'Seo Jun-ho'];
const QUAN_HN = ['Ba Đình', 'Hoàn Kiếm', 'Đống Đa', 'Cầu Giấy', 'Thanh Xuân', 'Long Biên', 'Sóc Sơn', 'Đông Anh', 'Hà Đông', 'Tây Hồ'];
const DUONG = ['Lê Duẩn', 'Trần Phú', 'Nguyễn Trãi', 'Láng Hạ', 'Kim Mã', 'Xuân Thủy', 'Nguyễn Văn Cừ', 'Võ Nguyên Giáp', 'Phạm Văn Đồng', 'Giải Phóng'];

function hoTenViet() {
  const nam = chance(0.5);
  return `${pick(HO)} ${pick(nam ? DEM_NAM : DEM_NU)} ${pick(nam ? TEN_NAM : TEN_NU)}`;
}
function boDau(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
function sdt() { return '0' + pick(['9', '8', '3', '7']) + digits(8); }
function ngaySinh(tuoiMin, tuoiMax, now) {
  return fmtDate(addDays(now, -randInt(tuoiMin * 365, tuoiMax * 365)));
}

// ===================================================================
function generate(scaleName = 'kehoach', now = new Date()) {
  rnd = mulberry32(2026);
  const S = SCALES[scaleName];
  if (!S) throw new Error(`Không có quy mô "${scaleName}" (chọn: ${Object.keys(SCALES).join(', ')})`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const winStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const winEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // ngày cuối tháng hiện tại
  const soNgay = Math.round((winEnd - winStart) / 86400000) + 1;

  const D = {};

  // SANBAY — 1 sân bay chủ quản (HAN) + 5 đối tác
  D.SANBAY = [
    { MaSanBay: 'HAN', TenSanBay: 'Cảng hàng không quốc tế Nội Bài', ThanhPho: 'Hà Nội', QuocGia: 'Việt Nam' },
    { MaSanBay: 'SGN', TenSanBay: 'Cảng hàng không quốc tế Tân Sơn Nhất', ThanhPho: 'TP. Hồ Chí Minh', QuocGia: 'Việt Nam' },
    { MaSanBay: 'DAD', TenSanBay: 'Cảng hàng không quốc tế Đà Nẵng', ThanhPho: 'Đà Nẵng', QuocGia: 'Việt Nam' },
    { MaSanBay: 'CXR', TenSanBay: 'Cảng hàng không quốc tế Cam Ranh', ThanhPho: 'Khánh Hòa', QuocGia: 'Việt Nam' },
    { MaSanBay: 'PQC', TenSanBay: 'Cảng hàng không quốc tế Phú Quốc', ThanhPho: 'Phú Quốc', QuocGia: 'Việt Nam' },
    { MaSanBay: 'ICN', TenSanBay: 'Sân bay quốc tế Incheon', ThanhPho: 'Seoul', QuocGia: 'Hàn Quốc' },
  ];

  // HANGHANGKHONG — ba hãng nội địa
  D.HANGHANGKHONG = [
    { MaHang: 'VN', TenHang: 'Vietnam Airlines', QuocGia: 'Việt Nam', SdtLienHe: '02438320320' },
    { MaHang: 'VJ', TenHang: 'Vietjet Air', QuocGia: 'Việt Nam', SdtLienHe: '02471086868' },
    { MaHang: 'QH', TenHang: 'Bamboo Airways', QuocGia: 'Việt Nam', SdtLienHe: '02436321919' },
  ];

  // MAYBAY — 8 tàu bay; 2 tàu quá hạn bảo dưỡng, 1 tàu sắp tới hạn (Q5)
  const mb = (SoHieuMB, MaHang, HangSanXuat, Model, SoGhe, NamSanXuat, ngayTruoc) =>
    ({ SoHieuMB, MaHang, HangSanXuat, Model, SoGhe, NamSanXuat, NgayBaoDuongCuoi: fmtDate(addDays(today, -ngayTruoc)) });
  D.MAYBAY = [
    mb('VN-A621', 'VN', 'Airbus', 'A321neo', 203, 2019, 35),
    mb('VN-A868', 'VN', 'Boeing', 'B787-9', 274, 2018, 95),
    mb('VN-A632', 'VN', 'Airbus', 'A321ceo', 184, 2014, 200), // quá hạn
    mb('VN-A688', 'VJ', 'Airbus', 'A321neo', 230, 2020, 60),
    mb('VN-A651', 'VJ', 'Airbus', 'A320neo', 186, 2019, 120),
    mb('VN-A699', 'VJ', 'Airbus', 'A321ceo', 230, 2016, 191), // quá hạn
    mb('VN-A588', 'QH', 'Airbus', 'A320neo', 176, 2019, 168), // sắp tới hạn
    mb('VN-A818', 'QH', 'Boeing', 'B787-9', 294, 2019, 20),
  ];

  // TUYENBAY — hai chiều của 5 cặp thành phố
  const capTuyen = [
    ['SGN', 1160, 125, 6], ['DAD', 630, 80, 4], ['CXR', 1120, 115, 2], ['PQC', 1300, 130, 2], ['ICN', 2720, 270, 2],
  ];
  D.TUYENBAY = [];
  const trongSoTuyen = {};
  capTuyen.forEach(([sb, km, phut, w]) => {
    for (const [di, den] of [['HAN', sb], [sb, 'HAN']]) {
      const MaTuyen = D.TUYENBAY.length + 1;
      D.TUYENBAY.push({ MaTuyen, SanBayDi: di, SanBayDen: den, KhoangCachKm: km, ThoiGianBayPhut: phut });
      trongSoTuyen[MaTuyen] = w;
    }
  });
  const laQuocTe = (t) => t.SanBayDi === 'ICN' || t.SanBayDen === 'ICN';

  // CONG — 8 cổng chia hai nhà ga
  D.CONG = [
    ['A1', 'T1', 'NOI_DIA'], ['A2', 'T1', 'NOI_DIA'], ['A3', 'T1', 'NOI_DIA'], ['B1', 'T1', 'NOI_DIA'], ['B2', 'T1', 'NOI_DIA'],
    ['E1', 'T2', 'QUOC_TE'], ['E2', 'T2', 'QUOC_TE'], ['E3', 'T2', 'QUOC_TE'],
  ].map(([TenCong, KhuVuc, LoaiCong], i) => ({ MaCong: i + 1, TenCong, KhuVuc, LoaiCong }));

  // CHUYENBAY — trải 3 tháng, có chuyến trễ và chuyến hủy
  D.CHUYENBAY = [];
  const lichMB = {}; const lichCong = {};
  const soHieuTheoTuyen = {};
  const soChuyenHuy = Math.max(3, Math.round(S.chuyen * 0.07));
  const chiSoHuy = new Set(shuffle([...Array(S.chuyen).keys()]).slice(0, soChuyenHuy));
  let daCoTre = false;
  for (let i = 0; i < S.chuyen; i++) {
    let tao = null;
    for (let thu = 0; thu < 200 && !tao; thu++) {
      const ngay = addDays(winStart, Math.min(soNgay - 1, Math.floor((i + rnd()) * soNgay / S.chuyen)));
      const gioKH = new Date(ngay.getFullYear(), ngay.getMonth(), ngay.getDate(), randInt(6, 22), randInt(0, 11) * 5);
      const tuyen = weightedPick(D.TUYENBAY, (t) => trongSoTuyen[t.MaTuyen]);
      // R6: tàu bay còn hạn bảo dưỡng tại ngày bay; R4: cách chuyến khác cùng tàu ≥ 120 phút
      const mbHopLe = D.MAYBAY.filter((m) =>
        (ngay - new Date(m.NgayBaoDuongCuoi + 'T00:00:00')) / 86400000 <= G.CHU_KY_BAO_DUONG &&
        (lichMB[m.SoHieuMB] || []).every((t) => minutesBetween(t, gioKH) >= G.QUAY_DAU_PHUT));
      if (!mbHopLe.length) continue;
      const mayBay = pick(mbHopLe);
      // R5: cổng đúng loại, cách chuyến khác cùng cổng ≥ 60 phút
      const loai = laQuocTe(tuyen) ? 'QUOC_TE' : 'NOI_DIA';
      const congHopLe = D.CONG.filter((c) => c.LoaiCong === loai &&
        (lichCong[c.MaCong] || []).every((t) => minutesBetween(t, gioKH) >= G.KHOANG_CACH_CONG_PHUT));
      if (!congHopLe.length) continue;
      tao = { ngay, gioKH, tuyen, mayBay, cong: pick(congHopLe) };
    }
    if (!tao) continue;
    const { ngay, gioKH, tuyen, mayBay, cong } = tao;
    const gioDen = addMin(gioKH, tuyen.ThoiGianBayPhut);
    const khoaSoHieu = `${mayBay.MaHang}-${tuyen.MaTuyen}`;
    if (!soHieuTheoTuyen[khoaSoHieu]) {
      const goc = { VN: 200, VJ: 100, QH: 1000 }[mayBay.MaHang];
      soHieuTheoTuyen[khoaSoHieu] = `${mayBay.MaHang}${goc + Math.floor((tuyen.MaTuyen - 1) / 2) * 20 + ((tuyen.MaTuyen - 1) % 2)}`;
    }

    let TrangThai; let GioKHThucTe = null;
    if (chiSoHuy.has(i)) {
      TrangThai = 'HUY';
    } else if (gioKH <= now) {
      const tre = chance(0.15) ? randInt(30, 150) : randInt(0, 15);
      const thucTe = addMin(gioKH, tre);
      GioKHThucTe = fmtDateTime(thucTe);
      TrangThai = addMin(thucTe, tuyen.ThoiGianBayPhut) <= now ? 'DA_HA_CANH' : 'DA_CAT_CANH';
    } else if (gioKH - now < 3 * 3600000) {
      TrangThai = 'LAM_THU_TUC';
    } else if (!daCoTre && gioKH - now < 3 * 86400000) {
      TrangThai = 'TRE'; daCoTre = true;
    } else {
      TrangThai = 'LEN_LICH';
    }

    const MaChuyen = D.CHUYENBAY.length + 1;
    D.CHUYENBAY.push({
      MaChuyen, SoHieuChuyen: soHieuTheoTuyen[khoaSoHieu], MaTuyen: tuyen.MaTuyen, SoHieuMB: mayBay.SoHieuMB,
      MaCong: cong.MaCong, NgayBay: fmtDate(ngay), GioKHKeHoach: fmtDateTime(gioKH), GioKHThucTe,
      GioDenKeHoach: fmtDateTime(gioDen), TrangThai,
      GiaVeCoBan: roundTo(700000 + tuyen.KhoangCachKm * 900, 10000),
      _gio: gioKH, _soGhe: mayBay.SoGhe,
    });
    if (TrangThai !== 'HUY') {
      (lichMB[mayBay.SoHieuMB] = lichMB[mayBay.SoHieuMB] || []).push(gioKH);
      (lichCong[cong.MaCong] = lichCong[cong.MaCong] || []).push(gioKH);
    }
  }

  // HANHKHACH — một số khách bay nhiều lần (trọng số cao) để Q3 có lịch sử dày
  D.HANHKHACH = [];
  const soGiayToDaDung = new Set();
  for (let i = 0; i < S.hanhKhach; i++) {
    const han = chance(0.12);
    const HoTen = han ? pick(TEN_HAN) : hoTenViet();
    let SoGiayTo;
    do { SoGiayTo = han ? 'M' + digits(8) : '0' + pick(['01', '31', '79', '48']) + digits(9); } while (soGiayToDaDung.has(SoGiayTo));
    soGiayToDaDung.add(SoGiayTo);
    const email = boDau(HoTen).toLowerCase().replace(/[^a-z]+/g, '.') + (i + 1) + '@example.com';
    D.HANHKHACH.push({
      MaHK: i + 1, SoGiayTo, HoTen, NgaySinh: ngaySinh(18, 70, today),
      QuocTich: han ? 'Hàn Quốc' : 'Việt Nam', Sdt: chance(0.9) ? sdt() : null, Email: chance(0.8) ? email : null,
      _w: chance(0.2) ? randInt(6, 10) : randInt(1, 3),
    });
  }

  // VE — phân bố không đều giữa các chuyến để Q1 phân hóa tỉ lệ lấp đầy
  D.VE = [];
  const trongSoChuyen = D.CHUYENBAY.map((c) => (c._gio > now ? 0.4 : 1) * (chance(0.25) ? randInt(6, 10) : randInt(1, 4)));
  const tongTS = trongSoChuyen.reduce((a, b) => a + b, 0);
  const soVeChuyen = D.CHUYENBAY.map((c, i) =>
    Math.min(c._soGhe, S.hanhKhach, Math.floor(S.ve * trongSoChuyen[i] / tongTS)));
  // phân nốt phần dư cho đủ đúng số vé kế hoạch
  for (let du = S.ve - soVeChuyen.reduce((a, b) => a + b, 0), k = 0; du > 0 && k < 100000; k++) {
    const i = randInt(0, D.CHUYENBAY.length - 1);
    if (soVeChuyen[i] < Math.min(D.CHUYENBAY[i]._soGhe, S.hanhKhach)) { soVeChuyen[i]++; du--; }
  }
  D.CHUYENBAY.forEach((c, i) => {
    const conLai = D.HANHKHACH.slice();
    const soDo = soDoGhe(c._soGhe);
    const trongTG = shuffle(soDo.thuongGia); const trongPT = shuffle(soDo.phoThong);
    for (let k = 0; k < soVeChuyen[i]; k++) {
      const hk = weightedPick(conLai, (h) => h._w);
      conLai.splice(conLai.indexOf(hk), 1); // R2: mỗi khách tối đa 1 vé / chuyến
      const thuongGia = (chance(0.12) && trongTG.length > 0) || trongPT.length === 0;
      const SoGhe = thuongGia ? trongTG.pop() : trongPT.pop(); // R3: mỗi ghế một vé
      const GiaVe = thuongGia
        ? roundTo(c.GiaVeCoBan * pick([2.4, 2.6, 2.8]), 1000)
        : roundTo(c.GiaVeCoBan * pick([0.75, 0.85, 0.95, 1, 1.1, 1.25]), 1000);
      const ngayDat = new Date(Math.min(addMin(c._gio, -randInt(60 * 6, 60 * 24 * 45)).getTime(), now.getTime() - randInt(1, 72) * 3600000));
      let TrangThai;
      if (c.TrangThai === 'HUY') TrangThai = 'DA_HUY';
      else if (chance(0.05)) TrangThai = 'DA_HUY';
      else if (c._gio <= now || c.TrangThai === 'LAM_THU_TUC') TrangThai = 'DA_CHECKIN';
      else TrangThai = 'DA_DAT';
      D.VE.push({
        MaVe: D.VE.length + 1, MaChuyen: c.MaChuyen, MaHK: hk.MaHK, HangGhe: thuongGia ? 'THUONG_GIA' : 'PHO_THONG',
        SoGhe, GiaVe, NgayDat: fmtDateTime(ngayDat), TrangThai, _chuyen: c,
      });
    }
  });

  // HANHLY — có kiện ký gửi vượt 23 kg để phát sinh phí quá cước (G4)
  D.HANHLY = [];
  const veHieuLuc = shuffle(D.VE.filter((v) => v.TrangThai !== 'DA_HUY'));
  const soXachTay = Math.min(veHieuLuc.length, Math.round(S.hanhLy * 0.55));
  const themHL = (v, LoaiHL) => {
    const CanNangKg = LoaiHL === 'XACH_TAY'
      ? +(randInt(30, 70) / 10 + (chance(0.15) ? randInt(5, 30) / 10 : 0)).toFixed(1)
      : +(chance(0.25) ? randInt(235, 315) / 10 : randInt(80, 230) / 10).toFixed(1);
    D.HANHLY.push({ MaHL: D.HANHLY.length + 1, MaVe: v.MaVe, LoaiHL, CanNangKg, PhiQuaCan: phiQuaCan(LoaiHL, CanNangKg) });
  };
  veHieuLuc.slice(0, soXachTay).forEach((v) => themHL(v, 'XACH_TAY'));
  const soKyGui = {};
  for (let k = 0; D.HANHLY.length < S.hanhLy && k < S.hanhLy * 50; k++) {
    const v = pick(veHieuLuc);
    if ((soKyGui[v.MaVe] || 0) >= G.MAX_KY_GUI) continue; // R8
    soKyGui[v.MaVe] = (soKyGui[v.MaVe] || 0) + 1;
    themHL(v, 'KY_GUI');
  }

  // MUCLUONG — 5 vị trí × 5 bậc
  const luongGoc = { THU_TUC: 9000000, AN_NINH: 9500000, DIEU_PHOI: 12000000, KY_THUAT: 13000000, VE_SINH: 7000000 };
  D.MUCLUONG = [];
  for (const [ViTri, goc] of Object.entries(luongGoc))
    for (let Bac = 1; Bac <= 5; Bac++)
      D.MUCLUONG.push({ ViTri, Bac, LuongCoBan: roundTo(goc * Math.pow(1.12, Bac - 1), 100000) });

  // NHANVIEN — 20 người, đủ 5 vị trí
  const coCau = { THU_TUC: 6, AN_NINH: 4, DIEU_PHOI: 3, KY_THUAT: 4, VE_SINH: 3 };
  D.NHANVIEN = [];
  for (const [ViTri, n] of Object.entries(coCau)) {
    for (let k = 0; k < n; k++) {
      const Bac = randInt(1, 5);
      D.NHANVIEN.push({
        MaNV: D.NHANVIEN.length + 1, CCCD: '001' + pick(['0', '1', '2']) + digits(8), HoTen: hoTenViet(),
        NgaySinh: ngaySinh(22 + Bac * 2, 30 + Bac * 4, today),
        DiaChi: `Số ${randInt(1, 300)} ${pick(DUONG)}, ${pick(QUAN_HN)}, Hà Nội`, Sdt: sdt(),
        ViTri, Bac, ThamNienNam: Math.max(0, (Bac - 1) * 2 + randInt(0, 2)), _w: randInt(1, 6),
      });
    }
  }

  // THULAO — theo G6
  D.THULAO = [
    { VaiTro: 'DIEU_PHOI_MAT_DAT', MucThuongChuyen: 150000 },
    { VaiTro: 'KY_THUAT_SAN_DO', MucThuongChuyen: 120000 },
    { VaiTro: 'LAM_THU_TUC', MucThuongChuyen: 100000 },
    { VaiTro: 'AN_NINH_CONG', MucThuongChuyen: 100000 },
  ];

  // PHANCONG — mỗi chuyến (không hủy) ≥ 1 điều phối + 2 thủ tục (R9), không trùng lịch (R10)
  const VAI_TRO_THEO_VI_TRI = { THU_TUC: 'LAM_THU_TUC', AN_NINH: 'AN_NINH_CONG', DIEU_PHOI: 'DIEU_PHOI_MAT_DAT', KY_THUAT: 'KY_THUAT_SAN_DO' };
  D.PHANCONG = [];
  const lichNV = {};
  const chuyenCanTo = D.CHUYENBAY.filter((c) => c.TrangThai !== 'HUY');
  const ganNV = (c, viTri) => {
    const ung = D.NHANVIEN.filter((nv) => nv.ViTri === viTri &&
      !D.PHANCONG.some((p) => p.MaChuyen === c.MaChuyen && p.MaNV === nv.MaNV) &&
      (lichNV[nv.MaNV] || []).every((t) => minutesBetween(t, c._gio) >= G.QUAY_DAU_PHUT));
    if (!ung.length) return false;
    const nv = weightedPick(ung, (x) => x._w);
    D.PHANCONG.push({ MaChuyen: c.MaChuyen, MaNV: nv.MaNV, VaiTro: VAI_TRO_THEO_VI_TRI[viTri] });
    (lichNV[nv.MaNV] = lichNV[nv.MaNV] || []).push(c._gio);
    return true;
  };
  for (const c of chuyenCanTo) {
    ganNV(c, 'DIEU_PHOI'); ganNV(c, 'THU_TUC'); ganNV(c, 'THU_TUC');
    ganNV(c, chance(0.5) ? 'AN_NINH' : 'KY_THUAT');
  }
  for (let k = 0; D.PHANCONG.length < S.phanCong && k < S.phanCong * 20; k++)
    ganNV(pick(chuyenCanTo), pick(['AN_NINH', 'KY_THUAT', 'THU_TUC', 'AN_NINH']));

  // DICHVU — đơn giá hiện hành; suất ăn vừa tăng giá đầu tháng này (minh họa mục 5.4)
  D.DICHVU = [
    { MaDV: 1, TenDV: 'Phòng chờ thương gia', DonGia: 650000, MoTa: 'Sử dụng phòng chờ hạng thương gia tối đa 3 giờ' },
    { MaDV: 2, TenDV: 'Suất ăn nhà ga', DonGia: 150000, MoTa: 'Suất ăn nóng tại khu ẩm thực nhà ga' },
    { MaDV: 3, TenDV: 'Xe đưa đón', DonGia: 250000, MoTa: 'Xe điện đưa đón từ sảnh đến cổng ra tàu bay' },
    { MaDV: 4, TenDV: 'Ưu tiên an ninh', DonGia: 200000, MoTa: 'Làn soi chiếu an ninh ưu tiên (fast track)' },
    { MaDV: 5, TenDV: 'Wifi trả phí', DonGia: 50000, MoTa: 'Wifi tốc độ cao trong 24 giờ' },
  ];
  const dauThangNay = new Date(now.getFullYear(), now.getMonth(), 1);
  const giaTaiThoiDiem = (dv, t) => (dv.MaDV === 2 && t < dauThangNay ? 120000 : dv.DonGia);

  // SUDUNGDICHVU — rải theo tháng, gắn với các chuyến đã bay của khách
  D.SUDUNGDICHVU = [];
  const veDaBay = D.VE.filter((v) => v.TrangThai !== 'DA_HUY' && v._chuyen._gio <= now);
  for (let k = 0; D.SUDUNGDICHVU.length < S.suDung && veDaBay.length && k < S.suDung * 20; k++) {
    const v = pick(veDaBay);
    const dv = weightedPick(D.DICHVU, (d) => [0, 2, 4, 2, 2, 3][d.MaDV] + (v.HangGhe === 'THUONG_GIA' && d.MaDV === 1 ? 6 : 0));
    const t = addMin(v._chuyen._gio, dv.MaDV === 3 ? -randInt(25, 50) : -randInt(40, 160));
    if (t > now) continue;
    const SoLuong = dv.MaDV === 2 ? randInt(1, 3) : dv.MaDV === 5 ? randInt(1, 2) : 1;
    D.SUDUNGDICHVU.push({
      MaSD: D.SUDUNGDICHVU.length + 1, MaHK: v.MaHK, MaDV: dv.MaDV, ThoiGian: fmtDateTime(t),
      SoLuong, ThanhTien: SoLuong * giaTaiThoiDiem(dv, t),
    });
  }
  D.SUDUNGDICHVU.sort((a, b) => a.ThoiGian.localeCompare(b.ThoiGian)).forEach((s, i) => { s.MaSD = i + 1; });

  return D;
}

// Thứ tự chèn tôn trọng khóa ngoại
const TABLE_ORDER = ['SANBAY', 'HANGHANGKHONG', 'MAYBAY', 'TUYENBAY', 'CONG', 'CHUYENBAY', 'HANHKHACH', 'VE',
  'HANHLY', 'MUCLUONG', 'NHANVIEN', 'THULAO', 'PHANCONG', 'DICHVU', 'SUDUNGDICHVU'];

const clean = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !k.startsWith('_')));

function insertAll(db, D) {
  tx(db, () => {
    for (const t of TABLE_ORDER) {
      const rows = D[t].map(clean);
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const stmt = db.prepare(`INSERT INTO ${t} (${cols.join(',')}) VALUES (${cols.map((c) => '$' + c).join(',')})`);
      for (const r of rows) {
        try {
          stmt.run(Object.fromEntries(cols.map((c) => ['$' + c, r[c]])));
        } catch (e) {
          throw new Error(`Lỗi khi chèn ${t} ${JSON.stringify(r)}: ${e.message}`);
        }
      }
    }
  });
}

function toMySQL(D, scaleName) {
  const esc = (v) => (v === null || v === undefined ? 'NULL'
    : typeof v === 'number' ? String(v) : `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
  const out = [
    '-- Dữ liệu mẫu sinh tự động bởi server/seed.js', `-- Quy mô: ${scaleName} — sinh ngày ${fmtDateTime(new Date())}`,
    'USE quan_ly_san_bay;', 'SET NAMES utf8mb4;', 'START TRANSACTION;', '',
  ];
  for (const t of TABLE_ORDER) {
    const rows = D[t].map(clean);
    if (!rows.length) continue;
    const cols = Object.keys(rows[0]);
    out.push(`-- ${t} (${rows.length} bản ghi)`);
    for (let i = 0; i < rows.length; i += 200) {
      out.push(`INSERT INTO ${t} (${cols.join(', ')}) VALUES`);
      out.push(rows.slice(i, i + 200).map((r) => `  (${cols.map((c) => esc(r[c])).join(', ')})`).join(',\n') + ';');
    }
    out.push('');
  }
  out.push('COMMIT;', '');
  return out.join('\n');
}

// Xóa toàn bộ bảng (kèm trigger, chỉ mục) ngay trong CSDL đang mở — không cần xóa file,
// nên chạy được cả khi máy chủ web đang giữ kết nối.
function dropAll(db) {
  db.exec('PRAGMA foreign_keys = OFF');
  // TAIKHOAN (tài khoản đăng nhập của web) được giữ lại khi nạp lại dữ liệu mẫu
  const objs = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'TAIKHOAN'").all();
  tx(db, () => { for (const o of objs) db.exec(`DROP TABLE IF EXISTS "${o.name}"`); });
  db.exec('PRAGMA foreign_keys = ON');
}

// Tạo lại lược đồ và nạp dữ liệu mẫu vào một kết nối có sẵn
function reseed(db, scale = 'kehoach') {
  dropAll(db);
  createSchema(db);
  const D = generate(scale);
  insertAll(db, D);
  return D;
}

function seed({ file = DB_FILE, scale = 'kehoach', mysqlOut = null, quiet = false } = {}) {
  const db = open(file);
  const D = reseed(db, scale);
  if (mysqlOut) fs.writeFileSync(mysqlOut, toMySQL(D, scale), 'utf8');
  if (!quiet) {
    console.log(`Đã tạo CSDL ${file} (quy mô: ${scale})`);
    for (const t of TABLE_ORDER) console.log(`  ${t.padEnd(14)} ${D[t].length}`);
    if (mysqlOut) console.log(`Đã xuất script MySQL: ${mysqlOut}`);
  }
  return db;
}

module.exports = { seed, reseed, generate, TABLE_ORDER, SCALES };

if (require.main === module) {
  const arg = (name) => {
    const a = process.argv.find((x) => x.startsWith(`--${name}=`));
    return a ? a.split('=').slice(1).join('=') : null;
  };
  const mysqlOut = arg('mysql');
  // Chỉ xuất script MySQL thì sinh dữ liệu trong bộ nhớ, không đụng tới CSDL của web
  const db = seed({
    file: mysqlOut ? ':memory:' : DB_FILE,
    scale: arg('scale') || 'kehoach',
    mysqlOut: mysqlOut ? path.resolve(mysqlOut) : null,
  });
  db.close();
}
