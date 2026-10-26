"use client";

import { useEffect } from "react";
import { evaluate, formatResult, isExpression } from "@/lib/calc";

/**
 * Lets any amount box take a sum: type "30*5" or "200+150" and it becomes
 * the result when you leave the box. Amount boxes are the inputs with
 * inputMode="decimal". The value is set the way typing would set it, so
 * forms (react-hook-form) see the result, and servers only ever get numbers.
 */
export function AmountSums() {
  useEffect(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    const onBlur = (e: FocusEvent) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.inputMode !== "decimal" || !isExpression(input.value)) return;
      const result = evaluate(input.value);
      if (result === null || result < 0 || !setter) return;
      setter.call(input, formatResult(result));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    document.addEventListener("focusout", onBlur, true);
    return () => document.removeEventListener("focusout", onBlur, true);
  }, []);
  return null;
}
