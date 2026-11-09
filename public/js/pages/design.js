// Tóm tắt báo cáo thiết kế CSDL (giả định, thực thể, ERD, lược đồ, chuẩn hóa, từ điển dữ liệu).
import { esc, table, label } from '../lib.js';
import { state } from '../app.js';

const GIA_DINH = [
  ['G1', 'Thời gian quay đầu tối thiểu của một tàu bay giữa hai chuyến liên tiếp là 120 phút.'],
  ['G2', 'Chu kỳ bảo dưỡng định kỳ của tàu bay là 180 ngày; tàu bay quá hạn không được gán chuyến mới.'],
  ['G3', 'Định mức hành lý miễn cước: 7 kg xách tay, 23 kg cho mỗi kiện ký gửi; trần tuyệt đối 32 kg/kiện.'],
  ['G4', 'Phí hành lý quá cước: 100.000 đ cho mỗi kg vượt định mức của kiện ký gửi (phần lẻ làm tròn lên 1 kg).'],
  ['G5', 'Mỗi vé có tối đa 1 kiện xách tay và 3 kiện ký gửi.'],
  ['G6', 'Thưởng phục vụ chuyến: điều phối mặt đất 150.000 đ, kỹ thuật sân đỗ 120.000 đ, làm thủ tục 100.000 đ, an ninh cổng 100.000 đ. Lương tháng = lương cơ bản (vị trí, bậc) + tổng thưởng các chuyến trong tháng.'],
  ['G7', 'Hai chuyến bay dùng chung một cổng phải có giờ khởi hành kế hoạch cách nhau tối thiểu 60 phút.'],
  ['G8', 'Doanh thu sân bay = tiền vé các chuyến không bị hủy + phí hành lý quá cước + tiền dịch vụ nhà ga.'],
];

const LIEN_KET = [
  ['HANGHANGKHONG – MAYBAY', '1 – n', 'Một hãng có nhiều tàu bay; mỗi tàu bay thuộc đúng một hãng'],
  ['SANBAY – TUYENBAY', '1 – n (×2)', 'Một sân bay là điểm đi của nhiều tuyến và là điểm đến của nhiều tuyến khác'],
  ['TUYENBAY – CHUYENBAY', '1 – n', 'Một đường bay có nhiều chuyến khai thác'],
  ['MAYBAY – CHUYENBAY', '1 – n', 'Một tàu bay thực hiện nhiều chuyến; mỗi chuyến do một tàu bay thực hiện'],
  ['CONG – CHUYENBAY', '1 – n', 'Một cổng phục vụ nhiều chuyến ở các khung giờ khác nhau'],
  ['CHUYENBAY – VE', '1 – n', 'Một chuyến bán nhiều vé'],
  ['HANHKHACH – VE', '1 – n', 'Một hành khách mua nhiều vé (nhiều chuyến)'],
  ['VE – HANHLY', '1 – n', 'Một vé kèm nhiều kiện hành lý'],
  ['CHUYENBAY – NHANVIEN', 'n – n', 'Phân rã qua thực thể kết hợp PHANCONG, kèm thuộc tính VaiTro'],
  ['MUCLUONG – NHANVIEN', '1 – n', 'Một khung (vị trí, bậc) áp cho nhiều nhân viên'],
  ['THULAO – PHANCONG', '1 – n', 'Một vai trò có một mức thưởng chuyến, áp cho nhiều lượt phân công'],
  ['HANHKHACH – DICHVU', 'n – n', 'Phân rã qua SUDUNGDICHVU, kèm thời gian, số lượng, thành tiền'],
];

// Lược đồ quan hệ (mục 4): khóa chính gạch chân, khóa ngoại in nghiêng
const LUOC_DO = {
  SANBAY: { pk: ['MaSanBay'], fk: [] },
  HANGHANGKHONG: { pk: ['MaHang'], fk: [] },
  MAYBAY: { pk: ['SoHieuMB'], fk: ['MaHang'] },
  TUYENBAY: { pk: ['MaTuyen'], fk: ['SanBayDi', 'SanBayDen'] },
  CONG: { pk: ['MaCong'], fk: [] },
  CHUYENBAY: { pk: ['MaChuyen'], fk: ['MaTuyen', 'SoHieuMB', 'MaCong'] },
  HANHKHACH: { pk: ['MaHK'], fk: [] },
  VE: { pk: ['MaVe'], fk: ['MaChuyen', 'MaHK'] },
  HANHLY: { pk: ['MaHL'], fk: ['MaVe'] },
  MUCLUONG: { pk: ['ViTri', 'Bac'], fk: [] },
  NHANVIEN: { pk: ['MaNV'], fk: ['ViTri', 'Bac'] },
  THULAO: { pk: ['VaiTro'], fk: [] },
  PHANCONG: { pk: ['MaChuyen', 'MaNV'], fk: ['MaChuyen', 'MaNV', 'VaiTro'] },
  DICHVU: { pk: ['MaDV'], fk: [] },
  SUDUNGDICHVU: { pk: ['MaSD'], fk: ['MaHK', 'MaDV'] },
};

