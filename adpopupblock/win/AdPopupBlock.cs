// 광고창 차단 (AdPopupBlock) — Windows
// 시작할 때 광고 팝업을 띄우는 프로그램 셋(디자인210 FontManager, 산돌구름, 네이트온)의 광고창과
// 카카오톡 메인 창의 광고를 막는다.
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
[assembly: System.Reflection.AssemblyVersion("1.1.0.0")]
[assembly: System.Reflection.AssemblyFileVersion("1.1.0.0")]

namespace AdPopupBlock
{
    static class Program
    {
        public const string AppVersion = "1.1.0";
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
        readonly ToolStripMenuItem miD210, miSandoll, miNateon, miKakao, miAuto;
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
            miKakao = Toggle(menu, "카카오톡", "KakaoTalk");
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
            miKakao.Checked = Settings.Get("KakaoTalk");
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
            blocker.Shutdown();
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

        readonly Kakao kakao;

        public Blocker(bool dryRun) { this.dryRun = dryRun; kakao = new Kakao(dryRun, LogOnce); }

        public void Shutdown() { kakao.Stop(); }

        public void Tick()
        {
            tickCount++;
            try { if (Settings.Get("Sandoll")) SandollTick(); } catch (Exception ex) { LogOnce("sandoll", ex); }
            try { kakao.Tick(Settings.Get("KakaoTalk")); } catch (Exception ex) { LogOnce("kakao", ex); }
            // 디자인210 날짜는 2초마다, 네이트온 파일은 30초마다 확인(둘 다 가볍다)
            if (tickCount % 5 == 1) { try { if (Settings.Get("Design210")) Design210.EnsureToday(dryRun); } catch (Exception ex) { LogOnce("d210", ex); } }
            if (tickCount % 75 == 1) { try { if (Settings.Get("Nateon")) Nateon.Ensure(dryRun); } catch (Exception ex) { LogOnce("nateon", ex); } }
        }

        public void OnSettingChanged(string key, bool on)
        {
            if (key == "Nateon" && !on) Nateon.Restore(dryRun);
            if (key == "KakaoTalk" && !on) kakao.Stop();
            tickCount = 0;
        }

        readonly HashSet<string> errorsLogged = new HashSet<string>();
        internal void LogOnce(string tag, Exception ex)
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

    // 카카오톡: 메인 창(EVA_Window_Dblclk) 아래쪽에 광고를 세 겹으로 깐다(2026-11-18 실측).
    //  ① 메인 창이 소유한 제목 없는 EVA_Window_Dblclk 창 — 안에 'AdFit NAS Advertisement' 웹뷰가 있다 → 숨김
    //  ② 메인 창의 직속 자식 중 제목 없는 EVA_ChildWindow(광고 자리, 보통 카카오톡이 이미 숨겨 둠) → 숨김
    //  ③ OnlineMainView_* / LockModeView_* 가 광고 높이만큼 짧다 → 메인 창 아래 끝까지 늘림
    // ①② 는 크기를 건드리지 않고 숨기기만 한다 — 카카오톡은 창을 옮기거나 키울 때마다 ①의 크기를 되돌리는데,
    //   우리가 매번 0 으로 줄이면 웹뷰 크기 변경이 프레임마다 오가 카카오톡이 심하게 버벅인다(1.1.0 첫 빌드, 사용자 제보).
    //   숨긴 창은 크기가 되돌아가도 다시 보이지 않는다(실측).
    // 창 표시·이동 이벤트(SetWinEventHook)로 바로 반응하되, 여러 개가 몰리면 한 번으로 합친다.
    // 사용자가 창을 끌고 있는 동안(MOVESIZESTART~END)에는 손대지 않다가 놓는 순간 한 번 맞춘다.
    //   끄는 동안 카카오톡은 WM_SIZE 마다 목록을 광고 높이만큼 줄여 그린다. 그때마다 늘리면 매 프레임 목록을 두 번
    //   그리게 돼 다시 버벅였고, 그래도 줄어든 프레임이 먼저 그려져 빈칸은 안 없어졌다(18:30 교체본, 사용자 제보).
    //   → 끄는 동안 아래 빈칸은 감수한다(광고 내용은 안 보임). 없애려면 카카오톡 안에 코드를 심어야 한다.
    // SetWindowPos 는 비동기(SWP_ASYNCWINDOWPOS)라 카카오톡이 멈춰도 우리는 안 멈춘다.
    class Kakao
    {
        readonly bool dryRun;
        readonly Action<string, Exception> logOnce;
        readonly Native.WinEventProc proc;
        readonly SynchronizationContext ctx;
        IntPtr hook = IntPtr.Zero, hookSize = IntPtr.Zero;
        uint pid;
        IntPtr main = IntPtr.Zero;
        uint mainThread;
        bool busy, pending, sizing;
        DateTime sizingSince;
        readonly HashSet<IntPtr> reported = new HashSet<IntPtr>();

