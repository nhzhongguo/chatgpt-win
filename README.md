# Codex Remote Bridge

> 在手机上远程操控 Windows 上的 Codex Desktop，全程局域网直连、本地运行。

Codex Remote Bridge 是一个开源的“手机 ↔ 电脑”远程控制桥接工具：手机通过网页或 Android App 连接同一局域网内的 Windows 电脑，把文字或图片发送到电脑上正在运行的 Codex 对话中，并实时同步查看回复过程、运行状态和工具调用结果。

本项目基于 [CoimgRain/Codex-Mini](https://github.com/CoimgRain/Codex-Mini) 的本地桥接思路，重写了 Windows 自动化控制层，并新增 Android 原生客户端。它**不是云端聊天服务**：Codex 的登录状态、线程切换、输入和回复读取全部发生在你自己的电脑上。

---

## 主要功能

**手机端**
- 扫描电脑端二维码或手动粘贴带 token 的局域网地址，一键连接
- 手机网页 / Android App 内查看任务列表、聊天记录、模型和推理等级
- 发送文字、图片附件，支持停止响应、新建线程、归档、重命名、压缩上下文
- 后台轮询任务状态，任务完成或失败时发送系统通知
- Android App 支持最近连接保存与清除、中英文切换、新版本在线提示

**电脑端（Windows）**
- WPF 管理面板：服务状态、端口、线程数、二维码入口、日志与启停控制
- 自动启动隐藏的 Node 本地服务，支持开机自启与健康检查
- 优先通过 Chrome DevTools Protocol（CDP）无感控制 Codex；CDP 不可用时回退到 GUI / 剪贴板自动化
- 内置 token 鉴权、API 限流、访问令牌轮换和附件大小限制
- 可构建免安装便携版、单文件 exe 或 Inno Setup 安装包

**安全与隐私**
- 所有请求只在手机与电脑的局域网内传输，不经过任何第三方服务器
- 连接链接自带随机 token，支持一键轮换，旧 token 立即失效
- 不保存聊天正文或图片内容，Android App 禁止系统备份 token

---

## 界面预览

<p>
  <img src="assets/screenshots/preview-thread-list.png" alt="Codex Remote Bridge 手机线程列表" width="220" />
  <img src="assets/screenshots/preview-chat.png" alt="Codex Remote Bridge 手机聊天同步" width="220" />
  <img src="assets/screenshots/mobile-reasoning-menu.png" alt="Codex Remote Bridge 推理模式菜单" width="220" />
</p>

<p>
  <img src="assets/screenshots/ipad-layout.png" alt="Codex Remote Bridge iPad 横屏布局" width="720" />
</p>

---

## 快速开始

### 方式一：直接运行源码服务（最简单）

电脑上需要已安装并登录 Codex Desktop，且手机与电脑在同一个 Wi-Fi / 局域网。

```powershell
node server.js
```

终端会打印类似下面的局域网入口，用手机浏览器打开即可：

```text
http://192.168.x.x:8787/?token=...
```

> 也可以先设置自定义 token：`$env:MOBILE_TYPER_TOKEN = "your-token"`，再运行 `node server.js`。

### 方式二：使用 Windows 客户端

```powershell
# 单文件免安装版
.\scripts\build-codex-max-windows-single-exe.ps1

# 便携版
.\scripts\build-codex-max-windows-portable.ps1

# 完整安装包（需要 Inno Setup 6）
.\scripts\build-codex-max-windows-installer.ps1
```

构建产物分别输出到：

```text
dist\windows\Codex Remote Bridge SingleExe\Codex Remote Bridge.exe
dist\windows\Codex Remote Bridge Portable\
dist\windows\installer\Codex-Remote-Bridge-Windows-Setup.exe
```

打开 `Codex Remote Bridge.exe` 后，管理面板会显示手机可访问的局域网二维码；手机扫码即可连接。

### 方式三：安装 Android App

```powershell
.\scripts\build-codex-max-android.ps1
```

构建并签名后输出到 `dist\android\ChatGPT-AZ-Android-v1.2.7.apk`（含 `.sha256` 校验文件和传输用 ZIP）。把 APK 传到手机安装，或解压 ZIP 后在手机文件管理器中安装。

> 构建脚本会在首次运行时生成并保存 Release 签名私钥（不会提交到 Git）。后续升级必须继续使用同一份工作目录中的签名文件，否则无法覆盖安装旧版本。

---

## Android 原生客户端

Android 工程位于 `android/CodexMax`，最低支持 Android 6.0（API 23），构建环境需要 JDK 17 和 Android SDK 35。

- 扫描电脑端二维码或手动输入连接地址
- App 内加载完整手机控制界面，支持选择附件
- 保存最近一次连接，长按“最近连接”可清除
- 后台轮询 `/codex/status`，任务完成或失败时发送系统通知
- 连接后自动检查电脑端是否有新版 APK，支持一键下载更新
- 限制 WebView 只在同源服务内导航，外部链接交给系统浏览器

移动端 UI 验收基准为 iPhone 15 Pro `393 × 852`，详见 [docs/MOBILE_QA.md](docs/MOBILE_QA.md)。

```powershell
cd .\android\CodexMax
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

---

## 工作原理

1. 电脑端启动本地 Node 服务，生成带随机 token 的局域网入口
2. 手机网页 / App 通过该入口连接电脑
3. 本地服务读取 Codex Desktop 的会话、历史和运行状态，并把文字/图片写入当前对话
4. 本地服务持续读取 Codex 回复日志，把结果同步回手机
5. 同一 Wi-Fi 下手机直连电脑局域网地址，速度最快

Windows 控制层优先使用 CDP：如果 Codex 以 `--remote-debugging-port` 启动，可以在后台直接控制渲染页面，无需把窗口拉到前台。CDP 不可用或需要发送图片时，会回退到 `codex://` 深链 + UI Automation / 剪贴板路径。

开启 Codex Desktop 的 CDP 调试模式：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-codex-cdp.ps1 -ForceRestart
```

CDP 端口默认 `9222`，可用 `-Port 9333` 修改，并设置 `$env:CODEX_MAX_CDP_PORT` 与之一致。

---

## Windows 当前限制

- 纯文本发送、新建项目线程、停止响应和推理模式切换优先走 CDP，可在后台完成
- 图片附件、模型切换、归档、置顶、重命名等操作暂时回退到 GUI / 剪贴板路径
- 手机端顶部显示 `CDP` 表示无感控制，显示 `GUI` 表示前台自动化回退模式
- 不支持锁屏后操作、UAC 弹窗或管理员认证处理
- GUI 回退和图片附件会临时使用 Windows 剪贴板，发送期间请勿手动修改剪贴板
- keep-awake 使用 `SetThreadExecutionState`，服务退出后自动停止保持亮屏

---

## 项目结构

```text
server.js                        本地 HTTP 服务（路由、鉴权、限流、状态同步）
public/                          手机端单页 Web 界面（中英文、多主题、工作台）
src/                             平台控制层（win32 / darwin）与应用服务封装
android/CodexMax/                Android 原生客户端（WebView + 扫码 + 通知）
windows/CodexMini/               Windows WPF 管理面板与安装包配置
macos/CodexMini/                 macOS 工程（跟随上游保留）
scripts/                         构建脚本（Windows / Android / CDP 启动）
docs/                            文档（构建说明、移动端验收基准）
test/                            服务端测试
.github/workflows/               GitHub Actions CI
```

更详细的构建环境与命令见 [docs/BUILDING.md](docs/BUILDING.md)，版本变更见 [CHANGELOG.md](CHANGELOG.md)。

---

## 开发与测试

```powershell
# 语法检查
npm run check

# 服务端测试
node --test test/server.test.js test/codex-app-server.test.js
```

提交到 `main` 或发起 PR 时，GitHub Actions 会自动运行服务端检查与测试、Android 单元测试 / lint / 构建，并上传 Debug APK 产物。

---

## 常见问题

**手机打不开网页？**
确认手机和电脑在同一个 Wi-Fi；检查 Windows 防火墙是否允许 `8787` 端口入站；重新扫码获取最新入口。

**提示 token 无效？**
电脑端服务重启或 token 已轮换后，需要重新扫码。轮换 token 后，旧的局域网链接会立即失效。

**手机上无法上下滑动设置页？**
该问题已在最新版本修复；请更新电脑端服务文件并重启客户端，重新扫码连接。

**这是收费软件吗？**
不是。本项目是纯本地开源工具，不包含任何云端中转、会员或付费功能。

---

## 交流与反馈

QQ 群：**760669553**

欢迎反馈使用问题、bug 和功能建议。也可以在 GitHub Issues 中提交。

---

## 致谢

- 上游项目：[CoimgRain/Codex-Mini](https://github.com/CoimgRain/Codex-Mini)
- 上游 macOS Release 参考：[codex-mini-beta-v3.0.5](https://github.com/CoimgRain/Codex-Mini/releases/tag/codex-mini-beta-v3.0.5)

macOS 相关工程保留在仓库中，方便对照与同步；本仓库的主要维护方向是 Windows + Android。
