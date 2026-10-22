import { JoinPage, joinMetadata, type JoinPageProps } from "@/components/pass/JoinPage";

export const dynamic = "force-dynamic";

export const generateMetadata = (p: JoinPageProps) => joinMetadata(p);

export default function Page(props: JoinPageProps) {
  return <JoinPage {...props} />;
}