        public Kakao(bool dryRun, Action<string, Exception> logOnce)
        {
            this.dryRun = dryRun;
            this.logOnce = logOnce;
            ctx = SynchronizationContext.Current;
            proc = OnEvent;   // 델리게이트를 필드로 붙잡아 GC 를 막는다
        }

        public void Tick(bool on)
        {
            if (!on) { Stop(); return; }
            int[] pids = Native.PidsOf("KakaoTalk");
            uint p = pids.Length > 0 ? (uint)pids[0] : 0;
            if (p != pid)
            {
                Unhook();
                pid = p;
                main = IntPtr.Zero;
                reported.Clear();
                if (p != 0)
                {
                    uint flags = Native.WINEVENT_OUTOFCONTEXT | Native.WINEVENT_SKIPOWNPROCESS;
                    hook = Native.SetWinEventHook(Native.EVENT_OBJECT_SHOW, Native.EVENT_OBJECT_LOCATIONCHANGE, IntPtr.Zero, proc, p, 0, flags);
                    hookSize = Native.SetWinEventHook(Native.EVENT_SYSTEM_MOVESIZESTART, Native.EVENT_SYSTEM_MOVESIZEEND, IntPtr.Zero, proc, p, 0, flags);
                    Log.Write("카카오톡 감시 시작 (pid " + p + (hook == IntPtr.Zero ? ", 이벤트 훅 실패 — 0.4초 확인만" : "") + ")");
                }
            }
            // 끌기 끝 이벤트를 놓쳤을 때 대비
            if (sizing && (DateTime.Now - sizingSince).TotalSeconds > 30) sizing = false;
            if (pid != 0 && !sizing) Fix();
        }

        public void Stop()
        {
            Unhook();
            pid = 0;
            main = IntPtr.Zero;
            sizing = false;
        }

        void Unhook()
        {
            if (hook != IntPtr.Zero) { Native.UnhookWinEvent(hook); hook = IntPtr.Zero; }
            if (hookSize != IntPtr.Zero) { Native.UnhookWinEvent(hookSize); hookSize = IntPtr.Zero; }
        }

        void OnEvent(IntPtr hHook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time)
        {
            if (ev == Native.EVENT_SYSTEM_MOVESIZESTART) { sizing = true; sizingSince = DateTime.Now; return; }
            if (ev == Native.EVENT_SYSTEM_MOVESIZEEND) { sizing = false; Schedule(); return; }
            if (sizing) return;
            if (hwnd == IntPtr.Zero || idObject != 0 /*OBJID_WINDOW*/ || idChild != 0) return;
            if (ev != Native.EVENT_OBJECT_SHOW && ev != Native.EVENT_OBJECT_LOCATIONCHANGE) return;
            // 메인 창 · 그 직속 자식 · 메인 창이 소유한 창(광고 창) · 새로 뜬 최상위 창만 본다(웹뷰 내부 이벤트는 무시)
            IntPtr parent = Native.GetParent(hwnd);
            bool relevant = hwnd == main || (main != IntPtr.Zero && parent == main) || (ev == Native.EVENT_OBJECT_SHOW && parent == IntPtr.Zero);
            if (relevant) Schedule();
        }

        // 몰려 오는 이벤트를 한 번의 Fix 로 합친다(이미 큐에 있는 이벤트를 다 받은 뒤 실행된다)
        void Schedule()
        {
            if (pending) return;
            pending = true;
            SendOrPostCallback run = delegate
            {
                pending = false;
                if (sizing) return;
                try { Fix(); } catch (Exception ex) { logOnce("kakao", ex); }
            };
            if (ctx != null) ctx.Post(run, null); else run(null);
        }

