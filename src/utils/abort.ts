import * as vscode from "vscode";

export class AbortToken {
  constructor(
    readonly token: vscode.CancellationToken,
    readonly signal: AbortSignal
  ) {}

  get aborted() {
    return this.token.isCancellationRequested || this.signal.aborted;
  }

  onAborted(callback: () => void) {
    this.token.onCancellationRequested(callback);
    this.signal.addEventListener("abort", callback);
  }
}

/**
 *  fill the gap between vscode cancellation token and abort signal😅
 */
export class AbortSource {
  private _source = new vscode.CancellationTokenSource();
  private _controller = new AbortController();

  constructor() {
    this._source.token.onCancellationRequested(() => {
      this._controller.abort();
    });
    this._controller.signal.addEventListener("abort", () => {
      this._source.cancel();
    });
  }

  cancel(): void {
    this._source.cancel();
    this._controller.abort();
  }

  get token(): AbortToken {
    return new AbortToken(this._source.token, this._controller.signal);
  }
}
