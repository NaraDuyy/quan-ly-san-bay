// Kiểm thử API trên một CSDL trong bộ nhớ: dữ liệu mẫu đúng kế hoạch, R1–R10 đều chặn được, Q1–Q5 chạy đúng,
// đăng nhập và phân quyền theo vai trò.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_PASSWORD = 'admin-test-123';
process.env.DEMO_PASSWORD = 'demo-test-123';
const { seed } = require('../server/seed');
const { createApp } = require('../server');
const { initAccounts } = require('../server/auth');
const { PLAN } = require('../server/meta');

let server; let base; let admin;
before(async () => {
  const db = seed({ file: ':memory:', quiet: true });
  initAccounts(db, { log: false });
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
  admin = await login('quantri', process.env.ADMIN_PASSWORD);
});
after(() => server.close());

async function login(username, password) {
  const r = await fetch(base + '/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
  });
  assert.equal(r.status, 200, `đăng nhập ${username} thất bại`);
  return r.headers.get('set-cookie').split(';')[0];
}

const get = (p, cookie) => fetch(base + p, { headers: cookie ? { cookie } : {} }).then((r) => r.json());
// Mặc định gửi với phiên Quản trị; truyền cookie = null để gửi như khách
const send = (method, p, body = {}, cookie = admin) => fetch(base + p, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
}).then(async (r) => ({ status: r.status, body: await r.json() }));

test('số bản ghi mẫu khớp kế hoạch mục 9', async () => {
  const { counts } = await get('/tables');
  assert.deepEqual(counts, PLAN);
});

test('dữ liệu mẫu không vi phạm ràng buộc nào', async () => {
  const audit = await get('/constraints/audit');
  for (const [k, n] of Object.entries(audit)) assert.equal(n, 0, `${k} có ${n} vi phạm`);
});

for (const code of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10']) {
  test(`${code} chặn thao tác vi phạm`, async () => {
    const { status, body } = await send('POST', `/constraints/${code}/test`, {});
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.blocked, true, body.message);
    assert.match(body.message, new RegExp(`^${code}:`));
    assert.ok(body.thuTuc, 'thiếu mô tả thao tác thử');
  });
}

test('thử vi phạm không làm thay đổi dữ liệu', async () => {
  const { counts } = await get('/tables');
  assert.deepEqual(counts, PLAN);
});

test('trang tổng quan và chi tiết chuyến', async () => {
  const o = await get('/overview');
  assert.equal(o.kpi.mbQuaHan, 2);
  assert.equal(o.doanhThu.length, 3);
  const ct = await get('/chuyen/1');
  assert.equal(ct.chuyen.MaChuyen, 1);
  assert.equal(ct.ghe.thuongGia.length + ct.ghe.phoThong.length, ct.chuyen.SoGhe);
});

test('Q1–Q5 trả kết quả', async () => {
  const q1 = await get('/queries/q1');
  assert.equal(q1.rows.length, PLAN.CHUYENBAY);
  assert.ok(q1.rows[0].TiLeLapDay >= q1.rows.at(-1).TiLeLapDay);
  const q2 = await get('/queries/q2');
  assert.equal(q2.rows.length, PLAN.NHANVIEN);
  const q3 = await get('/queries/q3?maHK=1');
  assert.equal(q3.tong.TongChiTieu, q3.tong.TienVe + q3.tong.PhiHanhLy + q3.tong.TienDichVu);
  const q4 = await get('/queries/q4');
  assert.equal(q4.rows.length, 3);
  const q5 = await get('/queries/q5');
  assert.equal(q5.quaHan.length, 2);
});

test('bán vé kèm hành lý tính phí quá cước theo G4', async () => {
  const chuyen = (await get('/chuyen-mo-ban'))[0];
  const ct = await get(`/chuyen/${chuyen.MaChuyen}`);
  const ghe = ct.ghe.phoThong.find((g) => !ct.ghe.daBan.includes(g));
  const { status, body } = await send('POST', '/ban-ve', {
    MaChuyen: chuyen.MaChuyen, HangGhe: 'PHO_THONG', SoGhe: ghe,
    KhachMoi: { SoGiayTo: '099999999999', HoTen: 'Khách Kiểm Thử', NgaySinh: '1999-01-01' },
    HanhLy: [{ LoaiHL: 'XACH_TAY', CanNangKg: 7 }, { LoaiHL: 'KY_GUI', CanNangKg: 25.4 }],
  });
  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.tongPhi, 300000); // vượt 2,4 kg -> làm tròn 3 kg × 100.000 đ
});

