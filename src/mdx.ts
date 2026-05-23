import type { PropsWithChildren } from "react";

// This is used as a way to fix issues with interleaving in MDX templates.
export const useMDXComponents = () => {
	return {
		p: (props: PropsWithChildren) => {
			return props.children;
		},
	};
};
