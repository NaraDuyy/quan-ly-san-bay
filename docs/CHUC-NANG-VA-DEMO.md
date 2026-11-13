# Chức năng của web và kịch bản demo khi báo cáo

Web: https://quan-ly-san-bay.onrender.com/ · Mã nguồn: https://github.com/NaraDuyy/quan-ly-san-bay

Web cài đặt đúng thiết kế trong báo cáo *Thiết kế CSDL hệ thống quản lý sân bay*: 15 bảng, ràng buộc R1–R10,
truy vấn Q1–Q5 và dữ liệu mẫu theo kế hoạch mục 9. Phần 1 liệt kê toàn bộ chức năng; phần 2 là gợi ý những gì nên demo.

---

## 1. Toàn bộ chức năng

### 1.1. Tổng quan (`#/`)

- 4 chỉ số: số chuyến bay hôm nay và sắp khởi hành, số vé bán trong tháng (kèm số chuyến hủy), doanh thu tháng này so với tháng trước, số tàu bay quá hạn / sắp tới hạn bảo dưỡng.
- Biểu đồ cột chồng doanh thu 3 tháng theo 3 nguồn (G8): tiền vé, phí hành lý quá cước, dịch vụ nhà ga. Di chuột lên cột để xem chi tiết.
- Cảnh báo tàu bay quá hạn bảo dưỡng (R6).
- Bảng chuyến sắp khởi hành: cổng, trạng thái, số vé / số ghế, và cột **Tổ phục vụ (R9)** báo đủ hay thiếu người.
- Bảng khối lượng dữ liệu: số bản ghi thực tế của 15 bảng so với kế hoạch mục 9.
- (Quản trị) Nạp lại dữ liệu mẫu, chọn quy mô "đúng kế hoạch mục 9" hoặc "quy mô lớn (~9.000 vé)".

### 1.2. Truy vấn Q1–Q5 (`#/q/1` … `#/q/5`)

Mỗi trang có nút **Câu lệnh SQL** để xem đúng câu SQL đang chạy.

| Truy vấn | Chức năng | Tham số |
|---|---|---|
| Q1 · Tỉ lệ lấp đầy | Chuyến bay trong khoảng ngày, số vé đã bán, tỉ lệ lấp đầy (thanh %), giảm dần | Từ ngày, đến ngày |
| Q2 · Lương tháng | Lương cơ bản (vị trí, bậc) + thưởng chuyến theo vai trò (G6), chi tiết thưởng từng vai trò, tổng quỹ lương | Tháng |
| Q3 · Hồ sơ hành khách | Thông tin khách, các chuyến đã bay, hành lý từng chuyến, dịch vụ đã dùng, tổng chi tiêu | Chọn hành khách (mặc định: khách bay nhiều nhất) |
| Q4 · Doanh thu | Doanh thu từng tháng theo 3 nguồn (biểu đồ + bảng), doanh thu tiền vé theo hãng | — |
| Q5 · Bảo dưỡng | Ngày bảo dưỡng tiếp theo (+180 ngày), danh sách quá hạn tách riêng, cảnh báo sắp tới hạn 30 ngày; nút **Ghi nhận bảo dưỡng** | — |

### 1.3. Bán vé (`#/ban-ve`)

- Danh sách chuyến còn mở bán (chưa khởi hành, không hủy) kèm thanh tỉ lệ lấp đầy.
- **Sơ đồ ghế**: hàng đầu là thương gia, ghế đã bán tô xám và không chọn được.
- Chọn khách đã có hoặc nhập khách mới (họ tên, số giấy tờ, ngày sinh…).
- Giá vé gợi ý theo hạng ghế (thương gia = 2,5 × giá cơ bản), sửa được.
- Thêm nhiều kiện hành lý; **phí quá cước tính ngay** theo G4 (100.000 đ/kg vượt 23 kg, làm tròn lên).
- Khách mới, vé và hành lý được ghi trong **một transaction**: một kiện sai (R7, R8) hay ghế trùng (R3) thì hủy toàn bộ, không để lại dữ liệu dở dang.

