import type { IPublishService } from '../publish.service';
import type { Crux } from '../types';
import * as cruxes from '@/api/cruxes';

export class ApiPublishService implements IPublishService {
  async publish(cruxId: string): Promise<Crux> {
    return cruxes.publish(cruxId);
  }

  async unpublish(cruxId: string): Promise<Crux> {
    return cruxes.unpublish(cruxId);
  }
}
