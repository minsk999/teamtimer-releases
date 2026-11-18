// 광고창 차단 (AdPopupBlock) — Windows
// 시작할 때 광고 팝업을 띄우는 프로그램 셋(디자인210 FontManager, 산돌구름, 네이트온)의 광고창을 막는다.
// 원리는 adpopupblock/README.md 참조. .NET Framework 4.x 기본 컴파일러(C# 5)로 빌드한다 → build.cmd
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: System.Reflection.AssemblyTitle("광고창 차단")]
[assembly: System.Reflection.AssemblyProduct("AdPopupBlock")]
[assembly: System.Reflection.AssemblyCompany("ADEF 영상팀")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.0.0.0")]

namespace AdPopupBlock
{
    static class Program
    {
        public const string AppVersion = "1.0.0";
        public const string TaskName = "AdPopupBlock";
        const string MutexName = "Local\\AdPopupBlock.Running";
        public const string QuitEventName = "Local\\AdPopupBlock.Quit";

        [STAThread]
        static int Main(string[] args)
        {
            bool quit = false, dryRun = false;
            string autostart = null;
            foreach (string a in args)
            {
                string s = a.ToLowerInvariant();
                if (s == "--quit") quit = true;
                else if (s == "--dry-run") dryRun = true;
                else if (s.StartsWith("--autostart=")) autostart = s.Substring(12);
                else if (s == "--version") { Console.WriteLine(AppVersion); return 0; }
            }

            if (autostart != null)
            {
                try
                {
                    if (autostart == "on") AutoStart.Enable();
                    else if (autostart == "off") AutoStart.Disable();
                    else return 2;
                    return 0;
                }
                catch (Exception ex) { Log.Write("autostart 실패: " + ex.Message); return 1; }
            }

            if (quit)
            {
                EventWaitHandle ev;
                if (EventWaitHandle.TryOpenExisting(QuitEventName, out ev)) { ev.Set(); return 0; }
                return 1;
            }

            bool created;
            using (Mutex m = new Mutex(true, MutexName, out created))
            {
                if (!created)
                {
                    if (!HasArg(args, "--autostart"))
                        MessageBox.Show("광고창 차단이 이미 실행 중이에요.\n작업 표시줄 오른쪽 트레이 아이콘을 우클릭해 설정할 수 있어요.",
                            "광고창 차단", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 0;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Log.Write("시작 v" + AppVersion + (dryRun ? " (dry-run)" : ""));
                Application.Run(new TrayApp(dryRun));
                Log.Write("종료");
            }
            return 0;
        }

        static bool HasArg(string[] args, string prefix)
        {
            foreach (string a in args) if (a.ToLowerInvariant().StartsWith(prefix)) return true;
            return false;
        }
    }

    // ───────────────────────── 설정 (HKCU\Software\AdPopupBlock) ─────────────────────────
    static class Settings
    {
        const string Key = "Software\\AdPopupBlock";
        public static bool Get(string name)
        {
            using (RegistryKey k = Registry.CurrentUser.OpenSubKey(Key))
            {
                object v = k == null ? null : k.GetValue(name);
                return v == null || Convert.ToInt32(v) != 0;   // 기본값 켬
            }
        }
        public static void Set(string name, bool on)
        {
            using (RegistryKey k = Registry.CurrentUser.CreateSubKey(Key))
                k.SetValue(name, on ? 1 : 0, RegistryValueKind.DWord);
        }
    }

    // ───────────────────────── 기록 ─────────────────────────
    static class Log
    {
        static readonly object Gate = new object();
        public static string Dir { get { return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AdPopupBlock"); } }
        public static string FilePath { get { return Path.Combine(Dir, "AdPopupBlock.log"); } }
        public static void Write(string msg)
        {
            try
            {
                lock (Gate)
                {
                    Directory.CreateDirectory(Dir);
                    FileInfo fi = new FileInfo(FilePath);
                    if (fi.Exists && fi.Length > 512 * 1024)
                    {
                        string old = FilePath + ".1";
                        if (File.Exists(old)) File.Delete(old);
                        File.Move(FilePath, old);
                    }
                    File.AppendAllText(FilePath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + "\r\n", new UTF8Encoding(true));
                }
            }
            catch { }
        }
    }

    // ───────────────────────── 자동 실행 (작업 스케줄러, 관리자 권한) ─────────────────────────
    // 디자인210 이 관리자 권한으로 돌아 이 도구도 관리자 권한이 필요하다.
    // HKCU Run 으로는 관리자 앱을 로그온 때 띄울 수 없어(UAC 가 막음) 작업 스케줄러의 「가장 높은 권한」 로그온 작업을 쓴다.
    static class AutoStart
    {
        public static bool IsEnabled()
        {
            string xml = RunSchtasks("/Query /TN \"" + Program.TaskName + "\" /XML");
            if (xml == null) return false;
            return xml.IndexOf(Application.ExecutablePath, StringComparison.OrdinalIgnoreCase) >= 0;
        }

        public static void Enable()
        {
            string user = WindowsIdentityName();
            string xml =
"<?xml version=\"1.0\" encoding=\"UTF-16\"?>\r\n" +
"<Task version=\"1.2\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">\r\n" +
"  <RegistrationInfo><Description>광고창 차단 — 디자인210·산돌구름·네이트온 광고 팝업 막기</Description></RegistrationInfo>\r\n" +
"  <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>" + Esc(user) + "</UserId></LogonTrigger></Triggers>\r\n" +
"  <Principals><Principal id=\"Author\"><UserId>" + Esc(user) + "</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>\r\n" +
"  <Settings>\r\n" +
"    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n" +
"    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n" +
"    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n" +
"    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\r\n" +
"    <Priority>6</Priority>\r\n" +
"  </Settings>\r\n" +
"  <Actions Context=\"Author\"><Exec><Command>" + Esc(Application.ExecutablePath) + "</Command><Arguments>--autostart</Arguments><WorkingDirectory>" + Esc(Path.GetDirectoryName(Application.ExecutablePath)) + "</WorkingDirectory></Exec></Actions>\r\n" +
"</Task>\r\n";
            string tmp = Path.Combine(Path.GetTempPath(), "AdPopupBlock-task.xml");
            File.WriteAllText(tmp, xml, Encoding.Unicode);
            try
            {
                if (RunSchtasks("/Create /TN \"" + Program.TaskName + "\" /XML \"" + tmp + "\" /F") == null)
                    throw new Exception("작업 스케줄러 등록 실패");
            }
            finally { try { File.Delete(tmp); } catch { } }
            if (!IsEnabled()) throw new Exception("작업 스케줄러 등록 확인 실패");
            Log.Write("자동 실행 켬: " + Application.ExecutablePath);
        }

        public static void Disable()
        {
            RunSchtasks("/Delete /TN \"" + Program.TaskName + "\" /F");
            Log.Write("자동 실행 끔");
        }

        static string WindowsIdentityName()
        {
            return System.Security.Principal.WindowsIdentity.GetCurrent().Name;
        }

        static string Esc(string s)
        {
            return System.Security.SecurityElement.Escape(s);
        }

        // 성공하면 표준 출력, 실패하면 null
        static string RunSchtasks(string args)
        {
            ProcessStartInfo psi = new ProcessStartInfo("schtasks.exe", args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.Default;
            using (Process p = Process.Start(psi))
            {
                string o = p.StandardOutput.ReadToEnd();
                p.StandardError.ReadToEnd();
                p.WaitForExit(15000);
                return p.ExitCode == 0 ? o : null;
            }
        }
    }

    // ───────────────────────── 트레이 ─────────────────────────
    class TrayApp : ApplicationContext
    {
        readonly NotifyIcon tray;
        readonly System.Windows.Forms.Timer timer;
        readonly ToolStripMenuItem miD210, miSandoll, miNateon, miAuto;
        readonly Blocker blocker;
        readonly EventWaitHandle quitEvent;
        readonly RegisteredWaitHandle quitWait;
        readonly SynchronizationContext ui;

        public TrayApp(bool dryRun)
        {
            ui = new WindowsFormsSynchronizationContext();
            SynchronizationContext.SetSynchronizationContext(ui);
            blocker = new Blocker(dryRun);

            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem title = new ToolStripMenuItem("광고창 차단 v" + Program.AppVersion);
            title.Enabled = false;
            menu.Items.Add(title);
            menu.Items.Add(new ToolStripSeparator());
            miD210 = Toggle(menu, "디자인210 FontManager", "Design210");
            miSandoll = Toggle(menu, "산돌구름", "Sandoll");
            miNateon = Toggle(menu, "네이트온", "Nateon");
            menu.Items.Add(new ToolStripSeparator());
            miAuto = new ToolStripMenuItem("윈도우 시작 시 자동 실행");
            miAuto.Click += delegate { ToggleAutoStart(); };
            menu.Items.Add(miAuto);
            ToolStripMenuItem miLog = new ToolStripMenuItem("기록 보기");
            miLog.Click += delegate { OpenLog(); };
            menu.Items.Add(miLog);
            menu.Items.Add(new ToolStripSeparator());
            ToolStripMenuItem miQuit = new ToolStripMenuItem("종료");
            miQuit.Click += delegate { ExitThread(); };
            menu.Items.Add(miQuit);
            menu.Opening += delegate { RefreshMenu(); };

            tray = new NotifyIcon();
            tray.Icon = Icons.Make();
            tray.Text = "광고창 차단";
            tray.ContextMenuStrip = menu;
            tray.Visible = true;
            RefreshMenu();

            blocker.Tick();
            timer = new System.Windows.Forms.Timer();
            timer.Interval = 400;
            timer.Tick += delegate { blocker.Tick(); };
            timer.Start();

            quitEvent = new EventWaitHandle(false, EventResetMode.AutoReset, Program.QuitEventName);
            quitWait = ThreadPool.RegisterWaitForSingleObject(quitEvent, delegate { ui.Post(delegate { ExitThread(); }, null); }, null, -1, true);
        }

        ToolStripMenuItem Toggle(ContextMenuStrip menu, string text, string key)
        {
            ToolStripMenuItem mi = new ToolStripMenuItem(text);
            mi.Tag = key;
            mi.Click += delegate
            {
                bool on = !Settings.Get(key);
                Settings.Set(key, on);
                Log.Write(text + (on ? " 차단 켬" : " 차단 끔"));
                blocker.OnSettingChanged(key, on);
                RefreshMenu();
            };
            menu.Items.Add(mi);
            return mi;
        }

        void RefreshMenu()
        {
            miD210.Checked = Settings.Get("Design210");
            miSandoll.Checked = Settings.Get("Sandoll");
            miNateon.Checked = Settings.Get("Nateon");
            bool auto = false;
            try { auto = AutoStart.IsEnabled(); } catch { }
            miAuto.Checked = auto;
        }

        void ToggleAutoStart()
        {
            try
            {
                if (AutoStart.IsEnabled()) AutoStart.Disable(); else AutoStart.Enable();
            }
            catch (Exception ex)
            {
                MessageBox.Show("자동 실행 설정을 바꾸지 못했어요.\n" + ex.Message, "광고창 차단", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            RefreshMenu();
        }

        void OpenLog()
        {
            try
            {
                Directory.CreateDirectory(Log.Dir);
                if (!File.Exists(Log.FilePath)) File.WriteAllText(Log.FilePath, "", new UTF8Encoding(true));
                Process.Start("notepad.exe", "\"" + Log.FilePath + "\"");
            }
            catch { }
        }

        protected override void ExitThreadCore()
        {
            timer.Stop();
            tray.Visible = false;
            tray.Dispose();
            if (quitWait != null) quitWait.Unregister(null);
            base.ExitThreadCore();
        }
    }

    // ───────────────────────── 실제 차단 ─────────────────────────
    class Blocker
    {
        readonly bool dryRun;
        int tickCount;
        readonly Dictionary<IntPtr, DateTime> closing = new Dictionary<IntPtr, DateTime>();
        readonly HashSet<IntPtr> reportedMain = new HashSet<IntPtr>();

        public Blocker(bool dryRun) { this.dryRun = dryRun; }

        public void Tick()
        {
            tickCount++;
            try { if (Settings.Get("Sandoll")) SandollTick(); } catch (Exception ex) { LogOnce("sandoll", ex); }
            // 디자인210 날짜는 2초마다, 네이트온 파일은 30초마다 확인(둘 다 가볍다)
            if (tickCount % 5 == 1) { try { if (Settings.Get("Design210")) Design210.EnsureToday(dryRun); } catch (Exception ex) { LogOnce("d210", ex); } }
            if (tickCount % 75 == 1) { try { if (Settings.Get("Nateon")) Nateon.Ensure(dryRun); } catch (Exception ex) { LogOnce("nateon", ex); } }
        }

        public void OnSettingChanged(string key, bool on)
        {
            if (key == "Nateon" && !on) Nateon.Restore(dryRun);
            tickCount = 0;
        }

        readonly HashSet<string> errorsLogged = new HashSet<string>();
        void LogOnce(string tag, Exception ex)
        {
            string k = tag + ":" + ex.GetType().Name + ":" + ex.Message;
            if (errorsLogged.Add(k)) Log.Write("오류(" + tag + "): " + ex.Message);
        }

        // 산돌구름: 내장 WebView2 는 광고·공지 팝업(sandollcloud.com/sandollcloudagent/pop)에만 쓰인다.
        // SandollCloud.exe 의 최상위 창 중 Flutter 본창이 아니면서 WebView2 를 품은 창을 닫는다.
        void SandollTick()
        {
            int[] pids = Native.PidsOf("SandollCloud");
            if (pids.Length == 0) return;
            foreach (IntPtr h in Native.TopWindows())
            {
                uint pid;
                Native.GetWindowThreadProcessId(h, out pid);
                if (Array.IndexOf(pids, (int)pid) < 0) continue;
                if (!Native.IsWindowVisible(h)) continue;
                string cls = Native.ClassOf(h);
                if (!Native.HasWebViewChild(h)) continue;
                if (cls.StartsWith("FLUTTER_RUNNER"))
                {
                    if (reportedMain.Add(h)) Log.Write("산돌구름: 본창 안에 웹뷰가 보임(닫지 않음) " + cls + " " + Native.SizeOf(h));
                    continue;
                }
                DateTime since;
                if (closing.TryGetValue(h, out since))
                {
                    if ((DateTime.Now - since).TotalMilliseconds > 800)
                    {
                        if (!dryRun) Native.ShowWindow(h, 0 /*SW_HIDE*/);
                        Log.Write("산돌구름 팝업 숨김(닫기 무시됨) " + cls + " " + Native.SizeOf(h));
                        closing.Remove(h);
                    }
                    continue;
                }
                Log.Write("산돌구름 팝업 닫음 " + cls + " " + Native.SizeOf(h) + " \"" + Native.TitleOf(h) + "\"" + (dryRun ? " (dry-run)" : ""));
                if (!dryRun) Native.PostMessage(h, 0x0010 /*WM_CLOSE*/, IntPtr.Zero, IntPtr.Zero);
                closing[h] = DateTime.Now;
            }
            // 사라진 창 정리
            List<IntPtr> gone = new List<IntPtr>();
            foreach (IntPtr h in closing.Keys) if (!Native.IsWindow(h)) gone.Add(h);
            foreach (IntPtr h in gone) closing.Remove(h);
        }
    }

    // 디자인210 FontManager: Conf.ini 의 [POPUP] DATE 가 오늘(yyyyMMdd)과 "정확히 같을 때만" 팝업을 건너뛴다
    // (CommUI.FormMain.ShowMain 이 String.op_Inequality 로 비교 — 2026-11-18 IL 확인, 미래 날짜는 통하지 않는다).
    // 그래서 날짜를 늘 오늘로 맞춰 둔다. Conf.ini 는 Program Files 안이라 관리자 권한이 필요하다.
    static class Design210
    {
        static string cachedIni;
        static DateTime cachedAt;

        public static void EnsureToday(bool dryRun)
        {
            string ini = FindIni();
            if (ini == null) return;
            string today = DateTime.Now.ToString("yyyyMMdd");
            StringBuilder sb = new StringBuilder(64);
            Native.GetPrivateProfileString("POPUP", "DATE", "", sb, sb.Capacity, ini);
            if (sb.ToString() == today) return;
            if (!dryRun && !Native.WritePrivateProfileString("POPUP", "DATE", today, ini))
                throw new Exception("Conf.ini 쓰기 실패(" + Marshal.GetLastWin32Error() + ") — 관리자 권한으로 실행됐는지 확인");
            Log.Write("디자인210 팝업 날짜를 오늘로 맞춤: " + sb + " → " + today + (dryRun ? " (dry-run)" : ""));
        }

        static string FindIni()
        {
            if (cachedIni != null && (DateTime.Now - cachedAt).TotalMinutes < 10) return cachedIni;
            cachedAt = DateTime.Now;
            List<string> dirs = new List<string>();
            foreach (string sub in new string[] { "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run", "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" })
            {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(sub))
                {
                    object v = k == null ? null : k.GetValue("FontManager.exe");
                    if (v != null) { try { dirs.Add(Path.GetDirectoryName(v.ToString().Trim('"'))); } catch { } }
                }
            }
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            dirs.Add(Path.Combine(pf86, "Design210 FontManager"));
            dirs.Add(Path.Combine(pf, "Design210 FontManager"));
            foreach (string d in dirs)
            {
                if (string.IsNullOrEmpty(d)) continue;
                string ini = Path.Combine(d, "System\\Conf.ini");
                if (File.Exists(ini)) { cachedIni = ini; return ini; }
            }
            cachedIni = null;
            return null;
        }
    }

    // 네이트온: 광고는 networkad.nate.com 의 XML 을 %LOCALAPPDATA%\SK Communications\NATEON*\Temp 에 받아서 띄운다.
    // 로그인 팝업(ad_login_popup.xml)·로그인 토스트(login7.xml)·정각 광고(polling7.xml).
    // 그 파일을 빈 내용 + 읽기 전용으로 둬 새 광고 설정을 받지 못하게 한다.
    static class Nateon
    {
        static readonly string[][] Files = new string[][] {
            new string[] { "ad_login_popup.xml", "<?xml version=\"1.0\" encoding=\"utf-8\" ?><event></event>" },
            new string[] { "login7.xml", "<?xml version=\"1.0\" encoding=\"utf-8\"?><login></login>" },
            new string[] { "polling7.xml", "<?xml version=\"1.0\" encoding=\"utf-8\"?><polling></polling>" },
        };

        static IEnumerable<string> TempDirs()
        {
            string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "SK Communications");
            if (!Directory.Exists(root)) yield break;
            foreach (string d in Directory.GetDirectories(root, "NATEON*"))
            {
                string t = Path.Combine(d, "Temp");
                if (Directory.Exists(t)) yield return t;
            }
        }

        public static void Ensure(bool dryRun)
        {
            foreach (string dir in TempDirs())
            {
                foreach (string[] f in Files)
                {
                    string p = Path.Combine(dir, f[0]);
                    FileInfo fi = new FileInfo(p);
                    if (fi.Exists && fi.IsReadOnly && fi.Length == Encoding.UTF8.GetByteCount(f[1])) continue;
                    if (dryRun) { Log.Write("네이트온 광고 파일 잠글 예정: " + p + " (dry-run)"); continue; }
                    if (fi.Exists && fi.IsReadOnly) fi.IsReadOnly = false;
                    File.WriteAllText(p, f[1], new UTF8Encoding(false));
                    new FileInfo(p).IsReadOnly = true;
                    Log.Write("네이트온 광고 파일 잠금: " + p);
                }
            }
        }

        public static void Restore(bool dryRun)
        {
            foreach (string dir in TempDirs())
            {
                foreach (string[] f in Files)
                {
                    string p = Path.Combine(dir, f[0]);
                    FileInfo fi = new FileInfo(p);
                    if (!fi.Exists) continue;
                    if (dryRun) { Log.Write("네이트온 광고 파일 풀 예정: " + p + " (dry-run)"); continue; }
                    try { fi.IsReadOnly = false; fi.Delete(); Log.Write("네이트온 광고 파일 풀어 줌: " + p); }
                    catch (Exception ex) { Log.Write("네이트온 광고 파일 풀기 실패: " + p + " " + ex.Message); }
                }
            }
        }
    }

    // ───────────────────────── 아이콘 (코드로 그림: 방패 + 금지선) ─────────────────────────
    static class Icons
    {
        [DllImport("user32.dll")] static extern bool DestroyIcon(IntPtr h);
        public static Icon Make()
        {
            int s = SystemInformation.SmallIconSize.Width;
            if (s < 16) s = 16;
            using (Bitmap bmp = new Bitmap(s, s))
            {
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.Clear(Color.Transparent);
                    Draw(g, s);
                }
                IntPtr h = bmp.GetHicon();
                Icon ic = (Icon)Icon.FromHandle(h).Clone();
                DestroyIcon(h);
                return ic;
            }
        }
        public static void Draw(Graphics g, int s)
        {
            float k = s / 16f;
            using (GraphicsPath p = new GraphicsPath())
            {
                p.AddLines(new PointF[] {
                    new PointF(8*k, 0.8f*k), new PointF(14.6f*k, 3f*k), new PointF(14.6f*k, 7.6f*k),
                    new PointF(13.4f*k, 11.2f*k), new PointF(8*k, 15.2f*k), new PointF(2.6f*k, 11.2f*k),
                    new PointF(1.4f*k, 7.6f*k), new PointF(1.4f*k, 3f*k) });
                p.CloseFigure();
                using (Brush b = new SolidBrush(Color.FromArgb(0x1F, 0x6F, 0xEB))) g.FillPath(b, p);
            }
            using (Pen pen = new Pen(Color.White, 1.7f * k))
            {
                pen.StartCap = LineCap.Round; pen.EndCap = LineCap.Round;
                g.DrawEllipse(pen, 4.6f * k, 4.4f * k, 6.8f * k, 6.8f * k);
                g.DrawLine(pen, 5.6f * k, 10.2f * k, 10.4f * k, 5.4f * k);
            }
        }
    }

    // ───────────────────────── Win32 ─────────────────────────
    static class Native
    {
        public delegate bool EnumProc(IntPtr h, IntPtr l);
        [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
        [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr l);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
        [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
        [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
        [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
        [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern bool WritePrivateProfileString(string section, string key, string value, string file);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        public static extern int GetPrivateProfileString(string section, string key, string def, StringBuilder ret, int size, string file);

        public static List<IntPtr> TopWindows()
        {
            List<IntPtr> list = new List<IntPtr>();
            EnumWindows(delegate (IntPtr h, IntPtr l) { list.Add(h); return true; }, IntPtr.Zero);
            return list;
        }

        public static bool HasWebViewChild(IntPtr h)
        {
            bool found = false;
            EnumChildWindows(h, delegate (IntPtr c, IntPtr l)
            {
                string cls = ClassOf(c);
                if (cls.StartsWith("Chrome_WidgetWin") || cls == "Chrome_RenderWidgetHostHWND") { found = true; return false; }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        public static int[] PidsOf(string name)
        {
            Process[] ps = Process.GetProcessesByName(name);
            int[] ids = new int[ps.Length];
            for (int i = 0; i < ps.Length; i++) { ids[i] = ps[i].Id; ps[i].Dispose(); }
            return ids;
        }

        public static string ClassOf(IntPtr h) { StringBuilder sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
        public static string TitleOf(IntPtr h) { StringBuilder sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
        public static string SizeOf(IntPtr h) { RECT r; GetWindowRect(h, out r); return (r.R - r.L) + "x" + (r.B - r.T); }
    }
}
