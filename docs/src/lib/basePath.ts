import urlJoin from "url-join";

export const getBasePath = () =>
  urlJoin("/", import.meta.env.PUBLIC_DOCS_BASE_PATH ?? "/");

export const withBasePath = (pathname: string) =>
  urlJoin(getBasePath(), pathname);
