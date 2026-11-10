// API CRUD tổng quát cho 15 bảng, sinh từ server/meta.js.
const express = require('express');
const { TABLES, DISPLAY, OPTION_ORDER } = require('../meta');
const { tx } = require('../db');
const { phiQuaCan, kiemTraR9, TRANG_THAI_CAN_TO_PHUC_VU, fmtDateTime } = require('../rules');
const { HttpError, requireTable } = require('../auth');

// Quyền ghi theo bảng (xem ROLES trong server/auth.js)
const canWrite = requireTable((req) => req.params.name.toUpperCase());

function getTable(name) {
  const t = TABLES[name];
  if (!t) throw new HttpError(404, `Không có bảng ${name}`);
  return t;
}

const display = (table, alias) => DISPLAY[table].replaceAll('{a}', alias);

// Chuẩn hóa giá trị từ form theo kiểu cột
function normalize(c, v) {
  if (v === undefined) return undefined;
  if (v === null || (typeof v === 'string' && v.trim() === '')) return null;
  switch (c.type) {
    case 'int': case 'money': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HttpError(400, `${c.label}: phải là số`);
      return Math.round(n);
    }
    case 'decimal': {
      const n = Number(v);
      if (!Number.isFinite(n)) throw new HttpError(400, `${c.label}: phải là số`);
      return Math.round(n * 100) / 100;
    }
    case 'datetime': {
      const s = String(v).trim().replace('T', ' ');
      if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) throw new HttpError(400, `${c.label}: sai định dạng ngày giờ`);
      return s.length === 16 ? s + ':00' : s;
    }
    case 'date': {
      const s = String(v).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new HttpError(400, `${c.label}: sai định dạng ngày`);
      return s;
    }
    case 'enum':
      if (!c.options.includes(v)) throw new HttpError(400, `${c.label}: giá trị không hợp lệ`);
      return v;
    default:
      return String(v).trim();
  }
}

// Điền các cột suy ra / tính toán trước khi ghi (theo giả định trong báo cáo)
function fillDerived(db, name, row, old = null) {
  const now = fmtDateTime(new Date());
  if (name === 'CHUYENBAY') {
    const gio = row.GioKHKeHoach ?? old?.GioKHKeHoach;
    // Đổi giờ khởi hành mà không sửa ngày bay / giờ đến -> tính lại hai cột này
    const doiGio = old && row.GioKHKeHoach && row.GioKHKeHoach !== old.GioKHKeHoach;
    if (doiGio && (row.NgayBay === undefined || row.NgayBay === old.NgayBay)) row.NgayBay = null;
    if (doiGio && (row.GioDenKeHoach === undefined || row.GioDenKeHoach === old.GioDenKeHoach)) row.GioDenKeHoach = null;
    if (gio && (row.NgayBay === null || (row.NgayBay === undefined && !old))) row.NgayBay = gio.slice(0, 10);
    if (gio && (row.GioDenKeHoach === null || (row.GioDenKeHoach === undefined && !old))) {
      const t = db.prepare('SELECT ThoiGianBayPhut FROM TUYENBAY WHERE MaTuyen = ?').get(row.MaTuyen ?? old?.MaTuyen);
      if (t) row.GioDenKeHoach = db.prepare(`SELECT datetime(?, '+' || ? || ' minutes') AS g`).get(gio, t.ThoiGianBayPhut).g;
    }
  }
  if (name === 'VE' && !old && !row.NgayDat) row.NgayDat = now;
  if (name === 'SUDUNGDICHVU' && !old && !row.ThoiGian) row.ThoiGian = now;
  if (name === 'HANHLY') {
    const loai = row.LoaiHL ?? old?.LoaiHL;
    const kg = row.CanNangKg ?? old?.CanNangKg;
    row.PhiQuaCan = phiQuaCan(loai, kg);
  }
  if (name === 'SUDUNGDICHVU') {
    const maDV = row.MaDV ?? old?.MaDV;
    const soLuong = row.SoLuong ?? old?.SoLuong ?? 1;
    if (!old || maDV !== old.MaDV || soLuong !== old.SoLuong) {
      // Mục 5.4: giữ đơn giá lịch sử nếu chỉ sửa số lượng; đổi dịch vụ thì lấy đơn giá hiện hành
      let donGia;
      if (old && maDV === old.MaDV && old.SoLuong) donGia = old.ThanhTien / old.SoLuong;
      else donGia = db.prepare('SELECT DonGia FROM DICHVU WHERE MaDV = ?').get(maDV)?.DonGia;
      if (donGia === undefined) throw new HttpError(400, 'Dịch vụ không tồn tại');
      row.ThanhTien = Math.round(donGia * soLuong);
    }
  }
}

