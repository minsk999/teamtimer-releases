// 크롬 탭 휠 (ChromeTabWheel) — macOS 판
//
// 크롬 탭 줄 위에서 마우스 휠을 굴리면 탭이 넘어간다. 휠 위 = 이전 탭, 휠 아래 = 다음 탭.
// 윈도우판(.NET, Raw Input + WM_COMMAND)과 같은 성격으로 만든다:
//   - 휠 이벤트를 가로채지 않고 지켜보기만 한다(전역 모니터). 크롬 쪽 동작을 막지 않는다.
//   - 탭 전환은 크롬 AppleScript 로 "커서 아래 그 창"의 active tab index 를 바꾼다 → 포커스가 안 바뀐다.
//   - 필요한 권한은 「자동화 → Google Chrome」 하나. (스크롤 감시는 권한이 필요 없다)
//   - 「손쉬운 사용」 권한이 있으면 탭 줄 위치를 크롬에 직접 물어 정확히 판정한다(윈도우판의 UI Automation 과 같은 역할).
//     없으면 예전처럼 "창 위쪽 고정 높이"로 판정한다.
//
// 옵션: --autostart=on / --autostart=off (성공 시 종료 코드 0), --quit (실행 중인 것을 정상 종료),
//       --debug (판정 과정을 로그에 남김), --dry-run (판정만 하고 탭은 안 바꿈), --version,
//       --probe [--tree] (떠 있는 크롬 창마다 탭 줄 판정 결과를 출력하고 끝 — 진단·CI 용)
// 로그: ~/Library/Logs/ChromeTabWheel.log  (오류는 항상, 판정 과정은 --debug 일 때만)

import AppKit
import ApplicationServices

let appVersion = "1.0.1"
let appTitle = "크롬 탭 휠"
let bundleID = "kr.co.adef.chrometabwheel"
let quitNotification = Notification.Name("kr.co.adef.chrometabwheel.quit")
let chromeBundleIDs: Set<String> = [
    "com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.dev", "com.google.Chrome.canary",
]

// MARK: - 로그

enum Log {
    static var debug = false
    static let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/ChromeTabWheel.log")
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        return f
    }()

    static func write(_ message: String) {
        let line = "\(formatter.string(from: Date())) \(message)\n"
        guard let data = line.data(using: .utf8) else { return }
        let fm = FileManager.default
        if let attrs = try? fm.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? NSNumber, size.intValue > 1_000_000 {
            try? fm.removeItem(at: url)
        }
        if let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            handle.closeFile()
        } else {
            try? fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try? data.write(to: url)
        }
    }

    static func d(_ message: @autoclosure () -> String) {
        if debug { write(message()) }
    }
}

// MARK: - 로그인 시 자동 실행 (LaunchAgent)

enum Autostart {
    static let label = "kr.co.adef.chrometabwheel"
    static var plistURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }

    static var isOn: Bool { FileManager.default.fileExists(atPath: plistURL.path) }

    /// 등록된 실행 파일 경로. 앱을 옮긴 뒤에 다시 맞추는 데 쓴다.
    static var registeredPath: String? {
        guard let dict = NSDictionary(contentsOf: plistURL),
              let args = dict["ProgramArguments"] as? [String] else { return nil }
        return args.first
    }

    @discardableResult
    static func set(_ on: Bool) -> Bool {
        let fm = FileManager.default
        do {
            if on {
                guard let exe = Bundle.main.executablePath else {
                    Log.write("자동 실행 등록 실패: 실행 파일 경로를 알 수 없음")
                    return false
                }
                let dict: [String: Any] = [
                    "Label": label,
                    "ProgramArguments": [exe, "--autostart"],
                    "RunAtLoad": true,
                    "ProcessType": "Interactive",
                    "LimitLoadToSessionType": "Aqua",
                ]
                try fm.createDirectory(at: plistURL.deletingLastPathComponent(), withIntermediateDirectories: true)
                let data = try PropertyListSerialization.data(fromPropertyList: dict, format: .xml, options: 0)
                try data.write(to: plistURL, options: .atomic)
            } else if isOn {
                try fm.removeItem(at: plistURL)
            }
            return true
        } catch {
            Log.write("자동 실행 \(on ? "등록" : "해제") 실패: \(error.localizedDescription)")
            return false
        }
    }
}

