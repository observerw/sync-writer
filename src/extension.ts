// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import "reflect-metadata";
import * as vscode from "vscode";
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
import { parseSelectionEvent } from "./sync/selection";
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
    instruction?: string
  ) => {
    const editor = new SyncEditor(textEditor, symbolProvider);
    const block = await symbolProvider.find(textEditor.document, uid);
    const fromPartType = block?.fromPartType;

    if (!block || !fromPartType) {
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
        } catch (e) {
          const errMsg = (e as Error).message;
          await vscode.window.showWarningMessage(
            `Sync failed: ${errMsg}, rollback to previous state`
          );
        }
      },
      // delay 1.2s to wait code lens update
      1200
    );
  };

  vscode.window.onDidChangeTextEditorSelection(async (e) => {
    const editor = new SyncEditor(e.textEditor, symbolProvider);
    const { type, block, line } = await parseSelectionEvent(e);

    await editor.highlight(block?.uid);

    if (!block) {
      return;
    }

    const { uid } = block;

    // sync block edit, handle sync
    if (type === "edit") {
      const fromPartType = block.linePartType(line)!;
      const part = block.part(fromPartType);

      // if the part is incomplete, change to corresponding status
      const newStatus = (
        {
          source: "s2t",
          target: "t2s",
        } satisfies Record<SyncBlockPartType, SyncStatus>
      )[fromPartType];
      await editor.changeStatus(block.uid, newStatus);

      // if the part is complete, sync content to the other part
      if (part.complete && GlobalConfig.autoSync) {
        await sync(e.textEditor, uid);
      }
    }
  });

  // watch tex file changes to update sync block cache
  const texWatcher = vscode.workspace.createFileSystemWatcher("**/*.tex", true);
  texWatcher.onDidChange(async (uri) => {
    const document = await vscode.workspace.openTextDocument(uri);
    const blocks = await symbolProvider.finds(document);
    const cache = new SyncBlockCache(context, uri);
    cache.reserve(blocks.map(({ uid }) => uid));
  });
  texWatcher.onDidDelete(async (uri) => {
    const cache = new SyncBlockCache(context, uri);
    cache.reserve([]);
  });
  context.subscriptions.push(texWatcher);

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
    vscode.commands.registerCommand("sync-writer.test", async () => {
      vscode.window.activeTextEditor?.edit((builder) => {
        builder.insert(
          vscode.window.activeTextEditor?.selection.active!,
          "Hello World"
        );
      });
    })
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
        uid?: string,
        ignoreInstruction: boolean = true
      ) => {
        // sync block not specified, find the block from the current active line
        if (!uid) {
          const line = textEditor.selection.active.line;
          const block = await SyncBlock.tryFromAnyLine(
            textEditor.document,
            line
          );
          if (!block) {
            return;
          }

          uid = block.uid;
        }

        if (ignoreInstruction) {
          await sync(textEditor, uid);
        } else {
          const instruction = await vscode.window.showInputBox({
            prompt: "Enter the instruction for the sync",
          });

          await sync(textEditor, uid, instruction);
        }
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
