import * as vscode from "vscode";
import { SyncBlock, type SyncBlockPartType } from "./block";
import type { SyncBlockSymbolProvider } from "./symbol";
import type { SyncOptions } from "./sync";

const blockLens = (block: SyncBlock): vscode.CodeLens[] => {
  const syncLens = (type: SyncBlockPartType) =>
    new vscode.CodeLens(block.part(type).range, {
      title: "$(sync) Sync",
      command: "sync-writer.sync",
      arguments: [
        {
          uid: block.uid,
          from: type,
        } satisfies SyncOptions,
        true,
      ],
    });

  const resyncLens = (type: SyncBlockPartType) =>
    new vscode.CodeLens(block.part(type).range, {
      title: "$(sync) resync",
      command: "sync-writer.sync",
      tooltip: "Regenerate the sync text",
      arguments: [
        {
          uid: block.uid,
          from: type === "source" ? "target" : "source",
        } satisfies SyncOptions,
        false,
      ],
    });

  const abortLens = (type: SyncBlockPartType) =>
    new vscode.CodeLens(block.part(type).range, {
      title: "$(sync) Abort",
      command: "sync-writer.abort",
      arguments: [block.uid],
      tooltip: "Click to abort syncing",
    });

  const status = block.status;
  if (status === "synced") {
    return [
      new vscode.CodeLens(block.source.range, {
        title: "$(check) Synced",
        command: "",
      }),
      resyncLens("source"),
      resyncLens("target"),
    ];
  } else if (status === "syncing") {
    return [abortLens("source")];
  } else if (status === "s2t" || status === "t2s") {
    return [
      new vscode.CodeLens(block.source.range, {
        title: "$(edit) Editing",
        command: "",
        arguments: [block.uid],
      }),
      syncLens(block.toPartType!),
    ];
  }

  throw new Error(`Unknown status: ${status}`);
};

export class SyncBlockCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private _symbolProvider: SyncBlockSymbolProvider) {}

  async provideCodeLenses(
    doc: vscode.TextDocument,
    token: vscode.CancellationToken
  ): Promise<vscode.CodeLens[]> {
    if (token.isCancellationRequested) {
      return [];
    }

    const blocks = await this._symbolProvider.finds(doc, token);
    return blocks.map((block) => blockLens(block)).flat();
  }
}
