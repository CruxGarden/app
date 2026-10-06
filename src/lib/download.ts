/** Hand the person a file: an anchor click on a temporary object URL, released after the click lands. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // A synchronous revoke can beat the navigation in some engines.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
