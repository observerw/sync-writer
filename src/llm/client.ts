import { OpenAI } from "openai";
import * as vscode from "vscode";
import { Config } from "../config";
import { GlobalConfig } from "../config/global";
import type { ReferenceItem } from "../references";
import type { SyncBlock, SyncBlockPartType } from "../sync/block";
import { SyncBlockCache } from "../sync/cache";
import type { AbortToken } from "../utils/abort";
import { LLMCache } from "./cache";
import { API_KEY } from "./const";
import {
  translatePromptTemplate,
  type TranslateProps,
} from "./prompt-template";

export interface TranslateOptions {
  instruction?: string;
  token?: AbortToken;
}

export class OpenAIClient {
  protected _translateCache: LLMCache<TranslateProps> = new LLMCache();
  protected _config: Config;

  private constructor(
    protected _context: vscode.ExtensionContext,
    protected _client: OpenAI
  ) {
    this._config = new Config(_context);
  }

  static async init(ctx: vscode.ExtensionContext): Promise<OpenAIClient> {
    const apiKey = await ctx.secrets.get(API_KEY);
    if (!apiKey) {
      throw new Error("API key not found");
    }
    const client = new OpenAI({
      apiKey,
      baseURL: GlobalConfig.baseUrl,
    });

    return new OpenAIClient(ctx, client);
  }

  private get _model() {
    return GlobalConfig.baseModel;
  }

  async validate() {
    const models = await this._client.models.list();
    const found = models.data.some(({ id }) => id === this._model);
    if (found) {
      return;
    }

    throw new Error(
      `Model ${this._model} not found, available models: ${models.data
        .map(({ id }) => id)
        .join(", ")}`
    );
  }

  async *translate(
    block: SyncBlock,
    from: SyncBlockPartType,
    options?: TranslateOptions
  ): AsyncIterable<string> {
    const configData = await this._config.load(block.document);
    const references = configData.references;
    const props: TranslateProps = {
      references,
      source: from === "source",
      sourceLang: GlobalConfig.sourceLangName,
      targetLang: GlobalConfig.targetLangName,
      content: block.part(from).text.trim(),
      instruction: options?.instruction?.trim(),
    };

    const blockCache = new SyncBlockCache(this._context, block.document.uri);
    const cached = blockCache.get(block.uid);
    if (cached) {
      props.prev = {
        source: cached.source.trim(),
        target: cached.target.trim(),
      };
    }

    const cachedResp = this._translateCache.get(props);
    if (cachedResp) {
      yield cachedResp;
      return;
    }

    const messages = translatePromptTemplate(props);
    for await (const chunk of await this._client.chat.completions.create({
      model: this._model,
      messages,
      stream: true,
    })) {
      if (options?.token?.aborted) {
        return;
      }

      const content = chunk.choices[0].delta.content;
      if (typeof content !== "string") {
        continue;
      }

      this._translateCache.extend(props, content);
      yield content;
    }
  }

  preference(): Promise<ReferenceItem> {
    throw new Error("Not implemented");
  }
}
