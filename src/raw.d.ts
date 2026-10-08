declare module "*.css?raw" {
  const contents: string;
  export default contents;
}

declare module "*.css";
