import { renderToStaticMarkup } from "react-dom/server";
import {
  CSS,
  CurrentPageTop,
  compile,
  Field,
  FloatBottom,
  Font,
  Footnote,
  Margins,
  NoBreak,
  PageBottom,
  PageBreak,
  PageNumber,
  PagesNumber,
  PageTop,
  RunningH1,
  RunningH2,
  RunningH3,
  RunningH4,
  RunningH5,
  RunningH6,
} from "react-print-pdf";
import { expect, test } from "vitest";

test("CSS escapes closing tags instead of allowing markup injection", () => {
  const html = renderToStaticMarkup(
    <CSS>{'p::before { content: "</style><script>bad()</script>"; }'}</CSS>,
  );

  expect(html).toContain("&lt;/style>");
  expect(html).not.toContain("<script>");
  expect(html.match(/<\/style>/g)).toHaveLength(1);
});

test("CSS rewrites unsupported :where selectors without escaping valid CSS quotes", () => {
  const html = renderToStaticMarkup(
    <CSS>{`:where(.chapter, .appendix)::before { content: "Section"; }`}</CSS>,
  );

  expect(html).toContain(
    ':is(.chapter, .appendix)::before { content: "Section"; }',
  );
  expect(html).not.toContain(":where(");
});

test("CSS preserves ampersands and literal characters inside style elements", () => {
  const html = renderToStaticMarkup(
    <CSS>{`@import url("https://fonts.example.test/css?family=A+B&display=swap");
.label::before { content: "R&D > ©"; }`}</CSS>,
  );

  expect(html).toContain('family=A+B&display=swap");');
  expect(html).toContain('content: "R&D > ©";');
  expect(html).not.toContain("&amp;");
  expect(html.match(/<\/style>/g)).toHaveLength(1);
});

test("Font emits a stylesheet import", () => {
  const html = renderToStaticMarkup(
    <Font url="https://example.test/font.css" />,
  );
  expect(html).toContain("@import url('https://example.test/font.css');");
});

test("Font keeps query parameters intact when importing an external stylesheet", () => {
  const url =
    "https://fonts.googleapis.com/css2?family=Roboto:wght@300&display=swap";
  const html = renderToStaticMarkup(<Font url={url} />);

  expect(html).toContain(`@import url('${url}');`);
  expect(html).not.toContain("&amp;");
});

test("source compilation includes real print CSS instead of Vitest CSS stubs", async () => {
  const html = await compile(<main>Print stylesheet</main>);

  expect(html).toContain(".hyphenate {");
  expect(html).toMatch(/\.react-print-footnote\s*\{[^}]*float:\s*footnote/);
  expect(html).toMatch(
    /\.react-print-page-break\s*\{[^}]*page-break-after:\s*always/,
  );
  expect(html).toContain("string-set: reactPrintH1Contents");
});

test("Margins produces a complete @page rule with every margin", () => {
  const html = renderToStaticMarkup(
    <Margins
      pageRatio="A5 landscape"
      top="10"
      right="20"
      bottom="30"
      left="40"
    />,
  );

  expect(html).toMatch(/<style>@page\s*\{[^{}]+\}<\/style>/);
  expect(html).toContain("size: A5 landscape;");
  expect(html).toContain("margin-top:10px;");
  expect(html).toContain("margin-right:20px;");
  expect(html).toContain("margin-bottom:30px;");
  expect(html).toContain("margin-left:40px;");
});

test("layout wrappers preserve their content, classes and extra attributes", () => {
  const html = renderToStaticMarkup(
    <>
      <PageTop className="custom" data-region="top">
        Header
      </PageTop>
      <CurrentPageTop>Current header</CurrentPageTop>
      <PageBottom>Footer</PageBottom>
      <PageBreak data-break="yes" />
      <NoBreak className="protected">Keep together</NoBreak>
      <FloatBottom style={{ color: "red" }}>Bottom float</FloatBottom>
    </>,
  );

  expect(html).toContain('class="react-print-page-top custom"');
  expect(html).toContain('data-region="top"');
  expect(html).toContain('class="react-print-current-page-top');
  expect(html).toContain('class="react-print-page-bottom');
  expect(html).toContain('class="react-print-page-break');
  expect(html).toContain('data-break="yes"');
  expect(html).toContain('class="react-print-no-break protected"');
  expect(html).toContain("Keep together");
  expect(html).toContain("Bottom float");
  expect(html).toContain("color:red");
  expect(html).toContain("prince-float:bottom");
});

test("PageTop and NoBreak add their default classes without custom class names", () => {
  const html = renderToStaticMarkup(
    <>
      <PageTop>Header</PageTop>
      <NoBreak>Body</NoBreak>
    </>,
  );

  expect(html).toMatch(/class="react-print-page-top\s*"/);
  expect(html).toMatch(/class="react-print-no-break\s*"/);
  expect(html).toContain("Header");
  expect(html).toContain("Body");
});

