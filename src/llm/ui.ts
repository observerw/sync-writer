import * as vscode from "vscode";
import { API_KEY } from "./const";

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

  return await setApiKey(context);
};
