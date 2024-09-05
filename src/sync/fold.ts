import * as vscode from "vscode";
import type { SyncBlockSymbolProvider } from "./symbol";
export class SyncBlockFoldProvider implements vscode.FoldingRangeProvider {
  constructor(private _symbolProvider: SyncBlockSymbolProvider) {}

  async provideFoldingRanges(
    document: vscode.TextDocument,
    context: vscode.FoldingContext,
    token: vscode.CancellationToken
  ): Promise<vscode.FoldingRange[]> {
    const symbols = await this._symbolProvider.provideDocumentSymbols(
      document,
      token
    );

    return symbols.map(
      ({ range: { start, end } }) =>
        new vscode.FoldingRange(start.line, end.line)
    );
  }
}
