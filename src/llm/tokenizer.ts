import { AnyTokenizer } from "@vscode/prompt-tsx/dist/base/tokenizer/tokenizer";
import { getEncoding } from "js-tiktoken";

export class TiktokenTokenzier extends AnyTokenizer {
  constructor() {
    const enc = getEncoding("cl100k_base");

    super(async (text, token) => {
      if (token?.isCancellationRequested) {
        throw new Error("Cancelled");
      }

      let content: string;
      if (typeof text === "string") {
        content = text;
      } else {
        content = text.content;
      }

      const encoded = enc.encode(content);
      return encoded.length;
    });
  }
}
