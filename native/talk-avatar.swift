import AppKit
import AVFoundation
import CoreMedia
import CoreVideo
import Foundation
import Vision

let args = CommandLine.arguments
guard args.count == 6, let fps = Int32(args[5]), fps > 0 else {
  fputs("usage: talk-avatar closed.png open.png levels.bin output.mov fps\n", stderr)
  exit(2)
}

func fail(_ message: String) -> Never {
  fputs("\(message)\n", stderr)
  exit(1)
}

struct Portrait {
  let width: Int
  let height: Int
  let row: Int
  let bytes: [UInt8]
  let face: CGRect
}

func loadPortrait(_ path: String) -> Portrait {
  guard let image = NSImage(contentsOf: URL(fileURLWithPath: path)),
        let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
        cg.dataProvider != nil else {
    fail("无法读取肖像")
  }
  let width = cg.width - (cg.width % 2)
  let height = cg.height - (cg.height % 2)
  guard let cropped = cg.cropping(to: CGRect(x: 0, y: 0, width: width, height: height)),
        let croppedData = cropped.dataProvider?.data,
        let croppedPointer = CFDataGetBytePtr(croppedData) else {
    fail("无法读取肖像")
  }
  let request = VNDetectFaceRectanglesRequest()
  let handler = VNImageRequestHandler(cgImage: cropped, orientation: .up, options: [:])
  try? handler.perform([request])
  let box = request.results?.first?.boundingBox
  let face = box.map { rect in
    CGRect(
      x: rect.minX * CGFloat(width),
      y: (1 - rect.maxY) * CGFloat(height),
      width: rect.width * CGFloat(width),
      height: rect.height * CGFloat(height)
    )
  } ?? CGRect(x: CGFloat(width) * 0.3, y: CGFloat(height) * 0.18, width: CGFloat(width) * 0.4, height: CGFloat(height) * 0.28)
  return Portrait(
    width: width,
    height: height,
    row: cropped.bytesPerRow,
    bytes: Array(UnsafeBufferPointer(start: croppedPointer, count: CFDataGetLength(croppedData))),
    face: face
  )
}

func sample(_ portrait: Portrait, _ x: CGFloat, _ y: CGFloat) -> (UInt8, UInt8, UInt8, UInt8) {
  if x < 0 || y < 0 || x >= CGFloat(portrait.width - 1) || y >= CGFloat(portrait.height - 1) {
    return (0, 0, 0, 0)
  }
  let x0 = Int(x)
  let y0 = Int(y)
  let x1 = min(x0 + 1, portrait.width - 1)
  let y1 = min(y0 + 1, portrait.height - 1)
  let tx = x - CGFloat(x0)
  let ty = y - CGFloat(y0)
  func pixel(_ ix: Int, _ iy: Int) -> (CGFloat, CGFloat, CGFloat, CGFloat) {
    let index = iy * portrait.row + ix * 4
    return (
      CGFloat(portrait.bytes[index]),
      CGFloat(portrait.bytes[index + 1]),
      CGFloat(portrait.bytes[index + 2]),
      CGFloat(portrait.bytes[index + 3])
    )
  }
  func mix(_ p: (CGFloat, CGFloat, CGFloat, CGFloat), _ q: (CGFloat, CGFloat, CGFloat, CGFloat), _ t: CGFloat) -> (CGFloat, CGFloat, CGFloat, CGFloat) {
    (p.0 + (q.0 - p.0) * t, p.1 + (q.1 - p.1) * t, p.2 + (q.2 - p.2) * t, p.3 + (q.3 - p.3) * t)
  }
  let value = mix(mix(pixel(x0, y0), pixel(x1, y0), tx), mix(pixel(x0, y1), pixel(x1, y1), tx), ty)
  return (UInt8(value.0), UInt8(value.1), UInt8(value.2), UInt8(value.3))
}

