import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Independent decoded-output check for the red/blue, 440/660Hz test film. */
export function validateExport(file, ffmpeg) {
	const result = [0.5, 1.5].map((time) => {
		const rgb = [
			...execFileSync(ffmpeg, [
				"-v",
				"error",
				"-ss",
				String(time),
				"-i",
				file,
				"-frames:v",
				"1",
				"-vf",
				"crop=16:16:0:0,scale=1:1",
				"-pix_fmt",
				"rgb24",
				"-f",
				"rawvideo",
				"-",
			]),
		];
		const frame = execFileSync(ffmpeg, [
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			file,
			"-frames:v",
			"1",
			"-vf",
			"scale=320:180",
			"-pix_fmt",
			"rgb24",
			"-f",
			"rawvideo",
			"-",
		]);
		let whitePixels = 0;
		for (let i = 0; i < frame.length; i += 3)
			if (frame[i] > 220 && frame[i + 1] > 220 && frame[i + 2] > 220)
				whitePixels++;
		const pcm = execFileSync(ffmpeg, [
			"-v",
			"error",
			"-ss",
			String(time),
			"-i",
			file,
			"-t",
			"0.5",
			"-vn",
			"-ac",
			"1",
			"-ar",
			"8000",
			"-f",
			"f32le",
			"-",
		]);
		let crossings = 0,
			previous = 0,
			peak = 0;
		for (let i = 0; i < pcm.length; i += 4) {
			const value = pcm.readFloatLE(i);
			if (previous <= 0 && value > 0) crossings++;
			peak = Math.max(peak, Math.abs(value));
			previous = value;
		}
		return {
			time,
			rgb,
			whitePixels,
			toneHz: crossings / (pcm.length / 4 / 8000),
			peak,
		};
	});
	assert.ok(
		result[0].rgb[0] > 200 && result[0].rgb[2] < 30,
		"First segment must be red",
	);
	assert.ok(
		result[1].rgb[2] > 200 && result[1].rgb[0] < 30,
		"Second segment must be blue",
	);
	assert.ok(
		Math.abs(result[0].toneHz - 440) < 15 &&
			Math.abs(result[1].toneHz - 660) < 15,
		"Both original audio tones must survive",
	);
	assert.ok(
		result.every((r) => r.whitePixels > 25),
		"The native title overlay must appear in both segments",
	);
	assert.ok(
		result.every((r) => r.peak > 0.01),
		"Audio must be audible",
	);
	return result;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
	console.log(
		JSON.stringify(validateExport(process.argv[2], process.argv[3]), null, 2),
	);
