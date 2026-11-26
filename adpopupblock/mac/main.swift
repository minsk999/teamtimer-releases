// 광고창 차단 (AdPopupBlock) — macOS 판 (시험판)
//
// 윈도우판과 같은 네 프로그램(카카오톡·산돌구름·네이트온·디자인210)의 광고창을 막는다.
// 맥에서 광고가 어떻게 뜨는지 아직 직접 본 적이 없어서, 시험판은 두 가지를 같이 한다.
//   1) 조사 기록: 대상 앱의 새 창마다 제목·크기·역할·웹뷰 여부·글자·버튼을 기록하고,
//      시작할 때 대상 앱의 설정·캐시 폴더에서 광고 관련으로 보이는 파일 이름을 기록한다.
//   2) 막기(근거가 있는 것만):
//      - 어느 대상 앱이든 「오늘 하루 보지 않기」류 체크·버튼이 있는 창 → 그걸 누르고 창을 닫는다.
//      - 산돌구름: 본창이 아닌 작은 창이 웹뷰(AXWebArea)를 품으면 닫는다(윈도우판과 같은 원리).
//      - 디자인210: 설정 파일(Conf.ini)의 [POPUP] DATE 를 오늘로 맞춘다(윈도우판과 같은 원리, 파일이 있을 때만).
//      - 네이트온: 광고 XML(ad_login_popup.xml·login7.xml·polling7.xml)이 보이면 빈 내용 + 잠금.
//      - 카카오톡: 목록 아래 광고는 다른 앱 창 안쪽이라 손댈 수 없어 기록만 한다.
// 필요한 권한: 「손쉬운 사용」(다른 앱의 창을 읽고 닫기).
//
// 옵션: --autostart=on|off (성공 시 종료 코드 0), --quit, --dry-run(누르거나 닫거나 쓰지 않고 기록만), --version
// 기록: ~/Library/Logs/AdPopupBlock.log

import AppKit
import ApplicationServices

let appVersion = "0.9.0"
let appTitle = "광고창 차단"
let bundleID = "kr.co.adef.adpopupblock"
let quitNotification = Notification.Name("kr.co.adef.adpopupblock.quit")

// MARK: - 로그

