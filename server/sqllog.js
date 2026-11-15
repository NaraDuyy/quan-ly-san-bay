// Nhật ký SQL: ghi lại lần lượt MỌI câu lệnh chạy trên CSDL để xem trực tiếp ở trang "Nhật ký SQL".
// - Mỗi trình duyệt có một mã (cookie sb_cid) nên hai tab của cùng trình duyệt thấy chung một nhật ký,
//   còn người dùng khác không thấy thao tác của nhau (trừ Quản trị chọn xem tất cả).
// - Câu lệnh do máy chủ tự chạy (khởi động, tạo CSDL, nạp dữ liệu mẫu) thuộc "hệ thống", ai cũng thấy.
// - Trong chế độ gộp (nạp dữ liệu mẫu), các lần chạy liên tiếp của cùng một câu được gộp thành "× N lần".
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const express = require('express');

const MAX_ENTRIES = 20000;
const CID_COOKIE = 'sb_cid';
const SYSTEM = 'system';
const als = new AsyncLocalStorage();
const entries = [];
let nextId = 1;
let nextReq = 1;

// db.js nạp module này nên lấy friendlyError khi cần, tránh vòng phụ thuộc lúc khởi tạo
const friendlyError = (e) => require('./db').friendlyError(e);

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
  const id = nextId++;
  entries.push({ id, key: id, ...entry }); // key cố định; id tăng lại khi dòng được gộp thêm
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

const userOf = (store) => store.user || store.req?.user?.TenDangNhap || null;
const baseOf = (store) => ({
  time: Date.now(), cid: store.cid, req: store.reqId, method: store.method, path: store.path,
  action: store.action, user: userOf(store),
});

function record(sql, args, fn) {
  const store = als.getStore();
  if (!store || store.skip) return fn();
  const t0 = process.hrtime.bigint();
  const base = { ...baseOf(store), sql: sql.trim(), params: cleanParams(args), kind: kindOf(sql) };
  try {
    const r = fn();
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    let result = null;
    if (Array.isArray(r)) result = { rows: r.length };
    else if (r && typeof r === 'object' && 'changes' in r) result = { changes: Number(r.changes), lastId: Number(r.lastInsertRowid) };
    else if (base.kind === 'read') result = { rows: r === undefined ? 0 : 1 };
    // Chế độ gộp: lần chạy lặp lại của đúng câu ngay trước đó được cộng dồn vào dòng cũ
    const last = entries.at(-1);
    if (store.batch && last && last.req === base.req && last.sql === base.sql && !last.error && last.result && result) {
      last.count = (last.count || 1) + 1;
      last.ms += ms;
      last.lastParams = base.params;
      if ('rows' in result) last.result.rows += result.rows;
      if ('changes' in result) { last.result.changes += result.changes; last.result.lastId = result.lastId; }
      last.id = nextId++; // đánh số lại để trang nhật ký nhận ra dòng vừa thay đổi
      return r;
    }
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

// Ghi một dòng chú thích vào nhật ký (bước xử lý ở máy chủ không chạy SQL)
function note(text) {
  const store = als.getStore();
  if (!store || store.skip) return;
  push({ ...baseOf(store), kind: 'note', sql: `-- ${text}`, params: [] });
}

// Chạy fn ở chế độ gộp: vẫn ghi MỌI câu lệnh, câu lặp lại liên tiếp gộp thành "× N lần"
function batched(text, fn) {
  const store = als.getStore();
  if (!store || store.skip) return fn();
  if (text) note(text);
  const prev = store.batch;
  store.batch = true;
  try { return fn(); } finally { store.batch = prev; }
}

// Chạy fn như một thao tác của "hệ thống" (không thuộc yêu cầu nào), ví dụ lúc khởi động máy chủ
function system(action, fn) {
  const store = { cid: SYSTEM, reqId: nextReq++, method: 'SYSTEM', path: '(máy chủ)', action, user: 'hệ thống', batch: true };
  return als.run(store, fn);
}

function cookieValue(header = '', name) {
  const m = header.split(';').map((p) => p.trim()).find((p) => p.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

const isLogPath = (path) => path.startsWith('/api/sql-log');

// Middleware: gắn mã trình duyệt và ngữ cảnh yêu cầu cho mọi câu SQL chạy trong yêu cầu này
function contextMiddleware(req, res, next) {
  let cid = cookieValue(req.headers.cookie, CID_COOKIE);
  if (!cid || !/^[A-Za-z0-9_-]{16,64}$/.test(cid)) {
    cid = crypto.randomBytes(16).toString('base64url');
    res.append('Set-Cookie', `${CID_COOKIE}=${cid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.secure ? '; Secure' : ''}`);
  }
  req.clientId = cid;
  const path = req.originalUrl.split('?')[0];
  // Trang nhật ký hỏi máy chủ mỗi giây nhưng không chạy câu SQL nào (xem sessionMiddleware), nên không có gì để ghi
  const store = { req, cid, reqId: nextReq++, method: req.method, path, action: actionOf(req.method, path), skip: isLogPath(path) };
  als.run(store, next);
}

// API đọc nhật ký: ?after=<id> trả các dòng mới hơn; ?all=1 (chỉ Quản trị) xem mọi trình duyệt
function router() {
  const r = express.Router();
  r.get('/', (req, res) => {
    const isAdmin = req.sessionRole === 'QUAN_TRI';
    const after = Math.max(0, parseInt(req.query.after, 10) || 0);
    const all = req.query.all === '1' && isAdmin;
    const visible = (e) => all || e.cid === req.clientId || e.cid === SYSTEM;
    const strip = ({ cid, raw, ...e }) => ({ ...e, mine: cid === req.clientId, system: cid === SYSTEM });
    let list = entries.filter((e) => e.id > after && visible(e));
    if (!after) list = list.slice(-1500); // lần đầu mở trang: phần gần nhất
    // id của dòng gộp có thể tăng — sắp lại theo id để trang nhận đúng thứ tự
    list.sort((a, b) => a.id - b.id);
    res.json({ entries: list.slice(0, 2000).map(strip), last: nextId - 1, canAll: isAdmin });
  });
  return r;
}

module.exports = { instrument, note, batched, system, contextMiddleware, router, actionOf, isLogPath };
