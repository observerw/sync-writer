import {
  BasePromptElementProps,
  PromptElement,
  PromptPiece,
  PromptSizing,
  TextChunk,
  UserMessage,
} from "@vscode/prompt-tsx";
import dedent from "dedent";
import { ReferenceItem, References } from "../references";
import { SyncBlockPartType } from "../sync/block";

export interface ReferencesPromptProps extends BasePromptElementProps {
  references: References;
}

export class ReferencesPrompt extends PromptElement<ReferencesPromptProps> {
  private static _formatItem({ source, target }: ReferenceItem): string {
    return `- ${source} -> ${target}`;
  }

  render(
    state: void,
    sizing: PromptSizing
  ): Promise<PromptPiece | undefined> | PromptPiece | undefined {
    const {
      references: { glossary, preferences },
    } = this.props;
    return (
      <UserMessage>
        The following references are provided for your reference:
        {glossary && (
          <TextChunk>
            {dedent`
            Glossary: all terms and definitions. You must strictly follow the
            terms and definitions in the glossary when translating.

            ${glossary.map(ReferencesPrompt._formatItem).join("\n")}
            `}
          </TextChunk>
        )}
        {preferences && (
          <TextChunk>
            {dedent`
            Preferences: user preferences for translation. You should consider
            the user's preferences when translating.
            
            ${preferences.map(ReferencesPrompt._formatItem).join("\n")}
            `}
          </TextChunk>
        )}
      </UserMessage>
    );
  }
}

export interface TranslateTextPromptProps extends BasePromptElementProps {
  instruction?: string;
  sourceLang: string;
  targetLang: string;
  content: string;
  partType: SyncBlockPartType;
  prev?: {
    source: string;
    target: string;
  };
}

export class TranslateTextPrompt extends PromptElement<TranslateTextPromptProps> {
  async render(
    state: void,
    sizing: PromptSizing
  ): Promise<PromptPiece | undefined> {
    const { instruction, sourceLang, targetLang, content, partType, prev } =
      this.props;

    const [prevTitle, ...prevContents] = prev
      ? [
          `# Previous translation`,
          `Previous source text (in ${sourceLang}): ${prev.source}`,
          `Previous translated text (in ${targetLang}): ${prev.target}`,
        ]
      : [
          `# Example`,
          `Current source text (in ${sourceLang}): 图~\\ref{fig:rq1}展示了实验一的结果。`,
          `Current translated text (in ${targetLang}): Figure~\\ref{fig:rq1} has demonstrate the result of experiment one.`,
        ];

    if (partType === "target") {
      prevContents.reverse();
    }

    const prevText = [prevTitle, ...prevContents].join("\n\n");

    const currContents = [
      `Current source text (in ${sourceLang})`,
      `Current translated text (in ${targetLang})`,
    ];
    if (partType === "target") {
      currContents.reverse();
    }

    const [sourceText, targetText] = currContents;

    return (
      <>
        <UserMessage>
          <TextChunk>{`${prevText}\n\n`}</TextChunk>
          {instruction && `User instruction: ${instruction}\n\n`}
          <TextChunk>
            {dedent`
            # Current translation

            ${sourceText}: ${content}

            Please response with ${targetText}, without any additional format (like starting with 'Current translated text') or content.

            Response:
            `}
          </TextChunk>
        </UserMessage>
      </>
    );
  }
}

export interface TranslatePromptProps extends BasePromptElementProps {
  references?: References;
  text: TranslateTextPromptProps;
}

export class TranslatePrompt extends PromptElement<TranslatePromptProps> {
  /*
你是一位科研论文审稿员，擅长写作高质量的英文科研论文。请将如下中文片段翻译为英文，确保翻译结果符合专业学术期刊的语言风格。翻译时请遵循如下规则：

1. 确保翻译成英文的语言和原文意义一致，不可篡改原文意思；
2. 确保你的术语和定义准确无误，特别是对于领域的专有名词和术语；
3. 确保语言的逻辑关系准确，条理清晰； 
4. 采用简洁明确的表达方式，避免使用模糊或不必要的词汇、术语或句子； 
5. 注意英语语法表达的准确性，确保句子结构正确；

翻译内容中需要完整保留原文的LaTeX格式。你的翻译结果中不能包含任何换行符（如`\n`, `\r`）。
*/
  private static _systemMessage = (
    <UserMessage>
      {dedent`
      You are a research paper reviewer who excels at writing high-quality English research papers. Please translate the given content into English and Chinese for each other. Ensuring that the translation is in line with the language style of professional academic journals. When translating, please follow these rules:
      
      1. Ensure that the English translation is consistent with the original meaning and format, do not make up anything or any latex format.
      2. Ensure that your terminology and definitions are accurate, especially for domain-specific terms and concepts;
      3. Ensure that the logical relationships of the language are accurate and well-organized;
      4. Use a concise and clear expression, avoiding the use of vague or unnecessary vocabulary, terms, or sentences;
      5. Pay attention to the accuracy of English grammar expression and ensure that the sentence structure is correct;
      6. Ensure that the LaTeX format of the original text is completely preserved in the translation. 

      Your response MUST NOT include any additional format or content. Your translation MUST be in the same line, DO NOT contain any line breaks.
      `}
    </UserMessage>
  );

  async render(
    state: void,
    sizing: PromptSizing
  ): Promise<PromptPiece | undefined> {
    const { references, text } = this.props;

    return (
      <>
        {TranslatePrompt._systemMessage}
        {references && <ReferencesPrompt references={references} />}
        <TranslateTextPrompt {...text} />
      </>
    );
  }
}

export interface PreferencesPromptProps extends BasePromptElementProps {}

export class PreferencesPrompt extends PromptElement<PreferencesPromptProps> {
  render(
    state: void,
    sizing: PromptSizing
  ): Promise<PromptPiece | undefined> | PromptPiece | undefined {
    throw new Error("Method not implemented.");
  }
}
