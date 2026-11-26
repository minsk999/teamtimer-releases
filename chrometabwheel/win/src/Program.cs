// 크롬 탭 휠 (ChromeTabWheel)
// 크롬 창의 "탭 줄" 위에서 마우스 휠을 굴리면 이전/다음 탭으로 넘긴다.
//
// 설계 요점
//  - 입력은 Raw Input 으로 "듣기만" 한다. 훅이 아니라서 휠 입력을 지연시키거나 삼키지 않는다.
//  - 탭 줄 위치는 추정하지 않고 크롬에 직접 묻는다(UI Automation 의 TabStripRegionView 사각형).
//  - 탭 전환은 키 입력을 흉내 내지 않고 크롬 창에 명령을 보낸다 → 비활성 창도 포커스 이동 없이 넘어간다.
//  - 윈도우 종료/로그오프 신호를 받으면 그 자리에서 조용히 끝난다.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;
using System.Windows.Forms;
using Microsoft.Win32;

namespace ChromeTabWheel
{
    static class Program
    {
        public const string Version = "1.0.0";
        public const string AppName = "ChromeTabWheel";
        // 숨은 창의 제목 — 실행 중인 인스턴스를 찾는 열쇠(--quit, 중복 실행 방지)
        public const string HiddenTitle = "ChromeTabWheel.Hidden.7c1f2a";
        // 진단용 스위치(평소에는 쓰지 않는다)
        //   --debug     판정 하나하나를 ChromeTabWheel.log 에 남기고, 시험용 가짜 입력 메시지를 받는다
        //   --no-input  실제 마우스 입력을 듣지 않는다(가짜 입력만으로 시험할 때)
        //   --dry-run   판정만 하고 크롬에 탭 전환 명령은 보내지 않는다
        public static bool DebugLog, NoInput, DryRun;

        [STAThread]
        static int Main(string[] args)
        {
            // 어떤 경우에도 시스템 오류 창을 띄우지 않는다.
            Native.SetErrorMode(Native.SEM_FAILCRITICALERRORS | Native.SEM_NOGPFAULTERRORBOX | Native.SEM_NOOPENFILEERRORBOX);
            AppDomain.CurrentDomain.UnhandledException += delegate(object s, UnhandledExceptionEventArgs e)
            {
                Log.Write("처리되지 않은 예외: " + e.ExceptionObject);
                Native.TerminateProcess(Native.GetCurrentProcess(), 1);
            };
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += delegate(object s, ThreadExceptionEventArgs e) { Log.Write("UI 예외: " + e.Exception); };

            foreach (string a in args)
            {
                string k = a.ToLowerInvariant();
                if (k == "--debug") DebugLog = true;
                else if (k == "--no-input") NoInput = true;
                else if (k == "--dry-run") DryRun = true;
                else if (k == "--quit") { IntPtr h = Native.FindWindow(null, HiddenTitle); if (h != IntPtr.Zero) Native.PostMessage(h, Native.WM_CLOSE, IntPtr.Zero, IntPtr.Zero); return 0; }
                else if (k == "--autostart=on") { Autostart.Set(true); return Autostart.IsEnabled() ? 0 : 1; }
                else if (k == "--autostart=off") { Autostart.Set(false); return Autostart.IsEnabled() ? 1 : 0; }
            }

            bool created;
            using (Mutex m = new Mutex(true, "Local\\ChromeTabWheel.SingleInstance", out created))
            {
                if (!created || Native.FindWindow(null, HiddenTitle) != IntPtr.Zero) return 0;   // 이미 실행 중 — 조용히 끝
                Native.SetProcessDpiAwarenessContext(Native.DPI_PER_MONITOR_V2);   // 매니페스트가 이미 지정. 만일을 위한 이중 장치
                Application.Run(new TrayContext());
            }
            return 0;
        }
    }

    // ───────────────────────── 트레이 ─────────────────────────
    sealed class TrayContext : ApplicationContext
    {
        readonly NotifyIcon tray;
        readonly MenuItem miEnabled, miAuto;
        readonly HiddenWindow win;
        readonly Worker worker = new Worker();
        readonly Icon icoOn, icoOff;

