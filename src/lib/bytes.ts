/** The bytes of a Blob or an ArrayBuffer, as an ArrayBuffer. */
export async function toArrayBuffer(data: Blob | ArrayBuffer): Promise<ArrayBuffer> {
  return data instanceof Blob ? data.arrayBuffer() : data;
}
