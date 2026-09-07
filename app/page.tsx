import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/hero";

export default function Home() {
  return (
    <>
      <main className="flex-1">
        <Hero />
      </main>
      <SiteFooter />
    </>
  );
}
