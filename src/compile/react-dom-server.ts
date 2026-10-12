// Keep React DOM's server renderer behind a lazy ESM boundary. In particular,
// importing the public compiler must not initialize React DOM in an RSC graph.
import { renderToString as reactRenderToString } from "react-dom/server";

export const renderToString = reactRenderToString;