// MARK: - 크롬 창 찾기

struct ChromeWindow {
    let pid: pid_t
    let bundleID: String
    let bounds: CGRect   // 전역 좌표(왼쪽 위 원점, 포인트) — AppleScript 의 bounds 와 같은 체계
}

enum WindowFinder {
    /// 휠 이벤트가 향하는 창. 이벤트에 창 번호가 있으면 그걸 쓰고, 없으면 좌표로 맨 앞 일반 창을 찾는다.
    static func window(for event: NSEvent, at point: CGPoint) -> (ChromeWindow?, String) {
        var windowID = 0
        if let cg = event.cgEvent, let field = CGEventField(rawValue: 91) {   // kCGMouseEventWindowUnderMousePointer
            windowID = Int(cg.getIntegerValueField(field))
        }
        if windowID == 0 { windowID = event.windowNumber }

        if windowID > 0,
           let list = CGWindowListCopyWindowInfo([.optionIncludingWindow], CGWindowID(windowID)) as? [[String: Any]],
           let info = list.first {
            return classify(info, point: point, viaID: true)
        }

        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]] else { return (nil, "창 목록 없음") }
        let myPID = getpid()
        for info in list {
            guard let rect = bounds(of: info), rect.contains(point) else { continue }
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
            if layer != 0 { continue }   // 메뉴 막대·독·오버레이는 건너뛴다
            let alpha = (info[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 1
            if alpha < 0.01 { continue }
            let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
            if pid == myPID { continue }
            return classify(info, point: point, viaID: false)
        }
        return (nil, "창 없음")
    }

    static func bounds(of info: [String: Any]) -> CGRect? {
        guard let dict = info[kCGWindowBounds as String] as? NSDictionary else { return nil }
        return CGRect(dictionaryRepresentation: dict as CFDictionary)
    }

    private static func classify(_ info: [String: Any], point: CGPoint, viaID: Bool) -> (ChromeWindow?, String) {
        let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
        guard let app = NSRunningApplication(processIdentifier: pid),
              let bid = app.bundleIdentifier, chromeBundleIDs.contains(bid) else {
            return (nil, "크롬 창 아님")
        }
        let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
        if layer != 0 { return (nil, "크롬 일반 창 아님(layer \(layer))") }
        guard let rect = bounds(of: info) else { return (nil, "창 크기 없음") }
        return (ChromeWindow(pid: pid, bundleID: bid, bounds: rect), viaID ? "창 번호" : "좌표")
    }
}

// MARK: - 탭 줄 위치 (손쉬운 사용 API)

/// 크롬에 "이 창의 탭 줄이 어디냐"를 직접 묻는다.
enum TabStrip {
    enum Lookup {
        case strip(CGRect)          // 가로 탭 줄(탭 목록)의 화면 사각형
        case none                   // 탭 줄이 없는 창(앱 창·팝업·전체 화면 영상·세로 탭)
        case unavailable(String)    // 물어볼 수 없음(권한 없음 등) — 호출 쪽이 고정 높이 규칙으로 물러난다
    }

    static var trusted: Bool { AXIsProcessTrusted() }

    /// 이 역할 아래로는 내려가지 않는다. 탭 줄이 들어 있을 수 없고, 웹 페이지 쪽은 크롬의 페이지 접근성을 깨운다.
    private static let leafRoles: Set<String> = [
        "AXWebArea", "AXToolbar", "AXButton", "AXRadioButton", "AXTextField", "AXStaticText",
        "AXImage", "AXMenuButton", "AXPopUpButton", "AXCheckBox",
    ]

