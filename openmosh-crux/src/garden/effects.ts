import { EFFECT_DEFINITIONS } from "../lib/effects/definitions";
import type { EffectInstance } from "../lib/effects/types";
export function inspectEffects(effects: EffectInstance[]) {
	return {
		effects: JSON.parse(JSON.stringify(effects)),
		available: EFFECT_DEFINITIONS.map(({ id, name, params }) => ({
			id,
			name,
			params: params.map(({ visibleWhen, ...param }) => param),
		})),
	};
}
export function changeEffect(
	effects: EffectInstance[],
	command: {
		op: string;
		instanceId?: string;
		enabled?: boolean;
		values?: Record<string, unknown>;
	},
) {
	if (command.op !== "effect" || typeof command.instanceId !== "string")
		throw new Error("Inspect OpenMosh and choose an effect instance.");
	const index = effects.findIndex(
		(effect) => effect.instanceId === command.instanceId,
	);
	if (index < 0)
		throw new Error(
			"That effect instance is no longer available. Inspect OpenMosh again.",
		);
	const effect = effects[index]!;
	const definition = EFFECT_DEFINITIONS.find((def) => def.id === effect.defId)!;
	if (command.enabled !== undefined && typeof command.enabled !== "boolean")
		throw new Error("Enabled must be a boolean.");
	const values = { ...effect.values };
	for (const [key, value] of Object.entries(command.values ?? {})) {
		const param = definition.params.find((param) => param.key === key);
		if (!param) throw new Error(`Unknown effect parameter: ${key}`);
		const valid =
			param.type === "range"
				? typeof value === "number" &&
					Number.isFinite(value) &&
					value >= param.min &&
					value <= param.max
				: param.type === "checkbox"
					? value === 0 || value === 1
					: param.type === "select"
						? param.options.some((option) => option.value === value)
						: param.type === "color"
							? typeof value === "string" && /^#[a-f0-9]{6}$/i.test(value)
							: typeof value === "string" &&
								value.length <= (param.maxLength ?? 4000);
		if (!valid)
			throw new Error(
				`Invalid value for ${key}. Inspect the parameter constraints.`,
			);
		values[key] = value as string | number;
	}
	const result = [...effects];
	result[index] = {
		...effect,
		enabled: command.enabled ?? effect.enabled,
		values,
	};
	return result;
}
