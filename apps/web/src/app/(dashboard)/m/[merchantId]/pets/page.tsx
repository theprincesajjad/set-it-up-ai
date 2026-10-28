"use client";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { VACCINE_KINDS, groomState, type petApi } from "@ll/shared";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { Dot, Empty, PageHeader, SidePanel, SkeletonRows, Table, TableWrap, Td, Th, Tr } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { MemberPicker, type PickedMember } from "@/components/dashboard/pets/MemberPicker";
import { Async } from "@/components/dashboard/PageStates";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { todayOf } from "@/lib/dashboard/calendar";
import { shortDate, worstTag } from "@/lib/dashboard/pets";
import { useAction, useApi } from "@/lib/dashboard/useApi";

export default function PetsPage() {
  return (
    <FeatureGate keys={["pets.profiles"]} title="Pets">
      <Pets />
    </FeatureGate>
  );
}

const SPECIES = [{ value: "dog", label: "Dog" }, { value: "cat", label: "Cat" }, { value: "other", label: "Other" }];
const SIZES = [{ value: "small", label: "Small (under 10 kg)" }, { value: "medium", label: "Medium" }, { value: "large", label: "Large" }, { value: "giant", label: "Giant" }];
const COATS = [{ value: "short", label: "Short" }, { value: "double", label: "Double coat" }, { value: "curly", label: "Curly" }, { value: "long_silky", label: "Long and silky" }, { value: "wire", label: "Wire" }, { value: "hairless", label: "Hairless" }];

/** Pets (docs/research/pet-care.md): the pets of this shop's customers, with the one thing the counter checks, the shots. */
function Pets() {
  const { api, base } = useMerchant();
  const [q, setQ] = useState("");
  const [add, setAdd] = useState(false);
  const state = useApi(() => api.pets.list({ q: q.trim() || undefined }), [api, q]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader flush title="Pets" description="Your customers' pets: breed, coat, shots and groom schedule. Vaccine proof is a date and a photo of the certificate, nothing else." actions={<Button size="sm" iconStart={Plus} onClick={() => setAdd(true)}>Add a pet</Button>} />
      <div className="max-w-sm">
        <TextField label="Search pets" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Pet, owner or breed" autoComplete="off" />
      </div>
      <Async state={state} skeleton={<SkeletonRows rows={5} />}>
        {(r) =>
          r.items.length === 0 ? (
            <Empty action={<Button size="sm" onClick={() => setAdd(true)}>Add a pet</Button>}>{q ? "No pet matches that." : "No pets yet. Add a customer's pet, or ask them to add it from their card."}</Empty>
          ) : (
            <TableWrap>
              <Table label="Pets">
                <thead>
                  <tr>
                    <Th>Pet</Th>
                    <Th>Owner</Th>
                    <Th>Shots</Th>
                    <Th>Next groom</Th>
                  </tr>
                </thead>
                <tbody>
                  {r.items.map((p) => {
                    const tag = worstTag(p.worst);
                    return (
                      <Tr key={p.id}>
                        <Td>
                          <Link href={`${base}/pets/${p.id}`} className="font-medium text-fg hover:underline">{p.name}</Link>
                          <span className="ms-2 text-meta text-fg-muted">{[p.species === "dog" ? null : p.species, p.breed].filter(Boolean).join(", ")}</span>
                        </Td>
                        <Td className="text-fg-muted">{p.ownerName ?? "No name"}</Td>
                        <Td><Dot tone={tag.tone}>{tag.label}</Dot></Td>
                        <Td className="text-fg-muted">{p.nextDueOn ? <span className="inline-flex items-center gap-2">{shortDate(p.nextDueOn)}{groomState(p.nextDueOn, todayOf()).state === "late" ? <Dot tone="negative">Late</Dot> : groomState(p.nextDueOn, todayOf()).state === "due" ? <Dot tone="accent">Due</Dot> : null}</span> : "Not groomed here yet"}</Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          )
        }
      </Async>
      <AddPet open={add} onClose={() => setAdd(false)} onAdded={() => void state.reload()} />
    </div>
  );
}

function AddPet({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { api } = useMerchant();
  const toast = useToast();
  const act = useAction();
  const [owner, setOwner] = useState<PickedMember | null>(null);
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("dog");
  const [breed, setBreed] = useState("");
  const [size, setSize] = useState("medium");
  const [coat, setCoat] = useState("short");
  const [tried, setTried] = useState(false);
  void VACCINE_KINDS;
  return (
    <SidePanel
      open={open}
      onClose={onClose}
      label="Add a pet"
      title="Add a pet"
      subtitle="A pet belongs to its owner and follows them to other shops."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={act.busy}
            onClick={async () => {
              setTried(true);
              if (!owner || !name.trim()) return;
              const r = await act.run(() => api.pets.create({ memberId: owner.memberId, name: name.trim(), species: species as petApi.PetBody["species"], breed: breed.trim() || null, sizeBand: size as petApi.PetBody["sizeBand"], coat: coat as petApi.PetBody["coat"] }));
              if (r) {
                toast({ message: `${r.name} added`, tone: "success" });
                setName("");
                setBreed("");
                setOwner(null);
                setTried(false);
                onAdded();
                onClose();
              }
            }}
          >
            Add pet
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {act.error ? <Banner tone="danger">{act.error}</Banner> : null}
        <MemberPicker label="Owner" value={owner} onPick={setOwner} />
        {tried && !owner ? <p className="text-meta text-negative">Pick the owner first.</p> : null}
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={tried && !name.trim() ? "Add a name" : undefined} autoComplete="off" />
        <Select label="Kind" value={species} onChange={(e) => setSpecies(e.target.value)} options={SPECIES} />
        <TextField label="Breed" value={breed} onChange={(e) => setBreed(e.target.value)} autoComplete="off" optionalLabel />
        <Select label="Size" value={size} onChange={(e) => setSize(e.target.value)} options={SIZES} />
        <Select label="Coat" value={coat} onChange={(e) => setCoat(e.target.value)} options={COATS} />
      </div>
    </SidePanel>
  );
}
