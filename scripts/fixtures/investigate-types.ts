// Shapes the investigate brief modules exchange, shared by the test files that
// declare those modules' types by hand.

export type DepRow = {
  name: string;
  version: string;
  dev: boolean;
  ecosystem: "composer" | "npm";
  path: string;
  ambiguous: string[] | null;
  importedAs: string[];
};

export type KeyCache = {
  get: (k: string) => unknown;
  put: (k: string, d: unknown) => void;
};

export type Sym = {
  name: string;
  file: string;
  kind: "php" | "ts";
  basenameFallback?: true;
};

export type Hit = {
  filePath: string;
  lineNo: string;
  text: string;
  category?: string;
};

export type TsCallers = {
  symbol: string;
  rows: Array<{ name: string; loc: string; sites: number }>;
};
