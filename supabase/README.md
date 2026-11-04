# Bật tài khoản game (Supabase) — làm 1 lần

Game dùng Supabase cho đăng nhập, mã khôi phục 6 số qua email và Google. Làm theo đúng thứ tự dưới đây.

## 1. Tạo project
1. Vào https://supabase.com, đăng ký miễn phí, bấm **New project**, đặt tên `plus1-speed`, chọn region Singapore.
2. Chờ project tạo xong (~2 phút).
3. Vào **Project Settings → API**, copy **Project URL** và **anon public key**.

## 2. Cấu hình đăng nhập email
1. **Authentication → Providers → Email**: bật, **tắt "Confirm email"** để đăng ký xong vào game luôn.
2. **Authentication → Settings**: đặt **Minimum password length = 9**.
3. **Authentication → Providers → Email → Allow manual linking**: bật (để nút Link Google hoạt động).

## 3. Sửa mẫu email khôi phục (mã 6 số)
**Authentication → Email Templates → Reset Password**, dán:

Subject:
```
Your +1 Speed recovery code
```
Body:
```
Dear Player,

Here is your code to recover your account:

{{ .Token }}

If this wasn't you, click here to secure your account:
{{ .SiteURL }}

Best regards,
Game Support Team
```

## 4. Tạo bảng dữ liệu
**SQL Editor → New query**, dán toàn bộ nội dung file `supabase/schema.sql` rồi **Run**.

## 5. Google login
1. Vào https://console.cloud.google.com → tạo project mới.
2. **APIs & Services → OAuth consent screen**: chọn External, điền tên app, email hỗ trợ, lưu.
3. **Credentials → Create credentials → OAuth client ID → Web application**.
   - Authorized JavaScript origins: `https://<PROJECT-REF>.supabase.co`
   - Authorized redirect URI: `https://<PROJECT-REF>.supabase.co/auth/v1/callback`
4. Copy **Client ID** và **Client Secret** dán vào **Supabase → Authentication → Providers → Google**, bật provider.
5. Trong **Supabase → Authentication → URL Configuration**:
   - Site URL: địa chỉ game của bạn (ví dụ `http://127.0.0.1:8000/`)
   - Redirect URLs: thêm `http://127.0.0.1:8000/`, `http://localhost:8000/`, `https://localhost`

## 6. Hàm xoá tài khoản
Cần Supabase CLI trên máy bạn (hoặc nhờ AI chạy):
```
cd "thư mục game"
npx supabase login
npx supabase link --project-ref <PROJECT-REF>
npx supabase functions deploy delete-account
```
Nếu chưa làm bước này, nút **Delete account** sẽ báo lỗi; các tính năng còn lại vẫn chạy.

## 7. Gửi email thật cho người chơi
SMTP mặc định của Supabase chỉ cho gửi rất ít email/giờ (chỉ đủ để thử). Khi phát hành cho người chơi thật:
- **Project Settings → Auth → SMTP Settings**: dùng Gmail (App Password) hoặc Resend (miễn phí 3.000 email/tháng), rồi bật **Custom SMTP**.

## 8. Điền key vào game
Mở `js-pack/supabase-config.js`, điền:
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```
Key anon là key công khai, được phép nằm trong game.

Sau đó mở game: màn hình Log in sẽ hoạt động; chưa điền key thì game vẫn chơi offline như cũ.