    // 휠 한 칸마다 묻지 않도록 마지막 결과를 잠깐 재사용한다(창 위치·크기가 바뀌면 다시 묻는다).
    private static var cached: (pid: pid_t, bounds: CGRect, at: TimeInterval, result: Lookup)?

    static func lookup(_ window: ChromeWindow) -> Lookup {
        let now = ProcessInfo.processInfo.systemUptime
        if let c = cached, c.pid == window.pid, c.bounds == window.bounds {
            var ttl: TimeInterval = 5
            if case .unavailable = c.result { ttl = 1.5 }
            if now - c.at < ttl { return c.result }
        }
        let result = find(window)
        cached = (window.pid, window.bounds, now, result)
        return result
    }

    struct Node {
        var role = ""
        var frame: CGRect?
        var children: [AXUIElement] = []
    }

    /// 역할·위치·크기·자식을 한 번의 왕복으로 읽는다.
    static func node(_ element: AXUIElement) -> Node {
        let names = [kAXRoleAttribute, kAXPositionAttribute, kAXSizeAttribute, kAXChildrenAttribute] as CFArray
        var values: CFArray?
        guard AXUIElementCopyMultipleAttributeValues(element, names, AXCopyMultipleAttributeOptions(rawValue: 0), &values) == .success,
              let v = values as? [AnyObject], v.count == 4 else { return Node() }
        var n = Node()
        n.role = v[0] as? String ?? ""
        var origin = CGPoint.zero
        var size = CGSize.zero
        if axValue(v[1], .cgPoint, &origin), axValue(v[2], .cgSize, &size) {
            n.frame = CGRect(origin: origin, size: size)
        }
        n.children = v[3] as? [AXUIElement] ?? []
        return n
    }

    private static func axValue<T>(_ object: AnyObject, _ type: AXValueType, _ out: inout T) -> Bool {
        guard CFGetTypeID(object) == AXValueGetTypeID() else { return false }
        let value = object as! AXValue
        return AXValueGetType(value) == type && AXValueGetValue(value, type, &out)
    }

    private static func near(_ a: CGRect, _ b: CGRect) -> Bool {
        abs(a.minX - b.minX) <= 3 && abs(a.minY - b.minY) <= 3 && abs(a.maxX - b.maxX) <= 3 && abs(a.maxY - b.maxY) <= 3
    }

