# Corgi Pocket 🐶

**Link app:** https://quyenlp1106-hub.github.io/corgi-pocket/ · mã nguồn: https://github.com/quyenlp1106-hub/corgi-pocket

Sổ chi tiêu riêng của chị: biết mỗi ngày tiêu bao nhiêu, Nhi cần trả chị bao nhiêu, công ty còn nợ chị bao nhiêu, tháng này thẻ và nợ cố định còn phải trả bao nhiêu.

```
Ghi 1 khoản chi (nút ＋)
 ├─ Chia đôi / Riêng chị / Riêng Nhi / Tuỳ chỉnh ─→ tab "Nhi"      : Nhi ⇄ chị cần trả nhau bao nhiêu → "Gửi Nhi" → "Đã thanh toán xong"
 └─ 💼 Công ty ứng                                ─→ tab "Hoàn ứng" : công ty còn nợ bao nhiêu → "Sao chép bảng kê" gửi kế toán → "Công ty đã chuyển"

Góc riêng (tab "Cố định", không dính vào tiền chia)
 ├─ 💳 Thẻ tín dụng : nhập số sao kê, tick khi đã trả
 ├─ 🏦 Nợ cố định   : khai tổng dư nợ một lần → mỗi kỳ tick đã trả, app tự trừ dần và báo còn bao nhiêu kỳ
 └─ 🧾 Chi cố định  : tiền nhà, học phí…
 Tick "Lặp lại mỗi tháng" → đầu tháng sau app tự tạo khoản mới. Trang Lịch báo trước 7 ngày khi sắp tới hạn.

Dòng tiền (tab "Dòng tiền", từ bản 1.1)
 ├─ Tiền vào   = khoản thu chị ghi (lương, thưởng, vay, thu khác) + Nhi trả chị + công ty hoàn ứng (2 khoản sau app tự tính)
 ├─ Tiền ra thật = chi trả ngay (tiền mặt, ngân hàng, ví) + kỳ thẻ/nợ/chi cố định đã tick trả + chị trả Nhi
 └─ Quẹt thẻ / trả sau: tính vào chi tiêu, nhưng chỉ thành tiền ra khi tick đã trả thẻ → không tính trùng

Ví của chị (đầu tab Dòng tiền + 1 dòng ở trang Lịch, từ bản 1.2)
 ├─ Còn được tiêu tháng này ≈ Tiền đang có − Nợ còn trả tháng này (âm = đỏ: hết tiền mà còn nợ)
 ├─ Tiền đang có: nhập số dư 1 lần cho tiền mặt / ngân hàng / ví → app tự cộng thu, trừ chi, trừ tiền trả nợ
 ├─ Thẻ / trả sau: nhập dư nợ + hạn mức → app báo dư nợ và hạn mức còn quẹt được
 └─ Lệch số thật: bấm vào nguồn → nhập số thực tế, app tự ghi phần chênh
 Tick "đã trả" ở khoản cố định, chốt với Nhi, nhận hoàn ứng → app hỏi trả bằng / nhận vào nguồn nào.

Nhắc hạn trả (từ bản 1.2)
 ├─ Trang Lịch: mục "Sắp đến hạn trong tuần" (quá hạn, hôm nay, ngày mai, còn N ngày), tick trả ngay tại chỗ
 ├─ Cài đặt → Tải lịch nhắc (.ics) → "Thêm tất cả" vào Lịch iPhone: báo 9h sáng hôm trước + sáng ngày đến hạn, không cần mở app
 └─ Cài đặt → Bật thông báo: mỗi ngày lần đầu mở app, báo các khoản tới hạn trong 3 ngày
 Mỗi khoản chi chọn "Chi bằng" (nguồn tiền). Thẻ thêm ở Góc cố định tự thành nguồn tiền, và dòng thẻ hiện "Quẹt tháng trước: X" để đối chiếu sao kê.
```

Nhập sao kê ngân hàng (từ bản 1.3)
 Cài đặt → "＋ Nhập thêm từ file" → chọn file .json em tạo từ sao kê. Chỉ cộng thêm, không xoá dữ liệu đang có, nhập lại không bị trùng.
 Khoản chưa rõ chi cho ai / mục đích gì có nhãn "🔎 Cần xem lại" → trang Lịch có lối vào danh sách để sửa dần.
 File .json sao kê để trong iCloud (thư mục 💰 TCB), KHÔNG để trong thư mục này vì thư mục này đưa lên GitHub công khai.

## Cài lên iPhone (làm 1 lần, khoảng 10 phút)

| Bước | Làm gì |
|---|---|
| 1 | Vào github.com → đăng nhập → **New repository** → đặt tên `corgi-pocket` → Create |
| 2 | Bấm **uploading an existing file** → kéo **toàn bộ nội dung bên trong** thư mục `Corgi-Pocket` vào (để thư mục `docs` nằm ngay cấp đầu) → Commit |
| 3 | **Settings → Pages** → Source: *Deploy from a branch* → Branch: `main`, thư mục `/docs` → Save |
| 4 | Đợi 1–2 phút, GitHub hiện link dạng `https://<tên-github>.github.io/corgi-pocket/` |
| 5 | Mở link đó bằng **Safari** trên iPhone → nút Chia sẻ → **Thêm vào MH chính** |
| 6 | Mở app bằng icon Corgi → Cài đặt → điền họ tên đầy đủ, tên công ty |

Sau lần mở đầu, app chạy được cả khi không có mạng.

## Cần biết

- **Dữ liệu chỉ nằm trong điện thoại**, không lên GitHub (GitHub chỉ giữ phần mã của app). Đổi máy hoặc xoá app là mất, nên vào Cài đặt → **Tải backup** mỗi 2 tuần, lưu vào iCloud Drive. Trang Lịch tự nhắc khi quá 14 ngày chưa backup.
- Gõ tiền nhanh: `165k`, `1,2tr`, `165700`. Chia đôi số lẻ giữ đúng 0,5đ.
- Gõ lại mô tả cũ (ví dụ "Grab"), app tự điền cách chia và danh mục như lần trước.
- Khoản đã chốt với Nhi / đã được công ty hoàn thì khoá lại, không sửa nhầm. Bấm nhầm thì vào lịch sử → Hoàn tác.
- Muốn sửa app: sửa file trong `docs/`, upload đè lên GitHub. Mở app có mạng là tự nhận bản mới, dữ liệu giữ nguyên.

## Cấu trúc

`docs/` toàn bộ app · `tests/` kiểm tra tính toán và chạy offline (`npm test`, cần Node.js) · làm lại từ app mẫu Bunny Pocket.
