// Built with the Windows .NET Framework compiler. No installed Node or Git required.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("HLL Broadcast")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

internal sealed class Options
{
    public string Home = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "HLL-Broadcast");
    public int Port = 4610;
    public bool Social, NoBrowser, NoShortcuts, Smoke;
    public static Options Parse(string[] args)
    {
        Options o = new Options();
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--social": o.Social = true; break;
                case "--home": o.Home = Path.GetFullPath(args[++i]); break;
                case "--port": o.Port = Int32.Parse(args[++i]); break;
                case "--no-browser": o.NoBrowser = true; break;
                case "--no-shortcuts": o.NoShortcuts = true; break;
                case "--smoke-test": o.Smoke = o.NoBrowser = o.NoShortcuts = true; break;
                default: throw new Exception("Unknown option: " + args[i]);
            }
        }
        if (o.Port < 1 || o.Port > 65535) throw new Exception("Choose a port between 1 and 65535.");
        if (o.Smoke && o.Port == 4610) throw new Exception("Smoke tests must use a separate port.");
        return o;
    }
}

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        try { Application.Run(new Launcher(Options.Parse(args))); }
        catch (Exception e) { MessageBox.Show(e.Message, "HLL Broadcast", MessageBoxButtons.OK, MessageBoxIcon.Error); Environment.ExitCode = 1; }
    }
}

internal sealed class Launcher : Form
{
    const string Repo = "https://api.github.com/repos/drogopoylos-stack/STREAMGRAPHICS/commits/main";
    const string NodeBase = "https://nodejs.org/dist/latest-v24.x/";
    readonly Options options;
    readonly Label step = new Label();
    readonly ProgressBar progress = new ProgressBar();
    readonly object logLock = new object();
    readonly string home, app;
    NotifyIcon tray;
    Process server;
    StreamWriter serverLog;
    FileStream installLock;
    bool busy, quitting;
    string notice;
    readonly System.Windows.Forms.Timer monitor = new System.Windows.Forms.Timer();

    public Launcher(Options o)
    {
        options = o; home = o.Home; app = Path.Combine(home, "app");
        Text = "HLL Broadcast"; ClientSize = new Size(450, 145);
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = MinimizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10); BackColor = Color.FromArgb(18,18,19); ForeColor = Color.FromArgb(237,237,238);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        step.SetBounds(24, 26, 402, 46); step.Text = "Preparing HLL Broadcast...";
        progress.SetBounds(24, 89, 402, 18); progress.Style = ProgressBarStyle.Marquee;
        Controls.Add(step); Controls.Add(progress);
        Shown += async delegate { await Launch(false); };
        FormClosing += delegate(object sender, FormClosingEventArgs e) {
            if (!quitting && busy) { e.Cancel = true; return; }
            if (!quitting && OwnsServer()) { e.Cancel = true; Hide(); }
        };
        monitor.Interval = 2000;
        monitor.Tick += delegate {
            if (!busy && server != null && server.HasExited) {
                monitor.Stop();
                if (tray != null) tray.Visible = false;
                MessageBox.Show("The HLL server stopped. Open the shortcut to try again.\n\n" + Tail(Path.Combine(app,"server.log")), Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Quit();
            }
        };
    }

    void Status(string message, int percent)
    {
        if (IsDisposed) return;
        BeginInvoke((Action)delegate {
            step.Text = message;
            progress.Style = percent < 0 ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous;
            if (percent >= 0) progress.Value = Math.Max(0, Math.Min(100, percent));
        });
    }

