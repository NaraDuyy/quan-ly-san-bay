// Máy chủ web: API JSON tại /api, giao diện tĩnh trong /public.
const path = require('node:path');
const express = require('express');
const { open, hasSchema, friendlyError, DB_FILE } = require('./db');
const { reseed } = require('./seed');
const { initAccounts, sessionMiddleware, requireJsonForWrites, authRouter, accountsRouter } = require('./auth');
const sqlLog = require('./sqllog');
const crudRouter = require('./routes/crud');
const opsRouter = require('./routes/ops');
const constraintsRouter = require('./routes/constraints');

function createApp(db) {
  sqlLog.instrument(db); // ghi lại mọi câu SQL cho trang Nhật ký SQL
  const app = express();
  app.set('trust proxy', 1); // chạy sau proxy HTTPS của Render: req.secure, req.ip đúng
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', sqlLog.contextMiddleware, requireJsonForWrites, sessionMiddleware(db));
  app.use('/api/sql-log', sqlLog.router());
  app.use('/api/auth', authRouter(db));
  app.use('/api/accounts', accountsRouter(db));
  app.use('/api/tables', crudRouter(db));
  app.use('/api/constraints', constraintsRouter(db));
  app.use('/api', opsRouter(db));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Không có API này' }));
  // no-cache: trình duyệt luôn hỏi lại máy chủ (dùng ETag, file không đổi thì trả 304),
  // nên sau mỗi lần triển khai người dùng thấy ngay bản mới mà không phải xóa cache
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 422);
    if (status >= 500 || (!err.status && !/constraint|^R\d+:/.test(err.message))) console.error(err);
    res.status(status).json({ error: friendlyError(err) });
  });
  return app;
}

module.exports = { createApp };

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  // Các câu SQL lúc khởi động được ghi vào Nhật ký SQL dưới tên "Khởi động máy chủ" (người dùng: hệ thống)
  const db = sqlLog.system('Khởi động máy chủ', () => {
    const db = open(DB_FILE);
    // Lần chạy đầu (hoặc CSDL rỗng): tự tạo lược đồ và nạp dữ liệu mẫu
    if (!hasSchema(db) || !db.prepare('SELECT COUNT(*) AS n FROM CHUYENBAY').get().n) {
      console.log('Chưa có dữ liệu — đang tạo CSDL và nạp dữ liệu mẫu…');
      sqlLog.note('CSDL chưa có dữ liệu — tạo 15 bảng và nạp dữ liệu mẫu');
      reseed(db);
    }
    initAccounts(db);
    return db;
  });
  createApp(db).listen(PORT, () => {
    console.log(`Quản lý sân bay đang chạy tại http://localhost:${PORT}`);
  });
}