        public TrayContext()
        {
            icoOn = LoadIcon("app.ico");
            icoOff = LoadIcon("app-off.ico");
            miEnabled = new MenuItem("탭 줄 휠 전환 사용", delegate { SetEnabled(!win.Enabled); });
            miEnabled.Checked = true;
            miAuto = new MenuItem("윈도우 시작 시 자동 실행", delegate { Autostart.Set(!Autostart.IsEnabled()); });
            ContextMenu menu = new ContextMenu(new MenuItem[] { miEnabled, miAuto, new MenuItem("-"), new MenuItem("종료", delegate { Quit(); }) });
            menu.Popup += delegate { miAuto.Checked = Autostart.IsEnabled(); };

            tray = new NotifyIcon();
            tray.Icon = icoOn;
            tray.ContextMenu = menu;
            tray.Visible = true;

            win = new HiddenWindow(this, worker);
            if (!Program.NoInput && !win.RegisterInput())
            {
                Log.Write("Raw Input 등록 실패: " + Marshal.GetLastWin32Error());
                tray.ShowBalloonTip(8000, "크롬 탭 휠", "마우스 입력을 등록하지 못해 동작하지 않습니다.", ToolTipIcon.Warning);
            }
            SetEnabled(true);
        }

        static Icon LoadIcon(string name)
        {
            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
                return new Icon(s, SystemInformation.SmallIconSize);
        }

        void SetEnabled(bool on)
        {
            win.Enabled = on;
            miEnabled.Checked = on;
            tray.Icon = on ? icoOn : icoOff;
            tray.Text = "크롬 탭 휠 " + Program.Version + (on ? " — 탭 줄에서 휠로 탭 전환" : " — 일시 중지됨");
        }

        public void Quit()
        {
            tray.Visible = false;
            tray.Dispose();
            win.DestroyHandle();
            ExitThread();
        }
    }

    // ───────────────────────── 숨은 창: 입력 수신 + 종료 신호 ─────────────────────────
    sealed class HiddenWindow : NativeWindow
    {
        readonly TrayContext owner;
        readonly Worker worker;
        readonly IntPtr buf = Marshal.AllocHGlobal(128);
        static readonly int HeaderSize = 8 + 2 * IntPtr.Size;   // RAWINPUTHEADER
        public volatile bool Enabled = true;

        public HiddenWindow(TrayContext owner, Worker worker)
        {
            this.owner = owner; this.worker = worker;
            CreateParams cp = new CreateParams();
            cp.Caption = Program.HiddenTitle;
            cp.ExStyle = 0x00000080;   // WS_EX_TOOLWINDOW — 보이지 않는 최상위 창(세션 종료 메시지를 받으려면 메시지 전용 창이면 안 된다)
            CreateHandle(cp);
        }

        public bool RegisterInput()
        {
            Native.RAWINPUTDEVICE[] d = new Native.RAWINPUTDEVICE[1];
            d[0].usUsagePage = 1; d[0].usUsage = 2;   // 일반 데스크톱 / 마우스
            d[0].dwFlags = Native.RIDEV_INPUTSINK;    // 포커스가 없어도 받는다
            d[0].hwndTarget = Handle;
            return Native.RegisterRawInputDevices(d, 1, Marshal.SizeOf(typeof(Native.RAWINPUTDEVICE)));
        }