### 1.4. Chi tiết chuyến bay (`#/chuyen/<mã>`)

Mở bằng cách bấm số hiệu chuyến ở Tổng quan, Q1 hoặc bảng Chuyến bay.

- Thông tin chuyến: đường bay, giờ kế hoạch / thực tế, cổng, giá vé, số vé / số ghế.
- **Đổi trạng thái**: chuyển sang *Làm thủ tục* trở đi phải đủ tổ phục vụ (R9); *Hủy* chuyến thì toàn bộ vé chuyển sang *Đã hủy*.
- **Tổ phục vụ mặt đất**: phân công / gỡ nhân viên; vai trò tự gợi ý theo vị trí; trùng lịch dưới 120 phút bị chặn (R10).
- Sơ đồ ghế (chỉ xem) và danh sách vé kèm hành lý; bấm tên khách để mở hồ sơ Q3.

### 1.5. Quản lý dữ liệu 15 bảng (menu Danh mục / Khai thác / Hành khách / Nhân sự / Dịch vụ)

- Xem, tìm kiếm, sắp xếp theo cột, phân trang.
- Thêm / sửa / xóa qua form sinh tự động: ô chọn cho khóa ngoại (hiển thị tên, không phải mã), ô chọn cho ENUM, ô ngày giờ.
- Cột tính tự động: `PhiQuaCan` (G4), `ThanhTien` (đơn giá tại thời điểm dùng — mục 5.4), `NgayBay` và `GioDenKeHoach` của chuyến bay.
- Vi phạm ràng buộc hiển thị bằng thông báo nghiệp vụ (ví dụ *"R3: Số ghế này đã được bán trên chuyến bay"*) thay vì lỗi kỹ thuật.

### 1.6. Tài khoản & phân quyền

| Vai trò | Tài khoản | Được thêm / sửa / xóa | Nghiệp vụ |
|---|---|---|---|
| Khách (chưa đăng nhập) | — | Không | Xem mọi trang, chạy Q1–Q5 |
| Quản trị | `quantri` | Cả 15 bảng | Mọi nghiệp vụ, nạp lại dữ liệu, quản lý tài khoản |
| Bán vé | `banve` | Hành khách, Vé, Hành lý, Sử dụng dịch vụ | Bán vé |
| Điều phối | `dieuphoi` | Chuyến bay, Tàu bay, Đường bay, Cổng, Phân công | Đổi trạng thái chuyến, ghi nhận bảo dưỡng |
| Kế toán | `ketoan` | Mức lương, Thù lao, Dịch vụ | Xem lương (Q2), doanh thu (Q4) |

- Đăng nhập / đăng xuất / tự đổi mật khẩu ở góc dưới thanh menu.
- Quản trị có trang **Tài khoản & phân quyền**: tạo, khóa, đổi vai trò, đặt lại mật khẩu, xóa; luôn giữ ít nhất một Quản trị.
- Máy chủ kiểm tra quyền ở mọi thao tác ghi; giao diện ẩn / khóa nút theo vai trò.

### 1.7. Khác

- Giao diện sáng / tối, dùng được trên điện thoại.
- Bộ script **MySQL 8** trong `database/mysql/` (bảng, trigger `SIGNAL`, thủ tục R9, Q1–Q5, dữ liệu mẫu) — nộp kèm báo cáo nếu cần.
- 28 kiểm thử tự động (`npm test`) xác nhận R1–R10 đều chặn được, Q1–Q5 đúng, phân quyền đúng.

### Ràng buộc được cài đặt ở đâu (để trả lời khi bị hỏi)