test('bán vé lỗi giữa chừng thì rollback toàn bộ', async () => {
  const before = (await get('/tables')).counts;
  const chuyen = (await get('/chuyen-mo-ban'))[0];
  const ct = await get(`/chuyen/${chuyen.MaChuyen}`);
  const ghe = ct.ghe.phoThong.find((g) => !ct.ghe.daBan.includes(g));
  const { status, body } = await send('POST', '/ban-ve', {
    MaChuyen: chuyen.MaChuyen, HangGhe: 'PHO_THONG', SoGhe: ghe,
    KhachMoi: { SoGiayTo: '088888888888', HoTen: 'Khách Rollback', NgaySinh: '1990-01-01' },
    HanhLy: [{ LoaiHL: 'KY_GUI', CanNangKg: 40 }],
  });
  assert.equal(status, 422);
  assert.match(body.error, /^R7:/);
  assert.deepEqual((await get('/tables')).counts, before);
});

test('CRUD: thêm, sửa, xóa hành lý', async () => {
  const ve = (await get('/tables/VE?f_TrangThai=DA_DAT&size=1')).rows[0];
  const hl = await get(`/tables/HANHLY?f_MaVe=${ve.MaVe}&f_LoaiHL=KY_GUI`);
  if (hl.total >= 3) return;
  const add = await send('POST', '/tables/HANHLY', { MaVe: ve.MaVe, LoaiHL: 'KY_GUI', CanNangKg: 24 });
  assert.equal(add.status, 201, JSON.stringify(add.body));
  const pk = add.body.pk;
  const upd = await send('PUT', '/tables/HANHLY', { pk, data: { CanNangKg: 30 } });
  assert.equal(upd.status, 200);
  const row = (await get(`/tables/HANHLY?f_MaHL=${pk.MaHL}`)).rows[0];
  assert.equal(row.PhiQuaCan, 700000);
  const del = await send('DELETE', '/tables/HANHLY', { pk });
  assert.equal(del.status, 200);
});

// ------------------------------------------------------------------ đăng nhập & phân quyền
test('khách chưa đăng nhập chỉ được xem', async () => {
  const me = await get('/auth/me');
  assert.equal(me.user, null);
  assert.ok((await get('/queries/q1')).rows.length > 0);
  const add = await send('POST', '/tables/SANBAY', { MaSanBay: 'VII', TenSanBay: 'Vinh', ThanhPho: 'Vinh', QuocGia: 'Việt Nam' }, null);
  assert.equal(add.status, 401);
  assert.equal((await send('POST', '/reset', {}, null)).status, 401);
  assert.equal((await send('POST', '/ban-ve', {}, null)).status, 401);
  // thử vi phạm ràng buộc luôn rollback nên khách vẫn dùng được
  assert.equal((await send('POST', '/constraints/R7/test', {}, null)).body.blocked, true);
  assert.equal((await get('/accounts')).error !== undefined, true);
});

test('sai mật khẩu bị từ chối', async () => {
  const r = await send('POST', '/auth/login', { username: 'quantri', password: 'sai-mat-khau' }, null);
  assert.equal(r.status, 401);
});

test('vai trò Bán vé: được bán vé, không được sửa chuyến bay', async () => {
  const c = await login('banve', process.env.DEMO_PASSWORD);
  const me = await get('/auth/me', c);
  assert.equal(me.user.VaiTro, 'BAN_VE');
  const chuyen = (await get('/chuyen-mo-ban'))[0];
  const ct = await get(`/chuyen/${chuyen.MaChuyen}`);
  const ghe = ct.ghe.phoThong.find((g) => !ct.ghe.daBan.includes(g));
  const ban = await send('POST', '/ban-ve', { MaChuyen: chuyen.MaChuyen, HangGhe: 'PHO_THONG', SoGhe: ghe, MaHK: 40 }, c);
  assert.equal(ban.status, 201, JSON.stringify(ban.body));
  const sua = await send('PUT', '/tables/CHUYENBAY', { pk: { MaChuyen: chuyen.MaChuyen }, data: { GiaVeCoBan: 1 } }, c);
  assert.equal(sua.status, 403);
  assert.equal((await send('POST', `/chuyen/${chuyen.MaChuyen}/trang-thai`, { TrangThai: 'HUY' }, c)).status, 403);
});

