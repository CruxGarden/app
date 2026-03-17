import type { IPublishService, PublishFile } from '../publish.service';
import type { Crux } from '../types';
import * as cruxes from '@/api/cruxes';

export class ApiPublishService implements IPublishService {
  async publish(cruxId: string, files: PublishFile[]): Promise<Crux> {
    return cruxes.publish(cruxId, files);
  }

  async unpublish(cruxId: string): Promise<Crux> {
    return cruxes.unpublish(cruxId);
  }
}