    /// 화면의 그 창에 해당하는 손쉬운 사용 창 요소.
    /// shortcut: 위치·크기로 맞춘다(탭 전환 스크립트와 같은 기준). 똑같은 자리에 겹쳐 놓인 창 둘은 구별 못 한다 — 문제가 되면 창 번호로 맞추도록 바꾼다.
    static func axWindow(for window: ChromeWindow) -> AXUIElement? {
        let app = AXUIElementCreateApplication(window.pid)
        AXUIElementSetMessagingTimeout(app, 0.3)   // 크롬이 바쁠 때 휠 처리(메인 스레드)가 오래 멈추지 않게
        var value: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &value) == .success,
              let windows = value as? [AXUIElement] else { return nil }
        return windows.first { w in
            guard let f = node(w).frame else { return false }
            return near(f, window.bounds)
        }
    }

    private static func find(_ window: ChromeWindow) -> Lookup {
        guard trusted else { return .unavailable("손쉬운 사용 권한 없음") }
        guard let root = axWindow(for: window) else { return .unavailable("창 요소를 못 찾음") }
        let top = window.bounds.minY
        // 창의 UI 트리를 얕게 훑는다(너비 우선). 탭 줄은 창 맨 위에 있으므로 그 아래에서 시작하는 요소는 들여다보지 않는다.
        var queue: [(element: AXUIElement, depth: Int)] = [(root, 0)]
        var head = 0
        while head < queue.count && head < 300 {
            let (element, depth) = queue[head]
            head += 1
            let n = node(element)
            if depth > 0 {
                guard let f = n.frame, f.minY <= top + 60, f.maxY > top else { continue }
                if n.role == "AXTabGroup" {
                    // "창 맨 위의 가로로 긴 줄"만 탭 줄로 인정한다(세로 탭 목록 등은 제외)
                    if f.height >= 10, f.height <= 80, f.width >= f.height * 2,
                       f.minX >= window.bounds.minX - 2, f.maxX <= window.bounds.maxX + 2 {
                        return .strip(f)
                    }
                    continue
                }
                if leafRoles.contains(n.role) { continue }
            }
            if depth < 10 {
                for child in n.children { queue.append((child, depth + 1)) }
            }
        }
        return .none
    }

    /// 진단용: 창 위쪽 띠에 걸친 요소들을 출력한다.
    static func dump(_ window: ChromeWindow) {
        guard let root = axWindow(for: window) else { print("    (창 요소를 못 찾음)"); return }
        let top = window.bounds.minY
        var lines = 0
        func walk(_ element: AXUIElement, _ depth: Int) {
            if lines >= 150 || depth > 10 { return }
            let n = node(element)
            if depth > 0 {
                guard let f = n.frame, f.minY <= top + 130, f.maxY > top else { return }
            }
            var extra = ""
            for name in [kAXSubroleAttribute, kAXTitleAttribute, kAXDescriptionAttribute] {
                var value: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, name as CFString, &value) == .success,
                   let s = value as? String, !s.isEmpty {
                    extra += " \(name)='\(s.prefix(30))'"
                }
            }
            let frame = n.frame.map { "[\(Int($0.minX)),\(Int($0.minY)) \(Int($0.width))x\(Int($0.height))]" } ?? "(위치 없음)"
            print("    " + String(repeating: "  ", count: depth) + "\(n.role) \(frame) 자식 \(n.children.count)\(extra)")
            lines += 1
            if leafRoles.contains(n.role) && n.role != "AXToolbar" { return }
            for child in n.children { walk(child, depth + 1) }
        }
        walk(root, 0)
    }
}

// MARK: - 탭 줄 위인지 판정

enum Judge {
    /// (탭 줄 위인가, 이유). fallbackHeight 는 크롬에 물어볼 수 없을 때 쓰는 고정 높이.
    static func verdict(_ window: ChromeWindow, _ point: CGPoint, fallbackHeight: CGFloat) -> (Bool, String) {
        let offset = point.y - window.bounds.minY
        // 창 위쪽이 아니면(본문 스크롤) 크롬에 묻지 않고 여기서 끝낸다.
        if offset < 0 || offset > 150 { return (false, "탭 줄 밖 (위에서 \(Int(offset))pt)") }
        switch TabStrip.lookup(window) {
        case .strip(let r):
            // 창 맨 위부터 탭 줄 아래 끝까지(가로는 창 전체 — 탭 오른쪽 빈 곳 포함)
            return point.y < r.maxY
                ? (true, "탭 줄 [크롬 확인 \(Int(r.maxY - window.bounds.minY))pt]")
                : (false, "탭 줄 밖 [크롬 확인, 위에서 \(Int(offset))pt]")
        case .none:
            return (false, "탭 줄 없는 창 [크롬 확인]")
        case .unavailable(let why):
            return offset <= fallbackHeight
                ? (true, "탭 줄 [고정 \(Int(fallbackHeight))pt — \(why)]")
                : (false, "탭 줄 밖 [고정 \(Int(fallbackHeight))pt, 위에서 \(Int(offset))pt — \(why)]")
        }
    }
}

// MARK: - 진단 (--probe)

