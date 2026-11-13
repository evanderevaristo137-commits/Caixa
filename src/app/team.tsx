import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from './context';
import { DomainError, type PinCheck } from '../data/store';
import { can as canDo, OWNER, personId, type Permission, type Person } from '../domain/staff';
import type { StaffMember } from '../domain/types';
import { t } from '../i18n/pt-AO';
import { usePinGuard } from '../ui/pin';
import { WhoSheet } from './WhoSheet';
import { saveFailedText } from '../lib/save-error';

const KEY = (mode: string) => `caixa.person.${mode}`;

function readSaved(mode: string): string | null {
  try {
    return localStorage.getItem(KEY(mode));
  } catch {
    return null;
  }
}

function save(mode: string, id: string) {
  try {
    localStorage.setItem(KEY(mode), id);
  } catch {
    // Without storage the app simply asks who is using it next time.
  }
}

export interface Team {
  /** The shop has employees (off by default: then nothing changes for anyone). */
  on: boolean;
  /** Who is using the app (null: nobody chosen yet; the app asks). */
  person: Person | null;
  /** True without employees; with them, what the person may do (the Store checks it too). */
  can: (permission: Permission) => boolean;
  /** "Dono" or the employee's name, for what a person recorded (`by`). */
  nameOf: (by: string | undefined) => string | undefined;
  members: StaffMember[];
  signIn: (id: string, pin: string) => Promise<PinCheck>;
  /** Opens "Quem está a usar a app?". */
  choose: () => void;
}

const TeamCtx = createContext<Team | null>(null);

/**
 * Employees on the shop's phone, for the screens: who is using the app (kept on the phone, so closing
 * and opening the app does not ask again), what they may do and their names. Read again whenever the
 * employees change (added, retired, a backup restored, the demo renewed).
 */
export function TeamProvider({ children }: { children: ReactNode }) {
  const { store, mode } = useApp();
  const members = useLiveQuery(() => store.staff.all(), [store]);
  const [state, setState] = useState<{ store: typeof store; members: StaffMember[]; on: boolean; person: Person | null } | null>(null);
  const [choosing, setChoosing] = useState(false);

  useEffect(() => {
    if (!members) return;
    let cancelled = false;
    const current = store.staff.current();
    const id = readSaved(mode) ?? (current ? personId(current) : null);
    void store.staff.restore(id).then((person) => {
      if (cancelled) return;
      if (person) save(mode, personId(person));
      setState({ store, members, on: store.staff.isOn(), person });
    });
    return () => {
      cancelled = true;
    };
  }, [store, mode, members]);

  const signIn = useCallback(
    async (id: string, pin: string) => {
      const result = await store.staff.signIn(id, pin);
      if (result.ok) {
        save(mode, id);
        setState((s) => (s ? { ...s, person: store.staff.current() } : s));
        setChoosing(false);
      }
      return result;
    },
    [store, mode],
  );

  const team = useMemo<Team>(() => {
    // Until the employees are read (a moment at start), behave as a shop without employees.
    const fresh = state && state.store === store ? state : null;
    const on = fresh?.on ?? false;
    const person = fresh?.person ?? null;
    const list = fresh?.members ?? [];
    const names = new Map(list.map((m) => [m.id, m.name]));
    return {
      on,
      person,
      members: list,
      can: (permission) => !on || canDo(person, permission),
      nameOf: (by) => (by === OWNER ? t.team.owner : by ? names.get(by) : undefined),
      signIn,
      choose: () => setChoosing(true),
    };
  }, [state, store, signIn]);

  return (
    <TeamCtx.Provider value={team}>
      {children}
      {team.on && (choosing || !team.person) && <WhoSheet team={team} onClose={team.person ? () => setChoosing(false) : undefined} />}
    </TeamCtx.Provider>
  );
}

export function useTeam(): Team {
  const team = useContext(TeamCtx);
  if (!team) throw new Error('useTeam outside TeamProvider');
  return team;
}

/**
 * Runs an action the person may not do alone with the owner code typed on the spot (the owner
 * authorises it); otherwise straight away. The Store checks it again.
 */
export function useAllow() {
  const guard = usePinGuard();
  const team = useTeam();
  return useCallback(
    (permission: Permission, action: () => void | Promise<void>) => (team.can(permission) ? action() : guard(action)),
    [guard, team],
  );
}

/** The message for a refused employee code. */
export const signInError = (e: unknown, name: string) =>
  e instanceof DomainError && e.code === 'no_code' ? t.team.noCode(name) : saveFailedText(e);
