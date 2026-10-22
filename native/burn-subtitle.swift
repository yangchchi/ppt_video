import Foundation
import AppKit
import CoreGraphics
import CoreText

let args = CommandLine.arguments
let listing = args.count == 4 && args[1] == "lines"
guard args.count == 4 || ((args.count == 5 || args.count == 6) && !listing) else {
  fputs("usage: burn-subtitle input.png output.png text.txt [style] [boxes.json]\n       burn-subtitle lines input.png text.txt\n", stderr)
  exit(2)
}

let inputURL = URL(fileURLWithPath: listing ? args[2] : args[1])
let outputURL = listing ? nil : URL(fileURLWithPath: args[2])
let textURL = listing ? args[3] : args[3]
let captionStyle = listing ? "bar" : (args.count >= 5 && !args[4].hasSuffix(".json") ? args[4] : "bar")
let text = (try String(contentsOfFile: textURL, encoding: .utf8)).trimmingCharacters(in: .whitespacesAndNewlines)

guard let source = NSImage(contentsOf: inputURL),
      let tiff = source.tiffRepresentation,
      let sourceRep = NSBitmapImageRep(data: tiff),
      let sourceImage = sourceRep.cgImage else {
  fputs("无法读取画面\n", stderr)
  exit(1)
}

let width = sourceImage.width
let height = sourceImage.height

let sentenceMarks = Set(Array("。！？!?…"))
let clauseMarks = Set(Array("，、；：,;:"))
let closingMarks = Set(Array("\"”」』）)]》〉"))
let openingMarks = Set(Array("\"“「『（([《〈"))

func textWidth(_ value: String, font: NSFont) -> CGFloat {
  (value as NSString).size(withAttributes: [.font: font]).width
}

func fits(_ value: String, font: NSFont, maxWidth: CGFloat) -> Bool {
  value.isEmpty || textWidth(value, font: font) <= maxWidth
}

func isAsciiWordChar(_ ch: Character) -> Bool {
  ch.isASCII && (ch.isLetter || ch.isNumber || ch == "_" || ch == "+" || ch == "-" || ch == ".")
}

func splitKeepingDelimiters(_ paragraph: String, marks: Set<Character>) -> [String] {
  if paragraph.isEmpty { return [""] }
  var parts: [String] = []
  var current = ""
  let chars = Array(paragraph)
  var index = 0
  while index < chars.count {
    let ch = chars[index]
    current.append(ch)
    if marks.contains(ch) {
      var next = index + 1
      while next < chars.count && closingMarks.contains(chars[next]) {
        current.append(chars[next])
        next += 1
      }
      parts.append(current)
      current = ""
      index = next
      continue
    }
    index += 1
  }
  if !current.isEmpty { parts.append(current) }
  return parts
}

func hardWrap(_ paragraph: String, font: NSFont, maxWidth: CGFloat) -> [String] {
  if paragraph.isEmpty { return [""] }
  if fits(paragraph, font: font, maxWidth: maxWidth) { return [paragraph] }
  var lines: [String] = []
  var current = ""
  let chars = Array(paragraph)
  var index = 0
  while index < chars.count {
    let ch = chars[index]
    let next = current + String(ch)
    if !current.isEmpty && !fits(next, font: font, maxWidth: maxWidth) {
      var breakAt = current.count
      let currentChars = Array(current)
      for lookback in stride(from: currentChars.count - 1, through: 1, by: -1) {
        let left = String(currentChars[..<lookback])
        let rightFirst = currentChars[lookback]
        if openingMarks.contains(currentChars[lookback - 1]) { continue }
        if closingMarks.contains(rightFirst) || sentenceMarks.contains(rightFirst) || clauseMarks.contains(rightFirst) {
          continue
        }
        if currentChars[lookback - 1] == " " || clauseMarks.contains(currentChars[lookback - 1]) || sentenceMarks.contains(currentChars[lookback - 1]) {
          breakAt = lookback
          break
        }
        if isAsciiWordChar(currentChars[lookback - 1]) != isAsciiWordChar(rightFirst) {
          breakAt = lookback
          break
        }
      }
      if breakAt <= 0 || breakAt >= currentChars.count {
        lines.append(current)
        current = String(ch)
      } else {
        lines.append(String(currentChars[..<breakAt]))
        current = String(currentChars[breakAt...]) + String(ch)
        if !fits(current, font: font, maxWidth: maxWidth) {
          let overflow = Array(current)
          lines.append(String(overflow.dropLast()))
          current = String(overflow.last!)
        }
      }
    } else {
      current = next
    }
    index += 1
  }
  if !current.isEmpty { lines.append(current) }
  return lines.filter { !$0.isEmpty }
}

