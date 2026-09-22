// Encodes a folder of PNG frames into an H.264 MP4, with AVFoundation — so rendering the promo
// video needs nothing installed beyond Chrome and the macOS command line tools.
// scripts/store-video.mjs compiles and runs this only when ffmpeg isn't on PATH.
//
//   swiftc -O -o encode-mp4 encode-mp4.swift && ./encode-mp4 <frames-dir> <out.mp4> <fps>

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 4, let fps = Int32(args[3]), fps > 0 else {
    fail("usage: encode-mp4 <frames-dir> <out.mp4> <fps>")
}
let framesDir = URL(fileURLWithPath: args[1])
let out = URL(fileURLWithPath: args[2])

// The frames are named in order, so sorting by name is sorting by time.
let frames = ((try? FileManager.default.contentsOfDirectory(at: framesDir, includingPropertiesForKeys: nil)) ?? [])
    .filter { $0.pathExtension.lowercased() == "png" }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
guard !frames.isEmpty else { fail("no PNG frames in " + framesDir.path) }

func image(at url: URL) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

guard let first = image(at: frames[0]) else { fail("could not read " + frames[0].path) }
let width = first.width
let height = first.height

try? FileManager.default.removeItem(at: out)
guard let writer = try? AVAssetWriter(outputURL: out, fileType: .mp4) else { fail("could not write " + out.path) }

// 8 Mbit/s: the picture is flat colour and text, which H.264 likes, and the store's video is a
// YouTube link, so the upload is re-encoded anyway. Keyframes every two seconds, for seeking.
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: 8_000_000,
        AVVideoMaxKeyFrameIntervalKey: fps * 2,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoAllowFrameReorderingKey: true,
    ],
])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(input)
guard writer.startWriting() else { fail("could not start writing: " + String(describing: writer.error)) }
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()
for (i, url) in frames.enumerated() {
    guard let frame = image(at: url) else { fail("could not read " + url.path) }
    guard frame.width == width, frame.height == height else { fail(url.lastPathComponent + " is a different size") }
    while !input.isReadyForMoreMediaData { usleep(2000) }
    guard let pool = adaptor.pixelBufferPool else { fail("no pixel buffer pool") }
    var buffer: CVPixelBuffer?
    guard CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer) == kCVReturnSuccess, let pixels = buffer else {
        fail("out of pixel buffers")
    }
    CVPixelBufferLockBaseAddress(pixels, [])
    if let context = CGContext(
        data: CVPixelBufferGetBaseAddress(pixels),
        width: width, height: height, bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(pixels),
        space: colorSpace,
        bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    ) {
        context.draw(frame, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    CVPixelBufferUnlockBaseAddress(pixels, [])
    if !adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(i), timescale: fps)) {
        fail("could not append frame " + url.lastPathComponent + ": " + String(describing: writer.error))
    }
}

input.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("encoding failed: " + String(describing: writer.error)) }
