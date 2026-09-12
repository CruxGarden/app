import type { AnchorHTMLAttributes } from "react";
export default function Link({
	href,
	children,
	...props
}: AnchorHTMLAttributes<HTMLAnchorElement>) {
	return (
		<a
			{...props}
			href={
				href?.startsWith("/") ? "#" + (href === "/" ? "/projects" : href) : href
			}
		>
			{children}
		</a>
	);
}
