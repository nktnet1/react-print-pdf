import type { ReactElement } from "react";

export interface DocgenFixtureProps {
  /** Text to render in the document. */
  message: string;
}

/** A simple React component for testing documentation extraction. */
export const DocgenFixture = ({
  message,
}: DocgenFixtureProps): ReactElement => <strong>{message}</strong>;
