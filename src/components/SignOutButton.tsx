"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        await authClient.signOut();
        router.refresh();
      }}
    >
      {label}
    </button>
  );
}
