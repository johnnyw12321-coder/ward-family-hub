/** Body measurements: form field, stored key, label and how to measure. Shared by server and client code. */
export const MEASUREMENT_FIELDS = [
  { input: "waist", key: "waistCm", label: "Waist", hint: "At your navel" },
  { input: "chest", key: "chestCm", label: "Chest", hint: "Fullest part" },
  { input: "hips", key: "hipsCm", label: "Hips", hint: "Widest part" },
  { input: "arm", key: "armCm", label: "Arm", hint: "Relaxed, mid-bicep" },
  { input: "thigh", key: "thighCm", label: "Thigh", hint: "Widest part" },
] as const;
