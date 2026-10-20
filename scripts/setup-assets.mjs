// Prepara os arquivos do MediaPipe para rodar localmente (inclusive offline no Electron).
// Roda automaticamente depois do "npm install". Pode rodar de novo com: npm run setup-assets
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 1) Arquivos WebAssembly do MediaPipe
const wasmSrc = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDst = join(root, 'public', 'mediapipe', 'wasm');
if (existsSync(wasmSrc)) {
  mkdirSync(wasmDst, { recursive: true });
  cpSync(wasmSrc, wasmDst, { recursive: true });
  console.log('[setup-assets] wasm copiado para public/mediapipe/wasm');
} else {
  console.warn('[setup-assets] pasta wasm do MediaPipe não encontrada (rode npm install)');
}

// 2) Modelos do MediaPipe: mãos (sempre) e rosto (filtros que destacam o rosto, como o Pontilhado).
// Precisam de internet só nesta etapa.
const modelDir = join(root, 'public', 'models');
const MODELS = [
  {
    file: 'hand_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  {
    file: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  },
];

for (const { file, url } of MODELS) {
  const modelPath = join(modelDir, file);
  if (existsSync(modelPath)) {
    console.log(`[setup-assets] ${file} já existe, nada a baixar`);
    continue;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(modelDir, { recursive: true });
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log(`[setup-assets] modelo baixado para public/models/${file}`);
  } catch (err) {
    // Não falha a instalação: o app tenta baixar do servidor do Google na hora de abrir.
    console.warn(`[setup-assets] não consegui baixar ${file} agora (${err.message}).`);
    console.warn('[setup-assets] o app vai tentar baixar ao abrir, ou rode: npm run setup-assets');
  }
}
