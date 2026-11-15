// Nhật ký SQL: ghi lại lần lượt mọi câu lệnh chạy trên CSDL để xem trực tiếp ở trang "Nhật ký SQL".
// Mỗi trình duyệt có một mã (cookie sb_cid) nên hai tab của cùng trình duyệt thấy chung một nhật ký,
// còn người dùng khác không thấy thao tác của nhau (trừ Quản trị chọn xem tất cả).
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const express = require('express');
const { friendlyError } = require('./db');

const MAX_ENTRIES = 3000;
const CID_COOKIE = 'sb_cid';
const als = new AsyncLocalStorage();
const entries = [];
let nextId = 1;
let nextReq = 1;

// Tên thao tác hiển thị theo đường dẫn API
const ACTIONS = [
  [/^POST \/api\/auth\/login$/, () => 'Đăng nhập'],
  [/^POST \/api\/auth\/logout$/, () => 'Đăng xuất'],
  [/^POST \/api\/auth\/password$/, () => 'Đổi mật khẩu'],
  [/^GET \/api\/auth\/me$/, () => 'Kiểm tra phiên đăng nhập'],
  [/^POST \/api\/ban-ve$/, () => 'Bán vé'],
  [/^POST \/api\/chuyen\/(\d+)\/trang-thai$/, (m) => `Đổi trạng thái chuyến #${m[1]}`],
  [/^GET \/api\/chuyen\/(\d+)$/, (m) => `Xem chi tiết chuyến #${m[1]}`],
  [/^GET \/api\/chuyen-mo-ban$/, () => 'Danh sách chuyến mở bán'],
  [/^POST \/api\/may-bay\/([^/]+)\/bao-duong$/, (m) => `Ghi nhận bảo dưỡng ${decodeURIComponent(m[1])}`],
  [/^POST \/api\/reset$/, () => 'Nạp lại dữ liệu mẫu'],
  [/^GET \/api\/overview$/, () => 'Trang tổng quan'],
  [/^GET \/api\/queries\/q(\d)$/, (m) => `Truy vấn Q${m[1]}`],
  [/^GET \/api\/tables$/, () => 'Đếm số bản ghi 15 bảng'],
  [/^GET \/api\/tables\/(\w+)\/options$/, (m) => `Danh sách chọn ${m[1].toUpperCase()}`],
  [/^GET \/api\/tables\/(\w+)$/, (m) => `Xem bảng ${m[1].toUpperCase()}`],
  [/^POST \/api\/tables\/(\w+)$/, (m) => `Thêm vào bảng ${m[1].toUpperCase()}`],
  [/^PUT \/api\/tables\/(\w+)$/, (m) => `Sửa bảng ${m[1].toUpperCase()}`],
  [/^DELETE \/api\/tables\/(\w+)$/, (m) => `Xóa khỏi bảng ${m[1].toUpperCase()}`],
  [/^\w+ \/api\/accounts/, () => 'Quản lý tài khoản'],
  [/^\w+ \/api\/constraints/, () => 'Kiểm tra ràng buộc'],
];
function actionOf(method, path) {
  const key = `${method} ${path}`;
  for (const [re, f] of ACTIONS) { const m = key.match(re); if (m) return f(m); }
  return key;
}

