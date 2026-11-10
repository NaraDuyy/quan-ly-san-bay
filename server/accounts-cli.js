// Đặt lại mật khẩu một tài khoản từ dòng lệnh (khi quên mật khẩu quản trị):
//   npm run dat-mat-khau -- quantri MatKhauMoi123
const { open, DB_FILE } = require('./db');
const { initAccounts, hashPassword, checkPasswordPolicy } = require('./auth');

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error('Cách dùng: npm run dat-mat-khau -- <tên đăng nhập> <mật khẩu mới>');
  process.exit(1);
}
try {
  checkPasswordPolicy(password);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
const db = open(DB_FILE);
initAccounts(db);
const info = db.prepare('UPDATE TAIKHOAN SET MatKhauHash = ?, KichHoat = 1 WHERE TenDangNhap = ?').run(hashPassword(password), username.toLowerCase());
if (!info.changes) {
  console.error(`Không có tài khoản "${username}"`);
  process.exit(1);
}
console.log(`Đã đặt mật khẩu mới cho "${username}". Khởi động lại máy chủ nếu đang chạy để đăng xuất các phiên cũ.`);
db.close();
