import * as vscode from "vscode";
import type { LLMClient } from "../llm/client";
import { AbortSource, AbortToken } from "../utils/abort";
import { SyncBlock, type SyncBlockPartType } from "./block";
import { SyncBlockCache } from "./cache";
import { SyncEditor } from "./editor";
import type { SyncBlockSymbolProvider } from "./symbol";

class SyncScheduler {
  /**
   * Sync block id to its abort source
   */
  sources: Map<string, AbortSource> = new Map();

  async schedule(
    uid: string,
    taskFunc: (token: AbortToken) => Promise<void>,
    delayMs: number = 0
  ): Promise<AbortSource> {
    const prevSource = this.sources.get(uid);
    if (prevSource) {
      // always cancel the previous edit if two edits are scheduled on the same block
      prevSource.cancel();
    }

    const source = new AbortSource();
    const token = source.token;

    const timeout = setTimeout(async () => {
      await taskFunc(source.token);
      this.sources.delete(uid);
    }, delayMs);
    token.onAborted(() => {
      clearTimeout(timeout);
      this.sources.delete(uid);
    });

    this.sources.set(uid, source);

    return source;
  }

  cancel(uid: string): boolean {
    const source = this.sources.get(uid);
    source?.cancel();
    return this.sources.delete(uid);
  }

  cancelAll() {
    for (const source of this.sources.values()) {
      source.cancel();
    }
    this.sources.clear();
  }
}

export interface SyncOptions {
  uid?: string;
  fromPartType?: SyncBlockPartType;
  instruction?: string;
}

export class Syncer {
  private _scheduler: SyncScheduler = new SyncScheduler();

  constructor(
    private _context: vscode.ExtensionContext,
    readonly symbolProvider: SyncBlockSymbolProvider,
    readonly client: LLMClient
  ) {}

  cancel(uid: string) {
    this._scheduler.cancel(uid);
  }

  async sync(
    textEditor: vscode.TextEditor,
    { uid, fromPartType, instruction }: SyncOptions
  ) {
    const document = textEditor.document;
    const line = textEditor.selection.active.line;
    const block = uid
      ? await this.symbolProvider.find(document, uid)
      : await SyncBlock.tryFromAnyLine(document, line);
    // explicitly set -> block status -> active line type
    fromPartType =
      fromPartType ||
      block?.fromPartType ||
      block?.linePartType(line) ||
      undefined;

    if (!block || !fromPartType) {
      return;
    }

    uid = block.uid;
    const editor = new SyncEditor(textEditor, this.symbolProvider);

    await editor.changeStatus(uid, "syncing");
    return await this._scheduler.schedule(
      uid,
      async (token) => {
        const text = this.client.translate(block, fromPartType, {
          token,
          instruction,
        });
        // const text = randomTextGenerator(10, 30);
        try {
          await editor.sync(uid, fromPartType, text, token);
          await editor.changeStatus(uid, "synced");

          const syncedBlock = await this.symbolProvider.find(document, uid);
          const cache = new SyncBlockCache(this._context, document.uri);
          await cache.save(syncedBlock!);
        } catch (e) {
          const errMsg = (e as Error).message;
          await vscode.window.showWarningMessage(
            `Sync failed: ${errMsg}, rollback to previous state`
          );
          throw e;
        }
      },
      // delay 1.2s to wait code lens update
      1200
    );
  }
}
