import { plainToInstance, Transform } from "class-transformer";
import { IsAlphanumeric, IsString, Length, validate } from "class-validator";
import * as vscode from "vscode";
import { GlobalConfig } from "../config/global";
import { Lang, LangSeps } from "../i18n/lang";
import { utils } from "../utils";

export const SyncPrefix = "%sync";
export type SyncStatus = "s2t" | "t2s" | "syncing" | "synced";
const SyncStatusMarks: [SyncStatus, string][] = [
  ["syncing", "+"],
  ["synced", "|"],
  ["s2t", ">"],
  ["t2s", "<"],
];
const Status2Mark = new Map(SyncStatusMarks);
const Mark2Status = new Map(SyncStatusMarks.map(([a, b]) => [b, a]));
export const SyncStatusPrefix = (status: SyncStatus, uid: string) =>
  `${SyncPrefix}${Status2Mark.get(status)}${uid}`;

const markRePattern = `[${SyncStatusMarks.map(([, mark]) =>
  utils.escapeRegExp(mark)
).join("")}]`;

const SyncCommentRe = new RegExp(
  `\s*(?<prefix>${SyncPrefix}(?<status>${markRePattern})(?<uid>[0-9a-z]{6})) (?<text>.*)`
);

class SyncCommentParseResult {
  @IsString()
  prefix!: string;

  @IsString()
  @Transform(({ value }) => Mark2Status.get(value))
  status!: SyncStatus;

  @IsString()
  @Length(6)
  @IsAlphanumeric()
  uid!: string;

  @IsString()
  text!: string;
}

export const tryParseSyncComment = async (
  comment: string
): Promise<SyncCommentParseResult | null> => {
  if (!comment.trimStart().startsWith(SyncPrefix)) {
    return null;
  }

  const match = SyncCommentRe.exec(comment);
  const groups = match?.groups;
  const result = groups && plainToInstance(SyncCommentParseResult, groups);
  if (!result) {
    return null;
  }

  try {
    await validate(result, { stopAtFirstError: true });
    return result;
  } catch {
    return null;
  }
};

export const validateSyncComment = async (
  comment: string
): Promise<boolean> => {
  const parsed = await tryParseSyncComment(comment);
  return !!parsed;
};

export abstract class SyncBlockPart {
  constructor(readonly textLine: vscode.TextLine) {}

  /**
   * Check if text is complete (ends with a separator).
   */
  protected _complete(lang: Lang): boolean {
    const text = this.text;
    if (!text) {
      return false;
    }

    // check last character
    const lastChar = text[text.length - 1];
    return LangSeps[lang].has(lastChar);
  }

  abstract get complete(): boolean;

  abstract get text(): string;

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
    textLine: vscode.TextLine,
    readonly prefix: string,
    readonly status: SyncStatus,
    readonly uid: string,
    readonly text: string
  ) {
    super(textLine);
  }

  static async tryFrom(
    textLine: vscode.TextLine
  ): Promise<SyncBlockSourcePart | null> {
    // quick check
    const syncComment = textLine.text.trimStart();
    if (!syncComment.startsWith(SyncPrefix)) {
      return null;
    }

    const parsed = await tryParseSyncComment(syncComment);
    if (!parsed) {
      return null;
    }

    const { prefix, status, uid, text } = parsed;
    return new SyncBlockSourcePart(textLine, prefix, status, uid, text);
  }

  get complete(): boolean {
    return this._complete(GlobalConfig.sourceLang);
  }

  get prefixRange(): vscode.Range {
    const start = this.textLine.range.start;
    return new vscode.Range(
      start,
      start.translate({ characterDelta: this.prefix.length })
    );
  }

  get textRange(): vscode.Range {
    const start = this.prefixRange.end;
    return new vscode.Range(
      start.translate({ characterDelta: 1 }), // skip space
      start.translate({ characterDelta: Number.MAX_SAFE_INTEGER })
    );
  }
}

class SyncBlockTargetPart extends SyncBlockPart {
  get complete(): boolean {
    return this._complete(GlobalConfig.targetLang);
  }

  get text(): string {
    return this.textLine.text;
  }

  static tryFrom(textLine: vscode.TextLine): SyncBlockTargetPart | null {
    const text = textLine.text.trim();
    if (text.startsWith("%")) {
      return null;
    }

    return new SyncBlockTargetPart(textLine);
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

    const sourcePart = await SyncBlockSourcePart.tryFrom(document.lineAt(line));
    const targetPart = SyncBlockTargetPart.tryFrom(document.lineAt(line + 2));
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
    if (this.source.line === line) {
      return "source";
    } else if (this.target.line === line) {
      return "target";
    }

    return null;
  }

  get fromPartType(): SyncBlockPartType | null {
    return this.status === "s2t"
      ? "source"
      : this.status === "t2s"
      ? "target"
      : null;
  }

  get toPartType(): SyncBlockPartType | null {
    return this.fromPartType === "source" ? "target" : "source";
  }

  get status(): SyncStatus {
    return this.source.status;
  }

  get uid(): string {
    return this.source.uid;
  }
}

export type SyncBlockPartType = "source" | "target";
