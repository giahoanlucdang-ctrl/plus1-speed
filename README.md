# +1 Speed

Game 3D chạy trên nền web (Three.js) với 4 thế giới, mua world bằng Wins, rebirth, shop và chơi LAN nhiều người.

## Tải về

Vào tab **Releases** của repo và chọn file theo nền tảng:

| Nền tảng | File tải về | Ghi chú |
| --- | --- | --- |
| Windows | `Plus1Speed-Setup-<version>.exe` | Bộ cài, chạy được Windows 7/8.1/10/11 (Electron 22) |
| Linux Mint/Ubuntu | `Plus1Speed-<version>-*.AppImage` | `chmod +x` rồi double-click, không cần cài |
| Linux Mint/Ubuntu | `Plus1Speed-<version>-*.deb` | Cài bằng `sudo apt install ./Plus1Speed-<version>-*.deb` |
| Android | `Plus1Speed-<version>.apk` | Bật "Cài từ nguồn không xác định" trước khi cài |

Bản Android hiện chỉ chơi đơn (không có server LAN đi kèm).

### Chơi chung trong cùng wifi

- Máy chạy bản Windows/Linux mở game trước — game tự mở server ở cổng **8000** (nếu bận sẽ tự đổi sang 8001, 8002…).
- Máy khác mở trình duyệt tới `http://<IP-máy-host>:8000` để vào chung.
- IP máy host xem bằng `ipconfig` (Windows) hoặc `ip addr` (Linux).

## Chạy từ source

Yêu cầu Node.js 18+.

```bash
npm install
npm start          # mở app Electron
npm run dist:win   # tạo bộ cài Windows trong release/
npm run dist:linux # tạo AppImage + deb (chạy trên Linux)
npm run android:sync
```

Bản Android cần Android SDK + Java 17 để build bằng Gradle trong thư mục `android/`.

## Phát hành bản mới

Workflow `.github/workflows/release.yml` tự build cả 3 nền tảng khi đẩy tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions sẽ build Windows, Linux, Android rồi gắn file vào GitHub Release.

## Lưu ý

Một số mô hình nhân vật (SpongeBob, Mario, Roblox…) lấy từ internet, chỉ phù hợp dùng cá nhân — cân nhắc trước khi phát hành công khai.
