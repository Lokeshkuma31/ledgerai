import type { TransactionSource } from "@/types/source";

/**
 * Holds every registered transaction source and their enabled/disabled
 * state. Deliberately independent of React, storage, and any specific
 * source implementation — it only knows the TransactionSource shape.
 */
export class SourceRegistry {
  private sources = new Map<string, TransactionSource>();

  register(source: TransactionSource): void {
    if (this.sources.has(source.id)) {
      throw new Error(`Source "${source.id}" is already registered.`);
    }
    this.sources.set(source.id, source);
  }

  getSource(id: string): TransactionSource | undefined {
    return this.sources.get(id);
  }

  getAllSources(): TransactionSource[] {
    return Array.from(this.sources.values());
  }

  getActiveSources(): TransactionSource[] {
    return this.getAllSources().filter((source) => source.enabled);
  }

  setEnabled(id: string, enabled: boolean): void {
    const source = this.getSource(id);
    if (!source) {
      throw new Error(`Cannot toggle unknown source "${id}".`);
    }
    source.enabled = enabled;
  }
}

export const sourceRegistry = new SourceRegistry();
