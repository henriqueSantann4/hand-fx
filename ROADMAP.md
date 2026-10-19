# Roadmap

Ideias combinadas e ainda não feitas, para retomar depois.

## Filtros da moldura (a fazer)

Para criar um filtro novo, basta adicionar um arquivo `src/filters/nome.filter.ts` (veja `pixelate.filter.ts` como exemplo). Ele aparece sozinho na tela de configuração, com os parâmetros viram sliders.

Já existem: Pixelização, Desfoque, Inverter cores, Preto e branco, Pixel sorting, Vidro fosco, Moiré, Pontilhado.

Faltam (a ideia é a maioria ser editável pela tela de configuração):

| Filtro | Observações técnicas |
| --- | --- |
| Slit-scan | Precisa guardar os últimos quadros do vídeo (um buffer de texturas) e ler uma coluna/linha de cada quadro. O sistema de filtros hoje só enxerga o quadro atual, então precisa de uma extensão para dar acesso ao histórico. |
| Point cloud | Nuvem de pontos. A câmera não tem profundidade, então seria uma profundidade falsa (por brilho) ou outro modelo de estimativa de profundidade. Precisa de geometria de pontos, não só shader. |

## Outras ideias

- Guardar as imagens por pessoa (conta), de forma privada. Hoje as imagens ficam só na sessão.
- Teia de linhas brancas entre pontos das duas mãos (como na imagem de referência) como um segundo tipo de moldura.
- Versão para celular (mesma base web, empacotada com Capacitor ou usada como PWA).
- Salvar e carregar as configurações (regras e filtro) em um arquivo.
- Regras para o filtro da moldura (por exemplo, trocar de filtro com um gesto).


## Ideias para o pixel sorting

- Modo "esticar" do script (estica os pixels do objeto para o lado), que depende de máscara: poderia usar a própria moldura como máscara.
- Rastros mais longos (hoje o limite é 64 células) com uma versão em dois passos.
