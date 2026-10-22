"use client";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/EmptyState";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto max-w-[480px] px-4 py-16">
      <ErrorState title="Something went wrong on our end" description="Try again in a moment." action={<Button variant="secondary" onClick={reset}>Try again</Button>} />
    </main>
  );
}