test("page counters emit the intended counter styles", () => {
  const html = renderToStaticMarkup(
    <>
      <PageNumber counterStyle="lower-roman" />
      <PagesNumber counterStyle="decimal" />
    </>,
  );

  expect(html).toContain("counter(page, lower-roman)");
  expect(html).toContain('class="react-print-page-number-lower-roman"');
  expect(html).toContain("counter(pages, decimal)");
  expect(html).toContain('class="react-print-pages-number-decimal"');
});

test("page counters default to decimal for current and total pages", () => {
  const html = renderToStaticMarkup(
    <>
      <PageNumber />
      <PagesNumber />
    </>,
  );

  expect(html).toContain("counter(page, decimal)");
  expect(html).toContain("counter(pages, decimal)");
  expect(html).toContain('class="react-print-page-number-decimal"');
  expect(html).toContain('class="react-print-pages-number-decimal"');
});

test("running heading placeholders retain level and decorators", () => {
  const html = renderToStaticMarkup(
    <>
      <RunningH1 before="Chapter: " after="!" />
      <RunningH6 />
    </>,
  );

  expect(html).toContain("react-print-h1-contents");
  expect(html).toContain('data-before="Chapter: "');
  expect(html).toContain('data-after="!"');
  expect(html).toContain("react-print-h6-contents");
});

test("running heading placeholders support all intermediate heading levels", () => {
  const html = renderToStaticMarkup(
    <>
      <RunningH2 />
      <RunningH3 />
      <RunningH4 />
      <RunningH5 />
    </>,
  );

  for (const level of [2, 3, 4, 5]) {
    expect(html).toContain(`react-print-h${level}-contents`);
  }
});

test("Footnote preserves rich text and includes its print CSS", async () => {
  const html = await compile(
    <p>
      Footnote reference
      <Footnote>
        Some <strong>important</strong> detail
      </Footnote>
    </p>,
  );

  expect(html).toContain('class="react-print-footnote');
  expect(html).toContain("<strong>important</strong>");
  expect(html).toMatch(/\.react-print-footnote\s*\{[^}]*float:\s*footnote/);
});

test("signature fields encode their type and signee without losing input props", () => {
  const html = renderToStaticMarkup(
    <>
      <Field type="signHere" signee="sender" id="signature" className="extra" />
      <Field type="checkbox" signee="recipient" />
      <Field type="radio" signee="reviewer" />
    </>,
  );

  const inputs = html.match(/<input\b[^>]*>/g);
  expect(inputs).toHaveLength(3);
  expect(inputs?.[0]).toContain('name="eSignSignHere"');
  expect(inputs?.[0]).toContain('type="text"');
  expect(inputs?.[0]).toContain('data-react-print-sign="signHere"');
  expect(inputs?.[0]).toContain('data-react-print-signee="sender"');
  expect(inputs?.[0]).toContain('id="signature"');
  expect(inputs?.[0]).toContain("react-print-signature-field-signHere extra");
  expect(inputs?.[1]).toContain('name="eSignCheckbox"');
  expect(inputs?.[1]).toContain('type="checkbox"');
  expect(inputs?.[1]).toContain('data-react-print-signee="recipient"');
  expect(inputs?.[2]).toContain('name="eSignRadio"');
  expect(inputs?.[2]).toContain('type="radio"');
  expect(inputs?.[2]).toContain('data-react-print-signee="reviewer"');
});

test.each([
  ["signHereOptional", "eSignSignHereOptional"],
  ["signInitialHere", "eSignInitialHere"],
  ["signInitialHereOptional", "eSignInitialHereOptional"],
  ["company", "eSignCompany"],
  ["dateSigned", "eSignDateSigned"],
  ["title", "eSignTitle"],
  ["fullName", "eSignFullName"],
  ["lastName", "eSignLastName"],
  ["firstName", "eSignFirstName"],
  ["emailAddress", "eSignEmailAddress"],
  ["number", "eSignNumber"],
  ["date", "eSignDate"],
  ["ssn", "eSignSSN"],
  ["zip5", "eSignZIP5"],
  ["zip5dash4", "eSignZIP5DASH4"],
  ["note", "eSignNote"],
  ["list", "eSignList"],
  ["approve", "eSignApprove"],
  ["decline", "eSignDecline"],
  ["view", "eSignView"],
  ["signerAttachment", "eSignSignerAttachment"],
  ["signerAttachmentOptional", "eSignSignerAttachmentOptional"],
] as const)("maps DocuSign field %s to %s", (type, expectedName) => {
  const html = renderToStaticMarkup(
    <Field type={type} signee="reviewer" name="caller-value" />,
  );

  expect(html).toContain(`name="${expectedName}"`);
  expect(html).not.toContain('name="caller-value"');
  expect(html).toContain('type="text"');
  expect(html).toContain(`data-react-print-sign="${type}"`);
  expect(html).toContain('data-react-print-signee="reviewer"');
});
