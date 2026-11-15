import { ImageResponse } from "next/og";
import { Card, OG_SIZE } from "@/lib/og";

export const alt = "Splitwise clone: split costs with friends";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <Card kicker="Free, no money moves through it" title="Split costs with friends" lines={["Start with just your name: no sign-up", "Invite friends with a link, or try the demo"]} />,
    size,
  );
}
