import Image, { type ImageProps } from "next/image";
import { isOptimizableImage } from "@/lib/imageHosts";

/**
 * next/image for URLs we don't control (AniList, TMDB, MAL, AniLiberty, backend
 * uploads, data:/blob: previews). Known CDNs go through the optimizer; any other
 * source is rendered `unoptimized`, because next/image throws on hosts missing
 * from images.remotePatterns.
 */
export default function RemoteImage({
  src,
  unoptimized,
  alt,
  ...rest
}: Omit<ImageProps, "src"> & { src: string }) {
  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      unoptimized={unoptimized || !isOptimizableImage(src)}
    />
  );
}
