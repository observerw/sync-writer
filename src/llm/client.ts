import { renderPrompt } from "@vscode/prompt-tsx";
import { memoizeDecorator } from "memoize";
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
import { TranslatePrompt, TranslatePromptProps } from "./prompt";
import { TiktokenTokenzier } from "./tokenizer";
import { transformMessage } from "./utils";

export type RequestOptions = {
  token?: AbortToken;
  modelOptions?: any;
};

export type TranslateOptions = {
  instruction?: string;
  token?: AbortToken;
  modelOptions?: any;
};

export abstract class LLMClient {
  protected _translateCache: LLMCache<TranslatePromptProps> = new LLMCache();
  protected _config: Config;

  constructor(protected _context: vscode.ExtensionContext) {
    this._config = new Config(_context);
  }

  /**
   * Send messages to the language model and return the response as an async iterable.
   */
  protected abstract _request(
    messages: vscode.LanguageModelChatMessage[],
    options?: RequestOptions
  ): AsyncIterable<string>;

  abstract validate(): Promise<void> | void;

  async *translate(
    block: SyncBlock,
    from: SyncBlockPartType,
    options?: TranslateOptions
  ): AsyncIterable<string> {
    const configData = await this._config.load(block.document);
    const references = configData.references;
    const props: TranslatePromptProps = {
      references,
      text: {
        from: from,
        sourceLang: GlobalConfig.sourceLangName,
        targetLang: GlobalConfig.targetLangName,
        content: block.part(from).text.trim(),
        instruction: options?.instruction?.trim(),
      },
    };
    const blockCache = new SyncBlockCache(this._context, block.document.uri);
    const cached = blockCache.get(block.uid);
    if (cached) {
      props.text.prev = {
        source: cached.source.trim(),
        target: cached.target.trim(),
      };
    }
    const cachedResp = this._translateCache.get(props);

    if (cachedResp) {
      yield cachedResp;
      return;
    }

    const { messages } = await renderPrompt(
      TranslatePrompt,
      props,
      {
        modelMaxPromptTokens: 4096,
      },
      new TiktokenTokenzier()
    );

    for await (const chunk of this._request(messages, options)) {
      this._translateCache.extend(props, chunk);
      yield chunk;
    }
  }

  preference(): Promise<ReferenceItem> {
    throw new Error("Not implemented");
  }
}

export class OpenAIClient extends LLMClient {
  constructor(_context: vscode.ExtensionContext) {
    super(_context);
  }

  @memoizeDecorator()
  private async _client(): Promise<OpenAI> {
    const apiKey = await this._context.secrets.get(API_KEY);
    if (!apiKey) {
      throw new Error("API key not found");
    }

    return new OpenAI({
      apiKey,
      baseURL: GlobalConfig.baseUrl,
    });
  }

  private get _model() {
    return GlobalConfig.baseModel;
  }

  async validate() {
    const client = await this._client();
    const models = await client.models.list();

    const found = models.data.some((m) => m.id === this._model);
    if (!found) {
      throw new Error(
        `Model ${this._model} not found, available models: ${models.data
          .map((m) => m.id)
          .join(", ")}`
      );
    }
  }

  protected async *_request(
    messages: vscode.LanguageModelChatMessage[],
    options?: RequestOptions
  ): AsyncIterable<string> {
    const client = await this._client();
    const transformedMessages = messages.map((m) => transformMessage(m));
    const resp = await client.chat.completions.create({
      ...(options?.modelOptions as OpenAI.Chat.ChatCompletionCreateParamsStreaming),
      model: this._model,
      messages: transformedMessages,
      stream: true,
    });

    for await (const chunk of resp) {
      if (options?.token?.aborted) {
        throw new Error("aborted");
      }

      const content = chunk.choices[0].delta.content;
      if (typeof content !== "string") {
        continue;
      }

      yield content;
    }
  }

  translate(
    block: SyncBlock,
    from: SyncBlockPartType,
    options?: Omit<TranslateOptions, "modelOptions">
  ): AsyncIterable<string> {
    return super.translate(block, from, {
      ...options,
      modelOptions: {
        temperature: 0,
        stop: ["\n"],
      } satisfies Partial<OpenAI.Chat.ChatCompletionCreateParamsStreaming>,
    });
  }
}

export class CopilotClient extends LLMClient {
  constructor(_context: vscode.ExtensionContext) {
    super(_context);
  }

  async validate() {
    await this._model();
  }

  private async _model() {
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: GlobalConfig.baseModel,
    });

    if (!models) {
      throw new Error("No model available");
    }

    const [model] = models;
    return model;
  }

  protected async *_request(
    messages: vscode.LanguageModelChatMessage[],
    options?: RequestOptions
  ): AsyncIterable<string> {
    const model = await this._model();

    const { text } = await model.sendRequest(
      messages,
      options?.modelOptions,
      options?.token?.token
    );

    return text;
  }
}
