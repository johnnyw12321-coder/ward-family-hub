import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={<LoginForm next="/" linkError={false} />}>
      <LoginWithParams searchParams={searchParams} />
    </Suspense>
  );
}

async function LoginWithParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return <LoginForm next={next} linkError={params.error === "link"} />;
}
