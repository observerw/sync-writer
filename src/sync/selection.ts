import * as vscode from "vscode";
import { SyncBlock } from "./block";

type SelectionEventType = "edit" | "move";

export type SyncSelectionEvent = {
  type: SelectionEventType;
  block: SyncBlock | null;
  line: number;
};

export const parseSelectionEvent = async ({
  textEditor: { document },
  kind,
  selections: [selection],
}: vscode.TextEditorSelectionChangeEvent): Promise<SyncSelectionEvent> => {
  const line = selection.active.line;
  const block = await SyncBlock.tryFromAnyLine(document, line);

  const { Keyboard, Mouse, Command } = vscode.TextEditorSelectionChangeKind;
  const type = (
    {
      [Keyboard]: "edit",
      [Mouse]: "move",
      [Command]: "move",
    } satisfies Record<vscode.TextEditorSelectionChangeKind, SelectionEventType>
  )[kind ?? Keyboard];

  return { type, block, line };
};
