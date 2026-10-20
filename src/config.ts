// Configurações fixas do app. Mexa aqui para ajustar o comportamento base.

const base = import.meta.env.BASE_URL;

export const CONFIG = {
  /** Quantidade de mãos rastreadas ao mesmo tempo */
  numHands: 2,

  /** Resolução pedida à webcam (menor = mais leve) */
  camera: { width: 1280, height: 720 },

  /** Limiares de confiança do MediaPipe (0 a 1) */
  tracking: { minDetection: 0.5, minPresence: 0.5, minTracking: 0.5 },

  /** Onde ficam os arquivos do MediaPipe (copiados por scripts/setup-assets.mjs) */
  wasmPath: `${base}mediapipe/wasm`,
  modelLocal: `${base}models/hand_landmarker.task`,
  modelRemote:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

  /** Modelo de rosto (usado pelos filtros que destacam o rosto, como o Stippling) */
  faceModelLocal: `${base}models/face_landmarker.task`,
  faceModelRemote:
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
} as const;
