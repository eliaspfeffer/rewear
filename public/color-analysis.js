import { seasonFromSamples } from './style-engine.js';

let detectorPromise;
function detector() {
  if (!detectorPromise) detectorPromise = (async () => {
    const { FilesetResolver, FaceLandmarker } = await import('./vendor/vision/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('./vendor/vision/wasm', import.meta.url).href);
    return FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: new URL('./vendor/vision/face_landmarker.task', import.meta.url).href, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 2, minFaceDetectionConfidence: .6, minFacePresenceConfidence: .6 });
  })().catch(error => { detectorPromise = null; throw error; });
  return detectorPromise;
}
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
function sample(context, points, radius, width, height) {
  const channels = [[], [], []];
  for (const point of points) {
    const x = Math.max(0, Math.min(width - radius * 2 - 1, Math.round(point.x * width - radius)));
    const y = Math.max(0, Math.min(height - radius * 2 - 1, Math.round(point.y * height - radius)));
    const data = context.getImageData(x, y, radius * 2 + 1, radius * 2 + 1).data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 730) continue;
      for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
    }
  }
  if (!channels[0].length) throw new Error('Das Gesicht ist zu stark überbelichtet. Versuch ein Foto in indirektem Tageslicht.');
  return '#' + channels.map(c => median(c).toString(16).padStart(2, '0')).join('');
}
export async function analyzePortrait(file, onProgress = () => {}) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Bitte wähle ein JPG, PNG oder WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Das Foto ist größer als 10 MB. Nimm bitte eine kleinere Datei.');
  onProgress('Gesichtserkennung wird geladen … Beim ersten Mal etwa 17 MB.');
  const face = await detector();
  const image = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: 1200, resizeQuality: 'high' });
  try {
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0, canvas.width, canvas.height);
    onProgress('Gesichtsbereiche finden und Farben auswerten …');
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const result = face.detect(canvas);
    if (!result.faceLandmarks.length) throw new Error('Kein Gesicht sicher erkannt. Wähle ein scharfes Porträt von vorn, mit sichtbarer Stirn und ohne Sonnenbrille.');
    if (result.faceLandmarks.length > 1) throw new Error('Auf dem Foto sind mehrere Gesichter. Nimm bitte ein Foto von dir allein.');
    const lm = result.faceLandmarks[0], w = canvas.width, h = canvas.height;
    const faceWidth = Math.abs(lm[234].x - lm[454].x) * w;
    if (faceWidth < 70) throw new Error('Dein Gesicht ist zu klein im Bild. Wähle bitte ein näher aufgenommenes Porträt.');
    const radius = Math.max(2, Math.round(faceWidth * .025));
    const skin = sample(c, [lm[50], lm[280], lm[118], lm[347], lm[151]], radius, w, h);
    const hairPoint = { x: lm[10].x, y: Math.max(.01, lm[10].y - Math.abs(lm[152].y - lm[10].y) * .12) };
    const hair = sample(c, [hairPoint, { x: hairPoint.x - .015, y: hairPoint.y }, { x: hairPoint.x + .015, y: hairPoint.y }], radius, w, h);
    const eyes = sample(c, [lm[468] || lm[159], lm[473] || lm[386]], Math.max(1, Math.round(radius / 2)), w, h);
    const quality = [];
    const left = sample(c, [lm[50]], radius, w, h), right = sample(c, [lm[280]], radius, w, h);
    const brightness = hex => hex.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16)).reduce((a,b) => a+b) / 3;
    if (Math.abs(brightness(left) - brightness(right)) > 28) quality.push('Eine Gesichtshälfte liegt im Schatten. Gleichmäßigeres Licht verbessert die Einschätzung.');
    if (Math.abs(lm[1].x - (lm[234].x + lm[454].x) / 2) * w > faceWidth * .17) quality.push('Dein Gesicht ist etwas gedreht. Ein frontales Foto ist besser.');
    const analysis = seasonFromSamples({ skin, hair, eyes, quality });
    return { ...analysis, faceDetected: true };
  } finally { image.close(); }
}
