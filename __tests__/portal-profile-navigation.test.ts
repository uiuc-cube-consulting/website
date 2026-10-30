import { isValidElement, type ReactElement, type ReactNode } from "react";
import PortalLayout from "@/app/portal/layout";
import { auth, signOut } from "@/auth";
import { PortalMobileNav } from "@/components/PortalMobileNav";

jest.mock("@/auth", () => ({ auth: jest.fn(), signOut: jest.fn() }));
jest.mock("@/features/03-recruitment-ats/lib/visibility", () => ({
  canViewRecruiting: jest.fn().mockResolvedValue(false),
}));
jest.mock("@/components/PortalMobileNav", () => ({ PortalMobileNav: jest.fn() }));
jest.mock("@/features/06-portal-feedback/components/FeedbackWidget", () => ({
  FeedbackWidget: jest.fn(),
}));

type Props = {
  children?: ReactNode;
  href?: string;
  "aria-label"?: string;
  links?: { href: string; label: string }[];
  action?: () => Promise<void>;
};

function elements(node: ReactNode): ReactElement<Props>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Props>(node)) return [];
  return [node, ...elements(node.props.children)];
}

async function render() {
  return elements(await PortalLayout({ children: "Portal content" }));
}

beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue({
    user: { email: "alex@example.com", name: "Alex Example", role: "member" },
  });
});

test("the displayed name is the single profile entry point", async () => {
  const nodes = await render();
  const profileLinks = nodes.filter((node) => node.props.href === "/portal/profile");
  expect(profileLinks).toHaveLength(1);
  expect(profileLinks[0].props.children).toBe("Alex Example");
  expect(profileLinks[0].props["aria-label"]).toBe("Open profile for Alex Example");
});

test("neither desktop nor mobile navigation has a separate profile tab", async () => {
  const nodes = await render();
  const desktop = nodes.find((node) => node.type === "nav");
  expect(elements(desktop).some((node) => node.props.href === "/portal/profile")).toBe(false);
  const mobile = nodes.find((node) => node.type === PortalMobileNav);
  expect(mobile?.props.links?.some((link) => link.href === "/portal/profile")).toBe(false);
  expect(mobile?.props.links).toContainEqual({ href: "/portal/projects", label: "Projects" });
});

test("an account without a name can open its profile through its email", async () => {
  (auth as jest.Mock).mockResolvedValue({
    user: { email: "alex@example.com", name: null, role: "member" },
  });
  const profile = (await render()).find((node) => node.props.href === "/portal/profile");
  expect(profile?.props.children).toBe("alex@example.com");
  expect(profile?.props["aria-label"]).toBe("Open profile for alex@example.com");
});

test("signed-out visitors keep Sign in and have no profile link", async () => {
  (auth as jest.Mock).mockResolvedValue(null);
  const nodes = await render();
  expect(nodes.some((node) => node.props.href === "/portal/profile")).toBe(false);
  expect(nodes.some((node) => node.props.href === "/portal/sign-in")).toBe(true);
});

test("profile navigation does not replace the separate sign-out action", async () => {
  const nodes = await render();
  const form = nodes.find((node) => node.type === "form");
  expect(elements(form).some((node) => node.type === "button" && node.props.children === "Sign out")).toBe(true);
  await form?.props.action?.();
  expect(signOut).toHaveBeenCalledWith({ redirectTo: "/" });
});