enum Probe {
    /// 떠 있는 크롬 창마다 탭 줄 판정을 출력한다. 종료 코드: 0 = 탭 줄을 찾은 창이 있음, 2 = 권한 없음, 3 = 못 찾음.
    static func run(tree: Bool) -> Int32 {
        print("ChromeTabWheel \(appVersion) — 손쉬운 사용 권한: \(TabStrip.trusted ? "있음" : "없음")")
        guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]] else { print("창 목록 없음"); return 3 }
        var found = 0
        for info in list {
            let pid = (info[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value ?? 0
            let layer = (info[kCGWindowLayer as String] as? NSNumber)?.intValue ?? 0
            guard layer == 0, let app = NSRunningApplication(processIdentifier: pid),
                  let bid = app.bundleIdentifier, chromeBundleIDs.contains(bid),
                  let rect = WindowFinder.bounds(of: info), rect.width > 100, rect.height > 100 else { continue }
            let window = ChromeWindow(pid: pid, bundleID: bid, bounds: rect)
            print("창 [\(Int(rect.minX)),\(Int(rect.minY)) \(Int(rect.width))x\(Int(rect.height))]")
            switch TabStrip.lookup(window) {
            case .strip(let r):
                found += 1
                print("  탭 줄 [\(Int(r.minX)),\(Int(r.minY)) \(Int(r.width))x\(Int(r.height))]")
            case .none: print("  탭 줄 없음")
            case .unavailable(let why): print("  판정 불가: \(why)")
            }
            for dy in [2, 20, 38, 44, 60, 300] as [CGFloat] {
                let (on, why) = Judge.verdict(window, CGPoint(x: rect.midX, y: rect.minY + dy), fallbackHeight: 40)
                print("  위에서 \(Int(dy))pt → \(on ? "전환" : "통과") : \(why)")
            }
            if tree { TabStrip.dump(window) }
        }
        if !TabStrip.trusted { return 2 }
        return found > 0 ? 0 : 3
    }
}

// MARK: - 탭 전환 (크롬 AppleScript)

enum TabSwitcher {
    enum Result { case ok(String), noWindow, denied, failed(String) }

    static func switchTabs(in window: ChromeWindow, by steps: Int) -> Result {
        let b = window.bounds
        let l = Int(b.minX.rounded()), t = Int(b.minY.rounded())
        let r = Int(b.maxX.rounded()), btm = Int(b.maxY.rounded())
        let source = """
        on near(a, b)
        	return ((a - b) ≤ 3) and ((b - a) ≤ 3)
        end near
        tell application id "\(window.bundleID)"
        	set bs to bounds of every window
        	repeat with k from 1 to count of bs
        		set wb to item k of bs
        		if my near(item 1 of wb, \(l)) and my near(item 2 of wb, \(t)) and my near(item 3 of wb, \(r)) and my near(item 4 of wb, \(btm)) then
        			set c to count of tabs of window k
        			if c < 2 then return "탭 " & c & "개"
        			set i to ((active tab index of window k) - 1 + (\(steps))) mod c
        			if i < 0 then set i to i + c
        			set active tab index of window k to i + 1
        			return "→ " & (i + 1) & "/" & c
        		end if
        	end repeat
        	return "nowin"
        end tell
        """
        guard let script = NSAppleScript(source: source) else { return .failed("스크립트 생성 실패") }
        var error: NSDictionary?
        let output = script.executeAndReturnError(&error)
        if let error = error {
            let number = (error[NSAppleScript.errorNumber] as? NSNumber)?.intValue ?? 0
            let message = error[NSAppleScript.errorMessage] as? String ?? "?"
            if number == -1743 || number == -10004 { return .denied }
            return .failed("\(number) \(message)")
        }
        let text = output.stringValue ?? ""
        return text == "nowin" ? .noWindow : .ok(text)
    }

    /// 실행 중인 크롬에 가벼운 질의를 한 번 보내, 처음이면 macOS 의 자동화 허용 창이 뜨게 한다.
    static func preflight() -> Result? {
        guard let chrome = NSWorkspace.shared.runningApplications.first(where: {
            chromeBundleIDs.contains($0.bundleIdentifier ?? "")
        }), let bid = chrome.bundleIdentifier else { return nil }
        guard let script = NSAppleScript(source: "tell application id \"\(bid)\" to count windows") else { return nil }
        var error: NSDictionary?
        _ = script.executeAndReturnError(&error)
        if let error = error {
            let number = (error[NSAppleScript.errorNumber] as? NSNumber)?.intValue ?? 0
            if number == -1743 || number == -10004 { return .denied }
            return .failed("\(number)")
        }
        return .ok("")
    }
}

