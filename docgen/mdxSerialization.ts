/** Encode maintained metadata as YAML double-quoted scalars.
 * JSON strings are valid YAML double-quoted strings and preserve colons, #,
 * quotes, and line breaks without changing the resulting values.
 */
export const docFrontmatter = ({
  title,
  description,
  icon,
  category,
}: {
  title: string;
  description: string;
  icon?: string;
  category?: string;
}): string => {
  const attributes = [
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
  ];
  if (icon) attributes.push(`icon: ${JSON.stringify(icon)}`);
  if (category) attributes.push(`category: ${JSON.stringify(category)}`);
  return `---\n${attributes.join("\n")}\n---\n\n`;
};

/** MDX JSX string attributes must not interpolate values into raw quotes. */
export const mdxStringAttribute = (name: string, value: string): string =>
  `${name}={${JSON.stringify(value)}}`;
