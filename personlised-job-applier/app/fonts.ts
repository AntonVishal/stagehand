import localFont from "next/font/local";

export const fontPlain = localFont({
  src: [
    { path: "../public/fonts/plain-light.woff2", weight: "300" },
    { path: "../public/fonts/plain-regular.woff2", weight: "400" },
    { path: "../public/fonts/plain-medium.woff2", weight: "500" },
  ],
  display: "swap",
  variable: "--font-plain",
});

export const fontGTPlanar = localFont({
  src: [
    { path: "../public/fonts/gt-planar-light.woff2", weight: "300" },
    { path: "../public/fonts/gt-planar-regular.woff2", weight: "400" },
    { path: "../public/fonts/gt-planar-medium.woff2", weight: "500" },
  ],
  display: "swap",
  variable: "--font-gt-planar",
});

export const fontGTStandardMono = localFont({
  src: [
    { path: "../public/fonts/gt-standard-mono-regular.woff2", weight: "400" },
    { path: "../public/fonts/gt-standard-mono-medium.woff2", weight: "500" },
    {
      path: "../public/fonts/gt-standard-mono-medium-oblique.woff2",
      weight: "500",
      style: "oblique",
    },
  ],
  display: "swap",
  variable: "--font-gt-standard-mono",
});