        protected override void WndProc(ref Message m)
        {
            switch (m.Msg)
            {
                case Native.WM_INPUT:
                    if (Enabled) OnInput(m.LParam);
                    break;   // 정리를 위해 기본 처리로 넘긴다
                case Native.WM_QUERYENDSESSION:
                    m.Result = (IntPtr)1;   // 종료를 막지 않는다
                    return;
                case Native.WM_ENDSESSION:
                    // 세션이 실제로 끝난다 — 저장할 것이 없으므로 정리 절차 없이 즉시 끝난다.
                    // (런타임 종료 절차를 밟지 않으므로 종료 중 예외·오류 창이 생길 틈이 없다)
                    if (m.WParam != IntPtr.Zero) Native.TerminateProcess(Native.GetCurrentProcess(), 0);
                    m.Result = IntPtr.Zero;
                    return;
                case Native.WM_CLOSE:
                    owner.Quit();
                    return;
                case Native.WM_APP_FAKEWHEEL:
                    // 시험용: 커서를 건드리지 않고 "(x,y)에서 휠 delta" 를 판정 스레드에 직접 넣는다. --debug 일 때만.
                    if (Program.DebugLog)
                    {
                        long l = m.LParam.ToInt64();
                        worker.Post(unchecked((int)(l & 0xFFFFFFFF)), unchecked((int)(l >> 32)), m.WParam.ToInt32());
                    }
                    return;
            }
            base.WndProc(ref m);
        }

        void OnInput(IntPtr hRawInput)
        {
            uint size = 128;
            int got = Native.GetRawInputData(hRawInput, Native.RID_INPUT, buf, ref size, (uint)HeaderSize);
            if (got < HeaderSize + 8 || Marshal.ReadInt32(buf, 0) != Native.RIM_TYPEMOUSE) return;
            int flags = (ushort)Marshal.ReadInt16(buf, HeaderSize + 4);       // RAWMOUSE.usButtonFlags
            if ((flags & Native.RI_MOUSE_WHEEL) == 0) return;                 // 세로 휠만
            short delta = Marshal.ReadInt16(buf, HeaderSize + 6);             // RAWMOUSE.usButtonData
            Native.POINT p;
            if (delta == 0 || !Native.GetCursorPos(out p)) return;
            worker.Post(p.X, p.Y, delta);
        }
    }

    // ───────────────────────── 판정·실행 스레드 ─────────────────────────
    sealed class Worker
    {
        // 크롬 내부 명령 번호(chrome/app/chrome_command_ids.h). 2009년 이래 고정값.
        const int IDC_SELECT_NEXT_TAB = 34016, IDC_SELECT_PREVIOUS_TAB = 34017;
        const string ChromeTopClass = "Chrome_WidgetWin_1";
        const int WheelNotch = 120;

        struct Ev { public int X, Y, Delta, Tick; }
        sealed class Strip { public Native.RECT Win; public bool Has; public Native.RECT Rect; public int Tick; }
        sealed class Proc { public uint Pid; public bool IsChrome; }

        readonly object gate = new object();
        readonly Queue<Ev> queue = new Queue<Ev>();
        readonly Dictionary<IntPtr, Strip> strips = new Dictionary<IntPtr, Strip>();
        readonly Dictionary<IntPtr, Proc> procs = new Dictionary<IntPtr, Proc>();
        readonly CacheRequest cache = new CacheRequest();
        IntPtr accWin; int acc, accTick;

        public Worker()
        {
            cache.Add(AutomationElement.ClassNameProperty);
            cache.Add(AutomationElement.ControlTypeProperty);
            cache.Add(AutomationElement.BoundingRectangleProperty);
            cache.TreeFilter = Automation.RawViewCondition;
            Thread t = new Thread(Run);
            t.IsBackground = true;
            t.Name = "wheel-worker";
            t.Start();
        }

        public void Post(int x, int y, int delta)
        {
            lock (gate)
            {
                if (queue.Count >= 64) return;   // 밀리면 버린다
                Ev e; e.X = x; e.Y = y; e.Delta = delta; e.Tick = Environment.TickCount;
                queue.Enqueue(e);
                Monitor.Pulse(gate);
            }
        }

        void Run()
        {
            while (true)
            {
                Ev e;
                lock (gate)
                {
                    while (queue.Count == 0) Monitor.Wait(gate);
                    e = queue.Dequeue();
                }
                try { Handle(e); }
                catch (Exception ex) { acc = 0; Log.Write("판정 중 예외: " + ex.Message); }
            }
        }

        void Skip(string why, Ev e)
        {
            acc = 0;
            if (Program.DebugLog) Log.Write(string.Format("통과 ({0},{1}) d={2} : {3}", e.X, e.Y, e.Delta, why));
        }

