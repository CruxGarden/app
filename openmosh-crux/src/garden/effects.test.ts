import { test, expect } from "bun:test";
import { changeEffect } from "./effects";
import type { EffectInstance } from "../lib/effects/types";
test("agent changes preserve the full native rack and reject invalid native parameters atomically", () => {
	const effects: EffectInstance[] = [
		{
			instanceId: "one",
			defId: "posterize",
			enabled: false,
			locked: false,
			expanded: true,
			values: { levels: 8 },
		},
		{
			instanceId: "two",
			defId: "mirror",
			enabled: true,
			locked: true,
			expanded: false,
			values: {},
		},
	];
	const result = changeEffect(effects, {
		op: "effect",
		instanceId: "one",
		enabled: true,
		values: { levels: 4 },
	});
	expect(result[0]!.values.levels).toBe(4);
	expect(result[1]).toBe(effects[1]);
	expect(effects[0]!.values.levels).toBe(8);
	expect(() =>
		changeEffect(effects, {
			op: "effect",
			instanceId: "one",
			values: { levels: 99 },
		}),
	).toThrow("Invalid value");
	expect(() =>
		changeEffect(effects, { op: "effect", instanceId: "gone" }),
	).toThrow("no longer available");
});
