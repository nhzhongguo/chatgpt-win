# ChatGPT Win

ChatGPT Win 是基于 [CoimgRain/Codex-Mini](https://github.com/CoimgRain/Codex-Mini) 原项目开发的 Windows 适配版。它保留原项目的 HTTP 服务、手机网页、token 鉴权、Codex session/history/status 解析和发送后追踪回复状态机制，重点补齐 Windows 上通过手机远程操控 ChatGPT / Codex Desktop 的能力。

你可以在手机上打开一个本地网页，把文字或图片发送到 Windows 上正在使用的 Codex 对话中，并在网页里同步查看 Codex 的回复过程和结果。本仓库也保留 macOS 平台控制层，方便继续跟随原项目演进。

> 📌 **开源版 / 构建版说明**
>
> 本仓库提供 ChatGPT Win 的开源维护版本，适合有服务器或开发能力的朋友自行部署、改造和二次开发。由于我个人精力有限，也希望通过开源让更多人一起参与改进。
>
> 目前官方 DMG 构建版仅支持 **macOS**。源码版已加入 Windows MVP 适配，并提供与 macOS App 同职责的 Windows 客户端源码工程，可构建免安装便携包或 Windows 安装包；Windows 版本暂不包含服务器中转能力。
>
> 如果你不想折腾部署，或者没有自己的服务器，可以直接下载我构建好的 **DMG 应用** 使用。DMG 构建版会持续维护，并优先提供最新功能；部分新功能可能不会第一时间同步到开源版，开源版会保持可用和维护，但节奏可能略滞后。感谢大家的支持，我也会在能力范围内持续把 ChatGPT Win 优化好。

## 开源版与构建版

上面的提示是当前项目的版本定位：开源版方便自部署和二次开发，DMG 构建版适合直接安装使用并优先体验最新功能。

## 当前状态

- 项目名：ChatGPT Win
- 基线版本：基于上游 Codex Mini v3.0.5 源码适配
- 主要目标：Windows 本地源码版 / 免安装客户端 / 手机局域网遥控 Windows 上的 Codex Desktop
- 上游项目：[CoimgRain/Codex-Mini](https://github.com/CoimgRain/Codex-Mini)
- 上游 macOS Release 参考：[codex-mini-beta-v3.0.5](https://github.com/CoimgRain/Codex-Mini/releases/tag/codex-mini-beta-v3.0.5)

ChatGPT Win 目前优先交付 Windows 可运行 MVP。macOS 相关能力和上游脚本仍保留在仓库中，方便对照和后续同步，但本仓库的主要维护方向是 Windows 版。

## 界面预览

<p>
  <img src="assets/screenshots/preview-thread-list.png" alt="ChatGPT Win 手机线程列表" width="220" />
  <img src="assets/screenshots/preview-chat.png" alt="ChatGPT Win 手机聊天同步" width="220" />
  <img src="assets/screenshots/mobile-reasoning-menu.png" alt="ChatGPT Win 推理模式菜单" width="220" />
</p>

<p>
  <img src="assets/screenshots/ipad-layout.png" alt="ChatGPT Win iPad 横屏布局" width="720" />
</p>

## 加入交流群

QQ 群：**760669553**

欢迎加入群里交流使用问题、反馈 bug、提出功能建议。后续有最新版本也会在群里及时沟通。

## 安装与使用

Windows 电脑端和 Android 手机端可以配套使用：

1. 克隆本仓库到 Windows 电脑。
2. 确认 Codex Desktop 已安装、已登录，并能正常打开目标对话。
3. 运行 `.\scripts\build-codex-max-windows-single-exe.ps1` 构建单文件客户端。
4. 打开 `dist\windows\ChatGPT Win SingleExe\ChatGPT Win.exe`。
5. 运行 `.\scripts\build-codex-max-android.ps1`，然后在 Android 手机上安装 `dist\android\ChatGPT-AZ-Android-v1.2.0.apk`。
6. 打开手机 App，扫描电脑端显示的二维码；也可以手动粘贴带 token 的局域网入口。
7. 手机和 Windows 电脑需要在同一个 Wi-Fi / 局域网。没有安装 Android App 时，仍可直接用手机浏览器打开该入口。

> Android 构建脚本会在首次运行时在本机创建并保存 Release 私钥。该私钥和密码文件不会提交到 Git；后续升级必须继续使用同一份工作目录中的签名文件。

macOS DMG 安装包请参考上游 [CoimgRain/Codex-Mini](https://github.com/CoimgRain/Codex-Mini)。

## Android 原生客户端

Android 工程位于 `android/CodexMax`，最低支持 Android 6.0（API 23）。它是现有手机网页的原生入口，不复制样本程序的实现，也不接入样本中的商业中转服务。

移动端 UI 的固定验收尺寸为 iPhone 15 Pro `393 × 852`。详细检查项见 [移动端验收基准](docs/MOBILE_QA.md)。

- 扫描 Windows 管理端二维码或手动输入连接地址
- 在 App 内加载 ChatGPT Win 手机控制界面并支持选择附件
- 保存最近一次连接，长按“最近连接”可以清除
- 限制 WebView 只在同源服务内导航，外部链接交给系统浏览器
- 后台轮询 `/codex/status`，任务完成或失败时发送系统通知
- 禁止系统备份连接 token

构建环境需要 JDK 17 和 Android SDK 35：

```powershell
cd .\android\CodexMax
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

从仓库根目录运行 `.\scripts\build-codex-max-android.ps1` 可生成经过正式签名和校验的 `dist\android\ChatGPT-AZ-Android-v1.2.0.apk`、`.sha256` 校验文件和传输用 ZIP 包。若聊天软件或手机管家拦截 APK，请传输 ZIP 后在手机文件管理器中解压，再安装其中的 APK；`dist` 属于本机构建产物，不提交到 Git。

## 添加到主屏幕

iPhone 上打开 ChatGPT Win 网页后，按下面三步操作：

1. 点浏览器底部或菜单里的“分享”
2. 如果没看到“添加到主屏幕”，先点“查看更多”
3. 点“添加到主屏幕”，之后从桌面图标打开 ChatGPT Win

> Windows 推荐先用 CDP 调试端口启动 ChatGPT / Codex Desktop。CDP 可用时，ChatGPT Win 会直接控制应用的渲染页面，无需把应用窗口拉到前台；CDP 不可用或发送图片附件时，会回退到原来的 GUI/剪贴板自动化路径。

## Windows 源码版 MVP

Windows 版复用原有 HTTP 服务、手机网页、token 鉴权、Codex session/history/status 解析和发送后追踪回复状态的机制，只替换桌面自动化层。当前 Windows 控制层优先连接 Codex Desktop 暴露的 Chrome DevTools Protocol（CDP）页面 target，直接在 `app://-/index.html` 渲染层中新建项目线程、聚焦 ProseMirror 输入框、插入文本、点击发送按钮、停止按钮，并通过顶部智能菜单切换推理等级。只有在 CDP 不可用、需要发送图片附件，或执行模型/线程菜单类操作时，才回退到旧的 `codex://` 深链 + UI Automation / 剪贴板 / SendKeys 路径。

开启 Codex Desktop CDP 的调试脚本：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-codex-cdp.ps1 -ForceRestart
```

脚本会用 `--remote-debugging-port=9222` 重启 Codex，并检查 `http://127.0.0.1:9222/json/list` 是否暴露了 `title: Codex`、`url: app://-/index.html` 的 `page` target。本地服务默认连接 `127.0.0.1:9222`；如需换端口，可同时设置：

```powershell
$env:CODEX_MAX_CDP_PORT = "9333"
powershell -ExecutionPolicy Bypass -File .\scripts\start-codex-cdp.ps1 -ForceRestart -Port 9333
```

Windows 客户端工程位于 `windows/CodexMini`，职责对齐 macOS App。当前 Windows 客户端使用 WPF 实现，界面结构复刻 macOS SwiftUI 控制面板：顶部状态、HTTP/端口/线程指标、常用操作、本机入口和日志/启停入口。

客户端面板右侧会显示当前局域网入口二维码，手机扫码即可打开带 token 的控制页。操作区的“受控 ChatGPT”按钮会调用本地服务重启官方 ChatGPT / Codex Desktop，并自动附加 `--remote-debugging-port` 参数；手机页在处于 `GUI` 回退模式时也会显示一个小的 CDP 启动按钮。

- 生成并持久化手机访问 token
- 准备本地服务 payload
- 启动、停止、重启隐藏的 Node 本地服务
- 展示 HTTP 状态、端口、线程数量、最新线程标题和日志入口
- 打开网页、复制局域网入口

构建免安装便携版：

```powershell
.\scripts\build-codex-max-windows-portable.ps1
```

构建单文件免安装 exe：

```powershell
.\scripts\build-codex-max-windows-single-exe.ps1
```

默认输出：

```text
dist\windows\ChatGPT Win SingleExe\ChatGPT Win.exe
```

单文件版会把 .NET Desktop Runtime、本地服务 payload 和 Node 一起嵌入 exe。为了兼容旧版配置，运行状态仍保存在 `%APPDATA%\Codex Max`。

默认输出：

```text
dist\windows\ChatGPT Win Portable
dist\windows\ChatGPT-Win-Windows-Portable.zip
```

解压后直接运行 `ChatGPT Win.exe`。便携版默认自带 .NET Desktop Runtime、Node、本地服务 payload 和 Windows 控制层，不需要先安装 Node 或 .NET。

构建客户端目录：

```powershell
.\scripts\build-codex-max-windows.ps1
```

也可以直接指定输出目录或内置 Node：

```powershell
.\scripts\build-codex-max-windows.ps1 -OutputDir .\dist\windows\CodexMini -NodePath "C:\Program Files\nodejs\node.exe"
```

构建后打开输出目录里的 `ChatGPT Win.exe`。客户端会自动启动本机服务，并在界面里显示手机可访问的局域网入口。

构建完整 Windows 安装包：

```powershell
.\scripts\build-codex-max-windows-installer.ps1
```

安装器默认内置 .NET Desktop Runtime，目标电脑无需再安装 .NET。只有开发调试时才使用 `-FrameworkDependent` 构建依赖系统运行时的精简包。安装器使用 Inno Setup 6 编译，输出到 `dist\windows\installer\ChatGPT-Win-Windows-Setup.exe`。安装后会创建开始菜单入口，可选创建桌面快捷方式，并在安装完成后启动 `ChatGPT Win.exe`。

开发调试时也可以直接运行服务：

```powershell
npm install
$env:MOBILE_TYPER_TOKEN = "your-token"
node server.js
```

然后把终端里打印的局域网地址复制到手机浏览器打开。手机和 Windows 电脑需要在同一个 Wi-Fi / 局域网；Codex Desktop 需要已安装、已登录，并且能在当前 Windows 桌面会话里通过 `codex://` 拉起。

Windows 当前限制：

- 纯文本发送、新建项目线程、停止响应和推理模式切换优先走 CDP，可在 Codex 窗口后台完成。
- 图片附件、模型切换、归档、置顶、重命名等操作暂时仍会回退到 GUI/剪贴板路径。
- 如果 Codex 不是用 `--remote-debugging-port` 启动，手机端顶部会显示 `GUI`，表示当前处于前台自动化回退模式；显示 `CDP` 时才是无感控制。
- 不支持锁屏后操作、UAC 弹窗处理或管理员认证处理；这些系统级界面不在 CDP 渲染层内。
- `/send` 串行进入控制队列。CDP 纯文本发送不使用系统剪贴板；GUI 回退和图片附件仍会临时写入 Windows 剪贴板，发送期间请避免手动改剪贴板。
- Windows 自动化层会启动一个隐藏的常驻 helper，避免每个 GUI 动作都重新启动 PowerShell；keep-awake 仍使用独立保持亮屏进程。
- keep-awake 使用 Windows `SetThreadExecutionState`，服务退出或关闭 keep-awake 后会停止保持亮屏。

<p>
  <img src="assets/install/add-to-home-step-2.jpg" alt="第 1 步：点击分享" width="220" />
  <img src="assets/install/add-to-home-step-3.jpg" alt="第 2 步：点击查看更多" width="220" />
  <img src="assets/install/add-to-home-step-1.jpg" alt="第 3 步：添加到主屏幕" width="220" />
</p>

## 当前版本实现原理

本项目最初基于手机到 Mac 上 Codex Desktop 的轻量桥接流程，后续扩展为 Windows 版 ChatGPT Win：

1. Mac 上运行一个本地服务，默认由上游 `Codex Mini.app` 管理
2. 手机网页把文字或图片发送到这台 Mac
3. 本地服务读取 Codex Desktop 的会话状态，并通过 macOS 自动化把内容粘贴到当前 Codex 线程里
4. 本地服务继续读取 Codex 会话日志，把可见回复、运行状态、工具调用过程等同步回手机网页
5. 在同一个 Wi‑Fi 下，手机优先直连局域网入口，速度更快
6. 开启 Pro 后，手机也可以走服务器中转入口；当你在外面、不在同一个局域网时，仍然可以连接自己的 Mac 并远程操控 Codex

也就是说，ChatGPT Win 本身不是云端聊天服务。服务器中转只负责把手机请求转回你自己的电脑，真正的 ChatGPT / Codex 登录状态、线程切换、输入和回复读取仍然发生在你的电脑上。

## 本地免费与 Pro 会员

- 本地局域网功能永久免费：手机和 Mac 在同一个 Wi‑Fi / 局域网下即可使用
- Pro 会员解锁外网入口：通过服务器中转连接自己的 Mac，不在同一个 Wi‑Fi 下也可以使用
- 当前支持 7 天免费试用、月度、季度和年度计划
- Pro 激活后请重新复制新的外网入口到手机上；旧的局域网入口只适合同一网络下使用

## 服务器中转与隐私

- 服务器中转只做连接转发，不代替你的 Codex 账号，也不保存聊天正文或图片内容
- 请不要把自己的访问链接、令牌或电脑隐私信息发给陌生人
- 为了保持服务稳定，图片大小、图片频率和套餐流量会有合理限制

## 注意事项

- 请确保 Mac 上已经安装并登录 Codex Desktop
- 请保持 Codex Desktop 可正常使用
- 请不要把自己的访问链接、令牌或电脑隐私信息发给陌生人
- 当前是 Beta 版本，可能存在兼容性问题，欢迎进群反馈

## 源码说明

本仓库提供 ChatGPT Win 的开源维护版本，适合希望自行部署、接入自己的服务器或进行二次开发的用户。

如果你更希望开箱即用，或者想优先体验最新功能，建议直接下载 Releases 中的 DMG 构建版。构建版会持续维护，部分新功能可能会先在构建版中发布，再逐步同步到开源版本。
