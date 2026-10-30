import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MatchingPortal } from "@/features/08-member-matching/components/MatchingPortal";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.memberId) redirect("/portal/sign-in");
  return <MatchingPortal />;
}
