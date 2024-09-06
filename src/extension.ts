// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import "reflect-metadata";
import * as vscode from "vscode";
import { type SyncCommandArgs } from "./commands";
import { Config, defaultConfigData } from "./config";
import { GlobalConfig } from "./config/global";
import { OpenAIClient } from "./llm/client";
import { ensureApiKey, setApiKey } from "./llm/ui";
import { SyncBlock, SyncBlockPartType, SyncStatus } from "./sync/block";
import { SyncBlockCache } from "./sync/cache";
import { SyncEditor } from "./sync/editor";
import { SyncBlockFoldProvider } from "./sync/fold";
import { SyncBlockCodeLensProvider } from "./sync/lens";
import { SyncEditScheduler } from "./sync/schedule";
import { SyncBlockSymbolProvider } from "./sync/symbol";

export async function activate(context: vscode.ExtensionContext) {
  const config = new Config(context);
  const client = new OpenAIClient(context);

  const scheduler = new SyncEditScheduler();
  context.subscriptions.push(scheduler);

  const symbolProvider = new SyncBlockSymbolProvider();
  const codeLensProvider = new SyncBlockCodeLensProvider(symbolProvider);
  const foldProvider = new SyncBlockFoldProvider(symbolProvider);

  const apiKeyAvailable = await ensureApiKey(context);
  if (!apiKeyAvailable) {
    vscode.window.showErrorMessage(
      "OpenAI API key is not set, please set a valid API key for full functionality"
    );
  } else {
    try {
      await client.validate();
    } catch (e: unknown) {
      const errMsg = (e as Error).message;
      vscode.window.showErrorMessage(`OpenAI API validation failed: ${errMsg}`);
    }
  }

  const sync = async (
    textEditor: vscode.TextEditor,
    uid: string,
    fromPartType: SyncBlockPartType,
    instruction?: string
  ) => {
    const document = textEditor.document;
    const editor = new SyncEditor(textEditor, symbolProvider);
    const block = await symbolProvider.find(document, uid);

    if (!block) {
      throw new Error(`invalid uid`);
    }

    await editor.changeStatus(uid, "syncing");
    return await scheduler.schedule(
      uid,
      async (token) => {
        const text = client.translate(block, fromPartType, {
          token,
          instruction,
        });
        // const text = randomTextGenerator(10, 30);
        try {
          await editor.sync(uid, fromPartType, text, token);
          await editor.changeStatus(uid, "synced");

          const syncedBlock = await symbolProvider.find(document, uid);
          const cache = new SyncBlockCache(context, document.uri);
          await cache.save(syncedBlock!);
        } catch (e) {
          const errMsg = (e as Error).message;
          await vscode.window.showWarningMessage(
            `Sync failed: ${errMsg}, rollback to previous state`
          );
          throw e;
        }
      },
      // delay 1.2s to wait code lens update
      1200
    );
  };

  vscode.window.onDidChangeTextEditorSelection(
    async ({ textEditor, kind, selections: [selection] }) => {
      const document = textEditor.document;
      const line = selection.active.line;
      const block = await SyncBlock.tryFromAnyLine(textEditor.document, line);

      const editor = new SyncEditor(textEditor, symbolProvider);
      // always highlight, no matter whether the block is found
      await editor.highlight(block?.uid);

      if (
        !block || // edit not in a sync block
        (kind && kind !== vscode.TextEditorSelectionChangeKind.Keyboard) || // not an edit
        block.status === "syncing" // block is syncing
      ) {
        return;
      }

      const { uid } = block;
      const linePartType = block.linePartType(line)!;

      const cache = new SyncBlockCache(context, document.uri);
      const cachedBlock = cache.get(uid);

      // if text is the same as the cached text, change status to syncing
      const text = document.lineAt(line).text;
      const cachedText = cachedBlock?.[linePartType];
      if (text === cachedText) {
        await editor.changeStatus(uid, "synced");
      } else {
        // change to corresponding status
        const newStatus = (
          {
            source: "s2t",
            target: "t2s",
          } satisfies Record<SyncBlockPartType, SyncStatus>
        )[linePartType];
        await editor.changeStatus(uid, newStatus);
      }

      // if the part is complete, sync content to the other part
      if (block.part(linePartType).complete && GlobalConfig.autoSync) {
        await sync(textEditor, uid, block.fromPartType!);
      }
    }
  );

  // watch tex file changes to update sync block cache
  const texWatcher = vscode.workspace.createFileSystemWatcher("**/*.tex", true);
  texWatcher.onDidChange(async (uri) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const blocks = await symbolProvider.finds(document);
    const cache = new SyncBlockCache(context, uri);
    cache.reserve(blocks.map(({ uid }) => uid));
  });
  // clear cache when tex file deleted
  texWatcher.onDidDelete(async (uri) => {
    const cache = new SyncBlockCache(context, uri);
    cache.reserve([]);
  });
  // sync active sync block when tex file saved
  texWatcher.onDidChange(async (uri) => {
    const textEditor = vscode.window.activeTextEditor;
    const document = textEditor?.document;
    if (!document || document.uri.path !== uri.path) {
      return;
    }

    const line = textEditor.selection.active.line;
    const block = await SyncBlock.tryFromAnyLine(document, line);
    const fromPartType = block?.fromPartType;
    if (!block || !fromPartType) {
      return;
    }

    await sync(textEditor, block.uid, fromPartType);
  });
  context.subscriptions.push(texWatcher);

  // cancel all tasks when the active text editor is changed
  vscode.window.onDidChangeActiveTextEditor(async () => {
    scheduler.cancelAll();
  });

  const selector: vscode.DocumentSelector = {
    language: "latex",
    scheme: "file",
  };
  // provide code lens on every sync block
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(selector, codeLensProvider)
  );
  // provide sync block symbol and finding function
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, symbolProvider)
  );
  // provide folding range
  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(selector, foldProvider)
  );

  // command for test purpose
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "sync-writer.test",
      async (textEditor, builder) => {
        const active = textEditor.selection.active;
        builder.insert(active, "test");
      }
    )
  );

  // create a new config file if not exists
  context.subscriptions.push(
    vscode.commands.registerCommand("sync-writer.create-config", async () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (!doc || (await config.exists(doc))) {
        return;
      }

      await config.save(doc, defaultConfigData);
    })
  );

  // set OpenAI API key
  context.subscriptions.push(
    vscode.commands.registerCommand("sync-writer.set-api-key", async () => {
      try {
        await setApiKey(context);
        await client.validate();
      } catch (e: unknown) {
        const errMsg = (e as Error).message;
        vscode.window.showErrorMessage(
          `OpenAI API key validation failed: ${errMsg}, please set a valid API key`
        );
      }

      vscode.window.showInformationMessage(
        `OpenAI API key is set successfully!`
      );
    })
  );
  // create a new sync block from the current line
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "sync-writer.create-block",
      async (textEditor) => {
        const editor = new SyncEditor(textEditor, symbolProvider);
        const line = textEditor.selection.active.line;
        await editor.create(line);
      }
    )
  );

  // regenerate sync text with user instruction
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand(
      "sync-writer.sync",
      async (
        textEditor,
        _edit,
        { uid, fromPartType, ignoreInstruction }: SyncCommandArgs = {
          ignoreInstruction: true,
        }
      ) => {
        const document = textEditor.document;
        const line = textEditor.selection.active.line;
        const block = uid
          ? await symbolProvider.find(document, uid)
          : await SyncBlock.tryFromAnyLine(document, line);
        // explicitly set -> block status -> active line type
        fromPartType =
          fromPartType ||
          block?.fromPartType ||
          block?.linePartType(line) ||
          undefined;

        if (!block || !fromPartType) {
          return;
        }

        let instruction: string | undefined;
        if (!ignoreInstruction) {
          instruction = await vscode.window.showInputBox({
            prompt: "Enter the instruction for the sync",
          });
          if (!instruction) {
            return;
          }
        }

        await sync(textEditor, block.uid, fromPartType, instruction);
      }
    )
  );

  // abort edit on the specific sync block
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "sync-writer.abort",
      async (uid: string) => {
        scheduler.cancel(uid);
      }
    )
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
