import { createFileRoute } from "@tanstack/react-router";
import { createSearchAPI } from "fumadocs-core/search/server";
import { source } from "#/lib/source";

const server = createSearchAPI("advanced", {
  language: "english",
  indexes: source.getPages().map((page) => ({
    id: page.url,
    title: page.data.title,
    description: page.data.description,
    structuredData: page.data.structuredData,
    url: page.url,
  })),
});

/** @internal TanStack Router consumes this file-route export indirectly. */
export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: () => server.staticGET(),
    },
  },
});