enum Log {
    static let url = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Logs/AdPopupBlock.log")
    private static let formatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f
    }()

    static func write(_ message: String) {
        let line = "\(formatter.string(from: Date()))  \(message)\n"
        guard let data = line.data(using: .utf8) else { return }
        let fm = FileManager.default
        if let attrs = try? fm.attributesOfItem(atPath: url.path),
           let size = attrs[.size] as? NSNumber, size.intValue > 2_000_000 {
            let old = url.appendingPathExtension("1")
            try? fm.removeItem(at: old)
            try? fm.moveItem(at: url, to: old)
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
}

// MARK: - 로그인 시 자동 실행 (LaunchAgent)

enum Autostart {
    static let label = "kr.co.adef.adpopupblock"
    static var plistURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
    }
    static var isOn: Bool { FileManager.default.fileExists(atPath: plistURL.path) }
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
                guard let exe = Bundle.main.executablePath else { return false }
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

// MARK: - 대상 앱

enum Target: String, CaseIterable {
    case kakao, sandoll, nateon, design210

    var title: String {
        switch self {
        case .kakao: return "카카오톡"
        case .sandoll: return "산돌구름"
        case .nateon: return "네이트온"
        case .design210: return "디자인210 FontManager"
        }
    }
    /// 번들 ID·이름·경로에서 찾는 글자(소문자).
    var keys: [String] {
        switch self {
        case .kakao: return ["kakaotalk", "카카오톡"]
        case .sandoll: return ["sandoll", "산돌"]
        case .nateon: return ["nateon", "네이트온"]
        case .design210: return ["design210", "디자인210"]
        }
    }
    var enabledKey: String { "enabled.\(rawValue)" }
    var enabled: Bool {
        get { UserDefaults.standard.object(forKey: enabledKey) as? Bool ?? true }
        nonmutating set { UserDefaults.standard.set(newValue, forKey: enabledKey) }
    }

    static func of(_ app: NSRunningApplication) -> Target? {
        let hay = [app.bundleIdentifier ?? "", app.localizedName ?? "", app.bundleURL?.path ?? "",
                   app.executableURL?.path ?? ""].joined(separator: "|").lowercased()
        return allCases.first { t in t.keys.contains { hay.contains($0) } }
    }
}

// MARK: - 손쉬운 사용(AX) 도우미

enum AX {
    static func attr(_ el: AXUIElement, _ name: String) -> AnyObject? {
        var v: AnyObject?
        return AXUIElementCopyAttributeValue(el, name as CFString, &v) == .success ? v : nil
    }
    static func str(_ el: AXUIElement, _ name: String) -> String {
        (attr(el, name) as? String) ?? ""
    }
    static func children(_ el: AXUIElement) -> [AXUIElement] {
        (attr(el, kAXChildrenAttribute as String) as? [AXUIElement]) ?? []
    }
    static func element(_ el: AXUIElement, _ name: String) -> AXUIElement? {
        guard let v = attr(el, name), CFGetTypeID(v) == AXUIElementGetTypeID() else { return nil }
        return (v as! AXUIElement)
    }
    static func size(_ el: AXUIElement) -> CGSize {
        guard let v = attr(el, kAXSizeAttribute as String), CFGetTypeID(v) == AXValueGetTypeID() else { return .zero }
        var s = CGSize.zero
        AXValueGetValue(v as! AXValue, .cgSize, &s)
        return s
    }
    static func position(_ el: AXUIElement) -> CGPoint {
        guard let v = attr(el, kAXPositionAttribute as String), CFGetTypeID(v) == AXValueGetTypeID() else { return .zero }
        var p = CGPoint.zero
        AXValueGetValue(v as! AXValue, .cgPoint, &p)
        return p
    }
    static func bool(_ el: AXUIElement, _ name: String) -> Bool {
        (attr(el, name) as? Bool) ?? false
    }
    static func press(_ el: AXUIElement) -> Bool {
        AXUIElementPerformAction(el, kAXPressAction as CFString) == .success
    }
}

/// 창 하나를 훑은 결과.
struct WindowScan {
    var roles: [String: Int] = [:]
    var texts: [String] = []
    var hasWebArea = false
    var webURL = ""
    var dontShow: [(AXUIElement, String, String)] = []   // (요소, 역할, 글자) — 「보지 않기」류
    var closeLike: [(AXUIElement, String)] = []           // 「닫기」류 버튼
    var nodes = 0

    static let dontShowWords = ["보지 않기", "보지않기", "열지 않기", "열지않기", "다시 보지", "그만 보기"]
    static let closeWords = ["닫기", "close", "확인"]

    /// controlsOnly: 메신저(카카오톡·네이트온)는 대화 내용이 기록에 남지 않게 단추·체크·링크 글자만 모은다.
    static func scan(_ window: AXUIElement, controlsOnly: Bool = false) -> WindowScan {
        var s = WindowScan()
        func walk(_ el: AXUIElement, _ depth: Int) {
            if depth > 14 || s.nodes > 600 { return }
            s.nodes += 1
            let role = AX.str(el, kAXRoleAttribute as String)
            s.roles[role, default: 0] += 1
            if role == "AXWebArea" {
                s.hasWebArea = true
                if s.webURL.isEmpty, let u = AX.attr(el, "AXURL") {
                    s.webURL = (u as? URL)?.absoluteString ?? "\(u)"
                }
            }
            var label = AX.str(el, kAXTitleAttribute as String)
            if label.isEmpty, role == "AXStaticText" || role == "AXTextField" {
                label = (AX.attr(el, kAXValueAttribute as String) as? String) ?? ""
            }
            if label.isEmpty { label = AX.str(el, kAXDescriptionAttribute as String) }
            let t = label.trimmingCharacters(in: .whitespacesAndNewlines)
            if !t.isEmpty {
                let isControl = ["AXCheckBox", "AXButton", "AXLink", "AXRadioButton"].contains(role)
                if s.texts.count < 25, isControl || !controlsOnly { s.texts.append(String(t.prefix(60))) }
                if isControl, WindowScan.dontShowWords.contains(where: { t.contains($0) }) {
                    // 누를 수 있는 것(체크·버튼·링크)만. 대화 내용 같은 글자(AXStaticText)는 누르지 않는다.
                    s.dontShow.append((el, role, t))
                } else if isControl && role == "AXButton",
                          WindowScan.closeWords.contains(where: { t.lowercased() == $0 }) {
                    s.closeLike.append((el, t))
                }
            }
            for c in AX.children(el) { walk(c, depth + 1) }
        }
        walk(window, 0)
        return s
    }

    var rolesText: String {
        roles.sorted { $0.value > $1.value }.prefix(12).map { "\($0.key)×\($0.value)" }.joined(separator: " ")
    }
}

// MARK: - 창 감시

final class WindowWatcher {
    var dryRun = false
    /// pid → 이미 본 창들
    private var seen: [pid_t: [AXUIElement]] = [:]
    private var seenCG: Set<Int> = []
    private var hiddenCount: [Target: Int] = [:]
    var detailed: Bool {
        get { UserDefaults.standard.bool(forKey: "detailedLog") }
        set { UserDefaults.standard.set(newValue, forKey: "detailedLog") }
    }

    func runningTargets() -> [(NSRunningApplication, Target)] {
        NSWorkspace.shared.runningApplications.compactMap { app in
            guard let t = Target.of(app), app.processIdentifier > 0 else { return nil }
            return (app, t)
        }
    }

    func tick() {
        let targets = runningTargets()
        let livePids = Set(targets.map { $0.0.processIdentifier })
        seen = seen.filter { livePids.contains($0.key) }
        guard AXIsProcessTrusted() else { return }
        for (app, target) in targets {
            let pid = app.processIdentifier
            let axApp = AXUIElementCreateApplication(pid)
            let windows = (AX.attr(axApp, kAXWindowsAttribute as String) as? [AXUIElement]) ?? []
            var known = seen[pid] ?? []
            let firstLook = seen[pid] == nil
            for w in windows where !known.contains(where: { CFEqual($0, w) }) {
                known.append(w)
                handleNewWindow(w, app: app, target: target, index: windows.firstIndex(where: { CFEqual($0, w) }) ?? 0,
                                total: windows.count, firstLook: firstLook)
            }
            known.removeAll { k in !windows.contains(where: { CFEqual($0, k) }) }
            seen[pid] = known
        }
        if detailed { logCGWindows(pids: livePids, targets: targets) }
    }

    private func describe(_ w: AXUIElement) -> String {
        let title = AX.str(w, kAXTitleAttribute as String)
        let role = AX.str(w, kAXRoleAttribute as String)
        let sub = AX.str(w, kAXSubroleAttribute as String)
        let s = AX.size(w), p = AX.position(w)
        let main = AX.bool(w, kAXMainAttribute as String) ? " 주창" : ""
        let modal = AX.bool(w, kAXModalAttribute as String) ? " 모달" : ""
        let close = AX.element(w, kAXCloseButtonAttribute as String) != nil ? " 닫기단추" : ""
        return "\"\(title)\" \(role)/\(sub) \(Int(s.width))x\(Int(s.height)) @\(Int(p.x)),\(Int(p.y))\(main)\(modal)\(close)"
    }

    private func handleNewWindow(_ w: AXUIElement, app: NSRunningApplication, target: Target,
                                 index: Int, total: Int, firstLook: Bool) {
        let scan = WindowScan.scan(w, controlsOnly: target == .kakao || target == .nateon)
        let name = target.title
        Log.write("[\(name)] 새 창 \(index + 1)/\(total)\(firstLook ? "(시작 때 있던 창)" : ""): \(describe(w))"
                  + (scan.hasWebArea ? " 웹뷰" + (scan.webURL.isEmpty ? "" : " \(scan.webURL)") : ""))
        Log.write("    역할: \(scan.rolesText)")
        if !scan.texts.isEmpty { Log.write("    글자: \(scan.texts.joined(separator: " | "))") }

        guard target.enabled else { return }

        // 1) 「오늘 하루 보지 않기」류가 있으면 누르고 닫는다 — 모든 대상 공통.
        let small = AX.size(w).width < 1000 && AX.size(w).height < 1000 && scan.nodes < 300
        if let d = scan.dontShow.first, small {
            let (el, role, text) = d
            if dryRun {
                Log.write("    (dry-run) 「\(text)」 \(role) 누르고 닫을 창")
                return
            }
            let pressed = AX.press(el)
            Log.write("    「\(text)」 \(role) 누름: \(pressed ? "성공" : "실패")")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                if self.close(w, scan: scan) { self.count(target, "광고 창 닫음(보지 않기)") }
            }
            return
        }

        // 2) 산돌구름: 본창이 아닌 작은 창이 웹뷰를 품으면 닫는다.
        if target == .sandoll, scan.hasWebArea {
            let s = AX.size(w)
            let isMain = AX.bool(w, kAXMainAttribute as String) && total == 1
            if !isMain && s.width < 1000 && s.height < 1000 {
                if dryRun { Log.write("    (dry-run) 산돌구름 웹뷰 창 닫을 것"); return }
                if close(w, scan: scan) { count(.sandoll, "산돌구름 팝업 닫음") }
            } else {
                Log.write("    산돌구름 본창 안 웹뷰로 보여 닫지 않음")
            }
        }
    }

    private func close(_ w: AXUIElement, scan: WindowScan) -> Bool {
        if let btn = AX.element(w, kAXCloseButtonAttribute as String), AX.press(btn) {
            Log.write("    창 닫음(닫기 단추)")
            return true
        }
        if let c = scan.closeLike.first, AX.press(c.0) {
            let text = c.1
            Log.write("    창 닫음(「\(text)」 단추)")
            return true
        }
        Log.write("    창을 닫을 방법을 못 찾음")
        return false
    }

    private func count(_ t: Target, _ what: String) {
        hiddenCount[t, default: 0] += 1
        Log.write("[\(t.title)] \(what) (누적 \(hiddenCount[t]!)회)")
    }

    /// AX 에 안 잡히는 창도 있을 수 있어, 자세히 기록이 켜져 있으면 창 서버 목록도 남긴다(제목 없이 번호·크기·층만).
    private func logCGWindows(pids: Set<pid_t>, targets: [(NSRunningApplication, Target)]) {
        guard let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID)
                as? [[String: Any]] else { return }
        for info in list {
            guard let pid = info[kCGWindowOwnerPID as String] as? pid_t, pids.contains(pid),
                  let num = info[kCGWindowNumber as String] as? Int, !seenCG.contains(num) else { continue }
            seenCG.insert(num)
            let b = info[kCGWindowBounds as String] as? [String: CGFloat] ?? [:]
            let layer = info[kCGWindowLayer as String] as? Int ?? 0
            let onscreen = info[kCGWindowIsOnscreen as String] as? Bool ?? false
            let alpha = info[kCGWindowAlpha as String] as? Double ?? 1
            let t = targets.first { $0.0.processIdentifier == pid }?.1.title ?? "?"
            Log.write("[\(t)] 창서버 #\(num) \(Int(b["Width"] ?? 0))x\(Int(b["Height"] ?? 0)) @\(Int(b["X"] ?? 0)),\(Int(b["Y"] ?? 0)) 층\(layer)\(onscreen ? " 보임" : "") 투명도\(alpha)")
        }
    }
}

