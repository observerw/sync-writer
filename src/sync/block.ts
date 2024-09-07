import * as vscode from "vscode";
import { GlobalConfig } from "../config/global";
import type { FileType } from "../const";
import { Lang, LangSeps } from "../i18n/lang";
import { FileComment, tryParseSyncComment, type SyncStatus } from "./parse";

export abstract class SyncBlockPart {
  constructor(
    readonly fileType: FileType,
    readonly textLine: vscode.TextLine
  ) {}

  abstract get lang(): Lang;

  abstract get text(): string;

  /**
   * Check if text is complete (ends with a separator).
   */
  get complete(): boolean {
    const text = this.text;
    if (!text) {
      return false;
    }

    // check last character
    const lastChar = text[text.length - 1];
    return LangSeps[this.lang].has(lastChar);
  }

  get range(): vscode.Range {
    return this.textLine.range;
  }

  get line(): number {
    return this.textLine.lineNumber;
  }

  get textRange(): vscode.Range {
    const start = this.textLine.range.start;
    return new vscode.Range(
      start,
      start.translate({
        characterDelta: Number.MAX_SAFE_INTEGER,
      })
    );
  }
}

class SyncBlockSourcePart extends SyncBlockPart {
  constructor(
    fileType: FileType,
    textLine: vscode.TextLine,
    readonly prefix: string,
    readonly status: SyncStatus,
    readonly uid: string,
    readonly text: string
  ) {
    super(fileType, textLine);
  }

  static async tryFrom(
    fileType: FileType,
    textLine: vscode.TextLine
  ): Promise<SyncBlockSourcePart | null> {
    const parsed = await tryParseSyncComment(
      textLine.text.trimStart(),
      fileType
    );
    if (!parsed) {
      return null;
    }

    const { prefix, status, uid, text } = parsed;
    return new SyncBlockSourcePart(
      fileType,
      textLine,
      prefix,
      status,
      uid,
      text
    );
  }

  get lang() {
    return GlobalConfig.sourceLang;
  }

  get prefixRange(): vscode.Range {
    const commentPrefix = FileComment[this.fileType].prefix;
    const start = this.textLine.range.start.translate({
      characterDelta: commentPrefix.length,
    });
    return new vscode.Range(
      start,
      start.translate({ characterDelta: this.prefix.length })
    );
  }

  get textRange(): vscode.Range {
    const start = this.prefixRange.end;
    return new vscode.Range(
      start.translate({ characterDelta: 1 }), // skip space
      start.translate({ characterDelta: 1 + this.text.length })
    );
  }
}

class SyncBlockTargetPart extends SyncBlockPart {
  get lang() {
    return GlobalConfig.targetLang;
  }

  get text(): string {
    return this.textLine.text;
  }

  static tryFrom(
    fileType: FileType,
    textLine: vscode.TextLine
  ): SyncBlockTargetPart | null {
    const prefix = FileComment[fileType].prefix;
    if (textLine.text.trimStart().startsWith(prefix)) {
      return null;
    }

    return new SyncBlockTargetPart(fileType, textLine);
  }
}

export class SyncBlock {
  constructor(
    readonly document: vscode.TextDocument,
    readonly source: SyncBlockSourcePart,
    readonly target: SyncBlockTargetPart
  ) {}

  static async tryFromLine(
    document: vscode.TextDocument,
    line: number
  ): Promise<SyncBlock | null> {
    // target part exceeds the document
    if (line < 0 || line + 2 >= document.lineCount) {
      return null;
    }

    const fileType = document.languageId as FileType;

    const sourcePart = await SyncBlockSourcePart.tryFrom(
      fileType,
      document.lineAt(line)
    );
    const targetPart = SyncBlockTargetPart.tryFrom(
      fileType,
      document.lineAt(line + 2)
    );
    if (!sourcePart || !targetPart) {
      return null;
    }

    return new SyncBlock(document, sourcePart, targetPart);
  }

  static async fromLine(
    document: vscode.TextDocument,
    line: number
  ): Promise<SyncBlock> {
    const block = await SyncBlock.tryFromLine(document, line);
    if (!block) {
      throw new Error("Invalid sync block");
    }

    return block;
  }

  /**
   * Try building a SyncBlock from the source part line or the target part line.
   */
  static async tryFromAnyLine(
    document: vscode.TextDocument,
    line: number
  ): Promise<SyncBlock | null> {
    return (
      (await SyncBlock.tryFromLine(document, line)) ||
      (await SyncBlock.tryFromLine(document, line - 2))
    );
  }

  static async fromAnyLine(
    document: vscode.TextDocument,
    line: number
  ): Promise<SyncBlock> {
    return Promise.any([
      SyncBlock.fromLine(document, line),
      SyncBlock.fromLine(document, line - 2),
    ]);
  }

  get ranges(): vscode.Range[] {
    return [this.source.range, this.target.range];
  }

  get range(): vscode.Range {
    return new vscode.Range(this.source.range.start, this.target.range.end);
  }

  part(type: SyncBlockPartType): SyncBlockPart {
    return type === "source" ? this.source : this.target;
  }

  linePartType(line: number): SyncBlockPartType | null {
    return (
      {
        [this.source.line]: "source",
        [this.target.line]: "target",
      } satisfies Record<number, SyncBlockPartType>
    )[line];
  }

  get fromPartType(): SyncBlockPartType | null {
    return this.status === "s2t"
      ? "source"
      : this.status === "t2s"
      ? "target"
      : null;
  }

  get toPartType(): SyncBlockPartType | null {
    return this.fromPartType === "source"
      ? "target"
      : this.fromPartType === "target"
      ? "source"
      : null;
  }

  get status(): SyncStatus {
    return this.source.status;
  }

  get uid(): string {
    return this.source.uid;
  }

  get fileType(): FileType {
    return this.document.languageId as FileType;
  }
}

export type SyncBlockPartType = "source" | "target";
