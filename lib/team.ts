// Executive board roster. Update each semester.

export type ExecMember = {
  name: string;
  role: string;
  quote: string;
  /** Path under /public; will fall back to initials if file is missing. */
  photo?: string;
};

export const EXEC_BOARD: ExecMember[] = [
  {
    name: "Sujan Sriram",
    role: "External President",
    quote: "",
  },
  {
    name: "Isabella Watson",
    role: "Internal President",
    quote: "",
  },
  {
    name: "Mann Talati",
    role: "Chief Technology Officer",
    quote: "",
  },
  {
    name: "Pranav Kathiresan",
    role: "Quality Assurance",
    quote: "",
  },
  {
    name: "Jonah Tran",
    role: "HR Director",
    quote: "",
  },
  {
    name: "Daniel Zhang",
    role: "Chief of Financial Operations",
    quote: "",
  },
  {
    name: "Andrea Turek",
    role: "Creative Director",
    quote: "",
  },
  {
    name: "Neha Nallamala",
    role: "Alumni Relations",
    quote: "",
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