// MARK: - 휠 판정

final class WheelHandler {
    var enabled = true
    var dryRun = false
    var onDenied: (() -> Void)?
    var onAllowed: (() -> Void)?

    /// 손쉬운 사용 권한이 없어 크롬에 물어볼 수 없을 때만 쓴다: 창 맨 위에서 이 높이(포인트)까지를 탭 줄로 본다.
    /// 필요하면: defaults write kr.co.adef.chrometabwheel tabStripHeight -int 44
    var stripHeight: CGFloat {
        let v = UserDefaults.standard.integer(forKey: "tabStripHeight")
        return v > 0 ? CGFloat(v) : 40
    }

    private var accumulated: CGFloat = 0
    private var lastContinuous: TimeInterval = 0
    private var pendingWindow: ChromeWindow?
    private var pendingSteps = 0
    private var flushScheduled = false

    func handle(_ event: NSEvent) {
        guard enabled else { return }
        if !event.momentumPhase.isEmpty { return }   // 트랙패드 관성 스크롤은 무시

        let dy = event.scrollingDeltaY
        let dx = event.scrollingDeltaX
        if dy == 0 || abs(dx) > abs(dy) { return }   // 가로 스크롤은 건드리지 않는다

        // 물리적 방향으로 맞춘다(「자연스러운 스크롤」 설정과 무관하게 휠 위 = 이전 탭).
        let towardTop = (dy > 0) != event.isDirectionInvertedFromDevice
        var steps = 0
        if event.hasPreciseScrollingDeltas {
            // 트랙패드·매직 마우스: 일정량이 쌓일 때마다 한 칸
            let now = event.timestamp
            if event.phase.contains(.began) || now - lastContinuous > 0.35 { accumulated = 0 }
            lastContinuous = now
            accumulated += towardTop ? abs(dy) : -abs(dy)
            if abs(accumulated) < 30 {
                Log.d("누적 \(Int(accumulated))/30")
                return
            }
            steps = accumulated > 0 ? -1 : 1
            accumulated = 0
        } else {
            steps = towardTop ? -1 : 1   // 일반 휠: 한 눈금 = 한 칸
        }

        let point = event.cgEvent?.location ?? CGPoint.zero
        let (found, how) = WindowFinder.window(for: event, at: point)
        guard let window = found else {
            Log.d("통과 (\(Int(point.x)),\(Int(point.y))) : \(how)")
            return
        }
        let (onStrip, why) = Judge.verdict(window, point, fallbackHeight: stripHeight)
        guard onStrip else {
            Log.d("통과 (\(Int(point.x)),\(Int(point.y))) : \(why)")
            return
        }
        Log.d("전환 (\(Int(point.x)),\(Int(point.y))) d=\(dy) 칸=\(steps) [\(how)] \(why) \(window.bounds)")
        enqueue(window, steps)
    }

    // 스크립트가 도는 동안 들어온 눈금은 모아서 한 번에 보낸다.
    private func enqueue(_ window: ChromeWindow, _ steps: Int) {
        if let pending = pendingWindow, pending.pid != window.pid || pending.bounds != window.bounds {
            flush()
        }
        pendingWindow = window
        pendingSteps += steps
        if !flushScheduled {
            flushScheduled = true
            DispatchQueue.main.async { [weak self] in self?.flush() }
        }
    }

    private func flush() {
        flushScheduled = false
        guard let window = pendingWindow else { return }
        let steps = pendingSteps
        pendingWindow = nil
        pendingSteps = 0
        if steps == 0 { return }
        if dryRun {
            Log.d("(dry-run: 명령 안 보냄) 칸=\(steps)")
            return
        }
        let started = Date()
        let result = TabSwitcher.switchTabs(in: window, by: steps)
        let ms = Int(Date().timeIntervalSince(started) * 1000)
        switch result {
        case .ok(let text):
            Log.d("탭 전환 \(text) \(ms)ms")
            onAllowed?()
        case .noWindow:
            Log.d("크롬 창을 못 맞춤 \(window.bounds) \(ms)ms")
        case .denied:
            Log.write("크롬 제어 권한 없음 — 시스템 설정 → 개인정보 보호 및 보안 → 자동화")
            onDenied?()
        case .failed(let message):
            Log.write("탭 전환 실패: \(message)")
        }
    }
}

