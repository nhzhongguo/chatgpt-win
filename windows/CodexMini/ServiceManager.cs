using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Net.NetworkInformation;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Windows.Forms;

namespace CodexMiniWin;

internal enum ServiceState
{
    NotInstalled,
    Running,
    Stopped,
    Unknown
}

internal sealed record ServiceSnapshot(
    ServiceState State,
    bool HealthOk,
    int Port,
    int? Pid,
    int? ThreadCount,
    string LatestThreadTitle,
    string ControlMode,
    string LogPreview,
    DateTime LastUpdated
);

internal sealed record HealthSnapshot(
    bool Ok,
    string ControlMode
);

internal sealed record CdpLaunchSnapshot(
    bool Ok,
    string Message
);

internal sealed class ServiceManager
{
    private const string DisplayName = "ChatGPT Win";
    private const string AppDataName = "ChatGPT Win";
    private const string LegacyAppDataName = "Codex Max";
    private const int DefaultPort = 8787;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true
    };

    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly string appDataDir;
    private readonly string legacyAppDataDir;
    private readonly string logsDir;
    private readonly string installDir;
    private readonly string configPath;
    private readonly string stdoutPath;
    private readonly string stderrPath;
    private readonly string embeddedProjectDir;
    private readonly string sourceProjectDir;
    private readonly string embeddedNodePath;
    private readonly string appDataNodePath;

    public ServiceManager()
    {
        appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), AppDataName);
        legacyAppDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), LegacyAppDataName);
        logsDir = Path.Combine(appDataDir, "logs");
        installDir = Path.Combine(appDataDir, "service");
        configPath = Path.Combine(appDataDir, "launcher.json");
        stdoutPath = Path.Combine(logsDir, "service.out.log");
        stderrPath = Path.Combine(logsDir, "service.err.log");
        embeddedProjectDir = Path.Combine(AppContext.BaseDirectory, "Resources", "CodexMaxProject");
        sourceProjectDir = FindSourceProjectDir(AppContext.BaseDirectory);
        embeddedNodePath = Path.Combine(AppContext.BaseDirectory, "Resources", "node", "node.exe");
        appDataNodePath = Path.Combine(appDataDir, "node", "node.exe");
    }

    public string ShortInstallDirectory => installDir;
    public string LogsDirectory => logsDir;
    public string AndroidApkPath => ResolveAndroidApkPath();
    public string WindowsInstallerPath => ResolveWindowsInstallerPath();

    public async Task PrepareIfNeededAsync()
    {
        MigrateLegacyStateIfNeeded();
        Directory.CreateDirectory(appDataDir);
        Directory.CreateDirectory(logsDir);
        var config = ReadConfig();
        WriteConfig(config);
        if (Directory.Exists(embeddedProjectDir) && File.Exists(Path.Combine(embeddedProjectDir, "server.js")))
        {
            CopyDirectory(embeddedProjectDir, installDir);
        }
        else
        {
            ExtractEmbeddedPayloadIfNeeded();
        }
        await Task.CompletedTask;
    }

    public async Task<ServiceSnapshot> RefreshAsync()
    {
        var config = ReadConfig();
        var state = ResolveState(config);
        var health = await GetHealthAsync(config);
        var (threadCount, latestThreadTitle) = health.Ok
            ? await RefreshThreadsAsync(config)
            : (null, "尚未读取线程");
        return new ServiceSnapshot(
            health.Ok ? ServiceState.Running : state,
            health.Ok,
            config.Port,
            ResolvePid(config),
            threadCount,
            latestThreadTitle,
            health.ControlMode,
            ReadLogPreview(),
            DateTime.Now
        );
    }

    public async Task StartAsync()
    {
        await PrepareIfNeededAsync();
        var config = ReadConfig();
        var projectDir = ResolveServiceProjectDir();
        var serverPath = Path.Combine(projectDir, "server.js");
        var serviceStamp = ComputeServiceStamp(projectDir);
        var healthOk = await CheckHealthAsync(config);
        if (healthOk && !string.IsNullOrWhiteSpace(config.ServiceStamp) && config.ServiceStamp == serviceStamp && !ServiceProcessNeedsRestart(config.Pid, serverPath)) return;

        var existingPid = FindPortOwnerPid(config.Port);
        if (existingPid > 0)
        {
            if (existingPid != config.Pid || !IsManagedServiceProcess(existingPid))
            {
                throw new InvalidOperationException(
                    $"端口 {config.Port} 已被其他程序占用（PID {existingPid}）。" +
                    $"为避免结束不是本管理端启动的进程，{DisplayName} 已取消启动。"
                );
            }

            await KillProcessTreeAsync(existingPid);
            await Task.Delay(500);
        }

        if (!File.Exists(serverPath))
        {
            throw new InvalidOperationException("没有找到内嵌服务文件 server.js。");
        }

        var nodePath = ResolveNodePath();
        var start = new ProcessStartInfo(nodePath)
        {
            WorkingDirectory = projectDir,
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        start.ArgumentList.Add("server.js");
        start.Environment["MOBILE_TYPER_TOKEN"] = config.Token;
        start.Environment["PORT"] = config.Port.ToString();
        start.Environment["CODEX_MAX_APP_NAME"] = DisplayName;
        start.Environment["CODEX_MAX_STATE_DIR"] = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".codex-max");

        var process = Process.Start(start) ?? throw new InvalidOperationException($"启动 {DisplayName} 服务失败。");
        _ = Task.Run(() => AppendProcessOutputAsync(process.StandardOutput, stdoutPath));
        _ = Task.Run(() => AppendProcessOutputAsync(process.StandardError, stderrPath));
        config.Pid = process.Id;
        config.ServiceStamp = serviceStamp;
        WriteConfig(config);

        for (var i = 0; i < 24; i++)
        {
            await Task.Delay(250);
            if (await CheckHealthAsync(config)) return;
        }

        throw new InvalidOperationException($"{DisplayName} 服务启动后没有通过健康检查。" + Environment.NewLine + ReadTail(stderrPath, 1200));
    }

    public async Task StopAsync()
    {
        var config = ReadConfig();
        if (config.Pid > 0 && IsManagedServiceProcess(config.Pid))
        {
            await KillProcessTreeAsync(config.Pid);
        }

        config.Pid = 0;
        config.ServiceStamp = "";
        WriteConfig(config);
        await Task.Delay(350);
    }

    public async Task RestartAsync()
    {
        await StopAsync();
        await Task.Delay(350);
        await StartAsync();
    }

    public async Task<CdpLaunchSnapshot> LaunchControlledCodexAsync()
    {
        var config = ReadConfig();
        if (!await CheckHealthAsync(config)) await StartAsync();
        config = ReadConfig();
        using var launchHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(35) };
        using var response = await launchHttp.PostAsJsonAsync(
            $"http://127.0.0.1:{config.Port}/codex/cdp-launch?token={Uri.EscapeDataString(config.Token)}",
            new { forceRestart = true },
            JsonOptions
        );
        var result = await response.Content.ReadFromJsonAsync<CdpLaunchResponse>(JsonOptions);
        if (!response.IsSuccessStatusCode || result?.Ok != true)
        {
            throw new InvalidOperationException(result?.Message ?? "启动 CDP 受控 ChatGPT 失败。");
        }
        return new CdpLaunchSnapshot(true, result.Message ?? "已启动 CDP 受控 ChatGPT");
    }

    public async Task OpenWebAsync()
    {
        if (!await CheckHealthAsync(ReadConfig())) await StartAsync();
        Process.Start(new ProcessStartInfo(PrimaryEntryUrl()) { UseShellExecute = true });
    }

    public async Task CopyLocalLinkAsync()
    {
        if (!await CheckHealthAsync(ReadConfig())) await StartAsync();
        Clipboard.SetText(PrimaryEntryUrl());
    }

    public void OpenLogs()
    {
        Directory.CreateDirectory(logsDir);
        Process.Start(new ProcessStartInfo(logsDir) { UseShellExecute = true });
    }

    private void MigrateLegacyStateIfNeeded()
    {
        if (File.Exists(configPath)) return;
        var legacyConfigPath = Path.Combine(legacyAppDataDir, "launcher.json");
        if (!File.Exists(legacyConfigPath)) return;
        Directory.CreateDirectory(appDataDir);
        File.Copy(legacyConfigPath, configPath, overwrite: false);
    }

    public void OpenAndroidApkLocation()
    {
        OpenArtifactLocation(AndroidApkPath, "没有找到 Android APK。请先构建 Android App。");
    }

    public void OpenWindowsInstallerLocation()
    {
        OpenArtifactLocation(WindowsInstallerPath, "没有找到 Windows 安装包。请先构建 Windows 安装包。");
    }

    public string PrimaryEntryUrl()
    {
        var urls = EntryUrls().ToList();
        return urls.Count > 1 ? urls[1] : urls[0];
    }

    public IEnumerable<string> EntryUrls()
    {
        var config = ReadConfig();
        var token = Uri.EscapeDataString(config.Token);
        yield return $"http://localhost:{config.Port}/?token={token}";
        foreach (var address in LanAddresses())
        {
            yield return $"http://{address}:{config.Port}/?token={token}";
        }
    }

    private async Task<bool> CheckHealthAsync(LauncherConfig config)
    {
        return (await GetHealthAsync(config)).Ok;
    }

    public async Task<string?> CheckForUpdateAsync()
    {
        var config = ReadConfig();
        try
        {
            var url = $"http://127.0.0.1:{config.Port}/codex/config?token={Uri.EscapeDataString(config.Token)}";
            using var response = await http.GetAsync(url);
            if (!response.IsSuccessStatusCode) return null;
            var payload = await response.Content.ReadFromJsonAsync<ClientConfigResponse>(JsonOptions);
            var update = payload?.Update;
            if (update is null) return null;

            var lines = new List<string>();
            var currentVersion = typeof(ServiceManager).Assembly.GetName().Version?.ToString(3) ?? "3.1.1";
            if (update.Windows is { Available: true } windows &&
                TryParseVersion(windows.LatestVersion, out var latestWindows) &&
                TryParseVersion(currentVersion, out var current) &&
                latestWindows > current)
            {
                lines.Add($"电脑版新版本 v{windows.LatestVersion} 可下载安装。");
            }

            if (update.Android is { Available: true } android && !string.IsNullOrWhiteSpace(android.LatestVersion))
            {
                var localApk = AndroidApkPath;
                var localVersion = localApk != null && File.Exists(localApk)
                    ? Path.GetFileNameWithoutExtension(localApk)
                    : "";
                if (localVersion.IndexOf(android.LatestVersion, StringComparison.OrdinalIgnoreCase) < 0)
                {
                    lines.Add($"Android 客户端最新版本 v{android.LatestVersion}。");
                }
            }

            return lines.Count == 0 ? null : string.Join(Environment.NewLine, lines);
        }
        catch
        {
            return null;
        }
    }

    private static bool TryParseVersion(string? text, out Version version)
    {
        version = new Version();
        return !string.IsNullOrWhiteSpace(text) && Version.TryParse(text.TrimStart('v'), out version);
    }

    private async Task<HealthSnapshot> GetHealthAsync(LauncherConfig config)
    {
        try
        {
            using var response = await http.GetAsync($"http://127.0.0.1:{config.Port}/codex/health?token={Uri.EscapeDataString(config.Token)}");
            if (!response.IsSuccessStatusCode) return new HealthSnapshot(false, "");
            var health = await response.Content.ReadFromJsonAsync<HealthResponse>(JsonOptions);
            return new HealthSnapshot(health?.Ok == true, health?.ControlMode ?? "");
        }
        catch
        {
            return new HealthSnapshot(false, "");
        }
    }

    private async Task<(int? Count, string LatestTitle)> RefreshThreadsAsync(LauncherConfig config)
    {
        try
        {
            var url = $"http://127.0.0.1:{config.Port}/codex/threads?limit=20&token={Uri.EscapeDataString(config.Token)}";
            var summary = await http.GetFromJsonAsync<ThreadSummary>(url);
            var rows = summary?.Threads ?? new List<ThreadRow>();
            var title = rows.FirstOrDefault()?.Title ?? rows.FirstOrDefault()?.Name ?? "暂无线程";
            return (rows.Count, title);
        }
        catch
        {
            return (null, "尚未读取线程");
        }
    }

    private LauncherConfig ReadConfig()
    {
        try
        {
            if (File.Exists(configPath))
            {
                var loaded = JsonSerializer.Deserialize<LauncherConfig>(File.ReadAllText(configPath), JsonOptions);
                if (loaded is not null && !string.IsNullOrWhiteSpace(loaded.Token))
                {
                    if (loaded.Port <= 0) loaded.Port = DefaultPort;
                    return loaded;
                }
            }
        }
        catch
        {
        }
        var persistedToken = ReadPersistedToken();
        if (!string.IsNullOrWhiteSpace(persistedToken))
        {
            var config = new LauncherConfig { Token = persistedToken, Port = DefaultPort };
            WriteConfig(config);
            return config;
        }
        return new LauncherConfig { Token = GenerateToken(), Port = DefaultPort };
    }

    private void WriteConfig(LauncherConfig config)
    {
        Directory.CreateDirectory(appDataDir);
        File.WriteAllText(configPath, JsonSerializer.Serialize(config, JsonOptions), new UTF8Encoding(false));
    }

    private ServiceState ResolveState(LauncherConfig config)
    {
        if (!File.Exists(Path.Combine(ResolveServiceProjectDir(), "server.js"))) return ServiceState.NotInstalled;
        var pid = ResolvePid(config);
        return pid.HasValue ? ServiceState.Running : ServiceState.Stopped;
    }

    private int? ResolvePid(LauncherConfig config)
    {
        var portPid = FindPortOwnerPid(config.Port);
        if (portPid > 0) return portPid;
        if (config.Pid > 0)
        {
            try
            {
                using var process = Process.GetProcessById(config.Pid);
                if (!process.HasExited) return config.Pid;
            }
            catch
            {
            }
        }
        return null;
    }

    private string ResolveServiceProjectDir()
    {
        if (Directory.Exists(installDir) && File.Exists(Path.Combine(installDir, "server.js"))) return installDir;
        if (Directory.Exists(embeddedProjectDir) && File.Exists(Path.Combine(embeddedProjectDir, "server.js"))) return embeddedProjectDir;
        return sourceProjectDir;
    }

    private static string ComputeServiceStamp(string projectDir)
    {
        try
        {
            using var sha = SHA256.Create();
            foreach (var relativePath in new[] {
                "server.js",
                Path.Combine("public", "index.html"),
                Path.Combine("src", "platform", "win32.js"),
                Path.Combine("src", "platform", "index.js")
            })
            {
                var file = Path.Combine(projectDir, relativePath);
                if (!File.Exists(file)) continue;
                sha.TransformBlock(Encoding.UTF8.GetBytes(relativePath), 0, Encoding.UTF8.GetByteCount(relativePath), null, 0);
                var bytes = File.ReadAllBytes(file);
                sha.TransformBlock(bytes, 0, bytes.Length, null, 0);
            }
            sha.TransformFinalBlock(Array.Empty<byte>(), 0, 0);
            return Convert.ToHexString(sha.Hash ?? Array.Empty<byte>());
        }
        catch
        {
            return "";
        }
    }

    private string ResolveNodePath()
    {
        if (File.Exists(appDataNodePath)) return appDataNodePath;
        if (File.Exists(embeddedNodePath)) return embeddedNodePath;
        var pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
        foreach (var dir in pathEnv.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            var candidate = Path.Combine(dir.Trim(), "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        throw new InvalidOperationException("没有找到 Node.js。请安装 Node.js 18+，或在 App 资源中内置 node.exe。");
    }

    private string ResolveWindowsInstallerPath()
    {
        var sourceCandidate = Path.Combine(sourceProjectDir, "dist", "windows", "installer", "ChatGPT-Win-Windows-Setup.exe");
        if (File.Exists(sourceCandidate)) return sourceCandidate;
        var baseCandidate = Path.Combine(AppContext.BaseDirectory, "dist", "windows", "installer", "ChatGPT-Win-Windows-Setup.exe");
        if (File.Exists(baseCandidate)) return baseCandidate;
        return sourceCandidate;
    }

    private string ResolveAndroidApkPath()
    {
        var releaseCandidate = Path.Combine(sourceProjectDir, "dist", "android", "ChatGPT-AZ-Android-v1.2.0.apk");
        if (File.Exists(releaseCandidate)) return releaseCandidate;
        var releaseBuildCandidate = Path.Combine("C:\\", "CodexBuild", "AndroidOutput", "outputs", "apk", "release", "app-release.apk");
        if (File.Exists(releaseBuildCandidate)) return releaseBuildCandidate;
        var debugCandidate = Path.Combine("C:\\", "CodexBuild", "AndroidOutput", "outputs", "apk", "debug", "app-debug.apk");
        if (File.Exists(debugCandidate)) return debugCandidate;
        return releaseCandidate;
    }

    private static void OpenArtifactLocation(string file, string missingMessage)
    {
        if (File.Exists(file))
        {
            var start = new ProcessStartInfo("explorer.exe")
            {
                UseShellExecute = true,
                ArgumentList = { $"/select,{file}" }
            };
            Process.Start(start);
            return;
        }

        var directory = Path.GetDirectoryName(file);
        if (!string.IsNullOrWhiteSpace(directory) && Directory.Exists(directory))
        {
            Process.Start(new ProcessStartInfo(directory) { UseShellExecute = true });
            throw new InvalidOperationException($"{missingMessage}{Environment.NewLine}已打开目录：{directory}");
        }

        throw new InvalidOperationException($"{missingMessage}{Environment.NewLine}{file}");
    }

    private bool ExtractEmbeddedPayloadIfNeeded()
    {
        var assembly = typeof(ServiceManager).Assembly;
        var resourceName = assembly.GetManifestResourceNames()
            .FirstOrDefault(name => name.EndsWith("CodexMaxPayload.zip", StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrWhiteSpace(resourceName)) return false;
        using var stream = assembly.GetManifestResourceStream(resourceName);
        if (stream is null) return false;

        using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
        foreach (var entry in archive.Entries)
        {
            if (string.IsNullOrWhiteSpace(entry.Name)) continue;
            var relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
            if (relative.Equals(Path.Combine("node", "node.exe"), StringComparison.OrdinalIgnoreCase) &&
                File.Exists(appDataNodePath))
            {
                continue;
            }
            var target = Path.GetFullPath(Path.Combine(appDataDir, relative));
            var appDataRoot = Path.GetFullPath(appDataDir);
            if (!target.StartsWith(appDataRoot, StringComparison.OrdinalIgnoreCase)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            entry.ExtractToFile(target, overwrite: true);
        }
        return true;
    }

    private string ReadLogPreview()
    {
        foreach (var file in new[] { stderrPath, stdoutPath })
        {
            var text = ReadTail(file, 1200).Trim();
            if (!string.IsNullOrWhiteSpace(text)) return text;
        }
        return "";
    }

    private static string ReadTail(string file, int maxChars)
    {
        try
        {
            if (!File.Exists(file)) return "";
            var text = File.ReadAllText(file);
            return text.Length <= maxChars ? text : text[^maxChars..];
        }
        catch
        {
            return "";
        }
    }

    private static string ReadPersistedToken()
    {
        try
        {
            var tokenFile = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".codex-max",
                "token");
            if (!File.Exists(tokenFile)) return "";
            var token = File.ReadAllText(tokenFile).Trim();
            return token.Length >= 16 && token.Length <= 64 ? token : "";
        }
        catch
        {
            return "";
        }
    }

    private static string GenerateToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(18);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    private static string FindSourceProjectDir(string start)
    {
        var current = new DirectoryInfo(start);
        while (current is not null)
        {
            if (File.Exists(Path.Combine(current.FullName, "server.js")) &&
                Directory.Exists(Path.Combine(current.FullName, "public")))
            {
                return current.FullName;
            }
            current = current.Parent;
        }
        return start;
    }

    private static IEnumerable<string> LanAddresses()
    {
        var rows = NetworkInterface.GetAllNetworkInterfaces()
            .Where(item => item.OperationalStatus == OperationalStatus.Up)
            .SelectMany(item => item.GetIPProperties().UnicastAddresses)
            .Where(item => item.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)
            .Select(item => item.Address)
            .Where(IsUsableLanAddress)
            .Select(address => address.ToString())
            .Distinct()
            .ToList();

        return rows
            .OrderBy(address => LanAddressPriority(address))
            .ThenBy(address => address, StringComparer.Ordinal);
    }

    private static bool IsUsableLanAddress(IPAddress address)
    {
        if (IPAddress.IsLoopback(address)) return false;
        var bytes = address.GetAddressBytes();
        if (bytes.Length != 4) return false;
        if (bytes[0] == 169 && bytes[1] == 254) return false;
        if (bytes[0] == 198 && (bytes[1] == 18 || bytes[1] == 19)) return false;
        if (bytes[0] == 100 && bytes[1] >= 64 && bytes[1] <= 127) return false;
        if (bytes[0] == 172 && bytes[1] >= 16 && bytes[1] <= 31) return true;
        if (bytes[0] == 192 && bytes[1] == 168) return true;
        if (bytes[0] == 10) return true;
        return false;
    }

    private static int LanAddressPriority(string address)
    {
        if (address.StartsWith("192.168.", StringComparison.Ordinal)) return 0;
        if (address.StartsWith("10.", StringComparison.Ordinal)) return 1;
        if (address.StartsWith("172.", StringComparison.Ordinal)) return 2;
        return 9;
    }

    private static int FindPortOwnerPid(int port)
    {
        try
        {
            var start = new ProcessStartInfo("netstat.exe", "-ano -p tcp")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using var process = Process.Start(start);
            if (process is null) return 0;
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(2500);
            foreach (var line in output.Split('\n'))
            {
                var parts = line.Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5) continue;
                if (!parts[0].Equals("TCP", StringComparison.OrdinalIgnoreCase)) continue;
                if (!parts[1].EndsWith($":{port}", StringComparison.Ordinal)) continue;
                if (!parts[3].Equals("LISTENING", StringComparison.OrdinalIgnoreCase)) continue;
                if (int.TryParse(parts[4], out var pid)) return pid;
            }
        }
        catch
        {
        }
        return 0;
    }

    private static bool IsManagedServiceProcess(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            var name = process.ProcessName;
            if (!name.Equals("node", StringComparison.OrdinalIgnoreCase)) return false;
            var commandLine = GetProcessCommandLine(pid);
            if (commandLine.Contains("server.js", StringComparison.OrdinalIgnoreCase)) return true;
            if (commandLine.Contains("CodexMaxProject", StringComparison.OrdinalIgnoreCase)) return true;
            if (commandLine.Contains("ChatGPT Win", StringComparison.OrdinalIgnoreCase)) return true;
            if (commandLine.Contains("Codex Max", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
        catch
        {
            return false;
        }
    }

    private static bool ServiceProcessNeedsRestart(int pid, string serverPath)
    {
        if (pid <= 0 || !File.Exists(serverPath)) return false;
        try
        {
            using var process = Process.GetProcessById(pid);
            return !process.HasExited && File.GetLastWriteTimeUtc(serverPath) > process.StartTime.ToUniversalTime();
        }
        catch
        {
            return false;
        }
    }

    private static async Task KillProcessTreeAsync(int pid)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            if (process.HasExited) return;
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
        }
        catch
        {
        }
    }

    private static async Task AppendProcessOutputAsync(StreamReader reader, string file)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            await using var stream = new FileStream(file, FileMode.Append, FileAccess.Write, FileShare.ReadWrite);
            await using var writer = new StreamWriter(stream, new UTF8Encoding(false));
            while (!reader.EndOfStream)
            {
                var line = await reader.ReadLineAsync();
                if (line is null) break;
                await writer.WriteLineAsync(line);
                await writer.FlushAsync();
            }
        }
        catch
        {
        }
    }

    private static string GetProcessCommandLine(int pid)
    {
        try
        {
            var escaped = $"ProcessId = {pid}";
            var start = new ProcessStartInfo("powershell.exe",
                $"-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command \"(Get-CimInstance Win32_Process -Filter '{escaped}').CommandLine\"")
            {
                CreateNoWindow = true,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true
            };
            using var process = Process.Start(start);
            if (process is null) return "";
            var output = process.StandardOutput.ReadToEnd();
            process.WaitForExit(2500);
            return output.Trim();
        }
        catch
        {
            return "";
        }
    }

    private static void CopyDirectory(string sourceDir, string targetDir)
    {
        Directory.CreateDirectory(targetDir);
        foreach (var directory in Directory.EnumerateDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            Directory.CreateDirectory(Path.Combine(targetDir, Path.GetRelativePath(sourceDir, directory)));
        }
        foreach (var file in Directory.EnumerateFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var target = Path.Combine(targetDir, Path.GetRelativePath(sourceDir, file));
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Copy(file, target, overwrite: true);
        }
    }

    private sealed class ClientConfigResponse
    {
        [JsonPropertyName("update")]
        public UpdateInfo? Update { get; set; }
    }

    private sealed class UpdateInfo
    {
        [JsonPropertyName("service")]
        public string? Service { get; set; }

        [JsonPropertyName("android")]
        public PlatformUpdate? Android { get; set; }

        [JsonPropertyName("windows")]
        public PlatformUpdate? Windows { get; set; }
    }

    private sealed class PlatformUpdate
    {
        [JsonPropertyName("available")]
        public bool Available { get; set; }

        [JsonPropertyName("latestVersion")]
        public string? LatestVersion { get; set; }

        [JsonPropertyName("fileName")]
        public string? FileName { get; set; }
    }

    private sealed class LauncherConfig
    {
        public string Token { get; set; } = "";
        public int Port { get; set; } = DefaultPort;
        public int Pid { get; set; }
        public string ServiceStamp { get; set; } = "";
    }

    private sealed class ThreadSummary
    {
        [JsonPropertyName("threads")]
        public List<ThreadRow> Threads { get; set; } = new();
    }

    private sealed class ThreadRow
    {
        [JsonPropertyName("title")]
        public string? Title { get; set; }

        [JsonPropertyName("name")]
        public string? Name { get; set; }
    }

    private sealed class HealthResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("controlMode")]
        public string? ControlMode { get; set; }
    }

    private sealed class CdpLaunchResponse
    {
        [JsonPropertyName("ok")]
        public bool Ok { get; set; }

        [JsonPropertyName("message")]
        public string? Message { get; set; }
    }
}
