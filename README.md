# HandFX

App que rastreia **duas mãos** pela webcam e desenha uma camada 3D (Three.js) por cima do vídeo espelhado. Roda no navegador e, empacotado, como app de PC (Electron).

Tecnologias: TypeScript, Vite, Three.js, MediaPipe Hand Landmarker, lil-gui, Electron.

## O que o app faz hoje

- **Imagens 2D por gesto:** você adiciona imagens e cria regras ("quando a mão esquerda abrir, mostre esta imagem na palma").
- **Moldura com filtro:** com as duas mãos você forma uma moldura (quadrilátero) e a câmera ganha um filtro dentro dela.
- **Filtro na tela inteira:** um filtro na tela toda, trocado com um gesto de fechar a mão dedo por dedo.
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
| Gesto | mão aberta, punho fechado, indicador levantado, OK (polegar + indicador), fechar do mindinho ao polegar (movimento: cada vez liga ou desliga a imagem) |
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
- **OK (polegar + indicador):** três condições ao mesmo tempo, rígidas de propósito para a mão relaxada ou meio aberta não contar como OK: (1) as pontas do polegar e do indicador encostadas, (2) o médio, o anelar e o mindinho bem retos e (3) o indicador bem dobrado, formando o círculo (a ponta dele fica bem mais perto do pulso que a do médio). Na mão meio aberta todos os dedos curvam parecido, então a condição 3 não passa. Os valores ficam no topo de `src/core/gestures.ts` (`OK_*`).
- **Fechar do mindinho ao polegar** (movimento): com a mão aberta, dobre um dedo de cada vez, do mindinho até o polegar (o app confere do mindinho ao indicador). Diferente dos outros, é um movimento que acontece num instante: numa regra de imagem cada movimento liga ou desliga a imagem, e no DJ ele só aparece nas ações (dispara uma vez a cada movimento). Os tempos ficam no fim de `src/core/gestures.ts` (`ROLL_*`).

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

## Filtro na tela inteira

Escolha o filtro em **Configurar → Filtro na tela inteira**. Ele cobre a tela toda (a moldura continua funcionando por cima, com o filtro dela). Para desligar, escolha **Desativado**, a primeira opção da lista (é o padrão ao abrir o app).

Os filtros formam uma roda, na mesma ordem da lista da tela de configuração, começando por **Desativado**. Para trocar com a mão:

1. Faça o sinal de OK com qualquer mão: polegar e indicador juntos, médio, anelar e mindinho esticados.
2. Arraste para o lado mantendo o OK. Depois de meio palmo aparece a roda, uma faixa de vidro embaixo da tela: o filtro atual no meio e dois vizinhos de cada lado, cada vez mais apagados.
3. Para a **direita** vai para os próximos filtros; para a **esquerda**, volta. A cada palmo arrastado (o tamanho da sua mão na imagem) passa um filtro, já aplicado na hora, então dá para pular vários num arrasto só. Voltando a mão, volta também. Do último volta ao primeiro.
4. Desfaça o OK: a roda some e fica o filtro escolhido. Se o OK falhar por menos de 0,2 s no meio do arrasto (o rastreio perdeu um dedo), o arrasto continua.

OK parado não mostra a roda. O OK continua valendo para as regras de imagens e do DJ que usam esse gesto. As distâncias e a tolerância ficam no topo de `src/features/frameFilter.ts` (`WHEEL_SHOW`, `WHEEL_STEP` e `WHEEL_GRACE`).

Na tela de configuração o filtro da tela inteira aparece como os outros: uma lista para escolher e os sliders dele. Cada filtro guarda os próprios ajustes, então dar a volta na roda não perde nada.

### Filtros de câmera

Cada filtro tem poucos controles, que aparecem como sliders em **Configurar → Moldura** (e em **Filtro na tela inteira**):

| Filtro | Controles |
| --- | --- |
| Pixelização | Força (tamanho dos pixels) |
| Inverter cores | Intensidade |
| Preto e branco | Intensidade, contraste |
| **Pixel sorting** | Intensidade (quantos pixels entram), Tamanho dos rastros, Frequência (mudanças por segundo), Direção |
| **Frosted glass** | Intensidade, Tamanho do grão |
| **Moiré** | Intensidade, Tamanho das linhas, Ângulo entre as grades, Frequência (velocidade) |
| **Stippling** | Tamanho dos pontos, Tinta (mais claro ou mais escuro), Contraste, Fundo, Cor (preto e branco ou colorido) |
| **Slit-scan** | Intensidade (tamanho do rastro), Frequência (repetições), Direção (para o lado ou vertical) |
| **Point cloud** | Tamanho dos pontos, Profundidade, Frequência (velocidade do giro), Fundo |
| **Datamosh** | Intensidade do arrasto, Tamanho dos blocos, Blocos duros, Tempo para a imagem voltar, Segurar o rastro, Limite de movimento, Quadro-chave, Aberração de cor, Compressão, Grade dos blocos |

