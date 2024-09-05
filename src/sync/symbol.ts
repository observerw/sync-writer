import { LRUCache } from "lru-cache";
import * as vscode from "vscode";
import { SyncBlock, tryParseSyncComment } from "./block";

/**
 * Block uid to its line number cache.
 */
type SyncBlockLineCache = LRUCache<string, number>;

export class SyncBlockSymbolProvider implements vscode.DocumentSymbolProvider {
  /**
   * A heuristic cache storing the position of block with specfic uid.
   */
  private _docCache: LRUCache<vscode.Uri, SyncBlockLineCache> = new LRUCache({
    max: 10,
  });

  private _getCache(document: vscode.TextDocument): SyncBlockLineCache {
    if (!this._docCache.has(document.uri)) {
      this._docCache.set(document.uri, new LRUCache({ max: 100 }));
    }

    return this._docCache.get(document.uri)!;
  }

  private _get(document: vscode.TextDocument, uid: string): number | null {
    return this._getCache(document).get(uid) ?? null;
  }

  private _set(document: vscode.TextDocument, uid: string, line: number) {
    this._getCache(document).set(uid, line);
  }

  private async _validate(
    document: vscode.TextDocument,
    line: number,
    uid: string
  ): Promise<boolean> {
    const text = document.lineAt(line).text;
    const parsed = await tryParseSyncComment(text);

    return parsed?.uid === uid;
  }

  private async _shrink(doc: vscode.TextDocument) {
    const cache = this._getCache(doc);
    const staled = (
      await Promise.all(
        Array.from(cache.keys()).map(async (uid) => {
          const line = cache.get(uid)!;
          const isValid = await this._validate(doc, line, uid);
          return isValid ? [] : [uid];
        })
      )
    ).flat();

    for (const uid of staled) {
      cache.delete(uid);
    }

    const sourceLines = Array.from(cache.values());
    const targetLines = sourceLines.map((line) => line + 1);
    const validLines = new Set([...sourceLines, ...targetLines]);

    return validLines;
  }

  async provideDocumentSymbols(
    doc: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.DocumentSymbol[]> {
    const blocks = await this.finds(doc, token);
    return blocks.map(
      (block) =>
        new vscode.DocumentSymbol(
          block.uid,
          block.source.text,
          vscode.SymbolKind.String,
          block.range,
          block.source.range
        )
    );
  }

  async find(
    doc: vscode.TextDocument,
    uid: string,
    token?: vscode.CancellationToken
  ): Promise<SyncBlock | null> {
    const line = this._getCache(doc).get(uid) ?? -1;
    const cachedBlock = await SyncBlock.tryFromLine(doc, line);
    if (cachedBlock && cachedBlock.uid === uid) {
      return cachedBlock;
    }

    for (let delta = 1; delta <= doc.lineCount; delta++) {
      if (token?.isCancellationRequested) {
        break;
      }

      const block = await Promise.any([
        SyncBlock.fromLine(doc, line - delta),
        SyncBlock.fromLine(doc, line + delta),
      ]).catch(() => null);

      if (block) {
        this._set(doc, block.uid, block.source.line);
        return block;
      }
    }

    return null;
  }

  async finds(
    doc: vscode.TextDocument,
    token?: vscode.CancellationToken
  ): Promise<SyncBlock[]> {
    const blocks: SyncBlock[] = [];

    for (let i = 0; i < doc.lineCount; i++) {
      if (token?.isCancellationRequested) {
        break;
      }

      const block = await SyncBlock.tryFromLine(doc, i);
      if (block) {
        this._set(doc, block.uid, i);
        blocks.push(block);
      }
    }

    return blocks;
  }
}
