import Handlebars from "handlebars";
import TranslateSystemTemplate from "inline:./templates/system.handlebars";
import TranslateTemplate from "inline:./templates/translate.handlebars";
import OpenAI from "openai";
import type { References } from "../references";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export interface TranslateProps {
  references?: References;
  instruction?: string;
  sourceLang: string;
  targetLang: string;
  content: string;
  source?: boolean;
  prev?: {
    source: string;
    target: string;
  };
}

export const translatePromptTemplate = (props: TranslateProps): Message[] => {
  return [
    {
      role: "system",
      content: Handlebars.compile(TranslateSystemTemplate)({
        sourceLang: props.sourceLang,
        targetLang: props.targetLang,
      }),
    },
    {
      role: "user",
      content: Handlebars.compile(TranslateTemplate)(props),
    },
  ];
};
