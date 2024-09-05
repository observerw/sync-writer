import * as vscode from "vscode";
import { AbortSource, type AbortToken } from "../utils/abort";

export class SyncEditScheduler implements vscode.Disposable {
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

  cancel(uid: string) {
    const source = this.sources.get(uid);
    source?.cancel();
  }

  dispose() {
    for (const source of this.sources.values()) {
      source.cancel();
    }
  }
}
