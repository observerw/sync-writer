import * as vscode from "vscode";
import { SyncBlock, type SyncBlockPartType } from "./block";
import type { SyncBlockSymbolProvider } from "./symbol";

const blockLens = (block: SyncBlock): vscode.CodeLens[] => {
  const status = block.status;
  const fromPartType = block.fromPartType;

  const syncLens = () =>
    new vscode.CodeLens(block.part(fromPartType!).range, {
      title: "$(sync) Sync",
      command: "sync-writer.sync",
      arguments: [block.uid],
    });

  const resyncLens = (partType: SyncBlockPartType) =>
    new vscode.CodeLens(block.part(partType).range, {
      title: "$(sync) resync",
      command: "sync-writer.sync",
      tooltip: "Regenerate the sync text",
      arguments: [block.uid, false],
    });

  const abortLens = () =>
    new vscode.CodeLens(block.part("source").range, {
      title: "$(sync) Abort",
      command: "sync-writer.abort",
      arguments: [block.uid],
      tooltip: "Click to abort syncing",
    });

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
    return [abortLens()];
  } else if (status === "s2t" || status === "t2s") {
    return [
      new vscode.CodeLens(block.source.range, {
        title: "$(edit) Editing",
        command: "",
        arguments: [block.uid],
      }),
      syncLens(),
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
