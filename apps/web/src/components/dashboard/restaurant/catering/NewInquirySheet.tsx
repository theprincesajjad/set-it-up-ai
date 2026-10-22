"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { restaurantApi } from "@ll/shared";
import { SidePanel as Sheet } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useAction } from "@/lib/dashboard/useApi";
import { FormGrid, NumberField, addDaysISO, todayISO } from "../common";
import { EVENT_TYPE_OPTIONS, SERVICE_OPTIONS } from "./labels";

/** Staff-entered inquiry (a phone call or a walk-in): the same fields as the public form. */
export function NewInquirySheet({ onClose, onCreated }: { onClose: () => void; onCreated?: () => void }) {
  const { api, base } = useMerchant();
  const router = useRouter();
  const toast = useToast();
  const act = useAction();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<restaurantApi.CateringEventType>("walima");
  const [date, setDate] = useState(addDaysISO(todayISO(), 21));
  const [time, setTime] = useState("18:00");
  const [guests, setGuests] = useState("100");
  const [service, setService] = useState<restaurantApi.CateringService>("delivery");
  const [venue, setVenue] = useState("");
  const [address, setAddress] = useState("");
  const [diet, setDiet] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const e: Record<string, string> = {};
    if (name.trim().length < 2) e.name = "Add the customer's name";
    if (phone.replace(/\D/g, "").length < 7) e.phone = "Add a phone number so you can call them back";
    if (!date) e.date = "Pick the event date";
    if (!(Number(guests) >= 1)) e.guests = "How many guests?";
    setErrors(e);
    if (Object.keys(e).length) return;
    const ev = await act.run(() =>
      api.catering.create({
        name: name.trim(), phone: phone.trim(), email: email.trim() || null, eventType: type, eventDate: date, startTime: time || null,
        headcount: Number(guests), service, venueName: venue.trim() || null, venueAddress: address.trim() || null, dietaryNotes: diet.trim() || null, notes: notes.trim() || null,
      }),
    );
    if (ev) {
      toast({ message: `Inquiry #${ev.number} added`, tone: "success" });
      onCreated?.();
      router.push(`${base}/restaurant/catering/${ev.id}`);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      label="New catering inquiry"
      title="New inquiry"
      subtitle="From a phone call or someone at the counter."
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={act.busy} onClick={() => void submit()}>Add inquiry</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <FormGrid>
          <TextField label="Customer name" placeholder="Ayesha Khan" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <TextField label="Phone" type="tel" placeholder="(647) 555-0188" value={phone} onChange={(e) => setPhone(e.target.value)} error={errors.phone} />
        </FormGrid>
        <TextField label="Email" optionalLabel type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormGrid>
          <Select label="Kind of event" value={type} onChange={(e) => setType(e.target.value as restaurantApi.CateringEventType)} options={EVENT_TYPE_OPTIONS} />
          <Select label="How it's served" value={service} onChange={(e) => setService(e.target.value as restaurantApi.CateringService)} options={SERVICE_OPTIONS} />
        </FormGrid>
        <FormGrid cols={3}>
          <TextField label="Event date" type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} error={errors.date} />
          <TextField label="Start time" type="time" optionalLabel value={time} onChange={(e) => setTime(e.target.value)} />
          <NumberField label="Guests" value={guests} onChange={setGuests} error={errors.guests} />
        </FormGrid>
        <FormGrid>
          <TextField label="Venue" optionalLabel placeholder="Mississauga Banquet Centre" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <TextField label="Venue address" optionalLabel value={address} onChange={(e) => setAddress(e.target.value)} />
        </FormGrid>
        <TextField type="textarea" label="Dietary needs" optionalLabel placeholder="Zabihah only, 12 vegetarian guests, one nut allergy" className="min-h-20" value={diet} onChange={(e) => setDiet(e.target.value)} />
        <TextField type="textarea" label="Notes" optionalLabel placeholder="Wants biryani and nihari, two dessert tables" className="min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Sheet>
  );
}
