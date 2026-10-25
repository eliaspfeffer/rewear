export function createPortraitCamera(video, mediaDevices = navigator.mediaDevices) {
  let stream = null, revision = 0;
  const release = value => value?.getTracks().forEach(track => track.stop());
  function stop() {
    revision++;
    release(stream);
    stream = null;
    video.pause();
    video.srcObject = null;
  }
  async function start() {
    stop();
    const request = revision;
    if (!mediaDevices?.getUserMedia) throw new Error('Dieser Browser unterstützt hier keine Kamera. Öffne REWEAR über HTTPS oder lokal auf diesem Mac.');
    let acquired;
    try {
      acquired = await mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } } });
      // A permission prompt can resolve after the dialog has already closed.
      if (request !== revision) { release(acquired); return false; }
      stream = acquired;
      video.srcObject = stream;
      await video.play();
      return request === revision;
    } catch (error) {
      release(acquired);
      if (request !== revision) return false;
      stop();
      throw error;
    }
  }
  async function capture(createCanvas = () => document.createElement('canvas')) {
    if (!stream?.getVideoTracks().some(track => track.readyState === 'live') || video.readyState < 2 || !video.videoWidth || !video.videoHeight) throw new Error('Die Kamera ist noch nicht bereit. Warte kurz und versuche es erneut.');
    const request = revision, canvas = createCanvas();
    const scale = Math.min(1, 1600 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    try {
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      const photo = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
      if (request !== revision) return null;
      if (!photo) throw new Error('Das Foto konnte nicht aufgenommen werden. Bitte versuche es noch einmal.');
      return photo;
    } finally { canvas.width = canvas.height = 0; }
  }
  return { start, stop, capture };
}

export function cameraError(error) {
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(error.name)) return 'Die Kamera ist nicht freigegeben. Erlaube REWEAR den Kamerazugriff in den Website-Einstellungen deines Browsers und versuche es erneut. Auf dem Mac muss auch der Browser unter Systemeinstellungen → Datenschutz & Sicherheit → Kamera erlaubt sein.';
  if (['NotFoundError', 'DevicesNotFoundError'].includes(error.name)) return 'Keine Kamera gefunden. Verbinde eine Kamera und versuche es erneut.';
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(error.name)) return 'Die Kamera lässt sich gerade nicht öffnen. Schließe andere Apps, die sie verwenden, und versuche es erneut.';
  return error.message || 'Die Kamera konnte nicht gestartet werden. Bitte versuche es erneut.';
}
