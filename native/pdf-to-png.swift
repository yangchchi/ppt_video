import Foundation
import PDFKit
import AppKit
import CoreGraphics

let args = CommandLine.arguments
guard args.count == 4 else {
  fputs("usage: pdf-to-png input.pdf outputDir width\n", stderr)
  exit(2)
}

let pdfURL = URL(fileURLWithPath: args[1])
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
let width = CGFloat(Double(args[3]) ?? 1920)

guard let doc = PDFDocument(url: pdfURL) else {
  fputs("无法打开 PDF\n", stderr)
  exit(1)
}

try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)

for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let bounds = page.bounds(for: .mediaBox)
  let scale = width / max(bounds.width, 1)
  let pixelWidth = max(Int(floor(bounds.width * scale)), 1)
  let pixelHeight = max(Int(floor(bounds.height * scale)), 1)
  guard let ctx = CGContext(
    data: nil,
    width: pixelWidth,
    height: pixelHeight,
    bitsPerComponent: 8,
    bytesPerRow: 0,
    space: CGColorSpaceCreateDeviceRGB(),
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
  ) else {
    fputs("无法创建画布\n", stderr)
    exit(1)
  }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: pixelWidth, height: pixelHeight))
  ctx.saveGState()
  ctx.scaleBy(x: scale, y: scale)
  page.draw(with: .mediaBox, to: ctx)
  ctx.restoreGState()
  guard let cgImage = ctx.makeImage() else {
    fputs("无法导出图像\n", stderr)
    exit(1)
  }
  let rep = NSBitmapImageRep(cgImage: cgImage)
  guard let png = rep.representation(using: .png, properties: [:]) else {
    fputs("无法编码 PNG\n", stderr)
    exit(1)
  }
  let file = outDir.appendingPathComponent(String(format: "slide-%03d.png", i + 1))
  try png.write(to: file)
}

print(doc.pageCount)
