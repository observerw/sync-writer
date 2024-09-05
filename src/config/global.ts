import * as vscode from "vscode";
import { Lang, LangNames } from "../i18n/lang";

export class GlobalConfig {
  private static _get<T = string>(key: string) {
    return vscode.workspace.getConfiguration("sync-writer").get<T>(key)!;
  }

  static get sourceLang(): Lang {
    return this._get("source-language");
  }

  static get sourceLangName(): string {
    return LangNames[GlobalConfig.sourceLang];
  }

  static get targetLang(): Lang {
    return this._get("target-language");
  }

  static get targetLangName(): string {
    return LangNames[GlobalConfig.targetLang];
  }

  static get baseUrl(): string {
    return this._get("base-url");
  }

  static get baseModel(): string {
    return this._get("base-model");
  }

  static get autoSync(): boolean {
    return this._get<boolean>("auto-sync");
  }
}
