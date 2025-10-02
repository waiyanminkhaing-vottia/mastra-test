// Map of tool IDs to tool instances
import { generateCustomerId } from './generateCustomerId';
import { generateReservationId } from './generateReservationId';
import { getCurrentTime } from './getCurrentTime';

export { generateCustomerId } from './generateCustomerId';
export { generateReservationId } from './generateReservationId';
export { getCurrentTime } from './getCurrentTime';

export const toolsMap = {
  generateCustomerId,
  generateReservationId,
  getCurrentTime,
};
