import type { Units } from "../types";

/**
 * Unit conversion. Everything is stored metric; these helpers convert for
 * display and parse what the person typed in their chosen units.
 */
export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const ML_PER_FL_OZ = 29.5735295625;

const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inches: number) => inches * CM_PER_IN;
export const mlToFlOz = (ml: number) => ml / ML_PER_FL_OZ;
export const flOzToMl = (oz: number) => oz * ML_PER_FL_OZ;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const total = Math.round(cmToIn(cm));
  return { feet: Math.floor(total / 12), inches: total % 12 };
}

export const feetInchesToCm = (feet: number, inches: number) => inToCm(feet * 12 + inches);

export const weightUnit = (units: Units) => (units === "imperial" ? "lb" : "kg");
export const lengthUnit = (units: Units) => (units === "imperial" ? "in" : "cm");
export const volumeUnit = (units: Units) => (units === "imperial" ? "fl oz" : "ml");

/** A weight in the person's units, as a number for inputs and charts (1 dp). */
export const displayWeight = (kg: number, units: Units) => round(units === "imperial" ? kgToLb(kg) : kg, 1);
export const displayLength = (cm: number, units: Units) => round(units === "imperial" ? cmToIn(cm) : cm, 1);

/** Parse a weight typed in the person's units back to kilograms (2 dp, as stored). */
export const toKg = (value: number, units: Units) => round(units === "imperial" ? lbToKg(value) : value, 2);
export const toCm = (value: number, units: Units) => round(units === "imperial" ? inToCm(value) : value, 1);
export const toMl = (value: number, units: Units) => Math.round(units === "imperial" ? flOzToMl(value) : value);

const fmt = (v: number, dp = 1) => v.toLocaleString("en-GB", { maximumFractionDigits: dp, minimumFractionDigits: 0 });

export function formatWeight(kg: number, units: Units, opts: { signed?: boolean } = {}): string {
  const v = displayWeight(kg, units);
  const sign = opts.signed && v > 0 ? "+" : "";
  return `${sign}${fmt(v)} ${weightUnit(units)}`;
}

export function formatLength(cm: number, units: Units, opts: { signed?: boolean } = {}): string {
  const v = displayLength(cm, units);
  const sign = opts.signed && v > 0 ? "+" : "";
  return `${sign}${fmt(v)} ${lengthUnit(units)}`;
}

export function formatHeight(cm: number, units: Units): string {
  if (units === "metric") return `${fmt(cm, 0)} cm`;
  const { feet, inches } = cmToFeetInches(cm);
  return `${feet}′${inches}″`;
}

export function formatVolume(ml: number, units: Units): string {
  if (units === "imperial") return `${fmt(mlToFlOz(ml), 0)} fl oz`;
  return ml >= 1000 ? `${fmt(ml / 1000, 2)} L` : `${fmt(ml, 0)} ml`;
}

/** Water buttons: a glass (250 ml / 8 fl oz) and a bottle (500 ml / 16 fl oz). */
export const waterServings = (units: Units) =>
  units === "imperial"
    ? [
        { label: "+8 fl oz", ml: Math.round(flOzToMl(8)) },
        { label: "+16 fl oz", ml: Math.round(flOzToMl(16)) },
      ]
    : [
        { label: "+250 ml", ml: 250 },
        { label: "+500 ml", ml: 500 },
      ];
