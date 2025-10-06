import { generateCustomerId } from './generateCustomerId';
import { generateReservationId } from './generateReservationId';
import { getCurrentTime } from './getCurrentTime';

// ============================================================================
// Tool Exports
// ============================================================================

export { generateCustomerId } from './generateCustomerId';
export { generateReservationId } from './generateReservationId';
export { getCurrentTime } from './getCurrentTime';

// ============================================================================
// Tools Map - Registry of all available tools
// ============================================================================

export const toolsMap = {
  [generateCustomerId.id]: generateCustomerId,
  [generateReservationId.id]: generateReservationId,
  [getCurrentTime.id]: getCurrentTime,
};
