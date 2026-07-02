let shareOpener = null;

export function registerShareImageOpener(fn) {
  shareOpener = fn;
}

export function openShareImage({ blob, filename, title }) {
  if (!shareOpener) {
    throw new Error('Share not ready');
  }
  shareOpener({ blob, filename, title: title || filename });
}