        void Handle(Ev e)
        {
            if (unchecked(Environment.TickCount - e.Tick) > 400) { Skip("오래된 입력", e); return; }

            Native.POINT pt; pt.X = e.X; pt.Y = e.Y;
            IntPtr leaf = Native.WindowFromPoint(pt);
            if (leaf == IntPtr.Zero) { Skip("창 없음", e); return; }
            IntPtr root = Native.GetAncestor(leaf, Native.GA_ROOT);

            // ① 크롬의 최상위 창인가 (다른 프로그램·일렉트론 앱의 오작동을 여기서 차단)
            if (Native.ClassOf(root) != ChromeTopClass) { Skip("크롬 창 아님", e); return; }
            // ② 페이지 본문은 별도의 자식 창이다 → 본문 위의 휠은 여기서 끝(크롬에 아무것도 묻지 않는다)
            if (leaf != root && Native.ClassOf(leaf) != "Intermediate D3D Window") { Skip("페이지 본문", e); return; }
            if (!IsChrome(root)) { Skip("chrome.exe 아님", e); return; }

            // ③ 크롬이 알려 준 탭 줄 사각형 안인가
            Native.RECT strip;
            if (!TryGetStrip(root, out strip)) { Skip("탭 줄 없는 창", e); return; }
            if (pt.X < strip.Left || pt.X >= strip.Right || pt.Y < strip.Top || pt.Y >= strip.Bottom) { Skip("탭 줄 밖", e); return; }

            // 고해상도 휠·터치패드는 120 미만의 조각으로 온다 → 한 칸이 될 때까지 모은다
            if (root != accWin || (acc != 0 && Math.Sign(acc) != Math.Sign(e.Delta)) || unchecked(e.Tick - accTick) > 500) acc = 0;
            accWin = root; accTick = e.Tick; acc += e.Delta;
            int steps = acc / WheelNotch;
            acc -= steps * WheelNotch;
            int n = Math.Min(Math.Abs(steps), 5);
            if (!Program.DryRun)
                for (int i = 0; i < n; i++)
                    Native.PostMessage(root, Native.WM_COMMAND, (IntPtr)(steps > 0 ? IDC_SELECT_PREVIOUS_TAB : IDC_SELECT_NEXT_TAB), IntPtr.Zero);
            if (Program.DebugLog)
                Log.Write(n == 0
                    ? string.Format("누적 ({0},{1}) d={2} : 한 칸 미만({3}/120) hwnd={4}", e.X, e.Y, e.Delta, acc, (long)root)
                    : string.Format("전환 ({0},{1}) d={2} : {3} x{4} hwnd={5}{6}", e.X, e.Y, e.Delta, steps > 0 ? "이전" : "다음", n, (long)root, Program.DryRun ? " (dry-run: 명령 안 보냄)" : ""));
        }

        bool IsChrome(IntPtr root)
        {
            uint pid; Native.GetWindowThreadProcessId(root, out pid);
            Proc p;
            if (procs.TryGetValue(root, out p) && p.Pid == pid) return p.IsChrome;
            if (procs.Count > 64) procs.Clear();
            p = new Proc(); p.Pid = pid;
            IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
            if (h != IntPtr.Zero)
            {
                StringBuilder sb = new StringBuilder(1024); int len = sb.Capacity;
                if (Native.QueryFullProcessImageName(h, 0, sb, ref len))
                    p.IsChrome = string.Equals(Path.GetFileName(sb.ToString()), "chrome.exe", StringComparison.OrdinalIgnoreCase);
                Native.CloseHandle(h);
            }
            procs[root] = p;
            return p.IsChrome;
        }

