import type { ReactElement } from "react";
import type { CompileOptions } from "../compile/compile";

interface Example {
  description?: string;
  name?: string;
  template: ReactElement;
  compileOptions?: CompileOptions;
  imports?: string[];
  externalImports?: string[];
}

export interface EnrichedExample extends Example {
  templateString: string;
}

export interface ConfigComponentDoc<T = Example> {
  server: boolean;
  client: boolean;
  examples?: {
    [key: string]: T;
  };
}

export type LucideIconName = `${string}Icon`;

export interface DocConfig<T = Example> {
  name?: string;
  icon?: LucideIconName;
  description: string;
  components: {
    [componentName: string]: ConfigComponentDoc<T>;
  };
}

export type ExtendedDocConfig = DocConfig<EnrichedExample>;