func packUnits(_ units: [String], font: NSFont, maxWidth: CGFloat) -> [String] {
  var lines: [String] = []
  var current = ""
  for unit in units {
    let trimmed = unit
    if trimmed.isEmpty { continue }
    if fits(trimmed, font: font, maxWidth: maxWidth) {
      let merged = current + trimmed
      if current.isEmpty {
        current = trimmed
      } else if fits(merged, font: font, maxWidth: maxWidth) {
        current = merged
      } else {
        lines.append(current)
        current = trimmed
      }
      continue
    }
    if !current.isEmpty {
      lines.append(current)
      current = ""
    }
    lines.append(contentsOf: hardWrap(trimmed, font: font, maxWidth: maxWidth))
  }
  if !current.isEmpty { lines.append(current) }
  return lines
}

func wrap(_ paragraph: String, font: NSFont, maxWidth: CGFloat) -> [String] {
  if paragraph.isEmpty { return [""] }
  var lines: [String] = []
  for sentence in splitKeepingDelimiters(paragraph, marks: sentenceMarks) {
    let piece = sentence
    if piece.trimmingCharacters(in: .whitespaces).isEmpty { continue }
    if fits(piece, font: font, maxWidth: maxWidth) {
      lines.append(piece)
      continue
    }
    let clauses = splitKeepingDelimiters(piece, marks: clauseMarks)
    lines.append(contentsOf: packUnits(clauses, font: font, maxWidth: maxWidth))
  }
  return lines.isEmpty ? [paragraph] : lines
}

func subtitleFont(size: CGFloat) -> NSFont {
  NSFont(name: "PingFangSC-Regular", size: size) ?? NSFont.systemFont(ofSize: size)
}

func subtitleLines(fontSize: CGFloat, maxWidth: CGFloat) -> [String] {
  let font = subtitleFont(size: fontSize)
  let paragraphs = text.components(separatedBy: "\n")
  let lines = paragraphs.flatMap { wrap($0, font: font, maxWidth: maxWidth) }.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
  return lines.isEmpty && !text.isEmpty ? [text.replacingOccurrences(of: "\n", with: "")] : lines
}

func highlightNumber(_ value: Any?) -> Double? {
  if let number = value as? NSNumber { return number.doubleValue }
  return nil
}

func highlightRects(width: Int, height: Int) -> [CGRect] {
  let boxArg = args.last.flatMap { $0.hasSuffix(".json") ? $0 : nil }
  guard let boxPath = boxArg,
        let data = try? Data(contentsOf: URL(fileURLWithPath: boxPath)),
        let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
    return []
  }
  return rows.compactMap { row in
    guard let x = highlightNumber(row["x"]),
          let y = highlightNumber(row["y"]),
          let w = highlightNumber(row["w"]),
          let h = highlightNumber(row["h"]),
          w > 0, h > 0 else {
      return nil
    }
    return CGRect(
      x: CGFloat(x) * CGFloat(width),
      y: (1 - CGFloat(y) - CGFloat(h)) * CGFloat(height),
      width: CGFloat(w) * CGFloat(width),
      height: CGFloat(h) * CGFloat(height)
    )
  }
}

