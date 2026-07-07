// Singing Studio — native macOS shell.
//
// A standalone .app (own window + dock icon, macOS's built-in WebKit — no Chrome,
// no Electron) that starts the bundled Python server and loads the studio UI in a
// WKWebView. Grants the page's microphone request so recording + the live pitch
// guide work; the OS still shows its own mic-permission prompt on first use.

import Cocoa
import WebKit

let PORT = 4173
let URLSTR = "http://localhost:\(PORT)/"

final class AppDelegate: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?
    var serverMonitor: DispatchSourceTimer?
    var showingErrorPage = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        buildWindow()
        startServerIfNeeded()
        waitForServerThenLoad()
        startServerMonitor()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        // Stop supervising first so the monitor can't respawn the server while
        // we're quitting.
        serverMonitor?.cancel()
        serverMonitor = nil
        // Only stop the server if we started it ourselves.
        serverProcess?.terminate()
    }

    // MARK: window + webview
    func buildWindow() {
        let config = WKWebViewConfiguration()
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let rect = NSRect(x: 0, y: 0, width: 1240, height: 840)
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Singing Studio"
        window.center()
        window.setFrameAutosaveName("SingingStudioMain")
        window.minSize = NSSize(width: 900, height: 640)

        webView = WKWebView(frame: rect, configuration: config)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.autoresizingMask = [.width, .height]
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
    }

    // Grant the page's getUserMedia (mic) request. The OS mic-permission prompt
    // is handled separately by TCC via NSMicrophoneUsageDescription.
    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(.grant)
    }

    // Open target=_blank links (e.g. "open on YouTube") in the real browser.
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError()
    }

    // MARK: server lifecycle
    func startServerIfNeeded() {
        if serverIsUp() { return }
        spawnServer()
    }

    func spawnServer() {
        guard let appDir = Bundle.main.resourceURL?.appendingPathComponent("app") else { return }
        let server = appDir.appendingPathComponent("server.py")
        guard FileManager.default.fileExists(atPath: server.path),
              let python = findPython(appDir: appDir) else { return }

        let p = Process()
        p.executableURL = URL(fileURLWithPath: python)
        p.arguments = [server.path]
        p.currentDirectoryURL = appDir
        var env = ProcessInfo.processInfo.environment
        let extra = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = extra + ":" + (env["PATH"] ?? "")
        p.environment = env
        do { try p.run(); serverProcess = p } catch { /* fall through to load attempt */ }
    }

    // Supervise the bundled server for the app's whole lifetime. If it dies or
    // was never reachable, respawn it; if the window got stranded on the
    // load-error page, reload once the server answers again. Without this, a
    // single server crash left every /api/search failing with connection-refused
    // (no videos) until the user manually relaunched the app.
    func startServerMonitor() {
        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global())
        timer.schedule(deadline: .now() + 3, repeating: 3)
        timer.setEventHandler { [weak self] in
            guard let self = self else { return }
            if self.serverIsUp() {
                if self.showingErrorPage { DispatchQueue.main.async { self.loadStudio() } }
            } else {
                self.spawnServer()   // server died or never came up — bring it back
            }
        }
        timer.resume()
        serverMonitor = timer
    }

    // Load the real studio URL (as opposed to the local error page).
    func loadStudio() {
        showingErrorPage = false
        webView.load(URLRequest(url: URL(string: URLSTR)!))
    }

    func findPython(appDir: URL) -> String? {
        var candidates: [String] = []
        // Prefer a system/Homebrew Python for server startup. Search shells out
        // to yt-dlp; optional pitch analysis still discovers project resources
        // through source_dir.txt after the server is running.
        candidates += ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]
        candidates.append(appDir.appendingPathComponent(".venv/bin/python").path)
        if let src = try? String(contentsOf: appDir.appendingPathComponent("source_dir.txt"), encoding: .utf8) {
            let dir = src.trimmingCharacters(in: .whitespacesAndNewlines)
            if !dir.isEmpty { candidates.append(dir + "/.venv/bin/python") }
        }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    func serverIsUp() -> Bool {
        let sem = DispatchSemaphore(value: 0)
        var up = false
        var req = URLRequest(url: URL(string: URLSTR)!)
        req.timeoutInterval = 0.6
        req.cachePolicy = .reloadIgnoringLocalCacheData
        URLSession.shared.dataTask(with: req) { _, resp, _ in
            if let http = resp as? HTTPURLResponse, http.statusCode == 200 { up = true }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + 1.2)
        return up
    }

    func waitForServerThenLoad() {
        DispatchQueue.global().async {
            for _ in 0..<60 {                       // up to ~30s (first run builds nothing yet)
                if self.serverIsUp() { break }
                Thread.sleep(forTimeInterval: 0.5)
            }
            DispatchQueue.main.async {
                self.loadStudio()
            }
        }
    }

    func showLoadError() {
        let html = """
        <html><body style="font-family:-apple-system;background:#160f0b;color:#e8dcc8;
        display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
        <div><h2>Couldn't reach the studio server</h2>
        <p style="color:#8a7e6d">Make sure python3 and yt-dlp are installed, then reopen the app.</p></div>
        </body></html>
        """
        showingErrorPage = true   // monitor reloads the studio once the server answers
        webView.loadHTMLString(html, baseURL: nil)
    }

    // MARK: menu (so Cmd+Q and text editing shortcuts work)
    func buildMenu() {
        let mainMenu = NSMenu()

        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "About Singing Studio", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Singing Studio", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        appMenu.addItem(withTitle: "Quit Singing Studio", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        NSApp.mainMenu = mainMenu
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
