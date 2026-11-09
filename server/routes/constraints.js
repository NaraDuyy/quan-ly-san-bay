// Ràng buộc toàn vẹn R1–R10 (mục 7): mô tả, thử vi phạm (luôn ROLLBACK) và kiểm tra dữ liệu hiện có.
const express = require('express');
const { dryRun, friendlyError } = require('../db');
const { HttpError } = require('./crud');
const { kiemTraR9, fmtDateTime, fmtDate, G } = require('../rules');

const RULES = [
  { code: 'R1', text: 'Số vé còn hiệu lực của một chuyến không vượt quá số ghế của tàu bay', mech: 'Trigger', impl: 'trg_ve_r1_ins / trg_ve_r1_upd / trg_cb_r1_upd' },
  { code: 'R2', text: 'Mỗi hành khách chỉ có tối đa một vé trên một chuyến bay', mech: 'UNIQUE', impl: 'UNIQUE (MaChuyen, MaHK) trên VE' },
  { code: 'R3', text: 'Mỗi số ghế trên một chuyến chỉ được bán cho một vé', mech: 'UNIQUE', impl: 'UNIQUE (MaChuyen, SoGhe) trên VE' },
  { code: 'R4', text: 'Một tàu bay không được xếp hai chuyến cách nhau dưới 120 phút (G1)', mech: 'Trigger', impl: 'trg_cb_r4_ins / trg_cb_r4_upd' },
  { code: 'R5', text: 'Một cổng không phục vụ hai chuyến cách nhau dưới 60 phút (G7)', mech: 'Trigger', impl: 'trg_cb_r5_ins / trg_cb_r5_upd' },
  { code: 'R6', text: 'Tàu bay quá 180 ngày kể từ lần bảo dưỡng cuối không được gán chuyến mới (G2)', mech: 'Trigger', impl: 'trg_cb_r6_ins / trg_cb_r6_upd' },
  { code: 'R7', text: 'Mỗi kiện hành lý không vượt quá 32 kg (G3)', mech: 'CHECK', impl: 'CHECK (CanNangKg > 0 AND CanNangKg <= 32) trên HANHLY' },
  { code: 'R8', text: 'Mỗi vé có tối đa 1 kiện xách tay và 3 kiện ký gửi (G5)', mech: 'Trigger', impl: 'trg_hl_r8_ins / trg_hl_r8_upd' },
  { code: 'R9', text: 'Trước giờ khởi hành mỗi chuyến cần ≥ 1 điều phối mặt đất và ≥ 2 làm thủ tục', mech: 'Ứng dụng', impl: 'Kiểm tra khi chuyển trạng thái sang LAM_THU_TUC (server/rules.js)' },
  { code: 'R10', text: 'Một nhân viên không được phân công hai chuyến cách nhau dưới 120 phút', mech: 'Trigger', impl: 'trg_pc_r10_ins / trg_pc_r10_upd' },
];

