export type Lang = "en" | "zh" | "ja" | "ko" | "default";

const CJKSeps = new Set(["，", "。", "；", "！", "？"]);
const ENGSeps = new Set([",", ".", ";", "!", "?"]);

export const LangSeps: Record<Lang, Set<string>> = {
  default: ENGSeps,
  en: ENGSeps,
  zh: CJKSeps,
  ja: CJKSeps,
  ko: CJKSeps,
};

export const LangNames: Record<Lang, string> = {
  default: "Default",
  en: "English",
  zh: "Chinese",
  ja: "Japanese",
  ko: "Korean",
};
