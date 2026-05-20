// Single source of truth for marketing copy and structured data.
// Edit here; pages re-read at build time.

export const SITE = {
  name: "CUBE Consulting",
  longName: "Champaign-Urbana Business and Engineering Consulting",
  shortName: "CUBE",
  tagline: "Where Passion Meets Purpose.",
  email: "CUBEUIUC@gmail.com",
  instagram: "https://www.instagram.com/cubeconsulting_",
  linkedin: "https://www.linkedin.com/company/cube-consulting",
  linktree: "https://linktr.ee/cubeconsulting",
  applyForm: "https://forms.gle/Jb4gFisrQe7AfK7e7",
  mailingListForm: "https://forms.gle/BWdrC9vJka7QwDeC8",
  copyrightYear: 2024,
} as const;

export const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/projects", label: "Projects" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/join-us", label: "Join Us" },
  { href: "/contact", label: "Contact" },
] as const;

export const STATS = [
  { label: "Active Members", value: 50, suffix: "" },
  { label: "Projects Completed", value: 180, suffix: "" },
  { label: "Cups of Coffee", value: 3760, suffix: "" },
] as const;

export const PILLARS = [
  {
    key: "growth",
    title: "Growth",
    blurb:
      "A tight-knit community where consultants mentor each other and grow into the next stage of their careers.",
  },
  {
    key: "impact",
    title: "Impact",
    blurb:
      "Projects that move the needle for real clients, with deliverables that ship and recommendations that get adopted.",
  },
  {
    key: "leadership",
    title: "Leadership",
    blurb:
      "Every consultant takes ownership of a workstream. Senior roles open up each semester as our team scales.",
  },
  {
    key: "diversity",
    title: "Diversity",
    blurb:
      "Engineers, business majors, designers, and scientists working side-by-side — a real cross-disciplinary team.",
  },
] as const;

export const HOME_FEATURE_CARDS = [
  {
    title: "Services",
    blurb:
      "Engagements span strategy, engineering, and design — fresh thinking applied to real client problems.",
    href: "/services",
  },
  {
    title: "Our Talent",
    blurb:
      "Personable, motivated UIUC undergraduates from across colleges and disciplines.",
    href: "/join-us",
  },
] as const;

export const SOLUTION_AREAS = [
  {
    key: "engineering",
    title: "Engineering",
    blurb:
      "Co-built technical solutions that ship. Web, hardware, AI pipelines, and infrastructure — we work in tight feedback loops with the client engineering team.",
  },
  {
    key: "business",
    title: "Business",
    blurb:
      "Market research, financial modeling, and strategy that turns into actionable client recommendations.",
  },
  {
    key: "design",
    title: "Design",
    blurb:
      "Brand systems, product UX, and marketing collateral built with modern tooling and user-centric thinking.",
  },
] as const;

export const SERVICE_CATEGORIES = [
  {
    title: "Business",
    blurb:
      "Market research, financial modeling, and strategy work that turns into actionable client recommendations.",
    points: ["Market & competitor research", "Financial modeling", "Go-to-market strategy", "Operations & process design"],
  },
  {
    title: "Engineering",
    blurb:
      "Hands-on technical work — software, hardware, and infrastructure — built in tight loops with the client team.",
    points: ["Full-stack web development", "Cloud & SaaS solutions", "Hardware prototyping", "Data pipelines & AI"],
  },
  {
    title: "Design",
    blurb:
      "Brand systems, marketing collateral, and user-centric product design — built with modern tooling.",
    points: ["Web & mobile UI", "Brand & marketing assets", "CAD & industrial design", "Design systems"],
  },
] as const;

export const TESTIMONIALS = [
  {
    quote:
      "The CUBE team brought fresh thinking and a level of execution that exceeded what we expected from a student org. They moved fast and the work they delivered slotted right into our roadmap.",
    author: "Client Partner",
    role: "Series-A Startup",
  },
  {
    quote:
      "Working with the CUBE consultants was a real pleasure. They cared deeply about our problem and showed up with the kind of professionalism you'd expect from a senior firm.",
    author: "Founder",
    role: "Energy Tech",
  },
  {
    quote:
      "Smart, organized, full of ideas. The engagement felt smoother than partnerships we've had with much larger consulting firms.",
    author: "Director of Engineering",
    role: "Fortune 500",
  },
] as const;

// Project team member.
// `photo` is an optional path under /public; if absent the avatar renders initials.
export type TeamMember = {
  name: string;
  year?: string; // Freshman / Sophomore / Junior / Senior
  role: "Project Manager" | "Senior Consultant" | "Executive Partner" | "Consultant";
  photo?: string;
};

export type Project = {
  name: string;
  /** Path under /public to the client logo (e.g. /clients/aws.svg). */
  logo?: string;
  bullets: string[];
  team?: TeamMember[];
};

