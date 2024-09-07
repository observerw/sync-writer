import { plainToInstance, Transform } from "class-transformer";
import { IsAlphanumeric, IsString, Length, validate } from "class-validator";
import type { FileType } from "../const";
import { utils } from "../utils";

const SyncPrefix = "sync";

class CommentTransformer {
  constructor(
    readonly prefix: string,
    readonly suffix?: string | null,
    readonly multiLine: boolean = true
  ) {}

  apply(text: string) {
    if (!this.multiLine) {
      text = text.replace(/\n/g, `\n${this.prefix}`);
    }
    return `${this.prefix}${text}${this.suffix ?? ""}`;
  }
}

export const FileComment: Record<FileType, CommentTransformer> = {
  latex: new CommentTransformer("%", null, false),
  markdown: new CommentTransformer("<!--", "-->"),
};

export type SyncStatus =
  | "s2t" // source to target
  | "t2s" // target to source
  | "syncing" // syncing
  | "synced"; // synced

type SyncMark =
  | ">" // s2t
  | "<" // t2s
  | "+" // syncing
  | "|"; // synced

const SyncStatusMark: [SyncStatus, SyncMark][] = [
  ["s2t", ">"],
  ["t2s", "<"],
  ["syncing", "+"],
  ["synced", "|"],
];
const SyncStatus2Mark = new Map(SyncStatusMark);
const Mark2SyncStatus = new Map(
  SyncStatusMark.map(([status, mark]) => [mark, status])
);

const CommentRe = (type: FileType): RegExp => {
  const markRe = `[${utils.escapeRegExp(
    SyncStatusMark.map(([, mark]) => mark).join("")
  )}]`;
  const statusRe = `(?<status>${markRe})`;
  const uidRe = `(?<uid>[0-9a-z]{6})`;
  const textRe = `(?<text>.*)`;

  const prefixRe = `(?<prefix>${SyncPrefix}${statusRe}${uidRe})`;

  const commentRe = FileComment[type].apply(`${prefixRe} ${textRe}`);

  return new RegExp(`\s*${commentRe}`);
};
const SyncCommentRe = {
  latex: CommentRe("latex"),
  markdown: CommentRe("markdown"),
};

export const SyncCommentPrefix = (status: SyncStatus, uid: string) =>
  `${SyncPrefix}${SyncStatus2Mark.get(status)}${uid}`;
export const SyncComment = (
  text: string,
  status: SyncStatus,
  uid: string,
  type: FileType
) => FileComment[type].apply(`${SyncCommentPrefix(status, uid)} ${text}`);

class SyncCommentParseResult {
  @IsString()
  prefix!: string;

  @IsString()
  @Transform(({ value }) => Mark2SyncStatus.get(value))
  status!: SyncStatus;

  @IsString()
  @Length(6)
  @IsAlphanumeric()
  uid!: string;

  @IsString()
  text!: string;
}
export const tryParseSyncComment = async (text: string, type: FileType) => {
  const match = SyncCommentRe[type].exec(text);
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