// MARK: - 메뉴 막대 앱

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var monitor: Any?
    private let wheel = WheelHandler()
    private var automationDenied = false

    private let headerItem = NSMenuItem(title: "\(appTitle) \(appVersion)", action: nil, keyEquivalent: "")
    private let stateItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let permissionItem = NSMenuItem(title: "크롬 제어 권한 열기…", action: #selector(openAutomationSettings), keyEquivalent: "")
    private let preciseItem = NSMenuItem(title: "탭 줄 정확히 판정하기 (손쉬운 사용 권한)…", action: #selector(requestAccessibility), keyEquivalent: "")
    private let enabledItem = NSMenuItem(title: "탭 줄 휠 전환 사용", action: #selector(toggleEnabled), keyEquivalent: "")
    private let autostartItem = NSMenuItem(title: "로그인 시 자동 실행", action: #selector(toggleAutostart), keyEquivalent: "")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        wheel.dryRun = args.contains("--dry-run")
        wheel.enabled = UserDefaults.standard.object(forKey: "enabled") as? Bool ?? true
        wheel.onDenied = { [weak self] in self?.setDenied(true) }
        wheel.onAllowed = { [weak self] in self?.setDenied(false) }

        buildStatusItem()

        monitor = NSEvent.addGlobalMonitorForEvents(matching: .scrollWheel) { [weak self] event in
            self?.wheel.handle(event)
        }
        if monitor == nil { Log.write("휠 감시 등록 실패 — 동작하지 않습니다") }

        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(quitRequested), name: quitNotification, object: nil)

        // 앱을 옮긴 뒤에도 자동 실행이 새 위치를 가리키게 한다.
        if Autostart.isOn, let path = Autostart.registeredPath, path != Bundle.main.executablePath {
            Autostart.set(true)
        }

        Log.d("시작 \(appVersion) args=\(args.dropFirst().joined(separator: " ")) 손쉬운 사용 권한=\(TabStrip.trusted)")
        refresh()

        let firstRun = !UserDefaults.standard.bool(forKey: "launchedBefore")
        if firstRun {
            UserDefaults.standard.set(true, forKey: "launchedBefore")
            DispatchQueue.main.async {
                self.showWelcome()
                self.offerAccessibilityOnce()
            }
        } else {
            DispatchQueue.main.async {
                if !args.contains("--autostart") { self.checkPermission() }
                self.offerAccessibilityOnce()
            }
        }
    }

    /// 정확한 판정에 필요한 권한을 한 번만 권한다(거절해도 고정 높이 판정으로 계속 동작한다).
    private func offerAccessibilityOnce() {
        if TabStrip.trusted || UserDefaults.standard.bool(forKey: "accessibilityOffered") { return }
        UserDefaults.standard.set(true, forKey: "accessibilityOffered")
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "탭 줄을 정확히 판정하려면 권한이 하나 더 필요해요"
        alert.informativeText = """
        「손쉬운 사용」 권한을 켜면 크롬에 탭 줄 위치를 직접 물어봐서, 탭 줄이 없는 창이나 전체 화면 영상에서는 반응하지 않아요.

        켜지 않아도 지금처럼 "창 맨 위 \(Int(wheel.stripHeight))pt"를 탭 줄로 보고 동작해요. 나중에 메뉴 막대 ⌃⌄ 아이콘에서 켤 수 있어요.
        """
        alert.addButton(withTitle: "권한 설정 열기")
        alert.addButton(withTitle: "나중에")
        if alert.runModal() == .alertFirstButtonReturn { requestAccessibility() }
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let monitor = monitor { NSEvent.removeMonitor(monitor) }
    }

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "chevron.up.chevron.down", accessibilityDescription: appTitle)
            image?.isTemplate = true
            button.image = image
            button.toolTip = "\(appTitle) \(appVersion)"
        }
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        headerItem.isEnabled = false
        stateItem.isEnabled = false
        for item in [permissionItem, preciseItem, enabledItem, autostartItem] { item.target = self }
        menu.addItem(headerItem)
        menu.addItem(stateItem)
        menu.addItem(permissionItem)
        menu.addItem(preciseItem)
        menu.addItem(.separator())
        menu.addItem(enabledItem)
        menu.addItem(autostartItem)
        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "종료", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) { refresh() }

    private func refresh() {
        enabledItem.state = wheel.enabled ? .on : .off
        autostartItem.state = Autostart.isOn ? .on : .off
        if automationDenied {
            stateItem.title = "크롬 제어 권한이 꺼져 있어요"
        } else if !wheel.enabled {
            stateItem.title = "일시 중지됨"
        } else {
            stateItem.title = TabStrip.trusted ? "탭 줄에서 휠로 탭 전환" : "탭 줄에서 휠로 탭 전환 (간이 판정)"
        }
        permissionItem.isHidden = !automationDenied
        preciseItem.isHidden = TabStrip.trusted
        statusItem.button?.appearsDisabled = !wheel.enabled || automationDenied
    }

    private func setDenied(_ denied: Bool) {
        if automationDenied == denied { return }
        automationDenied = denied
        refresh()
    }

    private func checkPermission() {
        guard let result = TabSwitcher.preflight() else { return }
        if case .denied = result { setDenied(true) } else { setDenied(false) }
    }

    private func showWelcome() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "\(appTitle)이 메뉴 막대에서 실행 중이에요"
        alert.informativeText = """
        크롬 탭 줄 위에서 휠을 굴리면 탭이 넘어가요. (휠 위 = 이전 탭, 휠 아래 = 다음 탭)

        곧 「ChromeTabWheel이(가) Google Chrome을 제어하려고 합니다」 창이 뜨면 [허용]을 눌러 주세요.
        메뉴 막대의 ⌃⌄ 아이콘에서 「로그인 시 자동 실행」을 켤 수 있어요.
        """
        alert.addButton(withTitle: "확인")
        alert.runModal()
        checkPermission()
    }

    @objc private func toggleEnabled() {
        wheel.enabled.toggle()
        UserDefaults.standard.set(wheel.enabled, forKey: "enabled")
        refresh()
    }

    @objc private func toggleAutostart() {
        Autostart.set(!Autostart.isOn)
        refresh()
    }

    @objc private func openAutomationSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation") {
            NSWorkspace.shared.open(url)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.checkPermission() }
    }

    @objc private func requestAccessibility() {
        // 처음이면 macOS 가 안내 창을 띄우고 목록에 이 앱을 올린다. 두 번째부터는 아무 창도 안 뜨므로 설정 화면을 직접 연다.
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        if !AXIsProcessTrustedWithOptions(options),
           let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func quitRequested() { NSApp.terminate(nil) }
    @objc private func quit() { NSApp.terminate(nil) }
}

// MARK: - 진입점

let arguments = CommandLine.arguments
Log.debug = arguments.contains("--debug")

if arguments.contains("--version") {
    print(appVersion)
    exit(0)
}
if arguments.contains("--probe") { exit(Probe.run(tree: arguments.contains("--tree"))) }
if arguments.contains("--autostart=on") { exit(Autostart.set(true) ? 0 : 1) }
if arguments.contains("--autostart=off") { exit(Autostart.set(false) ? 0 : 1) }
if arguments.contains("--quit") {
    DistributedNotificationCenter.default().postNotificationName(
        quitNotification, object: nil, userInfo: nil, deliverImmediately: true)
    exit(0)
}

let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
    .filter { $0.processIdentifier != getpid() }
if !others.isEmpty {
    Log.d("이미 실행 중 — 종료")
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
