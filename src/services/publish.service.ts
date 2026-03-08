import type { Crux } from './types';

export interface IPublishService {
  publish(cruxId: string): Promise<Crux>;
  unpublish(cruxId: string): Promise<Crux>;
}
