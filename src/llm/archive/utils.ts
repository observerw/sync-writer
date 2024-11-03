import type OpenAI from "openai";
import * as vscode from "vscode";

export const transformMessage = (
  message: vscode.LanguageModelChatMessage
): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
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
    content: [
      {
        type: "text",
        text: message.content,
      },
    ],
  };
};
