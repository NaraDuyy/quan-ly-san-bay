// Kiểm thử API trên một CSDL trong bộ nhớ: dữ liệu mẫu đúng kế hoạch, R1–R10 đều chặn được, Q1–Q5 chạy đúng.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { seed } = require('../server/seed');
const { createApp } = require('../server');
const { PLAN } = require('../server/meta');

let server; let base;
before(async () => {
  const db = seed({ file: ':memory:', quiet: true });
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

const get = (p) => fetch(base + p).then((r) => r.json());
const send = (method, p, body) => fetch(base + p, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
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
