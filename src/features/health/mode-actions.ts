"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MODE_COOKIE, MODE_COOKIE_OPTIONS } from "./mode";

export async function switchToHealth(): Promise<void> {
  (await cookies()).set(MODE_COOKIE, "health", MODE_COOKIE_OPTIONS);
  redirect("/health");
}

export async function switchToHub(): Promise<void> {
  (await cookies()).set(MODE_COOKIE, "hub", MODE_COOKIE_OPTIONS);
  redirect("/");
}
