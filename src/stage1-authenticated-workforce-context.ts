import { createContext } from 'react';
import type { WorkforceContext } from './auth';

/** Only the real authenticated host supplies grants; protected V115 snapshot stays unchanged. */
export const Stage1AuthenticatedWorkforceContext = createContext<WorkforceContext | null>(null);
