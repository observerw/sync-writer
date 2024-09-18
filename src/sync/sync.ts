import * as vscode from "vscode";
import type { LLMClient } from "../llm/client";
import { AbortSource, AbortToken } from "../utils/abort";
import { SyncBlock, type SyncBlockPartType } from "./block";
import { SyncBlockCache } from "./cache";
import { SyncEditor } from "./editor";
import type { SyncBlockSymbolProvider } from "./symbol";

export interface SyncTaskInfo {
  uid: string;
  from: SyncBlockPartType;
}

interface SyncTask {
  info: SyncTaskInfo;
  source: AbortSource;
}

class TaskScheduler {
  /**
   * Sync block id to its abort source
   */
  sources: Map<string, SyncTask> = new Map();

  async schedule(
    info: SyncTaskInfo,
    taskFunc: (token: AbortToken) => Promise<void>,
    delayMs: number = 0
  ): Promise<AbortSource> {
    const prevTask = this.sources.get(info.uid);
    if (prevTask) {
      // always cancel the previous edit if two edits are scheduled on the same block
      prevTask.source.cancel();
      this.sources.delete(info.uid);
    }

    const source = new AbortSource();
    const token = source.token;

    const timeout = setTimeout(async () => {
      await taskFunc(source.token);
      this.sources.delete(info.uid);
    }, delayMs);
    token.onAborted(() => {
      clearTimeout(timeout);
      this.sources.delete(info.uid);
    });

    this.sources.set(info.uid, { info, source });

    return source;
  }

  cancel(uid: string): boolean {
    const task = this.sources.get(uid);
    task?.source.cancel();
    return this.sources.delete(uid);
  }

  cancelAll() {
    for (const task of this.sources.values()) {
      task.source.cancel();
    }
    this.sources.clear();
  }
}

export interface SyncOptions {
  uid?: string;
  from?: SyncBlockPartType;
  instruction?: string;
}

export class Syncer {
  private _scheduler: TaskScheduler = new TaskScheduler();

  constructor(
    private _context: vscode.ExtensionContext,
    readonly symbolProvider: SyncBlockSymbolProvider,
    readonly client: LLMClient
  ) {}

  cancel(uid: string) {
    this._scheduler.cancel(uid);
  }

  query(uid: string) {
    return this._scheduler.sources.get(uid)?.info;
  }

  async sync(
    textEditor: vscode.TextEditor,
    { uid, from, instruction }: SyncOptions
  ) {
    const document = textEditor.document;
    const line = textEditor.selection.active.line;
    const block = uid
      ? await this.symbolProvider.find(document, uid)
      : await SyncBlock.tryFromAnyLine(document, line);
    // explicitly set -> block status -> active line type
    from =
      from || block?.fromPartType || block?.linePartType(line) || undefined;

    if (!block || !from) {
      return;
    }

    uid = block.uid;
    const editor = new SyncEditor(textEditor, this.symbolProvider);

    await editor.changeStatus(uid, "syncing");
    return await this._scheduler.schedule(
      { uid, from },
      async (token) => {
        const text = this.client.translate(block, from, {
          token,
          instruction,
        });
        // const text = randomTextGenerator(10, 300);
        try {
          await editor.sync(uid, from, text, token);

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
