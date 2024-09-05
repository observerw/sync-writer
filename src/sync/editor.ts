import * as vscode from "vscode";
import { utils } from "../utils";
import type { AbortToken } from "../utils/abort";
import {
  SyncBlock,
  SyncBlockPartType,
  SyncStatus,
  SyncStatusPrefix,
} from "./block";
import type { SyncBlockSymbolProvider } from "./symbol";

const DirtyDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "#FFA53C1E",
  isWholeLine: true,
});

const SyncedDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: "#62D2561E",
  isWholeLine: true,
});

const decorationTypes = [DirtyDecorationType, SyncedDecorationType];

/**
 * Identifier for a block with status, used to determine block highlight status.
 */
const statusUid = (block: SyncBlock) => `${block.status}-${block.uid}`;

export class SyncEditor {
  private _highlightedUid: string | null = null;

  constructor(
    private _textEditor: vscode.TextEditor,
    private _symbolProvider: SyncBlockSymbolProvider
  ) {}

  get document(): vscode.TextDocument {
    return this._textEditor.document;
  }

  private async _find(uid: string, token?: AbortToken): Promise<SyncBlock> {
    const block = await this._symbolProvider.find(
      this.document,
      uid,
      token?.token
    );
    if (!block) {
      throw new Error("invalid uid");
    }

    return block;
  }

  private async _edit(editFunc: (builder: vscode.TextEditorEdit) => void) {
    const applied = await this._textEditor.edit(editFunc);
    if (!applied) {
      throw new Error("edit failed");
    }
  }

  private _clearDecorations() {
    for (const type of decorationTypes) {
      this._textEditor.setDecorations(type, []);
    }
  }

  private _setDecorations(
    sourceRange: vscode.Range,
    targetRange: vscode.Range,
    status: SyncStatus
  ) {
    const decorations = (
      {
        s2t: [
          [DirtyDecorationType, [sourceRange]],
          [SyncedDecorationType, [targetRange]],
        ],
        t2s: [
          [DirtyDecorationType, [targetRange]],
          [SyncedDecorationType, [sourceRange]],
        ],
        syncing: [[DirtyDecorationType, [sourceRange, targetRange]]],
        synced: [[SyncedDecorationType, [sourceRange, targetRange]]],
      } satisfies Record<
        SyncStatus,
        [vscode.TextEditorDecorationType, vscode.Range[]][]
      >
    )[status];

    for (const [type, ranges] of decorations) {
      this._textEditor.setDecorations(type, ranges);
    }
  }

  async highlight(uid?: string) {
    // not a sync block, clear highlight
    if (!uid) {
      this._clearDecorations();
      this._highlightedUid = null;
      return;
    }

    const block = await this._find(uid);
    // don't do anything if the block is already highlighted
    if (statusUid(block) === this._highlightedUid) {
      return;
    }

    // clear previous highlight and set new highlight
    this._clearDecorations();
    this._setDecorations(block.source.range, block.target.range, block.status);
    this._highlightedUid = statusUid(block);
  }

  /**
   * Replace with status mark and decoration.
   */
  async changeStatus(uid: string, status: SyncStatus) {
    const block = await this._find(uid);
    if (block.status === status) {
      return;
    }

    // only replace prefix, since replacing the whole line will cause cursor jump
    await this._edit((builder) => {
      builder.replace(
        block.source.prefixRange,
        SyncStatusPrefix(status, block.uid)
      );
    });

    // set corresponding decorations
    this._setDecorations(block.source.range, block.target.range, status);

    return;
  }

  async changeContent(uid: string, partType: SyncBlockPartType, text: string) {
    const block = await this._find(uid);
    const part = block.part(partType);
    await this._edit((builder) => {
      builder.replace(part.textRange, text);
    });
  }

  async concatContent(uid: string, partType: SyncBlockPartType, text: string) {
    const block = await this._find(uid);
    const part = block.part(partType);
    await this._edit((builder) => {
      builder.insert(part.textRange.end, text);
    });
  }

  /**
   * Rollback a part to previous synced content
   */
  async rollback(block: SyncBlock) {
    await this.changeStatus(block.uid, block.status);
    await this.changeContent(block.uid, "source", block.source.text);
    await this.changeContent(block.uid, "target", block.target.text);
  }

  async create(anyLine: number) {
    const document = this._textEditor.document;
    if (await SyncBlock.tryFromAnyLine(document, anyLine)) {
      return;
    }

    const uid = utils.randomHex(6);
    const prefix = SyncStatusPrefix("t2s", uid);
    await this._edit((builder) => {
      builder.insert(new vscode.Position(anyLine, 0), `${prefix} \n\n`);
    });
  }

  async sync(
    uid: string,
    fromPartType: SyncBlockPartType,
    text: AsyncIterable<string>,
    token?: AbortToken
  ) {
    const block = await this._find(uid, token);
    const toPartType = fromPartType === "source" ? "target" : "source";

    try {
      let firstChunk = true;
      for await (const chunk of text) {
        if (token?.aborted) {
          throw new Error("cancelled");
        }

        // clear previous content before first chunk
        if (firstChunk) {
          await this.changeContent(uid, toPartType, "");
          firstChunk = false;
        }

        // await this.changeContent(uid, toPartType, content);
        await this.concatContent(uid, toPartType, chunk);
      }

      await this.changeStatus(uid, "synced");
    } catch (e) {
      await this.rollback(block);
      throw e;
    }
  }
}
