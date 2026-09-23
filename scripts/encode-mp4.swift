// Encodes PNG frames, read one after another from standard input, into an H.264 MP4, with
// AVFoundation — so rendering the promo video needs nothing installed beyond Chrome and the macOS
// command line tools. scripts/store-video.mjs pipes each frame in as soon as it has photographed
// it, so nothing is kept on disk; it compiles and runs this only when ffmpeg isn't on PATH. With a
// soundtrack (AAC, in an .m4a), the two are put in one MP4 at the end, neither re-encoded.
//
//   swiftc -O -o encode-mp4 encode-mp4.swift && <PNG stream> | ./encode-mp4 <out.mp4> <fps> [sound.m4a]

import AVFoundation
import CoreGraphics
import Foundation
import ImageIO

func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}

let args = CommandLine.arguments
guard args.count == 3 || args.count == 4, let fps = Int32(args[2]), fps > 0 else {
    fail("usage: encode-mp4 <out.mp4> <fps> [sound.m4a] < frames.png")
}
let out = URL(fileURLWithPath: args[1])
let sound = args.count == 4 ? URL(fileURLWithPath: args[3]) : nil
// With a soundtrack, the picture goes to a file of its own first and is joined to the sound after.
let pictureOut = sound == nil ? out : out.deletingPathExtension().appendingPathExtension("picture.mp4")

// ---- the frames, as they arrive ----
let input = FileHandle.standardInput

/// Exactly `count` bytes of standard input; nil only when it has ended cleanly, between frames.
func read(_ count: Int, atStart: Bool = false) -> Data? {
    var data = Data(capacity: count)
    while data.count < count {
        let chunk = input.readData(ofLength: count - data.count)
        if chunk.isEmpty {
            if atStart && data.isEmpty { return nil }
            fail("standard input ended inside a frame")
        }
        data.append(chunk)
    }
    return data
}

let signature = Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
let iend = Data("IEND".utf8)

/// The next PNG file on standard input, whole: its signature, then chunk after chunk up to IEND.
/// PNGs say how long each chunk is, so the stream needs no separators.
func nextFrame() -> CGImage? {
    guard let head = read(8, atStart: true) else { return nil }
    guard head == signature else { fail("standard input is not a stream of PNG files") }
    var png = head
    while true {
        let chunk = read(8)!
        let length = chunk.prefix(4).reduce(0) { $0 << 8 | Int($1) }
        png.append(chunk)
        png.append(read(length + 4)!) // the chunk's data and its CRC
        if chunk.suffix(4) == iend { break }
    }
    guard let source = CGImageSourceCreateWithData(png as CFData, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fail("could not read a frame") }
    return image
}

guard let first = nextFrame() else { fail("no frames on standard input") }
let width = first.width
let height = first.height

// ---- the encoder ----
try? FileManager.default.removeItem(at: pictureOut)
guard let writer = try? AVAssetWriter(outputURL: pictureOut, fileType: .mp4) else { fail("could not write " + pictureOut.path) }

// About 0.12 bits a pixel: 60 Mbit/s for 4K at 60 fps, which is what YouTube asks of an upload
// (53 to 68), and 7.5 at 1080p30. The picture is flat colour and text, which H.264 likes, and it is
// re-encoded on YouTube, so what matters here is that the upload loses nothing worth keeping.
// Keyframes every two seconds, for seeking.
let bitRate = Int(Double(width * height) * Double(fps) * 0.12)
let video = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264,
    AVVideoWidthKey: width,
    AVVideoHeightKey: height,
    AVVideoColorPropertiesKey: [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ],
    AVVideoCompressionPropertiesKey: [
        AVVideoAverageBitRateKey: bitRate,
        AVVideoMaxKeyFrameIntervalKey: fps * 2,
        AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
        AVVideoAllowFrameReorderingKey: true,
    ],
])
video.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: video, sourcePixelBufferAttributes: [
    kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    kCVPixelBufferWidthKey as String: width,
    kCVPixelBufferHeightKey as String: height,
])
writer.add(video)
guard writer.startWriting() else { fail("could not start writing: " + String(describing: writer.error)) }
writer.startSession(atSourceTime: .zero)

let colorSpace = CGColorSpaceCreateDeviceRGB()
var count = 0
var next: CGImage? = first
while let frame = next {
    guard frame.width == width, frame.height == height else { fail("frame \(count) is a different size") }
    while !video.isReadyForMoreMediaData { usleep(2000) }
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
    if !adaptor.append(pixels, withPresentationTime: CMTime(value: CMTimeValue(count), timescale: fps)) {
        fail("could not append frame \(count): " + String(describing: writer.error))
    }
    count += 1
    next = nextFrame()
}

video.markAsFinished()
let done = DispatchSemaphore(value: 0)
writer.finishWriting { done.signal() }
done.wait()
if writer.status != .completed { fail("encoding failed: " + String(describing: writer.error)) }

// ---- the soundtrack, alongside ----
if let sound {
    let picture = AVURLAsset(url: pictureOut)
    let audio = AVURLAsset(url: sound)
    guard let pictureTrack = picture.tracks(withMediaType: .video).first,
          let audioTrack = audio.tracks(withMediaType: .audio).first else { fail("nothing to put together") }
    let both = AVMutableComposition()
    let length = picture.duration
    do {
        try both.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)?
            .insertTimeRange(CMTimeRange(start: .zero, duration: length), of: pictureTrack, at: .zero)
        try both.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)?
            .insertTimeRange(CMTimeRange(start: .zero, duration: CMTimeMinimum(length, audio.duration)), of: audioTrack, at: .zero)
    } catch {
        fail("could not put the picture and the sound together: " + String(describing: error))
    }
    try? FileManager.default.removeItem(at: out)
    // Passthrough: both tracks are copied as they are, the picture above and the AAC from afconvert.
    guard let export = AVAssetExportSession(asset: both, presetName: AVAssetExportPresetPassthrough) else { fail("no exporter") }
    export.outputURL = out
    export.outputFileType = .mp4
    export.shouldOptimizeForNetworkUse = true
    let exported = DispatchSemaphore(value: 0)
    export.exportAsynchronously { exported.signal() }
    exported.wait()
    try? FileManager.default.removeItem(at: pictureOut)
    if export.status != .completed { fail("could not write " + out.path + ": " + String(describing: export.error)) }
}
