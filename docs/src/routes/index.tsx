import { createFileRoute, Navigate } from "@tanstack/react-router";

/** @internal TanStack Router consumes this file-route export indirectly. */
export const Route = createFileRoute("/")({
  component: HomeRedirect,
});

function HomeRedirect() {
  return <Navigate to="/docs/$" params={{ _splat: "" }} replace />;
}
