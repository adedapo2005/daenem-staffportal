import Portal from "../experience/Portal";
import ReviewViewports from "../review/viewports/page";
import ReviewCycleOne from "../review/cycle-1/page";

export default async function Page({ params }: { params: Promise<{ path?: string[] }> }) {
  const value = (await params).path?.join("/") || "";
  if (value === "review/viewports") return <ReviewViewports />;
  if (value === "review/cycle-1") return <ReviewCycleOne />;
  return <Portal />;
}
