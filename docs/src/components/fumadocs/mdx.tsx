import {
  Tab as FumadocsTab,
  Tabs as FumadocsTabs,
} from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { MDXComponents } from "mdx/types";
import {
  Children,
  type ComponentProps,
  type CSSProperties,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { withBasePath } from "#/lib/basePath";

type ChildrenProps = {
  children?: ReactNode;
};

type LegacyCardProps = ChildrenProps & {
  title: string;
  href?: string;
  icon?: ReactElement;
};

type LegacyCalloutProps = ChildrenProps & {
  intent?: string;
  title?: string;
};

type LegacyTabProps = ChildrenProps & {
  title: string;
};

function resolveHref(href: string) {
  if (!href.startsWith("/") || href.startsWith("//")) {
    return href;
  }
  return withBasePath(href);
}

function MdxAnchor({ href, ...props }: ComponentProps<"a">) {
  const resolvedHref = typeof href === "string" ? resolveHref(href) : href;

  return <a href={resolvedHref} {...props} />;
}

function isPreviewImage(src: ComponentProps<"img">["src"]) {
  return typeof src === "string" && src.includes("/docs/images/previews/");
}

const previewImageStyle = {
  aspectRatio: "auto 210 / 297",
  display: "block",
  height: "auto",
  marginInline: "auto",
  maxHeight: "85vh",
  maxWidth: "100%",
  objectFit: "contain",
  width: "auto",
} satisfies CSSProperties;

function resolveImageStyle(
  src: ComponentProps<"img">["src"],
  style: ComponentProps<"img">["style"],
) {
  return isPreviewImage(src) ? { ...style, ...previewImageStyle } : style;
}

function MdxImage({ src, alt = "", style, ...props }: ComponentProps<"img">) {
  const resolvedSrc =
    typeof src === "string" && src.startsWith("/") ? resolveHref(src) : src;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      style={resolveImageStyle(src, style)}
      {...props}
    />
  );
}

function resolveAssetPaths(node: ReactNode): ReactNode {
  return Children.map(node, (child) => {
    if (!isValidElement(child)) {
      return child;
    }

    if (child.type === "img") {
      const image = child as ReactElement<ComponentProps<"img">>;
      const src = image.props.src;
      const resolvedSrc =
        typeof src === "string" && src.startsWith("/") ? resolveHref(src) : src;

      return cloneElement(image, {
        src: resolvedSrc,
        style: resolveImageStyle(src, image.props.style),
      });
    }

    const element = child as ReactElement<{ children?: ReactNode }>;
    if (element.props.children === undefined) {
      return child;
    }

    return cloneElement(
      element,
      undefined,
      resolveAssetPaths(element.props.children),
    );
  });
}

function LegacyCard({ title, href, icon, children }: LegacyCardProps) {
  const content = (
    <>
      <div className="flex items-center gap-2 font-semibold text-fd-foreground">
        {icon && (
          <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
        )}
        <span>{title}</span>
      </div>
      {children && (
        <div className="mt-1 text-sm text-fd-muted-foreground">
          {resolveAssetPaths(children)}
        </div>
      )}
    </>
  );

  const className =
    "block rounded-lg border bg-fd-card p-4 no-underline transition-colors hover:bg-fd-accent/50";

  if (!href) {
    return <div className={className}>{content}</div>;
  }

  return (
    <a className={className} href={resolveHref(href)}>
      {content}
    </a>
  );
}

function LegacyCards({ children }: ChildrenProps) {
  return <div className="my-4 grid gap-3 sm:grid-cols-2">{children}</div>;
}

function LegacyFrame({ children }: ChildrenProps) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border bg-fd-card p-2">
      {resolveAssetPaths(children)}
    </div>
  );
}

function LegacyAccordion({
  children,
  title,
  icon,
}: ChildrenProps & { title: string; icon?: ReactElement }) {
  return (
    <details className="my-4 rounded-lg border px-4 py-3">
      <summary className="cursor-pointer font-medium">
        <span className="inline-flex items-center gap-2">
          {icon && (
            <span className="inline-flex shrink-0 [&>svg]:size-4">{icon}</span>
          )}
          <span>{title}</span>
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function LegacyCallout({ children, intent, title }: LegacyCalloutProps) {
  return (
    <aside
      className="my-4 rounded-lg border-l-4 bg-fd-muted/50 px-4 py-3"
      data-intent={intent}
    >
      {title && <div className="mb-1 font-semibold">{title}</div>}
      {children}
    </aside>
  );
}

function LegacyCodeBlock({
  children,
  title,
}: ChildrenProps & { title?: string }) {
  return (
    <div className="my-3 overflow-hidden rounded-lg border">
      {title && (
        <div className="border-b bg-fd-muted px-3 py-2 font-mono text-xs">
          {title}
        </div>
      )}
      <div className="[&>pre]:my-0 [&>pre]:rounded-none [&>pre]:border-0">
        {children}
      </div>
    </div>
  );
}

function LegacyCodeBlocks({ children }: ChildrenProps) {
  return <div className="my-4 space-y-3">{children}</div>;
}

function LegacyTab({ children }: LegacyTabProps) {
  return <>{children}</>;
}

function LegacyTabs({ children }: ChildrenProps) {
  const tabs = Children.toArray(children).filter(
    (child): child is ReactElement<LegacyTabProps> =>
      isValidElement<LegacyTabProps>(child) &&
      typeof child.props.title === "string",
  );

  if (tabs.length === 0) {
    return <>{children}</>;
  }

  const items = tabs.map((tab) => tab.props.title);

  return (
    <FumadocsTabs items={items}>
      {tabs.map((tab) => (
        <FumadocsTab key={tab.props.title} value={tab.props.title}>
          {tab.props.children}
        </FumadocsTab>
      ))}
    </FumadocsTabs>
  );
}

const legacyComponents = {
  Accordion: LegacyAccordion,
  AccordionGroup: LegacyCodeBlocks,
  Callout: LegacyCallout,
  Card: LegacyCard,
  CardGroup: LegacyCards,
  Cards: LegacyCards,
  CodeBlock: LegacyCodeBlock,
  CodeBlocks: LegacyCodeBlocks,
  CodeGroup: LegacyCodeBlocks,
  Expandable: LegacyAccordion,
  Frame: LegacyFrame,
  Info: (props: ChildrenProps) => <LegacyCallout intent="info" {...props} />,
  Note: (props: ChildrenProps) => <LegacyCallout intent="note" {...props} />,
  PreviewImage: MdxImage,
  Tab: LegacyTab,
  Tabs: LegacyTabs,
  Tip: (props: ChildrenProps) => <LegacyCallout intent="tip" {...props} />,
  Warning: (props: ChildrenProps) => (
    <LegacyCallout intent="warning" {...props} />
  ),
};

function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    a: MdxAnchor,
    img: MdxImage,
    ...legacyComponents,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
