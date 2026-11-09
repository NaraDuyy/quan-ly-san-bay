// Kết nối SQLite (module node:sqlite có sẵn trong Node >= 22.13, không cần cài thêm).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'sanbay.db');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');

function open(file = DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  return db;
}

function createSchema(db) {
  db.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
}

function hasSchema(db) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='CHUYENBAY'").get();
}

// Chạy fn trong một transaction; lỗi thì ROLLBACK và ném lại.
function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Chạy fn rồi luôn ROLLBACK — dùng cho trang "thử vi phạm ràng buộc".
function dryRun(db, fn) {
  db.exec('BEGIN');
  try {
    return fn();
  } finally {
    db.exec('ROLLBACK');
  }
}

// Đổi thông báo lỗi kỹ thuật của SQLite thành thông báo nghiệp vụ.
const CONSTRAINT_MESSAGES = {
  'VE.MaChuyen, VE.MaHK': 'R2: Hành khách đã có vé trên chuyến bay này',
  'VE.MaChuyen, VE.SoGhe': 'R3: Số ghế này đã được bán trên chuyến bay',
  ck_hl_r7: 'R7: Mỗi kiện hành lý phải nặng hơn 0 và không quá 32 kg',
  ck_tuyen_khac: 'Sân bay đi và sân bay đến phải khác nhau',
  'TUYENBAY.SanBayDi, TUYENBAY.SanBayDen': 'Cặp sân bay đi – đến này đã được khai báo',
  ck_cb_gio: 'Giờ đến kế hoạch phải sau giờ khởi hành kế hoạch',
  ck_mb_soghe: 'Số ghế phải lớn hơn 0',
  ck_ve_gia: 'Giá vé phải lớn hơn 0',
  ck_cb_gia: 'Giá vé cơ bản phải lớn hơn 0',
  'PHANCONG.MaChuyen, PHANCONG.MaNV': 'Nhân viên đã được phân công cho chuyến này',
  'HANHKHACH.SoGiayTo': 'Số giấy tờ đã tồn tại',
  'NHANVIEN.CCCD': 'Số CCCD đã tồn tại',
  'CONG.TenCong': 'Tên cổng đã tồn tại',
};

function friendlyError(e) {
  const msg = String(e && e.message ? e.message : e);
  if (/^R\d+:/.test(msg)) return msg;
  const m = msg.match(/(?:UNIQUE|CHECK) constraint failed: (.+)$/);
  if (m) {
    const key = m[1].trim();
    if (CONSTRAINT_MESSAGES[key]) return CONSTRAINT_MESSAGES[key];
    if (/UNIQUE/.test(msg)) return `Giá trị bị trùng (${key})`;
    return `Vi phạm ràng buộc CHECK (${key})`;
  }
  if (/FOREIGN KEY constraint failed/.test(msg))
    return 'Vi phạm toàn vẹn tham chiếu: bản ghi đang được tham chiếu hoặc khóa ngoại không tồn tại';
  if (/NOT NULL constraint failed: (.+)/.test(msg))
    return `Thiếu giá trị bắt buộc: ${msg.split(': ').pop()}`;
  return msg;
}

module.exports = { open, createSchema, hasSchema, tx, dryRun, friendlyError, DB_FILE };
