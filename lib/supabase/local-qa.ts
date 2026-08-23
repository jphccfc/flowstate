export type LocalQaUser = { id: string; email: string };

export function isLocalQaAuthEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" && env.FLOWSTATE_LOCAL_QA_AUTH === "1";
}

export function getLocalQaUser(): LocalQaUser {
  return { id: "local-qa-user", email: "qa@flowstate.local" };
}
