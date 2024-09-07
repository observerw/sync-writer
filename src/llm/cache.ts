import { LRUCache } from "lru-cache";
import hash from "object-hash";

export class LLMCache<T extends {}> {
  /**
   * Cache for hash values of the same object reference.
   */
  private _hashCache: LRUCache<T, string>;
  /**
   * Cache for responses of the same object content.
   */
  private _respCache: LRUCache<string, string>;

  constructor(max: number = 100) {
    this._hashCache = new LRUCache({ max });
    this._respCache = new LRUCache({ max });
  }

  _key(key: T) {
    let hashValue = this._hashCache.get(key);
    if (!hashValue) {
      hashValue = hash(key);
      this._hashCache.set(key, hashValue);
    }

    return hashValue;
  }

  update(key: T, value: string) {
    this._respCache.set(this._key(key), value);
  }

  extend(key: T, value: string) {
    const hashValue = this._key(key);
    const prevValue = this._respCache.get(hashValue) || "";
    this._respCache.set(hashValue, prevValue + value);
  }

  get(key: T): string | null {
    return this._respCache.get(this._key(key)) || null;
  }
}
