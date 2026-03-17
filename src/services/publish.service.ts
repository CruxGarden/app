import type { Crux } from './types';

export interface PublishFile {
  blob: Blob;
  path: string;
  type?: string;
  kind?: string;
  mimeType: string;
}

export interface IPublishService {
  publish(cruxId: string, files: PublishFile[]): Promise<Crux>;
  unpublish(cruxId: string): Promise<Crux>;
}
