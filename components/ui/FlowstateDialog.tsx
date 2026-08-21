"use client";

import { useEffect, useRef } from "react";

type FlowstateDialogProps = {
  kind: "input" | "confirm";
  title: string;
  message?: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onChange?: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function FlowstateDialog({ kind, title, message, value = "", placeholder, confirmLabel = "Continue", destructive = false, onChange, onCancel, onConfirm }: FlowstateDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key === "Enter" && kind === "input") onConfirm();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [kind, onCancel, onConfirm]);

  return (
    <div className="flowstate-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section className="flowstate-dialog" role="dialog" aria-modal="true" aria-labelledby="flowstate-dialog-title">
        <div className="flowstate-dialog-mark" aria-hidden="true">FS</div>
        <h2 id="flowstate-dialog-title" className="flowstate-dialog-title">{title}</h2>
        {message && <p className="flowstate-dialog-message">{message}</p>}
        {kind === "input" && <input ref={inputRef} value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} className="flowstate-dialog-input" />}
        <div className="flowstate-dialog-actions">
          <button type="button" className="flowstate-dialog-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className={`flowstate-dialog-confirm${destructive ? " is-destructive" : ""}`} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