test('vai trò Điều phối: đổi trạng thái được, không bán vé được', async () => {
  const c = await login('dieuphoi', process.env.DEMO_PASSWORD);
  const chuyen = (await get('/chuyen-mo-ban')).find((x) => x.TrangThai === 'LEN_LICH');
  const r = await send('POST', `/chuyen/${chuyen.MaChuyen}/trang-thai`, { TrangThai: 'TRE' }, c);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await send('POST', '/ban-ve', { MaChuyen: chuyen.MaChuyen }, c)).status, 403);
});

test('vai trò Kế toán: sửa thù lao được, không nạp lại dữ liệu được', async () => {
  const c = await login('ketoan', process.env.DEMO_PASSWORD);
  const r = await send('PUT', '/tables/THULAO', { pk: { VaiTro: 'AN_NINH_CONG' }, data: { MucThuongChuyen: 110000 } }, c);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await send('POST', '/reset', {}, c)).status, 403);
  assert.equal((await send('POST', '/tables/VE', {}, c)).status, 403);
});

test('yêu cầu ghi không phải JSON bị chặn', async () => {
  const r = await fetch(base + '/reset', { method: 'POST', headers: { cookie: admin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'scale=lon' });
  assert.equal(r.status, 415);
});

test('Quản trị: tạo, khóa, đổi vai trò, xóa tài khoản', async () => {
  const tao = await send('POST', '/accounts', { TenDangNhap: 'nv.moi', HoTen: 'Nhân viên mới', VaiTro: 'BAN_VE', MatKhau: 'matkhau-moi-1' });
  assert.equal(tao.status, 201, JSON.stringify(tao.body));
  const tk = tao.body.find((x) => x.TenDangNhap === 'nv.moi');
  const c = await login('nv.moi', 'matkhau-moi-1');
  assert.equal((await get('/auth/me', c)).user.VaiTro, 'BAN_VE');
  // đổi sang Kế toán
  await send('PUT', `/accounts/${tk.MaTK}`, { VaiTro: 'KE_TOAN' });
  assert.equal((await get('/auth/me', c)).user.VaiTro, 'KE_TOAN');
  // khóa -> phiên bị hủy, không đăng nhập lại được
  await send('PUT', `/accounts/${tk.MaTK}`, { KichHoat: false });
  assert.equal((await get('/auth/me', c)).user, null);
  assert.equal((await send('POST', '/auth/login', { username: 'nv.moi', password: 'matkhau-moi-1' }, null)).status, 403);
  // trùng tên, mật khẩu ngắn
  assert.equal((await send('POST', '/accounts', { TenDangNhap: 'nv.moi', HoTen: 'X', VaiTro: 'BAN_VE', MatKhau: 'matkhau-moi-1' })).status, 409);
  assert.equal((await send('POST', '/accounts', { TenDangNhap: 'nv.khac', HoTen: 'X', VaiTro: 'BAN_VE', MatKhau: 'ngan' })).status, 400);
  assert.equal((await send('DELETE', `/accounts/${tk.MaTK}`)).status, 200);
  // không được bỏ quản trị cuối cùng
  const me = (await get('/auth/me', admin)).user;
  assert.equal((await send('PUT', `/accounts/${me.MaTK}`, { VaiTro: 'BAN_VE' })).status, 400);
  // tài khoản khác không vào được trang quản lý tài khoản
  const kt = await login('ketoan', process.env.DEMO_PASSWORD);
  assert.equal((await send('POST', '/accounts', {}, kt)).status, 403);
});

test('đổi mật khẩu của chính mình', async () => {
  const c = await login('dieuphoi', process.env.DEMO_PASSWORD);
  assert.equal((await send('POST', '/auth/password', { oldPassword: 'sai', newPassword: 'mat-khau-moi-99' }, c)).status, 400);
  assert.equal((await send('POST', '/auth/password', { oldPassword: process.env.DEMO_PASSWORD, newPassword: 'mat-khau-moi-99' }, c)).status, 200);
  await login('dieuphoi', 'mat-khau-moi-99');
});

test('nạp lại dữ liệu mẫu giữ nguyên tài khoản', async () => {
  const truoc = (await get('/accounts', admin)).length;
  assert.equal((await send('POST', '/reset', { scale: 'kehoach' })).status, 200);
  assert.equal((await get('/accounts', admin)).length, truoc);
  assert.deepEqual((await get('/tables')).counts, PLAN);
});
