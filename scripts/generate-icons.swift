// macOS : swift -module-cache-path /tmp/tmp-moodle-swift-cache scripts/generate-icons.swift
import AppKit

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
let directory = root.appendingPathComponent("icons")
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

// Même monogramme que .brand-mark : blanc sur violet #5955c7.
for (name, size, maskable) in [
    ("favicon-32.png", 32, false),
    ("apple-touch-icon.png", 180, true),
    ("icon-192.png", 192, false),
    ("icon-512.png", 512, false),
    ("icon-maskable-512.png", 512, true)
] {
    let side = CGFloat(size)
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
    NSColor(deviceRed: 89/255, green: 85/255, blue: 199/255, alpha: 1).setFill()
    let radius = maskable ? 0 : side * 8/34
    NSBezierPath(roundedRect: NSRect(x: 0, y: 0, width: side, height: side),
        xRadius: radius, yRadius: radius).fill()

    // Le monogramme reste dans le cercle central sûr des icônes Android adaptatives.
    let font = NSFont.systemFont(ofSize: side * (maskable ? 0.55 : 23/34), weight: .bold)
    let text = NSAttributedString(string: "m.", attributes: [
        .font: font,
        .foregroundColor: NSColor.white
    ])
    let dimensions = text.size()
    text.draw(at: NSPoint(x: (side - dimensions.width)/2, y: (side - dimensions.height)/2))
    NSGraphicsContext.restoreGraphicsState()
    try bitmap.representation(using: .png, properties: [:])!.write(to: directory.appendingPathComponent(name))
}