module.exports = function constraintsRouter(db) {
  const r = express.Router();
  const now = () => fmtDateTime(new Date());
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);

  // Tìm tàu bay còn hạn và rảnh trong ±120 phút quanh thời điểm gio, khác tàu "tru"
  const mayBayRanh = (gio, ngay, tru = '') => one(`
    SELECT SoHieuMB FROM MAYBAY m
    WHERE m.SoHieuMB <> ? AND julianday(?) - julianday(m.NgayBaoDuongCuoi) <= ${G.CHU_KY_BAO_DUONG}
      AND NOT EXISTS (SELECT 1 FROM CHUYENBAY c WHERE c.SoHieuMB = m.SoHieuMB AND c.TrangThai <> 'HUY'
                        AND abs(julianday(c.GioKHKeHoach) - julianday(?)) * 1440 < ${G.QUAY_DAU_PHUT})
    LIMIT 1`, tru, ngay, gio);

  const themChuyen = (c) => run(`
    INSERT INTO CHUYENBAY (SoHieuChuyen, MaTuyen, SoHieuMB, MaCong, NgayBay, GioKHKeHoach, GioDenKeHoach, TrangThai, GiaVeCoBan)
    VALUES (?, 1, ?, ?, date(?), ?, datetime(?, '+120 minutes'), 'LEN_LICH', 1500000)`,
  c.so, c.mb, c.cong ?? null, c.gio, c.gio, c.gio);

  // Mỗi kịch bản gọi say(mô tả) rồi thực hiện thao tác vi phạm; CSDL (hoặc tầng ứng dụng) phải ném lỗi
  const SCENARIOS = {
    R1(say) {
      const c = one(`SELECT c.MaChuyen, c.NgayBay, COUNT(v.MaVe) AS n, mb.MaHang FROM CHUYENBAY c
        JOIN VE v ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY' JOIN MAYBAY mb ON mb.SoHieuMB = c.SoHieuMB
        WHERE c.TrangThai <> 'HUY' GROUP BY c.MaChuyen ORDER BY n DESC LIMIT 1`);
      const hk = one('SELECT MaHK FROM HANHKHACH WHERE MaHK NOT IN (SELECT MaHK FROM VE WHERE MaChuyen = ?) LIMIT 1', c.MaChuyen);
      // Đổi chuyến sang một tàu bay tạm có số ghế đúng bằng số vé đã bán -> chuyến "hết chỗ"
      run(`INSERT INTO MAYBAY VALUES ('TEST-R1', ?, 'Test', 'Test', ?, 2020, ?)`, c.MaHang, c.n, c.NgayBay);
      run(`UPDATE CHUYENBAY SET SoHieuMB = 'TEST-R1' WHERE MaChuyen = ?`, c.MaChuyen);
      say(`Chuyến #${c.MaChuyen} có ${c.n} vé; tạm đổi sang tàu bay ${c.n} ghế rồi bán thêm 1 vé`);
      run(`INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', 'Z99', 1000000, ?)`, c.MaChuyen, hk.MaHK, now());
    },
    R2(say) {
      const v = one("SELECT * FROM VE WHERE TrangThai <> 'DA_HUY' LIMIT 1");
      say(`Bán vé thứ hai cho hành khách #${v.MaHK} trên chuyến #${v.MaChuyen}`);
      run(`INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', 'Z98', 1000000, ?)`, v.MaChuyen, v.MaHK, now());
    },
    R3(say) {
      const v = one("SELECT * FROM VE WHERE TrangThai <> 'DA_HUY' LIMIT 1");
      const hk = one('SELECT MaHK FROM HANHKHACH WHERE MaHK NOT IN (SELECT MaHK FROM VE WHERE MaChuyen = ?) LIMIT 1', v.MaChuyen);
      say(`Bán ghế ${v.SoGhe} đã có chủ của chuyến #${v.MaChuyen} cho hành khách #${hk.MaHK}`);
      run(`INSERT INTO VE (MaChuyen, MaHK, HangGhe, SoGhe, GiaVe, NgayDat) VALUES (?, ?, 'PHO_THONG', ?, 1000000, ?)`, v.MaChuyen, hk.MaHK, v.SoGhe, now());
    },
    R4(say) {
      const c = one(`SELECT c.* FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
        WHERE c.TrangThai <> 'HUY' AND julianday(c.NgayBay) - julianday(m.NgayBaoDuongCuoi) <= ${G.CHU_KY_BAO_DUONG}
        ORDER BY c.GioKHKeHoach DESC LIMIT 1`);
      const gio = one(`SELECT datetime(?, '+60 minutes') AS g`, c.GioKHKeHoach).g;
      say(`Xếp tàu ${c.SoHieuMB} bay lúc ${gio}, chỉ 60 phút sau chuyến ${c.SoHieuChuyen} của cùng tàu`);
      themChuyen({ so: 'TEST4', mb: c.SoHieuMB, gio });
    },
    R5(say) {
      const c = one(`SELECT * FROM CHUYENBAY WHERE TrangThai <> 'HUY' AND MaCong IS NOT NULL ORDER BY GioKHKeHoach DESC LIMIT 1`);
      const gio = one(`SELECT datetime(?, '+30 minutes') AS g`, c.GioKHKeHoach).g;
      const mb = mayBayRanh(gio, gio.slice(0, 10), c.SoHieuMB);
      if (!mb) throw new HttpError(409, 'Không tìm được tàu bay rảnh để dựng kịch bản');
      say(`Xếp chuyến lúc ${gio} vào cổng #${c.MaCong}, chỉ 30 phút sau chuyến ${c.SoHieuChuyen}`);
      themChuyen({ so: 'TEST5', mb: mb.SoHieuMB, cong: c.MaCong, gio });
    },
    R6(say) {
      const mb = one(`SELECT * FROM MAYBAY ORDER BY NgayBaoDuongCuoi LIMIT 1`);
      const gio = one(`SELECT datetime(date(?, '+${G.CHU_KY_BAO_DUONG + 5} days'), '+10 hours') AS g`, mb.NgayBaoDuongCuoi).g;
      say(`Gán tàu ${mb.SoHieuMB} (bảo dưỡng cuối ${mb.NgayBaoDuongCuoi}) cho chuyến ngày ${gio.slice(0, 10)}`);
      themChuyen({ so: 'TEST6', mb: mb.SoHieuMB, gio });
    },
    R7(say) {
      const v = one("SELECT MaVe FROM VE WHERE TrangThai <> 'DA_HUY' AND MaVe NOT IN (SELECT MaVe FROM HANHLY WHERE LoaiHL = 'KY_GUI' GROUP BY MaVe HAVING COUNT(*) >= 3) LIMIT 1");
      say(`Thêm kiện ký gửi 35 kg cho vé #${v.MaVe}`);
      run(`INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, 'KY_GUI', 35, 1200000)`, v.MaVe);
    },
    R8(say) {
      const v = one("SELECT MaVe FROM HANHLY WHERE LoaiHL = 'XACH_TAY' LIMIT 1");
      say(`Thêm kiện xách tay thứ hai cho vé #${v.MaVe}`);
      run(`INSERT INTO HANHLY (MaVe, LoaiHL, CanNangKg, PhiQuaCan) VALUES (?, 'XACH_TAY', 5, 0)`, v.MaVe);
    },
    R9(say) {
      const c = one(`SELECT * FROM CHUYENBAY WHERE TrangThai = 'LEN_LICH' ORDER BY GioKHKeHoach LIMIT 1`)
        || one(`SELECT * FROM CHUYENBAY WHERE TrangThai <> 'HUY' ORDER BY GioKHKeHoach DESC LIMIT 1`);
      run(`DELETE FROM PHANCONG WHERE MaChuyen = ? AND VaiTro = 'LAM_THU_TUC'`, c.MaChuyen);
      say(`Rút nhân viên làm thủ tục khỏi chuyến ${c.SoHieuChuyen} rồi chuyển trạng thái sang LAM_THU_TUC`);
      const err = kiemTraR9(db, c.MaChuyen);
      if (err) throw new Error(err);
    },
    R10(say) {
      const p = one(`SELECT p.MaNV, c.GioKHKeHoach, c.SoHieuMB, c.SoHieuChuyen FROM PHANCONG p
        JOIN CHUYENBAY c ON c.MaChuyen = p.MaChuyen WHERE c.TrangThai <> 'HUY' ORDER BY c.GioKHKeHoach DESC LIMIT 1`);
      const gio = one(`SELECT datetime(?, '+90 minutes') AS g`, p.GioKHKeHoach).g;
      const mb = mayBayRanh(gio, gio.slice(0, 10), p.SoHieuMB);
      if (!mb) throw new HttpError(409, 'Không tìm được tàu bay rảnh để dựng kịch bản');
      const maChuyen = Number(themChuyen({ so: 'TEST10', mb: mb.SoHieuMB, gio }).lastInsertRowid);
      say(`Phân công NV #${p.MaNV} cho chuyến lúc ${gio}, 90 phút sau chuyến ${p.SoHieuChuyen} mà NV đang phục vụ`);
      run(`INSERT INTO PHANCONG (MaChuyen, MaNV, VaiTro) VALUES (?, ?, 'LAM_THU_TUC')`, maChuyen, p.MaNV);
    },
  };

  r.get('/', (req, res) => res.json(RULES));

  r.post('/:code/test', (req, res) => {
    const code = req.params.code.toUpperCase();
    const sc = SCENARIOS[code];
    if (!sc) throw new HttpError(404, 'Không có ràng buộc này');
    let thuTuc = null;
    try {
      dryRun(db, () => sc((t) => { thuTuc = t; }));
      res.json({ code, blocked: false, thuTuc, message: 'Thao tác KHÔNG bị chặn — ràng buộc chưa được cài đặt đúng!' });
    } catch (e) {
      if (e instanceof HttpError) throw e;
      if (e instanceof TypeError) throw new HttpError(409, 'Không đủ dữ liệu mẫu để dựng kịch bản thử');
      res.json({ code, blocked: true, thuTuc, message: friendlyError(e), raw: e.message });
    }
  });

  // Kiểm tra toàn bộ dữ liệu hiện có có thỏa R1–R10 không (số bản ghi vi phạm)
  r.get('/audit', (req, res) => {
    const P = { $now: now(), $homNay: fmtDate(new Date()) };
    const checks = {
      R1: `SELECT COUNT(*) AS n FROM (SELECT c.MaChuyen FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
            JOIN VE v ON v.MaChuyen = c.MaChuyen AND v.TrangThai <> 'DA_HUY' GROUP BY c.MaChuyen HAVING COUNT(*) > MAX(m.SoGhe))`,
      R2: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM VE GROUP BY MaChuyen, MaHK HAVING COUNT(*) > 1)`,
      R3: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM VE GROUP BY MaChuyen, SoGhe HAVING COUNT(*) > 1)`,
      R4: `SELECT COUNT(*) AS n FROM CHUYENBAY a JOIN CHUYENBAY b ON a.SoHieuMB = b.SoHieuMB AND a.MaChuyen < b.MaChuyen
            WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < ${G.QUAY_DAU_PHUT}`,
      R5: `SELECT COUNT(*) AS n FROM CHUYENBAY a JOIN CHUYENBAY b ON a.MaCong = b.MaCong AND a.MaChuyen < b.MaChuyen
            WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < ${G.KHOANG_CACH_CONG_PHUT}`,
      R6: `SELECT COUNT(*) AS n FROM CHUYENBAY c JOIN MAYBAY m ON m.SoHieuMB = c.SoHieuMB
            WHERE c.GioKHKeHoach > $now AND c.TrangThai <> 'HUY' AND julianday(c.NgayBay) - julianday(m.NgayBaoDuongCuoi) > ${G.CHU_KY_BAO_DUONG}`,
      R7: `SELECT COUNT(*) AS n FROM HANHLY WHERE CanNangKg <= 0 OR CanNangKg > ${G.TRAN_KG}`,
      R8: `SELECT COUNT(*) AS n FROM (SELECT 1 FROM HANHLY GROUP BY MaVe, LoaiHL
            HAVING COUNT(*) > CASE LoaiHL WHEN 'XACH_TAY' THEN ${G.MAX_XACH_TAY} ELSE ${G.MAX_KY_GUI} END)`,
      R9: `SELECT COUNT(*) AS n FROM CHUYENBAY c WHERE c.TrangThai IN ('LAM_THU_TUC','DA_CAT_CANH','DA_HA_CANH','TRE')
            AND ((SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'DIEU_PHOI_MAT_DAT') < 1
              OR (SELECT COUNT(*) FROM PHANCONG p WHERE p.MaChuyen = c.MaChuyen AND p.VaiTro = 'LAM_THU_TUC') < 2)`,
      R10: `SELECT COUNT(*) AS n FROM PHANCONG p1 JOIN PHANCONG p2 ON p1.MaNV = p2.MaNV AND p1.MaChuyen < p2.MaChuyen
            JOIN CHUYENBAY a ON a.MaChuyen = p1.MaChuyen JOIN CHUYENBAY b ON b.MaChuyen = p2.MaChuyen
            WHERE a.TrangThai <> 'HUY' AND b.TrangThai <> 'HUY' AND abs(julianday(a.GioKHKeHoach) - julianday(b.GioKHKeHoach)) * 1440 < ${G.QUAY_DAU_PHUT}`,
    };
    const used = (sql) => Object.fromEntries(Object.entries(P).filter(([k]) => sql.includes(k)));
    res.json(Object.fromEntries(Object.entries(checks).map(([k, sql]) => [k, db.prepare(sql).get(used(sql)).n])));
  });

  return r;
};
