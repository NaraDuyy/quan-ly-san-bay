// Tài khoản, đăng nhập và phân quyền theo vai trò.
// Bảng TAIKHOAN phục vụ riêng cho ứng dụng web (không thuộc 15 bảng của báo cáo)
// nên được giữ lại khi nạp lại dữ liệu mẫu.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { tx } = require('./db');
const { fmtDateTime } = require('./rules');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ------------------------------------------------------------ vai trò & quyền
// tables: các bảng được thêm / sửa / xóa ('*' = tất cả); actions: các nghiệp vụ được thực hiện.
// Khách chưa đăng nhập chỉ được xem (mọi API GET) và thử vi phạm ràng buộc (luôn ROLLBACK).
const ROLES = {
  QUAN_TRI: {
    label: 'Quản trị', desc: 'Toàn quyền: mọi bảng, nạp lại dữ liệu mẫu, quản lý tài khoản',
    tables: '*', actions: ['ban-ve', 'trang-thai', 'bao-duong', 'reset', 'tai-khoan'],
  },
  BAN_VE: {
    label: 'Bán vé', desc: 'Bán vé; quản lý hành khách, vé, hành lý, lượt dùng dịch vụ',
    tables: ['HANHKHACH', 'VE', 'HANHLY', 'SUDUNGDICHVU'], actions: ['ban-ve'],
  },
  DIEU_PHOI: {
    label: 'Điều phối', desc: 'Chuyến bay, tàu bay, đường bay, cổng, phân công; đổi trạng thái chuyến; ghi nhận bảo dưỡng',
    tables: ['CHUYENBAY', 'MAYBAY', 'TUYENBAY', 'CONG', 'PHANCONG'], actions: ['trang-thai', 'bao-duong'],
  },
  KE_TOAN: {
    label: 'Kế toán', desc: 'Xem lương (Q2), doanh thu (Q4); sửa mức lương, thù lao, đơn giá dịch vụ',
    tables: ['MUCLUONG', 'THULAO', 'DICHVU'], actions: [],
  },
};

const canTable = (user, table) => !!user && (ROLES[user.VaiTro].tables === '*' || ROLES[user.VaiTro].tables.includes(table));
const canAction = (user, action) => !!user && ROLES[user.VaiTro].actions.includes(action);

