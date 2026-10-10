import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { formatGeneratedMetadata } from "../../docgen/generatedMetadata";

const generatedMetadataFiles = [
  "components/meta.json",
  "components/css/meta.json",
  "components/shell/meta.json",
  "components/variables/meta.json",
  "ui/templates/meta.json",
];

test("regenerated navigation metadata matches the committed canonical JSON", async () => {
  for (const file of generatedMetadataFiles) {
    const content = readFileSync(
      new URL(`../../docs/content/docs/${file}`, import.meta.url),
      "utf8",
    );
    expect(await formatGeneratedMetadata(JSON.parse(content)), file).toBe(
      content,
    );
  }
});
