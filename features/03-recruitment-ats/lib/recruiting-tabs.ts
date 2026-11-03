// The tabs of /portal/recruiting. Lives outside components/RecruitingTabs.tsx
// because that is a "use client" module: the server page validates ?tab= against
// this list, and a value imported across that boundary arrives as a client
// reference, not the array.

export type RecruitingTab = "review" | "decide" | "interviews" | "demographics" | "visibility";

export const RECRUITING_TABS: readonly RecruitingTab[] = [
  "review",
  "decide",
  "interviews",
  "demographics",
  "visibility",
];

export function parseRecruitingTab(value: string | undefined): RecruitingTab | undefined {
  return RECRUITING_TABS.find((t) => t === value);
}