// ------------------------------------------------------------ mật khẩu (scrypt)
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  const [algo, salt, hash] = String(stored).split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}
function checkPasswordPolicy(pw) {
  if (typeof pw !== 'string' || pw.length < 8) throw new HttpError(400, 'Mật khẩu phải có ít nhất 8 ký tự');
  if (pw.length > 128) throw new HttpError(400, 'Mật khẩu quá dài');
}
const randomPassword = () => crypto.randomBytes(9).toString('base64url');
function cleanEnv(name) {
  const v = String(process.env[name] || '').trim().replace(/^(["'`])(.*)\1$/, '$2').trim();
  return v || null;
}

// ------------------------------------------------------------ bảng tài khoản
function initAccounts(db, { log = true, dataDir = null } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS TAIKHOAN (
    MaTK         INTEGER PRIMARY KEY AUTOINCREMENT,
    TenDangNhap  VARCHAR(32) NOT NULL UNIQUE,
    HoTen        VARCHAR(80) NOT NULL,
    VaiTro       TEXT NOT NULL CHECK (VaiTro IN (${Object.keys(ROLES).map((r) => `'${r}'`).join(',')})),
    MatKhauHash  TEXT NOT NULL,
    KichHoat     INTEGER NOT NULL DEFAULT 1 CHECK (KichHoat IN (0, 1)),
    NgayTao      DATETIME NOT NULL
  )`);
  // Mật khẩu tài khoản mặc định lấy từ biến môi trường (bỏ dấu cách / dấu nháy / dấu ` thừa ở hai đầu
  // thường dính vào khi sao chép); không có thì sinh ngẫu nhiên lúc tạo tài khoản.
  const envPw = { QUAN_TRI: cleanEnv('ADMIN_PASSWORD') };
  envPw.BAN_VE = envPw.DIEU_PHOI = envPw.KE_TOAN = cleanEnv('DEMO_PASSWORD');
  const envName = (role) => (role === 'QUAN_TRI' ? 'ADMIN_PASSWORD' : 'DEMO_PASSWORD');
  const randomPw = { admin: randomPassword(), demo: randomPassword() };
  const DEFAULTS = [
    ['quantri', 'Quản trị hệ thống', 'QUAN_TRI'],
    ['banve', 'Nhân viên bán vé', 'BAN_VE'],
    ['dieuphoi', 'Nhân viên điều phối', 'DIEU_PHOI'],
    ['ketoan', 'Nhân viên kế toán', 'KE_TOAN'],
  ];

  // Đã có tài khoản: đồng bộ mật khẩu các tài khoản mặc định theo biến môi trường (nếu có đặt),
  // để đổi biến môi trường rồi khởi động lại là đăng nhập được ngay.
  if (db.prepare('SELECT COUNT(*) AS n FROM TAIKHOAN').get().n) {
    const synced = [];
    for (const [u, , role] of DEFAULTS) {
      const pw = envPw[role];
      const row = db.prepare('SELECT MaTK, MatKhauHash FROM TAIKHOAN WHERE TenDangNhap = ?').get(u);
      if (!pw || !row) continue;
      if (!verifyPassword(pw, row.MatKhauHash)) db.prepare('UPDATE TAIKHOAN SET MatKhauHash = ? WHERE MaTK = ?').run(hashPassword(pw), row.MaTK);
      synced.push(`  ${u.padEnd(9)} mật khẩu theo ${envName(role)} (${pw.length} ký tự)`);
    }
    if (synced.length && log) console.log(['Tài khoản mặc định:', ...synced].join('\n'));
    return null;
  }

  const accounts = DEFAULTS.map(([u, name, role]) => [u, name, role, envPw[role] || (role === 'QUAN_TRI' ? randomPw.admin : randomPw.demo)]);
  tx(db, () => {
    const st = db.prepare('INSERT INTO TAIKHOAN (TenDangNhap, HoTen, VaiTro, MatKhauHash, NgayTao) VALUES (?, ?, ?, ?, ?)');
    for (const [u, name, role, pw] of accounts) st.run(u, name, role, hashPassword(pw), fmtDateTime(new Date()));
  });
  if (log) {
    const fromEnv = accounts.filter(([, , role]) => envPw[role]);
    if (fromEnv.length) {
      console.log(['Đã tạo tài khoản mặc định:',
        ...fromEnv.map(([u, , role, pw]) => `  ${u.padEnd(9)} mật khẩu theo ${envName(role)} (${pw.length} ký tự)`)].join('\n'));
    }
  }
  const generated = accounts.filter(([, , role]) => !envPw[role]);
  if (generated.length && log) {
    const lines = generated.map(([u, , role, pw]) => `  ${u.padEnd(9)} (${ROLES[role].label}): ${pw}`);
    console.log(['Đã tạo tài khoản mặc định với mật khẩu ngẫu nhiên:', ...lines,
      'Đặt ADMIN_PASSWORD / DEMO_PASSWORD trong biến môi trường để dùng mật khẩu cố định.'].join('\n'));
    if (dataDir) {
      fs.writeFileSync(path.join(dataDir, 'tai-khoan.txt'), `Tài khoản mặc định (chỉ lưu trên máy này)\n${lines.join('\n')}\n`, 'utf8');
    }
  }
  return accounts;
}

const publicUser = (u) => u && { MaTK: u.MaTK, TenDangNhap: u.TenDangNhap, HoTen: u.HoTen, VaiTro: u.VaiTro };
function permissionsOf(user) {
  if (!user) return { tables: [], actions: [] };
  const r = ROLES[user.VaiTro];
  return { tables: r.tables, actions: r.actions };
}

// ------------------------------------------------------------ phiên đăng nhập (lưu trong bộ nhớ)
const SESSION_COOKIE = 'sb_sid';
const SESSION_TTL = 8 * 3600 * 1000;
const sessions = new Map(); // token -> { MaTK, expires }

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter((p) => p[0])
    .map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

// Giới hạn thử mật khẩu: tối đa 10 lần sai / 15 phút cho mỗi IP
const failures = new Map();
function tooManyFailures(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) { failures.delete(ip); return false; }
  return f.count >= 10;
}
function recordFailure(ip) {
  const f = failures.get(ip);
  if (!f || f.until < Date.now()) failures.set(ip, { count: 1, until: Date.now() + 15 * 60000 });
  else f.count++;
}

// Gắn req.user nếu cookie phiên hợp lệ
function sessionMiddleware(db) {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const s = token && sessions.get(token);
    if (s && s.expires > Date.now()) {
      const u = db.prepare('SELECT * FROM TAIKHOAN WHERE MaTK = ? AND KichHoat = 1').get(s.MaTK);
      if (u) { req.user = u; req.sessionToken = token; s.expires = Date.now() + SESSION_TTL; }
      else sessions.delete(token);
    } else if (s) sessions.delete(token);
    next();
  };
}

// Chặn yêu cầu ghi không phải JSON (giảm nguy cơ CSRF qua form ngoài trang)
function requireJsonForWrites(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json'))
    return next(new HttpError(415, 'Yêu cầu phải gửi dạng JSON'));
  next();
}

const needLogin = (req) => { if (!req.user) throw new HttpError(401, 'Bạn cần đăng nhập để thực hiện thao tác này'); };
function requireTable(getTable) {
  return (req, res, next) => {
    needLogin(req);
    const table = getTable(req);
    if (!canTable(req.user, table))
      throw new HttpError(403, `Vai trò ${ROLES[req.user.VaiTro].label} không có quyền thay đổi bảng ${table}`);
    next();
  };
}
function requireAction(action) {
  return (req, res, next) => {
    needLogin(req);
    if (!canAction(req.user, action)) throw new HttpError(403, `Vai trò ${ROLES[req.user.VaiTro].label} không có quyền thực hiện thao tác này`);
    next();
  };
}

function setSessionCookie(req, res, token, maxAge) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure}`);
}

// ------------------------------------------------------------ API
function authRouter(db) {
  const r = express.Router();

  r.get('/me', (req, res) => {
    res.json({ user: publicUser(req.user) || null, perms: permissionsOf(req.user), roles: ROLES });
  });

  r.post('/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooManyFailures(ip)) throw new HttpError(429, 'Bạn đã nhập sai quá nhiều lần, hãy thử lại sau 15 phút');
    const { username, password } = req.body || {};
    const u = db.prepare('SELECT * FROM TAIKHOAN WHERE TenDangNhap = ?').get(String(username || '').trim().toLowerCase());
    if (!u || !verifyPassword(String(password || ''), u.MatKhauHash)) {
      recordFailure(ip);
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    if (!u.KichHoat) throw new HttpError(403, 'Tài khoản đã bị khóa');
    failures.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    sessions.set(token, { MaTK: u.MaTK, expires: Date.now() + SESSION_TTL });
    setSessionCookie(req, res, token, SESSION_TTL);
    res.json({ user: publicUser(u), perms: permissionsOf(u) });
  });

  r.post('/logout', (req, res) => {
    if (req.sessionToken) sessions.delete(req.sessionToken);
    setSessionCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  r.post('/password', (req, res) => {
    needLogin(req);
    const { oldPassword, newPassword } = req.body || {};
    if (!verifyPassword(String(oldPassword || ''), req.user.MatKhauHash)) throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    checkPasswordPolicy(newPassword);
    db.prepare('UPDATE TAIKHOAN SET MatKhauHash = ? WHERE MaTK = ?').run(hashPassword(newPassword), req.user.MaTK);
    res.json({ ok: true });
  });

  return r;
}

// Quản lý tài khoản — chỉ vai trò Quản trị
function accountsRouter(db) {
  const r = express.Router();
  r.use(requireAction('tai-khoan'));

  const list = () => db.prepare('SELECT MaTK, TenDangNhap, HoTen, VaiTro, KichHoat, NgayTao FROM TAIKHOAN ORDER BY MaTK').all();
  const soQuanTriConLai = (truMaTK) => db.prepare(
    "SELECT COUNT(*) AS n FROM TAIKHOAN WHERE VaiTro = 'QUAN_TRI' AND KichHoat = 1 AND MaTK <> ?").get(truMaTK).n;
  const validRole = (v) => { if (!ROLES[v]) throw new HttpError(400, 'Vai trò không hợp lệ'); return v; };
  const validName = (v) => {
    const s = String(v || '').trim();
    if (!s || s.length > 80) throw new HttpError(400, 'Họ tên không hợp lệ');
    return s;
  };

  r.get('/', (req, res) => res.json(list()));

  r.post('/', (req, res) => {
    const b = req.body || {};
    const username = String(b.TenDangNhap || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new HttpError(400, 'Tên đăng nhập 3–32 ký tự: chữ thường không dấu, số, dấu chấm, gạch');
    checkPasswordPolicy(b.MatKhau);
    try {
      db.prepare('INSERT INTO TAIKHOAN (TenDangNhap, HoTen, VaiTro, MatKhauHash, NgayTao) VALUES (?, ?, ?, ?, ?)')
        .run(username, validName(b.HoTen), validRole(b.VaiTro), hashPassword(b.MatKhau), fmtDateTime(new Date()));
    } catch (e) {
      if (/UNIQUE/.test(e.message)) throw new HttpError(409, 'Tên đăng nhập đã tồn tại');
      throw e;
    }
    res.status(201).json(list());
  });

  r.put('/:id', (req, res) => {
    const id = Number(req.params.id);
    const u = db.prepare('SELECT * FROM TAIKHOAN WHERE MaTK = ?').get(id);
    if (!u) throw new HttpError(404, 'Không tìm thấy tài khoản');
    const b = req.body || {};
    const vaiTro = b.VaiTro !== undefined ? validRole(b.VaiTro) : u.VaiTro;
    const kichHoat = b.KichHoat !== undefined ? (b.KichHoat ? 1 : 0) : u.KichHoat;
    const hoTen = b.HoTen !== undefined ? validName(b.HoTen) : u.HoTen;
    // Luôn giữ ít nhất một quản trị đang hoạt động
    if (u.VaiTro === 'QUAN_TRI' && (vaiTro !== 'QUAN_TRI' || !kichHoat) && soQuanTriConLai(id) === 0)
      throw new HttpError(400, 'Phải còn ít nhất một tài khoản Quản trị đang hoạt động');
    let hash = u.MatKhauHash;
    if (b.MatKhau) { checkPasswordPolicy(b.MatKhau); hash = hashPassword(b.MatKhau); }
    db.prepare('UPDATE TAIKHOAN SET HoTen = ?, VaiTro = ?, KichHoat = ?, MatKhauHash = ? WHERE MaTK = ?').run(hoTen, vaiTro, kichHoat, hash, id);
    // Đổi mật khẩu / khóa tài khoản thì đăng xuất các phiên của tài khoản đó
    if (b.MatKhau || !kichHoat) for (const [t, s] of sessions) if (s.MaTK === id && t !== req.sessionToken) sessions.delete(t);
    res.json(list());
  });

  r.delete('/:id', (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user.MaTK) throw new HttpError(400, 'Không thể tự xóa tài khoản đang đăng nhập');
    const u = db.prepare('SELECT * FROM TAIKHOAN WHERE MaTK = ?').get(id);
    if (!u) throw new HttpError(404, 'Không tìm thấy tài khoản');
    if (u.VaiTro === 'QUAN_TRI' && soQuanTriConLai(id) === 0) throw new HttpError(400, 'Phải còn ít nhất một tài khoản Quản trị');
    db.prepare('DELETE FROM TAIKHOAN WHERE MaTK = ?').run(id);
    for (const [t, s] of sessions) if (s.MaTK === id) sessions.delete(t);
    res.json(list());
  });

  return r;
}

module.exports = {
  ROLES, HttpError, canTable, canAction, hashPassword, verifyPassword, checkPasswordPolicy,
  initAccounts, sessionMiddleware, requireJsonForWrites, requireTable, requireAction, authRouter, accountsRouter,
};
