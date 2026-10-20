import Image from "next/image";

export function BrandLogo({
  className,
  alt = "AI Teacher",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <Image
      src="/brand/ai-teacher-logo.png"
      alt={alt}
      width={921}
      height={580}
      className={className}
    />
  );
}