| Mã | Cơ chế | Thấy trên web ở đâu |
|---|---|---|
| R1 | Trigger trên VE | Bán vé khi chuyến đã hết ghế |
| R2 | `UNIQUE (MaChuyen, MaHK)` | Thêm vé thứ hai cho cùng khách trên cùng chuyến |
| R3 | `UNIQUE (MaChuyen, SoGhe)` | Thêm vé trùng số ghế |
| R4 | Trigger trên CHUYENBAY | Xếp tàu bay hai chuyến cách nhau < 120 phút |
| R5 | Trigger trên CHUYENBAY | Xếp cổng hai chuyến cách nhau < 60 phút |
| R6 | Trigger trên CHUYENBAY | Gán tàu bay quá hạn bảo dưỡng vào chuyến mới |
| R7 | `CHECK (CanNangKg <= 32)` | Hành lý trên 32 kg |
| R8 | Trigger trên HANHLY | Kiện xách tay thứ hai / kiện ký gửi thứ tư |
| R9 | Tầng ứng dụng | Chuyển chuyến sang *Làm thủ tục* khi thiếu người |
| R10 | Trigger trên PHANCONG | Phân công nhân viên trùng lịch |

---

## 2. Kịch bản demo đề xuất (khoảng 10 phút)

**Chuẩn bị trước buổi báo cáo**

- Mở web trước **2–3 phút**: gói miễn phí của Render "ngủ" khi không có truy cập, lần mở đầu chờ khoảng 1 phút.
- Đăng nhập `quantri` → Tổng quan → **Nạp lại dữ liệu mẫu** (đúng kế hoạch mục 9) để dữ liệu sạch và mốc ngày khớp hôm nay. Giữ đăng nhập `quantri` cho bước 1, 2 và 4.
- Ghi sẵn mật khẩu `quantri` và mật khẩu demo ra giấy / trình quản lý mật khẩu, **không** trình chiếu chúng.
- Nên mở thêm một tab ẩn danh để demo vai trò khách mà không phải đăng xuất.

### Bước 1 — Tổng quan (1 phút)

Mở trang Tổng quan, nói ngắn gọn: dữ liệu mẫu đúng khối lượng mục 9 (chỉ vào bảng *Khối lượng dữ liệu* cuối trang),
biểu đồ doanh thu chính là G8, cảnh báo 2 tàu bay quá hạn bảo dưỡng (VN-A632, VN-A699 — ngay sau khi nạp lại dữ liệu), cột R9 của chuyến sắp bay.

### Bước 2 — Các truy vấn (3 phút) · *phần quan trọng nhất*

1. **Q1**: đổi khoảng ngày, bấm *Thực hiện*, mở **Câu lệnh SQL** cho thấy `LEFT JOIN VE … GROUP BY … ORDER BY TiLeLapDay DESC`.
   Giải thích vì sao tỉ lệ thấp: 40 khách, mỗi khách tối đa 1 vé/chuyến (R2).
2. **Q2**: chọn tháng trước → lương = cơ bản + thưởng; chỉ cột *Chi tiết thưởng* (vai trò × số chuyến) khớp G6.
3. **Q3**: hồ sơ khách bay nhiều nhất — đủ 3 khối (chuyến, hành lý, dịch vụ) và tổng chi tiêu.
4. **Q4**: di chuột lên biểu đồ; bảng theo hãng.
5. **Q5**: danh sách quá hạn tách riêng; bấm **Ghi nhận bảo dưỡng** cho VN-A632 → tàu chuyển sang danh sách còn hạn
   (nút này chỉ hiện với `quantri` hoặc `dieuphoi`).

### Bước 3 — Nghiệp vụ bán vé và transaction (2 phút)

Đăng nhập `banve`, vào **Bán vé**:

1. Chọn một chuyến, chọn ghế trống trên sơ đồ, chọn khách.
2. Thêm hành lý ký gửi **25,4 kg** → phí hiện ngay **300.000 đ** (vượt 2,4 kg, làm tròn 3 kg × 100.000 đ — G4). Bấm *Xác nhận*: bán thành công, ghế chuyển xám.
3. **Demo rollback**: chọn ghế khác, nhập *khách mới*, thêm kiện **35 kg** → báo *"R7: Mỗi kiện hành lý … không quá 32 kg"*.
   Vào bảng **Hành khách** tìm tên khách mới: **không có** → chứng minh cả transaction đã hủy, kể cả khách mới.
