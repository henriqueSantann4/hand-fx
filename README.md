# HandFX

App que rastreia **duas mãos** pela webcam e desenha uma camada 3D (Three.js) por cima do vídeo espelhado. Roda no navegador e, empacotado, como app de PC (Electron).

Tecnologias: TypeScript, Vite, Three.js, MediaPipe Hand Landmarker, lil-gui, Electron.

## O que o app faz hoje

- **Imagens 2D por gesto:** você adiciona imagens e cria regras ("quando a mão esquerda abrir, mostre esta imagem na palma").
- **Moldura com filtro:** com as duas mãos você forma uma moldura (quadrilátero) e a câmera ganha um filtro dentro dela.
- **Mesa de DJ:** importe músicas, toque em dois decks, misture com crossfader, mude volume, velocidade, EQ, filtro, eco e reverb, e controle tudo com as mãos.
- **Tela de configuração própria** para tudo isso (botão "Configurar" no canto superior esquerdo, ou tecla **C**).
- **Sistema de efeitos** para você criar efeitos 3D em código (pasta `src/effects`).

## Como rodar

Precisa do Node.js 18 ou mais novo.

```bash
npm install          # instala tudo e prepara os arquivos do MediaPipe (precisa de internet)
npm run dev          # abre no navegador: http://localhost:5173
npm run electron:dev # abre como app de PC, com recarga automática ao salvar
```

Outros comandos:

```bash
npm run typecheck      # confere os tipos
npm run build          # gera a pasta dist
npm run electron:start # build + abre no Electron, como app final
npm run dist           # gera o instalador (.exe no Windows) na pasta release
```

> Se o download do modelo falhar no `npm install`, rode `npm run setup-assets` depois. Sem esse passo, o app tenta baixar o modelo do servidor do Google ao abrir (precisa de internet).
>
> Se o seu npm bloquear o script de instalação do Electron (aviso `allow-scripts`), rode `node node_modules/electron/install.js`.

Teclas: **C** abre/fecha a tela de configuração, **D** abre/fecha a mesa de DJ, **H** esconde/mostra o painel de cima (lil-gui).

## Imagens por gesto

Na tela de configuração, seção **Imagens**, clique em "Adicionar imagens" ou arraste os arquivos para a tela. As imagens ficam só na sessão: ao recarregar, adicione de novo.

Na seção **Regras**, cada regra define:

| Campo | Opções |
| --- | --- |
| Mão | qualquer, esquerda ou direita |
| Gesto | mão aberta, punho fechado, indicador levantado, pinça |
| Imagem | uma das imagens adicionadas |
| Posição | presa à palma, presa ao pulso (punho), na ponta de um dedo (você escolhe qual), ou fixa na tela (X e Y em %) |
| Tamanho | acompanha o tamanho da mão ou fixo em pixels |
| Extras | opacidade, deslocamento X/Y, girar junto com a mão |

A imagem aparece enquanto o gesto durar e some quando ele termina.

### Esqueleto das mãos

O esqueleto (pontos e linhas) das mãos aparece por padrão. Você pode desligar na seção **Mãos** da tela de configuração. Quando uma imagem está presa a uma mão (palma, pulso ou ponta de dedo), o esqueleto dessa mão some, e volta quando a imagem some. O texto de diagnóstico (FPS, gestos, dedos) é separado e tem a sua opção no painel de cima.

### Como os gestos são reconhecidos

- **Mão aberta:** os 4 dedos (indicador a mindinho) esticados.
- **Punho fechado:** os 4 dedos dobrados.
- **Indicador levantado:** só o indicador esticado (a direção não importa).
- **Pinça:** polegar e indicador juntos (com histerese para não piscar).

Um gesto só vale depois de se manter por cerca de 0,1 s. O diagnóstico (canto inferior esquerdo) mostra o gesto reconhecido e quais dedos estão esticados (`1` = esticado), para você conferir.

## Mesa de DJ

Botão **🎧 DJ (D)** (ou tecla **D**). Adicione músicas (ou arraste os arquivos para a tela: mp3, wav, ogg, m4a, flac) e carregue cada uma em um deck pelos botões **A** e **B**. As músicas ficam só na sessão.

Cada deck tem:

