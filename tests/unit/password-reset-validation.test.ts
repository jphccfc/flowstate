import { describe, expect, it } from "vitest";
import { getPasswordValidation } from "../../lib/auth/password-reset-validation";

describe("getPasswordValidation", () => {
  it("rejects a mismatched confirmation", () => {
    expect(getPasswordValidation("CorrectHorse", "WrongHorse")).toEqual({ message: "Passwords do not match.", canSubmit: false });
  });
  it("clears the mismatch after the confirmation is corrected", () => {
    expect(getPasswordValidation("CorrectHorse", "CorrectHorse")).toEqual({ message: "", canSubmit: true });
  });
  it("rejects passwords shorter than eight characters", () => {
    expect(getPasswordValidation("short", "short")).toEqual({ message: "Password must be at least 8 characters.", canSubmit: false });
  });
  it("rejects an empty confirmation", () => {
    expect(getPasswordValidation("CorrectHorse", "")).toEqual({ message: "Passwords do not match.", canSubmit: false });
  });
});
