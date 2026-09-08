export type EditorSyncState = { dirty: boolean; composing: boolean };

/** External data may update the DOM only before local editing or IME input starts. */
export function canReconcileEditor(state: EditorSyncState): boolean {
  return !state.dirty && !state.composing;
}
