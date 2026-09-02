import { InputType } from "@/app/generated/prisma/client";

export const safeAgentIdentifier = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const inputTypes = new Set(Object.values(InputType));
export function validAgentInputRules(rules: unknown) { return Array.isArray(rules) && rules.every((rule) => rule && typeof rule === "object" && inputTypes.has((rule as { inputType?: string }).inputType as InputType) && typeof (rule as { domainIdentifier?: string }).domainIdentifier === "string" && safeAgentIdentifier.test((rule as { domainIdentifier: string }).domainIdentifier)); }