// MARK: - 파일 쪽 (디자인210 날짜, 네이트온 광고 XML, 조사용 파일 목록)

enum Files {
    static let home = FileManager.default.homeDirectoryForCurrentUser
    static var roots: [URL] {
        let lib = home.appendingPathComponent("Library")
        return ["Containers", "Group Containers", "Application Support", "Caches", "Preferences", "WebKit", "HTTPStorages"]
            .map { lib.appendingPathComponent($0) }
            + [URL(fileURLWithPath: "/Applications"), URL(fileURLWithPath: "/Library/Application Support")]
    }

    /// 대상 앱과 관련 있어 보이는 폴더·파일(맨 윗단만 이름으로 고른다).
    static func relatedTops(_ t: Target, extra: [URL] = []) -> [URL] {
        var out: [URL] = []
        for root in roots {
            guard let items = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { continue }
            for u in items where t.keys.contains(where: { u.lastPathComponent.lowercased().contains($0) }) {
                out.append(u)
            }
        }
        for u in extra where !out.contains(u) { out.append(u) }
        return out
    }

    static func walk(_ top: URL, limit: Int = 20000, _ body: (URL) -> Void) {
        var isDir: ObjCBool = false
        guard FileManager.default.fileExists(atPath: top.path, isDirectory: &isDir) else { return }
        if !isDir.boolValue { body(top); return }
        guard let e = FileManager.default.enumerator(at: top, includingPropertiesForKeys: [.isRegularFileKey],
                                                     options: [], errorHandler: { _, _ in true }) else { return }
        var n = 0
        for case let u as URL in e {
            n += 1
            if n > limit { break }
            // 앱 번들 안 프레임워크는 건너뛴다(조사 대상 아님).
            if u.lastPathComponent == "Frameworks" || u.pathExtension == "framework" || u.pathExtension == "lproj" {
                e.skipDescendants(); continue
            }
            if (try? u.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true { body(u) }
        }
    }

    static let interesting = ["ad_", "ad.", "_ad", "advert", "popup", "banner", "notice", "promo", "conf", ".ini", ".xml"]

    /// 조사 기록: 대상 앱 폴더에서 광고·설정으로 보이는 파일 이름을 남긴다.
    static func survey(_ t: Target, appURLs: [URL]) {
        let tops = relatedTops(t, extra: appURLs)
        if tops.isEmpty { return }
        Log.write("[\(t.title)] 관련 폴더: \(tops.map { $0.path.replacingOccurrences(of: home.path, with: "~") }.joined(separator: " , "))")
        var shown = 0, total = 0
        for top in tops {
            walk(top) { u in
                total += 1
                let n = u.lastPathComponent.lowercased()
                guard interesting.contains(where: { n.contains($0) }), shown < 120 else { return }
                shown += 1
                let size = (try? u.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                Log.write("    파일 \(u.path.replacingOccurrences(of: home.path, with: "~")) \(size)B")
            }
        }
        Log.write("[\(t.title)] 파일 \(total)개 중 \(shown)개 기록")
    }

    // 디자인210: Conf.ini [POPUP] DATE 를 오늘로. 파일 인코딩(UTF-16/UTF-8)을 그대로 지킨다.
    static func design210Confs(appURLs: [URL]) -> [URL] {
        var out: [URL] = []
        for top in relatedTops(.design210, extra: appURLs) {
            walk(top) { u in if u.lastPathComponent.lowercased() == "conf.ini" { out.append(u) } }
        }
        return out
    }

    /// 바꿨으면 이전 값, 이미 오늘이면 nil. 실패는 throw.
    static func setPopupDate(_ url: URL, today: String, dryRun: Bool) throws -> String? {
        let data = try Data(contentsOf: url)
        var enc: String.Encoding = .utf8
        if data.starts(with: [0xFF, 0xFE]) { enc = .utf16LittleEndian }
        else if data.starts(with: [0xFE, 0xFF]) { enc = .utf16BigEndian }
        let bomLen = enc == .utf8 ? (data.starts(with: [0xEF, 0xBB, 0xBF]) ? 3 : 0) : 2
        guard let text = String(data: data.dropFirst(bomLen), encoding: enc) else {
            throw NSError(domain: "AdPopupBlock", code: 1, userInfo: [NSLocalizedDescriptionKey: "인코딩을 못 읽음"])
        }
        let nl = text.contains("\r\n") ? "\r\n" : "\n"
        var lines = text.components(separatedBy: nl)
        var inPopup = false, found = false, old = ""
        var popupHeader = -1
        for i in lines.indices {
            let l = lines[i].trimmingCharacters(in: .whitespaces)
            if l.hasPrefix("[") { inPopup = l.uppercased() == "[POPUP]"; if inPopup { popupHeader = i }; continue }
            if inPopup, l.uppercased().hasPrefix("DATE") {
                let parts = l.split(separator: "=", maxSplits: 1)
                old = parts.count > 1 ? parts[1].trimmingCharacters(in: .whitespaces) : ""
                if old == today { return nil }
                lines[i] = "DATE=\(today)"
                found = true
                break
            }
        }
        if !found {
            if popupHeader >= 0 { lines.insert("DATE=\(today)", at: popupHeader + 1) }
            else { return nil }   // [POPUP] 이 없으면 다른 구조 — 건드리지 않는다
        }
        if dryRun { return old.isEmpty ? "(없음)" : old }
        var out = Data(data.prefix(bomLen))
        guard let body = lines.joined(separator: nl).data(using: enc) else { return nil }
        out.append(body)
        try out.write(to: url, options: .atomic)
        return old.isEmpty ? "(없음)" : old
    }

    // 네이트온: 광고 XML 이 있으면 빈 내용 + 잠금(uchg).
    static let nateonAds: [String: String] = [
        "ad_login_popup.xml": "<?xml version=\"1.0\" encoding=\"utf-8\" ?><event></event>",
        "login7.xml": "<?xml version=\"1.0\" encoding=\"utf-8\"?><login></login>",
        "polling7.xml": "<?xml version=\"1.0\" encoding=\"utf-8\"?><polling></polling>",
    ]

    static func nateonAdFiles() -> [URL] {
        var out: [URL] = []
        for top in relatedTops(.nateon) {
            walk(top) { u in
                let n = u.lastPathComponent.lowercased()
                if nateonAds.keys.contains(where: { n.hasSuffix($0) }) { out.append(u) }
            }
        }
        return out
    }

    /// 잠갔으면 true, 이미 잠겨 있으면 false.
    static func lockNateon(_ url: URL, dryRun: Bool) throws -> Bool {
        let fm = FileManager.default
        let attrs = try fm.attributesOfItem(atPath: url.path)
        let locked = (attrs[.immutable] as? Bool) ?? false
        let key = nateonAds.keys.first { url.lastPathComponent.lowercased().hasSuffix($0) }!
        let empty = nateonAds[key]!
        let current = (try? String(contentsOf: url, encoding: .utf8)) ?? ""
        if locked && current == empty { return false }
        if dryRun { return true }
        if locked { try fm.setAttributes([.immutable: false], ofItemAtPath: url.path) }
        try empty.write(to: url, atomically: false, encoding: .utf8)
        try fm.setAttributes([.immutable: true], ofItemAtPath: url.path)
        return true
    }

    static func unlockNateon() {
        for u in nateonAdFiles() {
            try? FileManager.default.setAttributes([.immutable: false], ofItemAtPath: u.path)
            try? FileManager.default.removeItem(at: u)
            Log.write("[네이트온] 광고 설정 파일 풀고 지움: \(u.lastPathComponent)")
        }
    }
}

final class FileGuard {
    var dryRun = false
    private var lastNateonScan = Date.distantPast
    private var surveyed: Set<String> = []
    private var warned: Set<String> = []

    private var today: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyyMMdd"
        return f.string(from: Date())
    }

    func tick(apps: [(NSRunningApplication, Target)]) {
        // 조사 기록: 앱이 처음 보일 때 한 번.
        for (app, t) in apps where !surveyed.contains(t.rawValue) {
            surveyed.insert(t.rawValue)
            Log.write("[\(t.title)] 실행 중: \(app.localizedName ?? "?") \(app.bundleIdentifier ?? "-") \(app.bundleURL?.path ?? "")")
            let urls = app.bundleURL.map { [$0] } ?? []
            DispatchQueue.global(qos: .utility).async { Files.survey(t, appURLs: urls) }
        }

        if Target.design210.enabled {
            let appURLs = apps.filter { $0.1 == .design210 }.compactMap { $0.0.bundleURL }
            for conf in Files.design210Confs(appURLs: appURLs) {
                do {
                    if let old = try Files.setPopupDate(conf, today: today, dryRun: dryRun) {
                        Log.write("[디자인210] 팝업 날짜를 오늘로\(dryRun ? "(dry-run)" : ""): \(old) → \(today) \(conf.path)")
                    }
                } catch {
                    if warned.insert(conf.path).inserted {
                        Log.write("[디자인210] 설정 파일을 못 고침 \(conf.path): \(error.localizedDescription)")
                    }
                }
            }
        }

        if Target.nateon.enabled, Date().timeIntervalSince(lastNateonScan) > 30 {
            lastNateonScan = Date()
            for u in Files.nateonAdFiles() {
                do {
                    if try Files.lockNateon(u, dryRun: dryRun) {
                        Log.write("[네이트온] 광고 설정 파일 비우고 잠금\(dryRun ? "(dry-run)" : ""): \(u.path)")
                    }
                } catch {
                    if warned.insert(u.path).inserted {
                        Log.write("[네이트온] 광고 설정 파일 못 잠금 \(u.path): \(error.localizedDescription)")
                    }
                }
            }
        }
    }
}

// MARK: - 메뉴 막대 앱

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private let watcher = WindowWatcher()
    private let files = FileGuard()
    private var fastTimer: Timer?
    private var slowTimer: Timer?
    private var trusted = false