        void Fix()
        {
            if (busy) return;
            busy = true;
            try
            {
                if (!FindMain()) return;
                Native.RECT mr;
                if (!Native.GetWindowRect(main, out mr)) return;
                IntPtr m = main;
                // ②③ 메인 창의 직속 자식
                Native.EnumChildWindows(m, delegate (IntPtr c, IntPtr l)
                {
                    if (Native.GetParent(c) != m) return true;
                    string t = Native.TitleOf(c);
                    if (t.StartsWith("OnlineMainView") || t.StartsWith("LockModeView")) Stretch(c, mr.B, mr.R, t);
                    else if (t.Length == 0 && Native.ClassOf(c) == "EVA_ChildWindow") Hide(c, "광고 자리");
                    return true;
                }, IntPtr.Zero);
                // ① 광고 웹뷰를 품은 별도 창(메인 창과 같은 스레드)
                Native.EnumThreadWindows(mainThread, delegate (IntPtr h, IntPtr l)
                {
                    if (h != m && Native.IsWindowVisible(h) && Native.ClassOf(h) == "EVA_Window_Dblclk" && Native.TitleOf(h).Length == 0 && HasAdInside(h))
                        Hide(h, "광고 창");
                    return true;
                }, IntPtr.Zero);
            }
            finally { busy = false; }
        }

        bool FindMain()
        {
            if (main != IntPtr.Zero && Native.IsWindow(main)) return true;
            main = IntPtr.Zero;
            foreach (IntPtr h in Native.TopWindows())
            {
                uint p;
                uint tid = Native.GetWindowThreadProcessId(h, out p);
                if (p != pid || Native.ClassOf(h) != "EVA_Window_Dblclk") continue;
                if (Native.GetParent(h) != IntPtr.Zero) continue;
                if (!HasChildTitled(h, "OnlineMainView")) continue;
                main = h;
                mainThread = tid;
                return true;
            }
            return false;
        }