const KIEU = { text: 'VARCHAR', int: 'INT', money: 'DECIMAL(12,0)', decimal: 'DECIMAL(5,2)', date: 'DATE', datetime: 'DATETIME', enum: 'ENUM' };

export default async function design(view) {
  const T = state.meta.tables;
  const attr = (t, c) => {
    const l = LUOC_DO[t];
    let s = esc(c);
    if (l.fk.includes(c)) s = `<i>${s}</i>`;
    if (l.pk.includes(c)) s = `<u>${s}</u>`;
    return s;
  };

  view.innerHTML = `<div class="doc">
    <div class="page-head"><div><h1>Thiết kế cơ sở dữ liệu hệ thống quản lý sân bay</h1>
      <p>Bài tập lớn môn Cơ sở dữ liệu — Học viện Công nghệ Bưu chính Viễn thông, Khoa An toàn thông tin.
      Sinh viên thực hiện: Hoàng Duy Anh (B24DCAT010).</p></div></div>

    <section class="card"><div class="card-head"><h2>1. Giới thiệu bài toán</h2></div><div class="card-body">
      <p>Hệ thống quản lý hoạt động khai thác của một sân bay dân dụng. Các hãng hàng không đưa tàu bay đến khai thác chuyến bay trên nhiều đường bay.
      Mỗi chuyến được xếp một tàu bay, một cổng khởi hành và một tổ nhân viên mặt đất (làm thủ tục, an ninh cổng, điều phối mặt đất, kỹ thuật sân đỗ).
      Hành khách mua vé cho từng chuyến, mang hành lý xách tay và ký gửi, và có thể dùng dịch vụ nhà ga. Hệ thống lưu vết để tính lương nhân viên,
      doanh thu sân bay, theo dõi bảo dưỡng tàu bay và kiểm soát các ràng buộc khai thác.</p>
      <p><b>Ngoài phạm vi:</b> phi hành đoàn của hãng, kiểm soát không lưu, bán lẻ của cửa hàng thuê mặt bằng.</p>
      <h3 style="margin-top:12px">Các giả định</h3>
      ${table([{ label: 'Mã', render: (r) => `<span class="tag">${r[0]}</span>` }, { label: 'Nội dung', render: (r) => esc(r[1]) }], GIA_DINH)}
    </div></section>

    <section class="card"><div class="card-head"><h2>2. Phân tích yêu cầu</h2></div><div class="card-body">
      <h3>2.1. Thực thể (15)</h3>
      ${table([
        { label: 'Thực thể', render: (r) => `<a href="#/du-lieu/${r[0]}"><code>${r[0]}</code></a>` },
        { label: 'Vai trò', render: (r) => esc(r[1].desc) },
        { label: 'Nhóm', render: (r) => esc(r[1].group) },
      ], Object.entries(T))}
      <h3 style="margin-top:14px">2.2. Quy tắc nghiệp vụ</h3>
      <p>Mười quy tắc R1–R10 và cách cài đặt từng quy tắc có ở trang <a href="#/rang-buoc">Ràng buộc toàn vẹn</a>, kèm nút thử vi phạm.</p>
      <h3 style="margin-top:14px">2.3. Yêu cầu truy vấn</h3>
      <ol>
        <li><a href="#/q/1">Q1</a> — Chuyến bay trong khoảng ngày, số vé đã bán và tỉ lệ lấp đầy, giảm dần theo tỉ lệ.</li>
        <li><a href="#/q/2">Q2</a> — Lương tháng từng nhân viên: lương cơ bản (vị trí, bậc) + thưởng chuyến theo vai trò.</li>
        <li><a href="#/q/3">Q3</a> — Hồ sơ hành khách: chuyến đã bay, hành lý, dịch vụ, tổng chi tiêu.</li>
        <li><a href="#/q/4">Q4</a> — Doanh thu mỗi tháng theo ba nguồn và tiền vé theo hãng.</li>
        <li><a href="#/q/5">Q5</a> — Ngày bảo dưỡng tiếp theo của tàu bay; tách riêng tàu bay quá hạn.</li>
      </ol>
    </div></section>

    <section class="card"><div class="card-head"><div><h2>3. Mô hình thực thể – liên kết (ERD)</h2><p>Khóa chính ký hiệu +, khóa ngoại ký hiệu #</p></div></div>
      <div class="card-body"><img class="erd" src="img/erd.png" alt="Sơ đồ thực thể liên kết của hệ thống quản lý sân bay">
      <h3 style="margin-top:14px">Diễn giải các mối liên kết</h3>
      ${table([{ label: 'Mối liên kết', render: (r) => `<code>${r[0]}</code>` }, { label: 'Bản số', render: (r) => esc(r[1]) }, { label: 'Diễn giải', render: (r) => esc(r[2]) }], LIEN_KET)}
    </div></section>

    <section class="card"><div class="card-head"><div><h2>4. Lược đồ quan hệ</h2><p>Gạch chân: khóa chính · in nghiêng: khóa ngoại</p></div></div><div class="card-body">
      ${Object.entries(T).map(([t, def]) => `<div class="schema-line"><b>${t}</b> (${def.columns.map((c) => attr(t, c.name)).join(', ')})</div>`).join('')}
    </div></section>

    <section class="card"><div class="card-head"><h2>5. Chuẩn hóa</h2></div><div class="card-body">
      <p><b>1NF.</b> Mọi thuộc tính nguyên tố. Hành lý tách thành HANHLY (không dùng HanhLy1, HanhLy2…), phân công tách thành PHANCONG, lượt dùng dịch vụ tách thành SUDUNGDICHVU.</p>
      <p><b>2NF.</b> Quan hệ khóa đơn thỏa hiển nhiên. PHANCONG (MaChuyen, MaNV) → VaiTro phụ thuộc cả cặp khóa; MUCLUONG (ViTri, Bac) → LuongCoBan phụ thuộc cả cặp.</p>
      <p><b>3NF.</b> Loại phụ thuộc bắc cầu MaNV → (ViTri, Bac) → LuongCoBan bằng cách tách MUCLUONG; tách THULAO để tránh VaiTro → MucThuongChuyen trong PHANCONG;
      CHUYENBAY không lặp thuộc tính của đường bay hay tàu bay mà tham chiếu qua khóa ngoại.</p>
      <p><b>Thuộc tính dẫn xuất lưu có chủ đích.</b> GiaVe (VE), PhiQuaCan (HANHLY), ThanhTien (SUDUNGDICHVU) là giá trị tại thời điểm giao dịch, không phụ thuộc bảng giá hiện hành.
      Ví dụ trong dữ liệu mẫu: suất ăn nhà ga tăng giá từ 120.000 đ lên 150.000 đ đầu tháng này, các lượt dùng cũ vẫn giữ thành tiền theo giá cũ.</p>
    </div></section>

    <section class="card"><div class="card-head"><div><h2>6. Từ điển dữ liệu</h2><p>Kiểu dữ liệu theo MySQL 8 (xem <code>database/mysql/01_schema.sql</code>); tiền tệ dùng DECIMAL(12,0) đơn vị VND</p></div></div>
      <div class="card-body">${Object.entries(T).map(([t, def]) => `
        <details style="margin-bottom:6px"><summary><b>${t}</b> — ${esc(def.desc)}</summary>${table([
          { label: 'Cột', render: (c) => `<code>${c.name}</code>` },
          { label: 'Kiểu', render: (c) => `<code>${c.type === 'enum' ? `ENUM(${c.options.map((o) => `'${o}'`).join(',')})` : c.type === 'text' ? `VARCHAR(${c.maxLength || ''})` : KIEU[c.type]}</code>` },
          { label: 'Ràng buộc', render: (c) => [LUOC_DO[t].pk.includes(c.name) ? 'PK' : '', c.fk ? `FK → ${c.fk}` : '', c.auto ? 'AUTO_INCREMENT' : '', c.required && !LUOC_DO[t].pk.includes(c.name) ? 'NOT NULL' : ''].filter(Boolean).join(', ') },
          { label: 'Mô tả', render: (c) => esc(c.label + (c.hint ? ` — ${c.hint}` : '')) },
        ], def.columns)}</details>`).join('')}</div></section>

    <section class="card"><div class="card-head"><h2>Phụ lục — Cài đặt trong repo</h2></div><div class="card-body">
      <ul>
        <li><code>database/mysql/</code> — script MySQL 8: tạo bảng, trigger R1–R10 (SIGNAL SQLSTATE '45000'), chỉ mục, thủ tục R9, truy vấn Q1–Q5 và dữ liệu mẫu.</li>
        <li><code>server/schema.sql</code> — cùng lược đồ cài trên SQLite để web chạy ngay không cần máy chủ CSDL (ENUM → CHECK, SIGNAL → RAISE).</li>
        <li><code>server/seed.js</code> — sinh dữ liệu mẫu đúng kế hoạch mục 9 và đúng mọi ràng buộc.</li>
        <li>Vị trí công việc: ${['THU_TUC', 'AN_NINH', 'DIEU_PHOI', 'KY_THUAT', 'VE_SINH'].map((v) => esc(label(v))).join(', ')}.</li>
      </ul>
    </div></section>
  </div>`;
}
