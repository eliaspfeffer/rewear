import Foundation
import Vision
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

// All requests run with Apple's local Vision models. No face identities or face prints.
struct Crop: Codable {
    var id: String; var kind: String; var label: String; var image: String
    var palette: [String]; var feature: [Float]; var hash: String
    var review: Bool; var reason: String; var classification: String
}
struct Result: Codable { var crops: [Crop]; var faces: Int; var bodies: Int; var reason: String; var portrait: String?; var portraitQuality: Double? }
func image(_ path: String) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let img = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 1600] as CFDictionary)
    else { throw NSError(domain: "Bild nicht lesbar", code: 1) }
    return img
}
func pixels(_ image: CGImage, _ width: Int, _ height: Int) -> [UInt8] {
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    bytes.withUnsafeMutableBytes { ptr in
        let context = CGContext(data: ptr.baseAddress, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.interpolationQuality = .high; context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    return bytes
}
func palette(_ image: CGImage) -> [String] {
    // Sample the center of the garment to reduce exposed arms and surrounding scenery.
    let center = image.cropping(to: CGRect(x: Double(image.width)*0.22, y: Double(image.height)*0.15, width: Double(image.width)*0.56, height: Double(image.height)*0.7)) ?? image
    let bytes = pixels(center, 32, 32)
    var bins: [Int: (Int, Int, Int, Int)] = [:]
    for i in stride(from: 0, to: bytes.count, by: 4) {
        let r = Int(bytes[i]), g = Int(bytes[i+1]), b = Int(bytes[i+2]), key = (r/48)*36 + (g/48)*6 + b/48
        let old = bins[key] ?? (0,0,0,0); bins[key] = (old.0+1, old.1+r, old.2+g, old.3+b)
    }
    return bins.values.sorted { $0.0 > $1.0 }.prefix(3).map { String(format: "#%02x%02x%02x", $0.1/$0.0, $0.2/$0.0, $0.3/$0.0) }
}
func dHash(_ image: CGImage) -> String {
    let data = pixels(image, 9, 8); var value: UInt64 = 0
    for y in 0..<8 { for x in 0..<8 {
        let a = (y*9+x)*4, b = a+4
        let lightA = Int(data[a])*3+Int(data[a+1])*6+Int(data[a+2])
        let lightB = Int(data[b])*3+Int(data[b+1])*6+Int(data[b+2])
        if lightA > lightB { value |= UInt64(1) << (y*8+x) }
    }}
    return String(format: "%016llx", value)
}
func jpeg(_ image: CGImage, to path: String) throws {
    guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else { throw NSError(domain: "Ausschnitt nicht speicherbar", code: 2) }
    // Re-encoding deliberately leaves GPS, names and other source metadata out.
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.86] as CFDictionary)
    if !CGImageDestinationFinalize(dest) { throw NSError(domain: "Ausschnitt nicht speicherbar", code: 3) }
}
func analyze(_ input: String, directory: String, id: String) throws -> Result {
    let img = try image(input)
    let faces = VNDetectFaceRectanglesRequest(), pose = VNDetectHumanBodyPoseRequest()
    try VNImageRequestHandler(cgImage: img).perform([faces,pose])
    let faceCount = faces.results?.count ?? 0, bodies = pose.results ?? []
    var crops: [Crop] = []
    for (index, body) in bodies.enumerated() {
        func point(_ key: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
            guard let p = try? body.recognizedPoint(key), p.confidence > 0.35 else { return nil }; return p.location
        }
        guard let left = point(.leftShoulder), let right = point(.rightShoulder) else { continue }
        let span = abs(left.x-right.x), middle = (left.x+right.x)/2, shoulder = (left.y+right.y)/2
        guard span > 0.06 else { continue }
        let hipL = point(.leftHip), hipR = point(.rightHip)
        let hip = hipL != nil && hipR != nil ? (hipL!.y+hipR!.y)/2 : max(0,shoulder-span*1.35)
        var regions: [(String,CGRect)] = [("top",CGRect(x: middle-span*0.76, y: hip, width: span*1.52, height: shoulder-hip+span*0.03))]
        if let hl = hipL, let hr = hipR, let kl = point(.leftKnee), let kr = point(.rightKnee) {
            let lower = min(point(.leftAnkle)?.y ?? kl.y, point(.rightAnkle)?.y ?? kr.y)
            regions.append(("bottom",CGRect(x: min(hl.x,hr.x)-span*0.25, y: lower, width: abs(hl.x-hr.x)+span*0.5, height: hip-lower)))
        }
        for (kind, region) in regions {
            let rect = region.intersection(CGRect(x:0,y:0,width:1,height:1))
            guard rect.width > 0.06, rect.height > 0.06 else { continue }
            let pixelRect = CGRect(x: rect.minX*Double(img.width), y: (1-rect.maxY)*Double(img.height), width: rect.width*Double(img.width), height: rect.height*Double(img.height)).integral
            guard let crop = img.cropping(to: pixelRect), crop.width >= 64, crop.height >= 64 else { continue }
            let classify = VNClassifyImageRequest(), printRequest = VNGenerateImageFeaturePrintRequest()
            printRequest.revision = VNGenerateImageFeaturePrintRequestRevision2
            try VNImageRequestHandler(cgImage: crop).perform([classify,printRequest])
            let labels = (classify.results ?? []).prefix(15)
            let mapping: [(String,String)] = kind == "top" ? [("tshirt|t.shirt|tee.shirt|jersey","T-Shirt"),("hood|sweatshirt|pullover|sweater|cardigan","Pullover"),("jacket|coat|blazer","Jacke"),("shirt|blouse","Hemd")] : [("jean|denim","Jeans"),("shorts","Shorts"),("trouser|pants|legging","Hose")]
            var label = kind == "top" ? "Oberteil" : "Hose", evidence = "", recognized = false
            for observation in labels where observation.confidence > 0.12 {
                if let match = mapping.first(where: { observation.identifier.range(of: $0.0, options: [.regularExpression,.caseInsensitive]) != nil }) {
                    label = match.1; evidence = observation.identifier; recognized = true; break
                }
            }
            guard let featurePrint = printRequest.results?.first, featurePrint.elementType == .float else { continue }
            let feature = featurePrint.data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
            guard feature.count == featurePrint.elementCount, !feature.isEmpty, feature.allSatisfy({$0.isFinite}) else { continue }
            let cropID = "\(id)-\(index)-\(kind)", file = cropID+".jpg"
            try jpeg(crop,to:URL(fileURLWithPath:directory).appendingPathComponent(file).path)
            let review = faceCount != 1 || bodies.count != 1 || !recognized
            let reason = faceCount > 1 || bodies.count > 1 ? "Mehrere Personen: bitte selbst zuordnen." : faceCount == 0 ? "Kein Gesicht sichtbar: Personenzuordnung prüfen." : !recognized ? "Kleidungsart nicht sicher erkennbar; möglicherweise kein Kleidungsstück." : hipL == nil || hipR == nil ? "Einzelperson, nur teilweise sichtbar: untere Ausschnittkante geschätzt." : "Einzelperson in der gewählten Apple-Fotos-Sammlung; Körperposition erkannt."
            crops.append(Crop(id:cropID,kind:kind,label:label,image:file,palette:palette(crop),feature:feature,hash:dHash(crop),review:review,reason:reason,classification:evidence))
        }
    }
    if crops.contains(where: {$0.review}) { try jpeg(img,to:URL(fileURLWithPath:directory).appendingPathComponent(id+"-source.jpg").path) }
    var portrait: String? = nil, portraitQuality: Double? = nil
    if faceCount == 1, let face = faces.results?.first?.boundingBox, face.height*Double(img.height) >= 180 {
        let context = CGRect(x:face.midX-face.width*1.2,y:face.minY-face.height*0.35,width:face.width*2.4,height:face.height*2.35).intersection(CGRect(x:0,y:0,width:1,height:1))
        let rect = CGRect(x:context.minX*Double(img.width),y:(1-context.maxY)*Double(img.height),width:context.width*Double(img.width),height:context.height*Double(img.height)).integral
        if let photo = img.cropping(to:rect) {
            portrait = id+"-portrait.jpg";portraitQuality = face.height*Double(img.height)
            try jpeg(photo,to:URL(fileURLWithPath:directory).appendingPathComponent(portrait!).path)
        }
    }
    return Result(crops:crops,faces:faceCount,bodies:bodies.count,reason:crops.isEmpty ? "Kein ausreichend sichtbarer Kleidungsbereich mit Schulterpositionen gefunden." : "",portrait:portrait,portraitQuality:portraitQuality)
}
do {
    guard CommandLine.arguments.count == 4 else { throw NSError(domain:"Erwartet: Bild, Ausgabeordner, Kennung",code:4) }
    let result = try autoreleasepool { try analyze(CommandLine.arguments[1],directory:CommandLine.arguments[2],id:CommandLine.arguments[3]) }
    let data = try JSONEncoder().encode(result); FileHandle.standardOutput.write(data)
} catch { FileHandle.standardError.write(Data("Lokale Bildanalyse fehlgeschlagen: \(error.localizedDescription)".utf8)); exit(1) }