4. (Tuỳ chọn) Thêm 2 kiện **xách tay** → báo R8.

### Bước 4 — Ràng buộc trong CSDL (2 phút)

Chọn 2–3 ví dụ, mỗi ví dụ một cơ chế khác nhau (UNIQUE, trigger, tầng ứng dụng):

| Ví dụ | Thao tác (đăng nhập `quantri`) | Kết quả |
|---|---|---|
| R3 – UNIQUE | Quản lý dữ liệu → **Vé** → *Thêm mới*, chọn một chuyến đã có vé, chọn một khách **chưa** có vé trên chuyến đó, nhập lại **số ghế đã bán** (xem ở sơ đồ ghế của chuyến) | *R3: Số ghế này đã được bán trên chuyến bay* |
| R6 – Trigger | **Chuyến bay** → *Thêm mới*, tàu bay **VN-A699** (đang quá hạn), giờ khởi hành vài ngày tới | *R6: Tàu bay quá hạn bảo dưỡng 180 ngày tại ngày bay* |
| R9 – Ứng dụng | Mở một chuyến *Lên lịch* ở Tổng quan (mỗi chuyến có đúng 2 nhân viên làm thủ tục) → **Gỡ** một nhân viên *Làm thủ tục* → đổi trạng thái sang *Làm thủ tục* | *R9: Chuyến cần tối thiểu 1 điều phối mặt đất và 2 nhân viên làm thủ tục* |
| Khóa ngoại | **Hành khách** → *Xóa* một khách đã có vé | *Vi phạm toàn vẹn tham chiếu…* (ON DELETE RESTRICT) |

> Lưu ý: ở bước R6 nếu đã ghi nhận bảo dưỡng VN-A632 ở bước 2 thì dùng VN-A699 (còn quá hạn).
> Sau R9 nhớ **phân công lại** nhân viên vừa gỡ, hoặc nạp lại dữ liệu mẫu sau buổi demo.

### Bước 5 — Phân quyền (1 phút)

1. Ở tab ẩn danh (khách): vào **Chuyến bay** — không có nút *Thêm / Sửa / Xóa*, có thông báo cần đăng nhập.
2. Với `banve`: vào **Chuyến bay** → *"Vai trò Bán vé chỉ được xem bảng này"*; vào **Vé** thì sửa được.
3. Với `quantri`: mở **Tài khoản & phân quyền**, cho xem bảng phân quyền theo vai trò.

### Câu hỏi thường gặp nên chuẩn bị

- *Vì sao web dùng SQLite mà báo cáo là MySQL?* — Để chạy miễn phí không cần máy chủ CSDL; cùng lược đồ, ENUM đổi thành CHECK, `SIGNAL` đổi thành `RAISE`. Bản MySQL 8 đầy đủ nằm trong `database/mysql/`.
- *R9 sao không dùng trigger?* — Đây là ràng buộc quy trình (đúng như mục 7): lúc INSERT từng dòng phân công thì chuyến chưa thể đủ người, nên kiểm tra khi chuyển trạng thái.
- *Vì sao lưu GiaVe, PhiQuaCan, ThanhTien dù là dẫn xuất?* — Mục 5.4: giá lịch sử. Trong dữ liệu mẫu, suất ăn tăng từ 120.000 đ lên 150.000 đ đầu tháng này nhưng các lượt dùng cũ vẫn giữ thành tiền cũ (xem bảng **Sử dụng dịch vụ**).
- *Chuyến bị hủy xử lý thế nào?* — Không chiếm lịch tàu bay / cổng / nhân viên (R4, R5, R10), vé chuyển sang *Đã hủy*, không tính vào doanh thu (G8) và tổng chi tiêu (Q3).