        bool TryGetStrip(IntPtr root, out Native.RECT rect)
        {
            rect = new Native.RECT();
            Native.RECT wr;
            if (!Native.GetWindowRect(root, out wr)) return false;
            int now = Environment.TickCount;
            Strip s;
            // 창 위치·크기가 그대로이고 최근에 확인한 값이면 그대로 쓴다(휠 한 칸마다 크롬에 묻지 않도록)
            if (strips.TryGetValue(root, out s) && s.Win.Equals(wr) && unchecked(now - s.Tick) < (s.Has ? 5000 : 1500))
            {
                rect = s.Rect; return s.Has;
            }
            if (strips.Count > 32) strips.Clear();
            s = new Strip(); s.Win = wr; s.Tick = now;
            Stopwatch sw = Program.DebugLog ? Stopwatch.StartNew() : null;
            try { s.Has = FindStrip(root, wr, out s.Rect); }
            catch (Exception ex) { s.Has = false; if (Program.DebugLog) Log.Write("탭 줄 조회 실패: " + ex.GetType().Name + " " + ex.Message); }
            if (sw != null) Log.Write(string.Format("탭 줄 조회 hwnd={0} {1}ms → {2}", (long)root, sw.ElapsedMilliseconds,
                s.Has ? string.Format("[{0},{1} {2}x{3}]", s.Rect.Left, s.Rect.Top, s.Rect.Right - s.Rect.Left, s.Rect.Bottom - s.Rect.Top) : "없음"));
            strips[root] = s;
            rect = s.Rect;
            return s.Has;
        }

        // 크롬 창의 UI 트리를 얕게 훑어 가로 탭 줄 영역을 찾는다.
        // 웹 콘텐츠(문서) 쪽으로는 절대 내려가지 않는다 — 크롬의 페이지 접근성 기능을 깨우지 않기 위해서다.
        bool FindStrip(IntPtr root, Native.RECT wr, out Native.RECT rect)
        {
            rect = new Native.RECT();
            Queue<KeyValuePair<AutomationElement, int>> q = new Queue<KeyValuePair<AutomationElement, int>>();
            q.Enqueue(new KeyValuePair<AutomationElement, int>(AutomationElement.FromHandle(root), 0));
            int seen = 0;
            while (q.Count > 0 && seen < 300)
            {
                KeyValuePair<AutomationElement, int> cur = q.Dequeue();
                AutomationElementCollection kids;
                using (cache.Activate()) kids = cur.Key.FindAll(TreeScope.Children, Condition.TrueCondition);
                foreach (AutomationElement c in kids)
                {
                    seen++;
                    string cls = c.Cached.ClassName ?? "";
                    if (cls.IndexOf("TabStripRegionView", StringComparison.Ordinal) >= 0 && cls.IndexOf("Vertical", StringComparison.Ordinal) < 0)
                    {
                        System.Windows.Rect b = c.Cached.BoundingRectangle;
                        if (b.IsEmpty || b.Width < 1 || b.Height < 1) continue;   // 숨겨진 탭 줄(전체 화면, 세로 탭 모드 등)
                        Native.RECT r;
                        r.Left = (int)Math.Round(b.Left); r.Top = (int)Math.Round(b.Top);
                        r.Right = (int)Math.Round(b.Right); r.Bottom = (int)Math.Round(b.Bottom);
                        // 안전장치: 탭 줄이라기엔 너무 크거나 창 밖이면 믿지 않는다
                        int maxH = 120 * (int)Native.GetDpiForWindow(root) / 96;
                        if (r.Bottom - r.Top > maxH || r.Left < wr.Left - 2 || r.Right > wr.Right + 2 || r.Top < wr.Top - 2 || r.Bottom > wr.Bottom + 2) continue;
                        rect = r;
                        return true;
                    }
                    if (cur.Value < 6 && c.Cached.ControlType == ControlType.Pane
                        && cls != ChromeTopClass && cls != "Chrome_RenderWidgetHostHWND" && cls != "Intermediate D3D Window")
                        q.Enqueue(new KeyValuePair<AutomationElement, int>(c, cur.Value + 1));
                }
            }
            return false;
        }
    }

    // ───────────────────────── 자동 실행(현재 사용자) ─────────────────────────
    static class Autostart
    {
        const string RunKey = @"Software\Microsoft\Windows\CurrentVersion\Run";
        const string ApprovedKey = @"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
        static string Command { get { return "\"" + Application.ExecutablePath + "\""; } }

