import { compile } from "react-print-pdf";
import { describe, expect, test } from "vitest";

describe("Emotion style extraction around HTML raw-text elements", () => {
  test("leaves the rest of an HTML plaintext element untouched", async () => {
    const legitimateStyle =
      '<style data-emotion="legitimate">.legitimate{color:#123456}</style>';
    const rawTail =
      '<plaintext><style data-emotion="not-a-tag">.raw{color:#654321}</style>';

    const html = await compile(
      <main
        dangerouslySetInnerHTML={{ __html: `${legitimateStyle}${rawTail}` }}
      />,
      { emotion: true },
    );

    expect(html).toContain(".legitimate{color:#123456}");
    expect(html).not.toContain('data-emotion="legitimate"');
    expect(html).toContain(rawTail);
  });

  test("keeps an unclosed raw-text element rather than harvesting its CSS", async () => {
    const unclosedStyle =
      '<style data-emotion="unclosed">.leave-untouched{color:#123456}';

    const html = await compile(
      <main dangerouslySetInnerHTML={{ __html: unclosedStyle }} />,
      { emotion: true },
    );

    expect(html).toContain(unclosedStyle);
  });
});
