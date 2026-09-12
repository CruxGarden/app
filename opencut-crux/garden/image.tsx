export default function Image({
	src,
	alt,
	fill,
	priority,
	unoptimized,
	loader,
	quality,
	...props
}: any) {
	return (
		<img
			{...props}
			src={typeof src === "string" ? src : src.src}
			alt={alt || ""}
			style={{
				...props.style,
				...(fill
					? { position: "absolute", inset: 0, width: "100%", height: "100%" }
					: {}),
			}}
		/>
	);
}