    void Log(string message)
    {
        try { lock (logLock) File.AppendAllText(Path.Combine(home,"launcher.log"), DateTime.UtcNow.ToString("o") + " " + message + Environment.NewLine); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    async Task Launch(bool manual)
    {
        if (busy) return;
        busy = true; Show(); notice = null;
        try
        {
            await Task.Run((Action)delegate {
                Directory.CreateDirectory(home);
                // Serializes installations and startup, including separate editions and test homes.
                DateTime deadline = DateTime.UtcNow.AddMinutes(15);
                while (installLock == null) {
                    try { installLock = new FileStream(Path.Combine(home,"launcher.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None); }
                    catch (IOException) {
                        Status("Another HLL window is installing. Waiting...", -1);
                        if (DateTime.UtcNow > deadline) throw new Exception("Another HLL installer is still busy. Wait for it to finish and try again.");
                        Thread.Sleep(500);
                    }
                }
                try {
                    using (var portGuard = new Mutex(false,"Local\\HLL-Broadcast-Port-" + options.Port)) {
                        bool held = false;
                        try {
                            try { held = portGuard.WaitOne(TimeSpan.FromMinutes(15)); } catch (AbandonedMutexException) { held = true; }
                            if (!held) throw new Exception("Another HLL installer is busy on this port. Please try again later.");
                            PrepareAndStart(manual);
                        } finally { if (held) portGuard.ReleaseMutex(); }
                    }
                }
                finally { installLock.Dispose(); installLock = null; }
            });
            if (!options.NoShortcuts) MakeShortcuts();
            if (options.Smoke) {
                File.WriteAllText(Path.Combine(home,"smoke-result.json"), new JavaScriptSerializer().Serialize(new { ok = true, port = options.Port, sha = InstalledSha(), ownedServer = OwnsServer(), notice = notice }));
                Quit(); return;
            }
            if (!options.NoBrowser && !manual) OpenPanel(options.Social);
            if (OwnsServer()) { EnsureTray(); monitor.Start(); Hide(); }
            else { quitting = true; Close(); }
            if (notice != null) MessageBox.Show(notice, Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception e)
        {
            Log(e.ToString());
            Environment.ExitCode = 1;
            string message = e.Message + "\n\nDetails: " + Path.Combine(home,"launcher.log");
            if (options.Smoke) {
                File.WriteAllText(Path.Combine(home,"smoke-result.json"), new JavaScriptSerializer().Serialize(new { ok = false, error = e.ToString() }));
                Quit();
            } else {
                MessageBox.Show(message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
                if (OwnsServer()) { EnsureTray(); monitor.Start(); Hide(); } else { quitting = true; Close(); }
            }
        }
        finally { busy = false; }
    }

    void PrepareAndStart(bool manual)
    {
        Status("Checking for updates...", -1);
        bool external = Healthy() && !OwnsServer();
        if (!external) RecoverUpdate();
        string sha = null;
        try { sha = LatestSha(); }
        catch (Exception e) {
            Log("Update check unavailable: " + e.Message);
            if (!File.Exists(Path.Combine(app,"server","index.js"))) throw new Exception("The program could not be downloaded. Connect to the internet and open HLL Broadcast again.", e);
            notice = manual ? "Could not check for updates. The installed version is running." : null;
        }
        if (external) {
            if (sha != null && sha != InstalledSha()) notice = "HLL is already running in another process. Quit that HLL server, then open this shortcut again to install the update.";
            else if (manual) notice = "HLL is already running. Use its tray icon to check for updates.";
            return;
        }
        try { InstallNode(); }
        catch (Exception e) { throw new Exception("Node could not be installed. Check your internet connection and available disk space, then open HLL Broadcast again.\n\n" + e.Message,e); }
        if (sha != null && (sha != InstalledSha() || !File.Exists(Path.Combine(app,"server","index.js")) || !Directory.Exists(Path.Combine(app,"node_modules")))) {
            try { InstallApp(sha); }
            catch (Exception e) {
                Log("Update failed: " + e);
                RecoverUpdate();
                if (!File.Exists(Path.Combine(app,"server","index.js")) || !Directory.Exists(Path.Combine(app,"node_modules"))) throw;
                notice = "The update could not be installed. Your previous version is running. Try Check for updates from the tray later.\n\n" + e.Message;
            }
        } else if (manual && sha != null) notice = "HLL Broadcast is up to date.";
        StartServer();
    }

    string InstalledSha() { string p = Path.Combine(app,".installed-sha"); return File.Exists(p) ? File.ReadAllText(p).Trim() : ""; }

    static HttpWebRequest Request(string url, int timeout)
    {
        HttpWebRequest r = (HttpWebRequest)WebRequest.Create(url);
        r.UserAgent = "HLL-Broadcast-Launcher/1.0"; r.Timeout = timeout; r.ReadWriteTimeout = timeout;
        r.AutomaticDecompression = DecompressionMethods.GZip | DecompressionMethods.Deflate;
        r.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
        return r;
    }

    static string ReadUrl(string url, int timeout)
    {
        using (WebResponse r = Request(url,timeout).GetResponse())
        using (StreamReader s = new StreamReader(r.GetResponseStream())) return s.ReadToEnd();
    }

    string LatestSha()
    {
        var json = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(ReadUrl(Repo,5000));
        string sha = Convert.ToString(json["sha"]);
        if (!Regex.IsMatch(sha,"^[a-f0-9]{40}$")) throw new Exception("GitHub returned an invalid version.");
        return sha;
    }

    void Download(string url, string target, string label)
    {
        string partial = target + ".part";
        try {
            Status(label,-1);
            using (WebResponse response = Request(url,120000).GetResponse())
            using (Stream input = response.GetResponseStream())
            using (FileStream output = File.Create(partial)) {
                byte[] buffer = new byte[131072]; long count = 0; int n; int last = -2;
                while ((n = input.Read(buffer,0,buffer.Length)) > 0) {
                    output.Write(buffer,0,n); count += n;
                    int p = response.ContentLength > 0 ? (int)(count * 100 / response.ContentLength) : -1;
                    if (p != last) { Status(label,p); last = p; }
                }
            }
            if (File.Exists(target)) File.Delete(target);
            File.Move(partial,target);
        } catch (WebException e) {
            throw new Exception("The download could not finish. Check your internet connection and try again.\n\n" + url,e);
        } finally { if (File.Exists(partial)) File.Delete(partial); }
    }

    static string Hash(string path)
    {
        using (SHA256 s = SHA256.Create())
        using (Stream f = File.OpenRead(path)) return BitConverter.ToString(s.ComputeHash(f)).Replace("-","").ToLowerInvariant();
    }

    void InstallNode()
    {
        string node = Path.Combine(home,"node");
        if (File.Exists(Path.Combine(node,"node.exe")) && File.Exists(Path.Combine(node,"node_modules","npm","bin","npm-cli.js"))) return;
        Status("Downloading Node...",-1);
        string sums = ReadUrl(NodeBase + "SHASUMS256.txt",30000);
        Match m = Regex.Match(sums,@"(?m)^([a-fA-F0-9]{64})\s+(node-v24\.\d+\.\d+-win-x64\.zip)\s*$");
        if (!m.Success) throw new Exception("The official Node download list did not contain Windows x64. Please try again later.");
        string zip = Path.Combine(home,"node.zip");
        Download(NodeBase + m.Groups[2].Value,zip,"Downloading Node...");
        if (Hash(zip) != m.Groups[1].Value.ToLowerInvariant()) { File.Delete(zip); throw new Exception("The Node download did not pass its security checksum. Please try again."); }
        Log("Node checksum verified: " + m.Groups[2].Value + " " + m.Groups[1].Value);
        string stage = Path.Combine(home,"node-stage"); DeleteDirectory(stage);
        Directory.CreateDirectory(stage); ZipFile.ExtractToDirectory(zip,stage);
        DeleteDirectory(node); Directory.Move(Path.Combine(stage,Path.GetFileNameWithoutExtension(m.Groups[2].Value)),node);
        DeleteDirectory(stage); File.Delete(zip);
    }

    static readonly string[] Preserved = { "data", "output", "models" };

    void InstallApp(string sha)
    {
        bool updating = Directory.Exists(app);
        string stage = Path.Combine(home,"app-stage"), extract = Path.Combine(home,"app-extract"), zip = Path.Combine(home,"app.zip");
        DeleteDirectory(stage); DeleteDirectory(extract);
        Download("https://codeload.github.com/drogopoylos-stack/STREAMGRAPHICS/zip/" + sha,zip,updating ? "Updating... Downloading the program..." : "Downloading the program...");
        Directory.CreateDirectory(extract); ZipFile.ExtractToDirectory(zip,extract);
        string[] roots = Directory.GetDirectories(extract);
        if (roots.Length != 1) throw new Exception("The downloaded program archive was not recognized.");
        Directory.Move(roots[0],stage); DeleteDirectory(extract); File.Delete(zip);
        if (!File.Exists(Path.Combine(stage,"server","index.js")) || !File.Exists(Path.Combine(stage,"package-lock.json"))) throw new Exception("The downloaded program is missing required files.");
        // Never import a database or dependencies from the source archive.
        foreach (string dir in Preserved) DeleteDirectory(Path.Combine(stage,dir));
        DeleteDirectory(Path.Combine(stage,"node_modules"));
        bool dependenciesChanged = !File.Exists(Path.Combine(app,"package-lock.json")) || !Directory.Exists(Path.Combine(app,"node_modules")) || Hash(Path.Combine(app,"package-lock.json")) != Hash(Path.Combine(stage,"package-lock.json"));
        // Build new dependencies separately so a failed npm ci leaves the old install usable.
        if (dependenciesChanged) {
            Status(updating ? "Updating... Installing parts... (npm ci)" : "Installing parts... (npm ci)",-1);
            RunNpm(stage);
        } else Log("package-lock.json unchanged; keeping node_modules (npm ci skipped).");
        File.WriteAllText(Path.Combine(stage,".installed-sha"),sha + Environment.NewLine);
        Status("Updating... Saving the installed version...",-1);
        StopServer();
        if (Healthy()) throw new Exception("Another HLL server is using this port. Close it before updating.");
        string previous = Path.Combine(home,"app-previous");
        if (Directory.Exists(previous)) throw new Exception("An earlier update needs recovery. Open the launcher again.");
        if (Directory.Exists(app)) Directory.Move(app,previous);
        Directory.Move(stage,app);
        RecoverUpdate();
        Log("Installed commit " + sha);
    }

    void RecoverUpdate()
    {
        string previous = Path.Combine(home,"app-previous");
        if (!Directory.Exists(previous)) return;
        if (!Directory.Exists(app)) { Directory.Move(previous,app); return; }
        foreach (string dir in new [] { "data", "output", "models", "node_modules" }) {
            string source = Path.Combine(previous,dir), target = Path.Combine(app,dir);
            if (Directory.Exists(source) && !Directory.Exists(target)) Directory.Move(source,target);
        }
        foreach (string file in new [] { "server.log" }) {
            string source = Path.Combine(previous,file), target = Path.Combine(app,file);
            if (File.Exists(source) && !File.Exists(target)) File.Move(source,target);
        }
        DeleteDirectory(previous);
    }

    void RunNpm(string directory)
    {
        var info = NodeInfo(directory,Quote(Path.Combine(home,"node","node_modules","npm","bin","npm-cli.js")) + " ci --omit=dev --no-audit --no-fund");
        info.EnvironmentVariables["npm_config_update_notifier"] = "false";
        info.EnvironmentVariables["npm_config_cache"] = Path.Combine(home,"npm-cache");
        using (Process p = new Process())
        using (StreamWriter log = new StreamWriter(Path.Combine(home,"npm-install.log"),false)) {
            object gate = new object(); log.AutoFlush = true; p.StartInfo = info;
            p.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if(e.Data != null) lock(gate) log.WriteLine(e.Data); };
            p.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if(e.Data != null) lock(gate) log.WriteLine(e.Data); };
            p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine(); p.WaitForExit();
            if (p.ExitCode != 0) throw new Exception("Installing the program parts failed. Check your internet connection and try again.\n\n" + Tail(Path.Combine(home,"npm-install.log")));
        }
    }

    ProcessStartInfo NodeInfo(string cwd, string arguments)
    {
        var info = new ProcessStartInfo(Path.Combine(home,"node","node.exe"), arguments);
        info.WorkingDirectory = cwd; info.UseShellExecute = false; info.CreateNoWindow = true;
        info.RedirectStandardOutput = info.RedirectStandardError = true;
        info.EnvironmentVariables["PATH"] = Path.Combine(home,"node") + ";" + Environment.GetEnvironmentVariable("PATH");
        return info;
    }

    bool Healthy()
    {
        try {
            var json = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(ReadUrl("http://localhost:" + options.Port + "/api/netinfo",750));
            // Express wraps this endpoint in {ok,data}; support its unwrapped form too.
            object data; if (json.TryGetValue("data",out data) && data is Dictionary<string,object>) json = (Dictionary<string,object>)data;
            return json.ContainsKey("port") && Convert.ToInt32(json["port"]) == options.Port && json.ContainsKey("addresses");
        } catch { return false; }
    }

    bool OwnsServer() { return server != null && !server.HasExited; }

    void StartServer()
    {
        Status("Starting...",-1);
        if (Healthy()) return;
        if (server != null) StopServer();
        Directory.CreateDirectory(Path.Combine(app,"data")); Directory.CreateDirectory(Path.Combine(app,"output"));
        serverLog = new StreamWriter(Path.Combine(app,"server.log"),true); serverLog.AutoFlush = true;
        serverLog.WriteLine("\n--- " + DateTime.UtcNow.ToString("o") + " ---");
        server = new Process(); server.StartInfo = NodeInfo(app,"server/index.js");
        server.StartInfo.EnvironmentVariables["PORT"] = options.Port.ToString();
        // Keep this installation independent of a developer's shell settings.
        server.StartInfo.EnvironmentVariables["HLL_DATA_DIR"] = Path.Combine(app,"data");
        server.StartInfo.EnvironmentVariables["HLL_OUTPUT_DIR"] = Path.Combine(app,"output");
        DataReceivedEventHandler handler = delegate(object sender, DataReceivedEventArgs e) { if(e.Data != null) lock(logLock) { if(serverLog != null) serverLog.WriteLine(e.Data); } };
        server.OutputDataReceived += handler; server.ErrorDataReceived += handler;
        server.Start(); server.BeginOutputReadLine(); server.BeginErrorReadLine();
        Log("Started owned server PID " + server.Id + " on port " + options.Port);
        DateTime until = DateTime.UtcNow.AddSeconds(60);
        while (DateTime.UtcNow < until) {
            if (server.HasExited) break;
            if (Healthy()) return;
            Thread.Sleep(250);
        }
        StopServer();
        throw new Exception("HLL could not start within 60 seconds.\n\n" + Tail(Path.Combine(app,"server.log")));
    }

    void StopServer()
    {
        if (server == null) return;
        if (!server.HasExited) { server.Kill(); server.WaitForExit(); }
        else server.WaitForExit();
        server.Dispose(); server = null;
        lock(logLock) { if(serverLog != null) { serverLog.Dispose(); serverLog = null; } }
    }

    void EnsureTray()
    {
        if (tray != null) return;
        tray = new NotifyIcon(); tray.Icon = Icon; tray.Text = "HLL Broadcast";
        var menu = new ContextMenuStrip();
        menu.Items.Add("Open HLL Broadcast",null,delegate { OpenPanel(false); });
        menu.Items.Add("Open HLL Social",null,delegate { OpenPanel(true); });
        menu.Items.Add("Check for updates",null,async delegate { await Launch(true); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit",null,delegate { if(!busy) Quit(); });
        tray.ContextMenuStrip = menu; tray.DoubleClick += delegate { OpenPanel(options.Social); }; tray.Visible = true;
    }

    void OpenPanel(bool social)
    {
        string url = "http://localhost:" + options.Port + "/control/" + (social ? "?edition=social" : "");
        foreach (string folder in new [] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) }) {
            string edge = Path.Combine(folder,"Microsoft","Edge","Application","msedge.exe");
            if (!File.Exists(edge)) continue;
            try { Process.Start(new ProcessStartInfo(edge,"--app=" + Quote(url)) { UseShellExecute = true }); return; } catch { }
        }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    void MakeShortcuts()
    {
        string exe = Path.Combine(home,"HLL-Broadcast.exe");
        if (!String.Equals(Path.GetFullPath(Application.ExecutablePath),exe,StringComparison.OrdinalIgnoreCase)) File.Copy(Application.ExecutablePath,exe,true);
        string arguments = "--home " + Quote(home) + (options.Port != 4610 ? " --port " + options.Port : "");
        Type type = Type.GetTypeFromProgID("WScript.Shell");
        object shell = Activator.CreateInstance(type);
        try {
            foreach (string folder in new [] { Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), Environment.GetFolderPath(Environment.SpecialFolder.Programs) }) {
                Directory.CreateDirectory(folder);
                foreach (bool social in new [] { false, true }) {
                    string name = social ? "HLL Social" : "HLL Broadcast";
                    object link = type.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[] { Path.Combine(folder,name + ".lnk") });
                    try {
                        Type lt = link.GetType();
                        lt.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[] { exe });
                        lt.InvokeMember("Arguments",BindingFlags.SetProperty,null,link,new object[] { arguments + (social ? " --social" : "") });
                        lt.InvokeMember("WorkingDirectory",BindingFlags.SetProperty,null,link,new object[] { home });
                        lt.InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[] { exe + ",0" });
                        lt.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
                    } finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(link); }
                }
            }
        } catch (Exception e) { Log("Shortcut creation failed: " + e); notice = "HLL is installed, but Windows could not create the shortcuts. You can open " + exe + " directly."; }
        finally { System.Runtime.InteropServices.Marshal.FinalReleaseComObject(shell); }
    }

    void Quit()
    {
        quitting = true; monitor.Stop(); StopServer();
        if (tray != null) { tray.Visible = false; tray.Dispose(); }
        Close();
    }

    static string Quote(string value) {
        value = value.Replace("\"", "");
        int trailing = value.Length - value.TrimEnd('\\').Length;
        return "\"" + value + new string('\\',trailing) + "\"";
    }
    static string Tail(string path)
    {
        try {
            using (var f = new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)) {
                if(f.Length > 7000) f.Seek(-7000,SeekOrigin.End);
                using(var reader = new StreamReader(f)) return reader.ReadToEnd();
            }
        } catch { return "No log is available yet."; }
    }
    void DeleteDirectory(string path)
    {
        string resolved = Path.GetFullPath(path);
        string boundary = Path.GetFullPath(home).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!resolved.StartsWith(boundary,StringComparison.OrdinalIgnoreCase)) throw new Exception("Refusing to remove a folder outside this HLL installation.");
        if (Directory.Exists(path)) Directory.Delete(path,true);
    }
}