function kindOf(sql) {
  const w = sql.trim().split(/\s+/)[0].toUpperCase();
  if (['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'RELEASE'].includes(w)) return 'tx';
  if (['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(w)) return 'write';
  if (w === 'SELECT' || w === 'WITH') return 'read';
  return 'other';
}

// Che mã băm mật khẩu; BigInt -> số
function cleanParam(v) {
  if (typeof v === 'string' && v.startsWith('scrypt$')) return '«mã băm mật khẩu»';
  if (typeof v === 'bigint') return Number(v);
  return v;
}
function cleanParams(args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return Object.fromEntries(Object.entries(args[0]).map(([k, v]) => [k, cleanParam(v)]));
  }
  return args.map(cleanParam);
}

function push(entry) {
  entries.push({ id: nextId++, ...entry });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

function record(sql, args, fn) {
  const store = als.getStore();
  if (!store || store.skip) return fn();
  if (store.suppress) { store.suppressed++; return fn(); }
  const t0 = process.hrtime.bigint();
  const base = {
    time: Date.now(), cid: store.cid, req: store.reqId, method: store.method, path: store.path,
    action: store.action, user: store.req.user?.TenDangNhap || null, sql: sql.trim(),
    params: cleanParams(args), kind: kindOf(sql),
  };
  try {
    const r = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let result = null;
    if (Array.isArray(r)) result = { rows: r.length };
    else if (r && typeof r === 'object' && 'changes' in r) result = { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    else if (base.kind === 'read') result = { rows: r === undefined ? 0 : 1 };
    push({ ...base, ms, result });
    return r;
  } catch (e) {
    push({ ...base, ms: Number(process.hrtime.bigint() - t0) / 1e6, error: friendlyError(e), raw: e.message });
    throw e;
  }
}

// Gắn ghi nhật ký vào một kết nối node:sqlite (bọc prepare / exec)
function instrument(db) {
  if (db.__sqlLog) return db;
  const prepare = db.prepare.bind(db);
  const exec = db.exec.bind(db);
  db.prepare = (sql) => {
    const st = prepare(sql);
    return new Proxy(st, {
      get(target, prop) {
        if (prop === 'run' || prop === 'get' || prop === 'all') {
          return (...args) => record(sql, args, () => target[prop](...args));
        }
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
  };
  db.exec = (sql) => record(sql, [], () => exec(sql));
  db.__sqlLog = true;
  return db;
}

// Chạy fn mà không ghi từng câu (ví dụ nạp lại hàng nghìn dòng dữ liệu mẫu), chỉ ghi một dòng tóm tắt
function quietly(note, fn) {
  const store = als.getStore();
  if (!store || store.skip) return fn();
  store.suppress = true; store.suppressed = 0;
  try { return fn(); } finally {
    store.suppress = false;
    push({
      time: Date.now(), cid: store.cid, req: store.reqId, method: store.method, path: store.path, action: store.action,
      user: store.req.user?.TenDangNhap || null, kind: 'note', sql: `-- ${note}: ${store.suppressed} câu lệnh (ẩn bớt cho gọn)`, params: [],
    });
  }
}

function cookieValue(header = '', name) {
  const m = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

// Middleware: gắn mã trình duyệt và ngữ cảnh yêu cầu cho mọi câu SQL chạy trong yêu cầu này
function contextMiddleware(req, res, next) {
  let cid = cookieValue(req.headers.cookie, CID_COOKIE);
  if (!cid || !/^[A-Za-z0-9_-]{16,64}$/.test(cid)) {
    cid = crypto.randomBytes(16).toString('base64url');
    res.append('Set-Cookie', `${CID_COOKIE}=${cid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.secure ? '; Secure' : ''}`);
  }
  req.clientId = cid;
  const path = req.originalUrl.split('?')[0];
  const store = {
    req, cid, reqId: nextReq++, method: req.method, path, action: actionOf(req.method, path),
    // Bản thân trang nhật ký hỏi liên tục — không ghi lại để khỏi tự làm đầy nhật ký
    skip: path.startsWith('/api/sql-log'),
  };
  als.run(store, next);
}

// API đọc nhật ký: ?after=<id> trả các dòng mới hơn; ?all=1 (chỉ Quản trị) xem mọi trình duyệt
function router() {
  const r = express.Router();
  r.get('/', (req, res) => {
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const all = req.query.all === '1' && req.user?.VaiTro === 'QUAN_TRI';
    const mine = (e) => all || e.cid === req.clientId;
    const strip = ({ cid, ...e }) => ({ ...e, mine: cid === req.clientId });
    let list = entries.filter((e) => e.id > after && mine(e));
    if (!after) list = list.slice(-400); // lần đầu mở trang: chỉ lấy phần gần nhất
    res.json({ entries: list.slice(0, 1000).map(strip), last: nextId - 1, canAll: req.user?.VaiTro === 'QUAN_TRI' });
  });
  return r;
}

module.exports = { instrument, quietly, contextMiddleware, router, actionOf };
