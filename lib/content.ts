// Single source of truth for marketing copy and structured data.
// Edit here; pages re-read at build time.

export const SITE = {
  name: "CUBE Consulting",
  longName: "Champaign-Urbana Business and Engineering Consulting",
  shortName: "CUBE",
  tagline: "Where Passion Meets Purpose.",
  email: "CUBEUIUC@gmail.com",
  instagram: "https://www.instagram.com/cubeconsulting_",
  linkedin: "https://www.linkedin.com/company/je-cube-consulting/",
  linktree: "https://linktr.ee/cubeconsulting",
  applyForm: "https://forms.gle/Jb4gFisrQe7AfK7e7",
  mailingListForm: "https://forms.gle/BWdrC9vJka7QwDeC8",
  copyrightYear: 2026,
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
      "Engineers, business majors, designers, and scientists working side-by-side. A real cross-disciplinary team.",
  },
] as const;

export const HOME_FEATURE_CARDS = [
  {
    title: "Services",
    blurb:
      "Engagements span strategy, engineering, and design. Fresh thinking applied to real client problems.",
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
      "Co-built technical solutions that ship. Web, hardware, AI pipelines, and infrastructure, all delivered in tight feedback loops with the client engineering team.",
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
      "Hands-on technical work across software, hardware, and infrastructure, built in tight loops with the client team.",
    points: ["Full-stack web development", "Cloud & SaaS solutions", "Hardware prototyping", "Data pipelines & AI"],
  },
  {
    title: "Design",
    blurb:
      "Brand systems, marketing collateral, and user-centric product design, built with modern tooling.",
    points: ["Web & mobile UI", "Brand & marketing assets", "CAD & industrial design", "Design systems"],
  },
] as const;

export type Testimonial = {
  quote: string;
  author: string;
  title?: string;
  company: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Lucky us! We at Inprentus enjoyed working with the University of Illinois Champaign-Urbana Business and Engineering (CUBE) Consulting Group on a spring project. The group offered great analyses to achieve further momentum in the AR market with our revolutionary blazed waveguides. Looking forward to a fall follow-on project!",
    author: "Cynthia Otteman",
    title: "Chief of Staff",
    company: "Inprentus",
  },
  {
    quote:
      "I really enjoyed working with the students from CUBE Consulting. Students have more fresh and innovative ideas that you could expect to find in the professional world.",
    author: "Daniel Krause",
    title: "Co-Owner",
    company: "Cracked",
  },
  {
    quote:
      "It was a pleasure working with CUBE Consulting. They care deeply about their clients' needs and strive to provide innovative solutions. They are very respectful of your time and showed the utmost professionalism. I recommend working with them if you're given the opportunity.",
    author: "Todd Thorstenson",
    title: "Owner",
    company: "Hammerhead Coffee",
  },
];

// Project team composite image (pre-rendered photo card with names + roles).
// Drop a new file under /public/projects/team-<slug>.png and reference here.
export type Project = {
  name: string;
  /** Path under /public to the client logo. */
  logo?: string;
  /** Path under /public to the team composite photo. */
  teamImage?: string;
  bullets: string[];
};

export const PROJECTS: Project[] = [
  {
    name: "AllPeople Marketplace",
    logo: "/clients/allpeople.webp",
    teamImage: "/projects/team-allpeople.png",
    bullets: [
      "Conducting primary market research and investor discovery to assess demand.",
      "Developing unit economics and financial models to evaluate margins, costs, and impact.",
    ],
  },
  {
    name: "AWS",
    logo: "/clients/aws.png",
    teamImage: "/projects/team-aws.png",
    bullets: [
      "Identifying high-impact opportunities for AI-driven efficiency and automation.",
      "Designing and testing light-weight AI-enabled solutions using the CRAFT framework.",
    ],
  },
  {
    name: "Panasonic",
    logo: "/clients/panasonic2.png",
    teamImage: "/projects/team-panasonic.png",
    bullets: [
      "Researching smart-manufacturing trends and adoption across the industry.",
      "Synthesizing insights on AI and automation within Panasonic's platform.",
    ],
  },
  {
    name: "Wrike",
    logo: "/clients/wrike2.png",
    teamImage: "/projects/team-wrike.png",
    bullets: [
      "Building a member intelligence system to centralize data and automate intake.",
      "Implementing automated engagement workflows fired from a unified data layer.",
    ],
  },
  {
    name: "Squint",
    logo: "/clients/squint2.png",
    teamImage: "/projects/team-squint.png",
    bullets: [
      "Prototyping Workshop Mode to support live in-session collaboration.",
      "Research, workflow design, and feature scoping for the workshop experience.",
    ],
  },
  {
    name: "Nucurrent",
    logo: "/clients/nucurrent2.png",
    teamImage: "/projects/team-nucurrent.png",
    bullets: [
      "Centralized inventory management with audit trails and consistent documentation.",
      "Automated reorder workflows triggered by inventory thresholds.",
    ],
  },
  {
    name: "GTMshift",
    logo: "/clients/gtmshift2.png",
    teamImage: "/projects/team-gtmshift.png",
    bullets: [
      "Diagnosing inefficiencies across go-to-market workflows.",
      "Designing targeted AI-driven solutions and piloting them with stakeholders.",
    ],
  },
  {
    name: "Optura",
    logo: "/clients/optura2.png",
    teamImage: "/projects/team-optura.png",
    bullets: [
      "Prototyping Optura's Workshop Mode to support collaboration and decision-making.",
      "Leading research, workflow design, and core feature development for a scalable end-to-end workshop experience.",
    ],
  },

];

