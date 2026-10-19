import { CONFIG } from '../config';

/** Abre a webcam e liga o stream no elemento <video>. */
export async function startCamera(video: HTMLVideoElement): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este ambiente não permite acesso à câmera.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      width: { ideal: CONFIG.camera.width },
      height: { ideal: CONFIG.camera.height },
      facingMode: 'user',
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();

  // Espera o vídeo ter dimensões válidas
  if (video.videoWidth === 0) {
    await new Promise<void>((resolve) => {
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    });
  }
}
