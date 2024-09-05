import type OpenAI from "openai";
import * as vscode from "vscode";

export const transformMessage = (
  message: vscode.LanguageModelChatMessage
): OpenAI.Chat.ChatCompletionMessageParam => {
  const { User, Assistant } = vscode.LanguageModelChatMessageRole;
  const role = (
    {
      [User]: "user",
      [Assistant]: "assistant",
    } satisfies Record<
      vscode.LanguageModelChatMessageRole,
      OpenAI.Chat.ChatCompletionRole
    >
  )[message.role];
  return {
    role: role,
    content: message.content,
  };
};