    private let headerItem = NSMenuItem(title: "\(appTitle) \(appVersion) (시험판)", action: nil, keyEquivalent: "")
    private let stateItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
    private let permissionItem = NSMenuItem(title: "손쉬운 사용 권한 열기…", action: #selector(openAXSettings), keyEquivalent: "")
    private var targetItems: [Target: NSMenuItem] = [:]
    private let detailItem = NSMenuItem(title: "자세히 기록(조사용)", action: #selector(toggleDetail), keyEquivalent: "")
    private let autostartItem = NSMenuItem(title: "로그인 시 자동 실행", action: #selector(toggleAutostart), keyEquivalent: "")

    func applicationDidFinishLaunching(_ notification: Notification) {
        let args = CommandLine.arguments
        let dry = args.contains("--dry-run")
        watcher.dryRun = dry
        files.dryRun = dry
        buildStatusItem()

        DistributedNotificationCenter.default().addObserver(
            self, selector: #selector(quitRequested), name: quitNotification, object: nil)
        if Autostart.isOn, let path = Autostart.registeredPath, path != Bundle.main.executablePath {
            Autostart.set(true)
        }

        Log.write("시작 v\(appVersion)\(dry ? " (dry-run)" : "") macOS \(ProcessInfo.processInfo.operatingSystemVersionString)")
        let first = !UserDefaults.standard.bool(forKey: "launchedBefore")
        UserDefaults.standard.set(true, forKey: "launchedBefore")
        trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: first] as CFDictionary)
        if !trusted { Log.write("손쉬운 사용 권한 없음 — 창 감시가 멈춰 있음") }
        if first { DispatchQueue.main.async { self.showWelcome() } }

        fastTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in self?.fastTick() }
        slowTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.slowTick() }
        slowTick()
        refresh()
    }

