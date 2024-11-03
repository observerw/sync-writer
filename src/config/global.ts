import * as vscode from "vscode";
import { Lang, LangNames } from "../i18n/lang";

export class GlobalConfig {
  private static _get<T = string>(key: string) {
    return vscode.workspace.getConfiguration("sync-writer").get<T>(key)!;
  }

  private static _set<T = string>(key: string, value: T) {
    vscode.workspace.getConfiguration("sync-writer").update(key, value);
  }

  static get sourceLang(): Lang {
    return this._get("lang.source");
  }

  static set sourceLang(lang: Lang) {
    this._set("lang.source", lang);
  }

  static get sourceLangName(): string {
    return LangNames[GlobalConfig.sourceLang];
  }

  static get targetLang(): Lang {
    return this._get("lang.target");
  }

  static set targetLang(lang: Lang) {
    this._set("lang.target", lang);
  }

  static get targetLangName(): string {
    return LangNames[GlobalConfig.targetLang];
  }

  static get baseUrl(): string {
    return this._get("api.baseURL");
  }

  static set baseUrl(url: string) {
    this._set("api.baseURL", url);
  }

  static get baseModel(): string {
    return this._get("api.baseModel");
  }

  static set baseModel(model: string) {
    this._set("api.baseModel", model);
  }

  static get autoSync(): boolean {
    return this._get<boolean>("sync.autoSync");
  }

  static set autoSync(value: boolean) {
    this._set("sync.autoSync", value);
  }
}
