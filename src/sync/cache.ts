import * as vscode from "vscode";
import { SyncBlock, type SyncBlockPartType } from "./block";

/**
 * Simplified data structure for SyncBlock cache, since additional data may be invalid after document change.
 */
export class SyncBlockCacheData {
  constructor(
    readonly uid: string,
    readonly source: string,
    readonly target: string
  ) {}

  static from(block: SyncBlock) {
    return new SyncBlockCacheData(
      block.uid,
      block.source.text,
      block.target.text
    );
  }
}

/**
 * Util class to manage SyncBlock cache in workspace state.
 *
 * Notice that a SyncBlockCache instance is bound to a specific document.
 */
export class SyncBlockCache {
  constructor(
    private _context: vscode.ExtensionContext,
    readonly uri: vscode.Uri
  ) {}

  static readonly KEY_PREFIX = "SyncBlock";
  private _key(uid: string) {
    return `${SyncBlockCache.KEY_PREFIX}-${this.uri}-${uid}`;
  }

  get keys() {
    const wsKeys = this._context.workspaceState.keys();
    return new Set(
      wsKeys.filter((key) =>
        key.startsWith(`${SyncBlockCache.KEY_PREFIX}-${this.uri}`)
      )
    );
  }

  async save(block: SyncBlock) {
    if (block.status !== "synced") {
      throw new Error("Only synced block can be saved");
    }

    await this._context.workspaceState.update(this._key(block.uid), {
      uid: block.uid,
      source: block.source.text,
      target: block.target.text,
    });
  }

  get(uid: string): SyncBlockCacheData | null {
    return (
      this._context.workspaceState.get<SyncBlockCacheData>(this._key(uid)) ||
      null
    );
  }

  getPart(uid: string, type: SyncBlockPartType): string | null {
    const data = this.get(uid);
    return data ? data[type] : null;
  }

  remove(uid: string) {
    this._context.workspaceState.update(this._key(uid), undefined);
  }

  reserve(uids: string[]) {
    const reserveKeys = uids.map((uid) => this._key(uid));
    const staledKeys = this.keys.difference(new Set(reserveKeys));

    for (const key of staledKeys) {
      this._context.workspaceState.update(key, undefined);
    }
  }
}
