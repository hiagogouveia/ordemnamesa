import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/seo";

export const runtime = "edge";
export const alt = siteConfig.name;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #101d22 0%, #1a2c32 100%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            background: "#13b6ec",
          }}
        />

        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${siteConfig.url}/logo-ordem-na-mes.png`}
          width={100}
          height={100}
          style={{ objectFit: "contain", marginBottom: "28px" }}
          alt=""
        />

        <h1
          style={{
            fontSize: "68px",
            fontWeight: 900,
            color: "#ffffff",
            margin: 0,
            letterSpacing: "-2px",
          }}
        >
          Ordem na Mesa
        </h1>

        <p
          style={{
            fontSize: "28px",
            color: "#93adc8",
            margin: "16px 0 0",
            maxWidth: "800px",
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          Checklists digitais para restaurantes de excelência
        </p>

        {/* Bottom branding */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#13b6ec",
            }}
          />
          <span
            style={{ color: "#13b6ec", fontSize: "18px", fontWeight: 600 }}
          >
            ordennaMesa.com.br
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
