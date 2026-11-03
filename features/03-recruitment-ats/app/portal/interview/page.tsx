import { redirect } from "next/navigation";

// The interview console is a tab of /portal/recruiting now (see
// components/RecruitingTabs.tsx). This route stays so old bookmarks and links
// land on that tab rather than a 404.
export default function InterviewPage() {
  redirect("/portal/recruiting?tab=interviews");
}