// Brand directory used by LogoStrip / ClientCarousel / AlumniGrid.
// `logo` is optional — components fall back to a styled text chip when missing.
export type Brand = { name: string; logo?: string };

export const CLIENT_LOGOS: Brand[] = [
  { name: "Earnest Earth",    logo: "/clients/earnest-earth.jpeg" },
  { name: "Cache Energy",     logo: "/clients/cache-energy.jpeg" },
  { name: "Rapyuta Robotics", logo: "/clients/rapyuta-robotics.webp" },
  { name: "PC Buildee",       logo: "/clients/pc-buildee.png" },
  { name: "Panasonic",        logo: "/clients/panasonic.png" },
  { name: "AWS",              logo: "/clients/aws.png" },
  { name: "Inprentus",        logo: "/clients/inprentus.jpg" },
  { name: "Yummy Future",     logo: "/clients/yummy-future.png" },
  { name: "Nasadya",          logo: "/clients/nasadya.png" },
  { name: "AllPeople",        logo: "/clients/allpeople.webp" },
  { name: "Wrike",            logo: "/clients/wrike.png" },
  { name: "Squint",           logo: "/clients/squint.webp" },
  { name: "Nucurrent",        logo: "/clients/nucurrent.png" },
  { name: "GTMshift",         logo: "/clients/gtmshift.jpeg" },
  { name: "Optura",           logo: "/clients/optura.jpeg"},
];

export const PARTNER_LOGOS: Brand[] = [
  { name: "Junior Enterprise",  logo: "/partners/junior-enterprise.png" },
  { name: "Accenture",          logo: "/partners/accenture.png" },
  { name: "Texas Instruments",  logo: "/partners/ti.png" },
  { name: "Grainger Engineering", logo: "/partners/grainger-engineering.png"}
];

export const ALUMNI_PLACEMENTS: Brand[] = [
  { name: "Microsoft",       logo: "/alumni/microsoft.png" },
  { name: "Google",          logo: "/alumni/google.png" },
  { name: "Apple",           logo: "/alumni/apple.webp" },
  { name: "Amazon",          logo: "/alumni/amazon.png" },
  { name: "Meta",            logo: "/alumni/meta.png" },
  { name: "Adobe",           logo: "/alumni/adobe.png" },
  { name: "McKinsey",        logo: "/alumni/mckinsey.png" },
  { name: "BCG",             logo: "/alumni/bcg.png" },
  { name: "Bain & Co.",      logo: "/alumni/bain.png" },
  { name: "Deloitte",        logo: "/alumni/deloitte.png" },
  { name: "Capital One",     logo: "/alumni/capital-one.webp" },
  { name: "Bank of America", logo: "/alumni/bank-of-america.png" },
  { name: "Citi",            logo: "/alumni/citi.png" },
  { name: "BMO",             logo: "/alumni/bmo.png" },
  { name: "Synchrony",       logo: "/alumni/synchrony.png" },
  { name: "KPMG",            logo: "/alumni/kpmg.png" },
  { name: "Crowe",           logo: "/alumni/crowe.png" },
  { name: "Intuit",          logo: "/alumni/intuit.png" },
  { name: "Scale AI",        logo: "/alumni/scale.webp" },
  { name: "Rivian",          logo: "/alumni/rivian.png" },
  { name: "Caterpillar",     logo: "/alumni/caterpillar.png" },
  { name: "Boeing",          logo: "/alumni/boeing.png" },
  { name: "Tropicana",       logo: "/alumni/tropicana.webp" },
  { name: "UChicago",        logo: "/alumni/uchicago.webp" },
];

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
    a: "Twelve to fourteen weeks, one UIUC semester. Teams kick off in week one and present final deliverables in week thirteen or fourteen.",
  },
  {
    q: "Who is on a project team?",
    a: "One Project Manager, three to five Consultants, and an Executive Partner who reviews at key checkpoints. PMs run scope and client comms; consultants own workstreams; partners review the work.",
  },
  {
    q: "What makes CUBE different from other consulting clubs?",
    a: "Two things. First, real social belonging. Most of our consultants describe CUBE as where they made their closest friends at UIUC. Second, a project pipeline that punches well above its weight, with alumni placed at top firms across consulting, banking, tech, and product.",
  },
] as const;

// Member portal resources (Drive folders, templates, forms).
// Update these links to point at the real Drive folder / Doc URLs.
export const PORTAL_RESOURCES = [
  {
    title: "Slide Templates",
    description: "Branded slide deck templates for client deliverables.",
    href: "https://drive.google.com/drive/u/0/folders/1PZu8aAHQR6jsX7Aor6eOVlTL2G152xp1",
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
    href: "https://drive.google.com/drive/u/0/folders/1W2mPlLQ1CwIPFghbXzyO-s0dP9cf69Rr",
    icon: "file",
  },
  {
    title: "Brand Assets",
    description: "Logo files, color tokens, and approved photography.",
    href: "https://drive.google.com/drive/u/0/folders/1PZu8aAHQR6jsX7Aor6eOVlTL2G152xp1",
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
    href: "https://drive.google.com/drive/u/0/folders/1Cq1PIjUgjuJ6qkuxWPLGvumn4SiHyki2",
    icon: "users",
  },
] as const;
