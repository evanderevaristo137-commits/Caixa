import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../../app/context';
import { inssStatus, type InssStatus } from '../../domain/inss';
import type { InssContribution, InssPlan } from '../../domain/types';

export interface InssData {
  /** None = the owner does not follow the INSS in the app. */
  plan?: InssPlan;
  /** Most recent month first, voided ones included. */
  contributions: InssContribution[];
  /** Money set aside and not yet used. */
  savedCents: number;
  status?: InssStatus;
  now: Date;
}

/** The owner's INSS plan, payments and money set aside, kept up to date (a handful of records). */
export function useInss(): InssData | undefined {
  const { store } = useApp();
  return useLiveQuery(async (): Promise<InssData> => {
    const [settings, contributions, savedCents] = await Promise.all([store.settings.get(), store.inss.list(), store.inss.saved()]);
    const now = new Date();
    const plan = settings.inss;
    return { plan, contributions, savedCents, status: plan ? inssStatus(plan, contributions, now) : undefined, now };
  }, [store]);
}
