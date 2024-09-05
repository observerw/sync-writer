import type { SyncBlockPartType } from "./sync/block";

export interface SyncCommandArgs {
  uid?: string;
  fromPartType?: SyncBlockPartType;
  ignoreInstruction?: boolean;
}
