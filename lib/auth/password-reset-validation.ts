export type PasswordValidation = { message: string; canSubmit: boolean };

export function getPasswordValidation(password: string, confirmation: string): PasswordValidation {
  if (password.length < 8) return { message: "Password must be at least 8 characters.", canSubmit: false };
  if (password !== confirmation) return { message: "Passwords do not match.", canSubmit: false };
  return { message: "", canSubmit: true };
}
