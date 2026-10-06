/**
 * OpenCut awaits its GPU renderer before it loads a project. Where WebGPU is
 * present but `requestAdapter()` never answers (seen in Electron with some GPU
 * setups, and in automated runs), the editor sat on "Loading project…" for
 * ever. An adapter request that has not answered in a few seconds is taken as
 * "no adapter": OpenCut then renders in its degraded (CPU) mode, which it
 * already supports, and the project opens.
 */
export function guardGpuAdapter(timeoutMs = 4000): void {
	const gpu = (navigator as any).gpu;
	if (!gpu || typeof gpu.requestAdapter !== "function" || gpu.__gardenGuarded)
		return;
	const request = gpu.requestAdapter.bind(gpu);
	gpu.requestAdapter = (options?: unknown) =>
		Promise.race([
			request(options),
			new Promise((resolve) =>
				setTimeout(() => {
					console.warn(
						`WebGPU did not answer in ${timeoutMs} ms; OpenCut renders without the GPU.`,
					);
					resolve(null);
				}, timeoutMs),
			),
		]);
	gpu.__gardenGuarded = true;
}
