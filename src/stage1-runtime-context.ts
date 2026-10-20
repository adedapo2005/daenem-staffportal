import { createContext } from 'react';

export type Stage1NavigationRole = 'Owner' | 'Manager' | 'Employee';

/**
 * Presentation-only values from the authenticated runtime.
 * Authorization always remains with the existing Portal and Worker gates.
 */
export const Stage1RuntimeContext = createContext<{
  enabled: boolean;
  companyRole?: Stage1NavigationRole;
}>({ enabled: true });
