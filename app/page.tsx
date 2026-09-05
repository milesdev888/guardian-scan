import { redirect } from "next/navigation";
import { ScanForm } from "@/components/scanner/scan-form";

function readParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const address = readParam(params.address)?.trim();
  if (address) {
    const chain = readParam(params.chain);
    const suffix = chain
      ? `&chain=${encodeURIComponent(chain)}`
      : "";
    redirect(`/app?address=${encodeURIComponent(address)}${suffix}`);
  }
  return (
    <div className="px-4 py-10 sm:py-16">
      <ScanForm address="" result={null} />
    </div>
  );
}
