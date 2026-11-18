// 크롬 탭 휠 (ChromeTabWheel) — macOS 판
//
// 크롬 탭 줄 위에서 마우스 휠을 굴리면 탭이 넘어간다. 휠 위 = 이전 탭, 휠 아래 = 다음 탭.
// 윈도우판(.NET, Raw Input + WM_COMMAND)과 같은 성격으로 만든다:
//   - 휠 이벤트를 가로채지 않고 지켜보기만 한다(전역 모니터). 크롬 쪽 동작을 막지 않는다.
//   - 탭 전환은 크롬 AppleScript 로 "커서 아래 그 창"의 active tab index 를 바꾼다 → 포커스가 안 바뀐다.
//   - 필요한 권한은 「자동화 → Google Chrome」 하나. (스크롤 감시는 권한이 필요 없다)
//
// 옵션: --autostart=on / --autostart=off (성공 시 종료 코드 0), --quit (실행 중인 것을 정상 종료),
//       --debug (판정 과정을 로그에 남김), --dry-run (판정만 하고 탭은 안 바꿈), --version
// 로그: ~/Library/Logs/ChromeTabWheel.log  (오류는 항상, 판정 과정은 --debug 일 때만)

import AppKit

let appVersion = "1.0.0"
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

    /// 창 맨 위에서 이 높이(포인트)까지를 탭 줄로 본다.
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
        let offset = point.y - window.bounds.minY
        if offset < 0 || offset > stripHeight {
            Log.d("통과 (\(Int(point.x)),\(Int(point.y))) : 탭 줄 밖 (위에서 \(Int(offset))pt)")
            return
        }
        Log.d("전환 (\(Int(point.x)),\(Int(point.y))) d=\(dy) 칸=\(steps) [\(how)] \(window.bounds)")
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

        Log.d("시작 \(appVersion) args=\(args.dropFirst().joined(separator: " "))")
        refresh()

        let firstRun = !UserDefaults.standard.bool(forKey: "launchedBefore")
        if firstRun {
            UserDefaults.standard.set(true, forKey: "launchedBefore")
            DispatchQueue.main.async { self.showWelcome() }
        } else if !args.contains("--autostart") {
            DispatchQueue.main.async { self.checkPermission() }
        }
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
        for item in [permissionItem, enabledItem, autostartItem] { item.target = self }
        menu.addItem(headerItem)
        menu.addItem(stateItem)
        menu.addItem(permissionItem)
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
            stateItem.title = "탭 줄에서 휠로 탭 전환"
        }
        permissionItem.isHidden = !automationDenied
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