export const PROJECTS: Project[] = [
  {
    name: "AllPeople Marketplace",
    bullets: [
      "Conducting primary market research and investor discovery to assess demand.",
      "Developing unit economics and financial models to evaluate margins, costs, and impact.",
    ],
    team: [
      { name: "Daniel Zhang", year: "Sophomore", role: "Project Manager" },
      { name: "Neha Nallamala", year: "Freshman", role: "Senior Consultant" },
      { name: "Megan Zeng", year: "Junior", role: "Executive Partner" },
    ],
  },
  {
    name: "AWS",
    bullets: [
      "Identifying high-impact opportunities for AI-driven efficiency and automation.",
      "Designing and testing light-weight AI-enabled solutions using the CRAFT framework.",
    ],
    team: [
      { name: "Mann Talati", year: "Sophomore", role: "Project Manager" },
      { name: "Andrea Turek", year: "Sophomore", role: "Senior Consultant" },
      { name: "Emily Park", year: "Junior", role: "Executive Partner" },
    ],
  },
  {
    name: "APM",
    bullets: [
      "Conducting market research and investor discovery alongside financial modeling.",
      "Evaluating unit margins, expenses, and runway across the business.",
    ],
  },
  {
    name: "Optura",
    bullets: [
      "Prototyping Workshop Mode to support live in-session collaboration.",
      "Research, workflow design, and feature scoping for the workshop experience.",
    ],
  },
  {
    name: "Panasonic",
    bullets: [
      "Researching smart-manufacturing trends and adoption across the industry.",
      "Synthesizing insights on AI and automation within Panasonic's platform.",
    ],
  },
  {
    name: "Member Intelligence",
    bullets: [
      "Centralizing member data and automating intake into a single system of record.",
      "Building engagement workflows that fire from the unified data layer.",
    ],
  },
  {
    name: "Inventory Platform",
    bullets: [
      "Centralized stock management with audit trails and consistent documentation.",
      "Automated reorder workflows triggered by inventory thresholds.",
    ],
  },
  {
    name: "Workflow AI",
    bullets: [
      "Diagnosing inefficiencies across team workflows.",
      "Designing targeted AI-driven solutions and piloting them with stakeholders.",
    ],
  },
];

export const CLIENT_LOGOS = [
  "Earnest Earth",
  "Cache Energy",
  "Rapyuta Robotics",
  "PC Buildee",
  "Panasonic",
  "Optura",
  "Inprentus",
  "Yummy Future",
  "Nasadya",
  "AWS",
  "AllPeople",
] as const;

export const PARTNER_LOGOS = [
  "Junior Enterprise",
  "Accenture",
  "Texas Instruments",
] as const;

export const ALUMNI_PLACEMENTS = [
  "Microsoft", "Google", "Apple", "Amazon", "Meta", "Adobe",
  "McKinsey", "BCG", "Bain & Co.", "Capital One", "Bank of America",
  "Citi", "BMO", "Synchrony", "KPMG", "Crowe",
  "Intuit", "Scale AI", "Rivian", "Caterpillar", "Boeing",
  "Tropicana", "Deloitte",
] as const;

export const FALL_RECRUITMENT = {
  semester: "Fall 2026",
  appsOpen: "09/04/26",
  timeline: [
    { date: "Sep 4", event: "First-round applications open" },
    { date: "Sep 8", event: "First-round applications due (11:59 PM)" },
    { date: "Sep 9", event: "Networking & Games Night (6:30–7:30 PM, Bevier 108/132/180)" },
    { date: "Sep 11", event: "Info Night and Interview Workshop" },
    { date: "Sep 15", event: "Invite-only Networking Night" },
    { date: "Sep 17", event: "Invite-only Case Training" },
    { date: "Sep 23", event: "Final decisions announced" },
  ],
} as const;

export const FAQS = [
  {
    q: "What kinds of projects does CUBE take on?",
    a: "Engagements range from go-to-market strategy and market research to full-stack engineering builds, AI pipelines, hardware prototyping, and design systems. Every semester we work with a mix of startups, mid-market firms, and Fortune 500 clients.",
  },
  {
    q: "How should I prepare for the case interview?",
    a: "We use Bain-style case frameworks. Read through one or two case prep books (Case in Point, Case Interview Secrets) and practice three or four cases out loud with a partner. We host an interview workshop during recruitment to walk you through our format.",
  },
  {
    q: "How long is a project?",
    a: "Twelve to fourteen weeks — one UIUC semester. Teams kick off in week one and present final deliverables in week thirteen or fourteen.",
  },
  {
    q: "Who is on a project team?",
    a: "One Project Manager, three to five Consultants, and an Executive Partner who reviews at key checkpoints. PMs run scope and client comms; consultants own workstreams; partners review the work.",
  },
  {
    q: "What makes CUBE different from other consulting clubs?",
    a: "Two things: real social belonging — most of our consultants describe CUBE as where they made their closest friends at UIUC — and a project pipeline that punches well above its weight, with alumni placed at top firms across consulting, banking, tech, and product.",
  },
] as const;

// Member portal resources (Drive folders, templates, forms).
// Update these links to point at the real Drive folder / Doc URLs.
export const PORTAL_RESOURCES = [
  {
    title: "Slide Templates",
    description: "Branded slide deck templates for client deliverables.",
    href: "https://drive.google.com",
    icon: "presentation",
  },
  {
    title: "Case Prep Library",
    description: "Curated case interview prep materials and worked examples.",
    href: "https://drive.google.com",
    icon: "book",
  },
  {
    title: "Project SOPs",
    description: "Standard operating procedures for kickoff, midpoint, and final delivery.",
    href: "https://drive.google.com",
    icon: "file",
  },
  {
    title: "Brand Assets",
    description: "Logo files, color tokens, and approved photography.",
    href: "https://drive.google.com",
    icon: "image",
  },
  {
    title: "Forms",
    description: "Reimbursement, project intake, and feedback forms.",
    href: "https://drive.google.com",
    icon: "clipboard",
  },
  {
    title: "Member Handbook",
    description: "Onboarding, policies, and expectations for consultants.",
    href: "https://drive.google.com",
    icon: "users",
  },
] as const;
