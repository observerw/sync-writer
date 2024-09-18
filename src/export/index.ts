import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import * as vscode from "vscode";
import { SyncBlockSymbolProvider } from "../sync/symbol";

const texInputRe = /^\s*\\input{(.+?)}/;
const texIncludeRe = /^\s*\\include{(.+?)}/;

export async function* transform(
  basePath: string,
  inputPath: string,
  ignoreComment: boolean = false
): AsyncIterable<string> {
  async function* transformLine(
    basePath: string,
    line: string
  ): AsyncIterable<string> {
    const match = texInputRe.exec(line) || texIncludeRe.exec(line);
    if (!match) {
      yield line;
      return;
    }

    const includePath = match[1];
    if (!includePath) {
      throw new Error(`Invalid include path: ${includePath}`);
    }

    let fullIncludePath = path.join(basePath, includePath);
    if (path.extname(fullIncludePath) !== ".tex") {
      fullIncludePath += ".tex";
    }

    if (!fs.existsSync(fullIncludePath)) {
      throw new Error(`File ${fullIncludePath} not found`);
    }

    yield "\n";
    for await (const transformedLine of transform(
      basePath,
      fullIncludePath,
      ignoreComment
    )) {
      if (ignoreComment && transformedLine.trim().startsWith("%")) {
        continue;
      }
      yield transformedLine;
    }
    yield "\n";
  }

  const fileStream = fs.createReadStream(inputPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    yield* transformLine(basePath, line);
  }
}

export class Exporter {
  constructor(
    private _context: vscode.ExtensionContext,
    private _symbolProvider: SyncBlockSymbolProvider
  ) {}

  private _baseUri(doc: vscode.TextDocument): vscode.Uri {
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!wsFolder) {
      throw new Error("No workspace folder found.");
    }

    return wsFolder.uri;
  }

  matchInput(wsFolder: vscode.Uri, line: string): vscode.Uri | null {
    const match = line.match(texInputRe) || line.match(texIncludeRe);
    if (!match) {
      return null;
    }

    const includePath = match[1];
    if (!includePath) {
      return null;
    }

    return wsFolder.with({ path: includePath });
  }

  async check(doc: vscode.TextDocument) {
    const symbols = await this._symbolProvider.finds(doc);
    const allSynced = symbols.every((block) => block.status === "synced");
    if (!allSynced) {
      return Promise.reject();
    }

    const checks: Promise<void>[] = [];

    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i).text;
      const includeUri = this.matchInput(this._baseUri(doc), line);
      if (includeUri) {
        const includeDoc = await vscode.workspace.openTextDocument(includeUri);
        checks.push(this.check(includeDoc));
      }
    }

    await Promise.all(checks);
  }

  async *transform(doc: vscode.TextDocument): AsyncIterable<string> {
    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i).text;
      if (line.trim().startsWith("%")) {
        // ignore comments
        continue;
      }

      yield* this.transformLine(doc, line);
    }
  }

  async *transformLine(
    doc: vscode.TextDocument,
    line: string
  ): AsyncIterable<string> {
    const includeUri = this.matchInput(this._baseUri(doc), line);
    if (!includeUri) {
      yield line;
      return;
    }

    const includeDoc = await vscode.workspace.openTextDocument(includeUri);
    for (let i = 0; i < includeDoc.lineCount; i++) {
      yield "\n";
      for await (const transformedLine of this.transform(includeDoc)) {
        yield transformedLine;
      }
      yield "\n";
    }
  }

  /**
   * Create a new document named `{doc.fileName}-exported.tex` in the same directory as `doc`
   * with the transformed content.
   */
  async export(doc: vscode.TextDocument): Promise<vscode.Uri> {
    const parentDirPath = path.dirname(doc.uri.path);
    const exportedDocPath = path.join(
      parentDirPath,
      `${doc.fileName}-exported.tex`
    );
    const exportedDocUri = vscode.Uri.file(exportedDocPath);

    const exportedDocContents = await Array.fromAsync(this.transform(doc));
    const exportedDocContentsStr = exportedDocContents.join("");

    const wsEdit = new vscode.WorkspaceEdit();
    wsEdit.createFile(exportedDocUri, {
      overwrite: true,
      contents: Buffer.from(exportedDocContentsStr),
    });

    await vscode.workspace.applyEdit(wsEdit);
    return exportedDocUri;
  }
}
