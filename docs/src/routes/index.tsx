import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeRedirect,
});

function HomeRedirect() {
  return <Navigate to="/docs" replace />;
}
