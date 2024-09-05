import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import * as vscode from "vscode";
import { defaultReferences, References } from "../references";
import { utils } from "../utils";

export class ConfigData {
  @ValidateNested()
  @IsOptional()
  @Type(() => References)
  references?: References;
}

export const defaultConfigData: Required<ConfigData> = {
  references: defaultReferences,
};

export class Config {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  private _configUri(doc: vscode.TextDocument): vscode.Uri {
    const wsFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
    if (!wsFolder) {
      throw new Error("No workspace folder found.");
    }

    return vscode.Uri.joinPath(wsFolder.uri, `sync-writer.json`);
  }

  async exists(doc: vscode.TextDocument): Promise<boolean> {
    return utils.exists(this._configUri(doc));
  }

  async load(doc: vscode.TextDocument): Promise<ConfigData> {
    const exist = await this.exists(doc);
    if (!exist) {
      return defaultConfigData;
    }

    const configDoc = await vscode.workspace.openTextDocument(
      this._configUri(doc)
    );
    const configData = JSON.parse(configDoc.getText());
    return await utils.parse(configData, ConfigData);
  }

  async loadRequired(doc: vscode.TextDocument): Promise<Required<ConfigData>> {
    const configData = await this.load(doc);
    return { ...configData, ...defaultConfigData };
  }

  async save(doc: vscode.TextDocument, configData: ConfigData) {
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(this._configUri(doc), {
      overwrite: true,
      contents: Buffer.from(JSON.stringify(configData, null, 2)),
    });
    await vscode.workspace.applyEdit(edit);
  }
}
