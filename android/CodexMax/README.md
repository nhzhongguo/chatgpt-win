# ChatGPT AZ Android

这是 ChatGPT Win Windows 本地服务的原生 Android 客户端，手机端名称为 ChatGPT AZ。手机和电脑位于同一局域网时，可以扫描 Windows 管理端二维码，在 App 内打开控制页并接收任务完成通知。

## 功能

- 二维码扫描与手动连接
- 最近连接保存和清除
- WebView 控制界面与附件选择
- 同源导航限制和外部链接隔离
- 后台任务状态轮询
- 完成或失败通知
- token 禁止随系统备份

## 构建

准备 JDK 17 和包含 API 35 的 Android SDK，然后在本目录执行：

```powershell
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

默认调试包位于：

```text
app\build\outputs\apk\debug\app-debug.apk
```

项目也支持用 `CODEX_MAX_ANDROID_BUILD_DIR` 把构建输出放到不含中文的临时目录。例如：

```powershell
$env:CODEX_MAX_ANDROID_BUILD_DIR = "C:\CodexBuild\AndroidOutput"
.\gradlew.bat assembleDebug
```

## 使用

1. 在 Windows 上启动 `ChatGPT Win.exe`。
2. 确认手机和电脑连接同一个 Wi-Fi。
3. 安装 APK，打开 App 并允许相机和通知权限。
4. 扫描电脑端二维码，或输入形如 `http://192.168.x.x:8787/?token=...` 的完整地址。

局域网服务使用 HTTP，因此不要把二维码、完整连接地址或 token 发给其他人。

正式交付请从仓库根目录运行：

```powershell
.\scripts\build-codex-max-android.ps1
```

该脚本会在首次运行时创建本机长期保存的 Release 签名密钥，构建正式 APK，并输出 APK、SHA-256 校验文件及传输用 ZIP 包。若聊天软件或手机管家拦截 APK，请传输 ZIP 后在手机文件管理器中解压，再安装其中的 APK。签名密钥和密码文件不会提交到 Git，升级时必须保留它们。