- tocar/pausar, barra de posição (clique ou arraste para ir a qualquer ponto), voltar/avançar 5 s e ½ s, voltar ao início;
- **⏪ / ⏩ segurando:** rebobina ou avança rápido (o som para enquanto segura e volta ao soltar);
- **Frear / Acelerar segurando:** muda um pouco a velocidade para sincronizar duas músicas;
- volume, velocidade (muda o tom junto, como um vinil), graves/médios/agudos, filtro (esquerda corta agudos, direita corta graves), eco e reverb.

Na mesa: **crossfader** (no centro os dois decks tocam inteiros; para um lado, o outro some) e volume geral.

### Controle com as mãos

Na seção **Regras de gestos (DJ)** você cria regras, como nas imagens:

- **Mover um controle:** enquanto a mão faz o gesto, a posição dela move o controle (altura, lados, abertura ou pinça). Ex.: mão esquerda + punho + Deck A · Volume + altura. Ao soltar o gesto, o controle fica onde parou. A velocidade "gruda" em 1× perto do normal.
- **Fazer uma ação:** ao começar o gesto, executa a ação (tocar/pausar, voltar 5 s, crossfader todo para um lado...). Ações marcadas "enquanto durar" (rebobinar, avançar rápido, frear, acelerar) valem durante o gesto.

> O navegador só libera o som depois de um clique na página. No app do Electron isso já vem liberado.

## Moldura com filtro (duas mãos)

1. Com as duas mãos, estique polegar e indicador de cada uma.
2. Aproxime as pontas dos dois polegares e as pontas dos dois indicadores (como se as mãos se encostassem).
3. Afaste as mãos (quando ela abre o bastante, aparece crescendo a partir do centro, em uma animação rápida): as quatro pontas formam um quadrilátero, desenhado com linhas brancas. Dentro dele, a câmera recebe o filtro escolhido.
4. Se você girar uma das mãos, o contorno se cruza e a moldura vira dois triângulos. Cada triângulo pode ter o seu filtro (o que fica mais à esquerda e o que fica mais à direita na tela), ou os dois podem usar o mesmo filtro.

A moldura se desliga quando alguma das mãos some ou o indicador deixa de estar esticado. Enquanto ela está ativa, as imagens por gesto ficam escondidas.

Na tela de configuração (seção **Moldura**) você ajusta:

- se as **linhas brancas do contorno** aparecem (a mesma caixa vale para o quadrilátero e para os triângulos);
- a **distância para ativar** (quão perto as pontas precisam estar, em tamanhos de mão);
- o filtro do **quadrilátero** (moldura normal) e os parâmetros dele;
- o filtro dos **dois triângulos**: marque "Mesmo filtro nos dois" para usar um só, ou escolha um para o triângulo da esquerda e outro para o da direita. Cada um tem seus próprios parâmetros, independentes do quadrilátero.

Na **Pixelização**, a barra "Força (tamanho dos pixels)" muda o tamanho dos blocos (de 2 a 200 px).

Veja o `ROADMAP.md` para os próximos.

### Filtros de câmera

Cada filtro tem poucos controles, que aparecem como sliders em **Configurar → Moldura**:

| Filtro | Controles |
| --- | --- |
| Pixelização | Força (tamanho dos pixels) |
| Desfoque | Raio |
| Inverter cores | Intensidade |
| Preto e branco | Intensidade, contraste |
| **Pixel sorting** | Intensidade (quantos pixels entram), Tamanho dos rastros, Frequência (mudanças por segundo), Direção |
| **Vidro fosco** | Intensidade, Tamanho do grão |
| **Moiré** | Intensidade, Tamanho das linhas, Ângulo entre as grades, Frequência (velocidade) |
| **Pontilhado** | Tamanho dos pontos, Intensidade, Cor (preto e branco ou colorido) |

O **Pixel sorting** é uma versão simples do script `pixelsort_video.py`: em cada linha ele ordena por brilho o começo de trechos de pixels, com comprimento sorteado que muda várias vezes por segundo. O comprimento dos rastros tem limite (cerca de 64 células) e o modo "esticar com máscara" do script ainda não existe.

### Como criar um filtro novo

Crie `src/filters/nome.filter.ts`. Ele aparece sozinho na tela de configuração.