func drawHighlights(_ ctx: CGContext, width: Int, height: Int) {
  let rects = highlightRects(width: width, height: height)
  if rects.isEmpty { return }
  let weight = max(6, CGFloat(width) / 280)
  ctx.setStrokeColor(NSColor(calibratedRed: 0.96, green: 0.55, blue: 0.08, alpha: 0.95).cgColor)
  ctx.setLineWidth(weight)
  for rect in rects {
    let box = rect.insetBy(dx: -weight, dy: -weight)
    let radius = min(18, box.height / 4)
    ctx.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
    ctx.strokePath()
  }
}

func jsonString(_ value: String) -> String {
  let escaped = value
    .replacingOccurrences(of: "\\", with: "\\\\")
    .replacingOccurrences(of: "\"", with: "\\\"")
  return "\"\(escaped)\""
}

guard let ctx = CGContext(
  data: nil,
  width: width,
  height: height,
  bitsPerComponent: 8,
  bytesPerRow: 0,
  space: CGColorSpaceCreateDeviceRGB(),
  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
) else {
  fputs("无法创建画布\n", stderr)
  exit(1)
}

let fontSize = CGFloat(max(28, width / 48))
let marginX = CGFloat(width) * 0.06
let padX = fontSize * 0.55
let padY = fontSize * 0.28
let maxWidth = CGFloat(width) - marginX * 2 - padX * 2
let lines = subtitleLines(fontSize: fontSize, maxWidth: maxWidth)

if listing {
  print("[" + lines.map(jsonString).joined(separator: ",") + "]")
  exit(0)
}

ctx.draw(sourceImage, in: CGRect(x: 0, y: 0, width: width, height: height))
drawHighlights(ctx, width: width, height: height)

if let line = lines.first, !line.isEmpty {
  let lightBoard = captionStyle == "board"
  let font = subtitleFont(size: fontSize)
  let attributes: [NSAttributedString.Key: Any] = [
    .font: font,
    .foregroundColor: lightBoard ? NSColor.black : NSColor.white,
  ]
  let styled = NSAttributedString(string: line, attributes: attributes)
  let textLine = CTLineCreateWithAttributedString(styled)
  var ascent: CGFloat = 0
  var descent: CGFloat = 0
  let textWidth = CGFloat(CTLineGetTypographicBounds(textLine, &ascent, &descent, nil))
  let textHeight = ascent + descent
  let boxWidth = min(CGFloat(width) - marginX * 2, textWidth + padX * 2)
  let boxHeight = textHeight + padY * 2
  let box = CGRect(
    x: (CGFloat(width) - boxWidth) / 2,
    y: CGFloat(height) * 0.055,
    width: boxWidth,
    height: boxHeight
  )
  let radius = min(fontSize * 0.18, boxHeight / 2)
  ctx.addPath(CGPath(roundedRect: box, cornerWidth: radius, cornerHeight: radius, transform: nil))
  ctx.setFillColor((lightBoard ? NSColor.white.withAlphaComponent(0.92) : NSColor.black.withAlphaComponent(0.86)).cgColor)
  ctx.fillPath()
  ctx.saveGState()
  ctx.textMatrix = .identity
  ctx.translateBy(x: box.minX + (boxWidth - textWidth) / 2, y: box.minY + (boxHeight - textHeight) / 2 + descent)
  CTLineDraw(textLine, ctx)
  ctx.restoreGState()
}

guard let output = ctx.makeImage() else {
  fputs("无法导出字幕画面\n", stderr)
  exit(1)
}
let rep = NSBitmapImageRep(cgImage: output)
guard let png = rep.representation(using: .png, properties: [:]) else {
  fputs("无法编码 PNG\n", stderr)
  exit(1)
}
guard let outputURL else { exit(0) }
try png.write(to: outputURL)
