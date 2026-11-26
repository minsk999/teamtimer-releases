// 진단용 탐침 도구 — 크롬 창의 UI Automation 트리와 좌표별 판정을 눈으로 확인한다.
//   probe wins                 크롬 최상위 창 목록(클래스·프로세스·창 영역·DPI)
//   probe tree <hwnd> [depth]  창의 UIA 트리(문서 영역은 내려가지 않음)
//   probe point <x> <y>        그 좌표의 WindowFromPoint 결과와 UIA 요소의 조상 사슬
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

static class Probe
{
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr v);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h, uint f);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr h);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
    delegate bool EnumProc(IntPtr h, IntPtr l);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr l);
    [StructLayout(LayoutKind.Sequential)] struct POINT { public int X, Y; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int L, T, R, B; }

    static string Cls(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, 256); return s.ToString(); }
    static string Txt(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
    static string Cut(string s, int n) { if (s == null) return ""; s = s.Replace("\r", " ").Replace("\n", " "); return s.Length > n ? s.Substring(0, n) + "…" : s; }

    static int Main(string[] a)
    {
        SetProcessDpiAwarenessContext((IntPtr)(-4));
        Console.OutputEncoding = Encoding.UTF8;
        if (a.Length == 0) { Console.WriteLine("usage: wins | tree <hwnd> [depth] | point <x> <y>"); return 1; }
        if (a[0] == "wins") return Wins();
        if (a[0] == "tree") return Tree((IntPtr)long.Parse(a[1]), a.Length > 2 ? int.Parse(a[2]) : 7);
        if (a[0] == "point") return Point(int.Parse(a[1]), int.Parse(a[2]));
        if (a[0] == "mons") return Mons();
        if (a[0] == "tabs") return Tabs((IntPtr)long.Parse(a[1]));
        if (a[0] == "sel") { Console.WriteLine(Sel((IntPtr)long.Parse(a[1]))); return 0; }
        if (a[0] == "wheel") return Wheel(int.Parse(a[1]), int.Parse(a[2]), int.Parse(a[3]), a.Length > 4 ? int.Parse(a[4]) : 1);
        if (a[0] == "endsession") return EndSession(int.Parse(a[1]));
        if (a[0] == "sim")   // 커서를 건드리지 않는 가짜 휠: sim <x> <y> <delta> [count]  (ChromeTabWheel 을 --debug 로 띄웠을 때만)
        {
            IntPtr hw = FindWindow(null, "ChromeTabWheel.Hidden.7c1f2a");
            if (hw == IntPtr.Zero) { Console.WriteLine("ChromeTabWheel 이 실행 중이 아님"); return 5; }
            long l = ((long)int.Parse(a[2]) << 32) | (uint)int.Parse(a[1]);
            for (int i = 0; i < (a.Length > 4 ? int.Parse(a[4]) : 1); i++) { PostMessage(hw, 0x8057, (IntPtr)int.Parse(a[3]), (IntPtr)l); System.Threading.Thread.Sleep(150); }
            System.Threading.Thread.Sleep(250);
            return 0;
        }
        if (a[0] == "show") { ShowWindow((IntPtr)long.Parse(a[1]), int.Parse(a[2])); return 0; }   // 3=최대화 9=복원
        if (a[0] == "close") { PostMessage((IntPtr)long.Parse(a[1]), 0x0010, IntPtr.Zero, IntPtr.Zero); return 0; }
        if (a[0] == "fg") { Console.WriteLine("SetForegroundWindow=" + SetForegroundWindow((IntPtr)long.Parse(a[1])) + " fg=" + (long)GetForegroundWindow()); return 0; }
        if (a[0] == "cmd") { Console.WriteLine("post=" + PostMessage((IntPtr)long.Parse(a[1]), 0x0111, (IntPtr)int.Parse(a[2]), IntPtr.Zero) + " fg=" + (long)GetForegroundWindow()); return 0; }
        if (a[0] == "move") { SetWindowPos((IntPtr)long.Parse(a[1]), IntPtr.Zero, int.Parse(a[2]), int.Parse(a[3]), int.Parse(a[4]), int.Parse(a[5]), 0x0014); return 0; }
        return 1;
    }

    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint f);
    delegate bool MonProc(IntPtr hMon, IntPtr hdc, ref RECT r, IntPtr d);
    [DllImport("user32.dll")] static extern bool EnumDisplayMonitors(IntPtr hdc, IntPtr clip, MonProc cb, IntPtr d);
    [DllImport("shcore.dll")] static extern int GetDpiForMonitor(IntPtr hMon, int type, out uint x, out uint y);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern IntPtr FindWindow(string cls, string title);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();

    // 탭 줄 영역을 찾는다 — 문서(웹 콘텐츠) 쪽으로는 내려가지 않는 얕은 너비 우선 탐색
    static AutomationElement FindRegion(IntPtr h)
    {
        var q = new Queue<KeyValuePair<AutomationElement, int>>();
        q.Enqueue(new KeyValuePair<AutomationElement, int>(AutomationElement.FromHandle(h), 0));
        int n = 0;
        while (q.Count > 0 && n < 300)
        {
            var cur = q.Dequeue();
            if (cur.Value >= 7) continue;
            foreach (AutomationElement c in cur.Key.FindAll(TreeScope.Children, Condition.TrueCondition))
            {
                n++;
                string cls = c.Current.ClassName; var t = c.Current.ControlType;
                if (cls.Contains("TabStripRegionView") && !cls.Contains("Vertical") && !c.Current.BoundingRectangle.IsEmpty) return c;
                if (t == ControlType.Pane && cls != "Chrome_WidgetWin_1" && cls != "Chrome_RenderWidgetHostHWND" && cls != "Intermediate D3D Window")
                    q.Enqueue(new KeyValuePair<AutomationElement, int>(c, cur.Value + 1));
            }
        }
        return null;
    }

    static int Tabs(IntPtr h)
    {
        var sw = Stopwatch.StartNew();
        var region = FindRegion(h);
        if (region == null) { Console.WriteLine("탭 줄 없음 ({0} ms)", sw.ElapsedMilliseconds); return 3; }
        long t1 = sw.ElapsedMilliseconds;
        Console.WriteLine("region " + Desc(region));
        var items = region.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
        int i = 0;
        foreach (AutomationElement it in items)
        {
            object p; bool sel = false;
            if (it.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p)) sel = ((SelectionItemPattern)p).Current.IsSelected;
            Console.WriteLine("  [{0}]{1} {2}", i++, sel ? "*" : " ", Cut(it.Current.Name, 40));
        }
        Console.WriteLine("-- region {0} ms, 전체 {1} ms, fg={2}", t1, sw.ElapsedMilliseconds, (long)GetForegroundWindow());
        return 0;
    }

    // 선택된 탭 번호/전체 탭 수/현재 포그라운드 창
    static string Sel(IntPtr h)
    {
        var region = FindRegion(h);
        if (region == null) return "탭 줄 없음";
        var items = region.FindAll(TreeScope.Descendants, new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
        int i = 0, sel = -1;
        foreach (AutomationElement it in items)
        {
            object p;
            if (it.TryGetCurrentPattern(SelectionItemPattern.Pattern, out p) && ((SelectionItemPattern)p).Current.IsSelected) sel = i;
            i++;
        }
        return string.Format("선택={0}/{1} fg={2}", sel, i, (long)GetForegroundWindow());
    }

    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy, mouseData; public uint dwFlags, time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public MOUSEINPUT mi; }
    [DllImport("user32.dll")] static extern uint SendInput(uint n, INPUT[] inp, int size);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);

    // (x,y)로 커서를 옮기고 휠 입력을 count 번 주입한 뒤 커서를 원래 자리로 돌려놓는다
    static int Wheel(int x, int y, int delta, int count)
    {
        POINT old; GetCursorPos(out old);
        SetCursorPos(x, y); System.Threading.Thread.Sleep(120);
        for (int i = 0; i < count; i++)
        {
            var inp = new INPUT[1]; inp[0].type = 0; inp[0].mi.mouseData = delta; inp[0].mi.dwFlags = 0x0800;   // MOUSEEVENTF_WHEEL
            SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
            System.Threading.Thread.Sleep(150);
        }
        System.Threading.Thread.Sleep(250);
        SetCursorPos(old.X, old.Y);
        return 0;
    }

    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
    [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
    [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr h, out uint code);
    [DllImport("user32.dll")] static extern IntPtr SendMessageTimeout(IntPtr h, uint m, IntPtr w, IntPtr l, uint flags, uint ms, out IntPtr res);

    // 윈도우가 종료·로그오프 때 보내는 것과 같은 메시지(WM_QUERYENDSESSION → WM_ENDSESSION)를 그 프로세스의 창들에 보낸다
    static int EndSession(int pid)
    {
        Process p = Process.GetProcessById(pid);
        string pname = p.ProcessName;
        IntPtr hp = OpenProcess(0x00101000, false, pid);   // SYNCHRONIZE | QUERY_LIMITED_INFORMATION
        var wins = new List<IntPtr>();
        EnumWindows((h, l) => { uint wp; GetWindowThreadProcessId(h, out wp); if (wp == pid) wins.Add(h); return true; }, IntPtr.Zero);
        Console.WriteLine("{0}(pid {1}) 최상위 창 {2}개", pname, pid, wins.Count);
        var sw = Stopwatch.StartNew();
        bool veto = false;
        foreach (IntPtr h in wins)
        {
            IntPtr res; IntPtr ok = SendMessageTimeout(h, 0x0011, IntPtr.Zero, IntPtr.Zero, 0x0002, 5000, out res);
            Console.WriteLine("  QUERYENDSESSION → hwnd={0} '{1}' 응답={2}{3}", (long)h, Cls(h), (long)res, ok == IntPtr.Zero ? " (시간 초과/실패)" : "");
            if (ok == IntPtr.Zero || res == IntPtr.Zero) veto = true;
        }
        long tq = sw.ElapsedMilliseconds;
        foreach (IntPtr h in wins)
        {
            IntPtr res; SendMessageTimeout(h, 0x0016, (IntPtr)(veto ? 0 : 1), IntPtr.Zero, 0x0002, 5000, out res);
            if (WaitForSingleObject(hp, 0) == 0) break;
        }
        bool exited = WaitForSingleObject(hp, 5000) == 0;
        long tAll = sw.ElapsedMilliseconds;
        uint code = 0; if (exited) GetExitCodeProcess(hp, out code);
        Console.WriteLine("  질의 {0}ms, 종료까지 {1}ms, 종료됨={2}{3}", tq, tAll, exited, exited ? " 종료코드=" + code : "");
        if (!exited)
            EnumWindows((h, l) => { uint wp; GetWindowThreadProcessId(h, out wp); if (wp == pid && IsWindowVisible(h)) Console.WriteLine("  남은 창: '{0}' '{1}'", Cls(h), Txt(h)); return true; }, IntPtr.Zero);
        return exited ? 0 : 4;
    }

    static int Mons()
    {
        EnumDisplayMonitors(IntPtr.Zero, IntPtr.Zero, (IntPtr m, IntPtr dc, ref RECT r, IntPtr d) =>
        {
            uint dx, dy; GetDpiForMonitor(m, 0, out dx, out dy);
            Console.WriteLine("monitor [{0},{1} {2}x{3}] dpi={4}", r.L, r.T, r.R - r.L, r.B - r.T, dx);
            return true;
        }, IntPtr.Zero);
        return 0;
    }

    static int Wins()
    {
        EnumWindows((h, l) =>
        {
            if (!IsWindowVisible(h)) return true;
            string c = Cls(h);
            if (!c.StartsWith("Chrome_WidgetWin")) return true;
            uint pid; GetWindowThreadProcessId(h, out pid);
            string exe = "?"; try { exe = Process.GetProcessById((int)pid).ProcessName; } catch { }
            RECT r; GetWindowRect(h, out r);
            Console.WriteLine("{0}\t{1}\t{2}(pid {3})\tdpi={4}\t[{5},{6} {7}x{8}]\towner={9}\t{10}",
                (long)h, c, exe, pid, GetDpiForWindow(h), r.L, r.T, r.R - r.L, r.B - r.T, (long)GetWindow(h, 4), Cut(Txt(h), 50));
            return true;
        }, IntPtr.Zero);
        return 0;
    }

    static string Desc(AutomationElement e)
    {
        try
        {
            var c = e.Current; var r = c.BoundingRectangle;
            string rect = r.IsEmpty ? "(empty)" : string.Format("[{0},{1} {2}x{3}]", (int)r.X, (int)r.Y, (int)r.Width, (int)r.Height);
            return string.Format("{0} cls='{1}' name='{2}' {3}{4}", c.ControlType.ProgrammaticName.Replace("ControlType.", ""), c.ClassName, Cut(c.Name, 40), rect, c.IsOffscreen ? " offscreen" : "");
        }
        catch (Exception ex) { return "<" + ex.GetType().Name + ">"; }
    }

    static int Tree(IntPtr h, int maxDepth)
    {
        var sw = Stopwatch.StartNew();
        var root = AutomationElement.FromHandle(h);
        int n = 0; Walk(root, 0, maxDepth, ref n);
        Console.WriteLine("-- {0} nodes, {1} ms", n, sw.ElapsedMilliseconds);
        return 0;
    }

    static void Walk(AutomationElement e, int d, int max, ref int n)
    {
        n++;
        Console.WriteLine(new string(' ', d * 2) + Desc(e));
        if (d >= max || n > 400) return;
        ControlType t; string cls;
        try { t = e.Current.ControlType; cls = e.Current.ClassName; } catch { return; }
        if (t == ControlType.Document || cls == "Chrome_RenderWidgetHostHWND") { Console.WriteLine(new string(' ', d * 2 + 2) + "(문서 영역 — 생략)"); return; }
        var w = TreeWalker.RawViewWalker;
        AutomationElement ch = null;
        try { ch = w.GetFirstChild(e); } catch { }
        int k = 0;
        while (ch != null)
        {
            if (++k > 40) { Console.WriteLine(new string(' ', d * 2 + 2) + "(형제 40개 초과 — 생략)"); break; }
            Walk(ch, d + 1, max, ref n);
            try { ch = w.GetNextSibling(ch); } catch { ch = null; }
        }
    }

    static int Point(int x, int y)
    {
        var p = new POINT { X = x, Y = y };
        IntPtr leaf = WindowFromPoint(p), root = GetAncestor(leaf, 2);
        Console.WriteLine("leaf={0} '{1}'  root={2} '{3}'  same={4}", (long)leaf, Cls(leaf), (long)root, Cls(root), leaf == root);
        var sw = Stopwatch.StartNew();
        AutomationElement e;
        try { e = AutomationElement.FromPoint(new System.Windows.Point(x, y)); }
        catch (Exception ex) { Console.WriteLine("FromPoint 실패: " + ex.Message); return 2; }
        long t1 = sw.ElapsedMilliseconds;
        var w = TreeWalker.RawViewWalker;
        for (int i = 0; e != null && i < 14; i++)
        {
            Console.WriteLine("  ^{0} {1}", i, Desc(e));
            try { e = w.GetParent(e); } catch { e = null; }
        }
        Console.WriteLine("-- FromPoint {0} ms, 전체 {1} ms", t1, sw.ElapsedMilliseconds);
        return 0;
    }
}
