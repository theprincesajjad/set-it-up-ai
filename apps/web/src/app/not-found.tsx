import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PassFooter } from "@/components/site/PassFooter";

export default function NotFound() {
  return (
    <>
      <main id="main" className="mx-auto max-w-[480px] px-4 py-16">
        <EmptyState icon={MapPin} title="We couldn't find that page." description="The link may be old, or the shop may have moved." action={<Button href="/map">Find shops near you</Button>} secondaryAction={<Button variant="ghost" href="/">Home</Button>} />
      </main>
      <PassFooter />
    </>
  );
}