O **Slit-scan** mostra, em cada coluna da moldura, um momento diferente do passado (o app guarda 24 quadros da câmera em 960×540, um a cada dois, o que dá cerca de 1,6 s de passado a 30 fps), então o que se mexe vira ondas e esticados. A **Point cloud** transforma a imagem em pontos coloridos com profundidade falsa pelo brilho: mais claro fica mais perto e mais à frente, e os pontos se deslocam como se a câmera girasse. É uma simulação em shader, não geometria 3D de verdade.

O **Pixel sorting** é uma versão simples do script `pixelsort_video.py`: em cada linha ele ordena por brilho o começo de trechos de pixels, com comprimento sorteado que muda várias vezes por segundo. O comprimento dos rastros tem limite (cerca de 64 células) e o modo "esticar com máscara" do script ainda não existe.

O **Datamosh** mede o movimento da câmera por blocos (fluxo óptico) e usa esse movimento para arrastar a imagem do quadro anterior, em vez de mostrar a câmera de novo: o que se mexe puxa pedaços da imagem consigo, em blocos, e deixa rastros que só somem aos poucos (onde nada se mexe a câmera volta rápido). "Tempo para a imagem voltar" e "Segurar o rastro" controlam quanto o derretido dura, "Quadro-chave" renova a imagem de uma vez a cada tantos segundos (como o quadro-chave de um vídeo comprimido), e "Limite de movimento" define o quanto uma região precisa mudar para contar como movimento (diminua se a câmera estiver quase parada e nada acontecer, aumente se o ruído da câmera estiver "derretendo" o fundo). Se o datamosh estiver escolhido, ele já trabalha antes de a moldura abrir, para estar pronto quando ela aparecer. Se o mesmo filtro estiver em mais de uma vaga (quadrilátero e triângulos), todas dividem o mesmo derretido e valem os ajustes da primeira vaga com datamosh.

O **Stippling** imita um desenho de tinta feito de pontos aleatórios sobre papel branco: o tom vem da quantidade de pontos (claro = poucos, escuro = quase preto). Quando há um rosto na câmera, só ele fica com a densidade cheia e o fundo clareia até quase branco; o app acha o rosto com o MediaPipe Face Landmarker (o modelo `face_landmarker.task` é baixado junto com o de mãos por `npm run setup-assets`, ou na hora, se faltar). Sem rosto, a imagem inteira é pontilhada. "Tinta" deixa o desenho todo mais claro ou mais escuro, e "Fundo" é quanta tinta sobra fora do rosto (0 = papel limpo). A área do rosto já inclui um pouco do cabelo e do pescoço. Só um rosto é seguido.

### Como criar um filtro novo

Crie `src/filters/nome.filter.ts`. Ele aparece sozinho na tela de configuração.

```ts
import type { FilterDef } from './types';

const filter: FilterDef = {
  id: 'meu-filtro',
  label: 'Meu filtro',
  // cada parâmetro vira um slider e chega ao shader como uniform float uP_<key>
  params: [{ key: 'forca', label: 'Força', min: 0, max: 1, step: 0.01, value: 0.5 }],
  // uTime (segundos) e uBox (caixa da moldura) também estão disponíveis; com `history: true` há sampleHistory(p, idade)
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
  gestures.ts            reconhece os gestos e filtra no tempo, e o gesto de fechar dedo por dedo (constantes de calibração)
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
  frameFilter.ts         moldura das duas mãos, filtro na tela inteira + shader dos filtros
  history.ts             guarda os últimos quadros da câmera (para o slit-scan)
  motionBuffer.ts        fluxo óptico + imagem derretida entre os quadros (para o datamosh)
  sceneGlsl.ts           trecho de shader que lê a câmera alinhada com a tela
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
2. **Pinça (polegar + indicador, usada pelo OK e pelo movimento "Pinça" do DJ) e abertura:** os valores usam constantes estimadas (`buildHand` em `handTracker.ts`).
3. **Lado da mão:** o código usa o rótulo do MediaPipe como ele vem (testado com a Camo Camera). Se aparecer trocado com outra câmera, inverta a linha do `side` em `handTracker.ts`.
4. **Desempenho:** veja o FPS no diagnóstico. Se estiver baixo, reduza a resolução em `config.ts`.
