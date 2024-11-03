import * as vscode from "vscode";
import type { OpenAIClient } from "../llm/client";
import { AbortSource, AbortToken } from "../utils/abort";
import { SyncBlock, type SyncBlockPartType } from "./block";
import { SyncBlockCache } from "./cache";
import { SyncEditor } from "./editor";
import type { SyncStatus } from "./parse";
import type { SyncBlockSymbolProvider } from "./symbol";

export class SyncTaskInfo {
  constructor(readonly uid: string, readonly from: SyncBlockPartType) {}

  get status(): SyncStatus {
    return (
      {
        source: "s2t",
        target: "t2s",
      } satisfies Record<SyncBlockPartType, SyncStatus>
    )[this.from];
  }
}

interface SyncTask {
  info: SyncTaskInfo;
  source: AbortSource;
}

class TaskScheduler {
  /**
   * Sync block id to its abort source
   */
  tasks: Map<string, SyncTask> = new Map();

  async schedule(
    info: SyncTaskInfo,
    taskFunc: (token: AbortToken) => Promise<void>,
    delayMs: number = 0
  ): Promise<AbortSource> {
    const prevTask = this.tasks.get(info.uid);
    if (prevTask) {
      // always cancel the previous edit if two edits are scheduled on the same block
      prevTask.source.cancel();
      this.tasks.delete(info.uid);
    }

    const source = new AbortSource();
    const token = source.token;

    const timeout = setTimeout(async () => {
      await taskFunc(source.token);
      this.tasks.delete(info.uid);
    }, delayMs);
    token.onAborted(() => {
      clearTimeout(timeout);
      this.tasks.delete(info.uid);
    });

    this.tasks.set(info.uid, { info, source });

    return source;
  }

  cancel(uid: string): boolean {
    const task = this.tasks.get(uid);
    task?.source.cancel();
    return this.tasks.delete(uid);
  }

  cancelAll() {
    for (const task of this.tasks.values()) {
      task.source.cancel();
    }
    this.tasks.clear();
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
    readonly client: OpenAIClient
  ) {}

  cancel(uid: string) {
    this._scheduler.cancel(uid);
  }

  query(uid: string) {
    return this._scheduler.tasks.get(uid)?.info;
  }

  async sync(
    textEditor: vscode.TextEditor,
    { uid, from, instruction }: SyncOptions
  ) {
    const doc = textEditor.document;
    const line = textEditor.selection.active.line;

    const block = uid
      ? await this.symbolProvider.find(doc, uid) // explicit
      : await SyncBlock.tryFromAnyLine(doc, line); // from active line
    from =
      from || // explicit
      block?.fromPartType || // from active block
      block?.linePartType(line) || // from active line
      undefined;

    if (!block || !from) {
      return;
    }

    uid = block.uid;
    const editor = new SyncEditor(textEditor, this.symbolProvider);
    const cache = new SyncBlockCache(this._context, doc.uri);
    const info = new SyncTaskInfo(uid, from);

    await editor.changeStatus(uid, "syncing");
    return await this._scheduler.schedule(
      info,
      async (token) => {
        const text = this.client.translate(block, from, {
          token,
          instruction,
        });
        // const text = randomTextGenerator(10, 300);
        try {
          await editor.sync(uid, from, text, token);
          await editor.changeStatus(uid, "synced");

          const syncedBlock = await this.symbolProvider.find(doc, uid);
          await cache.save(syncedBlock!);
        } catch (e) {
          const cached = cache.get(uid) || { source: "", target: "" };
          const to = info.from === "source" ? "target" : "source";
          await editor.changeContent(uid, to, cached[to]);
          await editor.changeStatus(uid, info.status);

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
