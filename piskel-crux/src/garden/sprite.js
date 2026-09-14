import { validateCommand, inspectPixels } from './commands.js';

/** Native model/history seam. No serialized-document rewriting behind the canvas. */
export function spriteCommands(app, native, saveSheet) {
  const controller = app.piskelController;
  const frameAt = (layer, index) => controller.getLayerAt(layer)?.getFrameAt(index);
  function inspect(v = {}) {
    const layerIndex = v.layerIndex ?? controller.getCurrentLayerIndex();
    const frameIndex = v.frameIndex ?? controller.getCurrentFrameIndex();
    const frame = frameAt(layerIndex, frameIndex);
    if (!frame) throw new Error('That layer/frame no longer exists. Inspect the sprite again.');
    const x = v.x ?? 0,
      y = v.y ?? 0;
    const width = v.width ?? Math.min(16, controller.getWidth() - x);
    const height = v.height ?? Math.min(16, controller.getHeight() - y);
    if (
      width < 1 ||
      height < 1 ||
      x + width > controller.getWidth() ||
      y + height > controller.getHeight()
    )
      throw new Error('Choose an inspection region inside the sprite.');
    const offset = v.offset ?? 0;
    return {
      name: String(controller.getPiskel().getDescriptor().name).slice(0, 500),
      width: controller.getWidth(),
      height: controller.getHeight(),
      fps: controller.getFPS(),
      frames: controller.getFrameCount(),
      layers: controller
        .getLayers()
        .map((l, index) => ({
          index,
          name: String(l.getName()).slice(0, 160),
          opacity: l.getOpacity(),
        })),
      frameList: Array.from(
        { length: Math.min(20, Math.max(0, controller.getFrameCount() - offset)) },
        (_, i) => {
          const index = offset + i;
          return {
            index,
            frameId: String(frameAt(0, index).id),
            hidden: controller.getPiskel().hiddenFrames.includes(index),
          };
        },
      ),
      nextOffset: offset + 20 < controller.getFrameCount() ? offset + 20 : null,
      layerIndex,
      frameIndex,
      expectedHash: frame.getHash(),
      pixels: inspectPixels(frame, x, y, width, height),
    };
  }
  function resolve(v) {
    if (v.op === 'inspect') {
      inspect(v);
      return;
    }
    if (v.op === 'paint') {
      const frame = frameAt(v.layerIndex, v.frameIndex);
      if (!frame || frame.getHash() !== v.expectedHash)
        throw new Error(
          'The target frame changed. Inspect again and preserve the latest pixels before editing.',
        );
      if (v.pixels.some((p) => !frame.containsPixel(p.x, p.y)))
        throw new Error(
          'Every requested pixel must be inside this sprite. No pixels were changed.',
        );
      return frame;
    }
    if (v.op === 'insert-frame' || v.op === 'duplicate-frame') {
      if (
        controller.getFrameCount() >= 2000 ||
        controller.getWidth() *
          controller.getHeight() *
          controller.getLayers().length *
          (controller.getFrameCount() + 1) >
          64000000
      )
        throw new Error('Another frame would exceed the portable sprite limits.');
    }
    if (v.op === 'insert-frame' && v.index > controller.getFrameCount())
      throw new Error('Insert at an existing position or immediately after the last frame.');
    if (v.frameId !== undefined) {
      let index = -1;
      for (let i = 0; i < controller.getFrameCount(); i++)
        if (String(frameAt(0, i).id) === v.frameId) {
          index = i;
          break;
        }
      if (index < 0)
        throw new Error('That frame ID is stale. Inspect again after Undo, deletion or reopening.');
      if (v.op === 'move-frame' && v.index >= controller.getFrameCount())
        throw new Error('Move to an existing frame position.');
      if (v.op === 'delete-frame') {
        if (controller.getFrameCount() === 1) throw new Error('Keep at least one animation frame.');
        // Upstream removal does not remove the matching hidden-frame index.
        if (controller.getPiskel().hiddenFrames.includes(index))
          throw new Error('Show this frame in the native frame list before deleting it.');
      }
      return index;
    }
  }
  const snapshot = () =>
    native.$.publish(native.Events.PISKEL_SAVE_STATE, {
      type: native.pskl.service.HistoryService.SNAPSHOT,
    });
  function prepare(value) {
    const v = validateCommand(value);
    resolve(v);
    return {
      mutates: v.op !== 'inspect',
      async apply() {
        // Re-resolve after the confirmed pre-save; native manual edits can arrive while saving.
        const target = resolve(v);
        if (v.op === 'inspect') return inspect(v);
        if (v.op === 'save-sheet') return saveSheet(v.label);
        if (v.op === 'paint') {
          controller.setCurrentLayerIndex(v.layerIndex);
          controller.setCurrentFrameIndex(v.frameIndex);
          for (const p of v.pixels) target.setPixel(p.x, p.y, p.color);
          snapshot();
          native.$.publish(native.Events.PISKEL_RESET);
        } else if (v.op === 'insert-frame') controller.addFrameAt(v.index);
        else if (v.op === 'duplicate-frame') controller.duplicateFrameAt(target);
        else if (v.op === 'move-frame') controller.moveFrame(target, v.index);
        else if (v.op === 'delete-frame') controller.removeFrameAt(target);
        else if (v.op === 'fps') controller.setFPS(v.fps);
      },
      result: (value) => value ?? inspect(),
    };
  }
  return { prepare, inspect };
}
