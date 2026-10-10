import { format } from "prettier";

// Use the same canonical formatting as the committed docs. Raw JSON.stringify
// produces different whitespace and no trailing newline, causing a false
// freshness failure after every otherwise identical documentation rebuild.
export const formatGeneratedMetadata = (metadata: object): Promise<string> =>
  format(JSON.stringify(metadata, null, 2), { parser: "json" });
