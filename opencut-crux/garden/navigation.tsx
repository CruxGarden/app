import React, { createContext, useContext, useSyncExternalStore } from "react";
const RouteContext = createContext("");
const navigate = (path: string) => {
	location.hash = path === "/" ? "/projects" : path;
};
const router = {
	push: navigate,
	replace: navigate,
	back: () => history.back(),
};
export const useRouter = () => router;
export const RouteProvider = ({
	route,
	children,
}: {
	route: string;
	children: React.ReactNode;
}) => <RouteContext.Provider value={route}>{children}</RouteContext.Provider>;
export function useParams() {
	return {
		project_id: useContext(RouteContext).match(/^\/editor\/([^/]+)$/)?.[1],
	};
}
export function usePathname() {
	return useSyncExternalStore(
		(cb) => {
			addEventListener("hashchange", cb);
			return () => removeEventListener("hashchange", cb);
		},
		() => location.hash.slice(1),
	);
}
export const useSearchParams = () => new URLSearchParams(location.search);
