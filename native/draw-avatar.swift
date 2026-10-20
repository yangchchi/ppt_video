import AppKit
import CoreImage
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 3 || args.count == 5 else {
  fputs("usage: draw-avatar source.jpg output.png\n", stderr)
  fputs("       draw-avatar closed.jpg open.jpg closed.png open.png\n", stderr)
  exit(2)
}

func fail(_ message: String) -> Never {
  fputs("\(message)\n", stderr)
  exit(1)
}

func cutoutImage(_ path: String) -> CGImage {
  guard let source = NSImage(contentsOf: URL(fileURLWithPath: path)),
        let sourceRef = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fail("无法读取肖像")
  }

let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: sourceRef, orientation: .up, options: [:])
do {
  try handler.perform([request])
} catch {
  fail("无法分离人物")
}

guard let observation = request.results?.first else {
  fail("画面里没有人物")
}

let maskBuffer: CVPixelBuffer
do {
  maskBuffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
} catch {
  fail("无法分离人物")
}

let portrait = CIImage(cgImage: sourceRef)
let mask = CIImage(cvPixelBuffer: maskBuffer)
let fittedMask = mask.transformed(by: CGAffineTransform(
  scaleX: portrait.extent.width / mask.extent.width,
  y: portrait.extent.height / mask.extent.height
)).cropped(to: portrait.extent)

guard let blend = CIFilter(name: "CIBlendWithMask") else {
  fail("无法分离人物")
}
blend.setValue(portrait, forKey: kCIInputImageKey)
blend.setValue(CIImage(color: .clear).cropped(to: portrait.extent), forKey: kCIInputBackgroundImageKey)
blend.setValue(fittedMask, forKey: kCIInputMaskImageKey)
guard let cutout = blend.outputImage else {
  fail("无法分离人物")
}

let context = CIContext(options: [.workingColorSpace: NSNull()])
guard let composited = context.createCGImage(cutout, from: cutout.extent) else {
  fail("无法写出肖像")
}
return composited
}

func subjectRect(_ image: CGImage) -> CGRect {
  guard let data = image.dataProvider?.data, let bytes = CFDataGetBytePtr(data) else {
    return CGRect(x: 0, y: 0, width: image.width, height: image.height)
  }
  let width = image.width
  let height = image.height
  let row = image.bytesPerRow
  var minX = width
  var minY = height
  var maxX = 0
  var maxY = 0
  for y in 0..<height {
    for x in 0..<width {
      if bytes[y * row + x * 4 + 3] > 16 {
        minX = min(minX, x)
        minY = min(minY, y)
        maxX = max(maxX, x)
        maxY = max(maxY, y)
      }
    }
  }
  guard maxX > minX, maxY > minY else {
    return CGRect(x: 0, y: 0, width: width, height: height)
  }
  let pad = 12
  let originX = max(0, minX - pad)
  let originY = max(0, minY - pad)
  return CGRect(
    x: originX,
    y: originY,
    width: min(width - 1, maxX + pad) - originX + 1,
    height: min(height - 1, maxY + pad) - originY + 1
  )
}

func writePNG(_ image: CGImage, to path: String) {
  guard let data = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
    fail("无法写出肖像")
  }
  do {
    try data.write(to: URL(fileURLWithPath: path))
  } catch {
    fail("无法写出肖像")
  }
}

if args.count == 5 {
  let closed = cutoutImage(args[1])
  let open = cutoutImage(args[2])
  let rect = subjectRect(closed)
  writePNG(closed.cropping(to: rect) ?? closed, to: args[3])
  let openRect = CGRect(x: rect.minX, y: rect.minY, width: min(rect.width, CGFloat(open.width) - rect.minX), height: min(rect.height, CGFloat(open.height) - rect.minY))
  writePNG(open.cropping(to: openRect) ?? open, to: args[4])
} else {
  let image = cutoutImage(args[1])
  let rect = subjectRect(image)
  writePNG(image.cropping(to: rect) ?? image, to: args[2])
}