// R9 — ràng buộc quy trình, kiểm tra ở tầng ứng dụng khi chuyển trạng thái chuyến
function checkR9(db, name, row, old) {
  if (name !== 'CHUYENBAY' || !row.TrangThai) return;
  const vao = TRANG_THAI_CAN_TO_PHUC_VU.includes(row.TrangThai);
  const truoc = old && TRANG_THAI_CAN_TO_PHUC_VU.includes(old.TrangThai);
  if (vao && !truoc) {
    if (!old) throw new HttpError(400, 'R9: Chuyến mới phải tạo ở trạng thái Lên lịch, phân công tổ phục vụ rồi mới chuyển trạng thái');
    const err = kiemTraR9(db, old.MaChuyen);
    if (err) throw new HttpError(400, err);
  }
}

function pkWhere(t, pk) {
  const parts = t.pk.map((k) => {
    if (pk?.[k] === undefined) throw new HttpError(400, `Thiếu khóa ${k}`);
    return `${k} = $pk_${k}`;
  });
  const params = Object.fromEntries(t.pk.map((k) => [`$pk_${k}`, pk[k]]));
  return { sql: parts.join(' AND '), params };
}

module.exports = function crudRouter(db) {
  const r = express.Router();

  r.get('/', (req, res) => {
    const counts = {};
    for (const name of Object.keys(TABLES)) counts[name] = db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n;
    res.json({ tables: TABLES, counts });
  });

  // Danh sách có tìm kiếm, sắp xếp, phân trang, lọc theo cột (?f_<Cot>=giá trị)
  r.get('/:name', (req, res) => {
    const name = req.params.name.toUpperCase();
    const t = getTable(name);
    const size = Math.min(Math.max(parseInt(req.query.size, 10) || 20, 1), 500);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const names = t.columns.map((c) => c.name);
    const sort = names.includes(req.query.sort) ? req.query.sort : (t.defaultSort || t.pk[0]);
    const dir = (req.query.dir || t.defaultDir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const select = ['m.*']; const joins = [];
    t.columns.filter((c) => c.fk).forEach((c, i) => {
      const a = `f${i}`; const ft = TABLES[c.fk];
      joins.push(`LEFT JOIN ${c.fk} ${a} ON ${a}.${ft.pk[0]} = m.${c.name}`);
      select.push(`${display(c.fk, a)} AS "${c.name}__label"`);
    });

    const where = []; const params = {};
    if (req.query.q) {
      params.$q = `%${req.query.q}%`;
      const ors = t.columns.map((c) => `CAST(m.${c.name} AS TEXT) LIKE $q`);
      t.columns.filter((c) => c.fk).forEach((c, i) => ors.push(`${display(c.fk, `f${i}`)} LIKE $q`));
      where.push(`(${ors.join(' OR ')})`);
    }
    for (const c of t.columns) {
      const v = req.query[`f_${c.name}`];
      if (v !== undefined && v !== '') { where.push(`m.${c.name} = $f_${c.name}`); params[`$f_${c.name}`] = v; }
    }
    const from = `FROM ${name} m ${joins.join(' ')} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
    const total = db.prepare(`SELECT COUNT(*) AS n ${from}`).get(params).n;
    const rows = db.prepare(
      `SELECT ${select.join(', ')} ${from} ORDER BY m.${sort} ${dir}, ${t.pk.map((k) => 'm.' + k).join(', ')} LIMIT ${size} OFFSET ${(page - 1) * size}`,
    ).all(params);
    res.json({ rows, total, page, size, sort, dir: dir.toLowerCase() });
  });

  // Danh sách giá trị cho ô chọn khóa ngoại
  r.get('/:name/options', (req, res) => {
    const name = req.params.name.toUpperCase();
    const t = getTable(name);
    if (!DISPLAY[name]) throw new HttpError(400, 'Bảng không hỗ trợ chọn');
    const order = (OPTION_ORDER[name] || `{a}.${t.pk[0]}`).replaceAll('{a}', 'm');
    const params = {}; let where = '';
    if (req.query.q) { where = `WHERE ${display(name, 'm')} LIKE $q`; params.$q = `%${req.query.q}%`; }
    const rows = db.prepare(
      `SELECT m.${t.pk[0]} AS value, ${display(name, 'm')} AS label FROM ${name} m ${where} ORDER BY ${order} LIMIT 2000`,
    ).all(params);
    res.json(rows);
  });

  r.post('/:name', canWrite, (req, res) => {
    const name = req.params.name.toUpperCase();
    const t = getTable(name);
    const row = {};
    for (const c of t.columns) {
      if (c.auto || c.computed) continue;
      const v = normalize(c, req.body[c.name]);
      row[c.name] = v === undefined || v === null ? (c.default ?? null) : v;
    }
    fillDerived(db, name, row);
    checkR9(db, name, row, null);
    const cols = Object.keys(row);
    const result = tx(db, () => db.prepare(
      `INSERT INTO ${name} (${cols.join(', ')}) VALUES (${cols.map((c) => '$' + c).join(', ')})`,
    ).run(Object.fromEntries(cols.map((c) => ['$' + c, row[c]]))));
    const pk = t.auto ? { [t.auto]: Number(result.lastInsertRowid) } : Object.fromEntries(t.pk.map((k) => [k, row[k]]));
    res.status(201).json({ ok: true, pk });
  });

  r.put('/:name', canWrite, (req, res) => {
    const name = req.params.name.toUpperCase();
    const t = getTable(name);
    const w = pkWhere(t, req.body.pk);
    const old = db.prepare(`SELECT * FROM ${name} WHERE ${w.sql}`).get(w.params);
    if (!old) throw new HttpError(404, 'Không tìm thấy bản ghi');
    const row = {};
    for (const c of t.columns) {
      if (c.auto || c.computed || !(c.name in (req.body.data || {}))) continue;
      const v = normalize(c, req.body.data[c.name]);
      if (v === null && c.required) throw new HttpError(400, `Thiếu giá trị bắt buộc: ${c.label}`);
      row[c.name] = v;
    }
    fillDerived(db, name, row, old);
    checkR9(db, name, row, old);
    const cols = Object.keys(row).filter((k) => row[k] !== old[k]);
    if (!cols.length) return res.json({ ok: true, changed: 0 });
    tx(db, () => db.prepare(`UPDATE ${name} SET ${cols.map((c) => `${c} = $${c}`).join(', ')} WHERE ${w.sql}`)
      .run({ ...w.params, ...Object.fromEntries(cols.map((c) => ['$' + c, row[c]])) }));
    res.json({ ok: true, changed: cols.length });
  });

  r.delete('/:name', canWrite, (req, res) => {
    const name = req.params.name.toUpperCase();
    const t = getTable(name);
    const w = pkWhere(t, req.body.pk);
    const info = tx(db, () => db.prepare(`DELETE FROM ${name} WHERE ${w.sql}`).run(w.params));
    if (!info.changes) throw new HttpError(404, 'Không tìm thấy bản ghi');
    res.json({ ok: true });
  });

  return r;
};

