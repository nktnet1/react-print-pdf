import { createFileRoute, notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import browserCollections from "collections/browser";
import { useFumadocsLoader } from "fumadocs-core/source/client";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  PageLastUpdate,
} from "fumadocs-ui/layouts/docs/page";
import { Suspense } from "react";
import { useMDXComponents } from "#/components/fumadocs/mdx";
import { baseOptions } from "#/lib/layout.shared";
import { source } from "#/lib/source";
import { staticFunctionMiddleware } from "#/lib/staticMiddlewareFunction";

/** @internal TanStack Router consumes this file-route export indirectly. */
export const Route = createFileRoute("/docs/$")({
  component: Page,
  loader: async ({ params }) => {
    const slugs = params._splat?.split("/").filter(Boolean) ?? [];
    const data = await loader({ data: slugs });
    await clientLoader.preload(data.path);
    return data;
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData ? `${loaderData.title} | React Print` : "React Print",
      },
    ],
  }),
});

const loader = createServerFn({ method: "GET" })
  .validator((slugs: string[]) => slugs)
  .middleware([staticFunctionMiddleware])
  .handler(async ({ data: slugs }) => {
    const page = source.getPage(slugs);
    if (!page) {
      throw notFound();
    }

    return {
      path: page.path,
      title: page.data.title,
      lastModified: page.data.lastModified,
      pageTree: await source.serializePageTree(source.getPageTree()),
    };
  });

const clientLoader = browserCollections.docs.createClientLoader({
  component(
    { toc, frontmatter, default: MDX },
    { lastModified }: { lastModified?: Date },
  ) {
    // biome-ignore lint/correctness/useHookAtTopLevel: Fumadocs client loaders render this as a component.
    const components = useMDXComponents();

    return (
      <DocsPage toc={toc}>
        <DocsTitle>{frontmatter.title}</DocsTitle>
        <DocsDescription>{frontmatter.description}</DocsDescription>
        <DocsBody>
          <MDX components={components} />
          {lastModified && (
            <PageLastUpdate
              className="mb-6 mt-8 border-t-2 pt-4"
              date={lastModified}
            />
          )}
        </DocsBody>
      </DocsPage>
    );
  },
});

function Page() {
  const { pageTree, path, lastModified } = useFumadocsLoader(
    Route.useLoaderData(),
  );

  return (
    <DocsLayout {...baseOptions()} tree={pageTree}>
      <Suspense>{clientLoader.useContent(path, { lastModified })}</Suspense>
    </DocsLayout>
  );
}
