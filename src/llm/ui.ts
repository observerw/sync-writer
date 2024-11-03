import { isURL } from "class-validator";
import OpenAI from "openai";
import * as vscode from "vscode";
import { GlobalConfig } from "../config/global";
import { API_KEY } from "./const";
import BaseURLs from "./data/base-url.json";

export const setBaseUrl = async (context: vscode.ExtensionContext) => {
  const baseURLKey = await vscode.window.showQuickPick([
    ...Object.keys(BaseURLs),
    "Other",
  ]);
  if (!baseURLKey) {
    return;
  }

  if (baseURLKey === "Other") {
    const customURL = await vscode.window.showInputBox({
      prompt: "Enter the base URL",
    });
    if (!customURL || !isURL(customURL)) {
      return;
    }

    GlobalConfig.baseUrl = customURL;
  } else {
    GlobalConfig.baseUrl = BaseURLs[baseURLKey as keyof typeof BaseURLs];
  }
};

export const setApiKey = async (context: vscode.ExtensionContext) => {
  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your OpenAI API key",
    password: true,
  });
  if (apiKey) {
    await context.secrets.store(API_KEY, apiKey);
    return true;
  } else {
    return false;
  }
};

export const ensureApiKey = async (
  context: vscode.ExtensionContext
): Promise<boolean> => {
  const apiKey = await context.secrets.get(API_KEY);
  if (apiKey) {
    return true;
  }

  vscode.window.showInformationMessage(
    `OpenAI API key is not set properly, please set a valid API key`
  );

  return await setApiKey(context);
};

export const setModel = async (ctx: vscode.ExtensionContext) => {
  const apiKey = await ctx.secrets.get(API_KEY);
  const client = new OpenAI({
    apiKey,
    baseURL: GlobalConfig.baseUrl,
  });

  const models = await client.models.list();
  const selectedModel = await vscode.window.showQuickPick(
    models.data.map(({ id }) => id)
  );
  if (!selectedModel) {
    return;
  }

  GlobalConfig.baseModel = selectedModel;
};