        public static bool IsEnabled()
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(RunKey))
                {
                    if (k == null || !string.Equals(k.GetValue(Program.AppName) as string, Command, StringComparison.OrdinalIgnoreCase)) return false;
                }
                // 작업 관리자 「시작 앱」에서 꺼 둔 경우(첫 바이트가 홀수)
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ApprovedKey))
                {
                    byte[] v = k == null ? null : k.GetValue(Program.AppName) as byte[];
                    if (v != null && v.Length > 0 && (v[0] & 1) == 1) return false;
                }
                return true;
            }
            catch { return false; }
        }

        public static void Set(bool on)
        {
            try
            {
                using (RegistryKey k = Registry.CurrentUser.CreateSubKey(RunKey))
                {
                    if (on) k.SetValue(Program.AppName, Command, RegistryValueKind.String);
                    else k.DeleteValue(Program.AppName, false);
                }
                using (RegistryKey k = Registry.CurrentUser.OpenSubKey(ApprovedKey, true))
                {
                    if (k != null) k.DeleteValue(Program.AppName, false);
                }
            }
            catch (Exception ex) { Log.Write("자동 실행 설정 실패: " + ex.Message); }
        }
    }

    // ───────────────────────── 기록(오류, 그리고 --debug 일 때의 판정) ─────────────────────────
    static class Log
    {
        static readonly object gate = new object();
        static readonly string path = Path.Combine(Path.GetDirectoryName(Application.ExecutablePath), Program.AppName + ".log");

        public static void Write(string msg)
        {
            try
            {
                lock (gate)
                {
                    FileInfo fi = new FileInfo(path);
                    if (fi.Exists && fi.Length > 512 * 1024) fi.Delete();
                    File.AppendAllText(path, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + "  " + msg + Environment.NewLine, Encoding.UTF8);
                }
            }
            catch { }
        }
    }

    // ───────────────────────── Win32 ─────────────────────────
    static class Native
    {
        public const int WM_CLOSE = 0x0010, WM_QUERYENDSESSION = 0x0011, WM_ENDSESSION = 0x0016, WM_INPUT = 0x00FF, WM_COMMAND = 0x0111;
        public const int WM_APP_FAKEWHEEL = 0x8000 + 0x57;
        public const uint RID_INPUT = 0x10000003, RIDEV_INPUTSINK = 0x00000100;
        public const int RIM_TYPEMOUSE = 0, RI_MOUSE_WHEEL = 0x0400;
        public const uint GA_ROOT = 2, PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        public const uint SEM_FAILCRITICALERRORS = 1, SEM_NOGPFAULTERRORBOX = 2, SEM_NOOPENFILEERRORBOX = 0x8000;
        public static readonly IntPtr DPI_PER_MONITOR_V2 = (IntPtr)(-4);

        [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X, Y; }
        [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
        [StructLayout(LayoutKind.Sequential)] public struct RAWINPUTDEVICE { public ushort usUsagePage, usUsage; public uint dwFlags; public IntPtr hwndTarget; }

        [DllImport("kernel32.dll")] public static extern uint SetErrorMode(uint mode);
        [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
        [DllImport("kernel32.dll")] public static extern bool TerminateProcess(IntPtr h, uint code);
        [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
        [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] public static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder name, ref int size);
        [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr value);
        [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
        [DllImport("user32.dll", SetLastError = true)] public static extern bool RegisterRawInputDevices([In] RAWINPUTDEVICE[] devices, uint count, int size);
        [DllImport("user32.dll")] public static extern int GetRawInputData(IntPtr hRawInput, uint command, IntPtr data, ref uint size, uint headerSize);
        [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
        [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
        [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h, uint flags);
        [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
        [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
        [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, int msg, IntPtr w, IntPtr l);

        [ThreadStatic] static StringBuilder clsBuf;
        public static string ClassOf(IntPtr h)
        {
            if (clsBuf == null) clsBuf = new StringBuilder(256);
            clsBuf.Length = 0;
            GetClassName(h, clsBuf, 256);
            return clsBuf.ToString();
        }
    }
}
