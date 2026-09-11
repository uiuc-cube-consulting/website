// Executive board roster. Update each semester.

export type ExecMember = {
  name: string;
  role: string;
  /** One line on what this role owns. Keep it to a single sentence. */
  responsibilities: string;
  /** Path under /public; will fall back to initials if file is missing. */
  photo?: string;
};

export const EXEC_BOARD: ExecMember[] = [
  {
    name: "Sujan Sriram",
    role: "External President",
    responsibilities:
      "Owns the client pipeline and represents CUBE to partners and campus.",
    photo: "/exec/sujan.JPG",
  },
  {
    name: "Isabella Watson",
    role: "Internal President",
    responsibilities:
      "Runs the semester roadmap, weekly all-hands, and member experience.",
    photo: "/exec/isabella.JPG",
  },
  {
    name: "Mann Talati",
    role: "Chief Technology Officer",
    responsibilities:
      "Builds and maintains the public site, member portal, and internal tooling.",
    photo: "/exec/mann.jpg",
  },
  {
    name: "Pranav Kathiresan",
    role: "Quality Assurance",
    responsibilities:
      "Reviews every client deliverable and signs off before it ships.",
    photo: "/exec/pranav.JPG",
  },
  {
    name: "Jonah Tran",
    role: "HR Director",
    responsibilities:
      "Runs recruitment, onboarding, and member development.",
    photo: "/exec/jonah.png",
  },
  {
    name: "Daniel Zhang",
    role: "Chief of Financial Operations",
    responsibilities:
      "Owns the semester budget, sponsorships, and spend approvals.",
    photo: "/exec/daniel.png",
  },
  {
    name: "Andrea Turek",
    role: "Creative Director",
    responsibilities:
      "Directs brand, social, and the visual language across everything we publish.",
    photo: "/exec/andrea.png",
  },
  {
    name: "Neha Nallamala",
    role: "Alumni Relations",
    responsibilities:
      "Keeps the alumni network active and connects members to grads in industry.",
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
