// Executive board roster. Update each semester.

export type ExecMember = {
  name: string;
  role: string;
  /** Short description of what this role actually does on the board. */
  responsibilities: string;
  /** Path under /public; will fall back to initials if file is missing. */
  photo?: string;
};

export const EXEC_BOARD: ExecMember[] = [
  {
    name: "Sujan Sriram",
    role: "External President",
    responsibilities:
      "Owns CUBE's outward presence. Builds the client pipeline, fronts partner conversations, and represents the org on campus and at industry events.",
    photo: "/exec/sujan.JPG",
  },
  {
    name: "Isabella Watson",
    role: "Internal President",
    responsibilities:
      "Runs the org from the inside out. Sets the semester roadmap, leads weekly all-hands, and protects the culture and member experience.",
    photo: "/exec/isabella.JPG",
  },
  {
    name: "Mann Talati",
    role: "Chief Technology Officer",
    responsibilities:
      "Owns CUBE's technical surface. Maintains the public site, the member portal, and internal tooling that keeps the org running.",
    photo: "/exec/mann.jpg",
  },
  {
    name: "Pranav Kathiresan",
    role: "Quality Assurance",
    responsibilities:
      "Holds the bar on every deliverable. Reviews client work in flight, coaches PMs through midpoint and final, and signs off before anything ships.",
    photo: "/exec/pranav.JPG",
  },
  {
    name: "Jonah Tran",
    role: "HR Director",
    responsibilities:
      "Runs recruitment, onboarding, and development. Designs the application funnel, trains interviewers, and supports members through their CUBE career.",
    photo: "/exec/jonah.png",
  },
  {
    name: "Daniel Zhang",
    role: "Chief of Financial Operations",
    responsibilities:
      "Owns the org's finances. Plans the semester budget, manages sponsorship and treasury, and approves spend for events and project work.",
    photo: "/exec/daniel.png",
  },
  {
    name: "Andrea Turek",
    role: "Creative Director",
    responsibilities:
      "Owns CUBE's brand and visual voice. Directs social, marketing collateral, and the design language across everything the org publishes.",
    photo: "/exec/andrea.png",
  },
  {
    name: "Neha Nallamala",
    role: "Alumni Relations",
    responsibilities:
      "Keeps the alumni network alive. Curates networking events, builds the mentorship pipeline, and connects current members with grads in industry.",
    photo: "/exec/neha.JPG",
  },
];

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
