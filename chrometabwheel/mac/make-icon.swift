// 앱 아이콘(AppIcon.iconset) 생성 — 파란 둥근 사각형 위 흰 ▲▼ (윈도우판 트레이 아이콘과 같은 모티프)
// 사용: swift make-icon.swift <출력 .iconset 폴더>
import CoreGraphics
import Foundation
import ImageIO

func render(_ px: Int) -> CGImage {
    let space = CGColorSpace(name: CGColorSpace.sRGB)!
    let ctx = CGContext(data: nil, width: px, height: px, bitsPerComponent: 8, bytesPerRow: 0,
                        space: space, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    let scale = CGFloat(px) / 1024
    ctx.scaleBy(x: scale, y: scale)

    // macOS 아이콘 격자: 1024 캔버스 안 824 몸통
    let body = CGPath(roundedRect: CGRect(x: 100, y: 100, width: 824, height: 824),
                      cornerWidth: 185, cornerHeight: 185, transform: nil)
    ctx.saveGState()
    ctx.addPath(body)
    ctx.clip()
    let colors = [CGColor(srgbRed: 0.30, green: 0.58, blue: 1.00, alpha: 1),
                  CGColor(srgbRed: 0.10, green: 0.36, blue: 0.90, alpha: 1)] as CFArray
    let gradient = CGGradient(colorsSpace: space, colors: colors, locations: [0, 1])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])
    ctx.restoreGState()

    // 둥근 모서리 삼각형 두 개 (CG 원점은 왼쪽 아래)
    let white = CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1)
    ctx.setFillColor(white)
    ctx.setStrokeColor(white)
    ctx.setLineJoin(.round)
    ctx.setLineWidth(56)
    func triangle(_ a: CGPoint, _ b: CGPoint, _ c: CGPoint) {
        ctx.beginPath()
        ctx.move(to: a)
        ctx.addLine(to: b)
        ctx.addLine(to: c)
        ctx.closePath()
        ctx.drawPath(using: .fillStroke)
    }
    triangle(CGPoint(x: 512, y: 748), CGPoint(x: 360, y: 580), CGPoint(x: 664, y: 580))   // ▲
    triangle(CGPoint(x: 512, y: 276), CGPoint(x: 360, y: 444), CGPoint(x: 664, y: 444))   // ▼
    return ctx.makeImage()!
}

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "AppIcon.iconset")
try FileManager.default.createDirectory(at: out, withIntermediateDirectories: true)
let sizes: [(String, Int)] = [
    ("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
    ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256), ("icon_256x256@2x", 512),
    ("icon_512x512", 512), ("icon_512x512@2x", 1024),
]
for (name, px) in sizes {
    let url = out.appendingPathComponent("\(name).png") as CFURL
    guard let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil) else {
        fatalError("PNG 생성 실패: \(name)")
    }
    CGImageDestinationAddImage(dest, render(px), nil)
    if !CGImageDestinationFinalize(dest) { fatalError("PNG 저장 실패: \(name)") }
}
print("아이콘 \(sizes.count)개 → \(out.path)")
