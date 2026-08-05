"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/auth/use-login";
import { useSignup } from "@/hooks/auth/use-signup";

// useSearchParams() opts the reading component out of static rendering
// unless it's wrapped in a Suspense boundary — this component exists only
// to isolate that read, so the rest of the page doesn't need to.
function useRedirectTarget(): string {
  const searchParams = useSearchParams();
  return searchParams.get("redirect") ?? "/dashboard";
}

function SignInForm() {
  const router = useRouter();
  const redirectTo = useRedirectTarget();

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const login = useLogin();
  const signup = useSignup();
  const activeMutation = mode === "sign-in" ? login : signup;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "sign-in") {
      await login.mutateAsync({ email, password });
    } else {
      await signup.mutateAsync({ email, password, name: name || email });
    }
    router.push(redirectTo);
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{mode === "sign-in" ? "Sign in to LedgerAI" : "Create your LedgerAI account"}</CardTitle>
        <CardDescription>
          {mode === "sign-in" ? "Welcome back — enter your details to continue." : "Set up your personal workspace in a few seconds."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            handleSubmit(e).catch(() => {
              // Errors surface via activeMutation.error below — this
              // catch only prevents an unhandled rejection, since
              // mutateAsync rethrows after updating mutation state.
            });
          }}
          className="flex flex-col gap-4"
        >
          {mode === "sign-up" && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {activeMutation.error && (
            <p className="text-sm text-destructive">{activeMutation.error.message}</p>
          )}
          <Button type="submit" disabled={activeMutation.isPending}>
            {activeMutation.isPending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          type="button"
          className="mt-4 text-sm text-muted-foreground underline underline-offset-4"
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </CardContent>
    </Card>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense fallback={<Card className="w-full max-w-sm animate-pulse" style={{ height: 360 }} />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
