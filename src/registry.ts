import { fixTypeMismatch } from "./fixers/ts2322";
import { fixUndefined } from "./fixers/ts2304";
import { LineFixer } from "./types";

export const lineFixers: Record<number, LineFixer> = {
  2322: fixTypeMismatch,
  2304: fixUndefined,
};