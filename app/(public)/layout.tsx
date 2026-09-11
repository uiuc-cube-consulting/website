import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // `.site` scopes public-only palette rules (see globals.css). The member
    // portal sits outside it and keeps its existing look.
    <div className="site contents">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
