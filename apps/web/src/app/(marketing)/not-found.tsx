import { NotFoundCard } from "@/components/errors/NotFoundCard";

/** A marketing URL that is not here (/contact, /about, an old link): the marketing header and footer stay around the 404. */
export default function MarketingNotFound() {
  return (
    <div className="mx-auto max-w-[520px] px-4 py-12 md:py-20">
      <NotFoundCard />
    </div>
  );
}