func align(_ open: Portrait, onto closed: Portrait) -> [UInt8] {
  if open.width == closed.width && open.height == closed.height {
    return packed(open)
  }
  let openCenter = CGPoint(x: open.face.midX, y: open.face.midY)
  let closedCenter = CGPoint(x: closed.face.midX, y: closed.face.midY)
  var pixels = [UInt8](repeating: 0, count: closed.width * closed.height * 4)
  for y in 0..<closed.height {
    for x in 0..<closed.width {
      let srcX = openCenter.x + CGFloat(x) - closedCenter.x
      let srcY = openCenter.y + CGFloat(y) - closedCenter.y
      let pixel = sample(open, srcX, srcY)
      let index = (y * closed.width + x) * 4
      pixels[index] = pixel.0
      pixels[index + 1] = pixel.1
      pixels[index + 2] = pixel.2
      pixels[index + 3] = pixel.3
    }
  }
  return pixels
}

func packed(_ portrait: Portrait) -> [UInt8] {
  var pixels = [UInt8](repeating: 0, count: portrait.width * portrait.height * 4)
  for y in 0..<portrait.height {
    for x in 0..<portrait.width {
      let source = y * portrait.row + x * 4
      let index = (y * portrait.width + x) * 4
      pixels[index] = portrait.bytes[source]
      pixels[index + 1] = portrait.bytes[source + 1]
      pixels[index + 2] = portrait.bytes[source + 2]
      pixels[index + 3] = portrait.bytes[source + 3]
    }
  }
  return pixels
}

let closed = loadPortrait(args[1])
let open = loadPortrait(args[2])
let resting = packed(closed)
let speaking = align(open, onto: closed)
let levelData = (try? Data(contentsOf: URL(fileURLWithPath: args[3]))) ?? Data()
let frameCount = levelData.count / MemoryLayout<Float>.size
guard frameCount > 0 else { fail("没有口型数据") }
let levels: [Float] = levelData.withUnsafeBytes { raw in
  Array(raw.bindMemory(to: Float.self).prefix(frameCount))
}

let width = closed.width
let height = closed.height
var pool: CVPixelBufferPool?
let poolAttrs: [String: Any] = [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
  kCVPixelBufferWidthKey as String: width,
  kCVPixelBufferHeightKey as String: height,
  kCVPixelBufferIOSurfacePropertiesKey as String: [:],
]
CVPixelBufferPoolCreate(nil, nil, poolAttrs as CFDictionary, &pool)
guard let pool else { fail("无法准备画面") }

let output = URL(fileURLWithPath: args[4])
try? FileManager.default.removeItem(at: output)
guard let writer = try? AVAssetWriter(outputURL: output, fileType: .mov) else { fail("无法写出表演") }
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.proRes4444,
  AVVideoWidthKey: width,
  AVVideoHeightKey: height,
])
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: poolAttrs)
input.expectsMediaDataInRealTime = false
guard writer.canAdd(input) else { fail("无法写出表演") }
writer.add(input)
guard writer.startWriting() else { fail(writer.error?.localizedDescription ?? "无法写出表演") }
writer.startSession(atSourceTime: .zero)

for frame in 0..<frameCount {
  while !input.isReadyForMoreMediaData {
    RunLoop.current.run(until: Date().addingTimeInterval(0.005))
  }
  var buffer: CVPixelBuffer?
  guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let buffer else {
    fail("无法准备画面")
  }
  let pixels = levels[frame] >= 0.5 ? speaking : resting
  CVPixelBufferLockBaseAddress(buffer, [])
  if let base = CVPixelBufferGetBaseAddress(buffer) {
    let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
    let target = base.bindMemory(to: UInt8.self, capacity: rowBytes * height)
    for y in 0..<height {
      let src = y * width * 4
      let dst = y * rowBytes
      for x in 0..<width {
        target[dst + x * 4] = pixels[src + x * 4 + 2]
        target[dst + x * 4 + 1] = pixels[src + x * 4 + 1]
        target[dst + x * 4 + 2] = pixels[src + x * 4]
        target[dst + x * 4 + 3] = pixels[src + x * 4 + 3]
      }
    }
  }
  CVPixelBufferUnlockBaseAddress(buffer, [])
  let time = CMTime(value: CMTimeValue(frame), timescale: fps)
  if !adaptor.append(buffer, withPresentationTime: time) {
    fail(writer.error?.localizedDescription ?? "无法写出表演")
  }
}

input.markAsFinished()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
if writer.status != .completed { fail(writer.error?.localizedDescription ?? "无法写出表演") }