    private func fastTick() {
        let now = AXIsProcessTrusted()
        if now != trusted {
            trusted = now
            Log.write(now ? "손쉬운 사용 권한 받음 — 창 감시 시작" : "손쉬운 사용 권한이 꺼짐")
            refresh()
        }
        watcher.tick()
    }

    private func slowTick() {
        files.tick(apps: watcher.runningTargets())
    }

    private func buildStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            let image = NSImage(systemSymbolName: "shield.lefthalf.filled", accessibilityDescription: appTitle)
            image?.isTemplate = true
            button.image = image
            button.toolTip = "\(appTitle) \(appVersion)"
        }
        let menu = NSMenu()
        menu.delegate = self
        menu.autoenablesItems = false
        headerItem.isEnabled = false
        stateItem.isEnabled = false
        menu.addItem(headerItem)
        menu.addItem(stateItem)
        permissionItem.target = self
        menu.addItem(permissionItem)
        menu.addItem(.separator())
        for t in Target.allCases {
            let item = NSMenuItem(title: t.title, action: #selector(toggleTarget(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = t.rawValue
            targetItems[t] = item
            menu.addItem(item)
        }
        menu.addItem(.separator())
        let logItem = NSMenuItem(title: "기록 보기", action: #selector(openLog), keyEquivalent: "")
        logItem.target = self
        menu.addItem(logItem)
        let revealItem = NSMenuItem(title: "기록 파일을 Finder 에서 보기", action: #selector(revealLog), keyEquivalent: "")
        revealItem.target = self
        menu.addItem(revealItem)
        detailItem.target = self
        menu.addItem(detailItem)
        autostartItem.target = self
        menu.addItem(autostartItem)
        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "종료", action: #selector(quit), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)
        statusItem.menu = menu
    }

    func menuNeedsUpdate(_ menu: NSMenu) { refresh() }

    private func refresh() {
        for (t, item) in targetItems { item.state = t.enabled ? .on : .off }
        detailItem.state = watcher.detailed ? .on : .off
        autostartItem.state = Autostart.isOn ? .on : .off
        stateItem.title = trusted ? "광고창 감시 중" : "손쉬운 사용 권한이 필요해요"
        permissionItem.isHidden = trusted
        statusItem.button?.appearsDisabled = !trusted
    }

    private func showWelcome() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "\(appTitle)이 메뉴 막대에서 실행 중이에요"
        alert.informativeText = """
        카카오톡·산돌구름·네이트온·디자인210 의 광고창을 막아요.

        다른 앱의 창을 읽고 닫으려면 「손쉬운 사용」 권한이 필요해요.
        시스템 설정 → 개인정보 보호 및 보안 → 손쉬운 사용 → AdPopupBlock 을 켜 주세요.
        메뉴 막대의 방패 아이콘에서 「로그인 시 자동 실행」을 켤 수 있어요.
        """
        alert.addButton(withTitle: "확인")
        alert.runModal()
        if !AXIsProcessTrusted() { openAXSettings() }
    }

    @objc private func toggleTarget(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let t = Target(rawValue: raw) else { return }
        t.enabled.toggle()
        Log.write("\(t.title) 차단 \(t.enabled ? "켬" : "끔")")
        if t == .nateon && !t.enabled { Files.unlockNateon() }
        refresh()
    }

    @objc private func toggleDetail() {
        watcher.detailed.toggle()
        Log.write("자세히 기록 \(watcher.detailed ? "켬" : "끔")")
        refresh()
    }

    @objc private func toggleAutostart() {
        Autostart.set(!Autostart.isOn)
        refresh()
    }

    @objc private func openLog() {
        if !FileManager.default.fileExists(atPath: Log.url.path) { Log.write("기록 시작") }
        NSWorkspace.shared.open(Log.url)
    }

    @objc private func revealLog() {
        if !FileManager.default.fileExists(atPath: Log.url.path) { Log.write("기록 시작") }
        NSWorkspace.shared.activateFileViewerSelecting([Log.url])
    }

    @objc private func openAXSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func quitRequested() { NSApp.terminate(nil) }
    @objc private func quit() {
        Log.write("종료")
        NSApp.terminate(nil)
    }
}

// MARK: - 진입점

let arguments = CommandLine.arguments
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
if !others.isEmpty { exit(0) }

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