```ts
import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'meu-filtro',
  label: 'Meu filtro',
  // cada parâmetro vira um slider e chega ao shader como uniform float uP_<key>
  params: [{ key: 'forca', label: 'Força', min: 0, max: 1, step: 0.01, value: 0.5 }],
  // uTime (segundos) também está disponível para filtros animados
  // precisa definir applyFilter. p = posição na cena (pixels). sampleScene(p) lê a câmera.
  glsl: `
vec4 applyFilter(vec2 p) {
  vec4 c = sampleScene(p);
  return vec4(mix(c.rgb, c.bgr, uP_forca), 1.0);
}`,
};

export default filter;
```

## Estrutura

```
electron/main.cjs        janela do Electron e permissão da câmera
src/config.ts            ajustes fixos (nº de mãos, resolução da câmera, caminhos)
src/main.ts              liga tudo e roda o loop principal
src/core/
  camera.ts              abre a webcam
  handTracker.ts         MediaPipe: detecta as mãos, dedos esticados, pinça/abertura
  gestures.ts            reconhece os gestos e filtra no tempo (constantes de calibração no topo)
  viewport.ts            converte pontos da câmera para a cena (espelho + recorte)
  stage.ts               cena Three.js transparente (1 unidade = 1 pixel)
  effect.ts              classe base dos efeitos
  effectManager.ts       liga/desliga e atualiza os efeitos
  gui.ts / settings.ts   painel de cima (lil-gui)
  debug.ts               esqueleto das mãos e texto de diagnóstico
  types.ts               tipos (HandData, FrameData)
src/audio/
  dj.ts                  mesa de DJ: decks, efeitos, crossfader, biblioteca de músicas
src/features/
  djRules.ts             liga as mãos à mesa de DJ
  state.ts               configuração editada pela tela (regras, moldura)
  imageLibrary.ts        imagens da sessão (em memória)
  imageRules.ts          desenha as imagens das regras
  frameFilter.ts         moldura das duas mãos + shader dos filtros
  geometry.ts            triangulação do quadrilátero (inclui o caso cruzado)
src/filters/             filtros de câmera (*.filter.ts, descobertos sozinhos)
src/ui/                  tela de configuração (HTML + CSS)
src/effects/             seus efeitos 3D (*.effect.ts)
```

## Como criar um efeito 3D

Crie um arquivo em `src/effects/` com o nome terminando em `.effect.ts`. Ele aparece sozinho no painel de cima, sem registrar em lugar nenhum.

```ts
// src/effects/exemplo.effect.ts
import * as THREE from 'three';
import type GUI from 'lil-gui';
import { Effect } from '../core/effect';
import type { FrameData } from '../core/types';

export default class ExemploEffect extends Effect {
  readonly label = 'Exemplo';
  private params = { tamanho: 20 };
  private mesh!: THREE.Mesh;

  init() {
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    this.group.add(this.mesh);
  }

  update(frame: FrameData) {
    const hand = frame.hands[0];
    this.mesh.visible = !!hand;
    if (!hand) return;
    this.mesh.position.copy(hand.palm);
    this.mesh.scale.setScalar(this.params.tamanho);
  }

  buildGui(folder: GUI) {
    folder.add(this.params, 'tamanho', 5, 100);
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
```

O que cada efeito recebe a cada quadro (`FrameData`): `hands` (até 2), `time`, `delta` e `view`. Cada mão (`HandData`) tem `side` (esquerda/direita), `points` (21 pontos), `palm`, `handSize`, `pinch`, `openness`, `fingers` (dedos esticados) e `gesture` (gesto reconhecido).

Se um efeito lançar um erro, ele é pausado e aparece no console; o resto do app continua.

## Pontos para calibrar

A detecção depende da sua câmera e da distância. Se algo não responder bem:

1. **Gestos:** confira no diagnóstico os dedos (`1 0 0 0 0`) e o gesto. As constantes de calibração estão no topo de `src/core/gestures.ts`.
2. **Pinça e abertura:** os valores usam constantes estimadas (`buildHand` em `handTracker.ts`).
3. **Lado da mão:** o código usa o rótulo do MediaPipe como ele vem (testado com a Camo Camera). Se aparecer trocado com outra câmera, inverta a linha do `side` em `handTracker.ts`.
4. **Desempenho:** veja o FPS no diagnóstico. Se estiver baixo, reduza a resolução em `config.ts`.