        static bool HasChildTitled(IntPtr h, string prefix)
        {
            bool found = false;
            Native.EnumChildWindows(h, delegate (IntPtr c, IntPtr l)
            {
                if (Native.TitleOf(c).StartsWith(prefix)) { found = true; return false; }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        static bool HasAdInside(IntPtr h)
        {
            bool found = false;
            Native.EnumChildWindows(h, delegate (IntPtr c, IntPtr l)
            {
                string t = Native.TitleOf(c);
                if (t.IndexOf("AdFit", StringComparison.OrdinalIgnoreCase) >= 0 || t.StartsWith("BannerAd") || t.IndexOf("Advertisement", StringComparison.OrdinalIgnoreCase) >= 0)
                { found = true; return false; }
                return true;
            }, IntPtr.Zero);
            return found;
        }

        void Stretch(IntPtr c, int bottom, int mainRight, string title)
        {
            if (!Native.IsWindowVisible(c)) return;   // 잠금 화면 등 안 보이는 쪽은 보일 때(SHOW 이벤트) 맞춘다
            Native.RECT r;
            if (!Native.GetWindowRect(c, out r)) return;
            // 메인 창 테두리(오른쪽 여백과 같은 두께)는 덮지 않는다
            int border = mainRight - r.R;
            if (border < 0 || border > 8) border = 0;
            bottom -= border;
            int want = bottom - r.T;
            // 광고 창을 숨겨 두면 카카오톡이 스스로 목록을 끝까지 깐다(실측). 테두리 계산이 1~2px 어긋날 뿐이면
            // 건드리지 않는다 — 고치면 창 크기가 바뀔 때마다 목록을 한 번 더 그리게 된다.
            if (want <= 0 || Math.Abs(r.B - bottom) <= 8) return;
            Report(c, "목록 높이 " + (r.B - r.T) + "→" + want + " " + title.Split('_')[0]);
            if (dryRun) return;
            Native.SetWindowPos(c, IntPtr.Zero, 0, 0, r.R - r.L, want, Native.SWP_FLAGS);
        }

        // 크기는 건드리지 않고 숨기기만 한다(위 설명 참조)
        int hideCount;
        void Hide(IntPtr h, string what)
        {
            if (!Native.IsWindowVisible(h)) return;
            hideCount++;
            // 카카오톡이 계속 다시 띄우는지(서로 다투는지) 기록으로 알 수 있게 10·100·1000번째에 남긴다(첫 번째는 Report)
            if (hideCount == 10 || hideCount == 100 || hideCount == 1000) Log.Write("카카오톡: 숨김 누적 " + hideCount + "회");
            Report(h, what + " 숨김 " + Native.SizeOf(h));
            if (dryRun) return;
            Native.ShowWindowAsync(h, 0 /*SW_HIDE*/);
        }

        // 드래그 중에는 같은 창을 수백 번 고치므로 창마다 처음 한 번만 기록한다
        void Report(IntPtr h, string msg)
        {
            if (reported.Add(h)) Log.Write("카카오톡: " + msg + (dryRun ? " (dry-run)" : ""));
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
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
        [DllImport("user32.dll")] public static extern IntPtr GetParent(IntPtr h);
        [DllImport("user32.dll")] public static extern bool EnumThreadWindows(uint tid, EnumProc cb, IntPtr l);
        [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int cmd);
        [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
        // SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_NOOWNERZORDER | SWP_ASYNCWINDOWPOS
        public const uint SWP_FLAGS = 0x0002 | 0x0004 | 0x0010 | 0x0200 | 0x4000;
        public delegate void WinEventProc(IntPtr hHook, uint ev, IntPtr hwnd, int idObject, int idChild, uint thread, uint time);
        [DllImport("user32.dll")] public static extern IntPtr SetWinEventHook(uint evMin, uint evMax, IntPtr hmod, WinEventProc proc, uint pid, uint tid, uint flags);
        [DllImport("user32.dll")] public static extern bool UnhookWinEvent(IntPtr hook);
        public const uint EVENT_OBJECT_SHOW = 0x8002, EVENT_OBJECT_LOCATIONCHANGE = 0x800B;
        public const uint EVENT_SYSTEM_MOVESIZESTART = 0x000A, EVENT_SYSTEM_MOVESIZEEND = 0x000B;
        public const uint WINEVENT_OUTOFCONTEXT = 0x0000, WINEVENT_SKIPOWNPROCESS = 0x0002;
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

        // 최상위 창을 가진 프로세스 중 이름이 같은 것. Process.GetProcessesByName 은 한 번에 ~10ms 라
        // 0.4초마다 부르면 그것만으로 CPU 를 몇 % 쓴다(2026-11-18 실측) → 창 목록 + pid→이름 캐시로 대신한다.
        static readonly Dictionary<uint, string> nameCache = new Dictionary<uint, string>();
        static DateTime nameCacheAt = DateTime.Now;

        public static int[] PidsOf(string name)
        {
            if ((DateTime.Now - nameCacheAt).TotalSeconds > 60) { nameCache.Clear(); nameCacheAt = DateTime.Now; }   // pid 재사용 대비
            List<int> ids = new List<int>();
            foreach (IntPtr h in TopWindows())
            {
                uint pid;
                GetWindowThreadProcessId(h, out pid);
                if (pid == 0 || ids.Contains((int)pid)) continue;
                if (string.Equals(ProcName(pid), name, StringComparison.OrdinalIgnoreCase)) ids.Add((int)pid);
            }
            return ids.ToArray();
        }

        static string ProcName(uint pid)
        {
            string n;
            if (nameCache.TryGetValue(pid, out n)) return n;
            n = "";
            IntPtr h = OpenProcess(0x1000 /*PROCESS_QUERY_LIMITED_INFORMATION*/, false, pid);
            if (h != IntPtr.Zero)
            {
                StringBuilder sb = new StringBuilder(1024);
                int len = sb.Capacity;
                if (QueryFullProcessImageName(h, 0, sb, ref len)) n = Path.GetFileNameWithoutExtension(sb.ToString());
                CloseHandle(h);
            }
            nameCache[pid] = n;
            return n;
        }
        [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder sb, ref int len);
        [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);

        public static string ClassOf(IntPtr h) { StringBuilder sb = new StringBuilder(256); GetClassName(h, sb, 256); return sb.ToString(); }
        public static string TitleOf(IntPtr h) { StringBuilder sb = new StringBuilder(256); GetWindowText(h, sb, 256); return sb.ToString(); }
        public static string SizeOf(IntPtr h) { RECT r; GetWindowRect(h, out r); return (r.R - r.L) + "x" + (r.B - r.T); }
    }
}
