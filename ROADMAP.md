# Roadmap

Ideias combinadas e ainda não feitas, para retomar depois.

## Filtros da moldura

Para criar um filtro novo, basta adicionar um arquivo `src/filters/nome.filter.ts` (veja `pixelate.filter.ts` como exemplo). Ele aparece sozinho na tela de configuração, com os parâmetros viram sliders.

Já existem: Pixelização, Inverter cores, Preto e branco, Pixel sorting, Frosted glass, Moiré, Stippling, Slit-scan, Point cloud, Datamosh.

Todos os filtros combinados no começo já foram feitos. Ideias para novos filtros ficam aqui.

## Outras ideias

- Guardar as imagens por pessoa (conta), de forma privada. Hoje as imagens ficam só na sessão.
- Teia de linhas brancas entre pontos das duas mãos (como na imagem de referência) como um segundo tipo de moldura.
- Versão para celular (mesma base web, empacotada com Capacitor ou usada como PWA).
- Salvar e carregar as configurações (regras e filtro) em um arquivo.
- Regras para o filtro da moldura (por exemplo, trocar de filtro com um gesto).

## Ideias para o datamosh

- Usar o movimento das mãos (em vez do da câmera toda) para decidir onde o derretido acontece.
- Ajustes por vaga: hoje o quadrilátero e os triângulos dividem o mesmo derretido.
- Calibrar os valores padrão com uma câmera de verdade (foram testados só com uma câmera simulada).

## Ideias para o stippling

- Destacar a pessoa inteira (MediaPipe Image Segmenter), com o rosto na densidade cheia, o corpo mais claro e o fundo branco.
- Seguir mais de um rosto ao mesmo tempo.
- Pontos mais estáveis entre quadros (hoje a câmera parada ainda faz alguns pontos piscarem).

## Ideias para o pixel sorting

- Modo "esticar" do script (estica os pixels do objeto para o lado), que depende de máscara: poderia usar a própria moldura como máscara.
- Rastros mais longos (hoje o limite é 64 células) com uma versão em dois passos.
