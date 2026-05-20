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
    photo: "/exec/sujan.JPG"
  },
  {
    name: "Isabella Watson",
    role: "Internal President",
    quote: "",
    photo: "/exec/isabella.JPG",
  },
  {
    name: "Mann Talati",
    role: "Chief Technology Officer",
    quote: "",
    photo: "/exec/mann.jpg"
  },
  {
    name: "Pranav Kathiresan",
    role: "Quality Assurance",
    quote: "",
    photo: "/exec/pranav.JPG",
  },
  {
    name: "Jonah Tran",
    role: "HR Director",
    quote: "",
    photo: "/exec/jonah.png"
  },
  {
    name: "Daniel Zhang",
    role: "Chief of Financial Operations",
    quote: "",
    photo: "/exec/daniel.png"
  },
  {
    name: "Andrea Turek",
    role: "Creative Director",
    quote: "",
    photo: "/exec/andrea.png"
  },
  {
    name: "Neha Nallamala",
    role: "Alumni Relations",
    quote: "",
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
