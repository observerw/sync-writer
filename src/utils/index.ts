import { ClassConstructor, plainToInstance } from "class-transformer";
import { validateOrReject } from "class-validator";
import * as vscode from "vscode";

export namespace utils {
  export const parse = async <T>(
    data: any,
    cls: ClassConstructor<T>
  ): Promise<T> => {
    const instance = plainToInstance(cls, data);
    await validateOrReject(instance as object);

    return instance;
  };

  export const randomHex = (length: number = 6): string => {
    return [...Array(length)]
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join("");
  };

  export const escapeRegExp = (str: string): string => {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  export const exists = async (uri: vscode.Uri): Promise<boolean> => {
    try {
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  };

  export const range = function* (
    start: number,
    end: number = Number.POSITIVE_INFINITY
  ): Iterable<number> {
    for (let i = start; i < end; i++) {
      yield i;
    }
  };

  export const chunk = function* <T>(
    iterable: Iterable<T>,
    size: number
  ): Iterable<T[]> {
    let chunk = [];
    for (const item of iterable) {
      chunk.push(item);
      if (chunk.length === size) {
        yield chunk;
        chunk = [];
      }
    }

    if (chunk.length) {
      yield chunk;
    }
  };

  export const sleep = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
}
