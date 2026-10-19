import * as THREE from 'three';
import { uid } from './uid';

export interface ImageItem {
  id: string;
  name: string;
  /** Endereço temporário (blob:) para mostrar a miniatura na tela de configuração */
  url: string;
  texture: THREE.Texture;
  /** largura / altura */
  aspect: number;
}

/**
 * Imagens 2D adicionadas pelo usuário. Ficam só na memória desta sessão:
 * ao recarregar a página elas somem e precisam ser adicionadas de novo.
 */
export class ImageLibrary {
  readonly items: ImageItem[] = [];
  private listeners = new Set<() => void>();

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string | null): ImageItem | undefined {
    return id ? this.items.find((i) => i.id === id) : undefined;
  }

  /** Adiciona arquivos de imagem. Devolve quantos foram adicionados. */
  async addFiles(files: Iterable<File>): Promise<number> {
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        this.items.push(await this.load(file));
        added++;
      } catch (err) {
        console.error(err);
      }
    }
    if (added > 0) this.emit();
    return added;
  }

  remove(id: string): void {
    const index = this.items.findIndex((i) => i.id === id);
    if (index < 0) return;
    const [item] = this.items.splice(index, 1);
    item.texture.dispose();
    URL.revokeObjectURL(item.url);
    this.emit();
  }

  private load(file: File): Promise<ImageItem> {
    const url = URL.createObjectURL(file);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const texture = new THREE.Texture(img);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
        resolve({ id: uid(), name: file.name, url, texture, aspect });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Não consegui abrir a imagem "${file.name}".`));
      };
      img.src = url;
    });
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
