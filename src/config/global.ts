import * as vscode from "vscode";
import { Lang, LangNames } from "../i18n/lang";

export class GlobalConfig {
  private static _get<T = string>(key: string) {
    return vscode.workspace.getConfiguration("sync-writer").get<T>(key)!;
  }

  static get sourceLang(): Lang {
    return this._get("lang.source");
  }

  static get sourceLangName(): string {
    return LangNames[GlobalConfig.sourceLang];
  }

  static get targetLang(): Lang {
    return this._get("lang.target");
  }

  static get targetLangName(): string {
    return LangNames[GlobalConfig.targetLang];
  }

  static get baseUrl(): string {
    return this._get("api.baseURL");
  }

  static get baseModel(): string {
    return this._get("api.baseModel");
  }

  static get autoSync(): boolean {
    return this._get<boolean>("sync.autoSync");
  }
}
