import { Suspense } from "react";
import { compile, Tailwind } from "react-print-pdf";
import { expect, test } from "vitest";

const Suspends = () => {
  throw new Promise<never>(() => {});
};

test("suspended Tailwind region should not abort a document using Suspense fallback", async () => {
  const html = await compile(
    <Suspense fallback={<div className="text-red-500">Fallback rendered</div>}>
      <Tailwind preflight={false}>
        <div className="text-blue-500">
          <Suspends />
        </div>
      </Tailwind>
    </Suspense>,
  );
  expect(html).toContain("Fallback rendered");
  expect(html).not.toContain(".text-blue-500");
});

test("Tailwind in Suspense fallback still compiles after primary region suspends", async () => {
  const html = await compile(
    <Suspense
      fallback={
        <Tailwind preflight={false}>
          <p className="text-green-500">Loaded fallback</p>
        </Tailwind>
      }
    >
      <Tailwind preflight={false}>
        <p className="text-[#dcba98]">
          <Suspends />
        </p>
      </Tailwind>
    </Suspense>,
  );
  expect(html).toContain("Loaded fallback");
  expect(html).toContain(".text-green-500");
  expect(html).not.toContain("#dcba98");
});

test("unrelated Tailwind regions still resolve when a sibling Suspense branch is discarded", async () => {
  const html = await compile(
    <>
      <Tailwind preflight={false}>
        <p className="text-[#123abc]">Visible sibling</p>
      </Tailwind>
      <Suspense fallback={<p>Suspense fallback</p>}>
        <Tailwind preflight={false}>
          <p className="text-[#cba321]">
            <Suspends />
          </p>
        </Tailwind>
      </Suspense>
    </>,
  );
  expect(html).toContain("Visible sibling");
  expect(html).toContain("#123abc");
  expect(html).not.toContain("#cba321");
  expect(html).toContain("Suspense fallback");
});

test("Emotion compilation also discards Tailwind registrations from abandoned Suspense branches", async () => {
  const html = await compile(
    <Suspense
      fallback={
        <Tailwind preflight={false}>
          <p className="text-[#abe123]">Fallback</p>
        </Tailwind>
      }
    >
      <Tailwind preflight={false}>
        <Suspends />
      </Tailwind>
    </Suspense>,
    { emotion: true },
  );
  expect(html).toContain("Fallback");
  expect(html).toContain("#abe123");
});
