# Hướng Dẫn Đẩy Lên GitHub Pages & Cấu Hình Google Drive OAuth 2.0

Tài liệu hướng dẫn chi tiết cách triển khai ứng dụng lên **GitHub Pages**, cấu hình **Google OAuth 2.0**, và cách thức ứng dụng tự động khởi tạo / quản lý cây thư mục riêng trên Google Drive của người dùng.

---

## 1. Cơ Chế Hoạt Động (Architecture)

1. **Static SPA trên GitHub Pages**:
   - Ứng dụng chạy 100% trên trình duyệt của người dùng (Client-Side Single Page App), không phụ thuộc máy chủ Node.js.
   - Sử dụng **Google Identity Services (GIS)** để xác thực trực tiếp và cấp quyền truy cập Google Drive API từ trình duyệt.
   - Bộ nhớ đệm **IndexedDB** (`drivestream_db`) lưu trữ metadata cục bộ để đạt tốc độ hiển thị 60fps tức thì.
2. **Quản lý Thư Mục Riêng**:
   - Khi đăng nhập lần đầu, ứng dụng tự động kiểm tra trên Google Drive của user xem đã có thư mục **`DriveStream Media`** chưa.
   - Nếu chưa: Tự động tạo thư mục `DriveStream Media` ở thư mục gốc (Root).
   - Nếu đã có: Tự động dùng lại thư mục đó, không tạo trùng lặp.
   - Hỗ trợ tạo không giới hạn **thư mục con (Subfolders)**, di chuyển giữa các thư mục bằng thanh điều hướng Breadcrumb và tải ảnh/video trực tiếp vào thư mục đang chọn.

---

## 2. Bước 1: Tạo Google Cloud OAuth 2.0 Client ID

Để đăng nhập tài khoản Google từ GitHub Pages, bạn cần một **Client ID** (hoàn toàn miễn phí):

1. Truy cập [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials).
2. Tạo một Project mới (ví dụ: `DriveStream Web`).
3. Vào mục **APIs & Services** > **Library**, tìm **Google Drive API** và bấm **Enable**.
4. Vào mục **OAuth consent screen**:
   - Chọn **External**, điền App name (`DriveStream`), User support email.
   - Phần Scopes: Thêm scope `.../auth/drive` hoặc `.../auth/drive.file`.
   - Trong quá trình thử nghiệm (Testing status), hãy thêm email Google của bạn vào mục **Test users**.
5. Vào mục **Credentials** > **Create Credentials** > **OAuth client ID**:
   - Application type: **Web application**.
   - Name: `DriveStream GitHub Pages`.
   - **Authorized JavaScript origins** (Rất quan trọng):
     - Thêm URL GitHub Pages của bạn: `https://<ten-tai-khoan>.github.io`
     - Thêm URL local: `http://localhost:3000`
   - Bấm **Create**, sao chép chuỗi **Client ID** (có dạng `xxxx-xxxx.apps.googleusercontent.com`).

---

## 3. Bước 2: Đẩy Mã Nguồn Lên GitHub

Mở Terminal tại thư mục dự án và chạy các lệnh sau:

```bash
# 1. Khởi tạo Git repository
git init

# 2. Thêm toàn bộ mã nguồn
git add .

# 3. Tạo commit đầu tiên
git commit -m "feat: Google Drive 60fps Media Viewer SPA for GitHub Pages"

# 4. Đổi tên branch thành main
git branch -M main

# 5. Liên kết với repository trên GitHub của bạn
# (Thay thế <username> và <repo-name> bằng tài khoản và repo của bạn)
git remote add origin https://github.com/<username>/<repo-name>.git

# 6. Push code lên GitHub
git push -u origin main
```

---

## 4. Bước 3: Kích Hoạt GitHub Pages

1. Vào repository trên GitHub: `https://github.com/<username>/<repo-name>`.
2. Chọn tab **Settings** > chọn mục **Pages** ở thanh bên trái.
3. Tại phần **Build and deployment**:
   - Mục **Source**: Chọn **GitHub Actions** (thay vì *Deploy from a branch*).
4. GitHub Actions workflow (`.github/workflows/deploy.yml`) sẽ tự động kích hoạt, build trang tĩnh và phát hành lên trang web:
   `https://<username>.github.io/<repo-name>/`
   *(Nếu bạn dùng custom domain hoặc username.github.io thì URL sẽ là `https://<username>.github.io/`)*.

---

## 5. Bước 4: Đăng Nhập & Quản Lý Thư Mục

1. Mở trang web GitHub Pages vừa được deploy.
2. Bấm nút **Đăng nhập** ở góc trên bên phải:
   - Dán chuỗi **Google OAuth Client ID** bạn đã tạo ở Bước 1 vào ô cấu hình.
   - Bấm **Đăng nhập với Google**.
3. Cửa sổ popup của Google xuất hiện, bạn chọn tài khoản và cấp quyền cho ứng dụng.
4. Ngay khi đăng nhập thành công:
   - Ứng dụng tự động kết nối vào thư mục **`DriveStream Media`** trên Google Drive của bạn.
   - Bạn có thể bấm nút **Tạo thư mục con** (ví dụ: *Kỷ niệm 2026*, *Chuyến đi Đà Lạt*, *Ảnh chất lượng cao*...).
   - Bấm **Tải lên** để upload ảnh/video 10MB chunk trực tiếp vào thư mục đang mở.
   - Khi truy cập lại từ bất kỳ thiết bị nào, tài khoản và thư mục của bạn vẫn được lưu giữ và kết nối lại ngay lập tức!
